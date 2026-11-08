//! Preparare il computer: scarica con verifica ciò che il piano dice (`piano.rs`) e lo mette dove il motore lo cerca, e lancia gli installatori
//! (`uv` per Python, `bun install`, `playwright install`) mostrando ciò che scrivono.

use super::manifesto::{Archivio, FileSolo, RepoHf, Tipo};
use super::piano::{cartella_hf, destinazione_del_file, segna_js_installato, segna_python_installato, Gruppo, Lavoro, Luoghi, Sonde, Voce};
use super::scarica::{scarica, Fonte};
use crate::lingua::t;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::os::windows::process::CommandExt;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
pub const HUGGING_FACE: &str = "https://huggingface.co";
const PYTHON_DA_INSTALLARE: &str = "3.12";

/// Cosa succede, voce per voce, mentre si prepara.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Evento {
    Inizia(String),
    /// Byte scaricati e totali della voce (di un modello con più file: la somma).
    Avanza { id: String, fatti: u64, totale: u64 },
    /// Una riga di ciò che sta scrivendo un installatore.
    Riga { id: String, testo: String },
    Fatta(String),
}

/// Dove sono i programmi con cui si installa.
#[derive(Clone, Debug)]
pub struct Strumenti {
    pub uv: PathBuf,
    pub bun: PathBuf,
    /// Il PATH con cui girano gli installatori: ha davanti le cartelle dei programmi scaricati dall'app.
    pub percorso: OsString,
}

/// L'indirizzo di un programma: quello scaricato dall'app, o quello che si trova nel PATH.
pub fn trova_programma(luoghi: &Luoghi, nome: &str, percorsi: &OsStr) -> Option<PathBuf> {
    let suo = luoghi.bin().join(format!("{nome}.exe"));
    if suo.is_file() {
        return Some(suo);
    }
    // Come `nel_percorso`: anche `.cmd` e `.bat` (Bun installato con npm), con `.exe` prima nella stessa cartella.
    std::env::split_paths(percorsi).find_map(|c| ["exe", "cmd", "bat"].iter().map(|e| c.join(format!("{nome}.{e}"))).find(|p| p.is_file()))
}

/// Le sonde vere: il PATH e il Python.
pub struct SondeVere {
    pub percorsi: OsString,
}

impl SondeVere {
    fn python_esegue(&self, programma: &str, python: &Path, moduli: &[&str]) -> bool {
        let mut comando = Command::new(python);
        comando.args(["-c", programma]).args(moduli).env("PATH", &self.percorsi).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(CREATE_NO_WINDOW);
        comando.status().is_ok_and(|s| s.success())
    }
}

impl Sonde for SondeVere {
    fn nel_percorso(&self, programma: &str) -> bool {
        std::env::split_paths(&self.percorsi).any(|c| ["exe", "cmd", "bat"].iter().any(|e| c.join(format!("{programma}.{e}")).is_file()))
    }

    fn python_ha(&self, python: &Path, moduli: &[&str]) -> bool {
        self.python_esegue("import importlib.util, sys\nsys.exit(0 if all(importlib.util.find_spec(m) for m in sys.argv[1:]) else 1)", python, moduli)
    }

    fn python_importa(&self, python: &Path, moduli: &[&str]) -> bool {
        self.python_esegue("import importlib, sys\nfor m in sys.argv[1:]:\n    importlib.import_module(m)", python, moduli)
    }
}

