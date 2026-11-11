//! Il Claude Code del creator: dove sta, che versione è, con quale account è collegato, e come si collega. L'app non lo include e non
//! tocca le sue credenziali: gli chiede, come farebbe il creator da terminale, `claude --version` e `claude auth status`, e per
//! l'accesso gli lascia fare il suo giro (`claude auth login`). La chat usa quel programma (`docs/CHAT.md`).

use crate::lingua::t;
use crate::supervisor::uccidi_albero;
use serde::Serialize;
use serde_json::Value;
use std::ffi::OsStr;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// La variabile che vince su tutto (prove, chi sviluppa): il percorso del programma `claude`. È anche quella che l'app passa al server.
pub const VARIABILE: &str = "MANGO_ANIMATION_CLAUDE";

/// Il comando con cui Anthropic installa Claude Code su Windows, da PowerShell (code.claude.com/docs/en/setup).
pub const COMANDO_DI_INSTALLAZIONE: &str = "irm https://claude.ai/install.ps1 | iex";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
const ATTESA_DEI_CONTROLLI: Duration = Duration::from_secs(20);
/// Il tempo che si dà al creator per finire l'accesso nel browser.
const ATTESA_DELL_ACCESSO: Duration = Duration::from_secs(10 * 60);
/// Il tempo che si dà all'installatore di Anthropic: scarica il programma, e con una rete lenta ci mette.
const ATTESA_DELL_INSTALLAZIONE: Duration = Duration::from_secs(15 * 60);

/// Com'è messo Claude Code, per la pagina che guida il creator.
#[derive(Clone, Serialize, Default, Debug, PartialEq)]
pub struct StatoClaude {
    /// Il programma c'è e parte.
    pub trovato: bool,
    pub percorso: Option<String>,
    pub versione: Option<String>,
    pub collegato: bool,
    /// Perché non va, in una frase per il creator.
    pub messaggio: Option<String>,
    /// Con Claude Code assente: il comando che lo installa, da dare a chi preferisce incollarlo da sé.
    pub comando: Option<String>,
}

impl StatoClaude {
    pub fn pronto(&self) -> bool {
        self.trovato && self.collegato
    }
}

/// Dove si installa `claude` senza che il PATH di chi ha aperto l'app lo sappia ancora: l'installatore ufficiale e `npm -g`.
fn posti_noti(casa: Option<&Path>, appdata: Option<&Path>) -> Vec<PathBuf> {
    let mut posti = Vec::new();
    if let Some(casa) = casa {
        posti.push(casa.join(".local").join("bin").join("claude.exe"));
    }
    if let Some(appdata) = appdata {
        posti.push(appdata.join("npm").join("node_modules").join("@anthropic-ai").join("claude-code").join("bin").join("claude.exe"));
    }
    posti
}

/// In una cartella del PATH: `claude.exe`, oppure un `claude.cmd` di npm, che non è il programma ma lo lancia (sta accanto, in `node_modules`).
fn in_cartella(cartella: &Path) -> Option<PathBuf> {
    let diretto = cartella.join("claude.exe");
    if diretto.is_file() {
        return Some(diretto);
    }
    let di_npm = cartella.join("node_modules").join("@anthropic-ai").join("claude-code").join("bin").join("claude.exe");
    (cartella.join("claude.cmd").is_file() && di_npm.is_file()).then_some(di_npm)
}

/// Il programma `claude` del creator. `indicato` è `MANGO_ANIMATION_CLAUDE`: se c'è deve essere un file, e vince su tutto.
/// `Ok(None)`: non c'è. `Err`: la variabile indica qualcosa che non c'è.
pub fn trova(indicato: Option<&str>, percorsi: &OsStr, casa: Option<&Path>, appdata: Option<&Path>) -> Result<Option<PathBuf>, String> {
    if let Some(indicato) = indicato.filter(|v| !v.is_empty()) {
        return if Path::new(indicato).is_file() {
            Ok(Some(PathBuf::from(indicato)))
        } else {
            Err(t(
                format!("Il programma indicato da {VARIABILE} («{indicato}») non c'è: correggi la variabile."),
                format!("The program set by {VARIABILE} (“{indicato}”) does not exist: fix the variable."),
            ))
        };
    }
    let nel_percorso = std::env::split_paths(percorsi).find_map(|c| in_cartella(&c));
    Ok(nel_percorso.or_else(|| posti_noti(casa, appdata).into_iter().find(|p| p.is_file())))
}

