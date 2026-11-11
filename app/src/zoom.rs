//! Lo zoom della finestra (Ctrl+ / Ctrl- / Ctrl+0, e Ctrl con la rotellina). I tasti sono quelli del browser: la finestra nasce con
//! `zoom_hotkeys_enabled`. La pagina (l'app o lo studio, che è remoto: un plugin con permessi suoi in `build.rs` e `capabilities/`) dice all'app la sua
//! scala dopo un cambio (`ricorda_zoom`); l'app la tiene in `zoom.txt` nella cartella dei dati dell'app e la rimette alla finestra al prossimo avvio.

use crate::lingua::t;
use std::path::{Path, PathBuf};
use tauri::{Manager, WebviewWindow};

/// I limiti dello zoom del browser (WebView2: dal 25% al 500%).
const MINIMO: f64 = 0.25;
const MASSIMO: f64 = 5.0;
const FILE: &str = "zoom.txt";

/// Lo script che la finestra esegue in ogni pagina: 800 ms dopo l'ultimo cambio di misura dice all'app la scala della pagina (`devicePixelRatio`, che porta con sé lo zoom).
pub const SINCRONIA: &str = r#"
(() => {
  if (window.top !== window) return;
  let attesa;
  addEventListener("resize", () => {
    clearTimeout(attesa);
    attesa = setTimeout(() => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|ricorda_zoom", { scalaPagina: devicePixelRatio }).catch(() => {}), 800);
  });
})();
"#;

/// Lo zoom di una pagina: la sua scala sulla scala dello schermo, a due decimali.
fn zoom_di(scala_pagina: f64, scala_schermo: f64) -> f64 {
    ((scala_pagina / scala_schermo).clamp(MINIMO, MASSIMO) * 100.0).round() / 100.0
}

fn file_dello_zoom(dati: &Path) -> PathBuf {
    dati.join(FILE)
}

/// Lo zoom ricordato, se c'è ed è un numero che il browser accetta.
fn leggi(file: &Path) -> Option<f64> {
    let zoom: f64 = std::fs::read_to_string(file).ok()?.trim().parse().ok()?;
    (MINIMO..=MASSIMO).contains(&zoom).then_some(zoom)
}

/// Ricorda lo zoom; al 100% il file sparisce (è lo zoom di serie).
fn scrivi(file: &Path, zoom: f64) -> std::io::Result<()> {
    if (zoom - 1.0).abs() < 0.005 {
        return match std::fs::remove_file(file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    std::fs::write(file, zoom.to_string())
}

#[tauri::command]
pub(crate) fn ricorda_zoom(finestra: WebviewWindow, scala_pagina: f64) -> Result<(), String> {
    if !scala_pagina.is_finite() || scala_pagina <= 0.0 {
        return Err(t(format!("scala della pagina non valida: {scala_pagina}"), format!("invalid page scale: {scala_pagina}")));
    }
    let schermo = finestra.scale_factor().map_err(|e| e.to_string())?;
    let dati = finestra.app_handle().path().app_local_data_dir().map_err(|e| e.to_string())?;
    let file = file_dello_zoom(&dati);
    std::fs::create_dir_all(&dati).and_then(|()| scrivi(&file, zoom_di(scala_pagina, schermo))).map_err(|e| t(format!("non riesco a ricordare lo zoom ({}: {e})", file.display()), format!("I can't remember the zoom ({}: {e})", file.display())))
}

/// Mette alla finestra lo zoom ricordato, se c'è.
pub fn ripristina(finestra: &WebviewWindow) {
    if let Some(zoom) = finestra.app_handle().path().app_local_data_dir().ok().and_then(|dati| leggi(&file_dello_zoom(&dati))) {
        let _ = finestra.set_zoom(zoom);
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn lo_zoom_e_la_scala_della_pagina_sulla_scala_dello_schermo() {
        assert_eq!(zoom_di(1.75, 1.75), 1.0);
        assert_eq!(zoom_di(1.75 * 1.25, 1.75), 1.25);
        assert_eq!(zoom_di(1.5 * 0.9, 1.5), 0.9);
        assert_eq!(zoom_di(1.0, 1.75), 0.57);
        assert_eq!(zoom_di(100.0, 1.0), MASSIMO);
        assert_eq!(zoom_di(0.01, 1.0), MINIMO);
    }

    #[test]
    fn lo_zoom_sta_in_un_file_e_il_cento_per_cento_lo_toglie() {
        let t = tempfile::tempdir().unwrap();
        let file = file_dello_zoom(t.path());
        assert_eq!(leggi(&file), None);
        scrivi(&file, 1.25).unwrap();
        assert_eq!(leggi(&file), Some(1.25));
        scrivi(&file, 0.57).unwrap();
        assert_eq!(leggi(&file), Some(0.57));
        scrivi(&file, 1.0).unwrap();
        assert_eq!(leggi(&file), None);
        assert!(!file.exists());
        scrivi(&file, 1.0).unwrap();
    }

    #[test]
    fn un_file_che_non_e_un_numero_che_il_browser_accetta_non_conta() {
        let t = tempfile::tempdir().unwrap();
        let file = file_dello_zoom(t.path());
        for male in ["", "abc", "0", "9", "-1", "NaN", "0.1"] {
            std::fs::write(&file, male).unwrap();
            assert_eq!(leggi(&file), None, "{male:?}");
        }
        std::fs::write(&file, " 1.5\n").unwrap();
        assert_eq!(leggi(&file), Some(1.5), "uno spazio o un a capo non guastano");
    }
}
