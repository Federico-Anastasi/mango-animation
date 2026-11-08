//! Il profilo del creator (`profilo.json` nella cartella dei dati), per la sola sezione `motori` (`docs/MOTORI.md`): quali funzioni pesanti sono accese.
//! Lo legge l'app per sapere cosa scaricare, e lo scrive quando il creator cambia le funzioni nella pagina d'avvio, prima che il server (che ha `PUT /api/motori`) sia acceso.

use crate::lingua::t;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

fn file(lavoro: &Path) -> std::path::PathBuf {
    lavoro.join("profilo.json")
}

fn leggi_json(percorso: &Path, cosa: &str) -> Result<Value, String> {
    match fs::read_to_string(percorso) {
        Ok(testo) => serde_json::from_str(&testo).map_err(|e| t(format!("{cosa} è scritto male e non si legge ({e})"), format!("{cosa} is badly written and cannot be read ({e})"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(t(format!("non riesco a leggere {cosa} ({e})"), format!("I can't read {cosa} ({e})"))),
    }
}

/// Il profilo, o `{}` se non c'è.
pub fn leggi(lavoro: &Path) -> Result<Value, String> {
    leggi_json(&file(lavoro), &t("il profilo (profilo.json)", "the profile (profilo.json)"))
}

/// Uno stile (`stile.json`), o `{}` se non c'è: serve solo a sapere quali modelli chiede.
pub fn leggi_stile(percorso: &Path) -> Result<Value, String> {
    leggi_json(percorso, &t(format!("lo stile ({})", percorso.display()), format!("the style ({})", percorso.display())))
}

/// Scrive `motori.<funzione>.attiva` per le funzioni in `cambi`, lasciando tutto il resto del profilo com'è (e com'è ordinato). Senza profilo lo crea.
pub fn scrivi_funzioni(lavoro: &Path, cambi: &BTreeMap<String, bool>) -> Result<(), String> {
    let mut profilo = leggi(lavoro)?;
    let radice = profilo.as_object_mut().ok_or_else(|| t("il profilo (profilo.json) non è scritto come dovrebbe", "the profile (profilo.json) is not written the way it should be"))?;
    if radice.is_empty() {
        radice.insert("versione".into(), json!(1));
    }
    let motori = radice.entry("motori").or_insert_with(|| Value::Object(Map::new())).as_object_mut().ok_or_else(|| t("«motori» del profilo non è scritto come dovrebbe", "“motori” in the profile is not written the way it should be"))?;
    for (funzione, attiva) in cambi {
        let voce = motori.entry(funzione.as_str()).or_insert_with(|| Value::Object(Map::new())).as_object_mut().ok_or_else(|| t(format!("«motori.{funzione}» del profilo non è scritto come dovrebbe"), format!("“motori.{funzione}” in the profile is not written the way it should be")))?;
        voce.insert("attiva".into(), json!(attiva));
    }
    let testo = serde_json::to_string_pretty(&profilo).map_err(|e| e.to_string())? + "\n";
    let temporaneo = file(lavoro).with_extension("json.nuovo");
    fs::write(&temporaneo, testo).map_err(|e| t(format!("non riesco a scrivere il profilo ({e})"), format!("I can't write the profile ({e})")))?;
    fs::rename(&temporaneo, file(lavoro)).map_err(|e| t(format!("non riesco a mettere al suo posto il profilo ({e})"), format!("I can't put the profile back in place ({e})")))
}

#[cfg(test)]
mod prove {
    use super::*;

    fn cambi(coppie: &[(&str, bool)]) -> BTreeMap<String, bool> {
        coppie.iter().map(|(f, a)| ((*f).to_owned(), *a)).collect()
    }

    #[test]
    fn senza_profilo_lo_crea_con_la_versione_e_le_funzioni_cambiate() {
        let t = tempfile::tempdir().unwrap();
        assert_eq!(leggi(t.path()), Ok(json!({})));
        scrivi_funzioni(t.path(), &cambi(&[("sagoma", false)])).unwrap();
        assert_eq!(leggi(t.path()).unwrap(), json!({ "versione": 1, "motori": { "sagoma": { "attiva": false } } }));
    }

    #[test]
    fn in_un_profilo_che_c_e_cambia_solo_attiva_e_lascia_il_resto_com_e_e_com_e_ordinato() {
        let t = tempfile::tempdir().unwrap();
        let prima = r#"{
  "versione": 1,
  "creator": { "nome": "Creator di esempio", "lingua": "it" },
  "motori": {
    "trascrizione": { "attiva": true, "dove": "scheda", "modello": "large-v3-turbo" },
    "sagoma": { "dove": "processore" }
  },
  "macchina": { "scheda_video": 1 }
}
"#;
        std::fs::write(t.path().join("profilo.json"), prima).unwrap();
        scrivi_funzioni(t.path(), &cambi(&[("sagoma", false), ("dettatura", false)])).unwrap();
        let dopo = std::fs::read_to_string(t.path().join("profilo.json")).unwrap();
        let v: Value = serde_json::from_str(&dopo).unwrap();
        assert_eq!(v["motori"]["sagoma"], json!({ "dove": "processore", "attiva": false }));
        assert_eq!(v["motori"]["trascrizione"], json!({ "attiva": true, "dove": "scheda", "modello": "large-v3-turbo" }));
        assert_eq!(v["motori"]["dettatura"], json!({ "attiva": false }));
        assert_eq!(v["creator"], json!({ "nome": "Creator di esempio", "lingua": "it" }));
        assert_eq!(v["macchina"], json!({ "scheda_video": 1 }));
        // L'ordine delle sezioni è quello di prima: creator, motori, macchina.
        let posizione = |s: &str| dopo.find(s).unwrap();
        assert!(posizione("\"creator\"") < posizione("\"motori\"") && posizione("\"motori\"") < posizione("\"macchina\""));
        assert!(!t.path().join("profilo.json.nuovo").exists());
    }

    #[test]
    fn un_profilo_che_non_si_legge_non_si_tocca() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("profilo.json"), "{ non è json").unwrap();
        let errore = scrivi_funzioni(t.path(), &cambi(&[("sagoma", false)])).unwrap_err();
        assert!(errore.contains("scritto male"), "{errore}");
        assert_eq!(std::fs::read_to_string(t.path().join("profilo.json")).unwrap(), "{ non è json");
        assert!(leggi(t.path()).unwrap_err().contains("profilo.json"));
    }

    #[test]
    fn una_sezione_motori_che_non_e_un_oggetto_si_dice_e_non_si_riscrive() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("profilo.json"), r#"{ "motori": 3 }"#).unwrap();
        assert!(scrivi_funzioni(t.path(), &cambi(&[("sagoma", false)])).unwrap_err().contains("motori"));
        assert_eq!(std::fs::read_to_string(t.path().join("profilo.json")).unwrap(), r#"{ "motori": 3 }"#);
    }

    #[test]
    fn uno_stile_che_non_c_e_e_vuoto_e_uno_scritto_male_si_dice() {
        let t = tempfile::tempdir().unwrap();
        assert_eq!(leggi_stile(&t.path().join("stile.json")), Ok(json!({})));
        std::fs::write(t.path().join("stile.json"), "x").unwrap();
        assert!(leggi_stile(&t.path().join("stile.json")).unwrap_err().contains("stile.json"));
    }

    #[test]
    fn gli_errori_sul_profilo_escono_nelle_due_lingue() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("profilo.json"), "{ non è json").unwrap();
        let it = leggi(t.path()).unwrap_err();
        assert!(it.starts_with("il profilo (profilo.json) è scritto male e non si legge"), "{it}");
        let en = crate::lingua::con(crate::lingua::Lingua::En, || leggi(t.path()).unwrap_err());
        assert!(en.starts_with("the profile (profilo.json) is badly written and cannot be read"), "{en}");

        std::fs::write(t.path().join("profilo.json"), r#"{ "motori": 3 }"#).unwrap();
        let cambi = BTreeMap::from([("sagoma".to_owned(), false)]);
        let en = crate::lingua::con(crate::lingua::Lingua::En, || scrivi_funzioni(t.path(), &cambi).unwrap_err());
        assert_eq!(en, "“motori” in the profile is not written the way it should be");
        assert_eq!(scrivi_funzioni(t.path(), &cambi).unwrap_err(), "«motori» del profilo non è scritto come dovrebbe");
    }
}
