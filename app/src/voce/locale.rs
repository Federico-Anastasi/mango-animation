//! La dettatura locale: un motore che resta acceso col modello caricato (di base `python -m motore detta`, `docs/MOTORE.md`) e parla a
//! righe JSON. L'app gli manda l'audio del microfono e traduce i suoi eventi in quelli della pagina. Il processo parte alla prima
//! dettatura, resta acceso fra una dettatura e l'altra e muore con l'app (Job Object: i figli lo ereditano).

use super::audio::{livello, pcm16, prendi_tutto, SAMPLE_RATE};
use super::{Emetti, Errore, Lingua};
use crate::supervisor::{coda_del_log, uccidi_albero};
use base64::Engine;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Audio mandato al motore ogni 100 ms: 1600 campioni.
const PEZZO: usize = SAMPLE_RATE as usize / 10;
/// Quanto aspettare, dopo `fine`, che il motore chiuda l'ultima frase.
const CHIUSURA: Duration = Duration::from_secs(30);

/// Cambia il motore della dettatura: una riga di comando (`"C:\percorso con spazi\python.exe" -m altro detta`) che parla lo stesso protocollo.
pub const VARIABILE_COMANDO: &str = "MANGO_ANIMATION_DETTATURA";

/// Come si lancia il motore.
#[derive(Debug, Clone, PartialEq)]
pub struct Comando {
    pub exe: OsString,
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    pub ambiente: Vec<(OsString, OsString)>,
    /// Il motore di base: se `exe` non c'è, è Python che manca.
    pub di_base: bool,
}

/// La riga di comando divisa in parole; le virgolette doppie tengono insieme una parola con gli spazi.
pub fn dividi_comando(riga: &str) -> Result<Vec<String>, Errore> {
    let (mut parole, mut corrente, mut dentro, mut aperta) = (Vec::new(), String::new(), false, false);
    for c in riga.chars() {
        match c {
            '"' => {
                dentro = !dentro;
                aperta = true;
            }
            c if c.is_whitespace() && !dentro => {
                if aperta || !corrente.is_empty() {
                    parole.push(std::mem::take(&mut corrente));
                    aperta = false;
                }
            }
            c => corrente.push(c),
        }
    }
    if dentro {
        return Err(Errore::new(
            "comando_non_valido",
            format!("Il comando della dettatura ({VARIABILE_COMANDO}) ha una virgoletta aperta: {riga}"),
            format!("The dictation command ({VARIABILE_COMANDO}) has an open quotation mark: {riga}"),
        ));
    }
    if aperta || !corrente.is_empty() {
        parole.push(corrente);
    }
    Ok(parole)
}

/// La cartella con `motore/`, dove il motore di base si lancia: `MANGO_ANIMATION_RADICE`, o risalendo da `partenza`.
pub fn radice_del_codice(partenza: &Path, da_ambiente: Option<&str>) -> Option<PathBuf> {
    let e_radice = |c: &Path| c.join("motore").join("__main__.py").is_file();
    match da_ambiente.filter(|v| !v.is_empty()) {
        Some(indicata) => Some(PathBuf::from(indicata)).filter(|c| e_radice(c)),
        None => partenza.ancestors().flat_map(|c| [c.join("codice"), c.to_path_buf()]).find(|c| e_radice(c)),
    }
}

/// Il comando del motore dalle variabili d'ambiente (`ambiente`), da dove sta l'eseguibile (`partenza`) e dalla cartella dei dati (`lavoro`), da cui il motore legge stile e profilo.
pub fn comando_del_motore(ambiente: &dyn Fn(&str) -> Option<String>, partenza: &Path, lavoro: Option<&Path>) -> Result<Comando, Errore> {
    let python_e_utf8: Vec<(OsString, OsString)> = [("PYTHONUNBUFFERED", OsString::from("1")), ("PYTHONUTF8", OsString::from("1"))]
        .into_iter()
        .chain(lavoro.map(|l| ("MANGO_ANIMATION_LAVORO", l.as_os_str().to_owned())))
        .map(|(k, v)| (OsString::from(k), v))
        .collect();
    let radice = radice_del_codice(partenza, ambiente("MANGO_ANIMATION_RADICE").as_deref());
    if let Some(riga) = ambiente(VARIABILE_COMANDO).filter(|r| !r.trim().is_empty()) {
        let mut parole = dividi_comando(&riga)?.into_iter();
        let exe = parole.next().ok_or_else(|| Errore::new("comando_non_valido", format!("{VARIABILE_COMANDO} è vuota."), format!("{VARIABILE_COMANDO} is empty.")))?;
        let cwd = radice.unwrap_or_else(|| partenza.to_path_buf());
        return Ok(Comando { exe: exe.into(), args: parole.map(OsString::from).collect(), cwd, ambiente: python_e_utf8.to_vec(), di_base: false });
    }
    let cwd = radice.ok_or_else(|| {
        Errore::new(
            "motore_mancante",
            "Non trovo il motore della dettatura (la cartella motore/) risalendo dall'app. L'app va tenuta dentro la cartella di Mango Animation, oppure si indica con MANGO_ANIMATION_RADICE.",
            "Cannot find the dictation engine (the motore/ folder) above the app. The app must stay inside the Mango Animation folder, or the folder is given with MANGO_ANIMATION_RADICE.",
        )
    })?;
    let python = ambiente("MANGO_ANIMATION_PYTHON").filter(|p| !p.is_empty()).unwrap_or_else(|| "python".into());
    let modulo = ambiente("MANGO_ANIMATION_MODULO").filter(|m| !m.is_empty()).unwrap_or_else(|| "motore".into());
    Ok(Comando { exe: python.into(), args: vec!["-m".into(), modulo.into(), "detta".into()], cwd, ambiente: python_e_utf8.to_vec(), di_base: true })
}