struct Uscita {
    riuscito: bool,
    stdout: String,
    stderr: String,
}

fn leggi_in_un_filo<R: Read + Send + 'static>(flusso: Option<R>) -> JoinHandle<String> {
    std::thread::spawn(move || {
        let mut grezzo = Vec::new();
        if let Some(mut f) = flusso {
            let _ = f.read_to_end(&mut grezzo);
        }
        String::from_utf8_lossy(&grezzo).into_owned()
    })
}

/// Lancia `claude` nascosto e ne raccoglie l'uscita; se non finisce in `massimo` lo ferma (per il suo PID: è il figlio che si è avviato qui).
fn esegui(programma: &Path, args: &[&str], massimo: Duration) -> Result<Uscita, String> {
    let mut figlio = Command::new(programma)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| t(format!("Non riesco ad avviare Claude Code ({}): {e}", programma.display()), format!("I can't start Claude Code ({}): {e}", programma.display())))?;
    let fuori = leggi_in_un_filo(figlio.stdout.take());
    let errori = leggi_in_un_filo(figlio.stderr.take());
    let inizio = Instant::now();
    let stato = loop {
        match figlio.try_wait() {
            Ok(Some(stato)) => break stato,
            Ok(None) if inizio.elapsed() >= massimo => {
                uccidi_albero(figlio.id());
                let _ = figlio.wait();
                return Err(t("Claude Code non risponde.", "Claude Code is not responding."));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(t(format!("Non riesco a controllare Claude Code: {e}"), format!("I can't check Claude Code: {e}"))),
        }
    };
    Ok(Uscita { riuscito: stato.success(), stdout: fuori.join().unwrap_or_default(), stderr: errori.join().unwrap_or_default() })
}

/// «2.1.318 (Claude Code)» → «2.1.318».
fn versione_da(uscita: &str) -> Option<String> {
    uscita.split_whitespace().next().filter(|v| v.chars().next().is_some_and(|c| c.is_ascii_digit())).map(str::to_owned)
}

/// L'uscita di `claude auth status`, che è un JSON anche quando non si è collegati.
fn accesso_da(uscita: &str) -> Option<bool> {
    serde_json::from_str::<Value>(uscita.trim()).ok()?.get("loggedIn")?.as_bool()
}

/// Chiede a `claude` versione e account. Non legge né mostra altro: l'accesso lo sa `claude`, non l'app.
pub fn esamina(programma: &Path) -> StatoClaude {
    esamina_con(programma, ATTESA_DEI_CONTROLLI)
}

fn esamina_con(programma: &Path, massimo: Duration) -> StatoClaude {
    let percorso = Some(programma.display().to_string());
    let versione = match esegui(programma, &["--version"], massimo) {
        Ok(u) if u.riuscito => versione_da(&u.stdout),
        Ok(u) => {
            let riga = ultima_riga(&u.stderr, &u.stdout);
            return StatoClaude { percorso, messaggio: Some(t(format!("Claude Code non parte: {riga}"), format!("Claude Code won't start: {riga}"))), ..Default::default() };
        }
        Err(messaggio) => return StatoClaude { percorso, messaggio: Some(messaggio), ..Default::default() },
    };
    let Some(versione) = versione else {
        return StatoClaude { percorso, messaggio: Some(t("Questo programma non risponde come Claude Code.", "This program does not answer like Claude Code.")), ..Default::default() };
    };
    let base = StatoClaude { trovato: true, percorso, versione: Some(versione), ..Default::default() };
    match esegui(programma, &["auth", "status"], massimo) {
        // Non collegato, `claude` esce con un errore ma scrive lo stesso il suo JSON: si legge quello.
        Ok(u) => match accesso_da(&u.stdout) {
            Some(collegato) => StatoClaude { collegato, ..base },
            None => {
                let riga = ultima_riga(&u.stderr, &u.stdout);
                StatoClaude { messaggio: Some(t(format!("Non riesco a capire se Claude Code è collegato: {riga}"), format!("I can't tell whether Claude Code is connected: {riga}"))), ..base }
            }
        },
        Err(messaggio) => StatoClaude { messaggio: Some(messaggio), ..base },
    }
}

