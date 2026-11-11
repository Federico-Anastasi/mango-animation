//! La lingua delle pagine proprie dell'app (attesa, errori, scelte dell'avvio) e delle frasi che il Rust ci manda: italiano o inglese.
//!
//! Una sola funzione la decide, `scegli`: la lingua che lo studio ha scelto, se l'app la conosce (lo studio la dice a ogni apertura, `PONTE`, e l'app la
//! ricorda in `lingua.json` per il prossimo avvio); altrimenti quella dell'interfaccia di Windows (italiano se è in italiano, inglese altrimenti).

use crate::Interno;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::State;

const FILE: &str = "lingua.json";

/// La lingua delle frasi che l'app dice alla pagina (`it` o `en`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Lingua {
    #[default]
    It,
    En,
}

impl Lingua {
    /// Il codice di una lingua che la pagina dello studio ha detto; senza indicazione o con una che non c'è, italiano.
    pub fn da(codice: Option<&str>) -> Lingua {
        if codice.is_some_and(|c| c.trim().eq_ignore_ascii_case("en")) {
            Lingua::En
        } else {
            Lingua::It
        }
    }

    /// Il valore di `MANGO_ANIMATION_LINGUA`, con cui il motore sceglie la lingua delle sue frasi.
    pub fn codice(self) -> &'static str {
        match self {
            Lingua::It => "it",
            Lingua::En => "en",
        }
    }

    pub fn dice(self, it: impl Into<String>, en: impl Into<String>) -> String {
        match self {
            Lingua::It => it.into(),
            Lingua::En => en.into(),
        }
    }
}

/// L'identificatore di lingua di Windows per l'italiano (i 10 bit bassi di un LANGID).
const ITALIANO_DI_WINDOWS: u16 = 0x10;

/// La lingua di queste pagine: `studio` è quella che lo studio ha detto (`it` o `en`); senza, vale l'interfaccia di Windows (`lingua_di_windows`, un LANGID).
pub fn scegli(studio: Option<&str>, lingua_di_windows: u16) -> Lingua {
    match studio.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("it") => Lingua::It,
        Some("en") => Lingua::En,
        _ if lingua_di_windows & 0x3ff == ITALIANO_DI_WINDOWS => Lingua::It,
        _ => Lingua::En,
    }
}

fn interfaccia_di_windows() -> u16 {
    unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() }
}

#[derive(Serialize, Deserialize)]
struct Ricordata {
    lingua: String,
}

fn ricordata(impostazioni: &Path) -> Option<String> {
    let testo = std::fs::read_to_string(impostazioni.join(FILE)).ok()?;
    serde_json::from_str::<Ricordata>(&testo).ok().map(|r| r.lingua)
}

fn ricorda(impostazioni: &Path, lingua: Lingua) -> std::io::Result<()> {
    std::fs::create_dir_all(impostazioni)?;
    std::fs::write(impostazioni.join(FILE), serde_json::to_string_pretty(&Ricordata { lingua: lingua.codice().into() })?)
}

static CORRENTE: AtomicU8 = AtomicU8::new(0);

#[cfg(test)]
thread_local! {
    static SOLO_QUI: std::cell::Cell<Option<Lingua>> = const { std::cell::Cell::new(None) };
}

/// La lingua in uso adesso.
pub fn corrente() -> Lingua {
    #[cfg(test)]
    if let Some(l) = SOLO_QUI.with(|s| s.get()) {
        return l;
    }
    if CORRENTE.load(Ordering::Relaxed) == 1 {
        Lingua::En
    } else {
        Lingua::It
    }
}

fn imposta(lingua: Lingua) {
    CORRENTE.store(u8::from(lingua == Lingua::En), Ordering::Relaxed);
}

/// All'avvio: sceglie la lingua (quella ricordata, o quella di Windows) e la mette in uso.
pub fn all_avvio(impostazioni: &Path) -> Lingua {
    let lingua = scegli(ricordata(impostazioni).as_deref(), interfaccia_di_windows());
    imposta(lingua);
    lingua
}

/// La frase nella lingua in uso.
pub fn t(it: impl Into<String>, en: impl Into<String>) -> String {
    corrente().dice(it, en)
}

