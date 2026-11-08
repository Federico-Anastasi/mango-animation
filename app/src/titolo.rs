//! La barra del titolo di Windows, dello stesso colore della pagina che la finestra mostra (la pagina
//! d'attesa dell'app o lo studio): un plugin a parte, perché lo studio è una pagina remota (127.0.0.1)
//! e un comando remoto vuole permessi suoi (`capabilities/default.json`).

use tauri::plugin::Builder;
use tauri::{App, Wry};

/// Legge il colore di sfondo della pagina e lo manda alla finestra; si ripete a ogni cambio di tema.
pub const SINCRONIA: &str = r#"
(() => {
  const call = (r, g, b) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation-titolo|colore_barra_titolo", { r, g, b }).catch(() => {});
  let ultimo = "";
  const sfondo = (el) => {
    for (; el; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] === undefined || +m[4] > 0.5)) return [+m[1], +m[2], +m[3]].map(Math.round);
    }
    return null;
  };
  const sincronizza = () => {
    if (!document.body) return;
    const rgb = sfondo(document.elementFromPoint(innerWidth / 2, 2)) || sfondo(document.body);
    if (!rgb || rgb.join() === ultimo) return;
    ultimo = rgb.join();
    call(...rgb);
  };
  addEventListener("DOMContentLoaded", sincronizza);
  addEventListener("load", sincronizza);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(sincronizza, 50));
  setInterval(sincronizza, 1000);
})();
"#;

#[tauri::command]
fn colore_barra_titolo(finestra: tauri::WebviewWindow, r: u8, g: u8, b: u8) -> Result<(), String> {
    use windows::Win32::Foundation::{BOOL, HWND};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR, DWMWA_USE_IMMERSIVE_DARK_MODE};
    let hwnd = HWND(finestra.hwnd().map_err(|e| e.to_string())?.0);
    // luminanza percepita: sopra metà scala lo sfondo è chiaro
    let scuro = (299 * r as u32 + 587 * g as u32 + 114 * b as u32) / 1000 < 128;
    let didascalia: u32 = r as u32 | (g as u32) << 8 | (b as u32) << 16; // COLORREF = 0x00BBGGRR
    let testo: u32 = if scuro { 0x00F0F0F0 } else { 0x00101010 };
    let tema_scuro = BOOL::from(scuro);
    unsafe {
        let imposta = |attr, dati: *const std::ffi::c_void, misura: usize| DwmSetWindowAttribute(hwnd, attr, dati, misura as u32);
        imposta(DWMWA_USE_IMMERSIVE_DARK_MODE, &tema_scuro as *const _ as _, std::mem::size_of::<BOOL>()).map_err(|e| e.to_string())?;
        imposta(DWMWA_CAPTION_COLOR, &didascalia as *const _ as _, 4).map_err(|e| e.to_string())?;
        imposta(DWMWA_TEXT_COLOR, &testo as *const _ as _, 4).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn installa(app: &App) -> tauri::Result<()> {
    app.handle().plugin(Builder::<Wry>::new("mango-animation-titolo").invoke_handler(tauri::generate_handler![colore_barra_titolo]).build())
}