fn ultima_riga(primo: &str, secondo: &str) -> String {
    [primo, secondo].iter().flat_map(|t| t.lines().rev()).map(str::trim).find(|r| !r.is_empty()).map_or_else(|| t("nessuna risposta", "no answer"), str::to_owned)
}

/// Aspetta che `figlio` (una finestra di terminale che il creator vede) si chiuda. Oltre `massimo` lo ferma (per il suo PID: l'ha avviato questa funzione) e dice `scaduto`.
fn aspetta_la_finestra(mut figlio: Child, massimo: Duration, scaduto: String, seguirla: impl Fn(std::io::Error) -> String) -> Result<(), String> {
    let inizio = Instant::now();
    loop {
        match figlio.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) if inizio.elapsed() >= massimo => {
                uccidi_albero(figlio.id());
                let _ = figlio.wait();
                return Err(scaduto);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(250)),
            Err(e) => return Err(seguirla(e)),
        }
    }
}

/// L'accesso lo fa `claude` stesso (`claude auth login`: apre il browser dell'account), in una finestra di terminale che il creator vede, perché se serve un
/// passo in più è lì che lo legge. Torna quando la finestra si chiude.
pub fn accedi(programma: &Path) -> Result<(), String> {
    let figlio = Command::new(programma)
        .args(["auth", "login"])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| t(format!("Non riesco ad avviare l'accesso di Claude Code: {e}"), format!("I can't start the Claude Code sign-in: {e}")))?;
    aspetta_la_finestra(
        figlio,
        ATTESA_DELL_ACCESSO,
        t("L'accesso a Claude Code non è finito entro dieci minuti: riprova.", "Signing in to Claude Code did not finish within ten minutes: try again."),
        |e| t(format!("Non riesco a seguire l'accesso di Claude Code: {e}"), format!("I can't follow the Claude Code sign-in: {e}")),
    )
}

fn fra_apici_di_powershell(frase: &str) -> String {
    format!("'{}'", frase.replace('\'', "''"))
}

/// Cosa esegue la finestra di PowerShell: il comando di Anthropic. Se va storto la finestra resta aperta con l'errore, perché il creator lo legga; se va bene si chiude da sola.
fn script_di_installazione() -> String {
    let intro = t("Installo Claude Code. Questa finestra si chiude da sola quando ha finito.", "Installing Claude Code. This window closes by itself when it is done.");
    let errore = t("Qualcosa non è andato. Premi Invio per chiudere.", "Something went wrong. Press Enter to close.");
    format!(
        "$ErrorActionPreference = 'Stop'; Write-Host {intro}; try {{ {COMANDO_DI_INSTALLAZIONE} }} catch {{ Write-Host ''; Write-Host $_.Exception.Message; Write-Host ''; Read-Host {errore} | Out-Null; exit 1 }}",
        intro = fra_apici_di_powershell(&intro),
        errore = fra_apici_di_powershell(&errore),
    )
}

/// Installa Claude Code con l'installatore di Anthropic, in una finestra di PowerShell che il creator vede. Torna quando la finestra si chiude: se Claude Code ora c'è lo dice
/// chi richiama (`trova`), non la finestra.
pub fn installa() -> Result<(), String> {
    let figlio = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script_di_installazione()])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|e| t(format!("Non riesco ad avviare l'installazione di Claude Code: {e}"), format!("I can't start the Claude Code installation: {e}")))?;
    aspetta_la_finestra(
        figlio,
        ATTESA_DELL_INSTALLAZIONE,
        t("L'installazione di Claude Code non è finita entro quindici minuti.", "The Claude Code installation did not finish within fifteen minutes."),
        |e| t(format!("Non riesco a seguire l'installazione di Claude Code: {e}"), format!("I can't follow the Claude Code installation: {e}")),
    )
}

