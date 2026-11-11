//! I passi dell'avvio che aspettano il creator: la pagina d'attesa mostra cosa manca e cosa fare, e l'avvio prosegue quando lui risponde.

use crate::aggiornamento::{self, dopo_il_si, stato_d_errore, Fallito, Passo, Proposta, StatoAggiornamento};
use crate::claude::{self, StatoClaude};
use crate::cartella::{Sistema, StatoCartella};
use crate::codice;
use crate::lavoro;
use crate::sposta::{self, Avanzamento, Fallita, Fase, Spostata, StatoSpostamento};
use crate::lingua::t;
use crate::computer::installa::{Evento, SondeVere, HUGGING_FACE};
use crate::computer::piano::{calcola, Funzioni, Luoghi, ModelliScelti, SceltaPython};
use crate::computer::{self, applica, computer_pronto, esegui_piano, hw, manifesto, profilo, vista, Dove, Progresso, Risposta};
use crate::{imposta_stato, Interno, Stato};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Cosa il creator risponde, dalla pagina d'attesa, a un passo che lo aspetta.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Azione {
    /// Ha sistemato (o crede di aver sistemato): si guarda di nuovo.
    Ricontrolla,
    /// Vuole fare l'accesso a Claude Code.
    Accedi,
    /// Vuole installare Claude Code.
    Installa,
    /// Va avanti così com'è.
    Continua,
    /// Ha acceso o spento delle funzioni (`{ "sagoma": false, … }`): si ricalcola cosa si scarica.
    Funzioni(BTreeMap<String, bool>),
    /// Prepara il computer con le funzioni scelte.
    Prepara,
    /// Ferma ciò che si sta scaricando.
    Annulla,
    /// Installa la versione nuova.
    Aggiorna,
    /// Guarda questa cartella per i video (una delle scelte rapide).
    Cartella(PathBuf),
    /// Apre il dialogo di sistema per scegliere un'altra cartella per i video.
    ScegliCartella,
    /// Tiene la cartella per i video che la pagina mostra.
    UsaCartella,
}

/// Il passo che aspetta riceve da qui le risposte della pagina.
#[derive(Default)]
pub struct Risposte {
    mittente: std::sync::Mutex<Option<mpsc::Sender<Azione>>>,
    /// Si accende con «Annulla»: lo scarico in corso lo guarda e si ferma.
    annulla: Arc<AtomicBool>,
}

impl Risposte {
    /// Una risposta che nessun passo aspetta si perde: la pagina non ha più niente da rispondere. «Annulla» non è una risposta ma uno stop a ciò che gira.
    pub fn invia(&self, azione: Azione) {
        if azione == Azione::Annulla {
            self.annulla.store(true, Ordering::SeqCst);
        } else if let Some(mittente) = self.mittente.lock().unwrap().as_ref() {
            let _ = mittente.send(azione);
        }
    }

    fn apri(&self) -> mpsc::Receiver<Azione> {
        let (mittente, ricevitore) = mpsc::channel();
        *self.mittente.lock().unwrap() = Some(mittente);
        ricevitore
    }

    fn chiudi(&self) {
        *self.mittente.lock().unwrap() = None;
    }
}

/// Mostra `stato` e aspetta una risposta che `accetta` riconosce (le altre, un «Ricontrolla» di Claude Code arrivato tardi, si lasciano cadere). Se il canale delle risposte si chiude
/// torna `se_chiude`.
fn chiedi_fra<T>(app: &AppHandle, stato: Stato, se_chiude: T, accetta: impl Fn(Azione) -> Option<T>) -> T {
    let risposte = &app.state::<Interno>().risposte;
    let ricevitore = risposte.apri();
    imposta_stato(app, stato);
    let risposta = loop {
        match ricevitore.recv() {
            Ok(azione) => {
                if let Some(risposta) = accetta(azione) {
                    break risposta;
                }
            }
            Err(_) => break se_chiude,
        }
    };
    risposte.chiudi();
    risposta
}

/// Mostra `stato` e aspetta che il creator risponda, qualunque cosa.
fn chiedi(app: &AppHandle, stato: Stato) -> Azione {
    chiedi_fra(app, stato, Azione::Continua, Some)
}

/// Mostra lo stato dell'aggiornamento e aspetta se il creator lo vuole (`true`: «Aggiorna ora», o «Riprova» dopo un errore) o no (`false`, anche se la pagina si chiude).
fn chiedi_aggiornamento(app: &AppHandle, stato: StatoAggiornamento) -> bool {
    let accetta = |azione| match azione {
        Azione::Aggiorna => Some(true),
        Azione::Continua => Some(false),
        _ => None,
    };
    chiedi_fra(app, Stato { fase: "aggiornamento".into(), aggiornamento: Some(stato), ..Default::default() }, false, accetta)
}

/// Scrive `nome` nella cartella dei registri dell'app (`%LOCALAPPDATA%\dev.mango.animation\logs\`): un errore che non si può dire al creator, ma che chi lo cerca deve trovare.
fn scrivi_nel_registro(app: &AppHandle, nome: &str, testo: &str) {
    let Ok(file) = app.path().app_log_dir().map(|c| c.join(nome)) else { return };
    let _ = std::fs::create_dir_all(file.parent().unwrap_or(Path::new("")));
    let _ = std::fs::write(file, format!("{testo}\n"));
}

