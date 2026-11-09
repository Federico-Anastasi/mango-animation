//! Dove stanno i video, al primo avvio: la cartella proposta con lo spazio libero del suo disco, gli altri dischi con più spazio, e l'avviso se la
//! cartella è sincronizzata da OneDrive (che caricherebbe online gigabyte di girato). Il gesto di scegliere sta in `preparazione.rs`, il ricordo in `lavoro.rs`.

use crate::computer::hw::libero_sul_disco;
use crate::lavoro::NOME_PREDEFINITO;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Una cartella che la pagina può offrire come scelta rapida, con lo spazio libero del suo disco.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Scelta {
    pub percorso: String,
    pub libero_mb: u64,
}

/// Cosa mostra la pagina «Dove tengo i tuoi video?».
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct StatoCartella {
    /// La cartella in discussione; niente se Documenti non si trova e il creator non ne ha ancora scelta una.
    pub percorso: Option<String>,
    pub libero_mb: u64,
    /// La cartella è dentro una cartella che OneDrive sincronizza.
    pub onedrive: bool,
    /// Altre cartelle da offrire con un clic: i dischi con più spazio e, se la proposta è su OneDrive, una fuori da OneDrive.
    pub alternative: Vec<Scelta>,
    /// Perché l'ultimo gesto non è andato (la cartella non si può preparare, il dialogo non si apre).
    pub messaggio: Option<String>,
}

/// Un disco fisso del computer.
#[derive(Clone, Debug, PartialEq)]
pub struct Disco {
    pub punto: PathBuf,
    pub libero_mb: u64,
}

/// Ciò che il computer dice di sé e che serve a scegliere: i dischi, la cartella dell'utente e le cartelle che OneDrive sincronizza.
pub struct Sistema {
    pub dischi: Vec<Disco>,
    pub casa: Option<PathBuf>,
    pub radici_onedrive: Vec<PathBuf>,
}

impl Sistema {
    /// Il computer vero. `ambiente` dà le variabili che Windows imposta (`OneDrive`, `OneDriveConsumer`, `OneDriveCommercial`, `USERPROFILE`).
    pub fn vero(ambiente: &dyn Fn(&str) -> Option<String>) -> Sistema {
        let casa = ambiente("USERPROFILE").filter(|c| !c.is_empty()).map(PathBuf::from);
        Sistema { dischi: dischi_fissi(), radici_onedrive: radici_onedrive(ambiente, casa.as_deref()), casa }
    }

    /// La cartella da proporre per prima: quella predefinita, ma se è dentro OneDrive quella nella cartella dell'utente, fuori da OneDrive.
    /// Chi non è tecnico clicca il pulsante grande: non deve portarlo a caricare online gigabyte di girato.
    pub fn prima_proposta(&self, proposta: Option<PathBuf>) -> Option<PathBuf> {
        let fuori = self.casa.as_ref().map(|casa| casa.join(NOME_PREDEFINITO));
        match (proposta, fuori) {
            (Some(p), Some(fuori)) if su_onedrive(&p, &self.radici_onedrive) && !su_onedrive(&fuori, &self.radici_onedrive) => Some(fuori),
            (proposta, _) => proposta,
        }
    }

    /// Cosa dire della cartella `candidata`.
    pub fn stato_per(&self, candidata: Option<&Path>) -> StatoCartella {
        let Some(candidata) = candidata else {
            return StatoCartella { alternative: self.alternative_a(None, 0), ..Default::default() };
        };
        let libero_mb = libero_in(candidata);
        StatoCartella {
            percorso: Some(candidata.display().to_string()),
            libero_mb,
            onedrive: su_onedrive(candidata, &self.radici_onedrive),
            alternative: self.alternative_a(Some(candidata), libero_mb),
            messaggio: None,
        }
    }