/// Esegue `f` con questa lingua, solo in questo thread: le prove non si pestano i piedi.
#[cfg(test)]
pub fn con<R>(lingua: Lingua, f: impl FnOnce() -> R) -> R {
    SOLO_QUI.with(|s| s.set(Some(lingua)));
    let esito = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    SOLO_QUI.with(|s| s.set(None));
    esito.unwrap_or_else(|e| std::panic::resume_unwind(e))
}

/// Lo script che la finestra esegue in ogni pagina: sullo studio (non sulle pagine dell'app) dice all'app la lingua della pagina, a ogni apertura e a ogni cambio.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window || location.hostname === "tauri.localhost") return;
  let ultima = "";
  const dici = () => {
    const l = document.documentElement.lang;
    if ((l !== "it" && l !== "en") || l === ultima) return;
    ultima = l;
    window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|lingua_dello_studio", { lingua: l }).catch(() => {});
  };
  addEventListener("DOMContentLoaded", () => {
    dici();
    new MutationObserver(dici).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  });
})();
"#;

#[tauri::command]
pub(crate) fn lingua_dello_studio(stato: State<'_, Interno>, lingua: String) {
    let nuova = match lingua.as_str() {
        "it" => Lingua::It,
        "en" => Lingua::En,
        _ => return,
    };
    if nuova != corrente() {
        imposta(nuova);
        let _ = ricorda(&stato.impostazioni, nuova);
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    const WINDOWS_ITALIANO: u16 = 0x0410;
    const WINDOWS_INGLESE_USA: u16 = 0x0409;
    const WINDOWS_TEDESCO: u16 = 0x0407;

    #[test]
    fn la_lingua_dello_studio_vince_su_quella_di_windows() {
        assert_eq!(scegli(Some("en"), WINDOWS_ITALIANO), Lingua::En);
        assert_eq!(scegli(Some("it"), WINDOWS_INGLESE_USA), Lingua::It);
        assert_eq!(scegli(Some(" EN "), WINDOWS_ITALIANO), Lingua::En);
    }

    #[test]
    fn senza_lo_studio_vale_l_interfaccia_di_windows_italiano_se_e_in_italiano_inglese_altrimenti() {
        assert_eq!(scegli(None, WINDOWS_ITALIANO), Lingua::It);
        assert_eq!(scegli(None, 0x0810), Lingua::It, "l'italiano della Svizzera è italiano");
        assert_eq!(scegli(None, WINDOWS_INGLESE_USA), Lingua::En);
        assert_eq!(scegli(None, WINDOWS_TEDESCO), Lingua::En);
    }

    #[test]
    fn una_lingua_che_l_app_non_conosce_non_conta_e_vale_windows() {
        assert_eq!(scegli(Some("fr"), WINDOWS_ITALIANO), Lingua::It);
        assert_eq!(scegli(Some("fr"), WINDOWS_INGLESE_USA), Lingua::En);
        assert_eq!(scegli(Some(""), WINDOWS_INGLESE_USA), Lingua::En);
    }

    #[test]
    fn la_lingua_ricordata_si_rilegge_al_prossimo_avvio() {
        let t = tempfile::tempdir().unwrap();
        assert_eq!(ricordata(t.path()), None);
        ricorda(t.path(), Lingua::En).unwrap();
        assert_eq!(ricordata(t.path()).as_deref(), Some("en"));
        ricorda(&t.path().join("dentro/ancora"), Lingua::It).unwrap();
        assert_eq!(ricordata(&t.path().join("dentro/ancora")).as_deref(), Some("it"));
    }

    #[test]
    fn un_file_della_lingua_illeggibile_e_come_non_averlo() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join(FILE), "non è json").unwrap();
        assert_eq!(ricordata(t.path()), None);
    }

    #[test]
    fn la_frase_esce_nella_lingua_in_uso_e_la_prova_non_la_cambia_agli_altri_thread() {
        assert_eq!(t("ciao", "hello"), "ciao");
        con(Lingua::En, || {
            assert_eq!(t("ciao", "hello"), "hello");
            assert_eq!(std::thread::spawn(|| t("ciao", "hello")).join().unwrap(), "ciao");
        });
        assert_eq!(t("ciao", "hello"), "ciao");
    }
}
