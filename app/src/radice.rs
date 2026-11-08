//! Dove sta il codice di Mango Animation: la cartella con `CLAUDE.md` e `server/`. Nell'app installata sta in `codice/`, accanto all'eseguibile;
//! nella cartella di chi sviluppa, sopra l'eseguibile costruito (`app/target/release/`).

use crate::lingua::t;
use anyhow::{bail, Result};
use std::path::{Path, PathBuf};

fn e_radice(cartella: &Path) -> bool {
    cartella.join("CLAUDE.md").is_file() && cartella.join("server").is_dir()
}

/// Con `da_ambiente` (`MANGO_ANIMATION_RADICE`) vale quella cartella; altrimenti si risale da `partenza` e poi si guarda `codice/` accanto a `partenza`.
pub fn trova_radice(partenza: &Path, da_ambiente: Option<&str>) -> Result<PathBuf> {
    if let Some(indicata) = da_ambiente.filter(|v| !v.is_empty()) {
        let cartella = PathBuf::from(indicata);
        if e_radice(&cartella) {
            return Ok(cartella);
        }
        bail!(
            "{}",
            t(
                format!("MANGO_ANIMATION_RADICE («{indicata}») non è la cartella del codice di Mango Animation: manca CLAUDE.md o server/."),
                format!("MANGO_ANIMATION_RADICE (“{indicata}”) is not the Mango Animation code folder: CLAUDE.md or server/ is missing."),
            )
        );
    }
    // Prima il repo sopra l'eseguibile, poi `codice` accanto (l'app installata): nel repo le cartelle `codice` sono copie per l'installatore.
    match partenza.ancestors().map(Path::to_path_buf).chain(std::iter::once(partenza.join("codice"))).find(|c| e_radice(c)) {
        Some(cartella) => Ok(cartella),
        None => bail!(
            "{}",
            t(
                format!(
                    "Non trovo la cartella del codice di Mango Animation risalendo da {}. L'app va tenuta dentro quella cartella, \
                     oppure si indica la cartella con la variabile MANGO_ANIMATION_RADICE.",
                    partenza.display()
                ),
                format!(
                    "I can't find the Mango Animation code folder going up from {}. The app must be kept inside that folder, \
                     or you set the folder with the variable MANGO_ANIMATION_RADICE.",
                    partenza.display()
                ),
            )
        ),
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    fn finta_radice() -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("CLAUDE.md"), "x").unwrap();
        std::fs::create_dir(t.path().join("server")).unwrap();
        t
    }

    #[test]
    fn nell_app_installata_il_codice_sta_in_codice_accanto_all_eseguibile() {
        let t = tempfile::tempdir().unwrap();
        let codice = t.path().join("Mango Animation").join("codice");
        std::fs::create_dir_all(codice.join("server")).unwrap();
        std::fs::write(codice.join("CLAUDE.md"), "x").unwrap();
        assert_eq!(trova_radice(&t.path().join("Mango Animation"), None).unwrap(), codice);
        // Una cartella `codice` che non è il codice (niente CLAUDE.md e server/) non conta.
        assert!(trova_radice(t.path(), None).is_err());
    }

    #[test]
    fn risale_dalle_sottocartelle() {
        let r = finta_radice();
        let giu = r.path().join("app").join("target").join("release");
        std::fs::create_dir_all(&giu).unwrap();
        assert_eq!(trova_radice(&giu, None).unwrap(), r.path());
    }

    #[test]
    fn dal_repo_vince_il_repo_non_la_copia_preparata_per_l_installatore() {
        let r = finta_radice();
        let copia = r.path().join("app").join("target").join("codice");
        std::fs::create_dir_all(copia.join("server")).unwrap();
        std::fs::write(copia.join("CLAUDE.md"), "x").unwrap();
        let giu = r.path().join("app").join("target").join("release");
        std::fs::create_dir_all(&giu).unwrap();
        assert_eq!(trova_radice(&giu, None).unwrap(), r.path());
    }

    #[test]
    fn dal_repo_vince_il_repo_anche_con_codice_accanto_all_eseguibile() {
        // La costruzione dell'installatore lascia `codice/` anche accanto all'eseguibile di `app/target/release/`.
        let r = finta_radice();
        let giu = r.path().join("app").join("target").join("release");
        std::fs::create_dir_all(giu.join("codice").join("server")).unwrap();
        std::fs::write(giu.join("codice").join("CLAUDE.md"), "x").unwrap();
        assert_eq!(trova_radice(&giu, None).unwrap(), r.path());
    }

    #[test]
    fn la_variabile_vince_sulla_posizione() {
        let r = finta_radice();
        let altrove = tempfile::tempdir().unwrap();
        let v = r.path().to_str().unwrap();
        assert_eq!(trova_radice(altrove.path(), Some(v)).unwrap(), r.path());
    }

    #[test]
    fn una_variabile_sbagliata_e_un_errore_in_italiano() {
        let r = finta_radice();
        let vuota = tempfile::tempdir().unwrap();
        let e = trova_radice(r.path(), Some(vuota.path().to_str().unwrap())).unwrap_err().to_string();
        assert!(e.contains("MANGO_ANIMATION_RADICE") && e.contains("non è la cartella del codice di Mango Animation"), "{e}");
    }

    #[test]
    fn senza_radice_lo_dice() {
        let vuota = tempfile::tempdir().unwrap();
        let e = trova_radice(vuota.path(), None).unwrap_err().to_string();
        assert!(e.contains("Non trovo la cartella del codice di Mango Animation"), "{e}");
    }

    #[test]
    fn gli_errori_sulla_radice_escono_anche_in_inglese() {
        crate::lingua::con(crate::lingua::Lingua::En, || {
            let r = finta_radice();
            let vuota = tempfile::tempdir().unwrap();
            let e = trova_radice(r.path(), Some(vuota.path().to_str().unwrap())).unwrap_err().to_string();
            assert!(e.contains("MANGO_ANIMATION_RADICE") && e.contains("is not the Mango Animation code folder"), "{e}");
            let e = trova_radice(vuota.path(), None).unwrap_err().to_string();
            assert!(e.contains("I can't find the Mango Animation code folder"), "{e}");
        });
    }
}
