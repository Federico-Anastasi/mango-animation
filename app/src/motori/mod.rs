//! I motori della chat che il creator può avere: Claude Code, Codex, Mango Code. Ognuno ha la sua descrizione (`MOTORI`): come si cerca, cosa si chiede per versione e accesso, come si accede, come si installa.
//! L'app non li include e non tocca le loro credenziali: chiede ai programmi, come farebbe il creator da terminale, e per l'accesso lascia fare a loro. Mango Code non è un programma da cercare: si accende da sé (`mango_code.rs`).

mod mango_code;
mod store;
#[cfg(test)]
mod prove;

use crate::lingua::t;
use crate::supervisor::{apri_fuori_dal_giobbe, uccidi_albero};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::OsStr;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// Il comando con cui Anthropic installa Claude Code su Windows, da PowerShell (code.claude.com/docs/en/setup).
pub const COMANDO_DI_INSTALLAZIONE_DI_CLAUDE: &str = "irm https://claude.ai/install.ps1 | iex";

/// Il nome di famiglia del pacchetto di Codex nello Store di Windows.
const FAMIGLIA_DI_CODEX: &str = "OpenAI.Codex_2p2nqsd0c76g0";

/// L'ultima uscita di Mango Code, con il suo installatore.
const PAGINA_DI_MANGO_CODE: &str = "https://github.com/Federico-Anastasi/mango-code/releases/latest";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
const ATTESA_DEI_CONTROLLI: Duration = Duration::from_secs(20);
/// Il tempo che si dà al creator per finire l'accesso nel browser.
const ATTESA_DELL_ACCESSO: Duration = Duration::from_secs(10 * 60);
/// Il tempo che si dà all'installatore di Anthropic: scarica il programma, e con una rete lenta ci mette.
const ATTESA_DELL_INSTALLAZIONE: Duration = Duration::from_secs(15 * 60);

/// L'identificativo di un motore, quello che usano anche il server e lo studio.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Id {
    ClaudeCode,
    Codex,
    MangoCode,
}

/// Da dove parte un posto noto.
pub enum Radice {
    /// La cartella dell'utente (`USERPROFILE`).
    Casa,
    /// `%APPDATA%`.
    AppData,
}

pub struct Pacchetto {
    pub famiglia: &'static str,
    /// Il programma, dentro la cartella in cui Windows ha installato il pacchetto.
    pub programma: &'static str,
}

pub enum ComeSiInstalla {
    /// Una finestra di PowerShell col comando del produttore.
    ComandoDiPowershell(&'static str),
    /// La pagina dello Store del pacchetto con questo nome di famiglia; l'installazione la fa il creator da lì.
    PaginaDelloStore(&'static str),
    /// Una pagina web da cui il creator scarica l'installatore.
    PaginaWeb(&'static str),
}

/// Cosa risponde il programma alla domanda «sei collegato?».
#[derive(Debug, PartialEq)]
pub enum Accesso {
    Collegato,
    NonCollegato,
    Incomprensibile,
}

pub struct Uscita {
    pub riuscito: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Un programma da cercare e da interrogare.
pub struct Programma {
    /// La variabile che vince su tutto (prove, chi sviluppa): il percorso del programma. È anche quella che l'app passa al server.
    pub variabile: &'static str,
    pub eseguibile: &'static str,
    /// Dove sta il programma vero quando nel PATH c'è solo lo script di npm (`<eseguibile senza estensione>.cmd`), relativo alla cartella dello script.
    pub di_npm: Option<&'static [&'static str]>,
    /// Dove si installa senza che il PATH di chi ha aperto l'app lo sappia ancora.
    pub posti_noti: &'static [(Radice, &'static [&'static str])],
    pub pacchetto_dello_store: Option<Pacchetto>,
    /// Prima del numero, nell'uscita della versione.
    pub nome_nella_versione: Option<&'static str>,
    pub versione: &'static [&'static str],
    pub accesso: &'static [&'static str],
    pub legge_l_accesso: fn(&Uscita) -> Accesso,
    pub per_accedere: &'static [&'static str],
}

pub struct Motore {
    pub id: Id,
    pub nome: &'static str,
    /// `None`: Mango Code, che non si cerca come programma.
    pub programma: Option<Programma>,
    pub installazione: ComeSiInstalla,
}

impl Motore {
    /// Il comando da dare a chi preferisce incollarlo da sé, se l'installazione è un comando.
    pub fn comando_di_installazione(&self) -> Option<&'static str> {
        match self.installazione {
            ComeSiInstalla::ComandoDiPowershell(comando) => Some(comando),
            ComeSiInstalla::PaginaDelloStore(_) | ComeSiInstalla::PaginaWeb(_) => None,
        }
    }
}

