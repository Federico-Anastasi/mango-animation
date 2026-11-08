//! I file lasciati sulla finestra. Il trascinamento di Tauri è acceso: è l'unico modo, su Windows, di avere il percorso del file
//! (la pagina riceve solo il contenuto), e così un video grande si collega senza copiarlo. Con il trascinamento di Tauri acceso la
//! pagina non riceve più `dragenter` e `drop` dei file: li riceve come eventi `mango-trascinamento` sulla finestra.

use serde_json::{json, Value};
use tauri::{DragDropEvent, WebviewWindow, WindowEvent};

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.trascinamento`.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  // trascinamento.su(f): riceve { tipo: "entra" | "sopra" | "lascia" | "esce", x, y, percorsi } mentre dei file di Esplora risorse
  // passano sulla finestra. x e y sono in pixel della pagina (come clientX e clientY); i percorsi ci sono solo con «entra» e «lascia»
  // (possono essere anche cartelle). «esce» vale anche per un trascinamento annullato. Restituisce la funzione che smette di ascoltare.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    trascinamento: Object.freeze({
      su: (f) => {
        const ascolta = (e) => f(e.detail);
        window.addEventListener("mango-trascinamento", ascolta);
        return () => window.removeEventListener("mango-trascinamento", ascolta);
      },
    }),
  });
})();
"#;

/// Ciò che la pagina riceve per un evento di trascinamento; `scala` è quella della finestra (la posizione di Tauri è in pixel fisici).
fn evento_per_la_pagina(evento: &DragDropEvent, scala: f64) -> Value {
    let percorsi = |p: &[std::path::PathBuf]| p.iter().map(|p| p.display().to_string()).collect::<Vec<_>>();
    let punto = |x: f64, y: f64| (x / scala, y / scala);
    match evento {
        DragDropEvent::Enter { paths, position } => {
            let (x, y) = punto(position.x, position.y);
            json!({ "tipo": "entra", "x": x, "y": y, "percorsi": percorsi(paths) })
        }
        DragDropEvent::Over { position } => {
            let (x, y) = punto(position.x, position.y);
            json!({ "tipo": "sopra", "x": x, "y": y })
        }
        DragDropEvent::Drop { paths, position } => {
            let (x, y) = punto(position.x, position.y);
            json!({ "tipo": "lascia", "x": x, "y": y, "percorsi": percorsi(paths) })
        }
        _ => json!({ "tipo": "esce" }),
    }
}

/// I file lasciati sulla finestra arrivano alla pagina come eventi `mango-trascinamento`.
pub fn installa(finestra: &WebviewWindow) {
    let destinazione = finestra.clone();
    finestra.on_window_event(move |evento| {
        let WindowEvent::DragDrop(trascinamento) = evento else { return };
        let dettaglio = evento_per_la_pagina(trascinamento, destinazione.scale_factor().unwrap_or(1.0));
        let _ = destinazione.eval(format!("window.dispatchEvent(new CustomEvent('mango-trascinamento',{{detail:{dettaglio}}}))"));
    });
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::path::PathBuf;
    use tauri::PhysicalPosition;

    fn posizione(x: f64, y: f64) -> PhysicalPosition<f64> {
        PhysicalPosition::new(x, y)
    }

    #[test]
    fn la_posizione_arriva_in_pixel_della_pagina_e_i_percorsi_per_intero() {
        let video = PathBuf::from(r"D:\video\giro lungo.mov");
        let lascia = evento_per_la_pagina(&DragDropEvent::Drop { paths: vec![video.clone()], position: posizione(300.0, 150.0) }, 1.5);
        assert_eq!(lascia, json!({ "tipo": "lascia", "x": 200.0, "y": 100.0, "percorsi": [r"D:\video\giro lungo.mov"] }));
        let entra = evento_per_la_pagina(&DragDropEvent::Enter { paths: vec![video], position: posizione(30.0, 15.0) }, 1.0);
        assert_eq!(entra["tipo"], "entra");
        assert_eq!(entra["percorsi"], json!([r"D:\video\giro lungo.mov"]));
    }

    #[test]
    fn passando_sopra_non_servono_i_percorsi_e_uscire_non_ha_posizione() {
        assert_eq!(evento_per_la_pagina(&DragDropEvent::Over { position: posizione(10.0, 20.0) }, 2.0), json!({ "tipo": "sopra", "x": 5.0, "y": 10.0 }));
        assert_eq!(evento_per_la_pagina(&DragDropEvent::Leave, 2.0), json!({ "tipo": "esce" }));
    }

    #[test]
    fn il_ponte_ha_il_nome_che_lo_studio_cerca() {
        assert!(PONTE.contains("trascinamento: Object.freeze") && PONTE.contains("mango-trascinamento"));
    }
}
