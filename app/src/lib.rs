//! Mango Animation: la finestra con lo studio a tutta pagina.
//!
//! All'avvio la finestra mostra una pagina d'attesa (`ui/`) mentre controlla, e se serve accende, il
//! server; appena risponde la finestra naviga sullo studio (`http://127.0.0.1:<porta>/`), la pagina vera,
//! non un riquadro. Il server avviato da questa app, e tutto ciò che lui avvia, muore con l'app.

pub mod aggiornamento;
mod appunti;
mod cartella;
mod claude;
mod codice;
mod computer;
mod dati;
mod istanza;
mod lavoro;
mod lingua;
mod mangocode;
mod preparazione;
mod radice;
mod segnalazione;
mod server;
mod sposta;
mod supervisor;
mod titolo;
mod trascinamento;
mod voce;
mod zoom;

use anyhow::{anyhow, bail, Result};
use lingua::t;
use lavoro::{cartella_predefinita, salva_scelta, scegli_cartella, trova_lavoro, Esito};
use radice::trova_radice;
use serde::Serialize;
use server::{aspetta_pronto, comando_server, decidi, indirizzo_dello_studio, porta_da, sorveglia, Decisione, Evento};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use supervisor::{Giobbe, Supervisore};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Quanto aspettare il server che l'app accende, prima di dire che non parte.
const ATTESA_SERVER: Duration = Duration::from_secs(90);

/// Un server riaccesso che si ferma di nuovo prima di tanto non si riaccende ancora: la pagina d'errore.
const FINESTRA_RIACCENSIONE: Duration = Duration::from_secs(60);

/// Il giobbe sta aperto finché vive l'app: chiuso lui, Windows ferma ogni processo che l'app ha avviato.
static GIOBBE: OnceLock<Giobbe> = OnceLock::new();

#[derive(Clone, Serialize, Default)]
struct Stato {
    /// "attesa", "mancante" (la cartella dei dati ricordata non c'è più), "claude" (Claude Code manca o non è collegato), "cartella" (primo avvio: dove tenere i video), "spostamento" (la cartella dei dati si sposta in un'altra), "computer" (manca qualcosa da scaricare per le funzioni accese), "aggiornamento" (c'è una versione nuova) o "errore"
    fase: String,
    /// Un errore sulla radice non si riprova (serve riavviare l'app con `MANGO_ANIMATION_RADICE`): niente bottone.
    radice: bool,
    /// L'errore riguarda la cartella dei dati, non il codice.
    lavoro: bool,
    /// Dove si può ricreare la cartella dei dati (dentro Documenti), se Documenti si trova.
    predefinita: Option<String>,
    /// Il server l'aveva acceso l'app e si è fermato: la pagina lo dice, invece di dire che non parte.
    fermato: bool,
    secondi: u64,
    messaggio: String,
    log: Option<String>,
    /// Con "claude": com'è messo Claude Code, per la pagina che guida il creator.
    claude: Option<claude::StatoClaude>,
    /// Con "spostamento": come va la copia della cartella dei dati nella nuova, o come è finita.
    spostamento: Option<sposta::StatoSpostamento>,
    /// Con "cartella": la cartella proposta per i video, lo spazio libero, l'avviso di OneDrive e le altre scelte.
    cartella: Option<cartella::StatoCartella>,
    /// Con "computer": cosa c'è, cosa manca e cosa si scarica, per la pagina che prepara il computer.
    computer: Option<computer::StatoComputer>,
    /// Con "aggiornamento": c'è una versione nuova da installare.
    aggiornamento: Option<aggiornamento::StatoAggiornamento>,
    /// La lingua delle frasi di questo stato e di quelle fisse della pagina: `it` o `en` (`lingua.rs`).
    lingua: String,
}

fn attesa(secondi: u64, messaggio: impl Into<String>) -> Stato {
    Stato { fase: "attesa".into(), secondi, messaggio: messaggio.into(), ..Default::default() }
}

fn nella_lingua_in_uso(stato: Stato) -> Stato {
    Stato { lingua: lingua::corrente().codice().into(), ..stato }
}