/// Ciò che il motore manda a chi ascolta.
#[derive(Debug)]
enum Arrivo {
    Pronto,
    Evento(Value),
    Caduto,
}

#[derive(Default)]
struct Dentro {
    pronto: bool,
    caduto: bool,
    ascoltatore: Option<Sender<Arrivo>>,
}

/// Chi ascolta il motore: gli eventi, e se il modello era già caricato.
pub struct Ascolta {
    pronto: bool,
    arrivi: Receiver<Arrivo>,
}

/// Il processo del motore e i suoi canali.
pub struct Processo {
    figlio: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    dentro: Arc<Mutex<Dentro>>,
    log: PathBuf,
}

impl Processo {
    fn avvia(comando: &Comando, log: &Path, lingua: Lingua) -> Result<Arc<Processo>, Errore> {
        let non_parte = |m: String| Errore::new("motore_non_parte", format!("Non riesco ad avviare il motore della dettatura: {m}"), format!("Cannot start the dictation engine: {m}"));
        if let Some(cartella) = log.parent() {
            std::fs::create_dir_all(cartella).map_err(|e| non_parte(format!("cartella dei log {}: {e}", cartella.display())))?;
        }
        let errori = std::fs::File::create(log).map_err(|e| non_parte(format!("log {}: {e}", log.display())))?;
        let mut figlio = Command::new(&comando.exe)
            .args(&comando.args)
            .current_dir(&comando.cwd)
            .envs(comando.ambiente.iter().map(|(k, v)| (k, v)))
            .env("MANGO_ANIMATION_LINGUA", lingua.codice())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(errori)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| match (e.kind(), comando.di_base) {
                (std::io::ErrorKind::NotFound, true) => {
                    Errore::new(
                        "python_mancante",
                        "Non trovo Python, che serve alla dettatura: si installa da python.org (con «Add to PATH»), poi si riapre l'app.",
                        "Cannot find Python, which dictation needs: install it from python.org (with \"Add to PATH\"), then reopen the app.",
                    )
                }
                (std::io::ErrorKind::NotFound, false) => {
                    let exe = comando.exe.to_string_lossy();
                    Errore::new(
                        "motore_mancante",
                        format!("Non trovo il programma della dettatura ({exe}): controlla {VARIABILE_COMANDO}."),
                        format!("Cannot find the dictation program ({exe}): check {VARIABILE_COMANDO}."),
                    )
                }
                _ => non_parte(e.to_string()),
            })?;
        let stdin = figlio.stdin.take().expect("stdin del motore");
        let uscita = figlio.stdout.take().expect("stdout del motore");
        let dentro = Arc::new(Mutex::new(Dentro::default()));
        let letto = dentro.clone();
        std::thread::Builder::new()
            .name("voce-motore".into())
            .spawn(move || {
                let mut righe = BufReader::new(uscita);
                let mut riga = Vec::new();
                loop {
                    riga.clear();
                    if righe.read_until(b'\n', &mut riga).unwrap_or(0) == 0 {
                        break;
                    }
                    // le righe che non sono JSON (rumore di una libreria) non sono del protocollo
                    let Ok(evento) = serde_json::from_slice::<Value>(&riga) else { continue };
                    let Some(tipo) = evento["tipo"].as_str() else { continue };
                    let mut d = letto.lock().unwrap();
                    let arrivo = if tipo == "pronto" {
                        d.pronto = true;
                        Arrivo::Pronto
                    } else {
                        Arrivo::Evento(evento)
                    };
                    if let Some(a) = &d.ascoltatore {
                        let _ = a.send(arrivo);
                    }
                }
                let mut d = letto.lock().unwrap();
                d.caduto = true;
                if let Some(a) = d.ascoltatore.take() {
                    let _ = a.send(Arrivo::Caduto);
                }
            })
            .map_err(|e| non_parte(format!("thread di lettura: {e}")))?;
        Ok(Arc::new(Processo { figlio: Mutex::new(figlio), stdin: Mutex::new(stdin), dentro, log: log.to_path_buf() }))
    }

    pub fn caduto(&self) -> bool {
        self.dentro.lock().unwrap().caduto
    }

    /// Da qui gli eventi del motore arrivano a chi ascolta, al posto di chi ascoltava prima. Dà anche se il modello è già caricato; se il
    /// processo è già caduto, un errore.
    pub fn ascolta(&self) -> Result<Ascolta, Errore> {
        let mut d = self.dentro.lock().unwrap();
        if d.caduto {
            return Err(Errore::new("motore_caduto", self.motivo_della_caduta(Lingua::It), self.motivo_della_caduta(Lingua::En)));
        }
        let (tx, arrivi) = channel();
        d.ascoltatore = Some(tx);
        Ok(Ascolta { pronto: d.pronto, arrivi })
    }

    #[cfg(test)]
    pub fn pid(&self) -> u32 {
        self.figlio.lock().unwrap().id()
    }

    fn scrivi(&self, messaggio: &Value) -> bool {
        let mut riga = messaggio.to_string();
        riga.push('\n');
        let mut stdin = self.stdin.lock().unwrap();
        stdin.write_all(riga.as_bytes()).and_then(|_| stdin.flush()).is_ok()
    }

    /// Perché il motore si è fermato, con le ultime righe del suo log.
    fn motivo_della_caduta(&self, lingua: Lingua) -> String {
        let coda = coda_del_log(&self.log, 4);
        if coda.is_empty() {
            lingua.dice("Il motore della dettatura si è fermato.", "The dictation engine has stopped.")
        } else {
            lingua.dice(format!("Il motore della dettatura si è fermato:\n{coda}"), format!("The dictation engine has stopped:\n{coda}"))
        }
    }
}

