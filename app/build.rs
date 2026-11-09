use tauri_build::{Attributes, DefaultPermissionRule, InlinedPlugin};

fn main() {
    // Il colore della barra del titolo (src/titolo.rs) lo chiede anche la pagina dello studio, che è
    // remota (127.0.0.1): un comando remoto vuole un plugin con permessi suoi, non basta un comando dell'app.
    let titolo = InlinedPlugin::new().commands(&["colore_barra_titolo"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // Lo stesso per la dettatura (src/voce/): il suo ponte `window.__MANGO_ANIMATION__.voce` chiama questi tre comandi.
    let voce = InlinedPlugin::new().commands(&["voce_stato", "voce_avvia", "voce_ferma"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per la cartella dei dati (src/dati.rs): leggerla e cambiarla dallo studio.
    let dati = InlinedPlugin::new().commands(&["cartella_dati", "sposta_cartella_dati"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per gli appunti (src/appunti.rs): i file copiati in Esplora risorse.
    let appunti = InlinedPlugin::new().commands(&["appunti_percorsi"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per il computer (src/computer/ponte.rs): cosa c'è, per la pagina «Motori» dello studio.
    let computer = InlinedPlugin::new().commands(&["computer_leggi"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per la lingua (src/lingua.rs): lo studio dice all'app in che lingua è, per le pagine dell'app.
    let lingua = InlinedPlugin::new().commands(&["lingua_dello_studio"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per le segnalazioni (src/segnalazione/): «Segnala un problema» e il registro `ui.log` delle pagine, anche quelle remote.
    let segnalazione = InlinedPlugin::new().commands(&["segnala_problema", "scrivi_ui_log", "segnalazione_invio_attivo"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // E per lo zoom (src/zoom.rs): la pagina dice all'app la sua scala dopo un Ctrl+ / Ctrl- / Ctrl+0.
    let zoom = InlinedPlugin::new().commands(&["ricorda_zoom"]).default_permission(DefaultPermissionRule::AllowAllCommands);
    // Le prove che usano l'app finta di Tauri (`tests/`) vogliono il manifesto con i controlli di Windows nuovi, come l'app vera: senza, non partono.
    let manifesto = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").expect("cartella dell'app")).join("prove").join("test.manifest");
    println!("cargo:rerun-if-env-changed=MANGO_ANIMATION_SENTRY_DSN");
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifesto.display());
    println!("cargo:rerun-if-changed={}", manifesto.display());
    tauri_build::try_build(
        Attributes::new()
            .plugin("mango-animation-titolo", titolo)
            .plugin("mango-animation-voce", voce)
            .plugin("mango-animation-dati", dati)
            .plugin("mango-animation-appunti", appunti)
            .plugin("mango-animation-computer", computer)
            .plugin("mango-animation-lingua", lingua)
            .plugin("mango-animation-segnalazione", segnalazione)
            .plugin("mango-animation-zoom", zoom),
    )
    .expect("tauri-build");
}