pub const CLAUDE: &Motore = &Motore {
    id: Id::ClaudeCode,
    nome: "Claude Code",
    programma: Some(Programma {
        variabile: "MANGO_ANIMATION_CLAUDE",
        eseguibile: "claude.exe",
        di_npm: Some(&["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"]),
        posti_noti: &[
            (Radice::Casa, &[".local", "bin", "claude.exe"]),
            (Radice::AppData, &["npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"]),
        ],
        pacchetto_dello_store: None,
        nome_nella_versione: None,
        versione: &["--version"],
        accesso: &["auth", "status"],
        legge_l_accesso: accesso_di_claude,
        per_accedere: &["auth", "login"],
    }),
    installazione: ComeSiInstalla::ComandoDiPowershell(COMANDO_DI_INSTALLAZIONE_DI_CLAUDE),
};

pub const CODEX: &Motore = &Motore {
    id: Id::Codex,
    nome: "Codex",
    programma: Some(Programma {
        variabile: "MANGO_ANIMATION_CODEX",
        eseguibile: "codex.exe",
        di_npm: None,
        posti_noti: &[],
        pacchetto_dello_store: Some(Pacchetto { famiglia: FAMIGLIA_DI_CODEX, programma: r"app\resources\codex.exe" }),
        nome_nella_versione: Some("codex-cli"),
        versione: &["--version"],
        accesso: &["login", "status"],
        legge_l_accesso: accesso_di_codex,
        per_accedere: &["login"],
    }),
    installazione: ComeSiInstalla::PaginaDelloStore(FAMIGLIA_DI_CODEX),
};

pub const MANGO_CODE: &Motore = &Motore { id: Id::MangoCode, nome: "Mango Code", programma: None, installazione: ComeSiInstalla::PaginaWeb(PAGINA_DI_MANGO_CODE) };

/// Nell'ordine in cui l'avvio li guarda e la pagina li mostra.
pub const MOTORI: [&Motore; 3] = [CLAUDE, CODEX, MANGO_CODE];

pub fn motore(id: Id) -> &'static Motore {
    match id {
        Id::ClaudeCode => CLAUDE,
        Id::Codex => CODEX,
        Id::MangoCode => MANGO_CODE,
    }
}

/// Com'è messo un motore, per la pagina che guida il creator.
#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct StatoMotore {
    pub id: Id,
    pub nome: &'static str,
    /// Il programma c'è e parte (Mango Code: è acceso).
    pub trovato: bool,
    pub percorso: Option<String>,
    pub versione: Option<String>,
    /// Il creator ha fatto l'accesso (Mango Code: risponde).
    pub collegato: bool,
    /// Perché non va, in una frase per il creator.
    pub messaggio: Option<String>,
    /// Con il motore assente: il comando che lo installa, da dare a chi preferisce incollarlo da sé.
    pub comando: Option<String>,
    pub installabile: bool,
    pub accedibile: bool,
}

impl StatoMotore {
    pub fn vuoto(motore: &Motore) -> Self {
        let programma = motore.programma.is_some();
        StatoMotore { id: motore.id, nome: motore.nome, trovato: false, percorso: None, versione: None, collegato: false, messaggio: None, comando: None, installabile: programma, accedibile: programma }
    }

    pub fn pronto(&self) -> bool {
        self.trovato && self.collegato
    }
}

/// Dove cercare i programmi: il PATH di chi ha aperto l'app, le cartelle dell'utente, e la risposta di Windows sui pacchetti dello Store (nome di famiglia → cartelle d'installazione).
pub struct Dove<'a> {
    pub percorsi: &'a OsStr,
    pub casa: Option<&'a Path>,
    pub appdata: Option<&'a Path>,
    pub pacchetto: &'a dyn Fn(&str) -> Vec<PathBuf>,
}