/// Scarica e installa la versione che il creator ha voluto, mostrando l'avanzamento. Su Windows l'app si chiude prima di arrivare in fondo: arrivarci è un errore.
fn scarica_e_installa(app: &AppHandle, proposta: &Proposta, base: &StatoAggiornamento) -> Result<(), Fallito> {
    let mostra = |fatti: u64, totale: u64| {
        imposta_stato(app, Stato { fase: "aggiornamento".into(), aggiornamento: Some(StatoAggiornamento { fase: "scarico".into(), fatti, totale, ..base.clone() }), ..Default::default() })
    };
    mostra(0, 0);
    let mut ultimo: Option<Instant> = None;
    let pacchetto = aggiornamento::scarica(proposta, |fatti, totale| {
        if ultimo.is_none_or(|t| t.elapsed() > Duration::from_millis(200)) {
            ultimo = Some(Instant::now());
            mostra(fatti, totale);
        }
    })
    .map_err(|dettaglio| Fallito { passo: Passo::Scarico, dettaglio })?;
    aggiornamento::installa(proposta, &pacchetto).map_err(|dettaglio| Fallito { passo: Passo::Installazione, dettaglio })?;
    Err(Fallito { passo: Passo::NonSiChiude, dettaglio: String::new() })
}

/// Questa è l'app installata (il suo codice sta in `codice/` accanto all'eseguibile), non quella di chi sviluppa.
fn e_l_app_installata(radice: &Path) -> bool {
    std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)).is_some_and(|cartella| aggiornamento::installata(radice, &cartella))
}

/// Dopo un aggiornamento `codice/` ha solo i file della versione nuova (`docs/APP.md`, «Installer e aggiornamenti»). Un errore non ferma l'avvio: si scrive in `codice.log`.
pub fn codice_in_ordine(app: &AppHandle, radice: &Path) {
    if !e_l_app_installata(radice) {
        return;
    }
    let Ok(dati) = app.path().app_local_data_dir() else { return };
    if let Err(e) = codice::in_ordine(radice, &dati.join("codice-in-ordine")) {
        scrivi_nel_registro(app, "codice.log", &e);
    }
}

/// Una versione più nuova, se c'è: la propone prima di far partire lo studio (così nessun lavoro in corso si perde) e, se il creator vuole, la installa: l'app si chiude e l'installatore
/// la riapre. Solo l'app installata si aggiorna. Un controllo che non riesce (niente rete, nessuna uscita pubblicata) non ferma l'avvio e non dice niente: si scrive in `aggiornamento.log`.
/// Dopo il sì invece un errore si dice, con il modo di riprovare o di continuare con la versione installata.
pub fn aggiornamento_del_prodotto(app: &AppHandle, radice: &Path) {
    if !e_l_app_installata(radice) {
        return;
    }
    aggiornamento::togli_installatori_vecchi(&std::env::temp_dir());
    imposta_stato(app, crate::attesa(0, t("Cerco una versione nuova", "Looking for a new version")));
    let proposta = match aggiornamento::cerca(app) {
        Ok(Some(proposta)) => proposta,
        Ok(None) => return,
        Err(e) => return scrivi_nel_registro(app, "aggiornamento.log", &format!("controllo: {e}")),
    };
    let base = proposta.stato.clone();
    if !chiedi_aggiornamento(app, base.clone()) {
        return;
    }
    dopo_il_si(
        proposta,
        || aggiornamento::cerca(app),
        |proposta| scarica_e_installa(app, proposta, &base),
        |fallito| chiedi_aggiornamento(app, stato_d_errore(&base, fallito)),
        |fallito| scrivi_nel_registro(app, "aggiornamento.log", &format!("{:?}: {}", fallito.passo, fallito.dettaglio)),
    );
}

/// Cosa il computer ha dato all'avvio: le variabili con cui accendere il server (il Python e i programmi che ha preparato l'app).
pub struct Preparato {
    pub ambiente: Vec<(OsString, OsString)>,
    /// Il Python dell'ambiente dell'app, se è quello che motore e dettatura devono usare.
    pub python: Option<PathBuf>,
}

fn percorso_con(luoghi: &Luoghi, base: &std::ffi::OsStr) -> OsString {
    let cartelle = luoghi.cartelle_del_percorso().into_iter().chain(std::env::split_paths(base));
    std::env::join_paths(cartelle).unwrap_or_else(|_| base.to_owned())
}

/// Il computer pronto (`docs/APP.md`): vede cosa c'è e cosa manca per le funzioni accese, lo fa vedere al creator con peso e licenza di ciascuno, e scarica con
/// avanzamento e verifica. Se non manca niente non mostra niente. Torna le variabili per il server.
pub fn computer_del_creator(app: &AppHandle, radice: &Path, lavoro: &Path) -> Result<Preparato, String> {
    let dati = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("computer");
    let luoghi = Luoghi::dell_utente(dati, radice.to_path_buf(), &|nome| std::env::var(nome).ok());
    let base = std::env::var_os("PATH").unwrap_or_default();
    let variabile_python = std::env::var("MANGO_ANIMATION_PYTHON").is_ok_and(|v| !v.is_empty());
    let profilo_iniziale = profilo::leggi(lavoro)?;
    let stile_di_serie = profilo::leggi_stile(&radice.join("stile.json"))?;
    let stile_del_creator = profilo::leggi_stile(&lavoro.join("stile.json"))?;
    let computer = hw::leggi(&luoghi.dati);
    let modelli = ModelliScelti::da(&profilo_iniziale, &stile_del_creator, &stile_di_serie, computer.ha_scheda_per_cuda());
    let elementi = manifesto::elementi();
    let piano_per = |funzioni: &Funzioni| calcola(&luoghi, &SondeVere { percorsi: percorso_con(&luoghi, &base) }, &computer, funzioni, &modelli, variabile_python, &elementi);

    computer_pronto(
        || hw::leggi(&luoghi.dati),
        Funzioni::dal_profilo(&profilo_iniziale),
        &piano_per,
        |stato| chiedi_computer(app, stato),
        |piano, funzioni| {
            let risposte = &app.state::<Interno>().risposte;
            risposte.annulla.store(false, Ordering::SeqCst);
            let sonde = SondeVere { percorsi: percorso_con(&luoghi, &base) };
            let (mut avanzamento, mut ultimo): (BTreeMap<String, Progresso>, Option<Instant>) = (BTreeMap::new(), None);
            let mostra = |avanzamento: &BTreeMap<String, Progresso>| {
                imposta_stato(app, Stato { fase: "computer".into(), computer: Some(vista("scarico", &computer, funzioni, piano, avanzamento, None)), ..Default::default() })
            };
            mostra(&avanzamento);
            let percorso = percorso_con(&luoghi, &base);
            esegui_piano(piano, funzioni, &Dove { luoghi: &luoghi, percorso: &percorso, hf: HUGGING_FACE, sonde: &sonde }, &risposte.annulla, &mut |e| {
                applica(&mut avanzamento, &e);
                // I byte arrivano a centinaia al secondo: la pagina li vede cinque volte al secondo.
                if !matches!(e, Evento::Avanza { .. }) || ultimo.is_none_or(|t| t.elapsed() > Duration::from_millis(200)) {
                    ultimo = Some(Instant::now());
                    mostra(&avanzamento);
                }
            })
        },
        |funzioni| scrivi_le_scelte(lavoro, funzioni),
    )?;

    let finale = piano_per(&Funzioni::dal_profilo(&profilo::leggi(lavoro)?));
    let python = (finale.python == SceltaPython::DellApp).then(|| luoghi.python_dell_app());
    let mut ambiente: Vec<(OsString, OsString)> = vec![("PATH".into(), percorso_con(&luoghi, &base))];
    if let Some(p) = &python {
        ambiente.push(("MANGO_ANIMATION_PYTHON".into(), p.clone().into_os_string()));
    }
    Ok(Preparato { ambiente, python })
}