    fn alternative_a(&self, candidata: Option<&Path>, libero_mb: u64) -> Vec<Scelta> {
        let disco_della_candidata = candidata.and_then(|c| self.dischi.iter().filter(|d| inizia_con(c, &d.punto)).max_by_key(|d| d.punto.as_os_str().len()));
        let mut altri: Vec<&Disco> = self.dischi.iter().filter(|d| d.libero_mb > libero_mb && Some(*d) != disco_della_candidata).collect();
        altri.sort_by_key(|d| std::cmp::Reverse(d.libero_mb));
        let mut scelte: Vec<Scelta> = altri.into_iter().map(|d| Scelta { percorso: d.punto.join(NOME_PREDEFINITO).display().to_string(), libero_mb: d.libero_mb }).collect();
        // Una proposta su OneDrive ha subito una via d'uscita sullo stesso disco, nella cartella dell'utente: fuori da OneDrive.
        if let (Some(candidata), Some(casa)) = (candidata, &self.casa) {
            let fuori = casa.join(NOME_PREDEFINITO);
            if su_onedrive(candidata, &self.radici_onedrive) && !su_onedrive(&fuori, &self.radici_onedrive) && fuori != candidata {
                scelte.insert(0, Scelta { percorso: fuori.display().to_string(), libero_mb: libero_in(&fuori) });
            }
        }
        scelte
    }
}

/// Lo spazio libero del disco su cui sta (o starebbe) `cartella`, in megabyte.
pub(crate) fn libero_in(cartella: &Path) -> u64 {
    let esistente = cartella.ancestors().find(|c| c.exists()).unwrap_or(cartella);
    libero_sul_disco(esistente)
}

fn dischi_fissi() -> Vec<Disco> {
    sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .filter(|d| !d.is_removable() && d.total_space() > 0)
        .map(|d| Disco { punto: d.mount_point().to_path_buf(), libero_mb: d.available_space() / 1_048_576 })
        .collect()
}