/// In una cartella del PATH: il programma, oppure lo script di npm, che non è il programma ma lo lancia (sta accanto, in `node_modules`).
fn in_cartella(programma: &Programma, cartella: &Path) -> Option<PathBuf> {
    let diretto = cartella.join(programma.eseguibile);
    if diretto.is_file() {
        return Some(diretto);
    }
    let script = cartella.join(programma.eseguibile.replace(".exe", ".cmd"));
    let di_npm = programma.di_npm?.iter().fold(cartella.to_path_buf(), |p, pezzo| p.join(pezzo));
    (script.is_file() && di_npm.is_file()).then_some(di_npm)
}

fn nei_posti_noti(programma: &Programma, dove: &Dove) -> Option<PathBuf> {
    programma
        .posti_noti
        .iter()
        .filter_map(|(radice, relativo)| {
            let base = match radice {
                Radice::Casa => dove.casa,
                Radice::AppData => dove.appdata,
            }?;
            Some(relativo.iter().fold(base.to_path_buf(), |p, pezzo| p.join(pezzo)))
        })
        .find(|p| p.is_file())
}

/// Fra le versioni installate di un pacchetto, l'ultima che Windows elenca e che ha il programma.
fn nello_store(programma: &Programma, dove: &Dove) -> Option<PathBuf> {
    let pacchetto = programma.pacchetto_dello_store.as_ref()?;
    (dove.pacchetto)(pacchetto.famiglia).into_iter().rev().map(|cartella| cartella.join(pacchetto.programma)).find(|p| p.is_file())
}

/// Il programma del motore. `indicato` è la sua variabile: se c'è deve essere un file, e vince su tutto.
/// `Ok(None)`: non c'è. `Err`: la variabile indica qualcosa che non c'è.
pub fn trova(motore: &Motore, indicato: Option<&str>, dove: &Dove) -> Result<Option<PathBuf>, String> {
    let Some(programma) = &motore.programma else { return Ok(None) };
    if let Some(indicato) = indicato.filter(|v| !v.is_empty()) {
        let variabile = programma.variabile;
        return if Path::new(indicato).is_file() {
            Ok(Some(PathBuf::from(indicato)))
        } else {
            Err(t(
                format!("Il programma indicato da {variabile} («{indicato}») non c'è: correggi la variabile."),
                format!("The program set by {variabile} (“{indicato}”) does not exist: fix the variable."),
            ))
        };
    }
    let nel_percorso = std::env::split_paths(dove.percorsi).find_map(|c| in_cartella(programma, &c));
    Ok(nel_percorso.or_else(|| nei_posti_noti(programma, dove)).or_else(|| nello_store(programma, dove)))
}

/// Come `trova`, con il PATH, le cartelle e lo Store di questo computer, e la variabile del motore.
pub fn trova_nel_computer(motore: &Motore) -> Result<Option<PathBuf>, String> {
    let Some(programma) = &motore.programma else { return Ok(None) };
    let percorsi = std::env::var_os("PATH").unwrap_or_default();
    let casa = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    let indicato = std::env::var(programma.variabile).ok();
    trova(motore, indicato.as_deref(), &Dove { percorsi: &percorsi, casa: casa.as_deref(), appdata: appdata.as_deref(), pacchetto: &store::cartelle_del_pacchetto })
}

/// Mango Code in questo computer: acceso e pronto, acceso ma non pronto, spento, o non installato (`mango_code.rs`).
pub fn mango_code_nel_computer() -> StatoMotore {
    stato_di_mango_code(mango_code::cartella_dei_dati(&|nome| std::env::var(nome).ok()).as_deref(), mango_code::elencato_da_windows(mango_code::NOME_FRA_I_PROGRAMMI))
}

