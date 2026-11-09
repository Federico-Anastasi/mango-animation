//! Ciò che va storto sul computer di qualcun altro deve arrivare a chi lo sistema, leggibile e senza i dati personali di chi usa l'app.
//!
//! - `scrivi_ui_log`: le pagine (le proprie dell'app e lo studio) scrivono qui, dallo script `ponte.js`, gli errori non gestiti, i `console.error` e le chiamate all'app lente o senza
//!   risposta. Finiscono in `ui.log`, accanto agli altri registri dell'app, con un tetto di righe al minuto.
//! - `segnala_problema` («Segnala un problema»): un clic. Con l'indirizzo di Sentry (`SENTRY_DSN`) la segnalazione parte: un evento con ciò che il creator ha
//!   scritto, l'errore e il computer in campi separati, e due allegati, `report.txt` (riepilogo e fine dei registri) e `screenshot.png` (solo se il creator lascia acceso l'interruttore).
//!   Senza (una costruzione propria) lo stesso testo resta in un file nei registri e si apre la pagina «nuova issue» di GitHub, già scritta e senza dati personali. In entrambi i casi il testo
//!   passa prima da `anonimizza`. Dei dati del creator non si allega mai altro che la fine dei registri dell'app: né trascrizioni, né chat, né file della cartella di lavoro.

mod anonimizza;
mod rapporto;
mod registro;
mod schermata;

use crate::aggiornamento;
use crate::computer::hw;
use crate::lavoro::Esito as Lavoro;
use crate::lingua::{self, t};
use crate::server::chiave_del_server;
use crate::Interno;
use anonimizza::Chi;
use chrono::Local;
use rapporto::{Dsn, Ingresso, Schermata, Segnalazione};
use registro::{registra, Riga, TETTO};
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, Manager, State, Url};
use tauri_plugin_opener::OpenerExt;

pub const PONTE: &str = include_str!("ponte.js");