struct Interno {
    radice: std::result::Result<PathBuf, String>,
    /// Dove l'app ricorda la cartella di lavoro scelta.
    impostazioni: PathBuf,
    documenti: Option<PathBuf>,
    lavoro: Mutex<Esito>,
    scegliendo: AtomicBool,
    sup: Supervisore,
    stato: Mutex<Stato>,
    /// Le risposte del creator ai passi dell'avvio che lo aspettano.
    risposte: preparazione::Risposte,
    in_avvio: AtomicBool,
    main: OnceLock<WebviewWindow>,
    /// La pagina dell'app (attesa ed errori), dove la finestra torna quando lo studio non c'è.
    pagina: OnceLock<Url>,
}

fn imposta_stato(app: &AppHandle, nuovo: Stato) {
    let nuovo = nella_lingua_in_uso(nuovo);
    *app.state::<Interno>().stato.lock().unwrap() = nuovo.clone();
    let _ = app.emit("mango://stato", nuovo);
}

/// Accende il server se serve e, appena risponde, porta la finestra sullo studio. In background: la
/// pagina d'attesa resta reattiva mentre aspetta.
fn avvia_studio(app: AppHandle) {
    let stato = app.state::<Interno>();
    if stato.in_avvio.swap(true, Ordering::SeqCst) {
        return;
    }
    let esito = (|| -> Result<Option<String>> {
        let radice = stato.radice.clone().map_err(|e| anyhow!(e))?;
        // Il primo avvio non ha ancora una cartella dei dati: la sceglie il creator, dopo Claude Code e prima del computer pronto.
        let (ricordata, proposta) = match stato.lavoro.lock().unwrap().clone() {
            Esito::Pronta(cartella) => (Some(cartella), None),
            Esito::DaScegliere(proposta) => (None, proposta),
            Esito::Mancante(motivo) => {
                imposta_stato(&app, lavoro_mancante(motivo, stato.documenti.as_deref()));
                return Ok(None);
            }
            Esito::Errore(messaggio) => bail!(messaggio),
        };
        let porta = porta_da(std::env::var("MANGO_ANIMATION_PORTA").ok().as_deref())?;
        if let Some(lavoro) = &ricordata {
            imposta_stato(&app, attesa(0, t("Controllo se il server è già acceso", "Checking whether the server is already running")));
            if decidi(porta, lavoro) == Decisione::GiaAcceso {
                return Ok(Some(indirizzo_dello_studio(porta, lavoro)));
            }
        }
        preparazione::codice_in_ordine(&app, &radice);
        preparazione::aggiornamento_del_prodotto(&app, &radice);
        imposta_stato(&app, attesa(0, t("Controllo Claude Code", "Checking Claude Code")));
        let claude = preparazione::claude_del_creator(&app).map_err(|e| anyhow!(e))?;
        let lavoro = match ricordata {
            Some(cartella) => {
                let lavoro = preparazione::spostamento_del_creator(&app, cartella.clone(), &stato.impostazioni).map_err(|e| anyhow!(e))?;
                if lavoro != cartella {
                    *stato.lavoro.lock().unwrap() = Esito::Pronta(lavoro.clone());
                    app.state::<voce::Voce>().usa_lavoro(&lavoro);
                }
                lavoro
            }
            None => {
                let cartella = preparazione::cartella_del_creator(&app, proposta, &stato.impostazioni).map_err(|e| anyhow!(e))?;
                *stato.lavoro.lock().unwrap() = Esito::Pronta(cartella.clone());
                app.state::<voce::Voce>().usa_lavoro(&cartella);
                cartella
            }
        };
        imposta_stato(&app, attesa(0, t("Controllo il computer", "Checking the computer")));
        let preparato = preparazione::computer_del_creator(&app, &radice, &lavoro).map_err(|e| anyhow!(e))?;
        if let Some(python) = &preparato.python {
            app.state::<voce::Voce>().usa_python(python);
        }
        let percorsi = preparato.ambiente.iter().find(|(k, _)| k == "PATH").map(|(_, v)| v.clone()).unwrap_or_default();
        let ambiente = std::iter::once((claude::VARIABILE.into(), claude.into_os_string())).chain(preparato.ambiente).collect();
        let bun = risolvi_bun(&percorsi)
            .ok_or_else(|| {
                anyhow!(t(
                    "Non trovo Bun sul computer, e senza Bun il server non si accende. Si installa da bun.sh; poi si riapre l'app.",
                    "I can't find Bun on this computer, and the server can't start without it. Install it from bun.sh, then reopen the app."
                ))
            })?;
        let comando = comando_server(bun, &radice, &lavoro, std::process::id(), ambiente);
        stato.sup.avvia(&comando)?;
        imposta_stato(&app, attesa(0, t("Accendo il server", "Starting the server")));
        aspetta_pronto(&stato.sup, "server", porta, &lavoro, ATTESA_SERVER, |secondi| imposta_stato(&app, attesa(secondi, t("Accendo il server", "Starting the server"))))?;
        sorveglia_il_server(app.clone(), comando, porta, lavoro.clone());
        Ok(Some(indirizzo_dello_studio(porta, &lavoro)))
    })();
    match esito {
        Ok(None) => {}
        Ok(Some(url)) => {
            if let Some(finestra) = stato.main.get() {
                if let Ok(url) = Url::parse(&url) {
                    let _ = finestra.navigate(url);
                }
            }
        }
        Err(e) if matches!(*stato.lavoro.lock().unwrap(), Esito::Errore(_)) => {
            imposta_stato(&app, Stato { fase: "errore".into(), radice: true, lavoro: true, messaggio: format!("{e:#}"), ..Default::default() })
        }
        Err(e) => imposta_stato(
            &app,
            Stato { fase: "errore".into(), messaggio: format!("{e:#}"), log: Some(stato.sup.log("server").display().to_string()), ..Default::default() },
        ),
    }
    stato.in_avvio.store(false, Ordering::SeqCst);
}

