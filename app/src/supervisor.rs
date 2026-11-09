//! I processi che l'app avvia, e il Job Object che li chiude con lei.
//!
//! L'app entra in un Job Object con KILL_ON_JOB_CLOSE all'avvio: ogni figlio e nipote lo eredita, quindi
//! quando l'app si chiude, o va in crash, Windows li uccide tutti. Ne esce solo chi parte con CREATE_BREAKAWAY_FROM_JOB:
//! l'installatore di un aggiornamento, che deve sopravvivere all'app (`aggiornamento.rs`), e i programmi che l'app apre per
//! il creator (`apri_fuori_dal_giobbe`).

use crate::lingua::t;
use anyhow::{Context, Result};
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_BREAKAWAY_OK, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows::Win32::System::Threading::GetCurrentProcess;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Il processo esce dal giobbe dell'app (che lo permette) e le sopravvive.
pub const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

pub struct Giobbe(HANDLE);

// L'handle resta aperto finché vive l'app e non si usa da altri thread dopo la creazione.
unsafe impl Send for Giobbe {}
unsafe impl Sync for Giobbe {}

impl Giobbe {
    pub fn nuovo() -> Result<Self> {
        unsafe {
            let job = CreateJobObjectW(None, None).context("CreateJobObjectW")?;
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
            SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
            .context("SetInformationJobObject")?;
            Ok(Self(job))
        }
    }

    /// Da qui in poi ogni processo che l'app avvia entra nel giobbe, e se l'app muore muore con lei.
    pub fn assegna_questo_processo(&self) -> Result<()> {
        unsafe { AssignProcessToJobObject(self.0, GetCurrentProcess()) }.context("AssignProcessToJobObject (app)")
    }

    #[cfg(test)]
    pub fn assegna(&self, processo: &Child) -> Result<()> {
        use std::os::windows::io::AsRawHandle;
        unsafe { AssignProcessToJobObject(self.0, HANDLE(processo.as_raw_handle())) }.context("AssignProcessToJobObject")
    }
}

impl Drop for Giobbe {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

#[derive(Clone)]
pub struct Comando {
    pub nome: String,
    pub exe: PathBuf,
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    /// Variabili d'ambiente in più rispetto a quelle dell'app.
    pub env: Vec<(OsString, OsString)>,
}

struct Figlio {
    nome: String,
    processo: Child,
}

/// Avvia processi nascosti con l'uscita su `<cartella>/<nome>.log`.
pub struct Supervisore {
    cartella_log: PathBuf,
    figli: Mutex<Vec<Figlio>>,
}

impl Supervisore {
    pub fn nuovo(cartella_log: &Path) -> Self {
        Self { cartella_log: cartella_log.to_path_buf(), figli: Mutex::new(Vec::new()) }
    }

    pub fn log(&self, nome: &str) -> PathBuf {
        self.cartella_log.join(format!("{nome}.log"))
    }

    pub fn avvia(&self, c: &Comando) -> Result<PathBuf> {
        self.lancia(c, false).map(|(log, _)| log)
    }

    /// Riaccende `c` al posto del processo con lo stesso nome ormai uscito; il log continua, non riparte da capo.
    pub fn riaccendi(&self, c: &Comando) -> Result<u32> {
        self.lancia(c, true).map(|(_, pid)| pid)
    }

    fn lancia(&self, c: &Comando, in_coda: bool) -> Result<(PathBuf, u32)> {
        std::fs::create_dir_all(&self.cartella_log).with_context(|| t(format!("non riesco a creare la cartella dei log {}", self.cartella_log.display()), format!("I can't create the log folder {}", self.cartella_log.display())))?;
        let log = self.log(&c.nome);
        let uscita = if in_coda { OpenOptions::new().create(true).append(true).open(&log) } else { File::create(&log) }
            .with_context(|| t(format!("non riesco ad aprire il log {}", log.display()), format!("I can't open the log {}", log.display())))?;
        let errori = uscita.try_clone()?;
        let processo = Command::new(&c.exe)
            .args(&c.args)
            .current_dir(&c.cwd)
            .envs(c.env.iter().map(|(k, v)| (k, v)))
            .stdin(Stdio::null())
            .stdout(uscita)
            .stderr(errori)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .with_context(|| t(format!("non riesco ad avviare il programma {}", c.exe.display()), format!("I can't start the program {}", c.exe.display())))?;
        let pid = processo.id();
        let mut figli = self.figli.lock().unwrap();
        if in_coda {
            figli.retain(|f| f.nome != c.nome);
        }
        figli.push(Figlio { nome: c.nome.clone(), processo });
        Ok((log, pid))
    }

