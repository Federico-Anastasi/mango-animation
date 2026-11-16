use super::mango_code::{self, Stato};
use super::*;
use std::ffi::OsString;
use std::io::{Read as _, Write as _};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

fn file(cartella: &Path, relativo: &str) -> PathBuf {
    let p = cartella.join(relativo);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(&p, "x").unwrap();
    p
}

fn percorso_di(cartelle: &[&Path]) -> OsString {
    std::env::join_paths(cartelle).unwrap()
}

fn nessun_pacchetto(_: &str) -> Vec<PathBuf> {
    Vec::new()
}

fn dove<'a>(percorsi: &'a OsStr, casa: Option<&'a Path>, appdata: Option<&'a Path>) -> Dove<'a> {
    Dove { percorsi, casa, appdata, pacchetto: &nessun_pacchetto }
}

#[test]
fn ogni_motore_ha_il_suo_identificativo_nel_formato_del_prodotto() {
    let ids: Vec<String> = MOTORI.iter().map(|m| serde_json::to_string(&m.id).unwrap()).collect();
    assert_eq!(ids, [r#""claude-code""#, r#""codex""#, r#""mango-code""#]);
    assert_eq!(serde_json::from_str::<Id>(r#""codex""#).unwrap(), Id::Codex);
    assert!(serde_json::from_str::<Id>(r#""altro""#).is_err());
    assert!(CLAUDE.programma.is_some() && CODEX.programma.is_some() && MANGO_CODE.programma.is_none());
}

#[test]
fn la_variabile_vince_su_tutto_e_deve_indicare_un_file() {
    let t = tempfile::tempdir().unwrap();
    let indicato = file(t.path(), "mio/claude.exe");
    let nel_percorso = file(t.path(), "bin/claude.exe");
    let percorsi = percorso_di(&[nel_percorso.parent().unwrap()]);
    let trovato = trova(CLAUDE, Some(indicato.to_str().unwrap()), &dove(&percorsi, None, None));
    assert_eq!(trovato, Ok(Some(indicato)));
    let sbagliato = trova(CLAUDE, Some("C:\\non\\esiste\\claude.exe"), &dove(&percorsi, None, None)).unwrap_err();
    assert!(sbagliato.contains("MANGO_ANIMATION_CLAUDE") && sbagliato.contains("non c'è"), "{sbagliato}");
    // Una variabile vuota è come non averla.
    assert_eq!(trova(CLAUDE, Some(""), &dove(&percorsi, None, None)), Ok(Some(nel_percorso)));
}

#[test]
fn nel_percorso_si_trova_il_programma_e_anche_quello_che_lancia_il_claude_cmd_di_npm() {
    let t = tempfile::tempdir().unwrap();
    let nativo = file(t.path(), "installatore/claude.exe");
    let percorsi = percorso_di(&[nativo.parent().unwrap()]);
    assert_eq!(trova(CLAUDE, None, &dove(&percorsi, None, None)), Ok(Some(nativo)));

    let npm = t.path().join("npm");
    file(&npm, "claude.cmd");
    file(&npm, "claude");
    let programma = file(&npm, "node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    assert_eq!(trova(CLAUDE, None, &dove(&percorso_di(&[&npm]), None, None)), Ok(Some(programma)));
}

#[test]
fn un_claude_cmd_senza_il_suo_programma_accanto_non_e_un_claude_trovato() {
    let t = tempfile::tempdir().unwrap();
    file(t.path(), "npm/claude.cmd");
    assert_eq!(trova(CLAUDE, None, &dove(&percorso_di(&[&t.path().join("npm")]), None, None)), Ok(None));
}

#[test]
fn dove_l_installatore_mette_claude_si_trova_anche_se_il_percorso_dell_app_non_lo_sa_ancora() {
    let t = tempfile::tempdir().unwrap();
    let casa = t.path().join("casa");
    let dell_installatore = file(&casa, ".local/bin/claude.exe");
    assert_eq!(trova(CLAUDE, None, &dove(OsStr::new(""), Some(&casa), None)), Ok(Some(dell_installatore)));
    let appdata = t.path().join("appdata");
    let di_npm = file(&appdata, "npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    assert_eq!(trova(CLAUDE, None, &dove(OsStr::new(""), None, Some(&appdata))), Ok(Some(di_npm)));
    let vuota = t.path().join("vuota");
    assert_eq!(trova(CLAUDE, None, &dove(OsStr::new(""), Some(&vuota), Some(&vuota))), Ok(None));
}

#[test]
fn codex_si_trova_con_la_sua_variabile_e_nel_percorso_e_non_si_confonde_con_claude() {
    let t = tempfile::tempdir().unwrap();
    let indicato = file(t.path(), "mio/codex.exe");
    let nel_percorso = file(t.path(), "bin/codex.exe");
    let claude_accanto = file(t.path(), "bin/claude.exe");
    let percorsi = percorso_di(&[nel_percorso.parent().unwrap()]);
    assert_eq!(trova(CODEX, Some(indicato.to_str().unwrap()), &dove(&percorsi, None, None)), Ok(Some(indicato)));
    assert_eq!(trova(CODEX, None, &dove(&percorsi, None, None)), Ok(Some(nel_percorso)));
    assert_eq!(trova(CLAUDE, None, &dove(&percorsi, None, None)), Ok(Some(claude_accanto)));
    let sbagliato = trova(CODEX, Some("C:\\non\\esiste\\codex.exe"), &dove(&percorsi, None, None)).unwrap_err();
    assert!(sbagliato.contains("MANGO_ANIMATION_CODEX") && sbagliato.contains("non c'è"), "{sbagliato}");
    // Un codex.cmd è lo script di npm, non il programma: non si lancia da qui.
    file(t.path(), "npm/codex.cmd");
    assert_eq!(trova(CODEX, None, &dove(&percorso_di(&[&t.path().join("npm")]), None, None)), Ok(None));
}

#[test]
fn codex_dello_store_si_trova_nella_cartella_che_windows_indica_per_il_nome_di_famiglia() {
    let t = tempfile::tempdir().unwrap();
    let vecchia = t.path().join("OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0");
    let nuova = t.path().join("OpenAI.Codex_2.0.0.0_x64__2p2nqsd0c76g0");
    let vecchio_programma = file(&vecchia, "app/resources/codex.exe");
    let nuovo_programma = file(&nuova, "app/resources/codex.exe");
    let richieste = Mutex::new(Vec::new());
    let pacchetto = |famiglia: &str| {
        richieste.lock().unwrap().push(famiglia.to_owned());
        vec![vecchia.clone(), nuova.clone()]
    };
    let d = Dove { percorsi: OsStr::new(""), casa: None, appdata: None, pacchetto: &pacchetto };
    assert_eq!(trova(CODEX, None, &d), Ok(Some(nuovo_programma.clone())));
    assert_eq!(*richieste.lock().unwrap(), ["OpenAI.Codex_2p2nqsd0c76g0".to_owned()]);

    // La versione che Windows elenca per ultima non ha il programma: vale la prima che lo ha.
    let senza = t.path().join("OpenAI.Codex_3.0.0.0_x64__2p2nqsd0c76g0");
    std::fs::create_dir_all(&senza).unwrap();
    let pacchetto = |_: &str| vec![vecchia.clone(), senza.clone()];
    assert_eq!(trova(CODEX, None, &Dove { pacchetto: &pacchetto, ..d }), Ok(Some(vecchio_programma)));

    // Un pacchetto senza il programma, o nessun pacchetto, non è un Codex trovato.
    let pacchetto = |_: &str| vec![senza.clone()];
    assert_eq!(trova(CODEX, None, &Dove { pacchetto: &pacchetto, ..d }), Ok(None));
    assert_eq!(trova(CODEX, None, &dove(OsStr::new(""), None, None)), Ok(None));

    // Il programma nel percorso vince su quello dello Store; Claude Code non guarda lo Store.
    let nel_percorso = file(t.path(), "bin/codex.exe");
    let percorsi = percorso_di(&[nel_percorso.parent().unwrap()]);
    let pacchetto = |_: &str| vec![nuova.clone()];
    assert_eq!(trova(CODEX, None, &Dove { percorsi: &percorsi, pacchetto: &pacchetto, ..d }), Ok(Some(nel_percorso)));
    let cercati = Mutex::new(0);
    let conta = |_: &str| {
        *cercati.lock().unwrap() += 1;
        Vec::new()
    };
    assert_eq!(trova(CLAUDE, None, &Dove { pacchetto: &conta, ..d }), Ok(None));
    assert_eq!(*cercati.lock().unwrap(), 0);
}

#[test]
fn mango_code_non_si_cerca_come_programma() {
    let t = tempfile::tempdir().unwrap();
    let bin = file(t.path(), "bin/mango-code.exe");
    assert_eq!(trova(MANGO_CODE, None, &dove(&percorso_di(&[bin.parent().unwrap()]), None, None)), Ok(None));
    assert!(!StatoMotore::vuoto(MANGO_CODE).installabile && !StatoMotore::vuoto(MANGO_CODE).accedibile);
    assert!(StatoMotore::vuoto(CLAUDE).installabile && StatoMotore::vuoto(CLAUDE).accedibile);
    assert!(StatoMotore::vuoto(CODEX).installabile && StatoMotore::vuoto(CODEX).accedibile);
}

/// Un finto programma: un file `.cmd` che risponde a `--version` e al comando dell'accesso come il vero. `su_stderr`: lo stato dell'accesso sul canale degli errori.
fn finto(cartella: &Path, nome: &str, accesso: [&str; 2], versione: &str, stato: &str, codice_dello_stato: u8, su_stderr: bool) -> PathBuf {
    let p = cartella.join(format!("{nome}.cmd"));
    let [primo, secondo] = accesso;
    let righe = [
        "@echo off".to_owned(),
        r#"if "%1"=="--version" goto versione"#.to_owned(),
        format!(r#"if "%1"=="{primo}" if "%2"=="{secondo}" goto stato"#),
        "exit /b 9".to_owned(),
        ":versione".to_owned(),
        format!("echo {versione}"),
        "exit /b 0".to_owned(),
        ":stato".to_owned(),
        format!("echo {stato}{}", if su_stderr { " 1>&2" } else { "" }),
        format!("exit /b {codice_dello_stato}"),
    ];
    std::fs::write(&p, righe.join("\r\n")).unwrap();
    p
}

fn finto_claude(cartella: &Path, versione: &str, stato: &str, codice_dello_stato: u8) -> PathBuf {
    finto(cartella, "claude", ["auth", "status"], versione, stato, codice_dello_stato, false)
}

fn finto_codex(cartella: &Path, versione: &str, stato: &str, codice_dello_stato: u8) -> PathBuf {
    finto(cartella, "codex", ["login", "status"], versione, stato, codice_dello_stato, true)
}

#[test]
fn collegato_si_legge_versione_e_accesso_senza_tenere_l_account() {
    let t = tempfile::tempdir().unwrap();
    let p = finto_claude(t.path(), "2.1.318 (Claude Code)", r#"{"loggedIn": true, "authMethod": "claude.ai", "email": "creator@esempio.it", "subscriptionType": "max"}"#, 0);
    let stato = esamina(CLAUDE, &p);
    assert_eq!(stato.versione.as_deref(), Some("2.1.318"));
    assert_eq!((stato.id, stato.trovato, stato.collegato, stato.pronto()), (Id::ClaudeCode, true, true, true));
    assert_eq!(stato.messaggio, None);
    // L'indirizzo email e l'abbonamento stanno nell'uscita di `claude`, ma non entrano nello stato che va alla pagina.
    let json = serde_json::to_string(&stato).unwrap();
    assert!(!json.contains("creator@esempio.it") && !json.contains("max\""), "{json}");
}

#[test]
fn non_collegato_claude_esce_con_un_errore_ma_scrive_il_suo_json_e_si_legge_quello() {
    let t = tempfile::tempdir().unwrap();
    let p = finto_claude(t.path(), "2.1.318 (Claude Code)", r#"{"loggedIn": false}"#, 1);
    let stato = esamina(CLAUDE, &p);
    assert_eq!((stato.trovato, stato.collegato, stato.pronto()), (true, false, false));
    assert_eq!(stato.versione.as_deref(), Some("2.1.318"));
}

#[test]
fn se_non_si_capisce_se_e_collegato_non_si_dice_che_lo_e() {
    let t = tempfile::tempdir().unwrap();
    let p = finto_claude(t.path(), "2.1.318 (Claude Code)", "qualcosa che non è un JSON", 0);
    let stato = esamina(CLAUDE, &p);
    assert!(stato.trovato && !stato.collegato);
    assert!(stato.messaggio.as_deref().unwrap().contains("qualcosa che non è un JSON"), "{:?}", stato.messaggio);
}

#[test]
fn un_programma_che_non_risponde_come_claude_non_vale() {
    let t = tempfile::tempdir().unwrap();
    let p = finto_claude(t.path(), "non so cosa sono", "{}", 0);
    let stato = esamina(CLAUDE, &p);
    assert!(!stato.trovato && !stato.pronto());
    assert!(stato.messaggio.as_deref().unwrap().contains("non risponde come Claude Code"), "{:?}", stato.messaggio);
    let mancante = esamina(CLAUDE, &t.path().join("assente.exe"));
    assert!(!mancante.trovato && mancante.messaggio.as_deref().unwrap().contains("Non riesco ad avviare"), "{:?}", mancante.messaggio);
}

#[test]
fn un_programma_che_non_finisce_si_ferma_e_lo_dice() {
    let t = tempfile::tempdir().unwrap();
    let p = t.path().join("claude.cmd");
    std::fs::write(&p, "@echo off\r\nping -n 30 127.0.0.1 > nul\r\n").unwrap();
    let inizio = Instant::now();
    let stato = esamina_con(CLAUDE, &p, Duration::from_millis(600));
    assert!(inizio.elapsed() < Duration::from_secs(10));
    assert_eq!((stato.trovato, stato.messaggio.as_deref()), (false, Some("Claude Code non risponde.")));
}

#[test]
fn la_versione_si_legge_solo_se_comincia_con_un_numero() {
    assert_eq!(versione_da("2.1.318 (Claude Code)\r\n", None).as_deref(), Some("2.1.318"));
    assert_eq!(versione_da("error: unknown option", None), None);
    assert_eq!(versione_da("", None), None);
    assert_eq!(versione_da("codex-cli 0.167.0-alpha.4.1\r\n", Some("codex-cli")).as_deref(), Some("0.167.0-alpha.4.1"));
    assert_eq!(versione_da("codex-cli", Some("codex-cli")), None);
    assert_eq!(versione_da("altro 1.0", Some("codex-cli")), None);
}

#[test]
fn codex_collegato_si_legge_dalla_riga_che_scrive_sul_canale_degli_errori() {
    let t = tempfile::tempdir().unwrap();
    let p = finto_codex(t.path(), "codex-cli 0.167.0-alpha.4.1", "Logged in using ChatGPT", 0);
    let stato = esamina(CODEX, &p);
    assert_eq!(stato.versione.as_deref(), Some("0.167.0-alpha.4.1"));
    assert_eq!((stato.id, stato.nome, stato.trovato, stato.collegato, stato.pronto(), stato.messaggio), (Id::Codex, "Codex", true, true, true, None));
    // Con una chiave delle API la riga è un'altra, ma comincia allo stesso modo.
    let con_chiave = esamina(CODEX, &finto_codex(t.path(), "codex-cli 0.167.0", "Logged in using an API key", 0));
    assert!(con_chiave.pronto());
}

#[test]
fn codex_non_collegato_non_e_pronto_e_se_non_si_capisce_non_si_dice_che_lo_e() {
    let t = tempfile::tempdir().unwrap();
    let fuori = esamina(CODEX, &finto_codex(t.path(), "codex-cli 0.167.0", "Not logged in", 1));
    assert_eq!((fuori.trovato, fuori.collegato, fuori.messaggio), (true, false, None));

    let guasto = esamina(CODEX, &finto_codex(t.path(), "codex-cli 0.167.0", "impossibile leggere la configurazione", 1));
    assert!(guasto.trovato && !guasto.collegato);
    assert!(guasto.messaggio.as_deref().unwrap().contains("impossibile leggere la configurazione"), "{:?}", guasto.messaggio);

    let strano = esamina(CODEX, &finto_codex(t.path(), "codex-cli 0.167.0", "tutto bene", 0));
    assert!(!strano.collegato && strano.messaggio.as_deref().unwrap().contains("tutto bene"), "{:?}", strano.messaggio);

    let estraneo = esamina(CODEX, &finto_codex(t.path(), "non so cosa sono", "Logged in using ChatGPT", 0));
    assert!(!estraneo.trovato && estraneo.messaggio.as_deref().unwrap().contains("non risponde come Codex"), "{:?}", estraneo.messaggio);
}

/// Col `claude` e col `codex` veri di questo computer: `cargo test i_programmi_veri -- --ignored --nocapture`. Chiedono solo la versione e l'accesso.
#[test]
#[ignore]
fn i_programmi_veri() {
    for motore in MOTORI.iter().filter(|m| m.programma.is_some()) {
        let Some(programma) = trova_nel_computer(motore).unwrap() else {
            eprintln!("{}: non si trova", motore.nome);
            continue;
        };
        let stato = esamina(motore, &programma);
        eprintln!("{} -> {stato:?}", programma.display());
        assert!(stato.trovato && stato.versione.is_some(), "{stato:?}");
    }
}

#[test]
fn la_finestra_dell_installazione_esegue_il_comando_di_anthropic_e_resta_aperta_solo_se_va_storto() {
    let script = script_di_installazione("Claude Code", COMANDO_DI_INSTALLAZIONE_DI_CLAUDE);
    assert!(script.contains("try { irm https://claude.ai/install.ps1 | iex }"), "{script}");
    // Se il comando riesce lo script finisce e la finestra si chiude; se no, aspetta Invio dopo aver scritto l'errore.
    assert!(script.contains("catch {") && script.contains("Read-Host 'Qualcosa non è andato. Premi Invio per chiudere.'") && script.ends_with("exit 1 }"), "{script}");
    assert!(script.contains("Write-Host 'Installo Claude Code."), "{script}");
    assert_eq!(fra_apici_di_powershell("L'accesso"), "'L''accesso'");
    crate::lingua::con(crate::lingua::Lingua::En, || assert!(script_di_installazione("Claude Code", COMANDO_DI_INSTALLAZIONE_DI_CLAUDE).contains("Press Enter to close.")));
}

#[test]
fn claude_si_installa_con_il_comando_di_anthropic_codex_dalla_pagina_dello_store_e_mango_code_dalla_pagina_delle_sue_uscite() {
    assert_eq!(CLAUDE.comando_di_installazione(), Some("irm https://claude.ai/install.ps1 | iex"));
    assert_eq!(CODEX.comando_di_installazione(), None);
    assert_eq!(MANGO_CODE.comando_di_installazione(), None);
    assert_eq!(indirizzo_dello_store("OpenAI.Codex_2p2nqsd0c76g0"), "ms-windows-store://pdp/?PFN=OpenAI.Codex_2p2nqsd0c76g0");
    let (ComeSiInstalla::PaginaDelloStore(famiglia), Some(Programma { pacchetto_dello_store: Some(pacchetto), .. })) = (&CODEX.installazione, &CODEX.programma) else { panic!("Codex si installa dallo Store") };
    assert_eq!(*famiglia, pacchetto.famiglia);
    let ComeSiInstalla::PaginaWeb(pagina) = MANGO_CODE.installazione else { panic!("Mango Code si installa dalla sua pagina") };
    assert_eq!(pagina, "https://github.com/Federico-Anastasi/mango-code/releases/latest");
}

#[test]
fn mango_code_spento_offre_l_installazione_solo_se_windows_non_lo_elenca_fra_i_programmi() {
    let vuota = tempfile::tempdir().unwrap();
    let non_installato = stato_di_mango_code(Some(vuota.path()), false);
    assert_eq!((non_installato.trovato, non_installato.installabile, non_installato.accedibile, non_installato.messaggio), (false, true, false, None));
    assert!(!stato_di_mango_code(Some(vuota.path()), true).installabile);
    assert!(stato_di_mango_code(None, false).installabile);
    // Acceso si vede dal suo file, che Windows lo elenchi o no: non c'è niente da installare.
    let acceso = dati_con(&format!(r#"{{ "pid": {}, "reason": "x" }}"#, std::process::id()));
    assert!(!stato_di_mango_code(Some(acceso.path()), false).installabile);
    assert!(frase_della_pagina(MANGO_CODE).starts_with("Ho aperto la pagina di Mango Code"), "{}", frase_della_pagina(MANGO_CODE));
}

#[test]
fn un_programma_che_windows_non_elenca_non_e_installato() {
    assert!(!mango_code::elencato_da_windows("Un Programma Che Non Esiste 0000"));
}

/// `cargo test mango_code_vero -- --ignored --nocapture`: dice se Windows elenca Mango Code fra i programmi di questo utente.
#[test]
#[ignore]
fn mango_code_vero_in_questo_computer() {
    println!("Mango Code installato: {}", mango_code::elencato_da_windows(mango_code::NOME_FRA_I_PROGRAMMI));
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
fn le_frasi_sui_motori_escono_anche_in_inglese() {
    crate::lingua::con(crate::lingua::Lingua::En, || {
        let t = tempfile::tempdir().unwrap();
        let sbagliato = trova(CLAUDE, Some("C:\\non\\esiste\\claude.exe"), &dove(OsStr::new(""), None, None)).unwrap_err();
        assert!(sbagliato.contains("MANGO_ANIMATION_CLAUDE") && sbagliato.contains("does not exist"), "{sbagliato}");
        let sbagliato = trova(CODEX, Some("C:\\non\\esiste\\codex.exe"), &dove(OsStr::new(""), None, None)).unwrap_err();
        assert!(sbagliato.contains("MANGO_ANIMATION_CODEX") && sbagliato.contains("does not exist"), "{sbagliato}");

        let estraneo = esamina(CLAUDE, &finto_claude(t.path(), "non so cosa sono", "{}", 0));
        assert_eq!(estraneo.messaggio.as_deref(), Some("This program does not answer like Claude Code."));
        let mancante = esamina(CODEX, &t.path().join("assente.exe"));
        assert!(mancante.messaggio.as_deref().unwrap().starts_with("I can't start Codex"), "{:?}", mancante.messaggio);

        let incomprensibile = esamina(CLAUDE, &finto_claude(t.path(), "2.1.318 (Claude Code)", "qualcosa che non è un JSON", 0));
        assert!(incomprensibile.messaggio.as_deref().unwrap().starts_with("I can't tell whether Claude Code is connected: "), "{:?}", incomprensibile.messaggio);

        assert_eq!(ultima_riga("", ""), "no answer");
        assert_eq!(installazione_non_riuscita(CODEX), "The Codex installation did not succeed.");
        assert!(frase_dello_store(CODEX).contains("Microsoft Store"), "{}", frase_dello_store(CODEX));
        assert!(frase_della_pagina(MANGO_CODE).starts_with("I opened the Mango Code page"), "{}", frase_della_pagina(MANGO_CODE));

        let p = t.path().join("lento.cmd");
        std::fs::write(&p, "@echo off\r\nping -n 30 127.0.0.1 > nul\r\n").unwrap();
        assert_eq!(esamina_con(CLAUDE, &p, Duration::from_millis(600)).messaggio.as_deref(), Some("Claude Code is not responding."));

        let acceso_non_pronto = t.path().join("dati");
        std::fs::create_dir_all(&acceso_non_pronto).unwrap();
        std::fs::write(acceso_non_pronto.join("service.json"), format!(r#"{{ "pid": {}, "reason": "x" }}"#, std::process::id())).unwrap();
        assert!(stato_di_mango_code(Some(&acceso_non_pronto), true).messaggio.as_deref().unwrap().starts_with("Mango Code is on"));
    });
}

/// Un servizio finto di Mango Code: risponde `risposta` a ogni richiesta e ricorda le richieste ricevute (la prima riga e l'intestazione dell'agente).
fn servizio_finto(risposta: &'static str) -> (String, Arc<Mutex<Vec<String>>>) {
    let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
    let agente = format!("http://127.0.0.1:{}", ascolto.local_addr().unwrap().port());
    let richieste = Arc::new(Mutex::new(Vec::new()));
    let ricevute = richieste.clone();
    std::thread::spawn(move || {
        for flusso in ascolto.incoming() {
            let Ok(mut f) = flusso else { return };
            let mut buf = [0u8; 4096];
            let n = f.read(&mut buf).unwrap_or(0);
            let testo = String::from_utf8_lossy(&buf[..n]).into_owned();
            let prima = testo.lines().next().unwrap_or_default().to_owned();
            let chi = testo.lines().find(|r| r.to_lowercase().starts_with("user-agent:")).unwrap_or_default().to_lowercase();
            ricevute.lock().unwrap().push(format!("{prima} | {chi}"));
            let _ = write!(f, "HTTP/1.1 {risposta}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}");
        }
    });
    (agente, richieste)
}

fn indirizzo_che_non_risponde() -> String {
    let porta = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    format!("http://127.0.0.1:{porta}")
}

fn pid_finito() -> u32 {
    let mut figlio = Command::new("cmd").args(["/c", "exit", "0"]).creation_flags(CREATE_NO_WINDOW).spawn().unwrap();
    let pid = figlio.id();
    figlio.wait().unwrap();
    pid
}

fn dati_con(service: &str) -> tempfile::TempDir {
    let t = tempfile::tempdir().unwrap();
    std::fs::write(t.path().join("service.json"), service).unwrap();
    t
}

fn service_di(pid: u32, agente: &str) -> String {
    format!(r#"{{ "pid": {pid}, "agent": "{agente}", "engine": "http://127.0.0.1:1" }}"#)
}

#[test]
fn mango_code_acceso_che_risponde_alla_salute_e_pronto_e_il_servizio_vede_chi_chiama() {
    let (agente, richieste) = servizio_finto("200 OK");
    let dati = dati_con(&service_di(std::process::id(), &agente));
    assert_eq!(mango_code::stato(dati.path()), Stato::Pronto);
    assert_eq!(*richieste.lock().unwrap(), ["GET /global/health HTTP/1.1 | user-agent: mango animation"]);

    let stato = stato_di_mango_code(Some(dati.path()), true);
    assert_eq!((stato.id, stato.nome, stato.trovato, stato.collegato, stato.pronto(), stato.messaggio), (Id::MangoCode, "Mango Code", true, true, true, None));
    assert_eq!((stato.installabile, stato.accedibile, stato.percorso, stato.versione), (false, false, None, None));
}

#[test]
fn mango_code_con_il_file_di_un_processo_morto_e_spento_anche_se_il_servizio_risponde() {
    let (agente, richieste) = servizio_finto("200 OK");
    let dati = dati_con(&service_di(pid_finito(), &agente));
    assert_eq!(mango_code::stato(dati.path()), Stato::Spento);
    assert!(richieste.lock().unwrap().is_empty());
    let stato = stato_di_mango_code(Some(dati.path()), true);
    assert_eq!((stato.trovato, stato.collegato, stato.pronto(), stato.messaggio), (false, false, false, None));
}

#[test]
fn mango_code_e_spento_senza_file_con_un_file_che_non_si_legge_o_con_un_servizio_che_non_risponde_bene() {
    let vuota = tempfile::tempdir().unwrap();
    assert_eq!(mango_code::stato(vuota.path()), Stato::Spento);
    assert_eq!(mango_code::stato(&vuota.path().join("non-c-e")), Stato::Spento);
    assert!(!stato_di_mango_code(None, true).trovato);

    for contenuto in ["", "non è JSON", "[]", r#"{ "agent": "http://127.0.0.1:1", "engine": "x" }"#, r#"{ "pid": "12", "agent": "x", "engine": "x" }"#, r#"{ "pid": -3, "agent": "x", "engine": "x" }"#] {
        assert_eq!(mango_code::stato(dati_con(contenuto).path()), Stato::Spento, "{contenuto}");
    }
    // Vivo ma senza né agente e motore né un motivo: spento. Il motivo è una stringa, non altro.
    let vivo = std::process::id();
    assert_eq!(mango_code::stato(dati_con(&format!(r#"{{ "pid": {vivo} }}"#)).path()), Stato::Spento);
    assert_eq!(mango_code::stato(dati_con(&format!(r#"{{ "pid": {vivo}, "reason": 3 }}"#)).path()), Stato::Spento);
    assert_eq!(mango_code::stato(dati_con(&service_di(vivo, &indirizzo_che_non_risponde())).path()), Stato::Spento);
    let (guasto, _) = servizio_finto("500 Internal Server Error");
    assert_eq!(mango_code::stato(dati_con(&service_di(vivo, &guasto)).path()), Stato::Spento);
    assert_eq!(mango_code::stato(dati_con(&service_di(vivo, "non un indirizzo")).path()), Stato::Spento);
}

#[test]
fn mango_code_acceso_ma_che_si_sta_preparando_non_e_pronto_e_non_chiede_niente_al_servizio() {
    let vivo = std::process::id();
    let dati = dati_con(&format!("\u{feff}{{ \"pid\": {vivo}, \"reason\": \"sto caricando il modello\" }}"));
    assert_eq!(mango_code::stato(dati.path()), Stato::NonPronto);
    let stato = stato_di_mango_code(Some(dati.path()), true);
    assert_eq!((stato.trovato, stato.collegato, stato.pronto()), (true, false, false));
    assert!(stato.messaggio.as_deref().unwrap().starts_with("Mango Code è acceso ma non è ancora pronto"), "{:?}", stato.messaggio);
    assert!(!stato.messaggio.as_deref().unwrap().contains("sto caricando il modello"));
    // Un file di processo morto con il motivo, invece, è un Mango Code spento.
    let morto = dati_con(&format!(r#"{{ "pid": {}, "reason": "x" }}"#, pid_finito()));
    assert_eq!(mango_code::stato(morto.path()), Stato::Spento);
}

#[test]
fn la_cartella_dei_dati_di_mango_code_e_quella_indicata_o_quella_di_serie() {
    let variabili = |coppie: &'static [(&'static str, &'static str)]| move |nome: &str| coppie.iter().find(|(n, _)| *n == nome).map(|(_, v)| (*v).to_owned());
    assert_eq!(mango_code::cartella_dei_dati(&variabili(&[("MANGO_DATA", "D:\\dati"), ("LOCALAPPDATA", "C:\\L")])), Some(PathBuf::from("D:\\dati")));
    assert_eq!(mango_code::cartella_dei_dati(&variabili(&[("MANGO_DATA", ""), ("LOCALAPPDATA", "C:\\L")])), Some(PathBuf::from("C:\\L").join("MangoCode")));
    assert_eq!(mango_code::cartella_dei_dati(&variabili(&[("USERPROFILE", "C:\\U")])), Some(PathBuf::from("C:\\U").join("AppData").join("Local").join("MangoCode")));
    assert_eq!(mango_code::cartella_dei_dati(&variabili(&[])), None);
}

#[test]
fn un_pacchetto_dello_store_che_non_c_e_non_da_cartelle() {
    assert!(store::cartelle_del_pacchetto("Inesistente.Pacchetto_0000000000000").is_empty());
}

/// Col pacchetto vero di Codex: `cargo test il_pacchetto_vero_di_codex -- --ignored --nocapture`.
#[test]
#[ignore]
fn il_pacchetto_vero_di_codex() {
    let Some(Programma { pacchetto_dello_store: Some(pacchetto), .. }) = &CODEX.programma else { panic!("Codex ha un pacchetto") };
    let cartelle = store::cartelle_del_pacchetto(pacchetto.famiglia);
    eprintln!("{cartelle:?}");
    assert!(cartelle.iter().any(|c| c.join(pacchetto.programma).is_file()));
}