impl Drop for Processo {
    fn drop(&mut self) {
        let mut figlio = self.figlio.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(figlio.try_wait(), Ok(None)) {
            uccidi_albero(figlio.id());
        }
        let _ = figlio.wait();
    }
}

/// Il motore della dettatura di questa app: il comando, e il processo quando c'è.
pub struct Motore {
    comando: Mutex<Result<Comando, Errore>>,
    log: PathBuf,
    processo: Mutex<Option<Arc<Processo>>>,
}

impl Motore {
    pub fn nuovo(comando: Result<Comando, Errore>, log: PathBuf) -> Motore {
        Motore { comando: Mutex::new(comando), log, processo: Mutex::new(None) }
    }

    pub fn comando_attuale(&self) -> Result<Comando, Errore> {
        self.comando.lock().unwrap().clone()
    }

    /// L'app ha preparato un Python (`docs/APP.md`, «Il computer pronto»): il motore di base lo usa dalla prossima accensione. Un motore indicato dal
    /// creator, o che non si trova, resta com'è.
    pub fn usa_python(&self, python: &Path) {
        if let Ok(comando) = self.comando.lock().unwrap().as_mut() {
            if comando.di_base {
                comando.exe = python.as_os_str().to_owned();
            }
        }
    }

    /// Il comando c'è? (Python e il modello si vedono solo accendendolo.)
    pub fn disponibile(&self) -> Result<(), Errore> {
        self.comando_attuale().map(|_| ())
    }

    /// Il processo acceso: lo accende se non c'è, o se si era fermato.
    pub fn assicura(&self, lingua: Lingua) -> Result<Arc<Processo>, Errore> {
        let comando = self.comando_attuale()?;
        let mut processo = self.processo.lock().unwrap();
        if let Some(p) = processo.as_ref().filter(|p| !p.caduto()) {
            return Ok(p.clone());
        }
        let nuovo = Processo::avvia(&comando, &self.log, lingua)?;
        *processo = Some(nuovo.clone());
        Ok(nuovo)
    }
}

fn evento_errore(messaggio: impl Into<String>) -> Value {
    json!({ "tipo": "errore", "messaggio": messaggio.into() })
}