/// `installato`: Windows lo elenca fra i programmi. Spento e non installato è il solo caso in cui c'è qualcosa da installare.
pub fn stato_di_mango_code(dati: Option<&Path>, installato: bool) -> StatoMotore {
    let vuoto = StatoMotore::vuoto(MANGO_CODE);
    match dati.map_or(mango_code::Stato::Spento, mango_code::stato) {
        mango_code::Stato::Pronto => StatoMotore { trovato: true, collegato: true, ..vuoto },
        mango_code::Stato::NonPronto => StatoMotore {
            trovato: true,
            messaggio: Some(t("Mango Code è acceso ma non è ancora pronto: guarda la sua finestra.", "Mango Code is on but not ready yet: look at its window.")),
            ..vuoto
        },
        mango_code::Stato::Spento => StatoMotore { installabile: !installato, ..vuoto },
    }
}

fn leggi_in_un_filo<R: Read + Send + 'static>(flusso: Option<R>) -> JoinHandle<String> {
    std::thread::spawn(move || {
        let mut grezzo = Vec::new();
        if let Some(mut f) = flusso {
            let _ = f.read_to_end(&mut grezzo);
        }
        String::from_utf8_lossy(&grezzo).into_owned()
    })
}

/// Lancia il programma nascosto e ne raccoglie l'uscita; se non finisce in `massimo` lo ferma (per il suo PID: è il figlio che si è avviato qui).
fn esegui(nome: &str, programma: &Path, args: &[&str], massimo: Duration) -> Result<Uscita, String> {
    let mut figlio = Command::new(programma)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| t(format!("Non riesco ad avviare {nome} ({}): {e}", programma.display()), format!("I can't start {nome} ({}): {e}", programma.display())))?;
    let fuori = leggi_in_un_filo(figlio.stdout.take());
    let errori = leggi_in_un_filo(figlio.stderr.take());
    let inizio = Instant::now();
    let stato = loop {
        match figlio.try_wait() {
            Ok(Some(stato)) => break stato,
            Ok(None) if inizio.elapsed() >= massimo => {
                uccidi_albero(figlio.id());
                let _ = figlio.wait();
                return Err(t(format!("{nome} non risponde."), format!("{nome} is not responding.")));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(t(format!("Non riesco a controllare {nome}: {e}"), format!("I can't check {nome}: {e}"))),
        }
    };
    Ok(Uscita { riuscito: stato.success(), stdout: fuori.join().unwrap_or_default(), stderr: errori.join().unwrap_or_default() })
}

/// «2.1.318 (Claude Code)» → «2.1.318»; «codex-cli 0.167.0» → «0.167.0».
fn versione_da(uscita: &str, nome_nella_versione: Option<&str>) -> Option<String> {
    let mut parole = uscita.split_whitespace();
    let prima = parole.next()?;
    let numero = if nome_nella_versione == Some(prima) { parole.next()? } else { prima };
    numero.chars().next().is_some_and(|c| c.is_ascii_digit()).then(|| numero.to_owned())
}

/// L'uscita di `claude auth status`, che è un JSON anche quando non si è collegati.
fn accesso_di_claude(uscita: &Uscita) -> Accesso {
    match serde_json::from_str::<Value>(uscita.stdout.trim()).ok().and_then(|v| v.get("loggedIn")?.as_bool()) {
        Some(true) => Accesso::Collegato,
        Some(false) => Accesso::NonCollegato,
        None => Accesso::Incomprensibile,
    }
}

/// L'uscita di `codex login status`: una riga sul canale degli errori, «Logged in using …» se si è collegati.
fn accesso_di_codex(uscita: &Uscita) -> Accesso {
    let riga = ultima_riga(&uscita.stderr, &uscita.stdout);
    if uscita.riuscito && riga.starts_with("Logged in") {
        Accesso::Collegato
    } else if !uscita.riuscito && riga.to_lowercase().contains("logged") {
        Accesso::NonCollegato
    } else {
        Accesso::Incomprensibile
    }
}

/// Chiede al programma versione e account. Non legge né mostra altro: l'accesso lo sa il programma, non l'app.
pub fn esamina(motore: &Motore, eseguibile: &Path) -> StatoMotore {
    esamina_con(motore, eseguibile, ATTESA_DEI_CONTROLLI)
}

