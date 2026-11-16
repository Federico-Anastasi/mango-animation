//! Mango Code non è un programma da cercare: si accende da sé e lascia nella sua cartella dei dati un `service.json`. Qui si decide se è acceso e pronto con la stessa regola del server
//! (`server/src/chat/mangocode.ts`): il processo del file è vivo e l'agente risponde al controllo di salute; acceso ma non pronto se il file porta un motivo al posto di agente e motore.
//! Da spento, se è installato lo dice Windows.

use crate::rete;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use windows::core::HSTRING;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Registry::{RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE};
use windows::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

#[derive(Debug, PartialEq)]
pub enum Stato {
    Pronto,
    NonPronto,
    Spento,
}

const STILL_ACTIVE: u32 = 259;
const ATTESA_DELLA_SALUTE: Duration = Duration::from_secs(3);

/// `MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`.
pub fn cartella_dei_dati(variabile: &dyn Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let piena = |nome: &str| variabile(nome).filter(|v| !v.is_empty());
    let indicata = piena("MANGO_DATA").map(PathBuf::from);
    let di_serie = || {
        let locale = piena("LOCALAPPDATA").map(PathBuf::from).or_else(|| piena("USERPROFILE").map(|casa| PathBuf::from(casa).join("AppData").join("Local")))?;
        Some(locale.join("MangoCode"))
    };
    indicata.or_else(di_serie)
}

/// Il nome con cui l'installatore di Mango Code lo scrive fra i programmi dell'utente.
pub const NOME_FRA_I_PROGRAMMI: &str = "Mango Code";

/// Windows elenca il programma fra quelli installati da questo utente (la chiave che il suo installatore scrive per poterlo disinstallare).
pub fn elencato_da_windows(nome: &str) -> bool {
    let chiave = HSTRING::from(format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{nome}"));
    unsafe {
        let mut aperta = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, &chiave, 0, KEY_QUERY_VALUE, &mut aperta).is_err() {
            return false;
        }
        let _ = RegCloseKey(aperta);
        true
    }
}

fn vivo(pid: u32) -> bool {
    unsafe {
        let Ok(processo) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return false };
        let mut uscita = 0u32;
        let letto = GetExitCodeProcess(processo, &mut uscita);
        let _ = CloseHandle(processo);
        letto.is_ok() && uscita == STILL_ACTIVE
    }
}

fn risponde_alla_salute(agente: &str) -> bool {
    let url = format!("{agente}/global/health");
    rete::agente(&url, ATTESA_DELLA_SALUTE).get(&url).header("user-agent", "Mango Animation").call().is_ok()
}

pub fn stato(dati: &Path) -> Stato {
    let Ok(grezzo) = std::fs::read(dati.join("service.json")) else { return Stato::Spento };
    let testo = String::from_utf8_lossy(&grezzo);
    let Ok(Value::Object(servizio)) = serde_json::from_str(testo.trim_start_matches('\u{feff}')) else { return Stato::Spento };
    let Some(pid) = servizio.get("pid").and_then(Value::as_u64).and_then(|p| u32::try_from(p).ok()) else { return Stato::Spento };
    if !vivo(pid) {
        return Stato::Spento;
    }
    let testo_di = |chiave: &str| servizio.get(chiave).and_then(Value::as_str);
    let (Some(agente), Some(_)) = (testo_di("agent"), testo_di("engine")) else {
        return if testo_di("reason").is_some() { Stato::NonPronto } else { Stato::Spento };
    };
    if risponde_alla_salute(agente) {
        Stato::Pronto
    } else {
        Stato::Spento
    }
}
