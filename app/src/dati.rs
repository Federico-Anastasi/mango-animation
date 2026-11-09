//! La cartella dei dati vista dallo studio: dove sta e il gesto «Sposta la cartella dei dati». Come la dettatura, passa da un
//! plugin con permessi suoi (`build.rs`, `capabilities/default.json`) perché lo studio è una pagina remota (127.0.0.1).

use crate::lingua::t;
use crate::cartella::stesso_posto;
use crate::lavoro::{annulla_spostamento, dati_correnti, programma_spostamento, scegli_cartella, Dati, Esito, VARIABILE};
use crate::sposta::controlla_destinazione;
use crate::Interno;
use std::sync::atomic::Ordering;
use tauri::State;

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.cartellaDati`.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  const chiama = (comando) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation-dati|" + comando);
  // cartellaDati.leggi(): { attuale, prossima, forzata } (prossima: dove si sposta la cartella al prossimo avvio)
  // cartellaDati.sposta(): apre la scelta della cartella; senza scelta dà null, altrimenti come leggi(). I file li sposta l'app al prossimo avvio, prima di accendere il server;
  // scegliere la cartella in uso annulla uno spostamento chiesto. Rifiuta con la frase se la cartella scelta non è vuota o sta dentro l'attuale.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    cartellaDati: Object.freeze({
      leggi: () => chiama("cartella_dati"),
      sposta: () => chiama("sposta_cartella_dati"),
    }),
  });
})();
"#;

fn leggi(stato: &Interno) -> Result<Dati, String> {
    let Esito::Pronta(attuale) = stato.lavoro.lock().unwrap().clone() else { return Err(t("La cartella dei dati non è ancora pronta.", "The data folder is not ready yet.")) };
    Ok(dati_correnti(std::env::var(VARIABILE).ok().as_deref(), &attuale, &stato.impostazioni))
}

#[tauri::command]
async fn cartella_dati(stato: State<'_, Interno>) -> Result<Dati, String> {
    leggi(&stato)
}

#[tauri::command]
async fn sposta_cartella_dati(stato: State<'_, Interno>) -> Result<Option<Dati>, String> {
    if std::env::var(VARIABILE).is_ok_and(|v| !v.is_empty()) {
        return Err(t(
            format!("La cartella dei dati la indica {VARIABILE}: per cambiarla si cambia la variabile."),
            format!("The data folder is set by {VARIABILE}: to change it, change the variable."),
        ));
    }
    let Esito::Pronta(attuale) = stato.lavoro.lock().unwrap().clone() else { return Err(t("La cartella dei dati non è ancora pronta.", "The data folder is not ready yet.")) };
    if stato.scegliendo.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let scelta = tauri::async_runtime::spawn_blocking(scegli_cartella).await.map_err(|e| e.to_string());
    stato.scegliendo.store(false, Ordering::SeqCst);
    let Some(cartella) = scelta?.map_err(|e| format!("{e:#}"))? else { return Ok(None) };
    if stesso_posto(&cartella, &attuale) {
        annulla_spostamento(&stato.impostazioni).map_err(|e| format!("{e:#}"))?;
    } else {
        controlla_destinazione(&attuale, &cartella)?;
        programma_spostamento(&stato.impostazioni, &cartella).map_err(|e| format!("{e:#}"))?;
    }
    leggi(&stato).map(Some)
}

pub fn installa(app: &tauri::App) -> tauri::Result<()> {
    app.handle().plugin(
        tauri::plugin::Builder::<tauri::Wry>::new("mango-animation-dati")
            .invoke_handler(tauri::generate_handler![cartella_dati, sposta_cartella_dati])
            .build(),
    )
}