/// Il percorso come lo confronta Windows: senza il prefisso `\\?\`, con `\`, senza `\` in fondo e senza distinzione fra maiuscole e minuscole.
fn normalizzato(percorso: &Path) -> String {
    let testo = percorso.to_string_lossy().replace('/', "\\");
    testo.strip_prefix(r"\\?\").unwrap_or(&testo).trim_end_matches('\\').to_lowercase()
}

/// `cartella` è `radice` o sta dentro di lei.
pub(crate) fn inizia_con(cartella: &Path, radice: &Path) -> bool {
    let (c, r) = (normalizzato(cartella), normalizzato(radice));
    !r.is_empty() && (c == r || c.starts_with(&format!("{r}\\")))
}

/// Le due cartelle sono la stessa, comunque siano scritte.
pub(crate) fn stesso_posto(a: &Path, b: &Path) -> bool {
    inizia_con(a, b) && inizia_con(b, a)
}

/// Le cartelle che OneDrive sincronizza: quelle che Windows dichiara con le sue variabili, e le cartelle `OneDrive` o `OneDrive - <nome>` che stanno nella cartella dell'utente
/// (un secondo account di lavoro ha la sua, e non ha una variabile).
pub fn radici_onedrive(ambiente: &dyn Fn(&str) -> Option<String>, casa: Option<&Path>) -> Vec<PathBuf> {
    let mut radici: Vec<PathBuf> = ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"].iter().filter_map(|v| ambiente(v)).filter(|v| !v.is_empty()).map(PathBuf::from).collect();
    if let Some(voci) = casa.and_then(|c| std::fs::read_dir(c).ok()) {
        let di_onedrive = |nome: &str| nome.eq_ignore_ascii_case("OneDrive") || nome.to_lowercase().starts_with("onedrive - ");
        radici.extend(voci.flatten().filter(|v| v.path().is_dir() && di_onedrive(&v.file_name().to_string_lossy())).map(|v| v.path()));
    }
    radici
}

/// La cartella è dentro una di quelle che OneDrive sincronizza.
pub fn su_onedrive(cartella: &Path, radici: &[PathBuf]) -> bool {
    radici.iter().any(|r| inizia_con(cartella, r))
}

#[cfg(test)]
mod prove {
    use super::*;

    fn disco(punto: &str, libero_mb: u64) -> Disco {
        Disco { punto: PathBuf::from(punto), libero_mb }
    }

    fn nessuna_variabile(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn con_documenti_su_onedrive_si_propone_per_prima_la_cartella_fuori_da_onedrive() {
        let sistema = Sistema {
            dischi: vec![],
            casa: Some(PathBuf::from(r"C:\Users\Alice")),
            radici_onedrive: vec![PathBuf::from(r"C:\Users\Alice\OneDrive")],
        };
        let su_onedrive = PathBuf::from(r"C:\Users\Alice\OneDrive\Documenti\Mango Animation");
        assert_eq!(sistema.prima_proposta(Some(su_onedrive)), Some(PathBuf::from(r"C:\Users\Alice\Mango Animation")));
        // Fuori da OneDrive la proposta resta quella; senza proposta non se ne inventa una.
        let documenti = PathBuf::from(r"C:\Users\Alice\Documents\Mango Animation");
        assert_eq!(sistema.prima_proposta(Some(documenti.clone())), Some(documenti));
        assert_eq!(sistema.prima_proposta(None), None);
        // Se anche la cartella dell'utente è sincronizzata, non c'è un posto migliore da proporre: resta l'avviso.
        let tutta_sincronizzata = Sistema { radici_onedrive: vec![PathBuf::from(r"C:\Users\Alice")], ..sistema };
        let p = PathBuf::from(r"C:\Users\Alice\Documenti\Mango Animation");
        assert_eq!(tutta_sincronizzata.prima_proposta(Some(p.clone())), Some(p));
    }

    #[test]
    fn una_cartella_dentro_onedrive_si_riconosce_comunque_sia_scritta() {
        let radici = vec![PathBuf::from(r"C:\Users\Alice\OneDrive")];
        for dentro in [r"C:\Users\Alice\OneDrive\Documenti\Mango Animation", r"c:\users\alice\onedrive\Mango", "C:/Users/Alice/OneDrive/Documenti", r"\\?\C:\Users\Alice\OneDrive\Video", r"C:\Users\Alice\OneDrive"] {
            assert!(su_onedrive(Path::new(dentro), &radici), "{dentro}");
        }
    }

    #[test]
    fn non_da_falsi_allarmi_su_cartelle_che_somigliano_a_onedrive_ma_non_lo_sono() {
        let radici = vec![PathBuf::from(r"C:\Users\Alice\OneDrive")];
        for fuori in [r"C:\Users\Alice\Documents\Mango Animation", r"C:\Users\Alice\OneDriveVecchio\Mango", r"C:\Users\Alice\Documents\OneDrive", r"D:\OneDrive\Mango", r"C:\Users\Alice", r"C:\Users\Alice\One"] {
            assert!(!su_onedrive(Path::new(fuori), &radici), "{fuori}");
        }
        // Senza nessuna cartella sincronizzata (OneDrive non c'è o non è collegato) non si avvisa mai.
        assert!(!su_onedrive(Path::new(r"C:\Users\Alice\OneDrive\Documenti"), &[]));
        assert!(!su_onedrive(Path::new(r"C:\Users\Alice\OneDrive\Documenti"), &[PathBuf::new()]));
    }

    #[test]
    fn le_cartelle_di_onedrive_vengono_dalle_variabili_di_windows_e_dalla_cartella_dell_utente() {
        let casa = tempfile::tempdir().unwrap();
        for nome in ["OneDrive - Studio Rossi", "Documents", "OneDriveVecchio"] {
            std::fs::create_dir(casa.path().join(nome)).unwrap();
        }
        // Un file che si chiama come una cartella di OneDrive non lo è.
        std::fs::write(casa.path().join("OneDrive - finto.txt"), "x").unwrap();
        let variabili = |nome: &str| match nome {
            "OneDrive" => Some(r"C:\Users\Alice\OneDrive".to_owned()),
            "OneDriveConsumer" => Some(r"C:\Users\Alice\OneDrive".to_owned()),
            "OneDriveCommercial" => Some(String::new()),
            _ => None,
        };
        let radici = radici_onedrive(&variabili, Some(casa.path()));
        assert!(radici.contains(&PathBuf::from(r"C:\Users\Alice\OneDrive")));
        assert!(radici.contains(&casa.path().join("OneDrive - Studio Rossi")));
        assert_eq!(radici.len(), 3, "{radici:?}");
        assert!(radici_onedrive(&nessuna_variabile, Some(&casa.path().join("non-esiste"))).is_empty());
    }

    #[test]
    fn la_cartella_proposta_dice_lo_spazio_del_suo_disco_e_se_e_su_onedrive() {
        let documenti = tempfile::tempdir().unwrap();
        let sistema = Sistema { dischi: vec![], casa: None, radici_onedrive: vec![documenti.path().to_path_buf()] };
        let stato = sistema.stato_per(Some(&documenti.path().join("Mango Animation")));
        assert_eq!(stato.percorso, Some(documenti.path().join("Mango Animation").display().to_string()));
        // la cartella non c'è ancora: conta il disco su cui starebbe
        assert!(stato.libero_mb > 0 && stato.onedrive, "{stato:?}");
        let altrove = Sistema { radici_onedrive: vec![], ..sistema };
        assert!(!altrove.stato_per(Some(documenti.path())).onedrive);
    }

    #[test]
    fn gli_altri_dischi_si_offrono_solo_se_hanno_piu_spazio_dal_piu_libero() {
        let cartella = tempfile::tempdir().unwrap();
        let propria = libero_in(cartella.path());
        let sistema = Sistema {
            dischi: vec![disco("Y:\\", propria + 100), disco("Z:\\", propria + 900), disco("X:\\", propria.saturating_sub(1))],
            casa: None,
            radici_onedrive: vec![],
        };
        let scelte = sistema.stato_per(Some(cartella.path())).alternative;
        assert_eq!(scelte, vec![Scelta { percorso: r"Z:\Mango Animation".into(), libero_mb: propria + 900 }, Scelta { percorso: r"Y:\Mango Animation".into(), libero_mb: propria + 100 }]);
    }

    #[test]
    fn il_disco_della_cartella_non_si_offre_a_se_stesso() {
        let cartella = tempfile::tempdir().unwrap();
        let radice = cartella.path().ancestors().last().unwrap().to_path_buf();
        let sistema = Sistema { dischi: vec![Disco { punto: radice, libero_mb: u64::MAX }], casa: None, radici_onedrive: vec![] };
        assert!(sistema.stato_per(Some(cartella.path())).alternative.is_empty());
    }

    #[test]
    fn senza_cartella_proposta_si_offrono_tutti_i_dischi_con_spazio() {
        let sistema = Sistema { dischi: vec![disco("C:\\", 50_000), disco("D:\\", 400_000)], casa: None, radici_onedrive: vec![] };
        let stato = sistema.stato_per(None);
        assert_eq!((stato.percorso, stato.libero_mb, stato.onedrive), (None, 0, false));
        assert_eq!(stato.alternative.iter().map(|s| s.percorso.as_str()).collect::<Vec<_>>(), vec![r"D:\Mango Animation", r"C:\Mango Animation"]);
    }

    #[test]
    fn una_proposta_su_onedrive_ha_subito_una_via_d_uscita_fuori_da_onedrive() {
        let casa = tempfile::tempdir().unwrap();
        let onedrive = casa.path().join("OneDrive");
        std::fs::create_dir_all(onedrive.join("Documenti")).unwrap();
        let sistema = Sistema { dischi: vec![], casa: Some(casa.path().to_path_buf()), radici_onedrive: vec![onedrive.clone()] };
        let proposta = onedrive.join("Documenti").join("Mango Animation");
        let stato = sistema.stato_per(Some(&proposta));
        assert!(stato.onedrive);
        assert_eq!(stato.alternative.iter().map(|s| s.percorso.clone()).collect::<Vec<_>>(), vec![casa.path().join("Mango Animation").display().to_string()]);
        // scelta la via d'uscita, l'avviso sparisce e non c'è più niente da offrire
        let fuori = sistema.stato_per(Some(&casa.path().join("Mango Animation")));
        assert!(!fuori.onedrive && fuori.alternative.is_empty(), "{fuori:?}");
    }

    #[test]
    fn i_dischi_veri_hanno_un_punto_di_montaggio_e_spazio() {
        let sistema = Sistema::vero(&nessuna_variabile);
        assert!(!sistema.dischi.is_empty());
        assert!(sistema.dischi.iter().all(|d| d.punto.is_absolute() && d.libero_mb <= u64::MAX / 2));
    }
}