fn esamina_con(motore: &Motore, eseguibile: &Path, massimo: Duration) -> StatoMotore {
    let vuoto = StatoMotore::vuoto(motore);
    let Some(programma) = &motore.programma else { return vuoto };
    let nome = motore.nome;
    let percorso = Some(eseguibile.display().to_string());
    let versione = match esegui(nome, eseguibile, programma.versione, massimo) {
        Ok(u) if u.riuscito => versione_da(&u.stdout, programma.nome_nella_versione),
        Ok(u) => {
            let riga = ultima_riga(&u.stderr, &u.stdout);
            return StatoMotore { percorso, messaggio: Some(t(format!("{nome} non parte: {riga}"), format!("{nome} won't start: {riga}"))), ..vuoto };
        }
        Err(messaggio) => return StatoMotore { percorso, messaggio: Some(messaggio), ..vuoto },
    };
    let Some(versione) = versione else {
        return StatoMotore { percorso, messaggio: Some(t(format!("Questo programma non risponde come {nome}."), format!("This program does not answer like {nome}."))), ..vuoto };
    };
    let trovato = StatoMotore { trovato: true, percorso, versione: Some(versione), ..vuoto };
    match esegui(nome, eseguibile, programma.accesso, massimo) {
        Ok(u) => match (programma.legge_l_accesso)(&u) {
            Accesso::Collegato => StatoMotore { collegato: true, ..trovato },
            Accesso::NonCollegato => trovato,
            Accesso::Incomprensibile => {
                let riga = ultima_riga(&u.stderr, &u.stdout);
                StatoMotore { messaggio: Some(t(format!("Non riesco a capire se {nome} è collegato: {riga}"), format!("I can't tell whether {nome} is connected: {riga}"))), ..trovato }
            }
        },
        Err(messaggio) => StatoMotore { messaggio: Some(messaggio), ..trovato },
    }
}

fn ultima_riga(primo: &str, secondo: &str) -> String {
    [primo, secondo].iter().flat_map(|t| t.lines().rev()).map(str::trim).find(|r| !r.is_empty()).map_or_else(|| t("nessuna risposta", "no answer"), str::to_owned)
}

/// Aspetta che `figlio` (una finestra di terminale che il creator vede) si chiuda. Oltre `massimo` lo ferma (per il suo PID: l'ha avviato questa funzione) e dice `scaduto`.
fn aspetta_la_finestra(mut figlio: Child, massimo: Duration, scaduto: String, seguirla: impl Fn(std::io::Error) -> String) -> Result<(), String> {
    let inizio = Instant::now();
    loop {
        match figlio.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) if inizio.elapsed() >= massimo => {
                uccidi_albero(figlio.id());
                let _ = figlio.wait();
                return Err(scaduto);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(250)),
            Err(e) => return Err(seguirla(e)),
        }
    }
}

fn senza_programma(nome: &str) -> String {
    t(format!("{nome} non è un programma da avviare."), format!("{nome} is not a program to start."))
}

/// L'accesso lo fa il programma stesso (`claude auth login`, `codex login`: aprono il browser dell'account), in una finestra di terminale che il creator vede, perché se serve un
/// passo in più è lì che lo legge. Torna quando la finestra si chiude.
pub fn accedi(motore: &Motore, percorso: &Path) -> Result<(), String> {
    let Some(programma) = &motore.programma else { return Err(senza_programma(motore.nome)) };
    let nome = motore.nome;
    let figlio = Command::new(percorso)
        .args(programma.per_accedere)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| t(format!("Non riesco ad avviare l'accesso di {nome}: {e}"), format!("I can't start the {nome} sign-in: {e}")))?;
    aspetta_la_finestra(
        figlio,
        ATTESA_DELL_ACCESSO,
        t(format!("L'accesso a {nome} non è finito entro dieci minuti: riprova."), format!("Signing in to {nome} did not finish within ten minutes: try again.")),
        |e| t(format!("Non riesco a seguire l'accesso di {nome}: {e}"), format!("I can't follow the {nome} sign-in: {e}")),
    )
}

fn fra_apici_di_powershell(frase: &str) -> String {
    format!("'{}'", frase.replace('\'', "''"))
}