/// Il server che l'app ha acceso può morire a finestra aperta: lo riaccende e ricarica lo studio; se ricade subito mostra la pagina d'errore col log.
fn sorveglia_il_server(app: AppHandle, comando: supervisor::Comando, porta: u16, lavoro: PathBuf) {
    std::thread::spawn(move || {
        let stato = app.state::<Interno>();
        sorveglia(&stato.sup, &comando, porta, &lavoro, FINESTRA_RIACCENSIONE, ATTESA_SERVER, |evento| match evento {
            Evento::Caduto(_) => {
                imposta_stato(&app, attesa(0, t("Il server si è fermato: lo riaccendo", "The server has stopped: starting it again")));
                vai(&app, stato.pagina.get());
            }
            Evento::Riacceso => vai(&app, Url::parse(&indirizzo_dello_studio(porta, &lavoro)).ok().as_ref()),
            Evento::Arreso(messaggio) => {
                imposta_stato(&app, Stato { fase: "errore".into(), fermato: true, messaggio, log: Some(stato.sup.log("server").display().to_string()), ..Default::default() });
                vai(&app, stato.pagina.get());
            }
        });
    });
}

fn vai(app: &AppHandle, url: Option<&Url>) {
    if let (Some(finestra), Some(url)) = (app.state::<Interno>().main.get(), url) {
        let _ = finestra.navigate(url.clone());
    }
}

fn lavoro_mancante(motivo: String, documenti: Option<&Path>) -> Stato {
    let predefinita = documenti.map(|d| cartella_predefinita(d).display().to_string());
    Stato { fase: "mancante".into(), lavoro: true, messaggio: motivo, predefinita, ..Default::default() }
}

fn avvia_thread_studio(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || avvia_studio(app));
}

/// `bun`, cercato nel PATH come lo cerca Windows: con `.exe` direttamente, con `.cmd` o `.bat` passando da `cmd /c`.
fn risolvi_bun(percorsi: &std::ffi::OsStr) -> Option<(PathBuf, Vec<std::ffi::OsString>)> {
    for cartella in std::env::split_paths(percorsi) {
        for estensione in ["exe", "cmd", "bat"] {
            let candidato = cartella.join(format!("bun.{estensione}"));
            if !candidato.is_file() {
                continue;
            }
            return Some(if estensione == "exe" {
                (candidato, Vec::new())
            } else {
                (PathBuf::from("cmd"), vec!["/c".into(), candidato.into_os_string()])
            });
        }
    }
    None
}

#[tauri::command]
fn stato_app(stato: State<'_, Interno>) -> Stato {
    nella_lingua_in_uso(stato.stato.lock().unwrap().clone())
}

