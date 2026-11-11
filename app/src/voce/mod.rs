//! La dettatura: il microfono si registra qui, in Rust, e il testo lo dà un motore locale (`locale.rs`, di base
//! `python -m motore detta`). La pagina dello studio chiede con tre comandi (`ponte.js`) e riceve il testo come
//! eventi `mango-voce` sulla finestra.

mod audio;
mod locale;

pub use audio::Sorgente;

use audio::Ingresso;
use locale::Motore;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.voce`.
pub const PONTE: &str = include_str!("ponte.js");

pub use crate::lingua::Lingua;

/// Un errore per la pagina: `code` per scegliere cosa mostrare, `message` la frase (in italiano finché `nella` non la sceglie), `en` la stessa in inglese.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Errore {
    pub code: &'static str,
    pub message: String,
    #[serde(skip)]
    pub en: String,
}

impl Errore {
    pub fn new(code: &'static str, it: impl Into<String>, en: impl Into<String>) -> Self {
        Errore { code, message: it.into(), en: en.into() }
    }

    /// L'errore con la frase nella lingua della pagina.
    pub fn nella(mut self, lingua: Lingua) -> Self {
        if lingua == Lingua::En {
            self.message = std::mem::take(&mut self.en);
        }
        self
    }
}

/// Come arriva alla pagina un evento della dettatura.
pub type Emetti = Arc<dyn Fn(Value) + Send + Sync>;

/// Chi ascolta adesso: `_fermo` chiude il microfono quando cade.
struct Ascolto {
    id: u64,
    _fermo: audio::Fermo,
}

pub struct Voce {
    motore: Motore,
    ascolto: Arc<Mutex<Option<Ascolto>>>,
    contatore: Mutex<u64>,
}

impl Voce {
    /// `cartella_log`: dove il motore scrive il suo log (`dettatura.log`); `radice`: la cartella del codice, se l'app l'ha trovata; `lavoro`: la cartella dei dati, se c'è già.
    pub fn nuova(cartella_log: PathBuf, radice: Option<&Path>, lavoro: Option<&Path>) -> Voce {
        let comando = locale::comando_del_motore(&|nome| std::env::var(nome).ok(), radice, lavoro);
        Voce::con(Motore::nuovo(comando, cartella_log.join("dettatura.log")))
    }

    fn con(motore: Motore) -> Voce {
        Voce { motore, ascolto: Arc::default(), contatore: Mutex::new(0) }
    }

    /// Il Python preparato dall'app (`docs/APP.md`, «Il computer pronto»), per il motore di base.
    pub fn usa_python(&self, python: &Path) {
        self.motore.usa_python(python);
    }

    /// La cartella dei dati scelta dal creator al primo avvio, quando la dettatura è già pronta senza.
    pub fn usa_lavoro(&self, lavoro: &Path) {
        self.motore.usa_lavoro(lavoro);
    }

    pub fn stato(&self, lingua: Lingua) -> Value {
        let in_ascolto = self.ascolto.lock().unwrap().is_some();
        match self.motore.disponibile() {
            Ok(()) => json!({ "disponibile": true, "in_ascolto": in_ascolto }),
            Err(e) => json!({ "disponibile": false, "messaggio": e.nella(lingua).message, "in_ascolto": in_ascolto }),
        }
    }

    /// Apre il microfono (o il file di prova) e comincia a dettare; gli eventi vanno a `emetti`, ognuno col suo `id`: quello
    /// che `avvia` restituisce, così chi ascolta distingue una dettatura da quella di prima. `lingua`: quella delle frasi di errore, anche del motore se
    /// questa dettatura lo accende.
    pub fn avvia(&self, sorgente: Sorgente, emetti: Emetti, lingua: Lingua) -> Result<u64, Errore> {
        let mut ascolto = self.ascolto.lock().unwrap();
        if ascolto.is_some() {
            return Err(Errore::new("gia_in_ascolto", "La dettatura è già accesa.", "Dictation is already on.").nella(lingua));
        }
        let processo = self.motore.assicura(lingua).map_err(|e| e.nella(lingua))?;
        let Ingresso { pezzi, fermato, fermo } = audio::apri(sorgente).map_err(|e| e.nella(lingua))?;
        let ascolta = processo.ascolta().map_err(|e| e.nella(lingua))?;
        let id = {
            let mut c = self.contatore.lock().unwrap();
            *c += 1;
            *c
        };
        *ascolto = Some(Ascolto { id, _fermo: fermo });
        let libera = self.ascolto.clone();
        let emetti_con_id: Emetti = Arc::new(move |mut evento| {
            evento["id"] = json!(id);
            emetti(evento)
        });
        std::thread::Builder::new()
            .name("voce-dettatura".into())
            .spawn(move || {
                // Qualunque cosa succeda a questo thread (anche un panico), la dettatura finisce: il microfono si
                // spegne, se è ancora il suo, e la pagina riceve `fine`.
                struct Chiusura(Arc<Mutex<Option<Ascolto>>>, u64, Emetti);
                impl Drop for Chiusura {
                    fn drop(&mut self) {
                        let mut a = self.0.lock().unwrap_or_else(|e| e.into_inner());
                        if a.as_ref().is_some_and(|a| a.id == self.1) {
                            *a = None;
                        }
                        drop(a);
                        (self.2)(json!({ "tipo": "fine" }));
                    }
                }
                let _chiusura = Chiusura(libera, id, emetti_con_id.clone());
                locale::detta(&processo, ascolta, id, &pezzi, &fermato, &emetti_con_id, lingua);
            })
            .map_err(|e| Errore::new("microfono_negato", format!("thread della dettatura: {e}"), format!("dictation thread: {e}")).nella(lingua))?;
        Ok(id)
    }

    /// Chiude il microfono; le ultime parole arrivano come eventi, poi `fine`.
    pub fn ferma(&self, lingua: Lingua) -> Result<(), Errore> {
        self.ascolto
            .lock()
            .unwrap()
            .take()
            .map(drop)
            .ok_or_else(|| Errore::new("non_in_ascolto", "La dettatura non è accesa.", "Dictation is not on.").nella(lingua))
    }
}

// ---------------------------------------------------------------- comandi

#[tauri::command]
pub(crate) async fn voce_stato(voce: State<'_, Voce>, lingua: Option<String>) -> Result<Value, Errore> {
    Ok(voce.stato(Lingua::da(lingua.as_deref())))
}

#[tauri::command]
pub(crate) async fn voce_avvia(app: AppHandle, voce: State<'_, Voce>, lingua: Option<String>) -> Result<u64, Errore> {
    // MANGO_ANIMATION_VOCE_FILE: nelle prove dal vivo un WAV suona al posto del microfono
    let sorgente = std::env::var_os("MANGO_ANIMATION_VOCE_FILE").map_or(Sorgente::Microfono, |f| Sorgente::File(f.into()));
    let emetti: Emetti = Arc::new(move |evento| {
        if let Some(finestra) = app.get_webview_window("main") {
            let _ = finestra.eval(format!("window.dispatchEvent(new CustomEvent('mango-voce',{{detail:{evento}}}))"));
        }
    });
    voce.avvia(sorgente, emetti, Lingua::da(lingua.as_deref()))
}

#[tauri::command]
pub(crate) async fn voce_ferma(voce: State<'_, Voce>, lingua: Option<String>) -> Result<(), Errore> {
    voce.ferma(Lingua::da(lingua.as_deref()))
}

/// Tiene lo stato della dettatura; i suoi comandi li registra `prepara` in `lib.rs`, insieme agli altri del ponte.
pub fn installa(app: &tauri::App, radice: Option<&Path>, lavoro: Option<&Path>) -> tauri::Result<()> {
    app.manage(Voce::nuova(app.path().app_log_dir()?, radice, lavoro));
    Ok(())
}

#[cfg(test)]
mod prove;