/// Dove vanno le segnalazioni: il progetto Sentry `mango-animation` dell'organizzazione `mango-o6` (dati in UE). Un DSN permette solo di inviare, non di leggere: può stare nel codice.
/// Una costruzione può sostituirlo con `MANGO_ANIMATION_SENTRY_DSN`, e `off` lo spegne (un fork lo spegne o mette il suo).
const SENTRY_DSN_DEL_PROGETTO: &str = "https://62b23cd10a1690ecf94c6df6787b8072@o4510993915314176.ingest.de.sentry.io/4512397724876880";
const SENTRY_DSN: Option<&str> = dsn_da(option_env!("MANGO_ANIMATION_SENTRY_DSN"));
const NUOVA_ISSUE: &str = "https://github.com/Federico-Anastasi/mango-animation/issues/new";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const fn dsn_da(valore: Option<&'static str>) -> Option<&'static str> {
    match valore {
        None => Some(SENTRY_DSN_DEL_PROGETTO),
        Some(d) if d.is_empty() || d.eq_ignore_ascii_case("off") => None,
        altro => altro,
    }
}

#[tauri::command]
fn scrivi_ui_log(app: AppHandle, livello: String, testo: String, pagina: Option<String>) -> Result<(), String> {
    let cartella = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let riga = Riga { livello: &livello, pagina: pagina.as_deref(), testo: &testo };
    registra(&cartella, &TETTO, Instant::now(), Local::now(), &riga).map_err(|e| e.to_string())
}

fn leggi_dsn(dsn: &str) -> Result<Dsn, String> {
    let non_valido = || t("L'indirizzo di Sentry non è valido.", "The Sentry address is not valid.");
    let url = Url::parse(dsn).map_err(|_| non_valido())?;
    let progetto = url.path().trim_matches('/');
    let host = url.host_str().filter(|_| !progetto.is_empty() && !url.username().is_empty()).ok_or_else(non_valido)?;
    let porta = url.port().map(|p| format!(":{p}")).unwrap_or_default();
    Ok(Dsn { endpoint: format!("{}://{host}{porta}/api/{progetto}/envelope/", url.scheme()), chiave: url.username().to_string(), intero: dsn.to_string() })
}

fn invia(segnalazione: &Segnalazione, dsn: &str, png: Option<&[u8]>) -> Result<(), String> {
    let dsn = leggi_dsn(dsn)?;
    segnalazione.spedisci(&dsn, png).map_err(|e| t(format!("L'invio della segnalazione non è riuscito: {e}"), format!("The report could not be sent: {e}")))
}

/// Senza Sentry: la pagina «nuova issue» di GitHub, con titolo e testo già scritti. Dentro c'è la macchina e basta: il resto sta nel file, che chi segnala allega dopo averlo letto.
fn nuova_issue(riassunto: &str, file: &Path) -> Url {
    let nome = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let corpo = format!(
        "**{}**\n\n{}\n\n**Computer**\n\n```\n{riassunto}\n```\n\n{}",
        t("Cosa è successo", "What happened"),
        t("<!-- Cosa stavi facendo e cosa è andato storto. -->", "<!-- What you were doing and what went wrong. -->"),
        t(
            format!("**Registri**: trascina qui il file `{nome}`, che si è appena aperto in Esplora file. Può contenere i nomi dei tuoi video e dei tuoi file: leggilo prima di allegarlo."),
            format!("**Logs**: drag here the file `{nome}`, just shown in File Explorer. It may contain the names of your videos and files: read it before attaching it."),
        )
    );
    let mut url = Url::parse(NUOVA_ISSUE).expect("indirizzo valido");
    url.query_pairs_mut().append_pair("title", &t("Problema: ", "Problem: ")).append_pair("body", &corpo);
    url
}

fn versione_di_windows() -> String {
    std::process::Command::new("cmd")
        .args(["/c", "ver"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// L'invio a Sentry è attivo in questa costruzione? Solo allora la schermata della finestra si prende: l'interfaccia nasconde l'interruttore quando è no.
fn invio_attivo() -> bool {
    SENTRY_DSN.is_some()
}

#[tauri::command]
fn segnalazione_invio_attivo() -> bool {
    invio_attivo()
}

#[derive(Serialize)]
struct Esito {
    /// È partita verso Sentry. Altrimenti il testo è nel file e la pagina di GitHub è aperta.
    inviata: bool,
    file: Option<String>,
}

/// L'app è quella installata? E la chiave delle API di questa cartella di lavoro, da togliere dai testi se vi compare.
fn identita(stato: &Interno) -> (bool, Vec<String>) {
    let cartella_exe = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf));
    let installata = matches!((&stato.radice, cartella_exe), (Ok(radice), Some(cartella)) if aggiornamento::installata(radice, &cartella));
    let chiavi = match &*stato.lavoro.lock().unwrap() {
        Lavoro::Pronta(cartella) => chiave_del_server(cartella).into_iter().collect(),
        _ => Vec::new(),
    };
    (installata, chiavi)
}

/// «Segnala un problema». `errore`: ciò che la pagina sa del problema (le pagine d'errore passano il loro); `nota`: ciò che ha scritto il creator; `schermata`: se allegare la finestra.
#[tauri::command]
async fn segnala_problema(
    app: AppHandle,
    stato: State<'_, Interno>,
    errore: Option<String>,
    nota: Option<String>,
    pagina: Option<String>,
    schermata: Option<bool>,
) -> Result<Esito, String> {
    let registri = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let (installata, segreti) = identita(&stato);
    let ingresso = Ingresso { versione: app.package_info().version.to_string(), installata, lingua: lingua::corrente().codice(), errore, nota, pagina };
    let finestra = app.get_webview_window("main");
    let chiesta = schermata.unwrap_or(false);
    let fatto = tauri::async_runtime::spawn_blocking(move || -> Result<(Esito, String), String> {
        // La finestra si prende per prima: mentre si prepara il resto la pagina non cambia.
        let (png, com_e_andata) = match (SENTRY_DSN, chiesta, finestra) {
            (_, false, _) => (None, Schermata::NonChiesta),
            (None, true, _) => (None, Schermata::SenzaInvio),
            (Some(_), true, None) => (None, Schermata::SenzaFinestra),
            (Some(_), true, Some(f)) => match schermata::png_della_finestra(&f) {
                Ok(png) => (Some(png), Schermata::Allegata),
                Err(e) => (None, Schermata::NonPresa(format!("{e:#}"))),
            },
        };
        let chi = Chi::attuale(segreti);
        let computer = hw::leggi(&registri);
        let s = Segnalazione::raccogli(ingresso, versione_di_windows(), computer, &com_e_andata, &registri, &chi);
        match SENTRY_DSN {
            Some(dsn) => invia(&s, dsn, png.as_deref()).map(|_| (Esito { inviata: true, file: None }, s.riassunto())),
            None => {
                let file = s.salva(&registri, Local::now().naive_local()).map_err(|e| e.to_string())?;
                Ok((Esito { inviata: false, file: Some(file.display().to_string()) }, s.riassunto()))
            }
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    let (fatto, riassunto) = fatto;
    if let Some(file) = &fatto.file {
        let file = PathBuf::from(file);
        let _ = app.opener().reveal_item_in_dir(&file);
        let indirizzo = nuova_issue(&riassunto, &file);
        crate::supervisor::apri_fuori_dal_giobbe(indirizzo.as_str()).map_err(|e| e.to_string())?;
    }
    Ok(fatto)
}

pub fn installa(app: &tauri::App) -> tauri::Result<()> {
    app.handle().plugin(
        tauri::plugin::Builder::<tauri::Wry>::new("mango-animation-segnalazione")
            .invoke_handler(tauri::generate_handler![segnala_problema, scrivi_ui_log, segnalazione_invio_attivo])
            .build(),
    )
}

#[cfg(test)]
mod prove {
    use super::rapporto::aiuti::*;
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;

    /// I comandi del plugin: gli stessi in `build.rs` (permessi), in `ponte.js` e in `capabilities/`.
    const COMANDI: [&str; 3] = ["segnala_problema", "scrivi_ui_log", "segnalazione_invio_attivo"];

    #[test]
    fn l_indirizzo_e_quello_del_progetto_se_la_costruzione_non_ne_da_un_altro_o_off() {
        assert_eq!(dsn_da(None), Some(SENTRY_DSN_DEL_PROGETTO));
        assert!(leggi_dsn(SENTRY_DSN_DEL_PROGETTO).is_ok());
        assert_eq!(dsn_da(Some("")), None);
        assert_eq!(dsn_da(Some("OFF")), None);
        assert_eq!(dsn_da(Some("off")), None);
        assert_eq!(dsn_da(Some("https://chiave@o1.ingest.de.sentry.io/42")), Some("https://chiave@o1.ingest.de.sentry.io/42"));
    }

    #[test]
    fn l_interfaccia_sa_se_l_invio_e_attivo_dall_indirizzo_della_costruzione() {
        assert_eq!(segnalazione_invio_attivo(), SENTRY_DSN.is_some());
    }

    #[test]
    fn l_indirizzo_di_sentry_dice_dove_inviare_e_con_quale_chiave() {
        let dsn = leggi_dsn("https://chiavepubblica@o4510.ingest.de.sentry.io/4512").unwrap();
        assert_eq!(dsn.endpoint, "https://o4510.ingest.de.sentry.io/api/4512/envelope/");
        assert_eq!(dsn.chiave, "chiavepubblica");
        assert!(leggi_dsn("non è un indirizzo").is_err());
    }

    #[test]
    fn l_invio_fa_un_post_della_busta_con_l_intestazione_di_sentry() {
        let (s, _c) = segnalazione(None, Some("non parte"));
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = ascolto.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (flusso, _) = ascolto.accept().unwrap();
            let mut lettore = BufReader::new(flusso.try_clone().unwrap());
            let mut righe = Vec::new();
            let mut lunghezza = 0;
            loop {
                let mut riga = String::new();
                lettore.read_line(&mut riga).unwrap();
                if let Some(v) = riga.to_ascii_lowercase().strip_prefix("content-length:") {
                    lunghezza = v.trim().parse().unwrap();
                }
                if riga == "\r\n" {
                    break;
                }
                righe.push(riga);
            }
            let mut corpo = vec![0; lunghezza];
            lettore.read_exact(&mut corpo).unwrap();
            (&flusso).write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap();
            (righe, corpo)
        });
        invia(&s, &format!("http://chiavepubblica@127.0.0.1:{porta}/77"), None).unwrap();
        let (righe, corpo) = server.join().unwrap();
        let testa = righe.join("");
        assert!(testa.starts_with("POST /api/77/envelope/ "), "{testa}");
        assert!(testa.contains("sentry_key=chiavepubblica") && testa.to_ascii_lowercase().contains("content-type: application/x-sentry-envelope"), "{testa}");
        assert_eq!(leggi_busta(&corpo).len(), 2);
    }

    #[test]
    fn un_invio_che_non_riesce_lo_dice_con_una_frase() {
        let (s, _c) = segnalazione(None, None);
        let porta = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let errore = invia(&s, &format!("http://k@127.0.0.1:{porta}/1"), None).unwrap_err();
        assert!(errore.starts_with("L'invio della segnalazione non è riuscito"), "{errore}");
    }

    #[test]
    fn senza_sentry_il_testo_resta_in_un_file_e_la_pagina_di_github_non_ha_dati_personali() {
        let (s, c) = segnalazione(None, Some("non parte"));
        let ora_locale = chrono::NaiveDate::from_ymd_opt(2026, 11, 8).unwrap().and_hms_opt(11, 30, 5).unwrap();
        let file = s.salva(c.path(), ora_locale).unwrap();
        assert_eq!(file.file_name().unwrap(), "segnalazione-2026-11-08-113005.txt");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), s.testo);

        let url = nuova_issue(&s.riassunto(), &file);
        assert!(url.as_str().starts_with(NUOVA_ISSUE));
        let corpo = url.query_pairs().find(|(k, _)| k == "body").map(|(_, v)| v.into_owned()).unwrap();
        assert!(corpo.contains("RTX 3060 Ti") && corpo.contains("segnalazione-2026-11-08-113005.txt"), "{corpo}");
        for personale in ["Gianni", "PC-STUDIO", "non parte", "Pasta fresca", "q7Zk2m"] {
            assert!(!url.as_str().contains(personale) && !corpo.contains(personale), "«{personale}» è nell'indirizzo di GitHub:\n{corpo}");
        }
    }

    #[test]
    fn il_ponte_i_permessi_e_la_capability_dicono_gli_stessi_comandi() {
        let (build, capability) = (include_str!("../../build.rs"), include_str!("../../capabilities/default.json"));
        assert!(PONTE.contains("plugin:mango-animation-segnalazione|"));
        for comando in COMANDI {
            assert!(PONTE.contains(&format!("\"{comando}\"")), "{comando} non è nel ponte");
            assert!(build.contains(&format!("\"{comando}\"")), "{comando} non è nei permessi di build.rs");
        }
        assert!(build.contains("\"mango-animation-segnalazione\"") && capability.contains("mango-animation-segnalazione:default"));
    }
}