/// Dalla pagina «la cartella non c'è più»: apre il dialogo di sistema; scelta una cartella, la ricorda e accende lo studio.
#[tauri::command]
fn scegli_lavoro(app: AppHandle, stato: State<'_, Interno>) {
    if stato.scegliendo.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let stato = app.state::<Interno>();
        let esito = scegli_cartella().and_then(|scelta| scelta.map(|c| salva_scelta(&stato.impostazioni, &c)).transpose());
        stato.scegliendo.store(false, Ordering::SeqCst);
        match esito {
            Ok(Some(cartella)) => {
                *stato.lavoro.lock().unwrap() = Esito::Pronta(cartella);
                avvia_studio(app.clone());
            }
            Ok(None) => {}
            Err(e) => imposta_stato(&app, lavoro_mancante(format!("{e:#}"), stato.documenti.as_deref())),
        }
    });
}

/// Dalla pagina «la cartella non c'è più»: ricrea la cartella predefinita dentro Documenti, la ricorda e accende lo studio.
#[tauri::command]
fn ricrea_lavoro(app: AppHandle, stato: State<'_, Interno>) {
    let Some(documenti) = stato.documenti.clone() else { return };
    std::thread::spawn(move || {
        let stato = app.state::<Interno>();
        match salva_scelta(&stato.impostazioni, &cartella_predefinita(&documenti)) {
            Ok(cartella) => {
                *stato.lavoro.lock().unwrap() = Esito::Pronta(cartella);
                avvia_studio(app.clone());
            }
            Err(e) => imposta_stato(&app, lavoro_mancante(format!("{e:#}"), Some(&documenti))),
        }
    });
}

/// Dalla pagina d'attesa: la risposta del creator a un passo dell'avvio che lo aspetta.
#[tauri::command]
fn azione(stato: State<'_, Interno>, azione: preparazione::Azione) {
    stato.risposte.invia(azione);
}

#[tauri::command]
fn riprova(app: AppHandle, stato: State<'_, Interno>) {
    if stato.in_avvio.load(Ordering::SeqCst) {
        return;
    }
    stato.sup.ferma_tutto();
    avvia_thread_studio(&app);
}

/// Una pagina interna dell'app: la pagina d'attesa (locale) o lo studio (il server, su 127.0.0.1).
fn e_interna(url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" => matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "tauri.localhost")),
        _ => false,
    }
}

/// La prima volta che la finestra è sulla pagina dell'app (host `tauri.localhost`) ne ricorda l'indirizzo, per tornarci quando il server cade.
fn ricorda_pagina(app: &AppHandle, url: &Url) {
    if url.host_str() == Some("tauri.localhost") {
        if let Some(stato) = app.try_state::<Interno>() {
            let _ = stato.pagina.set(url.clone());
        }
    }
}

fn apri_nel_browser(url: &str) {
    if let Ok(parsed) = Url::parse(url) {
        if matches!(parsed.scheme(), "http" | "https" | "mailto") {
            if let Err(e) = supervisor::apri_fuori_dal_giobbe(parsed.as_str()) {
                eprintln!("link non aperto ({url}): {e}");
            }
            return;
        }
    }
    eprintln!("link non aperto (schema non ammesso): {url}");
}