/// Nel profilo vanno solo le funzioni che il creator ha cambiato rispetto a ciò che il profilo già dice.
fn scrivi_le_scelte(lavoro: &Path, scelte: &Funzioni) -> Result<(), String> {
    let attuali = Funzioni::dal_profilo(&profilo::leggi(lavoro)?);
    let cambiate: BTreeMap<String, bool> = scelte.0.iter().filter(|(f, a)| attuali.0.get(*f) != Some(*a)).map(|(f, a)| (f.clone(), *a)).collect();
    if cambiate.is_empty() {
        Ok(())
    } else {
        profilo::scrivi_funzioni(lavoro, &cambiate)
    }
}

/// Mostra lo stato del computer e aspetta una risposta che lo riguarda.
fn chiedi_computer(app: &AppHandle, stato: computer::StatoComputer) -> Risposta {
    let accetta = |azione| match azione {
        Azione::Funzioni(scelte) => Some(Risposta::Funzioni(scelte)),
        Azione::Prepara => Some(Risposta::Prepara),
        Azione::Continua => Some(Risposta::Continua),
        _ => None,
    };
    chiedi_fra(app, Stato { fase: "computer".into(), computer: Some(stato), ..Default::default() }, Risposta::Continua, accetta)
}

/// Dove stanno i video, al primo avvio (`docs/APP.md`): la pagina propone la cartella in Documenti con lo spazio libero e l'avviso di OneDrive, e il creator la tiene, ne sceglie un'altra
/// o prende uno degli altri dischi. Torna la cartella, già preparata e ricordata.
pub fn cartella_del_creator(app: &AppHandle, proposta: Option<PathBuf>, impostazioni: &Path) -> Result<PathBuf, String> {
    let sistema = Sistema::vero(&|nome| std::env::var(nome).ok());
    cartella_pronta(
        proposta,
        &sistema,
        lavoro::scegli_cartella,
        |cartella| lavoro::salva_scelta(impostazioni, cartella),
        |stato| chiedi_cartella(app, stato),
    )
}

/// Mostra la cartella in discussione e aspetta una risposta che la riguarda.
fn chiedi_cartella(app: &AppHandle, stato: StatoCartella) -> Azione {
    let accetta = |azione| matches!(azione, Azione::Cartella(_) | Azione::ScegliCartella | Azione::UsaCartella).then_some(azione);
    chiedi_fra(app, Stato { fase: "cartella".into(), cartella: Some(stato), ..Default::default() }, Azione::Ricontrolla, accetta)
}

/// Il giro della scelta, senza finestra: `dialogo` è il dialogo di sistema, `ricorda` prepara e ricorda la cartella, `chiedi` mostra lo stato e aspetta.
/// Nient'altro tocca il disco finché il creator non dice «Usa questa cartella».
fn cartella_pronta(
    proposta: Option<PathBuf>,
    sistema: &Sistema,
    dialogo: impl Fn() -> anyhow::Result<Option<PathBuf>>,
    ricorda: impl Fn(&Path) -> anyhow::Result<PathBuf>,
    mut chiedi: impl FnMut(StatoCartella) -> Azione,
) -> Result<PathBuf, String> {
    let mut candidata = sistema.prima_proposta(proposta);
    let mut avviso: Option<String> = None;
    loop {
        let stato = StatoCartella { messaggio: avviso.take(), ..sistema.stato_per(candidata.as_deref()) };
        match chiedi(stato) {
            Azione::Cartella(scelta) => candidata = Some(scelta),
            Azione::ScegliCartella => match dialogo() {
                Ok(Some(scelta)) => candidata = Some(scelta),
                Ok(None) => {}
                Err(e) => avviso = Some(format!("{e:#}")),
            },
            Azione::UsaCartella => {
                if let Some(cartella) = &candidata {
                    match ricorda(cartella) {
                        Ok(pronta) => return Ok(pronta),
                        Err(e) => avviso = Some(format!("{e:#}")),
                    }
                }
            }
            _ => {}
        }
    }
}