/// Dopo l'installazione Claude Code ancora non c'è o non parte: la frase per il creator.
pub fn installazione_non_riuscita() -> String {
    t("L'installazione di Claude Code non è andata a buon fine.", "The Claude Code installation did not succeed.")
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::ffi::OsString;

    fn file(cartella: &Path, relativo: &str) -> PathBuf {
        let p = cartella.join(relativo);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "x").unwrap();
        p
    }

    fn percorso_di(cartelle: &[&Path]) -> OsString {
        std::env::join_paths(cartelle).unwrap()
    }

    #[test]
    fn la_variabile_vince_su_tutto_e_deve_indicare_un_file() {
        let t = tempfile::tempdir().unwrap();
        let indicato = file(t.path(), "mio/claude.exe");
        let nel_percorso = file(t.path(), "bin/claude.exe");
        let trovato = trova(Some(indicato.to_str().unwrap()), &percorso_di(&[nel_percorso.parent().unwrap()]), None, None);
        assert_eq!(trovato, Ok(Some(indicato)));
        let sbagliato = trova(Some("C:\\non\\esiste\\claude.exe"), &percorso_di(&[nel_percorso.parent().unwrap()]), None, None).unwrap_err();
        assert!(sbagliato.contains(VARIABILE) && sbagliato.contains("non c'è"), "{sbagliato}");
        // Una variabile vuota è come non averla.
        assert_eq!(trova(Some(""), &percorso_di(&[nel_percorso.parent().unwrap()]), None, None), Ok(Some(nel_percorso)));
    }

    #[test]
    fn nel_percorso_si_trova_il_programma_e_anche_quello_che_lancia_il_claude_cmd_di_npm() {
        let t = tempfile::tempdir().unwrap();
        let nativo = file(t.path(), "installatore/claude.exe");
        assert_eq!(trova(None, &percorso_di(&[nativo.parent().unwrap()]), None, None), Ok(Some(nativo)));

        let npm = t.path().join("npm");
        file(&npm, "claude.cmd");
        file(&npm, "claude");
        let programma = file(&npm, "node_modules/@anthropic-ai/claude-code/bin/claude.exe");
        assert_eq!(trova(None, &percorso_di(&[&npm]), None, None), Ok(Some(programma)));
    }

    #[test]
    fn un_claude_cmd_senza_il_suo_programma_accanto_non_e_un_claude_trovato() {
        let t = tempfile::tempdir().unwrap();
        file(t.path(), "npm/claude.cmd");
        assert_eq!(trova(None, &percorso_di(&[&t.path().join("npm")]), None, None), Ok(None));
    }

    #[test]
    fn dove_l_installatore_mette_claude_si_trova_anche_se_il_percorso_dell_app_non_lo_sa_ancora() {
        let t = tempfile::tempdir().unwrap();
        let casa = t.path().join("casa");
        let dell_installatore = file(&casa, ".local/bin/claude.exe");
        assert_eq!(trova(None, OsStr::new(""), Some(&casa), None), Ok(Some(dell_installatore)));
        let appdata = t.path().join("appdata");
        let di_npm = file(&appdata, "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe");
        assert_eq!(trova(None, OsStr::new(""), None, Some(&appdata)), Ok(Some(di_npm)));
        assert_eq!(trova(None, OsStr::new(""), Some(&t.path().join("vuota")), Some(&t.path().join("vuota"))), Ok(None));
    }

    /// Un finto `claude`: un file `.cmd` che risponde ai due comandi come il vero.
    fn finto(cartella: &Path, versione: &str, stato: &str, codice_dello_stato: u8) -> PathBuf {
        let p = cartella.join("claude.cmd");
        let righe = [
            "@echo off".to_owned(),
            r#"if "%1"=="--version" goto versione"#.to_owned(),
            r#"if "%1"=="auth" if "%2"=="status" goto stato"#.to_owned(),
            "exit /b 9".to_owned(),
            ":versione".to_owned(),
            format!("echo {versione}"),
            "exit /b 0".to_owned(),
            ":stato".to_owned(),
            format!("echo {stato}"),
            format!("exit /b {codice_dello_stato}"),
        ];
        let testo = righe.join("
");
        std::fs::write(&p, testo).unwrap();
        p
    }

    #[test]
    fn collegato_si_legge_versione_e_accesso_senza_tenere_l_account() {
        let t = tempfile::tempdir().unwrap();
        let p = finto(t.path(), "2.1.318 (Claude Code)", r#"{"loggedIn": true, "authMethod": "claude.ai", "email": "creator@esempio.it", "subscriptionType": "max"}"#, 0);
        let stato = esamina(&p);
        assert_eq!(stato.versione.as_deref(), Some("2.1.318"));
        assert_eq!((stato.trovato, stato.collegato, stato.pronto()), (true, true, true));
        assert_eq!(stato.messaggio, None);
        // L'indirizzo email e l'abbonamento stanno nell'uscita di `claude`, ma non entrano nello stato che va alla pagina.
        let json = serde_json::to_string(&stato).unwrap();
        assert!(!json.contains("creator@esempio.it") && !json.contains("max\""), "{json}");
    }

    #[test]
    fn non_collegato_claude_esce_con_un_errore_ma_scrive_il_suo_json_e_si_legge_quello() {
        let t = tempfile::tempdir().unwrap();
        let p = finto(t.path(), "2.1.318 (Claude Code)", r#"{"loggedIn": false}"#, 1);
        let stato = esamina(&p);
        assert_eq!((stato.trovato, stato.collegato, stato.pronto()), (true, false, false));
        assert_eq!(stato.versione.as_deref(), Some("2.1.318"));
    }

    #[test]
    fn se_non_si_capisce_se_e_collegato_non_si_dice_che_lo_e() {
        let t = tempfile::tempdir().unwrap();
        let p = finto(t.path(), "2.1.318 (Claude Code)", "qualcosa che non è un JSON", 0);
        let stato = esamina(&p);
        assert!(stato.trovato && !stato.collegato);
        assert!(stato.messaggio.as_deref().unwrap().contains("qualcosa che non è un JSON"), "{:?}", stato.messaggio);
    }

    #[test]
    fn un_programma_che_non_risponde_come_claude_non_vale() {
        let t = tempfile::tempdir().unwrap();
        let p = finto(t.path(), "non so cosa sono", "{}", 0);
        let stato = esamina(&p);
        assert!(!stato.trovato && !stato.pronto());
        assert!(stato.messaggio.as_deref().unwrap().contains("non risponde come Claude Code"), "{:?}", stato.messaggio);
        let mancante = esamina(&t.path().join("assente.exe"));
        assert!(!mancante.trovato && mancante.messaggio.as_deref().unwrap().contains("Non riesco ad avviare"), "{:?}", mancante.messaggio);
    }

    #[test]
    fn un_programma_che_non_finisce_si_ferma_e_lo_dice() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("claude.cmd");
        std::fs::write(&p, "@echo off\r\nping -n 30 127.0.0.1 > nul\r\n").unwrap();
        let inizio = Instant::now();
        let stato = esamina_con(&p, Duration::from_millis(600));
        assert!(inizio.elapsed() < Duration::from_secs(10));
        assert_eq!((stato.trovato, stato.messaggio.as_deref()), (false, Some("Claude Code non risponde.")));
    }

    #[test]
    fn la_versione_si_legge_solo_se_comincia_con_un_numero() {
        assert_eq!(versione_da("2.1.318 (Claude Code)\r\n").as_deref(), Some("2.1.318"));
        assert_eq!(versione_da("error: unknown option"), None);
        assert_eq!(versione_da(""), None);
    }

    /// Col `claude` vero di questo computer: `cargo test il_claude_vero -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn il_claude_vero() {
        let percorsi = std::env::var_os("PATH").unwrap_or_default();
        let casa = std::env::var_os("USERPROFILE").map(PathBuf::from);
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
        let programma = trova(None, &percorsi, casa.as_deref(), appdata.as_deref()).unwrap().expect("claude non si trova");
        let stato = esamina(&programma);
        eprintln!("{} -> {stato:?}", programma.display());
        assert!(stato.trovato && stato.versione.is_some(), "{stato:?}");
    }

    #[test]
    fn la_finestra_dell_installazione_esegue_il_comando_di_anthropic_e_resta_aperta_solo_se_va_storto() {
        let script = script_di_installazione();
        assert!(script.contains("try { irm https://claude.ai/install.ps1 | iex }"), "{script}");
        // Se il comando riesce lo script finisce e la finestra si chiude; se no, aspetta Invio dopo aver scritto l'errore.
        assert!(script.contains("catch {") && script.contains("Read-Host 'Qualcosa non è andato. Premi Invio per chiudere.'") && script.ends_with("exit 1 }"), "{script}");
        assert_eq!(fra_apici_di_powershell("L'accesso"), "'L''accesso'");
        crate::lingua::con(crate::lingua::Lingua::En, || assert!(script_di_installazione().contains("Press Enter to close.")));
    }

    fn figlio_che_dura(secondi: u32) -> Child {
        Command::new("ping").args(["-n", &secondi.to_string(), "127.0.0.1"]).stdout(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn().unwrap()
    }

    #[test]
    fn la_finestra_chiusa_in_tempo_non_e_un_errore_e_una_che_non_si_chiude_si_ferma() {
        let finita = Command::new("cmd").args(["/c", "exit", "0"]).creation_flags(CREATE_NO_WINDOW).spawn().unwrap();
        assert_eq!(aspetta_la_finestra(finita, Duration::from_secs(10), "scaduto".into(), |e| e.to_string()), Ok(()));
        let inizio = Instant::now();
        let eterna = figlio_che_dura(30);
        assert_eq!(aspetta_la_finestra(eterna, Duration::from_millis(600), "scaduto".into(), |e| e.to_string()), Err("scaduto".to_owned()));
        assert!(inizio.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn le_frasi_su_claude_code_escono_anche_in_inglese() {
        crate::lingua::con(crate::lingua::Lingua::En, || {
            let t = tempfile::tempdir().unwrap();
            let sbagliato = trova(Some("C:\\non\\esiste\\claude.exe"), OsStr::new(""), None, None).unwrap_err();
            assert!(sbagliato.contains(VARIABILE) && sbagliato.contains("does not exist"), "{sbagliato}");

            let estraneo = esamina(&finto(t.path(), "non so cosa sono", "{}", 0));
            assert_eq!(estraneo.messaggio.as_deref(), Some("This program does not answer like Claude Code."));
            let mancante = esamina(&t.path().join("assente.exe"));
            assert!(mancante.messaggio.as_deref().unwrap().starts_with("I can't start Claude Code"), "{:?}", mancante.messaggio);

            let incomprensibile = esamina(&finto(t.path(), "2.1.318 (Claude Code)", "qualcosa che non è un JSON", 0));
            assert!(incomprensibile.messaggio.as_deref().unwrap().starts_with("I can't tell whether Claude Code is connected: "), "{:?}", incomprensibile.messaggio);

            assert_eq!(ultima_riga("", ""), "no answer");

            let p = t.path().join("lento.cmd");
            std::fs::write(&p, "@echo off\r\nping -n 30 127.0.0.1 > nul\r\n").unwrap();
            assert_eq!(esamina_con(&p, Duration::from_millis(600)).messaggio.as_deref(), Some("Claude Code is not responding."));
        });
    }
}