    /// Il codice di uscita se il processo `nome` è già finito.
    pub fn uscito(&self, nome: &str) -> Option<i32> {
        let mut figli = self.figli.lock().unwrap();
        let figlio = figli.iter_mut().rev().find(|f| f.nome == nome)?;
        figlio.processo.try_wait().ok().flatten().map(|stato| stato.code().unwrap_or(-1))
    }

    pub fn pid(&self, nome: &str) -> Option<u32> {
        self.figli.lock().unwrap().iter().rev().find(|f| f.nome == nome).map(|f| f.processo.id())
    }

    /// Aspetta che il processo `nome` con quel `pid` esca e ne dà il codice; `None` se nel frattempo è stato sostituito o fermato da `ferma_tutto`.
    pub fn attendi_uscita(&self, nome: &str, pid: u32) -> Option<i32> {
        loop {
            {
                let mut figli = self.figli.lock().unwrap();
                let figlio = figli.iter_mut().rev().find(|f| f.nome == nome).filter(|f| f.processo.id() == pid)?;
                if let Ok(Some(stato)) = figlio.processo.try_wait() {
                    return Some(stato.code().unwrap_or(-1));
                }
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }

    /// Ferma ogni processo avviato, con tutto ciò che ha avviato lui.
    pub fn ferma_tutto(&self) {
        for mut figlio in self.figli.lock().unwrap().drain(..).rev() {
            uccidi_albero(figlio.processo.id());
            let _ = figlio.processo.wait();
        }
    }
}

/// Apre un file, una cartella o un indirizzo col suo programma di Windows, fuori dal giobbe dell'app: il browser o il foglio di calcolo
/// che l'app apre per il creator devono restare aperti quando l'app si chiude. Il plugin `opener` li avviava dentro il giobbe e Windows
/// li chiudeva insieme all'app (un browser che non era già aperto). Lo stesso comando del plugin: `Invoke-Item` per i percorsi,
/// `Start-Process` per gli indirizzi; la destinazione passa da una variabile d'ambiente, non dal testo del comando.
pub fn apri_fuori_dal_giobbe(destinazione: &str) -> std::io::Result<()> {
    Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", COMANDO_APRI])
        .env("MANGO_APRI_DESTINAZIONE", destinazione)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB)
        .spawn()
        .map(|_| ())
}

const COMANDO_APRI: &str = "$ErrorActionPreference = 'Stop'; if (Test-Path -LiteralPath $env:MANGO_APRI_DESTINAZIONE) { Invoke-Item -LiteralPath $env:MANGO_APRI_DESTINAZIONE } else { Start-Process -FilePath $env:MANGO_APRI_DESTINAZIONE }";

/// Il processo `pid` e i suoi discendenti. Solo di processi avviati dall'app: mai per nome.
pub fn uccidi_albero(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

/// Ultime `n` righe non vuote di un log, per i messaggi d'errore.
pub fn coda_del_log(percorso: &Path, n: usize) -> String {
    let testo = std::fs::read(percorso).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
    let righe: Vec<&str> = testo.lines().filter(|r| !r.trim().is_empty()).collect();
    righe[righe.len().saturating_sub(n)..].join("\n")
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn dal_giobbe_si_puo_uscire_perche_l_installatore_di_un_aggiornamento_sopravviva_all_app() {
        use windows::Win32::System::JobObjects::{QueryInformationJobObject, JOB_OBJECT_LIMIT_BREAKAWAY_OK};
        let giobbe = Giobbe::nuovo().unwrap();
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        unsafe {
            QueryInformationJobObject(
                giobbe.0,
                JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                None,
            )
            .unwrap();
        }
        let limiti = info.BasicLimitInformation.LimitFlags;
        assert!(limiti.contains(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE) && limiti.contains(JOB_OBJECT_LIMIT_BREAKAWAY_OK));
    }
    use std::time::{Duration, Instant};

    fn aspetta_fine(c: &mut std::process::Child, secondi: u64) -> bool {
        let t = Instant::now();
        while t.elapsed() < Duration::from_secs(secondi) {
            if matches!(c.try_wait(), Ok(Some(_))) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn chiudere_il_giobbe_uccide_i_figli() {
        let mut figlio = Command::new("ping").args(["-n", "60", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        let giobbe = Giobbe::nuovo().unwrap();
        giobbe.assegna(&figlio).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert!(matches!(figlio.try_wait(), Ok(None)), "il figlio doveva essere vivo");
        drop(giobbe);
        assert!(aspetta_fine(&mut figlio, 5), "il figlio doveva morire con il giobbe");
    }

    #[test]
    fn si_aspetta_l_uscita_di_un_processo_e_se_viene_fermato_si_smette() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let cmd = |nome: &str, riga: &str| Comando { nome: nome.into(), exe: "cmd".into(), args: vec!["/c".into(), riga.into()], cwd: t.path().to_path_buf(), env: vec![] };
        sup.avvia(&cmd("breve", "exit 7")).unwrap();
        assert_eq!(sup.attendi_uscita("breve", sup.pid("breve").unwrap()), Some(7));
        sup.avvia(&cmd("lungo", "ping -n 60 127.0.0.1 >nul")).unwrap();
        let pid = sup.pid("lungo").unwrap();
        std::thread::scope(|s| {
            let attesa = s.spawn(|| sup.attendi_uscita("lungo", pid));
            std::thread::sleep(Duration::from_millis(400));
            sup.ferma_tutto();
            assert_eq!(attesa.join().unwrap(), None);
        });
    }

    #[test]
    fn riaccendere_continua_il_log_e_sostituisce_il_processo_uscito() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let c = Comando { nome: "server".into(), exe: "cmd".into(), args: vec!["/c".into(), "echo giro & exit 2".into()], cwd: t.path().to_path_buf(), env: vec![] };
        sup.avvia(&c).unwrap();
        let primo = sup.pid("server").unwrap();
        assert_eq!(sup.attendi_uscita("server", primo), Some(2));
        let secondo = sup.riaccendi(&c).unwrap();
        assert_ne!(primo, secondo);
        assert_eq!(sup.attendi_uscita("server", secondo), Some(2));
        assert_eq!(sup.attendi_uscita("server", primo), None);
        assert_eq!(std::fs::read_to_string(sup.log("server")).unwrap().matches("giro").count(), 2);
    }

    #[test]
    fn il_log_di_un_processo_uscito_subito_si_legge() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let log = sup
            .avvia(&Comando {
                nome: "prova".into(),
                exe: "cmd".into(),
                args: vec!["/c".into(), "echo errore finto & exit 3".into()],
                cwd: t.path().to_path_buf(),
                env: vec![],
            })
            .unwrap();
        let t0 = Instant::now();
        while sup.uscito("prova").is_none() && t0.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(sup.uscito("prova"), Some(3));
        assert!(coda_del_log(&log, 5).contains("errore finto"));
    }

    #[test]
    fn le_variabili_del_comando_arrivano_al_processo() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let log = sup
            .avvia(&Comando {
                nome: "ambiente".into(),
                exe: "cmd".into(),
                args: vec!["/c".into(), "echo [%PROVA_VARIABILE%]".into()],
                cwd: t.path().to_path_buf(),
                env: vec![("PROVA_VARIABILE".into(), "dal supervisore".into())],
            })
            .unwrap();
        let t0 = Instant::now();
        while sup.uscito("ambiente").is_none() && t0.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(coda_del_log(&log, 5).contains("[dal supervisore]"));
    }

    fn vivo(pid: u32) -> bool {
        let fuori = Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
        String::from_utf8_lossy(&fuori.stdout).contains(&pid.to_string())
    }

    fn figlio_di(pid: u32) -> Option<u32> {
        let comando = format!("(Get-CimInstance Win32_Process -Filter 'ParentProcessId={pid}' | Select-Object -First 1).ProcessId");
        let fuori = Command::new("powershell").args(["-NoProfile", "-Command", &comando]).output().unwrap();
        String::from_utf8_lossy(&fuori.stdout).trim().parse().ok()
    }

    #[test]
    fn ferma_tutto_ferma_anche_i_nipoti() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        sup.avvia(&Comando {
            nome: "lungo".into(),
            exe: "cmd".into(),
            args: vec!["/c".into(), "ping -n 60 127.0.0.1 >nul".into()],
            cwd: t.path().to_path_buf(),
            env: vec![],
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(800));
        let padre = sup.pid("lungo").unwrap();
        let nipote = figlio_di(padre).expect("il nipote doveva esserci");
        assert!(vivo(padre) && vivo(nipote));
        sup.ferma_tutto();
        std::thread::sleep(Duration::from_millis(500));
        assert!(!vivo(padre), "il figlio doveva essere fermo");
        assert!(!vivo(nipote), "il nipote doveva essere fermo");
    }
}