fn prepara(app: &tauri::App) -> Result<()> {
    let impostazioni = app.path().app_config_dir()?;
    lingua::all_avvio(&impostazioni);
    let giobbe = Giobbe::nuovo()?;
    giobbe.assegna_questo_processo()?;
    let _ = GIOBBE.set(giobbe);
    titolo::installa(app)?;
    dati::installa(app)?;
    appunti::installa(app)?;
    computer::ponte::installa(app)?;
    lingua::installa(app)?;
    segnalazione::installa(app)?;
    zoom::installa(app)?;

    let log = app.path().app_log_dir()?;
    let partenza = std::env::current_exe()?.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let radice = trova_radice(&partenza, std::env::var("MANGO_ANIMATION_RADICE").ok().as_deref()).map_err(|e| format!("{e:#}"));
    let documenti = app.path().document_dir().ok();
    let lavoro = trova_lavoro(std::env::var(lavoro::VARIABILE).ok().as_deref(), &impostazioni, documenti.as_deref());
    voce::installa(app, if let Esito::Pronta(cartella) = &lavoro { Some(cartella.as_path()) } else { None })?;
    let radice_ok = radice.is_ok();
    app.manage(Interno {
        radice,
        impostazioni,
        documenti,
        lavoro: Mutex::new(lavoro),
        scegliendo: AtomicBool::new(false),
        sup: Supervisore::nuovo(&log),
        stato: Mutex::new(attesa(0, t("Preparazione", "Getting ready"))),
        risposte: preparazione::Risposte::default(),
        in_avvio: AtomicBool::new(false),
        main: OnceLock::new(),
        pagina: OnceLock::new(),
    });
    istanza::registra(&app.path().app_local_data_dir()?, &istanza::Istanza::questa()?)?;

    let per_i_link_nav = app.handle().clone();
    let finestra = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Mango Animation")
        .inner_size(1500.0, 950.0)
        .min_inner_size(900.0, 560.0)
        .center()
        // Ctrl+ / Ctrl- / Ctrl+0 e Ctrl con la rotellina: lo zoom del browser, che `zoom.rs` ricorda.
        .zoom_hotkeys_enabled(true)
        .initialization_script(titolo::SINCRONIA)
        .initialization_script(zoom::SINCRONIA)
        .initialization_script(voce::PONTE)
        .initialization_script(dati::PONTE)
        .initialization_script(appunti::PONTE)
        .initialization_script(computer::ponte::PONTE)
        .initialization_script(lingua::PONTE)
        .initialization_script(trascinamento::PONTE)
        // Ultimo: misura le chiamate dei ponti definiti prima.
        .initialization_script(segnalazione::PONTE)
        // target=_blank e window.open: mai una seconda finestra dell'app, sempre il browser di sistema.
        .on_new_window(|url, _| {
            apri_nel_browser(url.as_str());
            NewWindowResponse::Deny
        })
        // un link che porterebbe la finestra fuori dall'app (pagina d'attesa o studio) va al browser.
        .on_navigation(move |url| {
            ricorda_pagina(&per_i_link_nav, url);
            if e_interna(url) {
                return true;
            }
            apri_nel_browser(url.as_str());
            false
        })
        .build()?;
    trascinamento::installa(&finestra);
    zoom::ripristina(&finestra);
    if let Ok(url) = finestra.url() {
        ricorda_pagina(app.handle(), &url);
    }
    let _ = app.state::<Interno>().main.set(finestra);

    if radice_ok {
        avvia_thread_studio(app.handle());
    } else {
        imposta_stato(
            app.handle(),
            Stato { fase: "errore".into(), radice: true, messaggio: app.state::<Interno>().radice.clone().unwrap_err(), ..Default::default() },
        );
    }
    Ok(())
}

pub fn avvia() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(finestra) = app.get_webview_window("main") {
                let _ = finestra.unminimize();
                let _ = finestra.show();
                let _ = finestra.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![stato_app, azione, riprova, scegli_lavoro, ricrea_lavoro])
        .setup(|app| prepara(app).map_err(Into::into))
        .build(tauri::generate_context!())
        .expect("l'app non riesce ad avviarsi");
    app.run(|app, evento| {
        if let RunEvent::Exit = evento {
            if let Some(stato) = app.try_state::<Interno>() {
                stato.sup.ferma_tutto();
            }
            if let Ok(dati) = app.path().app_local_data_dir() {
                istanza::togli(&dati, std::process::id());
            }
        }
    });
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn ogni_stato_dice_alla_pagina_in_che_lingua_sono_le_sue_frasi() {
        let json = |s: Stato| serde_json::to_value(nella_lingua_in_uso(s)).unwrap();
        assert_eq!(json(attesa(0, "x"))["lingua"], "it");
        lingua::con(lingua::Lingua::En, || assert_eq!(json(attesa(0, "x"))["lingua"], "en"));
    }

    #[test]
    fn la_pagina_sa_se_il_server_era_partito_e_si_e_fermato() {
        let caduto = Stato { fase: "errore".into(), fermato: true, ..Default::default() };
        assert_eq!(serde_json::to_value(caduto).unwrap()["fermato"], true);
        assert_eq!(serde_json::to_value(Stato::default()).unwrap()["fermato"], false);
    }
}