/// Cosa esegue la finestra di PowerShell: il comando del produttore. Se va storto la finestra resta aperta con l'errore, perché il creator lo legga; se va bene si chiude da sola.
fn script_di_installazione(nome: &str, comando: &str) -> String {
    let intro = t(format!("Installo {nome}. Questa finestra si chiude da sola quando ha finito."), format!("Installing {nome}. This window closes by itself when it is done."));
    let errore = t("Qualcosa non è andato. Premi Invio per chiudere.", "Something went wrong. Press Enter to close.");
    format!(
        "$ErrorActionPreference = 'Stop'; Write-Host {intro}; try {{ {comando} }} catch {{ Write-Host ''; Write-Host $_.Exception.Message; Write-Host ''; Read-Host {errore} | Out-Null; exit 1 }}",
        intro = fra_apici_di_powershell(&intro),
        errore = fra_apici_di_powershell(&errore),
    )
}

fn indirizzo_dello_store(famiglia: &str) -> String {
    format!("ms-windows-store://pdp/?PFN={famiglia}")
}

/// Cosa è successo chiedendo di installare.
#[derive(Debug, PartialEq)]
pub enum Installata {
    /// La finestra dell'installatore si è chiusa: se il motore ora c'è lo dice chi richiama (`trova`), non la finestra.
    Finita,
    /// L'installazione continua altrove, a cura del creator: la frase gli dice dove.
    Aperta(String),
}

fn frase_dello_store(motore: &Motore) -> String {
    let nome = motore.nome;
    t(
        format!("Ho aperto la pagina di {nome} nel Microsoft Store: installalo da lì, poi premi «Ricontrolla»."),
        format!("I opened the {nome} page in the Microsoft Store: install it from there, then press “Check again”."),
    )
}

fn frase_della_pagina(motore: &Motore) -> String {
    let nome = motore.nome;
    t(
        format!("Ho aperto la pagina di {nome}: scarica l'installatore, installalo e aprilo, poi premi «Ricontrolla»."),
        format!("I opened the {nome} page: download the installer, install it and open it, then press “Check again”."),
    )
}

/// Installa il motore: col comando del produttore in una finestra di PowerShell che il creator vede (torna quando si chiude), o aprendo la pagina da cui il creator lo installa.
pub fn installa(motore: &Motore) -> Result<Installata, String> {
    let nome = motore.nome;
    match motore.installazione {
        ComeSiInstalla::ComandoDiPowershell(comando) => {
            let figlio = Command::new("powershell")
                .args(["-NoProfile", "-Command", &script_di_installazione(nome, comando)])
                .creation_flags(CREATE_NEW_CONSOLE)
                .spawn()
                .map_err(|e| t(format!("Non riesco ad avviare l'installazione di {nome}: {e}"), format!("I can't start the {nome} installation: {e}")))?;
            aspetta_la_finestra(
                figlio,
                ATTESA_DELL_INSTALLAZIONE,
                t(format!("L'installazione di {nome} non è finita entro quindici minuti."), format!("The {nome} installation did not finish within fifteen minutes.")),
                |e| t(format!("Non riesco a seguire l'installazione di {nome}: {e}"), format!("I can't follow the {nome} installation: {e}")),
            )
            .map(|()| Installata::Finita)
        }
        ComeSiInstalla::PaginaDelloStore(famiglia) => apri_fuori_dal_giobbe(&indirizzo_dello_store(famiglia))
            .map(|()| Installata::Aperta(frase_dello_store(motore)))
            .map_err(|e| t(format!("Non riesco ad aprire il Microsoft Store: {e}"), format!("I can't open the Microsoft Store: {e}"))),
        ComeSiInstalla::PaginaWeb(pagina) => apri_fuori_dal_giobbe(pagina)
            .map(|()| Installata::Aperta(frase_della_pagina(motore)))
            .map_err(|e| t(format!("Non riesco ad aprire la pagina di {nome}: {e}"), format!("I can't open the {nome} page: {e}"))),
    }
}

/// Dopo l'installazione il motore ancora non c'è o non parte: la frase per il creator.
pub fn installazione_non_riuscita(motore: &Motore) -> String {
    let nome = motore.nome;
    t(format!("L'installazione di {nome} non è andata a buon fine."), format!("The {nome} installation did not succeed."))
}
