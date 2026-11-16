//! Lo zoom della finestra (Ctrl+ / Ctrl- / Ctrl+0, e Ctrl con la rotellina). I tasti sono quelli del browser: la finestra nasce con
//! `zoom_hotkeys_enabled`. Lo zoom vero è lo `ZoomFactor` del controller di WebView2, che non dipende dalla dimensione del testo di Windows:
//! l'app lo legge da lì quando cambia e lo tiene in `zoom.txt` nella cartella dei dati dell'app, e lo rimette alla finestra al prossimo avvio.

use crate::lingua::t;
use crate::segnalazione::nel_registro;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller;
use webview2_com::{NavigationCompletedEventHandler, ZoomFactorChangedEventHandler};

/// I limiti dello zoom del browser (WebView2: dal 25% al 500%).
const MINIMO: f64 = 0.25;
const MASSIMO: f64 = 5.0;
const FILE: &str = "zoom.txt";

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.grandezza`, per la riga «Grandezza» delle impostazioni dello studio.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  const chiama = (comando, argomenti) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|" + comando, argomenti);
  // grandezza.leggi(): lo zoom ricordato (1 è il 100%). grandezza.imposta(zoom): lo mette alla finestra e lo ricorda.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    grandezza: Object.freeze({
      leggi: () => chiama("zoom_leggi"),
      imposta: (zoom) => chiama("zoom_imposta", { zoom }),
    }),
  });
})();
"#;

#[derive(Clone, Copy)]
enum Evento {
    /// Lo `ZoomFactor` è cambiato.
    Cambio,
    /// Una navigazione è finita.
    PaginaCaricata,
}

#[derive(Debug, PartialEq)]
enum Azione {
    Salva(f64),
    Rimetti(f64),
    Niente,
}

fn arrotonda(zoom: f64) -> f64 {
    (zoom.clamp(MINIMO, MASSIMO) * 100.0).round() / 100.0
}

/// Cosa fare di uno zoom letto dal controller. Navigando verso un'altra origine WebView2 può cambiare lo zoom da sé: non è una scelta del creator, quindi non si salva;
/// a pagina caricata si rimette quello ricordato.
fn decidi(evento: Evento, navigando: bool, letto: f64, ricordato: f64) -> Azione {
    if !letto.is_finite() || letto <= 0.0 {
        return Azione::Niente;
    }
    let letto = arrotonda(letto);
    if (letto - ricordato).abs() < 0.005 {
        return Azione::Niente;
    }
    match evento {
        Evento::Cambio if navigando => Azione::Niente,
        Evento::Cambio => Azione::Salva(letto),
        Evento::PaginaCaricata => Azione::Rimetti(ricordato),
    }
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

/// Lo zoom ricordato (riletto dal file solo all'avvio) e se la finestra sta navigando.
pub struct Zoom {
    file: PathBuf,
    ricordato: Mutex<f64>,
    navigando: AtomicBool,
}

impl Zoom {
    pub fn carica(dati: &Path) -> Self {
        let file = file_dello_zoom(dati);
        let ricordato = Mutex::new(leggi(&file).unwrap_or(1.0));
        Self { file, ricordato, navigando: AtomicBool::new(false) }
    }

    pub fn inizia_navigazione(&self) {
        self.navigando.store(true, Ordering::SeqCst);
    }

    fn ricordato(&self) -> f64 {
        *self.ricordato.lock().unwrap()
    }

    fn ricorda(&self, zoom: f64) -> std::io::Result<()> {
        *self.ricordato.lock().unwrap() = zoom;
        if let Some(cartella) = self.file.parent() {
            std::fs::create_dir_all(cartella)?;
        }
        scrivi(&self.file, zoom)
    }

    fn al_cambio(&self, letto: f64) -> std::io::Result<()> {
        match decidi(Evento::Cambio, self.navigando.load(Ordering::SeqCst), letto, self.ricordato()) {
            Azione::Salva(zoom) => self.ricorda(zoom),
            _ => Ok(()),
        }
    }

    /// Chiude la navigazione; dice lo zoom da rimettere, se la navigazione l'ha cambiato.
    fn a_pagina_caricata(&self, letto: f64) -> Option<f64> {
        let azione = decidi(Evento::PaginaCaricata, self.navigando.load(Ordering::SeqCst), letto, self.ricordato());
        self.navigando.store(false, Ordering::SeqCst);
        match azione {
            Azione::Rimetti(zoom) => Some(zoom),
            _ => None,
        }
    }
}

/// Lo `ZoomFactor` del controller; NaN se non risponde (`decidi` lo ignora).
fn zoom_del(controller: &ICoreWebView2Controller) -> f64 {
    let mut zoom = f64::NAN;
    match unsafe { controller.ZoomFactor(&mut zoom) } {
        Ok(()) => zoom,
        Err(_) => f64::NAN,
    }
}

fn segui_il_controller(app: &AppHandle, controller: &ICoreWebView2Controller) -> Result<(), String> {
    let (per_il_cambio, controller_del_cambio) = (app.clone(), controller.clone());
    let cambio = ZoomFactorChangedEventHandler::create(Box::new(move |_, _| {
        if let Err(e) = per_il_cambio.state::<Zoom>().al_cambio(zoom_del(&controller_del_cambio)) {
            nel_registro(&per_il_cambio, &t(format!("Non riesco a ricordare lo zoom: {e}"), format!("I can't remember the zoom: {e}")));
        }
        Ok(())
    }));
    let (per_la_pagina, controller_della_pagina) = (app.clone(), controller.clone());
    let pagina = NavigationCompletedEventHandler::create(Box::new(move |_, _| {
        if let Some(zoom) = per_la_pagina.state::<Zoom>().a_pagina_caricata(zoom_del(&controller_della_pagina)) {
            let _ = unsafe { controller_della_pagina.SetZoomFactor(zoom) };
        }
        Ok(())
    }));
    let mut token = 0i64;
    unsafe {
        controller.add_ZoomFactorChanged(&cambio, &mut token).map_err(|e| e.to_string())?;
        controller.CoreWebView2().and_then(|web| web.add_NavigationCompleted(&pagina, &mut token)).map_err(|e| e.to_string())
    }
}

/// Ascolta il controller della finestra: un cambio di zoom fuori da una navigazione si ricorda; a navigazione finita si rimette lo zoom ricordato.
pub fn segui(finestra: &WebviewWindow) {
    let app = finestra.app_handle().clone();
    let dentro = app.clone();
    let esito = finestra.with_webview(move |webview| {
        if let Err(e) = segui_il_controller(&dentro, &webview.controller()) {
            nel_registro(&dentro, &t(format!("Non riesco ad ascoltare lo zoom della finestra: {e}"), format!("I can't listen to the window's zoom: {e}")));
        }
    });
    if let Err(e) = esito {
        nel_registro(&app, &t(format!("Non riesco ad ascoltare lo zoom della finestra: {e}"), format!("I can't listen to the window's zoom: {e}")));
    }
}

#[tauri::command]
pub(crate) fn zoom_leggi(stato: State<Zoom>) -> f64 {
    stato.ricordato()
}

#[tauri::command]
pub(crate) fn zoom_imposta(finestra: WebviewWindow, stato: State<Zoom>, zoom: f64) -> Result<(), String> {
    if !(MINIMO..=MASSIMO).contains(&zoom) {
        return Err(t(format!("zoom non valido: {zoom}"), format!("invalid zoom: {zoom}")));
    }
    let ricordato = stato.ricorda(zoom);
    finestra.set_zoom(zoom).map_err(|e| e.to_string())?;
    ricordato.map_err(|e| t(format!("non riesco a ricordare lo zoom ({}: {e})", stato.file.display()), format!("I can't remember the zoom ({}: {e})", stato.file.display())))
}

/// Mette alla finestra lo zoom ricordato, se non è il 100%.
pub fn ripristina(finestra: &WebviewWindow) {
    let zoom = finestra.app_handle().state::<Zoom>().ricordato();
    if (zoom - 1.0).abs() >= 0.005 {
        let _ = finestra.set_zoom(zoom);
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn fuori_da_una_navigazione_un_cambio_si_salva_e_a_pari_valore_no() {
        assert_eq!(decidi(Evento::Cambio, false, 1.25, 1.0), Azione::Salva(1.25));
        assert_eq!(decidi(Evento::Cambio, false, 1.0, 1.25), Azione::Salva(1.0));
        assert_eq!(decidi(Evento::Cambio, false, 1.25, 1.25), Azione::Niente);
        assert_eq!(decidi(Evento::Cambio, false, 1.2500001, 1.25), Azione::Niente);
    }

    #[test]
    fn durante_una_navigazione_un_cambio_non_e_una_scelta_del_creator() {
        assert_eq!(decidi(Evento::Cambio, true, 1.58, 1.0), Azione::Niente);
        assert_eq!(decidi(Evento::Cambio, true, 1.0, 1.25), Azione::Niente);
    }

    #[test]
    fn a_pagina_caricata_si_rimette_lo_zoom_ricordato_solo_se_e_cambiato() {
        assert_eq!(decidi(Evento::PaginaCaricata, true, 1.58, 1.0), Azione::Rimetti(1.0));
        assert_eq!(decidi(Evento::PaginaCaricata, true, 1.0, 1.25), Azione::Rimetti(1.25));
        assert_eq!(decidi(Evento::PaginaCaricata, true, 1.25, 1.25), Azione::Niente);
    }

    #[test]
    fn uno_zoom_che_il_browser_non_dice_non_si_salva() {
        for male in [f64::NAN, f64::INFINITY, 0.0, -1.0] {
            assert_eq!(decidi(Evento::Cambio, false, male, 1.0), Azione::Niente, "{male}");
        }
        assert_eq!(decidi(Evento::Cambio, false, 100.0, 1.0), Azione::Salva(MASSIMO));
        assert_eq!(decidi(Evento::Cambio, false, 0.01, 1.0), Azione::Salva(MINIMO));
    }

    #[test]
    fn un_avvio_con_il_testo_di_windows_ingrandito_non_cambia_il_file() {
        let t = tempfile::tempdir().unwrap();
        let file = file_dello_zoom(t.path());
        for avvio in 0..3 {
            let zoom = Zoom::carica(t.path());
            zoom.inizia_navigazione();
            zoom.al_cambio(1.58).unwrap();
            assert_eq!(zoom.a_pagina_caricata(1.58), Some(1.0), "avvio {avvio}");
            assert!(!file.exists(), "avvio {avvio}");
        }
    }

    #[test]
    fn un_gesto_del_creator_si_ricorda_e_il_cambio_della_navigazione_dopo_no() {
        let t = tempfile::tempdir().unwrap();
        let zoom = Zoom::carica(t.path());
        zoom.al_cambio(1.25).unwrap();
        assert_eq!(leggi(&file_dello_zoom(t.path())), Some(1.25));
        assert_eq!(zoom.ricordato(), 1.25);

        zoom.inizia_navigazione();
        zoom.al_cambio(1.0).unwrap();
        assert_eq!(zoom.a_pagina_caricata(1.0), Some(1.25));
        assert_eq!(leggi(&file_dello_zoom(t.path())), Some(1.25));

        zoom.al_cambio(1.0).unwrap();
        assert!(!file_dello_zoom(t.path()).exists());
        assert_eq!(Zoom::carica(t.path()).ricordato(), 1.0);
    }

    #[test]
    fn lo_zoom_impostato_dalle_impostazioni_si_ricorda_subito() {
        let t = tempfile::tempdir().unwrap();
        let zoom = Zoom::carica(t.path());
        zoom.ricorda(1.5).unwrap();
        assert_eq!(zoom.ricordato(), 1.5);
        assert_eq!(leggi(&file_dello_zoom(t.path())), Some(1.5));
    }

    #[test]
    fn lo_zoom_ricordato_si_rilegge_dal_file_all_avvio() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(file_dello_zoom(t.path()), "1.75").unwrap();
        assert_eq!(Zoom::carica(t.path()).ricordato(), 1.75);
        std::fs::write(file_dello_zoom(t.path()), "abc").unwrap();
        assert_eq!(Zoom::carica(t.path()).ricordato(), 1.0);
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
