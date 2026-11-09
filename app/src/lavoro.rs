//! La cartella di lavoro: i dati di chi usa Mango Animation (`docs/ARCHITETTURA.md`, «La cartella di lavoro»).
//!
//! La indica la variabile `MANGO_ANIMATION_LAVORO`; se non c'è vale quella ricordata in `lavoro.json` nella cartella delle
//! impostazioni dell'app; se non c'è nemmeno quella è il primo avvio, e la cartella la sceglie il creator (`cartella.rs`, `preparazione.rs`): l'app gli propone
//! `Mango Animation` dentro Documenti. L'app la passa al server, che la passa al motore e a Claude.

use anyhow::{Context, Result};
use crate::lingua::t;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const VARIABILE: &str = "MANGO_ANIMATION_LAVORO";
const FILE_SCELTA: &str = "lavoro.json";
pub(crate) const NOME_PREDEFINITO: &str = "Mango Animation";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, PartialEq, Eq, Clone)]
pub enum Esito {
    Pronta(PathBuf),
    /// La cartella ricordata non c'è più (o la scelta non si legge): `String` dice perché.
    Mancante(String),
    /// Non si può avere una cartella: si risolve con la variabile e riaprendo l'app.
    Errore(String),
    /// Primo avvio, nessuna cartella ricordata: la sceglie il creator. Porta quella da proporre (dentro Documenti), se Documenti si trova.
    DaScegliere(Option<PathBuf>),
}

#[derive(Serialize, Deserialize)]
struct Scelta {
    lavoro: PathBuf,
    /// Dove spostare la cartella dei dati al prossimo avvio, prima di accendere il server (`sposta.rs`): finché non è finito, `lavoro` resta dov'è.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sposta_a: Option<PathBuf>,
}

/// Cosa mostra la pagina dello studio sulla cartella dei dati.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Dati {
    pub attuale: PathBuf,
    /// Dove si sposta la cartella dei dati al prossimo avvio, se il creator l'ha chiesto.
    pub prossima: Option<PathBuf>,
    /// La variabile vince su ogni scelta.
    pub forzata: bool,
}

pub fn cartella_predefinita(documenti: &Path) -> PathBuf {
    documenti.join(NOME_PREDEFINITO)
}

enum Salvata {
    Assente,
    Illeggibile,
    Cartella(Scelta),
}

fn scelta_salvata(impostazioni: &Path) -> Salvata {
    let Ok(testo) = std::fs::read_to_string(impostazioni.join(FILE_SCELTA)) else { return Salvata::Assente };
    serde_json::from_str::<Scelta>(&testo).map_or(Salvata::Illeggibile, Salvata::Cartella)
}

fn variabile_valida(da_ambiente: Option<&str>) -> Option<&str> {
    da_ambiente.filter(|v| !v.is_empty())
}

/// Con `da_ambiente` (`MANGO_ANIMATION_LAVORO`) vale quella cartella; altrimenti quella ricordata in `impostazioni`;
/// altrimenti è il primo avvio: non si crea niente, si propone quella predefinita dentro `documenti`.
pub fn trova_lavoro(da_ambiente: Option<&str>, impostazioni: &Path, documenti: Option<&Path>) -> Esito {
    if let Some(indicata) = variabile_valida(da_ambiente) {
        let cartella = PathBuf::from(indicata);
        return if cartella.is_dir() {
            Esito::Pronta(cartella)
        } else {
            Esito::Errore(t(
                format!("{VARIABILE} («{indicata}») non è una cartella che esiste: creala o correggi la variabile."),
                format!("{VARIABILE} (“{indicata}”) is not a folder that exists: create it or fix the variable."),
            ))
        };
    }
    match scelta_salvata(impostazioni) {
        Salvata::Cartella(Scelta { lavoro, .. }) if lavoro.is_dir() => Esito::Pronta(lavoro),
        Salvata::Cartella(Scelta { lavoro, .. }) => Esito::Mancante(t(format!("La cartella dei dati «{}» non c'è più.", lavoro.display()), format!("The data folder “{}” is gone.", lavoro.display()))),
        Salvata::Illeggibile => Esito::Mancante(t("La scelta della cartella dei dati non si legge più.", "The saved choice of data folder can no longer be read.")),
        Salvata::Assente => Esito::DaScegliere(documenti.map(cartella_predefinita)),
    }
}

