use tauri_build::{Attributes, DefaultPermissionRule, InlinedPlugin};

fn main() {
    // I comandi che le pagine remote chiamano (lo studio è su 127.0.0.1): un comando remoto vuole un plugin con permessi suoi, non basta un comando dell'app.
    // Gli stessi sono nel gestore di `prepara` (src/lib.rs); una prova guarda che coincidano.
    let ponte = InlinedPlugin::new()
        .commands(&[
            "colore_barra_titolo",
            "voce_stato",
            "voce_avvia",
            "voce_ferma",
            "cartella_dati",
            "sposta_cartella_dati",
            "appunti_percorsi",
            "computer_leggi",
            "lingua_dello_studio",
            "segnala_problema",
            "scrivi_ui_log",
            "segnalazione_invio_attivo",
            "ricorda_zoom",
        ])
        .default_permission(DefaultPermissionRule::AllowAllCommands);
    // Le prove che usano l'app finta di Tauri (`tests/`) vogliono il manifesto con i controlli di Windows nuovi, come l'app vera: senza, non partono.
    let manifesto = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").expect("cartella dell'app")).join("prove").join("test.manifest");
    println!("cargo:rerun-if-env-changed=MANGO_ANIMATION_SENTRY_DSN");
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifesto.display());
    println!("cargo:rerun-if-changed={}", manifesto.display());
    tauri_build::try_build(Attributes::new().plugin("mango-animation", ponte)).expect("tauri-build");
}
