//! Cosa c'è in questo computer: le schede NVIDIA con la loro memoria, il processore, la memoria e lo spazio sul disco dove si scarica.
//! Lo legge l'app in Rust, senza accendere Python: è ciò che decide cosa proporre di scaricare, e che la pagina «Motori» dello studio mostra.

use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SchedaNvidia {
    /// L'indice di `nvidia-smi`: quello di `macchina.scheda_video` del profilo.
    pub indice: u32,
    pub nome: String,
    pub memoria_mb: u64,
    /// La memoria libera adesso: una scheda con la memoria occupata da altro conta per quella che ha libera.
    pub libera_mb: u64,
    /// La capacità di calcolo, per esempio «8.6» (la dice `nvidia-smi` dai driver recenti).
    pub capacita: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Computer {
    pub schede: Vec<SchedaNvidia>,
    pub processore: String,
    pub thread: usize,
    pub ram_mb: u64,
    /// Lo spazio libero sul disco della cartella dove si scarica.
    pub disco_libero_mb: u64,
}

impl Computer {
    /// Una scheda NVIDIA su cui si può far girare PyTorch con CUDA 12.4: capacità di calcolo 5.0 o più (le schede più vecchie non sono nei suoi pacchetti).
    pub fn ha_scheda_per_cuda(&self) -> bool {
        self.schede.iter().any(|s| s.capacita.as_deref().and_then(|c| c.parse::<f32>().ok()).is_some_and(|c| c >= 5.0))
    }
}

/// L'uscita di `nvidia-smi --query-gpu=index,name,memory.total,memory.free[,compute_cap] --format=csv,noheader,nounits`. Una riga che non si capisce si salta.
fn schede_da(csv: &str) -> Vec<SchedaNvidia> {
    csv.lines()
        .filter_map(|riga| {
            let campi: Vec<&str> = riga.split(',').map(str::trim).collect();
            if campi.len() < 4 {
                return None;
            }
            Some(SchedaNvidia {
                indice: campi[0].parse().ok()?,
                nome: campi[1].to_owned(),
                memoria_mb: campi[2].parse().ok()?,
                libera_mb: campi[3].parse().ok()?,
                capacita: campi.get(4).filter(|c| c.parse::<f32>().is_ok()).map(|c| (*c).to_owned()),
            })
        })
        .collect()
}

fn nvidia_smi(campi: &str) -> Option<String> {
    let fuori = Command::new("nvidia-smi")
        .args([&format!("--query-gpu={campi}"), "--format=csv,noheader,nounits"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    fuori.status.success().then(|| String::from_utf8_lossy(&fuori.stdout).into_owned())
}

/// Le schede NVIDIA: nessuna se `nvidia-smi` non c'è (niente driver NVIDIA). Prima con la capacità di calcolo; i driver che non la danno la lasciano vuota.
fn schede_nvidia() -> Vec<SchedaNvidia> {
    nvidia_smi("index,name,memory.total,memory.free,compute_cap").or_else(|| nvidia_smi("index,name,memory.total,memory.free")).map(|u| schede_da(&u)).unwrap_or_default()
}

/// Lo spazio libero del disco su cui sta `cartella` (il disco col punto di montaggio più lungo che la contiene); 0 se non si trova.
fn libero_sul_disco(cartella: &Path) -> u64 {
    let dischi = sysinfo::Disks::new_with_refreshed_list();
    let intera = cartella.canonicalize().unwrap_or_else(|_| cartella.to_path_buf());
    // `canonicalize` su Windows dà il percorso con un prefisso («\\?\»), che i punti di montaggio dei dischi non hanno.
    let testo = intera.to_string_lossy().into_owned();
    let intera = Path::new(testo.strip_prefix(r"\\?\").unwrap_or(&testo));
    dischi.iter().filter(|d| intera.starts_with(d.mount_point())).max_by_key(|d| d.mount_point().as_os_str().len()).map_or(0, |d| d.available_space() / 1_048_576)
}

/// Legge il computer; `cartella` è dove si scaricherà (anche se non c'è ancora: conta il disco su cui starebbe).
pub fn leggi(cartella: &Path) -> Computer {
    let mut sistema = sysinfo::System::new();
    sistema.refresh_memory();
    sistema.refresh_cpu_all();
    let mut esistente = cartella;
    while !esistente.exists() {
        match esistente.parent() {
            Some(sopra) => esistente = sopra,
            None => break,
        }
    }
    Computer {
        schede: schede_nvidia(),
        processore: sistema.cpus().first().map(|c| c.brand().trim().to_owned()).unwrap_or_default(),
        thread: std::thread::available_parallelism().map_or(1, |n| n.get()),
        ram_mb: sistema.total_memory() / 1_048_576,
        disco_libero_mb: libero_sul_disco(esistente),
    }
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn le_schede_si_leggono_dall_uscita_di_nvidia_smi_con_la_capacita_di_calcolo() {
        let schede = schede_da("0, NVIDIA GeForce RTX 3060 Ti, 8192, 3578, 8.6\r\n1, NVIDIA GeForce GTX 1080, 8192, 2319, 6.1\n");
        assert_eq!(schede.len(), 2);
        assert_eq!(schede[0], SchedaNvidia { indice: 0, nome: "NVIDIA GeForce RTX 3060 Ti".into(), memoria_mb: 8192, libera_mb: 3578, capacita: Some("8.6".into()) });
        assert_eq!(schede[1].indice, 1);
    }

    #[test]
    fn i_driver_che_non_dicono_la_capacita_la_lasciano_vuota_e_le_righe_strane_si_saltano() {
        let schede = schede_da("0, NVIDIA GeForce GTX 750, 2048, 1900\nNon c'è nessun driver\n\n2, Scheda, non, un, numero\n");
        assert_eq!(schede.len(), 1);
        assert_eq!(schede[0].capacita, None);
        assert_eq!(schede_da("").len(), 0);
        // «[N/A]» al posto della capacità: lasciata vuota.
        assert_eq!(schede_da("0, Una scheda, 4096, 4000, [N/A]")[0].capacita, None);
    }

    #[test]
    fn cuda_serve_una_scheda_con_capacita_di_calcolo_da_5_in_su() {
        let computer = |capacita: Option<&str>| Computer {
            schede: vec![SchedaNvidia { indice: 0, nome: "x".into(), memoria_mb: 4096, libera_mb: 4000, capacita: capacita.map(str::to_owned) }],
            processore: String::new(),
            thread: 4,
            ram_mb: 8192,
            disco_libero_mb: 1000,
        };
        assert!(computer(Some("6.1")).ha_scheda_per_cuda());
        assert!(!computer(Some("3.5")).ha_scheda_per_cuda());
        // Una scheda di cui non si sa la capacità non si dà per buona.
        assert!(!computer(None).ha_scheda_per_cuda());
        assert!(!Computer { schede: vec![], ..computer(None) }.ha_scheda_per_cuda());
    }

    #[test]
    fn il_computer_vero_ha_un_processore_della_memoria_e_dello_spazio_sul_disco() {
        let t = tempfile::tempdir().unwrap();
        // Una cartella che non c'è ancora conta per il disco su cui starebbe.
        let c = leggi(&t.path().join("non").join("ancora"));
        assert!(c.thread >= 1 && c.ram_mb > 0 && !c.processore.is_empty(), "{c:?}");
        assert!(c.disco_libero_mb > 0, "{c:?}");
    }
}
