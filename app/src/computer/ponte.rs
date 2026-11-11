//! Cosa c'è in questo computer, per la pagina «Motori» dello studio: `window.__MANGO_ANIMATION__.computer.leggi()`. Come la dettatura, passa da un plugin
//! con permessi suoi (`build.rs`, `capabilities/default.json`) perché lo studio è una pagina remota (127.0.0.1).

use super::hw::{self, Computer};
use tauri::Manager;

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.computer`.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  // computer.leggi(): { schede: [{ indice, nome, memoria_mb, libera_mb, capacita }], processore, thread, ram_mb, disco_libero_mb }
  // (le schede sono quelle NVIDIA, nell'ordine di nvidia-smi; senza scheda l'elenco è vuoto; il disco è quello dove l'app scarica).
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    computer: Object.freeze({
      leggi: () => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|computer_leggi"),
    }),
  });
})();
"#;

#[tauri::command]
pub(crate) async fn computer_leggi(app: tauri::AppHandle) -> Result<Computer, String> {
    let dati = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("computer");
    // `nvidia-smi` si lancia: fuori dal thread della pagina.
    tauri::async_runtime::spawn_blocking(move || hw::leggi(&dati)).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod prove {
    use super::*;


    #[test]
    fn il_ponte_ha_il_nome_che_lo_studio_cerca() {
        assert!(PONTE.contains("computer: Object.freeze") && PONTE.contains("leggi:"));
    }

    #[test]
    fn cio_che_il_ponte_da_ha_i_campi_che_il_ponte_promette() {
        let t = tempfile::tempdir().unwrap();
        let json = serde_json::to_value(hw::leggi(t.path())).unwrap();
        for campo in ["schede", "processore", "thread", "ram_mb", "disco_libero_mb"] {
            assert!(json.get(campo).is_some(), "manca {campo}");
            assert!(PONTE.contains(campo), "il ponte non dice {campo}");
        }
    }
}