/// Ciò che la pagina sa della cartella dei dati: quella in uso, e dove va al prossimo avvio se il creator ha chiesto di spostarla.
pub fn dati_correnti(da_ambiente: Option<&str>, attuale: &Path, impostazioni: &Path) -> Dati {
    let forzata = variabile_valida(da_ambiente).is_some();
    let prossima = if forzata { None } else { spostamento_in_attesa(impostazioni) };
    Dati { attuale: attuale.to_path_buf(), prossima, forzata }
}

/// Dove il creator ha chiesto di spostare la cartella dei dati, se non è ancora successo.
pub fn spostamento_in_attesa(impostazioni: &Path) -> Option<PathBuf> {
    match scelta_salvata(impostazioni) {
        Salvata::Cartella(s) => s.sposta_a,
        _ => None,
    }
}

fn scrivi_scelta(impostazioni: &Path, scelta: &Scelta) -> Result<()> {
    std::fs::create_dir_all(impostazioni).with_context(|| t(format!("non riesco a creare la cartella delle impostazioni {}", impostazioni.display()), format!("I can't create the settings folder {}", impostazioni.display())))?;
    std::fs::write(impostazioni.join(FILE_SCELTA), serde_json::to_string_pretty(scelta)?).with_context(|| t("non riesco a ricordare la scelta", "I can't remember the choice"))
}

/// Ricorda che al prossimo avvio la cartella dei dati va spostata in `destinazione` (che non si crea adesso). La cartella in uso resta quella di prima, fino a spostamento finito.
pub fn programma_spostamento(impostazioni: &Path, destinazione: &Path) -> Result<()> {
    let Salvata::Cartella(scelta) = scelta_salvata(impostazioni) else { anyhow::bail!(t("La cartella dei dati in uso non è ricordata: non si può spostare.", "The data folder in use is not remembered: it can't be moved.")) };
    scrivi_scelta(impostazioni, &Scelta { sposta_a: Some(destinazione.to_path_buf()), ..scelta })
}

/// Il creator ci ripensa, o lo spostamento non è andato e si continua con la cartella di prima: non si sposta più niente.
pub fn annulla_spostamento(impostazioni: &Path) -> Result<()> {
    match scelta_salvata(impostazioni) {
        Salvata::Cartella(scelta) => scrivi_scelta(impostazioni, &Scelta { sposta_a: None, ..scelta }),
        _ => Ok(()),
    }
}

/// Ricorda la cartella e ci prepara l'`archivio/` (creandola se serve); restituisce la cartella com'è. I file già in altre cartelle non si spostano.
pub fn salva_scelta(impostazioni: &Path, cartella: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(cartella.join("archivio")).with_context(|| t(format!("non riesco a preparare l'archivio in {}", cartella.display()), format!("I can't prepare the archive in {}", cartella.display())))?;
    scrivi_scelta(impostazioni, &Scelta { lavoro: cartella.to_path_buf(), sposta_a: None })?;
    Ok(cartella.to_path_buf())
}

const SCRIPT_DIALOGO: &str = "Add-Type -AssemblyName System.Windows.Forms; \
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
    $finestra = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }; \
    $dialogo = New-Object System.Windows.Forms.FolderBrowserDialog; \
    $dialogo.Description = 'DESCRIZIONE'; \
    $dialogo.UseDescriptionForTitle = $true; \
    $dialogo.ShowNewFolderButton = $true; \
    if ($dialogo.ShowDialog($finestra) -eq 'OK') { [Console]::Out.Write($dialogo.SelectedPath) }";

/// Lo script del dialogo, con la frase del titolo nella lingua in uso (fra apici, come la vuole PowerShell).
fn script_dialogo() -> String {
    let descrizione = t("Scegli la cartella dei dati: ci vanno i tuoi video e il girato.", "Choose the data folder: your videos and footage go here.");
    SCRIPT_DIALOGO.replace("DESCRIZIONE", &descrizione.replace('\'', "''"))
}

