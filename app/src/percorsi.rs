//! I file che il creator sceglie con un gesto (li lascia sulla finestra, li copia in Esplora risorse): l'app li vede, e dice al server quali
//! sono. Senza, il server non prende il percorso di nessun file del computer (`docs/API.md`, «I file scelti dal creator»).

use crate::lingua::t;
use crate::rete;
use crate::server::{chiave_del_server, chiave_dell_app};
use serde_json::json;
use std::path::Path;
use std::time::Duration;

/// `POST /api/app/percorsi`: il server tiene questi percorsi per dieci minuti.
pub fn registra(porta: u16, lavoro: &Path, percorsi: &[String]) -> Result<(), String> {
    let (Some(chiave), Some(chiave_app)) = (chiave_del_server(lavoro), chiave_dell_app(lavoro)) else {
        return Err(t(
            "Non trovo le chiavi del server nella cartella dei dati: riavvia Mango Animation.",
            "I can't find the server's keys in the data folder: restart Mango Animation.",
        ));
    };
    let url = format!("http://127.0.0.1:{porta}/api/app/percorsi");
    rete::agente(&url, Duration::from_secs(3))
        .post(&url)
        .header("X-Chiave-Api", &chiave)
        .header("X-Chiave-App", &chiave_app)
        .header("Content-Type", "application/json")
        .send(json!({ "percorsi": percorsi }).to_string())
        .map(|_| ())
        .map_err(|e| t(format!("Il server non ha preso i file scelti: {e}"), format!("The server did not take the picked files: {e}")))
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn lavoro_con_chiavi() -> tempfile::TempDir {
        let lavoro = tempfile::tempdir().unwrap();
        let arrivi = lavoro.path().join("archivio").join("arrivi");
        std::fs::create_dir_all(&arrivi).unwrap();
        std::fs::write(arrivi.join("chiave-api.json"), r#"{"chiave":"chiave-delle-api"}"#).unwrap();
        std::fs::write(arrivi.join("chiave-app.json"), r#"{"chiave":"chiave-dell-app"}"#).unwrap();
        lavoro
    }

    #[test]
    fn il_server_riceve_i_percorsi_con_le_due_chiavi() {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = ascolto.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut flusso, _) = ascolto.accept().unwrap();
            // Intestazioni e corpo possono arrivare in due pezzi: si legge finché il JSON non si chiude.
            let mut ricevuto = String::new();
            while !ricevuto.ends_with('}') {
                let mut pezzo = [0u8; 4096];
                let letti = flusso.read(&mut pezzo).unwrap();
                ricevuto.push_str(&String::from_utf8_lossy(&pezzo[..letti]));
            }
            flusso.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").unwrap();
            ricevuto
        });
        let lavoro = lavoro_con_chiavi();
        registra(porta, lavoro.path(), &[r"D:\video\giro lungo.mov".into()]).unwrap();
        let richiesta = server.join().unwrap().to_lowercase();
        assert!(richiesta.starts_with("post /api/app/percorsi "));
        assert!(richiesta.contains("x-chiave-api: chiave-delle-api") && richiesta.contains("x-chiave-app: chiave-dell-app"));
        let (_, corpo) = richiesta.split_once("\r\n\r\n").unwrap();
        assert_eq!(serde_json::from_str::<serde_json::Value>(corpo).unwrap(), json!({ "percorsi": [r"d:\video\giro lungo.mov"] }));
    }

    #[test]
    fn senza_le_chiavi_o_senza_server_dice_perche() {
        let vuota = tempfile::tempdir().unwrap();
        assert!(registra(1, vuota.path(), &["a".into()]).unwrap_err().contains("chiavi"));
        let lavoro = lavoro_con_chiavi();
        let libera = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert!(registra(libera, lavoro.path(), &["a".into()]).unwrap_err().contains("server"));
    }
}