/// La cartella dei dati, dopo lo spostamento che il creator ha chiesto dallo studio (`sposta.rs`), se l'ha chiesto: copia di tutto con avanzamento, verifica, la nuova cartella ricordata e, solo allora, gli originali tolti.
/// Succede qui, prima del server, perché nessun file sia in uso. Torna la cartella da usare: la nuova a spostamento finito, quella di prima se il creator lo lascia.
pub fn spostamento_del_creator(app: &AppHandle, attuale: PathBuf, impostazioni: &Path) -> Result<PathBuf, String> {
    let Some(destinazione) = lavoro::spostamento_in_attesa(std::env::var(lavoro::VARIABILE).ok().as_deref(), impostazioni) else { return Ok(attuale) };
    let risposte = &app.state::<Interno>().risposte;
    let mut ultimo: Option<Instant> = None;
    spostamento_pronto(
        attuale,
        destinazione,
        impostazioni,
        |da, a, mostra, ricorda| {
            risposte.annulla.store(false, Ordering::SeqCst);
            sposta::sposta(
                da,
                a,
                &risposte.annulla,
                &mut |avanzamento| {
                    // I pezzi arrivano a decine al secondo: la pagina li vede cinque volte al secondo, e sempre il cambio di fase.
                    if ultimo.is_none_or(|t| t.elapsed() > Duration::from_millis(200)) || avanzamento.fase != Fase::Copia {
                        ultimo = Some(Instant::now());
                        mostra(avanzamento);
                    }
                },
                ricorda,
            )
        },
        |stato| imposta_stato(app, Stato { fase: "spostamento".into(), spostamento: Some(stato), ..Default::default() }),
        |stato| chiedi_spostamento(app, stato),
    )
}

/// Mostra come è finito lo spostamento e aspetta: `Ricontrolla` è «Riprova», `Continua` è «Continua».
fn chiedi_spostamento(app: &AppHandle, stato: StatoSpostamento) -> Azione {
    let accetta = |azione| matches!(azione, Azione::Ricontrolla | Azione::Continua).then_some(azione);
    chiedi_fra(app, Stato { fase: "spostamento".into(), spostamento: Some(stato), ..Default::default() }, Azione::Ricontrolla, accetta)
}

/// Il giro dello spostamento, senza finestra: `sposta` lo fa davvero (o finto, in una prova) dicendo l'avanzamento a `mostra`; `chiedi` mostra come è finita e aspetta il creator.
/// La nuova cartella diventa quella ricordata (`ricorda`, che `sposta` chiama a copia verificata) prima che si tolga un originale; se non è andato, o il creator ha annullato, gli originali sono dove erano e il creator sceglie se riprovare o continuare
/// con la cartella di prima (e lo spostamento chiesto si cancella).
fn spostamento_pronto(
    attuale: PathBuf,
    destinazione: PathBuf,
    impostazioni: &Path,
    mut sposta: impl FnMut(&Path, &Path, &mut dyn FnMut(Avanzamento), &mut dyn FnMut() -> Result<(), String>) -> Result<Spostata, Fallita>,
    mostra: impl Fn(StatoSpostamento),
    mut chiedi: impl FnMut(StatoSpostamento) -> Azione,
) -> Result<PathBuf, String> {
    loop {
        mostra(StatoSpostamento::in_corso(Avanzamento::default(), &attuale, &destinazione));
        let mut ricorda = || lavoro::salva_scelta(impostazioni, &destinazione).map(|_| ()).map_err(|e| format!("{e:#}"));
        match sposta(&attuale, &destinazione, &mut |avanzamento| mostra(StatoSpostamento::in_corso(avanzamento, &attuale, &destinazione)), &mut ricorda) {
            Ok(spostata) => {
                if !spostata.rimasti.is_empty() {
                    chiedi(StatoSpostamento::con_avanzi(&spostata, &attuale, &destinazione));
                }
                return Ok(destinazione);
            }
            Err(fallita) => {
                if chiedi(StatoSpostamento::fallito(&fallita, &attuale, &destinazione)) == Azione::Ricontrolla {
                    continue;
                }
                lavoro::annulla_spostamento(impostazioni).map_err(|e| format!("{e:#}"))?;
                return Ok(attuale);
            }
        }
    }
}

/// Il Claude Code del creator, controllato e, se non va, spiegato (`docs/APP.md`): senza Claude Code collegato l'app non serve a niente, e l'avvio non va avanti.
/// Torna il programma da dare alla chat.
pub fn claude_del_creator(app: &AppHandle) -> Result<PathBuf, String> {
    let percorsi = std::env::var_os("PATH").unwrap_or_default();
    let indicato = std::env::var(claude::VARIABILE).ok();
    let casa = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    claude_pronto(
        || claude::trova(indicato.as_deref(), &percorsi, casa.as_deref(), appdata.as_deref()),
        claude::esamina,
        claude::accedi,
        claude::installa,
        |stato| chiedi(app, Stato { fase: "claude".into(), claude: Some(stato), ..Default::default() }),
    )
}