/// Ciò che il dialogo ha scritto: la cartella, o niente se il creator ha annullato.
fn cartella_scelta(uscita: &[u8]) -> Option<PathBuf> {
    let testo = String::from_utf8_lossy(uscita);
    let testo = testo.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    (!testo.is_empty()).then(|| PathBuf::from(testo))
}

/// Il dialogo di sistema per scegliere una cartella. `None` se il creator annulla. Blocca finché non risponde.
pub fn scegli_cartella() -> Result<Option<PathBuf>> {
    let script = script_dialogo();
    let fuori = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", &script])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .with_context(|| t("non riesco ad aprire la scelta della cartella", "I can't open the folder picker"))?;
    Ok(cartella_scelta(&fuori.stdout))
}

#[cfg(test)]
mod prove {
    use super::*;

    fn trova(da_ambiente: Option<&str>, impostazioni: &Path, documenti: &Path) -> Esito {
        trova_lavoro(da_ambiente, impostazioni, Some(documenti))
    }

    #[test]
    fn la_variabile_vince_sulla_scelta_salvata() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let salvata = tempfile::tempdir().unwrap();
        let altra = tempfile::tempdir().unwrap();
        salva_scelta(impostazioni.path(), salvata.path()).unwrap();
        let v = altra.path().to_str().unwrap();
        assert_eq!(trova(Some(v), impostazioni.path(), documenti.path()), Esito::Pronta(altra.path().to_path_buf()));
        assert!(!documenti.path().join("Mango Animation").exists());
    }

    #[test]
    fn una_variabile_sbagliata_e_un_errore_in_italiano() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let Esito::Errore(e) = trova(Some("C:/non/esiste/proprio"), impostazioni.path(), documenti.path()) else { panic!("doveva essere un errore") };
        assert!(e.contains("MANGO_ANIMATION_LAVORO") && e.contains("non è una cartella che esiste"), "{e}");
        assert!(!documenti.path().join("Mango Animation").exists());
    }

    #[test]
    fn al_primo_avvio_non_si_crea_niente_e_si_propone_la_cartella_in_documenti() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let proposta = documenti.path().join("Mango Animation");
        assert_eq!(trova(None, impostazioni.path(), documenti.path()), Esito::DaScegliere(Some(proposta.clone())));
        assert_eq!(trova(Some(""), impostazioni.path(), documenti.path()), Esito::DaScegliere(Some(proposta.clone())));
        assert!(!proposta.exists() && !impostazioni.path().join(FILE_SCELTA).exists());
    }

    #[test]
    fn la_cartella_scelta_al_primo_avvio_si_ricorda_e_dal_secondo_non_si_chiede_piu() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let scelta = tempfile::tempdir().unwrap();
        assert!(matches!(trova(None, impostazioni.path(), documenti.path()), Esito::DaScegliere(_)));
        salva_scelta(impostazioni.path(), scelta.path()).unwrap();
        // la seconda volta vale la scelta salvata, anche se Documenti è altrove
        let altrove = tempfile::tempdir().unwrap();
        assert_eq!(trova(None, impostazioni.path(), altrove.path()), Esito::Pronta(scelta.path().to_path_buf()));
        assert!(!altrove.path().join("Mango Animation").exists());
    }

    #[test]
    fn una_cartella_predefinita_gia_piena_non_si_tocca() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let archivio = documenti.path().join("Mango Animation").join("archivio");
        std::fs::create_dir_all(&archivio).unwrap();
        std::fs::write(archivio.join("dato.txt"), "x").unwrap();
        assert!(matches!(trova(None, impostazioni.path(), documenti.path()), Esito::DaScegliere(_)));
        assert!(archivio.join("dato.txt").is_file());
    }

    #[test]
    fn senza_documenti_e_senza_scelta_non_c_e_niente_da_proporre_e_la_sceglie_il_creator() {
        let impostazioni = tempfile::tempdir().unwrap();
        assert_eq!(trova_lavoro(None, impostazioni.path(), None), Esito::DaScegliere(None));
    }

    #[test]
    fn la_scelta_si_ricorda_e_prepara_l_archivio() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let lavoro = tempfile::tempdir().unwrap();
        salva_scelta(impostazioni.path(), lavoro.path()).unwrap();
        assert!(lavoro.path().join("archivio").is_dir());
        assert_eq!(trova(None, impostazioni.path(), documenti.path()), Esito::Pronta(lavoro.path().to_path_buf()));
    }

    #[test]
    fn una_scelta_che_non_c_e_piu_lo_dice_e_non_ricrea_niente() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let lavoro = tempfile::tempdir().unwrap();
        salva_scelta(impostazioni.path(), lavoro.path()).unwrap();
        let percorso = lavoro.path().to_path_buf();
        drop(lavoro);
        let Esito::Mancante(motivo) = trova(None, impostazioni.path(), documenti.path()) else { panic!("doveva dire che manca") };
        assert!(motivo.contains("non c'è più") && motivo.contains(percorso.to_str().unwrap()), "{motivo}");
        assert!(!percorso.exists() && !documenti.path().join("Mango Animation").exists());
    }

    #[test]
    fn un_file_di_scelta_rovinato_lo_dice() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        std::fs::write(impostazioni.path().join(FILE_SCELTA), "{").unwrap();
        assert!(matches!(trova(None, impostazioni.path(), documenti.path()), Esito::Mancante(_)));
    }

    #[test]
    fn la_cartella_predefinita_si_ricrea_su_richiesta() {
        let impostazioni = tempfile::tempdir().unwrap();
        let documenti = tempfile::tempdir().unwrap();
        let scelta = salva_scelta(impostazioni.path(), &cartella_predefinita(documenti.path())).unwrap();
        assert_eq!(scelta, documenti.path().join("Mango Animation"));
        assert!(scelta.join("archivio").is_dir());
        assert_eq!(trova(None, impostazioni.path(), documenti.path()), Esito::Pronta(scelta));
    }

    #[test]
    fn lo_spostamento_chiesto_si_ricorda_e_la_cartella_in_uso_non_cambia_finche_non_e_finito() {
        let impostazioni = tempfile::tempdir().unwrap();
        let attuale = tempfile::tempdir().unwrap();
        let nuova = tempfile::tempdir().unwrap().path().join("Video");
        salva_scelta(impostazioni.path(), attuale.path()).unwrap();
        std::fs::write(attuale.path().join("archivio").join("dato.txt"), "x").unwrap();
        assert_eq!(dati_correnti(None, attuale.path(), impostazioni.path()), Dati { attuale: attuale.path().to_path_buf(), prossima: None, forzata: false });
        programma_spostamento(impostazioni.path(), &nuova).unwrap();
        assert_eq!(dati_correnti(None, attuale.path(), impostazioni.path()).prossima, Some(nuova.clone()));
        assert_eq!(spostamento_in_attesa(impostazioni.path()), Some(nuova.clone()));
        // a riavvio la cartella è ancora quella di prima, e la nuova non esiste: l'ha da fare lo spostamento
        assert_eq!(trova(None, impostazioni.path(), attuale.path()), Esito::Pronta(attuale.path().to_path_buf()));
        assert!(!nuova.exists() && attuale.path().join("archivio").join("dato.txt").is_file());
    }

    #[test]
    fn finito_lo_spostamento_la_cartella_nuova_vale_e_non_c_e_piu_niente_da_spostare() {
        let impostazioni = tempfile::tempdir().unwrap();
        let (attuale, nuova) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        salva_scelta(impostazioni.path(), attuale.path()).unwrap();
        programma_spostamento(impostazioni.path(), nuova.path()).unwrap();
        salva_scelta(impostazioni.path(), nuova.path()).unwrap();
        assert_eq!(spostamento_in_attesa(impostazioni.path()), None);
        assert_eq!(trova(None, impostazioni.path(), attuale.path()), Esito::Pronta(nuova.path().to_path_buf()));
        assert!(nuova.path().join("archivio").is_dir());
    }

    #[test]
    fn un_ripensamento_o_uno_spostamento_lasciato_cancella_la_richiesta_e_la_cartella_resta() {
        let impostazioni = tempfile::tempdir().unwrap();
        let (attuale, nuova) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        salva_scelta(impostazioni.path(), attuale.path()).unwrap();
        programma_spostamento(impostazioni.path(), nuova.path()).unwrap();
        annulla_spostamento(impostazioni.path()).unwrap();
        assert_eq!(spostamento_in_attesa(impostazioni.path()), None);
        assert_eq!(trova(None, impostazioni.path(), attuale.path()), Esito::Pronta(attuale.path().to_path_buf()));
        // senza niente di ricordato non c'è niente da cancellare né da spostare
        let nuove = tempfile::tempdir().unwrap();
        annulla_spostamento(nuove.path()).unwrap();
        assert!(programma_spostamento(nuove.path(), attuale.path()).is_err());
    }

    #[test]
    fn la_scelta_salvata_prima_dello_spostamento_si_legge_ancora() {
        let impostazioni = tempfile::tempdir().unwrap();
        let attuale = tempfile::tempdir().unwrap();
        let vecchia = serde_json::json!({ "lavoro": attuale.path() });
        std::fs::write(impostazioni.path().join(FILE_SCELTA), vecchia.to_string()).unwrap();
        assert_eq!(trova(None, impostazioni.path(), attuale.path()), Esito::Pronta(attuale.path().to_path_buf()));
        assert_eq!(spostamento_in_attesa(impostazioni.path()), None);
    }

    #[test]
    fn con_la_variabile_lo_spostamento_non_conta() {
        let impostazioni = tempfile::tempdir().unwrap();
        let (attuale, altra) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        salva_scelta(impostazioni.path(), attuale.path()).unwrap();
        programma_spostamento(impostazioni.path(), altra.path()).unwrap();
        let d = dati_correnti(Some(attuale.path().to_str().unwrap()), attuale.path(), impostazioni.path());
        assert!(d.forzata && d.prossima.is_none());
    }

    #[test]
    fn il_dialogo_annullato_non_sceglie_niente() {
        assert_eq!(cartella_scelta(b""), None);
        assert_eq!(cartella_scelta(b" \r\n"), None);
        assert_eq!(cartella_scelta("\u{feff}C:/Dati/Città\r\n".as_bytes()), Some(PathBuf::from("C:/Dati/Città")));
    }

    #[test]
    fn le_frasi_della_cartella_dei_dati_escono_anche_in_inglese() {
        crate::lingua::con(crate::lingua::Lingua::En, || {
            let impostazioni = tempfile::tempdir().unwrap();
            let documenti = tempfile::tempdir().unwrap();
            let Esito::Errore(e) = trova(Some("C:/non/esiste/proprio"), impostazioni.path(), documenti.path()) else { panic!("doveva essere un errore") };
            assert!(e.contains("MANGO_ANIMATION_LAVORO") && e.contains("is not a folder that exists"), "{e}");

            let sparita = impostazioni.path().join("sparita");
            salva_scelta(impostazioni.path(), &sparita).unwrap();
            std::fs::remove_dir_all(&sparita).unwrap();
            let Esito::Mancante(m) = trova(None, impostazioni.path(), documenti.path()) else { panic!("doveva mancare") };
            assert!(m.starts_with("The data folder “") && m.ends_with("” is gone."), "{m}");

            std::fs::write(impostazioni.path().join(FILE_SCELTA), "non è json").unwrap();
            let Esito::Mancante(m) = trova(None, impostazioni.path(), documenti.path()) else { panic!("doveva mancare") };
            assert_eq!(m, "The saved choice of data folder can no longer be read.");
        });
    }

    #[test]
    fn il_titolo_del_dialogo_e_nella_lingua_in_uso() {
        let it = script_dialogo();
        assert!(it.contains("Scegli la cartella dei dati") && !it.contains("DESCRIZIONE"), "{it}");
        crate::lingua::con(crate::lingua::Lingua::En, || {
            let en = script_dialogo();
            assert!(en.contains("Choose the data folder") && !en.contains("Scegli") && !en.contains("DESCRIZIONE"), "{en}");
        });
    }
}