/// Lancia un programma nascosto e ne passa le righe a `riga`; torna Err con le ultime righe se esce con un errore, e lo ferma (per il suo PID) se `annulla` si accende.
pub fn esegui_comando(exe: &Path, args: &[OsString], cwd: &Path, env: &[(OsString, OsString)], annulla: &AtomicBool, riga: &mut dyn FnMut(&str)) -> Result<(), String> {
    let mut figlio = Command::new(exe)
        .args(args)
        .current_dir(cwd)
        .envs(env.iter().map(|(k, v)| (k, v)))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| t(format!("non riesco ad avviare {} ({e})", exe.display()), format!("I can't start {} ({e})", exe.display())))?;
    let (mittente, ricevitore) = mpsc::channel::<String>();
    let leggi = |flusso: Box<dyn Read + Send>, mittente: mpsc::Sender<String>| {
        std::thread::spawn(move || {
            // Gli installatori scrivono avanzamenti con il ritorno a capo (`\r`): ogni pezzo è una riga.
            for pezzo in BufReader::new(flusso).split(b'\n').map_while(Result::ok) {
                for r in String::from_utf8_lossy(&pezzo).split('\r').map(str::trim).filter(|r| !r.is_empty()) {
                    let _ = mittente.send(r.to_owned());
                }
            }
        })
    };
    let fuori = leggi(Box::new(figlio.stdout.take().expect("stdout")), mittente.clone());
    let errori = leggi(Box::new(figlio.stderr.take().expect("stderr")), mittente);
    let mut ultime: Vec<String> = Vec::new();
    let stato = loop {
        match ricevitore.recv_timeout(Duration::from_millis(100)) {
            Ok(r) => {
                riga(&r);
                ultime.push(r);
                if ultime.len() > 8 {
                    ultime.remove(0);
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Timeout) | Err(mpsc::RecvTimeoutError::Disconnected) => {}
        }
        if annulla.load(Ordering::SeqCst) {
            let _ = figlio.kill();
            let _ = figlio.wait();
            return Err("annullato".into());
        }
        if let Some(stato) = figlio.try_wait().map_err(|e| e.to_string())? {
            break stato;
        }
    };
    let _ = (fuori.join(), errori.join());
    // Le righe arrivate fra l'ultima lettura e la fine del processo.
    while let Ok(r) = ricevitore.try_recv() {
        riga(&r);
        ultime.push(r);
    }
    if stato.success() {
        Ok(())
    } else {
        let coda = ultime.iter().rev().take(4).rev().cloned().collect::<Vec<_>>().join("\n");
        Err(t(format!("{} è finito con un errore ({}):\n{coda}", exe.file_name().unwrap_or_default().to_string_lossy(), stato.code().map_or("?".into(), |c| c.to_string())), format!("{} ended with an error ({}):\n{coda}", exe.file_name().unwrap_or_default().to_string_lossy(), stato.code().map_or("?".into(), |c| c.to_string()))))
    }
}

fn nome_del_file(url: &str) -> &str {
    url.rsplit('/').next().unwrap_or("scarico")
}

fn percorso_sicuro(relativo: &str) -> Option<PathBuf> {
    let p = Path::new(relativo);
    p.components().all(|c| matches!(c, Component::Normal(_))).then(|| p.to_path_buf())
}

fn estrai(zip: &Path, a: &Archivio, dati: &Path) -> Result<(), String> {
    let mut archivio = zip::ZipArchive::new(fs::File::open(zip).map_err(|e| e.to_string())?).map_err(|e| t(format!("l'archivio scaricato non si apre ({e})"), format!("the downloaded archive will not open ({e})")))?;
    for i in 0..archivio.len() {
        let mut voce = archivio.by_index(i).map_err(|e| e.to_string())?;
        if voce.is_dir() {
            continue;
        }
        let nome = voce.name().replace('\\', "/");
        let destinazione = if let Some(x) = a.estrai.iter().find(|x| x.da == nome) {
            percorso_sicuro(&x.a).map(|p| dati.join(p))
        } else {
            a.cartella.as_ref().and_then(|c| nome.strip_prefix(&c.da).and_then(|resto| Some((percorso_sicuro(&c.a)?, percorso_sicuro(resto)?)))).map(|(a, resto)| dati.join(a).join(resto))
        };
        let Some(destinazione) = destinazione else { continue };
        if let Some(cartella) = destinazione.parent() {
            fs::create_dir_all(cartella).map_err(|e| t(format!("non riesco a creare {} ({e})", cartella.display()), format!("I can't create {} ({e})", cartella.display())))?;
        }
        let mut file = fs::File::create(&destinazione).map_err(|e| t(format!("non riesco a scrivere {} ({e})", destinazione.display()), format!("I can't write {} ({e})", destinazione.display())))?;
        std::io::copy(&mut voce, &mut file).map_err(|e| t(format!("non riesco a estrarre {} ({e})", destinazione.display()), format!("I can't extract {} ({e})", destinazione.display())))?;
    }
    let mancanti: Vec<&str> = a.estrai.iter().filter(|x| !dati.join(&x.a).is_file()).map(|x| x.da.as_str()).collect();
    if mancanti.is_empty() {
        Ok(())
    } else {
        Err(t(format!("nell'archivio non c'è {}", mancanti.join(", ")), format!("{} is not in the archive", mancanti.join(", "))))
    }
}

