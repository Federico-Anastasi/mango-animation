//! L'app in esecuzione si registra in `app.json`, nella cartella locale dei dati dell'app: pid ed eseguibile.
//! `bun run --cwd server riavvia-app` lo legge per fermare quell'app e solo quella (`docs/APP.md`).

use crate::lingua::t;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const FILE: &str = "app.json";

/// Messa nell'ambiente del server che l'app accende, e da lui ereditata da ogni figlio (la chat compresa): dice a un comando lanciato dall'interno dell'app che sta per fermare se stesso.
pub const VARIABILE_PID: &str = "MANGO_ANIMATION_APP_PID";

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Istanza {
    pub pid: u32,
    pub exe: PathBuf,
    /// La porta in cui lo studio risponde, quando l'app la sa: il ripiego di porta può lasciare il server lontano dalla 47431.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub porta: Option<u16>,
}

impl Istanza {
    pub fn questa() -> Result<Self> {
        Ok(Self { pid: std::process::id(), exe: std::env::current_exe().with_context(|| t("non trovo il percorso dell'eseguibile", "I can't find the path of the executable"))?, porta: None })
    }
}

/// Scrive `app.json` per intero o per niente: un lettore non ne vede mai metà.
pub fn registra(cartella: &Path, istanza: &Istanza) -> Result<()> {
    std::fs::create_dir_all(cartella).with_context(|| t(format!("non riesco a creare la cartella {}", cartella.display()), format!("I can't create the folder {}", cartella.display())))?;
    let provvisorio = cartella.join(format!("{FILE}.tmp"));
    std::fs::write(&provvisorio, serde_json::to_string_pretty(istanza)?).with_context(|| t(format!("non riesco a scrivere {}", provvisorio.display()), format!("I can't write {}", provvisorio.display())))?;
    std::fs::rename(&provvisorio, cartella.join(FILE)).with_context(|| t("non riesco a registrare l'app", "I can't register the app"))
}

pub fn leggi(cartella: &Path) -> Option<Istanza> {
    serde_json::from_str(&std::fs::read_to_string(cartella.join(FILE)).ok()?).ok()
}

/// Aggiunge a `app.json` la porta dello studio.
pub fn registra_porta(cartella: &Path, porta: u16) -> Result<()> {
    registra(cartella, &Istanza { porta: Some(porta), ..Istanza::questa()? })
}

/// Toglie `app.json` solo se è di questo pid: dopo un crash e un nuovo avvio il file è di un'altra app.
pub fn togli(cartella: &Path, pid: u32) {
    if leggi(cartella).is_some_and(|i| i.pid == pid) {
        let _ = std::fs::remove_file(cartella.join(FILE));
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn l_app_si_scrive_e_si_rilegge() {
        let t = tempfile::tempdir().unwrap();
        let dati = t.path().join("dati");
        let io = Istanza { pid: 4242, exe: PathBuf::from(r"C:\Esempio\app.exe"), porta: None };
        registra(&dati, &io).unwrap();
        assert_eq!(leggi(&dati), Some(io));
        assert!(!dati.join("app.json.tmp").exists());
    }

    #[test]
    fn il_file_ha_le_chiavi_che_legge_il_comando() {
        let t = tempfile::tempdir().unwrap();
        registra(t.path(), &Istanza { pid: 7, exe: PathBuf::from(r"C:\x\app.exe"), porta: None }).unwrap();
        let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(t.path().join("app.json")).unwrap()).unwrap();
        assert_eq!(json, serde_json::json!({ "pid": 7, "exe": r"C:\x\app.exe" }));
    }

    #[test]
    fn la_porta_in_uso_si_aggiunge_al_file_con_la_chiave_che_legge_il_comando() {
        let t = tempfile::tempdir().unwrap();
        registra(t.path(), &Istanza::questa().unwrap()).unwrap();
        registra_porta(t.path(), 56867).unwrap();
        let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(t.path().join("app.json")).unwrap()).unwrap();
        assert_eq!(json["porta"], 56867);
        assert_eq!(json["pid"], std::process::id());
        assert_eq!(leggi(t.path()).unwrap().porta, Some(56867));
    }

    #[test]
    fn un_nuovo_avvio_prende_il_posto_del_vecchio() {
        let t = tempfile::tempdir().unwrap();
        registra(t.path(), &Istanza { pid: 1, exe: "a.exe".into(), porta: None }).unwrap();
        registra(t.path(), &Istanza { pid: 2, exe: "a.exe".into(), porta: None }).unwrap();
        assert_eq!(leggi(t.path()).unwrap().pid, 2);
    }

    #[test]
    fn alla_chiusura_toglie_il_proprio_file() {
        let t = tempfile::tempdir().unwrap();
        registra(t.path(), &Istanza { pid: 10, exe: "a.exe".into(), porta: None }).unwrap();
        togli(t.path(), 10);
        assert_eq!(leggi(t.path()), None);
    }

    #[test]
    fn non_toglie_il_file_di_un_altro_pid() {
        let t = tempfile::tempdir().unwrap();
        registra(t.path(), &Istanza { pid: 20, exe: "a.exe".into(), porta: None }).unwrap();
        togli(t.path(), 10);
        assert_eq!(leggi(t.path()).unwrap().pid, 20);
    }

    #[test]
    fn senza_file_o_con_un_file_guasto_non_c_e_niente_da_leggere() {
        let t = tempfile::tempdir().unwrap();
        assert_eq!(leggi(t.path()), None);
        togli(t.path(), 10);
        std::fs::write(t.path().join("app.json"), "non è json").unwrap();
        assert_eq!(leggi(t.path()), None);
        togli(t.path(), 10);
        assert!(t.path().join("app.json").exists());
    }

    #[test]
    fn questa_istanza_e_il_processo_che_gira() {
        let io = Istanza::questa().unwrap();
        assert_eq!(io.pid, std::process::id());
        assert!(io.exe.is_file());
    }
}
