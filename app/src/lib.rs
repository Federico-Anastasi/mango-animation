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
mod percorsi;
mod preparazione;
mod radice;
mod rete;
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
use server::{aspetta_pronto, comando_server, decidi, indirizzo_dello_studio, porta_da, porta_per_il_server, sorveglia, Decisione, Evento};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
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
    /// La porta in cui lo studio risponde, 0 finché l'app non la sa: solo lì la finestra può navigare e la pagina ha i permessi dell'app.
    porta: AtomicU16,
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
        let indicata = std::env::var("MANGO_ANIMATION_PORTA").ok();
        let mut porta = porta_da(indicata.as_deref())?;
        if let Some(lavoro) = &ricordata {
            imposta_stato(&app, attesa(0, t("Controllo se il server è già acceso", "Checking whether the server is already running")));
            if decidi(porta, lavoro) == Decisione::GiaAcceso {
                usa_porta(&app, porta)?;
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
        porta = porta_per_il_server(porta, indicata.is_some_and(|v| !v.is_empty()));
        let comando = comando_server(bun, &radice, &lavoro, std::process::id(), porta, ambiente);
        stato.sup.avvia(&comando)?;
        imposta_stato(&app, attesa(0, t("Accendo il server", "Starting the server")));
        aspetta_pronto(&stato.sup, "server", porta, &lavoro, ATTESA_SERVER, |secondi| imposta_stato(&app, attesa(secondi, t("Accendo il server", "Starting the server"))))?;
        usa_porta(&app, porta)?;
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
            // Il registro del server c'è solo se il server è partito: un errore dei passi prima (profilo, Bun, porta) non ha niente da cercarci.
            Stato { fase: "errore".into(), messaggio: format!("{e:#}"), log: stato.sup.pid("server").map(|_| stato.sup.log("server").display().to_string()), ..Default::default() },
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

/// Una pagina dell'app: la pagina locale (`tauri.localhost`) o lo studio, sulla sua porta e solo alla radice (o a `/entra`, che mette il cookie). Su ogni altro indirizzo
/// la finestra non naviga: sostituirebbe l'interfaccia con una pagina che non ha modo di tornare indietro.
fn e_pagina_dell_app(url: &Url, porta_studio: Option<u16>) -> bool {
    match (url.scheme(), url.host_str()) {
        ("http" | "https", Some("tauri.localhost")) => true,
        ("http", Some("127.0.0.1")) => porta_studio.is_some() && url.port() == porta_studio && matches!(url.path(), "/" | "/entra"),
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

/// Il percorso del computer che un indirizzo indica: `file:///C:/…`, o lo studio con un percorso in fondo (`http://127.0.0.1:<porta>/C:/…`, il link di una chat a una cartella).
fn percorso_locale(url: &Url) -> Option<PathBuf> {
    match url.scheme() {
        "file" => url.to_file_path().ok(),
        _ => Url::parse(&format!("file://{}", url.path())).ok()?.to_file_path().ok(),
    }
}

/// Ciò che la finestra non mostra si apre fuori: il web nel browser di sistema, una cartella in Esplora file. Un file non si apre mai (potrebbe essere un programma).
/// Ciò che non si può aprire lo dice a chi ha premuto, e va in `ui.log`.
fn apri_fuori(app: &AppHandle, url: &Url, porta_studio: Option<u16>) {
    let dello_studio = url.host_str() == Some("127.0.0.1") && porta_studio.is_some() && url.port() == porta_studio;
    let esito = if url.scheme() == "file" || dello_studio {
        match percorso_locale(url).filter(|p| p.is_dir()) {
            Some(cartella) => supervisor::apri_cartella(&cartella).map_err(|e| e.to_string()),
            None => Err(t("l'app apre solo le cartelle del computer, non i file", "the app only opens folders on the computer, not files")),
        }
    } else if matches!(url.scheme(), "http" | "https" | "mailto") {
        supervisor::apri_fuori_dal_giobbe(url.as_str()).map_err(|e| e.to_string())
    } else {
        Err(t("l'app non apre questo tipo di collegamento", "the app does not open this kind of link"))
    };
    if let Err(motivo) = esito {
        segnalazione::link_non_aperto(app, url.as_str(), &motivo);
    }
}

/// Da qui lo studio risponde in `porta`: la finestra può navigarci e la sua pagina, che è remota, ha i permessi della pagina dell'app (`capabilities/default.json`) ma solo su quell'origine,
/// non su ogni porta di 127.0.0.1.
fn usa_porta(app: &AppHandle, porta: u16) -> Result<()> {
    if app.state::<Interno>().porta.swap(porta, Ordering::SeqCst) == porta {
        return Ok(());
    }
    let mut capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json"))?;
    capability["identifier"] = format!("studio-{porta}").into();
    capability["local"] = false.into();
    capability["remote"] = serde_json::json!({ "urls": [format!("http://127.0.0.1:{porta}")] });
    app.add_capability(capability.to_string())?;
    if let Err(e) = app.path().app_local_data_dir().map_err(anyhow::Error::from).and_then(|dati| istanza::registra_porta(&dati, porta)) {
        segnalazione::nel_registro(app, &t(format!("Non riesco a scrivere la porta dello studio per il comando riavvia-app: {e:#}"), format!("I can't write the studio port for the riavvia-app command: {e:#}")));
    }
    Ok(())
}

fn porta_in_uso(app: &AppHandle) -> Option<u16> {
    Some(app.state::<Interno>().porta.load(Ordering::SeqCst)).filter(|p| *p != 0)
}

/// Dice al server quali file ha scelto il creator (lasciati sulla finestra, copiati in Esplora risorse): senza, il server non ne prende il percorso.
pub(crate) fn registra_percorsi(app: &AppHandle, percorsi: &[String]) -> std::result::Result<(), String> {
    if percorsi.is_empty() {
        return Ok(());
    }
    let (Some(porta), Esito::Pronta(lavoro)) = (porta_in_uso(app), app.state::<Interno>().lavoro.lock().unwrap().clone()) else {
        return Err(t("Lo studio non è ancora pronto: riprova fra un momento.", "The studio isn't ready yet: try again in a moment."));
    };
    percorsi::registra(porta, &lavoro, percorsi)
}

fn prepara(app: &tauri::App) -> Result<()> {
    let impostazioni = app.path().app_config_dir()?;
    lingua::all_avvio(&impostazioni);
    // Senza giobbe l'app funziona lo stesso: solo che i processi che avvia non muoiono con lei.
    match Giobbe::nuovo().and_then(|giobbe| giobbe.assegna_questo_processo().map(|()| giobbe)) {
        Ok(giobbe) => {
            let _ = GIOBBE.set(giobbe);
        }
        Err(e) => segnalazione::nel_registro(app.handle(), &t(format!("I processi avviati dall'app non si chiuderanno con lei: {e:#}"), format!("The processes the app starts will not close with it: {e:#}"))),
    }
    // Lo studio è una pagina remota (127.0.0.1): i suoi comandi vogliono un plugin con permessi suoi (`build.rs`, `capabilities/default.json`), non bastano quelli dell'app.
    app.handle().plugin(
        tauri::plugin::Builder::<tauri::Wry>::new("mango-animation")
            .invoke_handler(tauri::generate_handler![
                titolo::colore_barra_titolo,
                voce::voce_stato,
                voce::voce_avvia,
                voce::voce_ferma,
                dati::cartella_dati,
                dati::sposta_cartella_dati,
                appunti::appunti_percorsi,
                computer::ponte::computer_leggi,
                lingua::lingua_dello_studio,
                segnalazione::segnala_problema,
                segnalazione::scrivi_ui_log,
                segnalazione::segnalazione_invio_attivo,
                zoom::ricorda_zoom,
            ])
            .build(),
    )?;

    let log = app.path().app_log_dir()?;
    let partenza = std::env::current_exe()?.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let radice = trova_radice(&partenza, std::env::var("MANGO_ANIMATION_RADICE").ok().as_deref()).map_err(|e| format!("{e:#}"));
    let documenti = app.path().document_dir().ok();
    let lavoro = trova_lavoro(std::env::var(lavoro::VARIABILE).ok().as_deref(), &impostazioni, documenti.as_deref());
    voce::installa(app, radice.as_deref().ok(), if let Esito::Pronta(cartella) = &lavoro { Some(cartella.as_path()) } else { None })?;
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
        porta: AtomicU16::new(0),
        main: OnceLock::new(),
        pagina: OnceLock::new(),
    });
    // Serve solo al comando di sviluppo `riavvia-app`: se non si scrive, l'app parte lo stesso.
    if let Err(e) = app.path().app_local_data_dir().map_err(anyhow::Error::from).and_then(|dati| istanza::registra(&dati, &istanza::Istanza::questa()?)) {
        segnalazione::nel_registro(app.handle(), &t(format!("Non riesco a registrare l'app per il comando riavvia-app: {e:#}"), format!("I can't register the app for the riavvia-app command: {e:#}")));
    }

    let (per_le_finestre, per_i_link_nav) = (app.handle().clone(), app.handle().clone());
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
        .on_new_window(move |url, _| {
            apri_fuori(&per_le_finestre, &url, porta_in_uso(&per_le_finestre));
            NewWindowResponse::Deny
        })
        // La finestra naviga solo sulle pagine dell'app: ogni altro indirizzo si apre fuori.
        .on_navigation(move |url| {
            ricorda_pagina(&per_i_link_nav, url);
            let porta = porta_in_uso(&per_i_link_nav);
            if e_pagina_dell_app(url, porta) {
                return true;
            }
            apri_fuori(&per_i_link_nav, url, porta);
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

/// L'app non riesce a partire: senza console e senza finestra il creator non vedrebbe niente, quindi lo dice una finestra di Windows.
fn non_parte(errore: &dyn std::fmt::Display) -> ! {
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let testo = t(format!("Mango Animation non riesce ad avviarsi.\n\n{errore}"), format!("Mango Animation can't start.\n\n{errore}"));
    unsafe { MessageBoxW(None, &HSTRING::from(testo), &HSTRING::from("Mango Animation"), MB_OK | MB_ICONERROR) };
    std::process::exit(1)
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
        .unwrap_or_else(|e| non_parte(&e));
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
    fn ogni_comando_del_ponte_ha_il_permesso_il_gestore_e_la_pagina_che_lo_chiama() {
        let (build, capability, sorgente) = (include_str!("../build.rs"), include_str!("../capabilities/default.json"), include_str!("lib.rs"));
        let pagine = [include_str!("titolo.rs"), include_str!("zoom.rs"), include_str!("dati.rs"), include_str!("appunti.rs"), include_str!("lingua.rs"), include_str!("computer/ponte.rs"), include_str!("segnalazione/ponte.js"), include_str!("voce/ponte.js")].concat();
        let elenco = build.split(".commands(&[").nth(1).unwrap().split("])").next().unwrap();
        let comandi: Vec<&str> = elenco.split('"').skip(1).step_by(2).collect();
        assert!(comandi.len() > 10, "{comandi:?}");
        for comando in comandi {
            assert!(sorgente.contains(&format!("::{comando},")), "{comando} non è nel gestore di `prepara`");
            assert!(pagine.contains(&format!("|{comando}\"")) || pagine.contains(&format!("(\"{comando}\"")), "nessuna pagina chiama {comando}");
        }
        assert!(capability.contains("\"mango-animation:default\"") && !pagine.contains("plugin:mango-animation-"));
    }

    #[test]
    fn ogni_stato_dice_alla_pagina_in_che_lingua_sono_le_sue_frasi() {
        let json = |s: Stato| serde_json::to_value(nella_lingua_in_uso(s)).unwrap();
        assert_eq!(json(attesa(0, "x"))["lingua"], "it");
        lingua::con(lingua::Lingua::En, || assert_eq!(json(attesa(0, "x"))["lingua"], "en"));
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn la_finestra_naviga_solo_sulla_pagina_dell_app_e_sulla_radice_dello_studio_nella_sua_porta() {
        let porta = Some(47431);
        for si in ["http://tauri.localhost/", "http://tauri.localhost/index.html", "http://127.0.0.1:47431/", "http://127.0.0.1:47431/entra?chiave=abc", "http://127.0.0.1:47431/#/video/100"] {
            assert!(e_pagina_dell_app(&url(si), porta), "{si}");
        }
        for no in [
            "http://127.0.0.1:47431/C:/Users/Alice/Documents",
            "http://127.0.0.1:47431/c/Users/Alice/a.mp4",
            "http://127.0.0.1:47431/api/lavori",
            "http://127.0.0.1:8080/",
            "http://127.0.0.1/",
            "http://localhost:47431/",
            "https://127.0.0.1:47431/",
            "https://esempio.it/",
            "file:///C:/Users/Alice/",
            "about:blank",
        ] {
            assert!(!e_pagina_dell_app(&url(no), porta), "{no}");
        }
        assert!(!e_pagina_dell_app(&url("http://127.0.0.1/"), None) && e_pagina_dell_app(&url("http://tauri.localhost/"), None));
    }

    #[test]
    fn un_link_a_una_cartella_del_computer_diventa_il_suo_percorso_e_un_file_o_il_web_no() {
        let t = tempfile::tempdir().unwrap();
        let cartella = t.path().join("Mia cartella");
        std::fs::create_dir(&cartella).unwrap();
        let da_file = Url::from_file_path(&cartella).unwrap();
        assert_eq!(percorso_locale(&da_file), Some(cartella.clone()));
        // Il link di una chat, relativo allo studio: `/C:/…` con i caratteri speciali codificati.
        let dello_studio = url(&format!("http://127.0.0.1:47431/{}", da_file.path().trim_start_matches('/')));
        assert_eq!(percorso_locale(&dello_studio), Some(cartella));
        assert_eq!(percorso_locale(&url("http://127.0.0.1:47431/c/Users/Alice")), None);
        assert_eq!(percorso_locale(&url("http://127.0.0.1:47431/")), None);
    }

    #[test]
    fn la_pagina_sa_se_il_server_era_partito_e_si_e_fermato() {
        let caduto = Stato { fase: "errore".into(), fermato: true, ..Default::default() };
        assert_eq!(serde_json::to_value(caduto).unwrap()["fermato"], true);
        assert_eq!(serde_json::to_value(Stato::default()).unwrap()["fermato"], false);
    }
}