fn installa_archivio(a: &Archivio, luoghi: &Luoghi, annulla: &AtomicBool, avanza: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let zip = luoghi.dati.join("scarichi").join(nome_del_file(&a.url));
    scarica(Fonte { url: &a.url, sha256: &a.sha256, dimensione: a.dimensione }, &zip, annulla, &mut |n| avanza(n, a.dimensione))?;
    estrai(&zip, a, &luoghi.dati)?;
    let _ = fs::remove_file(&zip);
    Ok(())
}

fn installa_file(f: &FileSolo, luoghi: &Luoghi, annulla: &AtomicBool, avanza: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let destinazione = destinazione_del_file(luoghi, f.posto, &f.nome);
    scarica(Fonte { url: &f.url, sha256: &f.sha256, dimensione: f.dimensione }, &destinazione, annulla, &mut |n| avanza(n, f.dimensione))
}

/// I file di un modello nella cache di Hugging Face (`snapshots/<revisione>/`), e `refs/main` che dice qual è: è lì che `from_pretrained` lo cerca.
fn installa_modello(r: &RepoHf, luoghi: &Luoghi, base: &str, annulla: &AtomicBool, avanza: &mut dyn FnMut(u64, u64)) -> Result<(), String> {
    let cartella = cartella_hf(&luoghi.hf, &r.repo, &r.revisione);
    let totale: u64 = r.file.iter().map(|f| f.dimensione).sum();
    let mut fatti_prima = 0;
    for f in &r.file {
        let url = format!("{base}/{}/resolve/{}/{}", r.repo, r.revisione, f.nome);
        let destinazione = cartella.join(&f.nome);
        if !fs::metadata(&destinazione).is_ok_and(|m| m.len() == f.dimensione) {
            scarica(Fonte { url: &url, sha256: &f.sha256, dimensione: f.dimensione }, &destinazione, annulla, &mut |n| avanza(fatti_prima + n, totale))?;
        }
        fatti_prima += f.dimensione;
        avanza(fatti_prima, totale);
    }
    let refs = luoghi.hf.join(format!("models--{}", r.repo.replace('/', "--"))).join("refs");
    fs::create_dir_all(&refs).map_err(|e| e.to_string())?;
    fs::write(refs.join("main"), &r.revisione).map_err(|e| t(format!("non riesco a scrivere {} ({e})", refs.join("main").display()), format!("I can't write {} ({e})", refs.join("main").display())))
}

fn installa_python(luoghi: &Luoghi, gruppi: &[Gruppo], strumenti: &Strumenti, annulla: &AtomicBool, riga: &mut dyn FnMut(&str)) -> Result<(), String> {
    let env: Vec<(OsString, OsString)> = vec![
        ("UV_PYTHON_INSTALL_DIR".into(), luoghi.dati.join("python").into_os_string()),
        ("UV_CACHE_DIR".into(), luoghi.dati.join("uv-cache").into_os_string()),
        ("PATH".into(), strumenti.percorso.clone()),
    ];
    fs::create_dir_all(&luoghi.dati).map_err(|e| e.to_string())?;
    let os = |s: &str| OsString::from(s);
    esegui_comando(&strumenti.uv, &[os("python"), os("install"), os(PYTHON_DA_INSTALLARE), os("--no-bin")], &luoghi.dati, &env, annulla, riga)?;
    esegui_comando(&strumenti.uv, &[os("venv"), luoghi.ambiente_python().into_os_string(), os("--python"), os(PYTHON_DA_INSTALLARE), os("--allow-existing")], &luoghi.dati, &env, annulla, riga)?;
    for gruppo in gruppi {
        let mut args = vec![os("pip"), os("install"), os("--python"), luoghi.python_dell_app().into_os_string()];
        if let Some(indice) = &gruppo.indice {
            // Le dipendenze di PyTorch (numpy, sympy…) restano quelle di PyPI.
            args.extend(["--index-url", indice, "--extra-index-url", "https://pypi.org/simple", "--index-strategy", "unsafe-best-match"].map(os));
        }
        args.extend(gruppo.pacchetti.iter().map(|p| os(p)));
        esegui_comando(&strumenti.uv, &args, &luoghi.dati, &env, annulla, riga)?;
    }
    segna_python_installato(luoghi, gruppi)
}