/// Una dettatura: manda al motore l'audio che arriva da `pezzi` finché non arriva l'alt (`fermato`), poi `fine`, e consegna a `emetti` ciò che
/// il motore risponde. Finisce quando il motore ha chiuso l'ultima frase, o è caduto, o un'altra dettatura gli ha preso il posto.
pub fn detta(processo: &Processo, ascolta: Ascolta, id: u64, pezzi: &Receiver<Vec<f32>>, fermato: &AtomicBool, emetti: &Emetti, lingua: Lingua) {
    let Ascolta { mut pronto, arrivi } = ascolta;
    if !pronto {
        emetti(json!({ "tipo": "preparo" }));
    }
    let mut ha_detto_l_errore = false;
    let mut da_dare: Vec<f32> = Vec::new();
    // l'audio aspetta qui finché il motore non ha caricato il modello: ciò che si dice mentre si carica non va perso
    let mut da_mandare: VecDeque<Vec<u8>> = VecDeque::new();
    let mut nuova_mandata = false;
    let mut finito = false;
    let mut fine_mandata = false;
    let mut limite: Option<Instant> = None;

    'giro: loop {
        if !finito {
            if prendi_tutto(pezzi, &mut da_dare, Duration::from_millis(30)) {
                finito = true;
            }
            if fermato.load(Ordering::SeqCst) {
                da_dare.extend(pezzi.try_iter().flatten());
                finito = true;
            }
            while da_dare.len() >= PEZZO || (finito && !da_dare.is_empty()) {
                let n = da_dare.len().min(PEZZO);
                let pezzo: Vec<f32> = da_dare.drain(..n).collect();
                emetti(json!({ "tipo": "livello", "valore": livello(&pezzo) }));
                da_mandare.push_back(pcm16(&pezzo));
            }
        }
        // ciò che il motore ha da dire; a dettatura finita si aspetta lui, non l'audio
        loop {
            let arrivo = if finito {
                match arrivi.recv_timeout(Duration::from_millis(30)) {
                    Ok(a) => Ok(a),
                    Err(RecvTimeoutError::Timeout) => Err(TryRecvError::Empty),
                    Err(RecvTimeoutError::Disconnected) => Err(TryRecvError::Disconnected),
                }
            } else {
                arrivi.try_recv()
            };
            match arrivo {
                Ok(Arrivo::Pronto) => pronto = true,
                Ok(Arrivo::Evento(e)) if e["id"].as_u64().is_some_and(|i| i != id) => {}
                Ok(Arrivo::Evento(e)) => match e["tipo"].as_str() {
                    Some("chiusa") => break 'giro,
                    Some("ascolto") => emetti(json!({ "tipo": "ascolto" })),
                    Some(t @ ("parziale" | "definitiva")) => emetti(json!({ "tipo": t, "testo": e["testo"] })),
                    Some("errore") => {
                        ha_detto_l_errore = true;
                        emetti(evento_errore(e["messaggio"].as_str().map_or_else(|| lingua.dice("La dettatura ha avuto un errore.", "Dictation had an error."), String::from)));
                    }
                    _ => {}
                },
                Ok(Arrivo::Caduto) => {
                    if !ha_detto_l_errore {
                        emetti(evento_errore(processo.motivo_della_caduta(lingua)));
                    }
                    break 'giro;
                }
                // un'altra dettatura ha preso il posto del motore
                Err(TryRecvError::Disconnected) => break 'giro,
                Err(TryRecvError::Empty) => break,
            }
        }
        if pronto {
            let mut scritto = true;
            if !nuova_mandata {
                scritto = processo.scrivi(&json!({ "tipo": "nuova", "id": id }));
                nuova_mandata = true;
            }
            while scritto {
                let Some(pezzo) = da_mandare.pop_front() else { break };
                scritto = processo.scrivi(&json!({ "tipo": "audio", "id": id, "pcm": base64::engine::general_purpose::STANDARD.encode(pezzo) }));
            }
            if scritto && finito && !fine_mandata && da_mandare.is_empty() {
                scritto = processo.scrivi(&json!({ "tipo": "fine", "id": id }));
                fine_mandata = true;
                limite = Some(Instant::now() + CHIUSURA);
            }
            if !scritto {
                // il motore è caduto: lo dirà il suo ultimo evento, se arriva
                std::thread::sleep(Duration::from_millis(100));
                if !ha_detto_l_errore {
                    emetti(evento_errore(processo.motivo_della_caduta(lingua)));
                }
                break;
            }
        }
        if limite.is_some_and(|l| Instant::now() >= l) {
            emetti(evento_errore(lingua.dice("Il motore della dettatura non ha chiuso l'ultima frase.", "The dictation engine did not finish the last sentence.")));
            break;
        }
    }
}
