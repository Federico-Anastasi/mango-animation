//! Cosa manca a questo computer per far girare le funzioni accese, e quanto pesa: il piano che il creator vede prima di scaricare.
//! Si scarica solo ciò che le funzioni accese richiedono e che il computer non ha già (`docs/MOTORI.md`).

use super::hw::Computer;
use super::manifesto::{Elemento, Posto, Tipo};
use crate::lingua::t;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

const MB: u64 = 1_048_576;

/// Dove sta cosa, in questo computer.
#[derive(Clone, Debug)]
pub struct Luoghi {
    /// La cartella dell'app per ciò che scarica lei: i programmi, l'ambiente Python.
    pub dati: PathBuf,
    /// Il codice del prodotto (`server/`, `animazioni/`).
    pub radice: PathBuf,
    /// La cache di Hugging Face (`.../hub`).
    pub hf: PathBuf,
    /// I pesi di PyTorch (`.../checkpoints`).
    pub torch: PathBuf,
    /// `~/.cache/mango-animation/modelli`, dove il motore cerca DeepFilterNet.
    pub modelli: PathBuf,
    /// Dove Playwright tiene i browser.
    pub playwright: PathBuf,
}

impl Luoghi {
    /// I posti dell'utente, come li leggono Hugging Face, PyTorch e Playwright (le loro variabili, o la loro cartella di base).
    pub fn dell_utente(dati: PathBuf, radice: PathBuf, ambiente: &dyn Fn(&str) -> Option<String>) -> Luoghi {
        let casa = ambiente("USERPROFILE").map(PathBuf::from).unwrap_or_default();
        let cache = casa.join(".cache");
        let da = |nome: &str| ambiente(nome).filter(|v| !v.is_empty()).map(PathBuf::from);
        let hf = da("HF_HUB_CACHE").or_else(|| da("HF_HOME").map(|h| h.join("hub"))).unwrap_or_else(|| cache.join("huggingface").join("hub"));
        let torch = da("TORCH_HOME").unwrap_or_else(|| cache.join("torch")).join("hub").join("checkpoints");
        let playwright = da("PLAYWRIGHT_BROWSERS_PATH").or_else(|| da("LOCALAPPDATA").map(|l| l.join("ms-playwright"))).unwrap_or_else(|| casa.join("ms-playwright"));
        Luoghi { dati, radice, hf, torch, modelli: cache.join("mango-animation").join("modelli"), playwright }
    }

    pub fn bin(&self) -> PathBuf {
        self.dati.join("bin")
    }

    pub fn ffmpeg(&self) -> PathBuf {
        self.dati.join("ffmpeg")
    }

    pub fn ambiente_python(&self) -> PathBuf {
        self.dati.join("ambiente")
    }

    /// L'elenco dei pacchetti che l'app ha messo nell'ambiente Python, scritto a installazione finita.
    fn pacchetti_python(&self) -> PathBuf {
        self.ambiente_python().join(".mango-pacchetti")
    }

    /// Il Python dell'ambiente che prepara l'app.
    pub fn python_dell_app(&self) -> PathBuf {
        self.ambiente_python().join("Scripts").join("python.exe")
    }

    /// Le cartelle da mettere davanti al PATH di chi lancia il server e il motore, se esistono: i programmi che ha scaricato l'app.
    pub fn cartelle_del_percorso(&self) -> Vec<PathBuf> {
        [self.bin(), self.ffmpeg(), self.ambiente_python().join("Scripts")].into_iter().filter(|c| c.is_dir()).collect()
    }
}

/// Ciò che si vede nel computer e costa un processo da lanciare: sostituibile nelle prove.
pub trait Sonde {
    /// C'è `programma.exe` in una cartella del PATH?
    fn nel_percorso(&self, programma: &str) -> bool;
    /// Questo Python trova tutti questi moduli? (Non li importa: è il controllo di ogni avvio, e importare PyTorch costa secondi.)
    fn python_ha(&self, python: &Path, moduli: &[&str]) -> bool;
    /// Questo Python sa importare tutti questi moduli? (Il controllo dopo aver installato: un pacchetto può esserci e non partire per una dipendenza che manca.)
    fn python_importa(&self, python: &Path, moduli: &[&str]) -> bool;
}

/// Le funzioni accese: lo dice `motori.<funzione>.attiva` del profilo; una funzione che il profilo non nomina è accesa.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Funzioni(pub BTreeMap<String, bool>);

impl Funzioni {
    pub fn dal_profilo(profilo: &Value) -> Funzioni {
        Funzioni(super::manifesto::FUNZIONI.iter().map(|(f, _, _)| ((*f).to_owned(), profilo.pointer(&format!("/motori/{f}/attiva")).and_then(Value::as_bool).unwrap_or(true))).collect())
    }

    pub fn attiva(&self, funzione: &str) -> bool {
        self.0.get(funzione).copied().unwrap_or(false)
    }
}

/// I modelli di Whisper che le funzioni vogliono: lo dice il profilo (per la trascrizione), poi lo stile del creator, poi quello di serie.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelliScelti {
    pub trascrizione: String,
    pub dettatura: String,
}

impl ModelliScelti {
    pub fn da(profilo: &Value, stile_del_creator: &Value, stile_di_serie: &Value, con_scheda: bool) -> ModelliScelti {
        let nello_stile = |percorso: &str| [stile_del_creator, stile_di_serie].iter().find_map(|s| s.pointer(percorso).and_then(Value::as_str)).map(str::to_owned);
        let dove = if con_scheda { "cuda" } else { "cpu" };
        ModelliScelti {
            trascrizione: profilo.pointer("/motori/trascrizione/modello").and_then(Value::as_str).map(str::to_owned).or_else(|| nello_stile("/preparati/modello_trascrizione")).unwrap_or_else(|| "large-v3".into()),
            dettatura: nello_stile(&format!("/dettatura/dispositivi/{dove}/modello")).unwrap_or_else(|| if con_scheda { "large-v3-turbo".into() } else { "small".into() }),
        }
    }
}

/// Un gruppo di pacchetti Python, da installare insieme.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Gruppo {
    pub pacchetti: Vec<String>,
    /// Da dove prenderli, se non dall'indice di tutti (PyTorch ha il suo, uno per CUDA e uno per il processore).
    pub indice: Option<String>,
}

