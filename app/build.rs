use std::path::Path;
use tauri_build::{Attributes, DefaultPermissionRule, InlinedPlugin};

/// Rende `a` uguale a `da`, scrivendo solo i file che cambiano: una scrittura in `ui/` fa ricostruire l'app.
fn rispecchia(da: &Path, a: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(a)?;
    for voce in std::fs::read_dir(a)? {
        let voce = voce?;
        if da.join(voce.file_name()).exists() {
            continue;
        }
        if voce.file_type()?.is_dir() {
            std::fs::remove_dir_all(voce.path())?;
        } else {
            std::fs::remove_file(voce.path())?;
        }
    }
    for voce in std::fs::read_dir(da)? {
        let voce = voce?;
        let copia = a.join(voce.file_name());
        if voce.file_type()?.is_dir() {
            rispecchia(&voce.path(), &copia)?;
        } else {
            let contenuto = std::fs::read(voce.path())?;
            if std::fs::read(&copia).ok().as_ref() != Some(&contenuto) {
                std::fs::write(&copia, contenuto)?;
            }
        }
    }
    Ok(())
}

fn main() {
    // Le pagine dell'app vedono solo `ui/`: i file comuni alle app Mango (`suite/`, nella radice) ci arrivano copiati, prima che Tauri li impacchetti.
    let app = Path::new(env!("CARGO_MANIFEST_DIR"));
    let suite = app.join("..").join("suite");
    println!("cargo:rerun-if-changed={}", suite.display());
    rispecchia(&suite, &app.join("ui").join("suite")).expect("la copia di suite/ in ui/");

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
            "zoom_leggi",
            "zoom_imposta",
            "aiuto_leggi",
            "aiuto_controlla",
            "aiuto_aggiorna_da_solo",
            "aiuto_aggiorna_ora",
            "aiuto_apri_registri",
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
