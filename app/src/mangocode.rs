//! Mango Code, l'alternativa a Claude Code per la chat (`docs/CHAT.md`, «Mango Code»): l'app lo riconosce come il server (`server/src/chat/mangocode.ts`), per sapere se
//! al primo avvio può offrirlo al posto di Claude Code. Non lo accende e non gli chiede niente oltre alla salute.

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Come si presenta a Mango Code ogni chiamata, che il suo registro scrive.
const CHI_CHIAMA: &str = "Mango Animation";

/// La cartella dei dati di Mango Code: `MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`.
pub fn cartella_dei_dati(ambiente: &dyn Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let non_vuota = |nome: &str| ambiente(nome).filter(|v| !v.is_empty());
    non_vuota("MANGO_DATA").map(PathBuf::from).or_else(|| non_vuota("LOCALAPPDATA").map(|l| PathBuf::from(l).join("MangoCode")))
}

/// L'indirizzo da interrogare, se `service.json` dice che Mango Code è acceso e pronto: ha un processo (`pid`, vivo secondo `vivo`) e un `agent` e un `engine`.
/// Un file con `reason` al posto di `agent` e `engine` è un Mango Code che si sta preparando: non è pronto.
fn indirizzo_dell_agente(service_json: &str, vivo: impl Fn(u32) -> bool) -> Option<String> {
    let servizio: Value = serde_json::from_str(service_json.trim_start_matches('\u{feff}')).ok()?;
    let pid = u32::try_from(servizio.get("pid")?.as_u64()?).ok()?;
    if !vivo(pid) {
        return None;
    }
    servizio.get("engine")?.as_str()?;
    servizio.get("agent")?.as_str().map(str::to_owned)
}

fn processo_vivo(pid: u32) -> bool {
    let pid = sysinfo::Pid::from_u32(pid);
    let mut sistema = sysinfo::System::new();
    sistema.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    sistema.process(pid).is_some()
}

/// Mango Code è acceso e risponde (`/global/health`)?
pub fn pronto(dati: &Path) -> bool {
    let Ok(testo) = std::fs::read_to_string(dati.join("service.json")) else { return false };
    let Some(agente) = indirizzo_dell_agente(&testo, processo_vivo) else { return false };
    let richiesta = ureq::AgentBuilder::new().timeout(Duration::from_secs(3)).build().get(&format!("{agente}/global/health")).set("user-agent", CHI_CHIAMA);
    richiesta.call().is_ok_and(|r| r.status() == 200)
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn variabili<'a>(coppie: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |nome| coppie.iter().find(|(k, _)| *k == nome).map(|(_, v)| (*v).to_owned())
    }

    #[test]
    fn la_cartella_dei_dati_e_quella_della_variabile_o_localappdata() {
        let c = cartella_dei_dati(&variabili(&[("MANGO_DATA", r"D:\Dati"), ("LOCALAPPDATA", r"C:\L")]));
        assert_eq!(c, Some(PathBuf::from(r"D:\Dati")));
        assert_eq!(cartella_dei_dati(&variabili(&[("MANGO_DATA", ""), ("LOCALAPPDATA", r"C:\L")])), Some(PathBuf::from(r"C:\L").join("MangoCode")));
        assert_eq!(cartella_dei_dati(&variabili(&[])), None);
    }

    #[test]
    fn service_json_pronto_ha_un_processo_vivo_un_agente_e_un_motore() {
        let pronto = r#"{"pid": 4242, "agent": "http://127.0.0.1:5555", "engine": "http://127.0.0.1:5556"}"#;
        assert_eq!(indirizzo_dell_agente(pronto, |_| true).as_deref(), Some("http://127.0.0.1:5555"));
        assert_eq!(indirizzo_dell_agente(&format!("\u{feff}{pronto}"), |_| true).as_deref(), Some("http://127.0.0.1:5555"));
        // il processo non c'è più: il file è rimasto da uno spegnimento brusco
        assert_eq!(indirizzo_dell_agente(pronto, |pid| pid != 4242), None);
        // acceso ma ancora in preparazione: ha `reason` e non `agent` e `engine`
        assert_eq!(indirizzo_dell_agente(r#"{"pid": 4242, "reason": "sceglie il modello"}"#, |_| true), None);
        assert_eq!(indirizzo_dell_agente(r#"{"pid": 4242, "agent": "http://127.0.0.1:5555"}"#, |_| true), None);
        assert_eq!(indirizzo_dell_agente(r#"{"agent": "x", "engine": "y"}"#, |_| true), None);
        assert_eq!(indirizzo_dell_agente("non è json", |_| true), None);
    }

    #[test]
    fn il_processo_di_questa_prova_e_vivo_e_uno_che_non_c_e_no() {
        assert!(processo_vivo(std::process::id()));
        assert!(!processo_vivo(u32::MAX - 1));
    }

    /// Un agente finto che risponde `stato` a ogni richiesta e ricorda cosa ha ricevuto.
    fn agente_finto(stato: u16) -> (String, std::sync::mpsc::Receiver<String>) {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let indirizzo = format!("http://127.0.0.1:{}", ascolto.local_addr().unwrap().port());
        let (invia, ricevi) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for flusso in ascolto.incoming() {
                let Ok(mut f) = flusso else { return };
                let mut buf = [0u8; 2048];
                let n = f.read(&mut buf).unwrap_or(0);
                let _ = invia.send(String::from_utf8_lossy(&buf[..n]).into_owned());
                let _ = write!(f, "HTTP/1.1 {stato} X\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            }
        });
        (indirizzo, ricevi)
    }

    fn dati_con(servizio: &str) -> tempfile::TempDir {
        let dati = tempfile::tempdir().unwrap();
        std::fs::write(dati.path().join("service.json"), servizio).unwrap();
        dati
    }

    #[test]
    fn mango_code_e_pronto_se_l_agente_risponde_alla_salute_presentandosi() {
        let (agente, richieste) = agente_finto(200);
        let dati = dati_con(&format!(r#"{{"pid": {}, "agent": "{agente}", "engine": "{agente}"}}"#, std::process::id()));
        assert!(pronto(dati.path()));
        let richiesta = richieste.recv_timeout(Duration::from_secs(3)).unwrap().to_lowercase();
        assert!(richiesta.starts_with("get /global/health ") && richiesta.contains("user-agent: mango animation"), "{richiesta}");
    }

    #[test]
    fn un_agente_che_non_sta_bene_o_che_non_c_e_non_e_pronto() {
        let (agente, _) = agente_finto(503);
        let dati = dati_con(&format!(r#"{{"pid": {}, "agent": "{agente}", "engine": "{agente}"}}"#, std::process::id()));
        assert!(!pronto(dati.path()));
        let spento = dati_con(&format!(r#"{{"pid": {}, "agent": "http://127.0.0.1:1", "engine": "http://127.0.0.1:1"}}"#, std::process::id()));
        assert!(!pronto(spento.path()));
        assert!(!pronto(&tempfile::tempdir().unwrap().path().join("senza-mango-code")));
    }
}