#[derive(Clone, Debug)]
pub enum Lavoro {
    /// Un elemento del manifesto: un archivio da estrarre, un file, un modello.
    Elemento(Box<Elemento>),
    /// Python e i suoi pacchetti (con `uv`, nell'ambiente dell'app).
    Python(Vec<Gruppo>),
    /// `bun install` nella cartella del codice indicata.
    PacchettiJs(String),
    /// Il browser con cui si rendono le animazioni.
    Chromium,
}

#[derive(Clone, Debug)]
pub struct Voce {
    pub id: String,
    pub nome: String,
    pub scopo: String,
    pub funzione: Option<String>,
    pub licenza: String,
    pub fonte: String,
    /// Quanto pesa scaricarla, in byte (per i pacchetti Python e il browser è una stima).
    pub peso: u64,
    pub lavoro: Lavoro,
    /// L'ordine in cui si fanno: i programmi prima, poi ciò che li usa.
    pub ordine: u8,
}

impl Voce {
    /// Senza di lei il server non parte: Bun e i pacchetti del codice. Non è una scelta del creator.
    pub fn necessaria(&self) -> bool {
        matches!(self.lavoro, Lavoro::PacchettiJs(_)) || self.id == "bun"
    }
}

/// Quale Python useranno motore e dettatura.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SceltaPython {
    /// Lo indica `MANGO_ANIMATION_PYTHON` (chi sviluppa): non si controlla niente.
    Variabile,
    /// Quello dell'ambiente che prepara l'app.
    DellApp,
    /// Quello del computer (nel PATH), che ha già tutto.
    DelComputer,
    /// Nessuno ha tutto: si prepara l'ambiente dell'app.
    DaPreparare,
}

#[derive(Clone, Debug)]
pub struct Piano {
    pub voci: Vec<Voce>,
    pub python: SceltaPython,
    /// Cose che l'app non sa fare e il creator deve sapere.
    pub avvisi: Vec<String>,
}

impl Piano {
    pub fn peso_totale(&self) -> u64 {
        self.voci.iter().map(|v| v.peso).sum()
    }

    /// Quanto spazio serve: ciò che si scarica, più una volta il peso dei pacchetti Python (la cache di `uv` ne tiene una copia) e un gigabyte di margine.
    pub fn servono_mb(&self) -> u64 {
        let python: u64 = self.voci.iter().filter(|v| matches!(v.lavoro, Lavoro::Python(_))).map(|v| v.peso).sum();
        (self.peso_totale() + python) / MB + 1024
    }
}

const BASE: &[&str] = &["jsonschema", "numpy", "PIL", "pillow_heif", "soundfile", "yt_dlp"];
// yt-dlp resta all'ultima, di proposito: i siti cambiano spesso e una versione fissata smette di scaricare.
const PACCHETTI_BASE: &[&str] = &["jsonschema==4.26.0", "numpy==2.4.3", "Pillow==12.1.1", "pillow-heif==1.8.1", "soundfile==0.14.0", "yt-dlp"];
const INDICE_CUDA: &str = "https://download.pytorch.org/whl/cu124";
const INDICE_PROCESSORE: &str = "https://download.pytorch.org/whl/cpu";

/// I moduli che il motore importa, per le funzioni accese.
pub fn moduli_per(f: &Funzioni) -> Vec<&'static str> {
    let mut moduli = BASE.to_vec();
    let mut aggiungi = |nuovi: &[&'static str]| nuovi.iter().for_each(|m| if !moduli.contains(m) { moduli.push(m) });
    if f.attiva("trascrizione") || f.attiva("dettatura") {
        aggiungi(&["faster_whisper"]);
    }
    if f.attiva("allineamento") || f.attiva("sagoma") {
        aggiungi(&["torch", "torchaudio", "torchvision"]);
    }
    if f.attiva("sagoma") {
        aggiungi(&["transformers", "cv2"]);
    }
    if f.attiva("segui") {
        aggiungi(&["cv2", "huggingface_hub"]);
    }
    moduli
}

/// I pacchetti da installare per le funzioni accese, e la loro stima di peso in byte.
fn gruppi_per(f: &Funzioni, con_cuda: bool) -> (Vec<Gruppo>, u64) {
    let semplici = |p: &[&str]| p.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    let mut gruppi = vec![Gruppo { pacchetti: semplici(PACCHETTI_BASE), indice: None }];
    let mut peso = 300 * MB;
    let mut altri = Vec::new();
    if f.attiva("trascrizione") || f.attiva("dettatura") {
        // `requests`: faster-whisper 1.1.0 lo importa e non lo dichiara, e huggingface_hub non lo porta più.
        altri.extend(["faster-whisper==1.1.0", "requests==2.34.2"]);
        peso += 120 * MB;
        if con_cuda && !(f.attiva("allineamento") || f.attiva("sagoma")) {
            // Sulla scheda faster-whisper cerca da solo la cublas di CUDA 12, che Windows non ha: la porta torch con CUDA (che qui non c'è) o questo pacchetto.
            altri.push("nvidia-cublas-cu12==12.4.5.8");
            peso += 380 * MB;
        }
    }
    if f.attiva("sagoma") {
        altri.extend(["transformers==5.14.1", "opencv-python-headless==5.0.0.93"]);
        peso += 250 * MB;
    } else if f.attiva("segui") {
        altri.extend(["opencv-python-headless==5.0.0.93"]);
        peso += 60 * MB;
    }
    if !altri.is_empty() {
        // Sotto la 2.0, che transformers 5.14.1 non accetta: la stessa versione in ogni combinazione di funzioni.
        altri.extend(["huggingface_hub==1.24.0"]);
        gruppi.push(Gruppo { pacchetti: semplici(&altri), indice: None });
    }
    if f.attiva("allineamento") || f.attiva("sagoma") {
        gruppi.push(Gruppo { pacchetti: semplici(&["torch==2.6.0", "torchaudio==2.6.0", "torchvision==0.21.0"]), indice: Some((if con_cuda { INDICE_CUDA } else { INDICE_PROCESSORE }).into()) });
        // I pacchetti di PyTorch con CUDA portano le sue librerie: da 4,7 GB; sul processore da 0,9.
        peso += if con_cuda { 4700 * MB } else { 900 * MB };
    }
    (gruppi, peso)
}

/// Un pacchetto con l'indice da cui viene: due righe uguali sono la stessa installazione.
fn specifiche(gruppi: &[Gruppo]) -> BTreeSet<String> {
    gruppi.iter().flat_map(|g| g.pacchetti.iter().map(|p| format!("{}	{p}", g.indice.as_deref().unwrap_or_default()))).collect()
}