/// Fa una voce del piano. `avanza` riceve byte fatti e totali (per ciò che si scarica), `riga` ciò che scrivono gli installatori.
pub fn fai(voce: &Voce, luoghi: &Luoghi, strumenti: &Strumenti, hf: &str, annulla: &AtomicBool, avanza: &mut dyn FnMut(u64, u64), riga: &mut dyn FnMut(&str)) -> Result<(), String> {
    let os = |s: &str| OsString::from(s);
    let env = [(os("PATH"), strumenti.percorso.clone())];
    match &voce.lavoro {
        Lavoro::Elemento(e) => match &e.tipo {
            Tipo::Archivio(a) => installa_archivio(a, luoghi, annulla, avanza),
            Tipo::File(f) => installa_file(f, luoghi, annulla, avanza),
            Tipo::Hf(r) => installa_modello(r, luoghi, hf, annulla, avanza),
        },
        Lavoro::Python(gruppi) => installa_python(luoghi, gruppi, strumenti, annulla, riga),
        Lavoro::PacchettiJs(cartella) => {
            let dove = luoghi.radice.join(cartella);
            esegui_comando(&strumenti.bun, &[os("install")], &dove, &env, annulla, riga)?;
            segna_js_installato(&dove)
        }
        Lavoro::Chromium => esegui_comando(&strumenti.bun, &[os("x"), os("playwright"), os("install"), os("chromium")], &luoghi.radice.join("animazioni"), &env, annulla, riga),
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use crate::computer::manifesto::{Cartella, Estratto, FileDiRepo, Posto};
    use crate::computer::piano::prove::luoghi;
    use crate::computer::piano::{js_aggiornato, python_aggiornato};
    use crate::computer::scarica::prove::{server, sha_di};
    use std::io::Write;

    fn zip_di_prova(file: &[(&str, &[u8])]) -> Vec<u8> {
        let mut dati = std::io::Cursor::new(Vec::new());
        let mut scrittore = zip::ZipWriter::new(&mut dati);
        for (nome, contenuto) in file {
            scrittore.start_file(*nome, zip::write::SimpleFileOptions::default()).unwrap();
            scrittore.write_all(contenuto).unwrap();
        }
        scrittore.finish().unwrap();
        dati.into_inner()
    }

    fn nessuno() -> AtomicBool {
        AtomicBool::new(false)
    }

    #[test]
    fn un_archivio_si_scarica_si_verifica_e_si_estrae_dove_dice_il_manifesto() {
        let zip = zip_di_prova(&[("bun-windows-x64/bun.exe", b"programma"), ("bun-windows-x64/LEGGIMI", b"no"), ("ffmpeg-1/bin/ffmpeg.exe", b"ff"), ("ffmpeg-1/bin/ffprobe.exe", b"fp"), ("ffmpeg-1/doc/x.txt", b"doc")]);
        let (url, _) = server(zip.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let a = Archivio {
            url: url.replace("/file", "/bun.zip"),
            sha256: sha_di(&zip),
            dimensione: zip.len() as u64,
            estrai: vec![Estratto { da: "bun-windows-x64/bun.exe".into(), a: "bin/bun.exe".into() }],
            cartella: Some(Cartella { da: "ffmpeg-1/bin/".into(), a: "ffmpeg/".into() }),
        };
        let mut visti = Vec::new();
        installa_archivio(&a, &l, &nessuno(), &mut |f, tot| visti.push((f, tot))).unwrap();
        assert_eq!(fs::read(l.bin().join("bun.exe")).unwrap(), b"programma");
        assert_eq!(fs::read(l.ffmpeg().join("ffmpeg.exe")).unwrap(), b"ff");
        assert_eq!(fs::read(l.ffmpeg().join("ffprobe.exe")).unwrap(), b"fp");
        // Il resto dell'archivio non si estrae, e l'archivio scaricato si toglie.
        assert!(!l.dati.join("bin").join("LEGGIMI").exists() && !l.ffmpeg().join("x.txt").exists());
        assert!(!l.dati.join("scarichi").join("bun.zip").exists());
        assert_eq!(*visti.last().unwrap(), (zip.len() as u64, zip.len() as u64));
    }

    #[test]
    fn un_archivio_senza_il_file_promesso_dice_quale_manca() {
        let zip = zip_di_prova(&[("altro.exe", b"x")]);
        let (url, _) = server(zip.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let a = Archivio { url: url.replace("/file", "/uv.zip"), sha256: sha_di(&zip), dimensione: zip.len() as u64, estrai: vec![Estratto { da: "uv.exe".into(), a: "bin/uv.exe".into() }], cartella: None };
        let errore = installa_archivio(&a, &l, &nessuno(), &mut |_, _| {}).unwrap_err();
        assert!(errore.contains("non c'è uv.exe"), "{errore}");
    }

    #[test]
    fn un_archivio_non_scrive_fuori_dalla_cartella_dell_app() {
        let zip = zip_di_prova(&[("x/../../fuori.txt", b"no"), ("x/dentro.txt", b"si")]);
        let (url, _) = server(zip.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let a = Archivio { url: url.replace("/file", "/z.zip"), sha256: sha_di(&zip), dimensione: zip.len() as u64, estrai: vec![], cartella: Some(Cartella { da: "x/".into(), a: "cartella/".into() }) };
        installa_archivio(&a, &l, &nessuno(), &mut |_, _| {}).unwrap();
        assert_eq!(fs::read(l.dati.join("cartella").join("dentro.txt")).unwrap(), b"si");
        assert!(!t.path().join("fuori.txt").exists() && !l.dati.join("fuori.txt").exists());
        assert_eq!(fs::read_dir(l.dati.join("cartella")).unwrap().count(), 1);
    }

    #[test]
    fn un_file_solo_va_dove_il_motore_lo_cerca() {
        let dati = b"pesi del modello".to_vec();
        let (url, _) = server(dati.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let f = FileSolo { url, sha256: sha_di(&dati), dimensione: dati.len() as u64, posto: Posto::Torch, nome: "model.pt".into() };
        installa_file(&f, &l, &nessuno(), &mut |_, _| {}).unwrap();
        assert_eq!(fs::read(l.torch.join("model.pt")).unwrap(), dati);
        let f2 = FileSolo { posto: Posto::Modelli, nome: "deep-filter.exe".into(), ..f };
        installa_file(&f2, &l, &nessuno(), &mut |_, _| {}).unwrap();
        assert!(l.modelli.join("deep-filter.exe").is_file());
    }

    #[test]
    fn un_modello_di_hugging_face_va_nella_sua_cache_e_refs_main_dice_la_revisione() {
        let config = br#"{"model_type": "x"}"#.to_vec();
        let (url, _) = server(config.clone(), None, false);
        let base = url.trim_end_matches("/file").to_owned();
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let r = RepoHf { repo: "org/nome".into(), revisione: "b".repeat(40), file: vec![FileDiRepo { nome: "config.json".into(), sha256: sha_di(&config), dimensione: config.len() as u64 }] };
        // Il server di prova risponde su ogni percorso: l'indirizzo vero è `<base>/org/nome/resolve/<revisione>/config.json`.
        let mut visti = Vec::new();
        installa_modello(&r, &l, &base, &nessuno(), &mut |f, tot| visti.push((f, tot))).unwrap();
        assert_eq!(fs::read(cartella_hf(&l.hf, "org/nome", &"b".repeat(40)).join("config.json")).unwrap(), config);
        assert_eq!(fs::read_to_string(l.hf.join("models--org--nome").join("refs").join("main")).unwrap(), "b".repeat(40));
        assert_eq!(*visti.last().unwrap(), (config.len() as u64, config.len() as u64));
    }

    fn finto(cartella: &Path, nome: &str, corpo: &str) -> PathBuf {
        let p = cartella.join(nome);
        fs::write(&p, corpo.replace('\n', "\r\n")).unwrap();
        p
    }

    #[test]
    fn un_comando_passa_le_sue_righe_e_se_fallisce_dice_le_ultime() {
        let t = tempfile::tempdir().unwrap();
        let bene = finto(t.path(), "bene.cmd", "@echo off\necho uno\necho due 1>&2\nexit /b 0\n");
        let mut righe = Vec::new();
        esegui_comando(&bene, &[], t.path(), &[], &nessuno(), &mut |r| righe.push(r.to_owned())).unwrap();
        righe.sort();
        assert_eq!(righe, ["due", "uno"]);
        let male = finto(t.path(), "male.cmd", "@echo off\necho provo\necho non va 1>&2\nexit /b 3\n");
        let errore = esegui_comando(&male, &[], t.path(), &[], &nessuno(), &mut |_| {}).unwrap_err();
        assert!(errore.contains("(3)") && errore.contains("non va") && errore.contains("male.cmd"), "{errore}");
        assert!(esegui_comando(&t.path().join("non-c-e.exe"), &[], t.path(), &[], &nessuno(), &mut |_| {}).unwrap_err().contains("non riesco ad avviare"));
    }

    #[test]
    fn annullare_ferma_il_comando_che_sta_girando() {
        let t = tempfile::tempdir().unwrap();
        let lento = finto(t.path(), "lento.cmd", "@echo off\necho parto\nping -n 60 127.0.0.1 > nul\n");
        let annulla = AtomicBool::new(false);
        let inizio = std::time::Instant::now();
        let esito = esegui_comando(&lento, &[], t.path(), &[], &annulla, &mut |r| {
            if r == "parto" {
                annulla.store(true, Ordering::SeqCst);
            }
        });
        assert_eq!(esito, Err("annullato".into()));
        assert!(inizio.elapsed() < Duration::from_secs(20));
    }

    #[test]
    fn python_si_prepara_con_uv_in_tre_passi_e_i_pacchetti_di_pytorch_dal_loro_indice() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let registro = t.path().join("uv.log");
        // Un finto uv: scrive ciò che gli si chiede e le variabili che gli servono.
        let uv = finto(t.path(), "uv.cmd", &format!("@echo off\necho %* >> \"{}\"\necho UV_PYTHON_INSTALL_DIR=%UV_PYTHON_INSTALL_DIR% >> \"{}\"\nexit /b 0\n", registro.display(), registro.display()));
        let strumenti = Strumenti { uv, bun: PathBuf::from("bun"), percorso: "percorso-di-prova".into() };
        let gruppi = vec![
            Gruppo { pacchetti: vec!["jsonschema==4.26.0".into(), "numpy==2.4.3".into()], indice: None },
            Gruppo { pacchetti: vec!["torch==2.6.0".into()], indice: Some("https://download.pytorch.org/whl/cu124".into()) },
        ];
        installa_python(&l, &gruppi, &strumenti, &nessuno(), &mut |_| {}).unwrap();
        // Rust mette fra virgolette gli argomenti con «=» quando lancia un file .cmd; un uv.exe vero non le vede.
        let scritto = fs::read_to_string(&registro).unwrap().replace('"', "");
        let righe: Vec<&str> = scritto.lines().map(str::trim).filter(|r| !r.starts_with("UV_PYTHON_INSTALL_DIR")).collect();
        let python = l.python_dell_app().display().to_string();
        assert_eq!(righe[0], "python install 3.12 --no-bin");
        assert_eq!(righe[1], format!("venv {} --python 3.12 --allow-existing", l.ambiente_python().display()));
        assert_eq!(righe[2], format!("pip install --python {python} jsonschema==4.26.0 numpy==2.4.3"));
        assert_eq!(righe[3], format!("pip install --python {python} --index-url https://download.pytorch.org/whl/cu124 --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match torch==2.6.0"));
        assert!(scritto.contains(&format!("UV_PYTHON_INSTALL_DIR={}", l.dati.join("python").display())));
        // Finito, l'ambiente ricorda cosa ci è stato messo, con l'indice da cui viene.
        assert!(python_aggiornato(&l, &gruppi));
        assert!(!python_aggiornato(&l, &[Gruppo { pacchetti: vec!["numpy==9.9.9".into()], indice: None }]));
    }

    #[test]
    fn se_un_passo_di_python_fallisce_non_si_va_avanti() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let registro = t.path().join("uv.log");
        let uv = finto(t.path(), "uv.cmd", &format!("@echo off\necho %1 >> \"{}\"\necho nessuna rete 1>&2\nexit /b 2\n", registro.display()));
        let strumenti = Strumenti { uv, bun: PathBuf::from("bun"), percorso: "x".into() };
        let errore = installa_python(&l, &[], &strumenti, &nessuno(), &mut |_| {}).unwrap_err();
        assert!(errore.contains("nessuna rete"), "{errore}");
        assert_eq!(fs::read_to_string(&registro).unwrap().lines().count(), 1);
    }

    #[test]
    fn un_python_installato_a_meta_non_si_segna_come_fatto() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let uv = finto(t.path(), "uv.cmd", "@echo off
if \"%1\"==\"pip\" exit /b 1
exit /b 0
");
        let strumenti = Strumenti { uv, bun: PathBuf::from("bun"), percorso: "x".into() };
        let gruppi = [Gruppo { pacchetti: vec!["numpy==2.4.3".into()], indice: None }];
        installa_python(&l, &gruppi, &strumenti, &nessuno(), &mut |_| {}).unwrap_err();
        assert!(!python_aggiornato(&l, &gruppi));
    }

    #[test]
    fn i_pacchetti_js_e_chromium_girano_con_bun_nella_cartella_giusta() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let registro = t.path().join("bun.log");
        let bun = finto(t.path(), "bun.cmd", &format!("@echo off\necho %CD%^|%* >> \"{}\"\nexit /b 0\n", registro.display()));
        let strumenti = Strumenti { uv: PathBuf::from("uv"), bun, percorso: "x".into() };
        let voce = |lavoro| Voce { id: "x".into(), nome: "x".into(), scopo: "x".into(), funzione: None, licenza: "x".into(), fonte: "x".into(), peso: 1, lavoro, ordine: 1 };
        fai(&voce(Lavoro::PacchettiJs("server".into())), &l, &strumenti, HUGGING_FACE, &nessuno(), &mut |_, _| {}, &mut |_| {}).unwrap();
        fai(&voce(Lavoro::Chromium), &l, &strumenti, HUGGING_FACE, &nessuno(), &mut |_, _| {}, &mut |_| {}).unwrap();
        let scritto = fs::read_to_string(&registro).unwrap();
        let righe: Vec<&str> = scritto.lines().map(str::trim).collect();
        assert_eq!(righe[0], format!("{}|install", l.radice.join("server").display()));
        assert_eq!(righe[1], format!("{}|x playwright install chromium", l.radice.join("animazioni").display()));
    }

    #[test]
    fn i_pacchetti_js_installati_si_segnano_con_il_lockfile_di_quel_momento_e_un_bun_install_fallito_no() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let server = l.radice.join("server");
        fs::write(server.join("bun.lock"), "uno").unwrap();
        assert!(!js_aggiornato(&server));
        let voce = Voce { id: "js-server".into(), nome: "x".into(), scopo: "x".into(), funzione: None, licenza: "x".into(), fonte: "x".into(), peso: 1, lavoro: Lavoro::PacchettiJs("server".into()), ordine: 1 };
        // Il finto bun riscrive il lockfile, come fa il vero quando lo aggiorna: conta quello che resta.
        let bun = finto(t.path(), "bun.cmd", &format!("@echo off
echo due> \"{}\"
exit /b 0
", server.join("bun.lock").display()));
        fai(&voce, &l, &Strumenti { uv: PathBuf::from("uv"), bun, percorso: "x".into() }, HUGGING_FACE, &nessuno(), &mut |_, _| {}, &mut |_| {}).unwrap();
        assert!(js_aggiornato(&server));
        fs::write(server.join("bun.lock"), "tre").unwrap();
        assert!(!js_aggiornato(&server));

        let male = finto(t.path(), "male.cmd", "@echo off
exit /b 1
");
        fai(&voce, &l, &Strumenti { uv: PathBuf::from("uv"), bun: male, percorso: "x".into() }, HUGGING_FACE, &nessuno(), &mut |_, _| {}, &mut |_| {}).unwrap_err();
        assert!(!js_aggiornato(&server));
    }

    #[test]
    fn un_programma_scaricato_dall_app_vince_su_quello_del_percorso() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let fuori = t.path().join("fuori");
        fs::create_dir_all(&fuori).unwrap();
        fs::write(fuori.join("bun.exe"), "").unwrap();
        let percorsi = std::env::join_paths([&fuori]).unwrap();
        assert_eq!(trova_programma(&l, "bun", &percorsi), Some(fuori.join("bun.exe")));
        fs::create_dir_all(l.bin()).unwrap();
        fs::write(l.bin().join("bun.exe"), "").unwrap();
        assert_eq!(trova_programma(&l, "bun", &percorsi), Some(l.bin().join("bun.exe")));
        assert_eq!(trova_programma(&l, "uv", &percorsi), None);
    }

    #[test]
    fn un_programma_installato_con_npm_si_trova_dal_suo_cmd() {
        // Bun installato con npm mette nel PATH `bun.cmd`, non `bun.exe`: il piano lo conta presente, e va lanciato quello.
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let npm = t.path().join("npm");
        fs::create_dir_all(&npm).unwrap();
        fs::write(npm.join("bun.cmd"), "").unwrap();
        let percorsi = std::env::join_paths([&npm]).unwrap();
        assert_eq!(trova_programma(&l, "bun", &percorsi), Some(npm.join("bun.cmd")));
        fs::write(npm.join("bun.exe"), "").unwrap();
        assert_eq!(trova_programma(&l, "bun", &percorsi), Some(npm.join("bun.exe")));
    }

    /// Dalla rete vera (circa 200 MB, in una cartella temporanea): `cargo test il_computer_vero -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn il_computer_vero() {
        use crate::computer::manifesto::elementi;
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let manifesto = elementi();
        let voce = |id: &str, ordine| {
            let e = manifesto.iter().find(|e| e.id == id).unwrap();
            Voce { id: id.into(), nome: e.nome.clone(), scopo: e.scopo.clone(), funzione: e.funzione.clone(), licenza: e.licenza.clone(), fonte: e.fonte.clone(), peso: e.peso(), lavoro: Lavoro::Elemento(Box::new(e.clone())), ordine }
        };
        let percorso = std::env::join_paths([l.bin(), l.ffmpeg(), l.ambiente_python().join("Scripts")]).unwrap();
        let mut strumenti = Strumenti { uv: l.bin().join("uv.exe"), bun: l.bin().join("bun.exe"), percorso: percorso.clone() };
        let annulla = nessuno();
        let inizio = std::time::Instant::now();
        let mut ultimo_giro = 0;
        for id in ["uv", "bun", "ffmpeg", "deepfilter", "yunet"] {
            let mut ultimo = (0, 0);
            fai(&voce(id, 0), &l, &strumenti, HUGGING_FACE, &annulla, &mut |f, tot| ultimo = (f, tot), &mut |_| {}).unwrap();
            eprintln!("{id}: {:?} byte, {} s", ultimo, inizio.elapsed().as_secs() - ultimo_giro);
            ultimo_giro = inizio.elapsed().as_secs();
        }
        strumenti.percorso = percorso;
        let gruppi = vec![Gruppo { pacchetti: vec!["jsonschema==4.26.0".into()], indice: None }];
        let python = Voce { id: "python".into(), nome: "x".into(), scopo: "x".into(), funzione: None, licenza: "x".into(), fonte: "x".into(), peso: 1, lavoro: Lavoro::Python(gruppi), ordine: 3 };
        fai(&python, &l, &strumenti, HUGGING_FACE, &annulla, &mut |_, _| {}, &mut |r| eprintln!("  uv: {r}")).unwrap();
        eprintln!("python: {} s", inizio.elapsed().as_secs() - ultimo_giro);

        let sonde = SondeVere { percorsi: strumenti.percorso.clone() };
        assert!(sonde.python_ha(&l.python_dell_app(), &["jsonschema", "json"]) && sonde.python_importa(&l.python_dell_app(), &["jsonschema"]));
        assert!(!sonde.python_importa(&l.python_dell_app(), &["jsonschema", "un_modulo_che_non_c_e"]));
        assert!(!sonde.python_ha(&l.python_dell_app(), &["jsonschema", "un_modulo_che_non_c_e"]));
        assert!(sonde.nel_percorso("ffmpeg") && sonde.nel_percorso("ffprobe") && sonde.nel_percorso("bun") && sonde.nel_percorso("uv"));
        let versione = |exe: PathBuf, arg: &str| String::from_utf8_lossy(&Command::new(exe).arg(arg).output().unwrap().stdout).lines().next().unwrap_or_default().to_owned();
        eprintln!("bun {} | ffmpeg: {} | deep-filter: {}", versione(l.bin().join("bun.exe"), "--version"), versione(l.ffmpeg().join("ffmpeg.exe"), "-version"), l.modelli.join("deep-filter-0.5.6-x86_64-pc-windows-msvc.exe").metadata().unwrap().len());
        assert!(cartella_hf(&l.hf, "opencv/face_detection_yunet", &manifesto.iter().find_map(|e| match &e.tipo { Tipo::Hf(r) if r.repo == "opencv/face_detection_yunet" => Some(r.revisione.clone()), _ => None }).unwrap()).join("face_detection_yunet_2023mar.onnx").is_file());
    }
}
