//! Gli aggiornamenti contro un server di aggiornamenti finto, senza installare niente: versioni, firma dell'updater valida e non valida, configurazione.
//! Un file di prove a parte perché usa l'app finta di Tauri, che vuole il manifesto dei controlli di Windows (`build.rs`).

use mango_animation_lib::aggiornamento::{cerca, dopo_il_si, installata, scarica, stato_d_errore, Fallito, Passo, Proposta};
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

const CARICO: &[u8] = include_bytes!("../prove/aggiornamento/carico.bin");
const FIRMA: &str = include_str!("../prove/aggiornamento/carico.bin.sig");
const CHIAVE_DELLA_PROVA: &str = include_str!("../prove/aggiornamento/chiave-prova.pub");

/// Un server di aggiornamenti finto: `latest.json` con la versione e la firma date, e il pacchetto (anche alterato) su `/pacchetto`. Torna l'indirizzo del manifesto.
fn server(versione: &str, firma: &str, pacchetto: Vec<u8>, piattaforma: &str) -> String {
    let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
    let porta = ascolto.local_addr().unwrap().port();
    let manifesto = json!({
        "version": versione,
        "notes": "Una nota di prova",
        "pub_date": "2026-11-05T20:00:00Z",
        "platforms": { piattaforma: { "signature": firma.trim(), "url": format!("http://127.0.0.1:{porta}/pacchetto") } },
    })
    .to_string();
    std::thread::spawn(move || {
        for flusso in ascolto.incoming() {
            let Ok(mut f) = flusso else { return };
            let mut buf = [0u8; 2048];
            let n = f.read(&mut buf).unwrap_or(0);
            let corpo = if String::from_utf8_lossy(&buf[..n]).contains("GET /pacchetto") { pacchetto.clone() } else { manifesto.clone().into_bytes() };
            let _ = write!(f, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", corpo.len());
            let _ = f.write_all(&corpo);
        }
    });
    format!("http://127.0.0.1:{porta}/latest.json")
}

/// Un'app finta alla versione `versione`, che chiede gli aggiornamenti a `indirizzo` e si fida di `chiave_pubblica`.
fn app_alla_versione(versione: &str, indirizzo: &str, chiave_pubblica: &str) -> tauri::App<MockRuntime> {
    let mut contesto = mock_context(noop_assets());
    contesto.package_info_mut().version = versione.parse().unwrap();
    contesto.config_mut().plugins.0.insert("updater".into(), json!({ "pubkey": chiave_pubblica, "endpoints": [indirizzo], "dangerousInsecureTransportProtocol": true }));
    mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(contesto).unwrap()
}

fn cerca_da(versione_dell_app: &str, versione_nel_manifesto: &str, firma: &str, pacchetto: &[u8], chiave: &str) -> Result<Option<Proposta>, String> {
    let indirizzo = server(versione_nel_manifesto, firma, pacchetto.to_vec(), SISTEMA);
    let app = app_alla_versione(versione_dell_app, &indirizzo, chiave);
    cerca(app.handle())
}

/// Il nome con cui l'updater chiama questo computer nel manifesto.
const SISTEMA: &str = "windows-x86_64";

#[test]
fn una_versione_piu_nuova_si_propone_con_le_sue_note() {
    let p = cerca_da("0.1.0", "0.1.1", FIRMA, CARICO, CHIAVE_DELLA_PROVA).unwrap().expect("la 0.1.1 è più nuova della 0.1.0");
    assert_eq!((p.stato.fase.as_str(), p.stato.corrente.as_str(), p.stato.nuova.as_str()), ("proposta", "0.1.0", "0.1.1"));
    assert_eq!(p.stato.note.as_deref(), Some("Una nota di prova"));
}

#[test]
fn la_stessa_versione_o_una_piu_vecchia_non_si_propone() {
    assert!(cerca_da("0.1.1", "0.1.1", FIRMA, CARICO, CHIAVE_DELLA_PROVA).unwrap().is_none());
    assert!(cerca_da("0.2.0", "0.1.1", FIRMA, CARICO, CHIAVE_DELLA_PROVA).unwrap().is_none());
    // Il confronto è fra numeri, non fra testi: 0.10.0 è più nuova di 0.9.0.
    assert!(cerca_da("0.9.0", "0.10.0", FIRMA, CARICO, CHIAVE_DELLA_PROVA).unwrap().is_some());
}

#[test]
fn un_manifesto_senza_questo_sistema_o_un_indirizzo_che_non_risponde_e_un_errore_e_non_una_proposta() {
    let altro_sistema = server("0.1.1", FIRMA, CARICO.to_vec(), "darwin-aarch64");
    let app = app_alla_versione("0.1.0", &altro_sistema, CHIAVE_DELLA_PROVA);
    assert!(cerca(app.handle()).is_err());
    let libero = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let app = app_alla_versione("0.1.0", &format!("http://127.0.0.1:{libero}/latest.json"), CHIAVE_DELLA_PROVA);
    assert!(cerca(app.handle()).is_err());
}

#[test]
fn un_pacchetto_firmato_con_la_chiave_dell_app_si_scarica_con_l_avanzamento() {
    let p = cerca_da("0.1.0", "0.1.1", FIRMA, CARICO, CHIAVE_DELLA_PROVA).unwrap().unwrap();
    let mut visti = Vec::new();
    let scaricato = scarica(&p, |fatti, totale| visti.push((fatti, totale))).unwrap();
    assert_eq!(scaricato, CARICO);
    assert_eq!(visti.last().map(|(f, _)| *f), Some(CARICO.len() as u64));
}

#[test]
fn un_pacchetto_alterato_dopo_la_firma_non_si_accetta() {
    let mut alterato = CARICO.to_vec();
    alterato[0] ^= 0xff;
    let p = cerca_da("0.1.0", "0.1.1", FIRMA, &alterato, CHIAVE_DELLA_PROVA).unwrap().unwrap();
    let errore = scarica(&p, |_, _| {}).unwrap_err();
    assert!(!errore.is_empty());
}

#[test]
fn dopo_il_si_un_pacchetto_rifiutato_porta_alla_pagina_d_errore_e_non_ferma_l_app() {
    let mut alterato = CARICO.to_vec();
    alterato[0] ^= 0xff;
    let proposta = cerca_da("0.1.0", "0.1.1", FIRMA, &alterato, CHIAVE_DELLA_PROVA).unwrap().unwrap();
    let base = proposta.stato.clone();
    let (mut mostrate, mut registrate) = (Vec::new(), Vec::new());
    dopo_il_si(
        proposta,
        || panic!("chi continua non riprova"),
        |p| scarica(p, |_, _| {}).map(|_| ()).map_err(|dettaglio| Fallito { passo: Passo::Scarico, dettaglio }),
        |fallito| {
            mostrate.push(stato_d_errore(&base, fallito));
            false
        },
        |fallito| registrate.push(fallito.clone()),
    );
    assert_eq!(mostrate.len(), 1);
    assert_eq!((mostrate[0].fase.as_str(), mostrate[0].nuova.as_str()), ("errore", "0.1.1"));
    assert!(mostrate[0].messaggio.as_deref().is_some_and(|m| !m.is_empty()));
    assert_eq!(registrate.len(), 1);
    assert_eq!(registrate[0].passo, Passo::Scarico);
    assert!(!registrate[0].dettaglio.is_empty(), "il registro ha il motivo tecnico dell'updater");
}

#[test]
fn un_pacchetto_firmato_con_un_altra_chiave_non_si_accetta() {
    // La firma è fatta con la chiave di prova; l'app si fida della chiave di Mango Animation (`tauri.conf.json`).
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let chiave_dell_app = conf["plugins"]["updater"]["pubkey"].as_str().unwrap();
    assert_ne!(chiave_dell_app.trim(), CHIAVE_DELLA_PROVA.trim());
    let p = cerca_da("0.1.0", "0.1.1", FIRMA, CARICO, chiave_dell_app).unwrap().unwrap();
    assert!(scarica(&p, |_, _| {}).is_err());
}

#[test]
fn un_pacchetto_senza_firma_non_si_accetta() {
    let p = cerca_da("0.1.0", "0.1.1", "", CARICO, CHIAVE_DELLA_PROVA);
    match p {
        Err(_) => {}
        Ok(None) => panic!("una versione più nuova non può sparire"),
        Ok(Some(p)) => assert!(scarica(&p, |_, _| {}).is_err()),
    }
}

#[test]
fn solo_l_app_installata_si_aggiorna_e_quella_di_chi_sviluppa_no() {
    let installata_in = Path::new(r"C:\Utenti\Anna\AppData\Local\Mango Animation");
    assert!(installata(&installata_in.join("codice"), installata_in));
    // L'eseguibile costruito sta in app/target/release dentro il repo, che è la radice del codice.
    let repo = Path::new(r"C:\Dev\mango-animation");
    assert!(!installata(repo, &repo.join("app").join("target").join("release")));
    assert!(!installata(&installata_in.join("altro"), installata_in));
}

#[test]
fn la_configurazione_ha_la_chiave_pubblica_e_l_indirizzo_degli_aggiornamenti_e_l_installatore_porta_il_codice_dove_l_app_lo_cerca() {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let updater = &conf["plugins"]["updater"];
    let chiave = String::from_utf8(base64_decodifica(updater["pubkey"].as_str().unwrap())).unwrap();
    assert!(chiave.starts_with("untrusted comment: minisign public key"), "{chiave}");
    assert!(updater["endpoints"][0].as_str().unwrap().starts_with("https://"), "gli aggiornamenti arrivano solo da https");
    assert!(updater.get("dangerousInsecureTransportProtocol").is_none());
    // L'installatore: firma degli aggiornamenti, per utente, il codice in `codice/` (dove `radice.rs` lo cerca) e la licenza.
    let installatore: serde_json::Value = serde_json::from_str(include_str!("../tauri.installer.conf.json")).unwrap();
    let bundle = &installatore["bundle"];
    assert_eq!(bundle["createUpdaterArtifacts"], true);
    assert_eq!(bundle["resources"]["target/codice"], "codice");
    assert_eq!(bundle["windows"]["nsis"]["installMode"], "currentUser");
    assert_eq!(bundle["targets"], json!(["nsis"]));
    assert!(include_str!("../../LICENSE").contains("GNU AFFERO GENERAL PUBLIC LICENSE"));
}

fn base64_decodifica(testo: &str) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(testo.trim()).unwrap()
}