/// L'ambiente Python dell'app ricorda cosa ci è stato messo, perché i moduli presenti non dicono la versione: una versione nuova dell'app può fissare un pacchetto diverso.
pub fn segna_python_installato(luoghi: &Luoghi, gruppi: &[Gruppo]) -> Result<(), String> {
    let file = luoghi.pacchetti_python();
    std::fs::create_dir_all(file.parent().unwrap_or(Path::new(""))).map_err(|e| e.to_string())?;
    std::fs::write(&file, specifiche(gruppi).into_iter().collect::<Vec<_>>().join("
")).map_err(|e| t(format!("non riesco a scrivere {} ({e})", file.display()), format!("I can't write {} ({e})", file.display())))
}

/// Tutto ciò che si chiede è già stato installato (e senza l'elenco non si sa cosa c'è: no).
pub fn python_aggiornato(luoghi: &Luoghi, gruppi: &[Gruppo]) -> bool {
    let Ok(scritto) = std::fs::read_to_string(luoghi.pacchetti_python()) else { return false };
    let installati: BTreeSet<String> = scritto.lines().map(str::to_owned).collect();
    specifiche(gruppi).is_subset(&installati)
}

const FILE_IMPRONTA_JS: &str = ".mango-impronta";
const FILE_DEI_PACCHETTI_JS: [&str; 3] = ["package.json", "bun.lock", "bun.lockb"];

/// L'impronta di ciò che dice quali pacchetti installare: il lockfile e `package.json`, per nome e contenuto.
fn impronta_js(cartella: &Path) -> String {
    let mut sha = Sha256::new();
    for nome in FILE_DEI_PACCHETTI_JS {
        if let Ok(contenuto) = std::fs::read(cartella.join(nome)) {
            sha.update(nome.as_bytes());
            sha.update([0]);
            sha.update(&contenuto);
            sha.update([0]);
        }
    }
    sha.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Dentro `node_modules` (se si toglie, si toglie anche l'impronta) si scrive l'impronta dei file che hanno deciso i pacchetti, com'è a installazione finita.
pub fn segna_js_installato(cartella: &Path) -> Result<(), String> {
    let file = cartella.join("node_modules").join(FILE_IMPRONTA_JS);
    std::fs::create_dir_all(file.parent().unwrap_or(Path::new(""))).map_err(|e| e.to_string())?;
    std::fs::write(&file, impronta_js(cartella)).map_err(|e| t(format!("non riesco a scrivere {} ({e})", file.display()), format!("I can't write {} ({e})", file.display())))
}

/// I pacchetti sono quelli che il lockfile di adesso dice.
pub fn js_aggiornato(cartella: &Path) -> bool {
    std::fs::read_to_string(cartella.join("node_modules").join(FILE_IMPRONTA_JS)).is_ok_and(|scritta| scritta == impronta_js(cartella))
}

fn voce_di(e: &Elemento, ordine: u8) -> Voce {
    Voce { id: e.id.clone(), nome: e.nome.clone(), scopo: t(&e.scopo, &e.scopo_en), funzione: e.funzione.clone(), licenza: t(&e.licenza, &e.licenza_en), fonte: e.fonte.clone(), peso: e.peso(), lavoro: Lavoro::Elemento(Box::new(e.clone())), ordine }
}

/// Dove un elemento di Hugging Face tiene i suoi file nella cache: `models--org--nome/snapshots/<revisione>/`.
pub fn cartella_hf(hf: &Path, repo: &str, revisione: &str) -> PathBuf {
    hf.join(format!("models--{}", repo.replace('/', "--"))).join("snapshots").join(revisione)
}

fn file_di_dimensione(p: &Path, dimensione: u64) -> bool {
    std::fs::metadata(p).is_ok_and(|m| m.is_file() && m.len() == dimensione)
}

/// Dove va il file di un elemento di tipo `File`.
pub fn destinazione_del_file(luoghi: &Luoghi, posto: Posto, nome: &str) -> PathBuf {
    match posto {
        Posto::Modelli => luoghi.modelli.join(nome),
        Posto::Torch => luoghi.torch.join(nome),
    }
}

/// Un elemento che il computer ha già?
fn presente(e: &Elemento, luoghi: &Luoghi, sonde: &dyn Sonde) -> bool {
    match (&e.tipo, e.id.as_str()) {
        (Tipo::Archivio(_), "bun") => sonde.nel_percorso("bun") || luoghi.bin().join("bun.exe").is_file(),
        (Tipo::Archivio(_), "uv") => sonde.nel_percorso("uv") || luoghi.bin().join("uv.exe").is_file(),
        (Tipo::Archivio(_), "ffmpeg") => (sonde.nel_percorso("ffmpeg") && sonde.nel_percorso("ffprobe")) || luoghi.ffmpeg().join("ffmpeg.exe").is_file(),
        (Tipo::Archivio(a), _) => a.estrai.iter().all(|x| luoghi.dati.join(&x.a).is_file()),
        (Tipo::File(f), _) => file_di_dimensione(&destinazione_del_file(luoghi, f.posto, &f.nome), f.dimensione),
        (Tipo::Hf(r), _) => {
            // Un modello già nella cache, di qualunque revisione: `from_pretrained` lo trova da `refs/main`.
            let cartella = luoghi.hf.join(format!("models--{}", r.repo.replace('/', "--")));
            let corrente = std::fs::read_to_string(cartella.join("refs").join("main")).map(|s| s.trim().to_owned()).unwrap_or_default();
            !corrente.is_empty() && r.file.iter().all(|f| file_di_dimensione(&cartella_hf(&luoghi.hf, &r.repo, &corrente).join(&f.nome), f.dimensione))
        }
    }
}

fn chromium_c_e(luoghi: &Luoghi) -> bool {
    std::fs::read_dir(&luoghi.playwright).is_ok_and(|voci| voci.flatten().any(|v| {
        let nome = v.file_name().to_string_lossy().into_owned();
        nome.starts_with("chromium-") || nome.starts_with("chromium_headless_shell-")
    }))
}

/// Il piano: ciò che le funzioni accese vogliono e il computer non ha.
pub fn calcola(luoghi: &Luoghi, sonde: &dyn Sonde, computer: &Computer, funzioni: &Funzioni, modelli: &ModelliScelti, variabile_python: bool, manifesto: &[Elemento]) -> Piano {
    let mut voci: Vec<Voce> = Vec::new();
    let mut avvisi = Vec::new();
    let elemento = |id: &str| manifesto.iter().find(|e| e.id == id).unwrap_or_else(|| panic!("il manifesto non ha «{id}»"));

    // Python.
    let moduli = moduli_per(funzioni);
    let (gruppi, peso) = gruppi_per(funzioni, computer.ha_scheda_per_cuda());
    let python = if variabile_python {
        SceltaPython::Variabile
    } else if luoghi.python_dell_app().is_file() && sonde.python_ha(&luoghi.python_dell_app(), &moduli) && python_aggiornato(luoghi, &gruppi) {
        SceltaPython::DellApp
    } else if sonde.nel_percorso("python") && sonde.python_ha(Path::new("python"), &moduli) {
        SceltaPython::DelComputer
    } else {
        SceltaPython::DaPreparare
    };
    if python == SceltaPython::DaPreparare {
        let uv = elemento("uv");
        if !presente(uv, luoghi, sonde) {
            voci.push(voce_di(uv, 0));
        }
        voci.push(Voce {
            id: "python".into(),
            nome: t("Python e i suoi pacchetti", "Python and its packages"),
            scopo: t("fa girare il motore: i tagli, le parole, la sagoma", "runs the engine: the cuts, the words, the silhouette"),
            funzione: None,
            licenza: t("Python: PSF; ogni pacchetto la sua (MIT, BSD, Apache-2.0)", "Python: PSF; each package has its own (MIT, BSD, Apache-2.0)"),
            fonte: "https://www.python.org".into(),
            peso,
            lavoro: Lavoro::Python(gruppi),
            ordine: 3,
        });
    }

    // Programmi.
    for (id, ordine) in [("bun", 1u8), ("ffmpeg", 2)] {
        let e = elemento(id);
        if !presente(e, luoghi, sonde) {
            voci.push(voce_di(e, ordine));
        }
    }

    // Pacchetti del codice e browser delle animazioni.
    for cartella in ["server", "animazioni"] {
        if !js_aggiornato(&luoghi.radice.join(cartella)) {
            voci.push(Voce {
                id: format!("js-{cartella}"),
                nome: if cartella == "server" { t("I pacchetti del server", "The server packages") } else { t("I pacchetti delle animazioni", "The animation packages") },
                scopo: if cartella == "server" { t("il server e la chat", "the server and the chat") } else { t("le animazioni", "the animations") },
                funzione: None,
                licenza: t("ognuno la sua (per lo più MIT)", "each has its own (mostly MIT)"),
                fonte: "https://bun.sh".into(),
                peso: if cartella == "server" { 120 * MB } else { 150 * MB },
                lavoro: Lavoro::PacchettiJs(cartella.into()),
                ordine: 4,
            });
        }
    }
    if !chromium_c_e(luoghi) {
        voci.push(Voce {
            id: "chromium".into(),
            nome: "Chromium".into(),
            scopo: t("disegna le animazioni fotogramma per fotogramma", "draws the animations frame by frame"),
            funzione: None,
            licenza: t("BSD-3-Clause e altre (il progetto Chromium)", "BSD-3-Clause and others (the Chromium project)"),
            fonte: "https://playwright.dev".into(),
            peso: 710 * MB,
            lavoro: Lavoro::Chromium,
            ordine: 5,
        });
    }

    // Modelli e programmi delle funzioni accese.
    for e in manifesto.iter().filter(|e| e.funzione.is_some()) {
        let f = e.funzione.as_deref().unwrap_or_default();
        let voluto = match e.id.strip_prefix("whisper-") {
            Some(modello) => (funzioni.attiva("trascrizione") && modello == modelli.trascrizione) || (funzioni.attiva("dettatura") && modello == modelli.dettatura),
            None => funzioni.attiva(f),
        };
        if voluto && !presente(e, luoghi, sonde) {
            voci.push(voce_di(e, 6));
        }
    }
    for (funzione, in_inglese, modello) in [("trascrizione", "transcription", &modelli.trascrizione), ("dettatura", "dictation", &modelli.dettatura)] {
        if funzioni.attiva(funzione) && !manifesto.iter().any(|e| e.id == format!("whisper-{modello}")) {
            avvisi.push(t(
                format!("Per «{funzione}» lo stile chiede il modello «{modello}», che l'app non sa scaricare: lo scarica il motore la prima volta che serve."),
                format!("For “{in_inglese}” the style asks for the model “{modello}”, which the app cannot download: the engine downloads it the first time it is needed."),
            ));
        }
    }

    voci.sort_by_key(|v| v.ordine);
    Piano { voci, python, avvisi }
}

#[cfg(test)]
pub mod prove {
    use super::*;
    use crate::computer::hw::SchedaNvidia;
    use crate::computer::manifesto::elementi;
    use serde_json::json;
    use std::collections::HashSet;

    /// Un computer finto: quali programmi ci sono nel PATH e quali moduli sa importare Python.
    #[derive(Default)]
    pub struct Finte {
        pub programmi: HashSet<&'static str>,
        pub python_completo: Vec<PathBuf>,
        pub python_provati: std::cell::RefCell<Vec<(PathBuf, Vec<String>)>>,
    }

    impl Sonde for Finte {
        fn nel_percorso(&self, programma: &str) -> bool {
            self.programmi.contains(programma)
        }
        fn python_ha(&self, python: &Path, moduli: &[&str]) -> bool {
            self.python_provati.borrow_mut().push((python.to_path_buf(), moduli.iter().map(|m| (*m).to_owned()).collect()));
            self.python_completo.iter().any(|p| p == python)
        }
        fn python_importa(&self, python: &Path, _: &[&str]) -> bool {
            self.python_completo.iter().any(|p| p == python)
        }
    }

    /// Gli stessi elementi con file da 16 byte: le prove scrivono file veri e quelli da gigabyte riempirebbero il disco.
    pub fn piccoli(mut elementi: Vec<Elemento>) -> Vec<Elemento> {
        for e in &mut elementi {
            match &mut e.tipo {
                Tipo::File(f) => f.dimensione = 16,
                Tipo::Hf(r) => r.file.iter_mut().for_each(|f| f.dimensione = 16),
                Tipo::Archivio(a) => a.dimensione = 16,
            }
        }
        elementi
    }

    pub fn luoghi(t: &Path) -> Luoghi {
        let l = Luoghi {
            dati: t.join("dati"),
            radice: t.join("codice"),
            hf: t.join("hf"),
            torch: t.join("torch"),
            modelli: t.join("modelli"),
            playwright: t.join("playwright"),
        };
        for cartella in ["server", "animazioni"] {
            segna_js_installato(&l.radice.join(cartella)).unwrap();
        }
        std::fs::create_dir_all(l.playwright.join("chromium-1234")).unwrap();
        l
    }

    pub fn computer(con_scheda: bool) -> Computer {
        Computer {
            schede: if con_scheda { vec![SchedaNvidia { indice: 0, nome: "NVIDIA GeForce RTX 3060 Ti".into(), memoria_mb: 8192, libera_mb: 8000, capacita: Some("8.6".into()) }] } else { vec![] },
            processore: "Un processore".into(),
            thread: 8,
            ram_mb: 16384,
            disco_libero_mb: 500_000,
        }
    }

    fn tutte_accese() -> Funzioni {
        Funzioni::dal_profilo(&json!({}))
    }

    fn modelli() -> ModelliScelti {
        ModelliScelti { trascrizione: "large-v3".into(), dettatura: "large-v3-turbo".into() }
    }

    fn tutto_il_resto_c_e() -> Finte {
        Finte { programmi: ["bun", "uv", "ffmpeg", "ffprobe"].into_iter().collect(), ..Default::default() }
    }

    fn ids(p: &Piano) -> Vec<&str> {
        p.voci.iter().map(|v| v.id.as_str()).collect()
    }

    /// Mette nella cache di Hugging Face un modello com'è dopo il suo scarico.
    fn metti_il_modello(l: &Luoghi, e: &Elemento) {
        let Tipo::Hf(r) = &e.tipo else { panic!("non è un modello") };
        let cartella = cartella_hf(&l.hf, &r.repo, &r.revisione);
        std::fs::create_dir_all(&cartella).unwrap();
        for f in &r.file {
            let file = std::fs::File::create(cartella.join(&f.nome)).unwrap();
            file.set_len(f.dimensione).unwrap();
        }
        let refs = l.hf.join(format!("models--{}", r.repo.replace('/', "--"))).join("refs");
        std::fs::create_dir_all(&refs).unwrap();
        std::fs::write(refs.join("main"), &r.revisione).unwrap();
    }

    #[test]
    fn le_funzioni_non_nominate_dal_profilo_sono_accese_e_una_spenta_si_legge() {
        let f = Funzioni::dal_profilo(&json!({ "motori": { "sagoma": { "attiva": false }, "trascrizione": { "dove": "scheda" } } }));
        assert!(f.attiva("trascrizione") && f.attiva("pulizia_voce") && !f.attiva("sagoma"));
        assert!(!f.attiva("una_funzione_che_non_c_e"));
    }

    #[test]
    fn il_modello_viene_dal_profilo_poi_dallo_stile_del_creator_poi_da_quello_di_serie() {
        let serie = json!({ "preparati": { "modello_trascrizione": "large-v3" }, "dettatura": { "dispositivi": { "cuda": { "modello": "large-v3-turbo" }, "cpu": { "modello": "small" } } } });
        let creator = json!({ "dettatura": { "dispositivi": { "cpu": { "modello": "base" } } } });
        assert_eq!(ModelliScelti::da(&json!({}), &json!({}), &serie, true), ModelliScelti { trascrizione: "large-v3".into(), dettatura: "large-v3-turbo".into() });
        assert_eq!(ModelliScelti::da(&json!({ "motori": { "trascrizione": { "modello": "small" } } }), &json!({}), &serie, false).trascrizione, "small");
        assert_eq!(ModelliScelti::da(&json!({}), &creator, &serie, false).dettatura, "base");
        assert_eq!(ModelliScelti::da(&json!({}), &json!({}), &json!({}), false), ModelliScelti { trascrizione: "large-v3".into(), dettatura: "small".into() });
    }

    #[test]
    fn un_computer_che_ha_gia_tutto_non_ha_niente_da_scaricare() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let manifesto = piccoli(elementi());
        for e in manifesto.iter().filter(|e| matches!(e.tipo, Tipo::Hf(_))) {
            metti_il_modello(&l, e);
        }
        for e in manifesto.iter() {
            if let Tipo::File(f) = &e.tipo {
                let p = destinazione_del_file(&l, f.posto, &f.nome);
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::File::create(&p).unwrap().set_len(f.dimensione).unwrap();
            }
        }
        let sonde = Finte { python_completo: vec![PathBuf::from("python")], ..tutto_il_resto_c_e() };
        let sonde = Finte { programmi: sonde.programmi.iter().copied().chain(["python"]).collect(), ..sonde };
        let p = calcola(&l, &sonde, &computer(true), &tutte_accese(), &modelli(), false, &manifesto);
        assert!(p.voci.is_empty(), "{:?}", ids(&p));
        assert_eq!(p.python, SceltaPython::DelComputer);
        assert!(p.avvisi.is_empty());
    }

    #[test]
    fn un_computer_vuoto_vuole_tutto_e_si_scarica_solo_cio_che_le_funzioni_accese_richiedono() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        std::fs::remove_dir_all(l.radice.join("server").join("node_modules")).unwrap();
        let manifesto = piccoli(elementi());
        let tutto = calcola(&l, &Finte::default(), &computer(true), &tutte_accese(), &modelli(), false, &manifesto);
        let id = ids(&tutto);
        // I programmi e Python vengono prima di ciò che li usa.
        assert_eq!(&id[..5], ["uv", "bun", "ffmpeg", "python", "js-server"]);
        for voluto in ["whisper-large-v3", "whisper-large-v3-turbo", "mms-fa", "sam2", "vitmatte", "rtdetr", "yunet", "deepfilter"] {
            assert!(id.contains(&voluto), "manca {voluto}: {id:?}");
        }
        assert!(!id.contains(&"whisper-small") && !id.contains(&"chromium"));

        // Senza la sagoma, l'allineamento, la voce pulita e la dettatura: niente di loro, e niente torch.
        let poche = Funzioni::dal_profilo(&json!({ "motori": { "sagoma": { "attiva": false }, "allineamento": { "attiva": false }, "pulizia_voce": { "attiva": false }, "dettatura": { "attiva": false }, "segui": { "attiva": false } } }));
        let meno = calcola(&l, &Finte::default(), &computer(true), &poche, &modelli(), false, &manifesto);
        let id = ids(&meno);
        for non_voluto in ["mms-fa", "sam2", "vitmatte", "rtdetr", "yunet", "deepfilter", "whisper-large-v3-turbo"] {
            assert!(!id.contains(&non_voluto), "{non_voluto} non serve: {id:?}");
        }
        assert!(id.contains(&"whisper-large-v3"));
        let Lavoro::Python(gruppi) = &meno.voci.iter().find(|v| v.id == "python").unwrap().lavoro else { panic!() };
        assert!(gruppi.iter().all(|g| g.pacchetti.iter().all(|p| !p.starts_with("torch"))), "{gruppi:?}");
        assert!(meno.peso_totale() < tutto.peso_totale() / 2);
    }

    #[test]
    fn tutto_spento_lascia_solo_la_base() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let spente: serde_json::Map<String, Value> = super::super::manifesto::FUNZIONI.iter().map(|(f, _, _)| ((*f).to_owned(), json!({ "attiva": false }))).collect();
        let p = calcola(&l, &tutto_il_resto_c_e(), &computer(true), &Funzioni::dal_profilo(&json!({ "motori": spente })), &modelli(), false, &piccoli(elementi()));
        assert_eq!(ids(&p), ["python"]);
        let Lavoro::Python(gruppi) = &p.voci[0].lavoro else { panic!() };
        assert_eq!(gruppi.len(), 1);
    }

    #[test]
    fn con_la_scheda_nvidia_torch_e_quello_con_cuda_e_senza_quello_del_processore() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let solo_torch = Funzioni::dal_profilo(&json!({ "motori": { "trascrizione": { "attiva": false }, "dettatura": { "attiva": false }, "segui": { "attiva": false }, "pulizia_voce": { "attiva": false } } }));
        let indice = |con_scheda: bool| {
            let p = calcola(&l, &tutto_il_resto_c_e(), &computer(con_scheda), &solo_torch, &modelli(), false, &piccoli(elementi()));
            let Lavoro::Python(gruppi) = &p.voci.iter().find(|v| v.id == "python").unwrap().lavoro else { panic!() };
            (gruppi.iter().find(|g| g.pacchetti.iter().any(|x| x.starts_with("torch="))).unwrap().indice.clone().unwrap(), p.voci.iter().find(|v| v.id == "python").unwrap().peso)
        };
        let (cuda, peso_cuda) = indice(true);
        let (cpu, peso_cpu) = indice(false);
        assert!(cuda.ends_with("/cu124") && cpu.ends_with("/cpu"));
        assert!(peso_cuda > 3 * peso_cpu);
    }

    #[test]
    fn la_trascrizione_sulla_scheda_senza_torch_si_porta_la_cublas_di_cuda_e_con_torch_no() {
        let con = |profilo: serde_json::Value, con_cuda: bool| {
            let (gruppi, peso) = gruppi_per(&Funzioni::dal_profilo(&profilo), con_cuda);
            (gruppi.iter().any(|g| g.pacchetti.iter().any(|p| p == "nvidia-cublas-cu12==12.4.5.8")), peso)
        };
        let senza_torch = json!({ "motori": { "allineamento": { "attiva": false }, "sagoma": { "attiva": false } } });
        // Dettatura e trascrizione sulla scheda: la cublas non viene da nessun'altra parte.
        let (c, peso_con) = con(senza_torch.clone(), true);
        assert!(c);
        assert!(!con(senza_torch.clone(), false).0, "sul processore non serve");
        assert!(peso_con > con(senza_torch, false).1 + 300 * MB);
        // Con torch per CUDA la porta lui, e il pacchetto in più sarebbe un'altra copia da mezzo gigabyte.
        assert!(!con(json!({}), true).0);
        assert!(!con(json!({ "motori": { "trascrizione": { "attiva": false }, "dettatura": { "attiva": false } } }), true).0, "senza trascrizione né dettatura non c'entra");
        let una = |f: &str| json!({ "motori": { f: { "attiva": false }, "allineamento": { "attiva": false }, "sagoma": { "attiva": false } } });
        assert!(con(una("trascrizione"), true).0 && con(una("dettatura"), true).0, "basta una delle due");
    }

    #[test]
    fn un_python_che_ha_tutto_si_usa_e_non_si_prepara_niente() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        // Quello dell'app, se c'è e ha tutto, vince su quello del computer.
        std::fs::create_dir_all(l.python_dell_app().parent().unwrap()).unwrap();
        std::fs::write(l.python_dell_app(), "").unwrap();
        segna_python_installato(&l, &gruppi_per(&tutte_accese(), false).0).unwrap();
        let sonde = Finte { python_completo: vec![l.python_dell_app(), PathBuf::from("python")], programmi: ["bun", "ffmpeg", "ffprobe", "python"].into_iter().collect(), ..Default::default() };
        let solo_base = Funzioni::dal_profilo(&json!({ "motori": { "trascrizione": { "attiva": false }, "allineamento": { "attiva": false }, "sagoma": { "attiva": false }, "segui": { "attiva": false }, "pulizia_voce": { "attiva": false }, "dettatura": { "attiva": false } } }));
        let p = calcola(&l, &sonde, &computer(false), &solo_base, &modelli(), false, &piccoli(elementi()));
        assert_eq!(p.python, SceltaPython::DellApp);
        assert!(!ids(&p).contains(&"python") && !ids(&p).contains(&"uv"));
        // Al Python del computer si chiedono tutti i moduli delle funzioni accese, non uno solo.
        let sonde2 = Finte { python_completo: vec![PathBuf::from("python")], programmi: ["bun", "ffmpeg", "ffprobe", "python", "uv"].into_iter().collect(), ..Default::default() };
        let p2 = calcola(&luoghi(&t.path().join("altro")), &sonde2, &computer(false), &tutte_accese(), &modelli(), false, &piccoli(elementi()));
        assert_eq!(p2.python, SceltaPython::DelComputer);
        let provati = sonde2.python_provati.borrow();
        let moduli = &provati[0].1;
        for m in ["jsonschema", "faster_whisper", "torch", "transformers", "cv2", "huggingface_hub"] {
            assert!(moduli.iter().any(|x| x == m), "{m} non è fra i moduli provati: {moduli:?}");
        }
    }

    #[test]
    fn i_pacchetti_js_si_rifanno_quando_il_loro_lockfile_cambia_e_non_quando_resta_uguale() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let sonde = tutto_il_resto_c_e();
        let js = |l: &Luoghi| ids(&calcola(l, &sonde, &computer(true), &tutte_accese(), &modelli(), true, &piccoli(elementi()))).into_iter().filter(|i| i.starts_with("js-")).map(str::to_owned).collect::<Vec<_>>();
        assert!(js(&l).is_empty());

        let server = l.radice.join("server");
        std::fs::write(server.join("bun.lock"), "versione nuova").unwrap();
        assert_eq!(js(&l), ["js-server"]);
        segna_js_installato(&server).unwrap();
        assert!(js(&l).is_empty());

        std::fs::write(server.join("bun.lock"), "un'altra versione").unwrap();
        assert_eq!(js(&l), ["js-server"]);
        segna_js_installato(&server).unwrap();
        std::fs::write(server.join("package.json"), "{}").unwrap();
        assert_eq!(js(&l), ["js-server"]);
        segna_js_installato(&server).unwrap();

        // Le animazioni hanno il loro lockfile: il cambio del server non le riguarda.
        std::fs::write(l.radice.join("animazioni").join("bun.lock"), "x").unwrap();
        assert_eq!(js(&l), ["js-animazioni"]);
    }

    #[test]
    fn dei_pacchetti_js_senza_impronta_non_si_sa_da_dove_vengono_e_si_rifanno() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        std::fs::remove_file(l.radice.join("animazioni").join("node_modules").join(FILE_IMPRONTA_JS)).unwrap();
        let p = calcola(&l, &tutto_il_resto_c_e(), &computer(true), &tutte_accese(), &modelli(), true, &piccoli(elementi()));
        assert_eq!(ids(&p).into_iter().filter(|i| i.starts_with("js-")).collect::<Vec<_>>(), ["js-animazioni"]);
    }

    #[test]
    fn l_impronta_dei_pacchetti_js_cambia_con_il_contenuto_e_con_il_nome_del_file() {
        let t = tempfile::tempdir().unwrap();
        let senza = impronta_js(t.path());
        std::fs::write(t.path().join("bun.lock"), "a").unwrap();
        let con_lock = impronta_js(t.path());
        std::fs::remove_file(t.path().join("bun.lock")).unwrap();
        std::fs::write(t.path().join("package.json"), "a").unwrap();
        let con_package = impronta_js(t.path());
        assert!(senza != con_lock && con_lock != con_package && senza != con_package);
        assert_eq!(con_package, impronta_js(t.path()));
    }

    #[test]
    fn il_python_dell_app_si_rifa_se_i_pacchetti_richiesti_non_sono_quelli_installati() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        std::fs::create_dir_all(l.python_dell_app().parent().unwrap()).unwrap();
        std::fs::write(l.python_dell_app(), "").unwrap();
        // I moduli ci sono tutti: da soli non direbbero niente di una versione cambiata.
        let sonde = Finte { python_completo: vec![l.python_dell_app()], programmi: ["bun", "uv", "ffmpeg", "ffprobe"].into_iter().collect(), ..Default::default() };
        let scelta = |funzioni: &Funzioni, con_scheda: bool| calcola(&l, &sonde, &computer(con_scheda), funzioni, &modelli(), false, &piccoli(elementi())).python;
        let tutte = tutte_accese();

        // Un ambiente fatto prima che l'app tenesse il conto di cosa ci ha messo: non si sa, si rifà.
        assert_eq!(scelta(&tutte, false), SceltaPython::DaPreparare);

        segna_python_installato(&l, &gruppi_per(&tutte, false).0).unwrap();
        assert_eq!(scelta(&tutte, false), SceltaPython::DellApp);

        // Una versione nuova che fissa un pacchetto diverso.
        let mut vecchi = gruppi_per(&tutte, false).0;
        vecchi[0].pacchetti[1] = "numpy==2.0.0".into();
        segna_python_installato(&l, &vecchi).unwrap();
        assert_eq!(scelta(&tutte, false), SceltaPython::DaPreparare);

        // Spegnere delle funzioni non rifà niente: ciò che serve c'è ancora.
        segna_python_installato(&l, &gruppi_per(&tutte, false).0).unwrap();
        let poche = Funzioni::dal_profilo(&json!({ "motori": { "sagoma": { "attiva": false }, "allineamento": { "attiva": false }, "segui": { "attiva": false } } }));
        assert_eq!(scelta(&poche, false), SceltaPython::DellApp);

        // Accenderne una che l'installazione non aveva, o avere ora una scheda che prima non c'era (PyTorch cambia indice): si rifà.
        segna_python_installato(&l, &gruppi_per(&poche, false).0).unwrap();
        assert_eq!(scelta(&tutte, false), SceltaPython::DaPreparare);
        segna_python_installato(&l, &gruppi_per(&tutte, false).0).unwrap();
        assert_eq!(scelta(&tutte, true), SceltaPython::DaPreparare);
    }

    #[test]
    fn un_python_a_cui_mancano_dei_moduli_non_si_tocca_e_si_prepara_quello_dell_app() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let sonde = Finte { programmi: ["bun", "ffmpeg", "ffprobe", "python", "uv"].into_iter().collect(), ..Default::default() };
        let p = calcola(&l, &sonde, &computer(false), &tutte_accese(), &modelli(), false, &piccoli(elementi()));
        assert_eq!(p.python, SceltaPython::DaPreparare);
        assert!(ids(&p).contains(&"python") && !ids(&p).contains(&"uv"), "uv c'è già: {:?}", ids(&p));
    }

    #[test]
    fn la_variabile_di_chi_sviluppa_vince_e_non_si_controlla() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let sonde = tutto_il_resto_c_e();
        let p = calcola(&l, &sonde, &computer(true), &Funzioni::dal_profilo(&json!({})), &modelli(), true, &piccoli(elementi()));
        assert_eq!(p.python, SceltaPython::Variabile);
        assert!(!ids(&p).contains(&"python") && sonde.python_provati.borrow().is_empty());
    }

    #[test]
    fn un_modello_gia_nella_cache_di_qualunque_revisione_non_si_riscarica_ma_uno_a_meta_si() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let manifesto = piccoli(elementi());
        let sam2 = manifesto.iter().find(|e| e.id == "sam2").unwrap();
        let Tipo::Hf(r) = &sam2.tipo else { panic!() };
        let sonde = tutto_il_resto_c_e();
        let solo_sagoma = Funzioni::dal_profilo(&json!({ "motori": { "trascrizione": { "attiva": false }, "dettatura": { "attiva": false }, "segui": { "attiva": false }, "pulizia_voce": { "attiva": false }, "allineamento": { "attiva": false } } }));
        let ha = |p: &Piano| ids(p).contains(&"sam2");
        assert!(ha(&calcola(&l, &sonde, &computer(true), &solo_sagoma, &modelli(), true, &manifesto)));
        // Nella cache con un'altra revisione (come l'ha messo `huggingface_hub`): c'è.
        let altra = Elemento { tipo: Tipo::Hf(super::super::manifesto::RepoHf { revisione: "a".repeat(40), ..r.clone() }), ..sam2.clone() };
        metti_il_modello(&l, &altra);
        assert!(!ha(&calcola(&l, &sonde, &computer(true), &solo_sagoma, &modelli(), true, &manifesto)));
        // Un file troncato (scarico interrotto): non c'è.
        let troncato = cartella_hf(&l.hf, &r.repo, &"a".repeat(40)).join("model.safetensors");
        std::fs::File::create(&troncato).unwrap().set_len(10).unwrap();
        assert!(ha(&calcola(&l, &sonde, &computer(true), &solo_sagoma, &modelli(), true, &manifesto)));
    }

    #[test]
    fn un_modello_di_whisper_che_il_manifesto_non_ha_si_dice_invece_di_ignorarlo() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let strano = ModelliScelti { trascrizione: "medium".into(), dettatura: "small".into() };
        let p = calcola(&l, &tutto_il_resto_c_e(), &computer(false), &tutte_accese(), &strano, true, &piccoli(elementi()));
        assert_eq!(p.avvisi.len(), 1);
        assert!(p.avvisi[0].contains("medium") && p.avvisi[0].contains("trascrizione"));
        assert!(ids(&p).contains(&"whisper-small"));
    }

    #[test]
    fn lo_spazio_che_serve_conta_i_pacchetti_due_volte_e_un_gigabyte_di_margine() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let p = calcola(&l, &tutto_il_resto_c_e(), &computer(false), &Funzioni::dal_profilo(&json!({ "motori": { "trascrizione": { "attiva": false }, "allineamento": { "attiva": false }, "sagoma": { "attiva": false }, "segui": { "attiva": false }, "pulizia_voce": { "attiva": false }, "dettatura": { "attiva": false } } })), &modelli(), false, &piccoli(elementi()));
        assert_eq!(p.peso_totale(), 300 * MB);
        assert_eq!(p.servono_mb(), 600 + 1024);
    }

    #[test]
    fn i_posti_sono_quelli_che_leggono_hugging_face_pytorch_e_playwright() {
        let da = |coppie: &'static [(&'static str, &'static str)]| move |n: &str| coppie.iter().find(|(k, _)| *k == n).map(|(_, v)| (*v).to_owned());
        let l = Luoghi::dell_utente(PathBuf::from("D"), PathBuf::from("R"), &da(&[("USERPROFILE", r"C:\Utenti\esempio"), ("LOCALAPPDATA", r"C:\Utenti\esempio\AppData\Local")]));
        assert_eq!(l.hf, PathBuf::from(r"C:\Utenti\esempio\.cache\huggingface\hub"));
        assert_eq!(l.torch, PathBuf::from(r"C:\Utenti\esempio\.cache\torch\hub\checkpoints"));
        assert_eq!(l.modelli, PathBuf::from(r"C:\Utenti\esempio\.cache\mango-animation\modelli"));
        assert_eq!(l.playwright, PathBuf::from(r"C:\Utenti\esempio\AppData\Local\ms-playwright"));
        let l = Luoghi::dell_utente(PathBuf::from("D"), PathBuf::from("R"), &da(&[("USERPROFILE", "U"), ("HF_HOME", "H"), ("TORCH_HOME", "T"), ("PLAYWRIGHT_BROWSERS_PATH", "P")]));
        assert_eq!((l.hf, l.torch, l.playwright), (PathBuf::from("H").join("hub"), PathBuf::from("T").join("hub").join("checkpoints"), PathBuf::from("P")));
    }

    #[test]
    fn le_cartelle_del_percorso_sono_solo_quelle_che_ci_sono() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        assert!(l.cartelle_del_percorso().is_empty());
        std::fs::create_dir_all(l.bin()).unwrap();
        assert_eq!(l.cartelle_del_percorso(), vec![l.bin()]);
    }

    #[test]
    fn il_piano_dice_a_cosa_serve_ogni_voce_e_la_licenza_nella_lingua_in_uso() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        // Un computer senza niente: Python, i programmi, i pacchetti, il browser e i modelli.
        std::fs::remove_dir_all(l.radice.join("server").join("node_modules")).unwrap();
        std::fs::remove_dir_all(l.playwright.join("chromium-1234")).unwrap();
        let piano = |lingua| {
            crate::lingua::con(lingua, || calcola(&l, &Finte::default(), &computer(true), &tutte_accese(), &modelli(), false, &piccoli(elementi())))
        };
        let it = piano(crate::lingua::Lingua::It);
        let en = piano(crate::lingua::Lingua::En);
        assert_eq!(ids(&it), ids(&en));
        assert!(it.voci.iter().any(|v| v.scopo == "ritaglia la tua sagoma dal video") && it.voci.iter().any(|v| v.nome == "Python e i suoi pacchetti"));
        assert!(en.voci.iter().any(|v| v.scopo == "cuts your silhouette out of the video") && en.voci.iter().any(|v| v.nome == "Python and its packages"));
        for v in &en.voci {
            for testo in [&v.nome, &v.scopo, &v.licenza] {
                assert!(!testo.chars().any(|c| "àèéìòù".contains(c)), "{}: «{testo}» ha una lettera italiana", v.id);
                assert!(!testo.contains("pacchetti di ") && !testo.contains(" e ") && !testo.contains("ogni "), "{}: «{testo}» ha una parola italiana", v.id);
            }
        }
        let mms = en.voci.iter().find(|v| v.id == "mms-fa").unwrap();
        assert_eq!((mms.nome.as_str(), mms.licenza.as_str()), ("MMS", "CC-BY-NC-4.0 (non-commercial)"));
    }

    #[test]
    fn l_avviso_su_un_modello_che_l_app_non_scarica_esce_nelle_due_lingue() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let strano = ModelliScelti { trascrizione: "medium".into(), dettatura: "large-v3-turbo".into() };
        let avvisi = |lingua| crate::lingua::con(lingua, || calcola(&l, &tutto_il_resto_c_e(), &computer(true), &tutte_accese(), &strano, true, &piccoli(elementi())).avvisi);
        assert_eq!(avvisi(crate::lingua::Lingua::It), ["Per «trascrizione» lo stile chiede il modello «medium», che l'app non sa scaricare: lo scarica il motore la prima volta che serve."]);
        assert_eq!(
            avvisi(crate::lingua::Lingua::En),
            ["For “transcription” the style asks for the model “medium”, which the app cannot download: the engine downloads it the first time it is needed."]
        );
    }
}