/// Il giro dei controlli, senza finestra: `trova`, `esamina`, `accedi` e `installa` sono quelli veri o quelli finti di una prova, `chiedi` mostra lo stato e aspetta.
fn claude_pronto(
    trova: impl Fn() -> Result<Option<PathBuf>, String>,
    esamina: impl Fn(&Path) -> StatoClaude,
    accedi: impl Fn(&Path) -> Result<(), String>,
    installa: impl Fn() -> Result<(), String>,
    mut chiedi: impl FnMut(StatoClaude) -> Azione,
) -> Result<PathBuf, String> {
    let mut avviso: Option<String> = None;
    let mut dopo_l_installazione = false;
    loop {
        let programma = trova()?;
        let stato = match &programma {
            Some(p) => esamina(p),
            None => StatoClaude::default(),
        };
        if let (true, Some(programma)) = (stato.pronto(), &programma) {
            return Ok(programma.clone());
        }
        // Un accesso o un'installazione che non sono andati a buon fine si dicono sopra lo stato di Claude Code, che nel frattempo si è riletto.
        let provato_a_installare = std::mem::take(&mut dopo_l_installazione);
        let messaggio = avviso.take().or(stato.messaggio).or_else(|| (provato_a_installare && !stato.trovato).then(claude::installazione_non_riuscita));
        let comando = (!stato.trovato).then(|| claude::COMANDO_DI_INSTALLAZIONE.to_owned());
        match chiedi(StatoClaude { messaggio, comando, ..stato }) {
            Azione::Accedi => {
                if let Some(p) = &programma {
                    avviso = accedi(p).err();
                }
            }
            Azione::Installa => {
                avviso = installa().err();
                dopo_l_installazione = true;
            }
            // Gli altri passi dell'avvio non riguardano Claude Code; «Ricontrolla» è proprio il giro che segue.
            _ => {}
        }
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::collections::VecDeque;

    fn programma() -> PathBuf {
        PathBuf::from(r"C:\claude\claude.exe")
    }

    fn pronto() -> StatoClaude {
        StatoClaude { trovato: true, collegato: true, versione: Some("2.1.318".into()), ..Default::default() }
    }

    fn non_collegato() -> StatoClaude {
        StatoClaude { trovato: true, versione: Some("2.1.318".into()), ..Default::default() }
    }

    /// Le risposte del creator in ordine, e gli stati che la pagina ha mostrato.
    struct Prova {
        risposte: RefCell<VecDeque<Azione>>,
        mostrati: RefCell<Vec<StatoClaude>>,
    }

    impl Prova {
        fn nuova(risposte: &[Azione]) -> Self {
            Prova { risposte: RefCell::new(risposte.iter().cloned().collect()), mostrati: RefCell::default() }
        }

        fn chiedi(&self, stato: StatoClaude) -> Azione {
            self.mostrati.borrow_mut().push(stato);
            self.risposte.borrow_mut().pop_front().expect("la pagina ha chiesto una risposta in più")
        }
    }

    fn senza_installare() -> Result<(), String> {
        unreachable!("non c'era niente da installare")
    }

    #[test]
    fn se_claude_code_va_la_pagina_non_si_ferma_a_chiedere() {
        let p = Prova::nuova(&[]);
        let esito = claude_pronto(|| Ok(Some(programma())), |_| pronto(), |_| unreachable!(), senza_installare, |s| p.chiedi(s));
        assert_eq!(esito, Ok(programma()));
        assert!(p.mostrati.borrow().is_empty());
    }

    #[test]
    fn se_manca_la_pagina_offre_l_installazione_con_il_comando_e_dopo_il_ricontrollo_lo_trova() {
        let p = Prova::nuova(&[Azione::Ricontrolla, Azione::Ricontrolla]);
        let giri = Cell::new(0);
        let trova = || {
            giri.set(giri.get() + 1);
            Ok((giri.get() >= 3).then(programma))
        };
        let esito = claude_pronto(trova, |_| pronto(), |_| unreachable!(), senza_installare, |s| p.chiedi(s));
        assert_eq!(esito, Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 2);
        assert!(mostrati.iter().all(|s| !s.trovato && s.percorso.is_none() && s.messaggio.is_none()));
        assert!(mostrati.iter().all(|s| s.comando.as_deref() == Some("irm https://claude.ai/install.ps1 | iex")));
    }

    #[test]
    fn l_installazione_riuscita_porta_dritta_all_accesso_senza_dire_che_e_fallita() {
        let p = Prova::nuova(&[Azione::Installa, Azione::Accedi]);
        let installato = Cell::new(false);
        let acceduto = Cell::new(false);
        let trova = || Ok(installato.get().then(programma));
        let esamina = |_: &Path| if acceduto.get() { pronto() } else { non_collegato() };
        let installa = || {
            installato.set(true);
            Ok(())
        };
        let accedi = |_: &Path| {
            acceduto.set(true);
            Ok(())
        };
        assert_eq!(claude_pronto(trova, esamina, accedi, installa, |s| p.chiedi(s)), Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 2);
        assert!(!mostrati[0].trovato && mostrati[0].comando.is_some());
        assert!(mostrati[1].trovato && !mostrati[1].collegato && mostrati[1].messaggio.is_none() && mostrati[1].comando.is_none());
    }

    #[test]
    fn un_installazione_che_non_porta_claude_code_si_dice_e_si_puo_riprovare() {
        let p = Prova::nuova(&[Azione::Installa, Azione::Installa]);
        let tentativi = Cell::new(0);
        let installa = || {
            tentativi.set(tentativi.get() + 1);
            Ok(())
        };
        let trova = || Ok((tentativi.get() >= 2).then(programma));
        assert_eq!(claude_pronto(trova, |_| pronto(), |_| unreachable!(), installa, |s| p.chiedi(s)), Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 2);
        assert_eq!(mostrati[0].messaggio, None);
        assert_eq!(mostrati[1].messaggio.as_deref(), Some("L'installazione di Claude Code non è andata a buon fine."));
        assert!(mostrati[1].comando.is_some());
    }

    #[test]
    fn un_installatore_che_non_parte_dice_perche_e_il_messaggio_vale_per_un_giro_solo() {
        let p = Prova::nuova(&[Azione::Installa, Azione::Ricontrolla, Azione::Ricontrolla]);
        let installa = || Err("Non riesco ad avviare l'installazione di Claude Code: PowerShell non c'è.".to_owned());
        let giri = Cell::new(0);
        let trova = || {
            giri.set(giri.get() + 1);
            Ok((giri.get() >= 4).then(programma))
        };
        assert_eq!(claude_pronto(trova, |_| pronto(), |_| unreachable!(), installa, |s| p.chiedi(s)), Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati[1].messaggio.as_deref(), Some("Non riesco ad avviare l'installazione di Claude Code: PowerShell non c'è."));
        assert_eq!(mostrati[2].messaggio, None);
    }

    #[test]
    fn se_non_e_collegato_l_accesso_lo_fa_claude_e_poi_si_ricontrolla() {
        let p = Prova::nuova(&[Azione::Accedi]);
        let acceduto = Cell::new(false);
        let esamina = |_: &Path| if acceduto.get() { pronto() } else { non_collegato() };
        let accedi = |_: &Path| {
            acceduto.set(true);
            Ok(())
        };
        let esito = claude_pronto(|| Ok(Some(programma())), esamina, accedi, senza_installare, |s| p.chiedi(s));
        assert_eq!(esito, Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 1);
        assert!(mostrati[0].trovato && !mostrati[0].collegato && mostrati[0].comando.is_none());
    }

    #[test]
    fn un_accesso_che_non_riesce_si_dice_nella_pagina_di_dopo() {
        let p = Prova::nuova(&[Azione::Accedi, Azione::Ricontrolla]);
        let giri = Cell::new(0);
        let esamina = |_: &Path| {
            giri.set(giri.get() + 1);
            if giri.get() >= 3 {
                pronto()
            } else {
                non_collegato()
            }
        };
        let accedi = |_: &Path| Err("L'accesso a Claude Code non è finito entro dieci minuti: riprova.".into());
        let esito = claude_pronto(|| Ok(Some(programma())), esamina, accedi, senza_installare, |s| p.chiedi(s));
        assert_eq!(esito, Ok(programma()));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati[0].messaggio, None);
        assert_eq!(mostrati[1].messaggio.as_deref(), Some("L'accesso a Claude Code non è finito entro dieci minuti: riprova."));
    }

    #[test]
    fn senza_claude_code_non_si_va_avanti_nemmeno_se_la_pagina_lo_chiede() {
        let p = Prova::nuova(&[Azione::Continua, Azione::Continua, Azione::Ricontrolla]);
        let giri = Cell::new(0);
        let trova = || {
            giri.set(giri.get() + 1);
            Ok((giri.get() >= 4).then(programma))
        };
        assert_eq!(claude_pronto(trova, |_| pronto(), |_| unreachable!(), senza_installare, |s| p.chiedi(s)), Ok(programma()));
        assert_eq!(p.mostrati.borrow().len(), 3);
    }

    #[test]
    fn un_claude_code_non_collegato_non_passa_alla_chat() {
        let p = Prova::nuova(&[Azione::Continua, Azione::Accedi]);
        let acceduto = Cell::new(false);
        let esamina = |_: &Path| if acceduto.get() { pronto() } else { non_collegato() };
        let accedi = |_: &Path| {
            acceduto.set(true);
            Ok(())
        };
        assert_eq!(claude_pronto(|| Ok(Some(programma())), esamina, accedi, senza_installare, |s| p.chiedi(s)), Ok(programma()));
        assert_eq!(p.mostrati.borrow().len(), 2);
    }

    #[test]
    fn una_variabile_che_indica_un_programma_che_non_c_e_e_un_errore_e_non_una_pagina_da_aspettare() {
        let p = Prova::nuova(&[]);
        let esito = claude_pronto(|| Err("Il programma indicato non c'è.".into()), |_| unreachable!(), |_| unreachable!(), senza_installare, |s| p.chiedi(s));
        assert_eq!(esito, Err("Il programma indicato non c'è.".into()));
        assert!(p.mostrati.borrow().is_empty());
    }

    fn sistema_vuoto() -> Sistema {
        Sistema { dischi: vec![], casa: None, radici_onedrive: vec![] }
    }

    fn senza_dialogo() -> anyhow::Result<Option<PathBuf>> {
        unreachable!("il dialogo non doveva aprirsi")
    }

    /// Le risposte del creator alla pagina della cartella, in ordine, e gli stati che ha visto.
    struct ProvaCartella {
        risposte: RefCell<VecDeque<Azione>>,
        mostrati: RefCell<Vec<StatoCartella>>,
    }

    impl ProvaCartella {
        fn nuova(risposte: &[Azione]) -> Self {
            ProvaCartella { risposte: RefCell::new(risposte.iter().cloned().collect()), mostrati: RefCell::default() }
        }

        fn chiedi(&self, stato: StatoCartella) -> Azione {
            self.mostrati.borrow_mut().push(stato);
            self.risposte.borrow_mut().pop_front().expect("la pagina ha chiesto una risposta in più")
        }
    }

    #[test]
    fn la_cartella_proposta_si_ricorda_solo_quando_il_creator_la_accetta() {
        let proposta = tempfile::tempdir().unwrap().path().join("Mango Animation");
        let p = ProvaCartella::nuova(&[Azione::Ricontrolla, Azione::UsaCartella]);
        let ricordate = RefCell::new(Vec::new());
        let ricorda = |c: &Path| {
            ricordate.borrow_mut().push(c.to_path_buf());
            Ok(c.to_path_buf())
        };
        let esito = cartella_pronta(Some(proposta.clone()), &sistema_vuoto(), senza_dialogo, ricorda, |s| p.chiedi(s));
        assert_eq!(esito, Ok(proposta.clone()));
        assert_eq!(*ricordate.borrow(), vec![proposta.clone()]);
        assert_eq!(p.mostrati.borrow().len(), 2);
        assert_eq!(p.mostrati.borrow()[0].percorso, Some(proposta.display().to_string()));
        assert!(!proposta.exists());
    }

    #[test]
    fn una_scelta_rapida_o_il_dialogo_cambiano_la_cartella_e_un_dialogo_annullato_non_cambia_niente() {
        let proposta = PathBuf::from(r"C:\Users\Alice\Documents\Mango Animation");
        let disco = PathBuf::from(r"D:\Mango Animation");
        let dialogata = PathBuf::from(r"E:\Video");
        let p = ProvaCartella::nuova(&[Azione::Cartella(disco.clone()), Azione::ScegliCartella, Azione::ScegliCartella, Azione::UsaCartella]);
        let risposte_del_dialogo = RefCell::new(VecDeque::from([Ok(None), Ok(Some(dialogata.clone()))]));
        let dialogo = || risposte_del_dialogo.borrow_mut().pop_front().unwrap();
        let ricordate = RefCell::new(Vec::new());
        let ricorda = |c: &Path| {
            ricordate.borrow_mut().push(c.to_path_buf());
            Ok(c.to_path_buf())
        };
        let esito = cartella_pronta(Some(proposta.clone()), &sistema_vuoto(), dialogo, ricorda, |s| p.chiedi(s));
        assert_eq!(esito, Ok(dialogata.clone()));
        let visti: Vec<_> = p.mostrati.borrow().iter().map(|s| s.percorso.clone().unwrap()).collect();
        assert_eq!(visti, vec![proposta.display().to_string(), disco.display().to_string(), disco.display().to_string(), dialogata.display().to_string()]);
        assert_eq!(*ricordate.borrow(), vec![dialogata]);
    }

    #[test]
    fn se_la_cartella_non_si_prepara_la_pagina_lo_dice_e_la_scelta_resta() {
        let proposta = PathBuf::from(r"Q:\non\c'è");
        let p = ProvaCartella::nuova(&[Azione::UsaCartella, Azione::UsaCartella]);
        let tentativi = Cell::new(0);
        let ricorda = |c: &Path| {
            tentativi.set(tentativi.get() + 1);
            if tentativi.get() == 1 {
                Err(anyhow::anyhow!("non riesco a preparare l'archivio in {}", c.display()))
            } else {
                Ok(c.to_path_buf())
            }
        };
        assert_eq!(cartella_pronta(Some(proposta.clone()), &sistema_vuoto(), senza_dialogo, ricorda, |s| p.chiedi(s)), Ok(proposta));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati[0].messaggio, None);
        assert!(mostrati[1].messaggio.as_deref().unwrap().starts_with("non riesco a preparare l'archivio"), "{:?}", mostrati[1].messaggio);
    }

    #[test]
    fn senza_cartella_proposta_non_si_va_avanti_finche_il_creator_non_ne_sceglie_una() {
        let scelta = PathBuf::from(r"D:\Video");
        let p = ProvaCartella::nuova(&[Azione::UsaCartella, Azione::ScegliCartella, Azione::UsaCartella]);
        let dialogo = || Ok(Some(PathBuf::from(r"D:\Video")));
        let ricorda = |c: &Path| Ok(c.to_path_buf());
        assert_eq!(cartella_pronta(None, &sistema_vuoto(), dialogo, ricorda, |s| p.chiedi(s)), Ok(scelta));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 3);
        assert!(mostrati[0].percorso.is_none() && mostrati[1].percorso.is_none() && mostrati[2].percorso.is_some());
    }

    #[test]
    fn la_cartella_scelta_si_prepara_davvero_e_dal_riavvio_vale_senza_chiedere() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let scelta = tempfile::tempdir().unwrap().path().join("Video di Alice");
        let lavoro::Esito::DaScegliere(proposta) = lavoro::trova_lavoro(None, impostazioni.path(), Some(documenti.path())) else { panic!("al primo avvio la sceglie il creator") };
        let p = ProvaCartella::nuova(&[Azione::Cartella(scelta.clone()), Azione::UsaCartella]);
        let pronta = cartella_pronta(proposta, &sistema_vuoto(), senza_dialogo, |c| lavoro::salva_scelta(impostazioni.path(), c), |s| p.chiedi(s)).unwrap();
        assert_eq!(pronta, scelta);
        assert!(scelta.join("archivio").is_dir() && !documenti.path().join("Mango Animation").exists());
        assert_eq!(lavoro::trova_lavoro(None, impostazioni.path(), Some(documenti.path())), lavoro::Esito::Pronta(scelta));
    }

    /// Uno spostamento finto: dà gli avanzamenti e gli esiti in ordine, e ricorda tra cosa e cosa è stato chiesto.
    struct SpostamentoFinto {
        esiti: RefCell<VecDeque<Result<Spostata, Fallita>>>,
        chiamate: RefCell<Vec<(PathBuf, PathBuf)>>,
    }

    impl SpostamentoFinto {
        fn nuovo(esiti: Vec<Result<Spostata, Fallita>>) -> Self {
            SpostamentoFinto { esiti: RefCell::new(esiti.into()), chiamate: RefCell::default() }
        }

        fn sposta(&self, da: &Path, a: &Path, mostra: &mut dyn FnMut(Avanzamento), ricorda: &mut dyn FnMut() -> Result<(), String>) -> Result<Spostata, Fallita> {
            self.chiamate.borrow_mut().push((da.to_path_buf(), a.to_path_buf()));
            mostra(Avanzamento { fatti_byte: 3 << 20, totale_byte: 10 << 20, file_fatti: 1, file_totali: 4, ..Default::default() });
            let esito = self.esiti.borrow_mut().pop_front().expect("lo spostamento è stato chiesto una volta in più");
            if esito.is_ok() {
                ricorda().map_err(Fallita::Errore)?;
            }
            esito
        }
    }

    fn cartelle_di_prova() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let impostazioni = tempfile::tempdir().unwrap();
        let attuale = tempfile::tempdir().unwrap().keep();
        let destinazione = tempfile::tempdir().unwrap().keep().join("Video");
        lavoro::salva_scelta(impostazioni.path(), &attuale).unwrap();
        lavoro::programma_spostamento(impostazioni.path(), &destinazione).unwrap();
        (impostazioni, attuale, destinazione)
    }

    #[test]
    fn lo_spostamento_riuscito_ricorda_la_cartella_nuova_e_mostra_l_avanzamento() {
        let (impostazioni, attuale, destinazione) = cartelle_di_prova();
        let f = SpostamentoFinto::nuovo(vec![Ok(Spostata { rimasti: vec![] })]);
        let mostrati = RefCell::new(Vec::new());
        let pronta = spostamento_pronto(attuale.clone(), destinazione.clone(), impostazioni.path(), |d, a, m, r| f.sposta(d, a, m, r), |s| mostrati.borrow_mut().push(s), |_| unreachable!("non c'era niente da chiedere")).unwrap();
        assert_eq!(pronta, destinazione);
        assert_eq!(lavoro::trova_lavoro(None, impostazioni.path(), None), lavoro::Esito::Pronta(destinazione.clone()));
        assert_eq!(lavoro::spostamento_in_attesa(None, impostazioni.path()), None);
        let m = mostrati.borrow();
        assert_eq!((m[0].fase.as_str(), m[0].fatti_mb), ("copia", 0));
        assert_eq!((m[1].fatti_mb, m[1].totale_mb, m[1].file_fatti, m[1].file_totali), (3, 10, 1, 4));
        assert_eq!((m[1].da.as_str(), m[1].a.as_str()), (attuale.to_str().unwrap(), destinazione.to_str().unwrap()));
    }

    #[test]
    fn se_non_e_andato_la_pagina_lo_dice_e_riprovando_si_rifa_lo_stesso_spostamento() {
        let (impostazioni, attuale, destinazione) = cartelle_di_prova();
        let f = SpostamentoFinto::nuovo(vec![Err(Fallita::Errore("Non riesco a copiare ripresa.mp4: il disco è pieno.".into())), Ok(Spostata { rimasti: vec![] })]);
        let chiesti = RefCell::new(Vec::new());
        let pronta = spostamento_pronto(attuale.clone(), destinazione.clone(), impostazioni.path(), |d, a, m, r| f.sposta(d, a, m, r), |_| {}, |s| {
            chiesti.borrow_mut().push(s);
            Azione::Ricontrolla
        })
        .unwrap();
        assert_eq!(pronta, destinazione);
        assert_eq!(chiesti.borrow().len(), 1);
        assert_eq!((chiesti.borrow()[0].fase.as_str(), chiesti.borrow()[0].messaggio.as_deref()), ("errore", Some("Non riesco a copiare ripresa.mp4: il disco è pieno.")));
        assert_eq!(f.chiamate.borrow().len(), 2);
    }

    #[test]
    fn continuare_con_la_cartella_di_prima_cancella_lo_spostamento_chiesto() {
        let (impostazioni, attuale, destinazione) = cartelle_di_prova();
        let f = SpostamentoFinto::nuovo(vec![Err(Fallita::Annullata)]);
        let chiesti = RefCell::new(Vec::new());
        let pronta = spostamento_pronto(attuale.clone(), destinazione, impostazioni.path(), |d, a, m, r| f.sposta(d, a, m, r), |_| {}, |s| {
            chiesti.borrow_mut().push(s.fase);
            Azione::Continua
        })
        .unwrap();
        assert_eq!(pronta, attuale);
        assert_eq!(*chiesti.borrow(), vec!["annullato".to_owned()]);
        assert_eq!(lavoro::spostamento_in_attesa(None, impostazioni.path()), None);
        assert_eq!(lavoro::trova_lavoro(None, impostazioni.path(), None), lavoro::Esito::Pronta(attuale));
    }

    #[test]
    fn gli_originali_che_non_si_sono_tolti_si_dicono_ma_la_cartella_nuova_vale() {
        let (impostazioni, attuale, destinazione) = cartelle_di_prova();
        let rimasti: Vec<PathBuf> = (1..=7).map(|n| attuale.join(format!("ripresa-{n}.mp4"))).collect();
        let f = SpostamentoFinto::nuovo(vec![Ok(Spostata { rimasti })]);
        let chiesti = RefCell::new(Vec::new());
        let pronta = spostamento_pronto(attuale, destinazione.clone(), impostazioni.path(), |d, a, m, r| f.sposta(d, a, m, r), |_| {}, |s| {
            chiesti.borrow_mut().push(s);
            Azione::Continua
        })
        .unwrap();
        assert_eq!(pronta, destinazione);
        let c = chiesti.borrow();
        assert_eq!((c[0].fase.as_str(), c[0].rimasti, c[0].primi_rimasti.len()), ("avanzi", 7, 5));
        assert_eq!(lavoro::trova_lavoro(None, impostazioni.path(), None), lavoro::Esito::Pronta(destinazione));
    }

    #[test]
    fn un_blocco_fra_la_copia_e_la_rimozione_degli_originali_lascia_la_cartella_nuova_ricordata_e_tutti_i_video_al_loro_posto() {
        let (impostazioni, attuale, destinazione) = cartelle_di_prova();
        std::fs::write(attuale.join("archivio").join("ripresa.mp4"), vec![9u8; 3 << 20]).unwrap();
        std::fs::write(attuale.join("profilo.json"), b"{}").unwrap();
        // Il programma si ferma appena comincia a togliere gli originali: il panico fa da interruzione, e nessuna riga dopo di lui gira.
        let interrotto = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = spostamento_pronto(
                attuale.clone(),
                destinazione.clone(),
                impostazioni.path(),
                |da, a, mostra, ricorda| {
                    sposta::sposta(da, a, &AtomicBool::new(false), &mut |avanzamento| {
                        mostra(avanzamento);
                        if avanzamento.fase == Fase::Rimozione {
                            panic!("interruzione");
                        }
                    }, ricorda)
                },
                |_| {},
                |_| unreachable!(),
            );
        }));
        assert!(interrotto.is_err());
        // Al riavvio: la cartella ricordata è la nuova, non resta niente da spostare, e la nuova ha i video (gli originali non sono stati toccati).
        assert_eq!(lavoro::trova_lavoro(None, impostazioni.path(), None), lavoro::Esito::Pronta(destinazione.clone()));
        assert_eq!(lavoro::spostamento_in_attesa(None, impostazioni.path()), None);
        assert_eq!(std::fs::read(destinazione.join("archivio").join("ripresa.mp4")).unwrap().len(), 3 << 20);
        assert!(destinazione.join("profilo.json").is_file() && attuale.join("archivio").join("ripresa.mp4").is_file());
    }

    #[test]
    fn la_risposta_che_nessuno_aspetta_si_perde_e_quella_attesa_arriva() {
        let risposte = Risposte::default();
        risposte.invia(Azione::Accedi);
        let ricevitore = risposte.apri();
        risposte.invia(Azione::Ricontrolla);
        assert_eq!(ricevitore.try_recv(), Ok(Azione::Ricontrolla));
        risposte.chiudi();
        risposte.invia(Azione::Accedi);
        assert!(ricevitore.try_recv().is_err());
    }
}
