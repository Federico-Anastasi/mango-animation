//! Gli appunti di Windows visti dallo studio: i file copiati in Esplora risorse (`CF_HDROP`), che una pagina WebView2 non
//! sempre riceve come file nell'evento di incolla. Come la dettatura, passa da un plugin con permessi suoi (`build.rs`,
//! `capabilities/default.json`) perché lo studio è una pagina remota (127.0.0.1).

use clipboard_win::{formats, get_clipboard, is_format_avail};
use std::path::Path;

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.appunti`.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  // appunti.percorsi(): i percorsi dei file copiati in Esplora risorse; vuoto se negli appunti non ce ne sono. Rifiuta con la frase
  // di cosa non è andato (appunti usati da un altro programma).
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    appunti: Object.freeze({
      percorsi: () => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation-appunti|appunti_percorsi"),
    }),
  });
})();
"#;

/// I comandi del plugin: gli stessi in `build.rs` (permessi), in `PONTE` e in `capabilities/`.
#[cfg(test)]
const COMANDI: [&str; 1] = ["appunti_percorsi"];

/// Delle voci della lista dei file negli appunti, quelle che sono file: una cartella copiata non si allega.
fn solo_file(percorsi: Vec<String>) -> Vec<String> {
    percorsi.into_iter().filter(|p| Path::new(p).is_file()).collect()
}

fn leggi() -> Result<Vec<String>, String> {
    if !is_format_avail(formats::CF_HDROP) {
        return Ok(Vec::new());
    }
    let lista: Vec<String> = get_clipboard(formats::FileList).map_err(|e| format!("Non riesco a leggere gli appunti: {e}"))?;
    Ok(solo_file(lista))
}

#[tauri::command]
async fn appunti_percorsi() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(leggi).await.map_err(|e| e.to_string())?
}

pub fn installa(app: &tauri::App) -> tauri::Result<()> {
    app.handle().plugin(
        tauri::plugin::Builder::<tauri::Wry>::new("mango-animation-appunti")
            .invoke_handler(tauri::generate_handler![appunti_percorsi])
            .build(),
    )
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn dei_percorsi_degli_appunti_restano_solo_i_file_che_ci_sono() {
        let t = tempfile::tempdir().unwrap();
        let file = t.path().join("nota di prova.txt");
        std::fs::write(&file, "x").unwrap();
        let cartella = t.path().join("una cartella");
        std::fs::create_dir(&cartella).unwrap();
        let sparito = t.path().join("sparito.txt");
        let tutti = [&cartella, &file, &sparito].map(|p| p.display().to_string()).to_vec();
        assert_eq!(solo_file(tutti), vec![file.display().to_string()]);
        assert!(solo_file(Vec::new()).is_empty());
    }

    #[test]
    fn il_ponte_i_permessi_e_la_capability_dicono_gli_stessi_comandi() {
        let (build, capability) = (include_str!("../build.rs"), include_str!("../capabilities/default.json"));
        for comando in COMANDI {
            assert!(PONTE.contains(&format!("\"plugin:mango-animation-appunti|{comando}\"")), "{comando} non è nel ponte");
            assert!(build.contains(&format!("\"{comando}\"")), "{comando} non è nei permessi di build.rs");
        }
        assert!(build.contains("\"mango-animation-appunti\"") && capability.contains("mango-animation-appunti:default"));
    }

    #[test]
    fn il_ponte_ha_il_nome_che_lo_studio_cerca() {
        assert!(PONTE.contains("appunti: Object.freeze") && PONTE.contains("percorsi:"));
    }
}
