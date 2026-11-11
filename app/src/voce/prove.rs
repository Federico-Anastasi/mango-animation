//! Le prove della dettatura che non vogliono il microfono né il modello: il ponte, il comando del motore, il protocollo con un finto
//! motore (l'eseguibile di queste prove stesso, rilanciato in una modalità che risponde come `python -m motore detta`), il processo che
//! muore con l'app. E (a richiesta) il motore vero su un WAV del creator.

use super::locale::{comando_del_motore, dividi_comando, Comando, Motore, VARIABILE_COMANDO};
use super::*;
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufRead, Write};
use std::path::Path;
use std::time::{Duration, Instant};

fn raccogli() -> (Emetti, Arc<Mutex<Vec<Value>>>) {
    let eventi = Arc::new(Mutex::new(Vec::new()));
    let dentro = eventi.clone();
    (Arc::new(move |e| dentro.lock().unwrap().push(e)), eventi)
}

fn aspetta_fine(eventi: &Mutex<Vec<Value>>, massimo: Duration) -> Vec<Value> {
    let limite = Instant::now() + massimo;
    while Instant::now() < limite {
        let visti = eventi.lock().unwrap().clone();
        if visti.iter().any(|e| e["tipo"] == "fine") {
            return visti;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    panic!("la dettatura non è finita in {massimo:?}: {:?}", eventi.lock().unwrap());
}

fn tipi(eventi: &[Value]) -> Vec<&str> {
    eventi.iter().filter(|e| e["tipo"] != "livello").map(|e| e["tipo"].as_str().unwrap()).collect()
}

#[test]
fn nel_codice_non_si_legge_nessun_login() {
    let sorgenti = [include_str!("mod.rs"), include_str!("locale.rs"), include_str!("audio.rs"), include_str!("../../Cargo.toml")];
    for testo in sorgenti {
        for vietato in [".credentials", "accessToken", "tungstenite", "api.anthropic.com"] {
            assert!(!testo.contains(vietato), "{vietato} non deve comparire nel codice della dettatura");
        }
    }
}

// ---------------------------------------------------------------- il comando del motore

fn finta_radice() -> tempfile::TempDir {
    let t = tempfile::tempdir().unwrap();
    std::fs::create_dir(t.path().join("motore")).unwrap();
    std::fs::write(t.path().join("motore").join("__main__.py"), "").unwrap();
    t
}

fn ambiente(coppie: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let mappa: HashMap<String, String> = coppie.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    move |nome| mappa.get(nome).cloned()
}

#[test]
fn di_base_il_comando_e_python_col_motore_lanciato_dalla_radice() {
    let r = finta_radice();
    let c = comando_del_motore(&ambiente(&[]), Some(r.path()), None).unwrap();
    assert_eq!((c.exe.to_str().unwrap(), c.cwd.as_path(), c.di_base), ("python", r.path(), true));
    assert_eq!(c.args, ["-m", "motore", "detta"]);
    let c = comando_del_motore(&ambiente(&[("MANGO_ANIMATION_PYTHON", "C:\\py\\python.exe"), ("MANGO_ANIMATION_MODULO", "altro")]), Some(r.path()), None).unwrap();
    assert_eq!((c.exe.to_str().unwrap(), c.args), ("C:\\py\\python.exe", vec!["-m".into(), "altro".into(), "detta".into()]));
}

#[test]
fn il_python_preparato_dall_app_prende_il_posto_di_quello_del_percorso_ma_non_di_un_motore_indicato_dal_creator() {
    let r = finta_radice();
    let di_base = Motore::nuovo(comando_del_motore(&ambiente(&[]), Some(r.path()), None), r.path().join("d.log"));
    di_base.usa_python(Path::new("python-dell-app.exe"));
    assert_eq!(di_base.comando_attuale().unwrap().exe, OsString::from("python-dell-app.exe"));
    let privato = Motore::nuovo(comando_del_motore(&ambiente(&[(VARIABILE_COMANDO, "privato.exe detta")]), Some(r.path()), None), r.path().join("d.log"));
    privato.usa_python(Path::new("python-dell-app.exe"));
    assert_eq!(privato.comando_attuale().unwrap().exe, OsString::from("privato.exe"));
    // Un motore che non si trova resta com'è: lo dirà quando si accende.
    let altrove = tempfile::tempdir().unwrap();
    let mancante = Motore::nuovo(comando_del_motore(&ambiente(&[]), Some(altrove.path()), None), r.path().join("d.log"));
    mancante.usa_python(Path::new("python-dell-app.exe"));
    assert!(mancante.comando_attuale().is_err());
}

#[test]
fn la_cartella_dei_dati_arriva_al_motore_della_dettatura() {
    let r = finta_radice();
    let dati = tempfile::tempdir().unwrap();
    let voluta = (OsString::from("MANGO_ANIMATION_LAVORO"), dati.path().as_os_str().to_owned());
    let c = comando_del_motore(&ambiente(&[]), Some(r.path()), Some(dati.path())).unwrap();
    assert!(c.ambiente.contains(&voluta));
    let c = comando_del_motore(&ambiente(&[(VARIABILE_COMANDO, "privato.exe detta")]), Some(r.path()), Some(dati.path())).unwrap();
    assert!(c.ambiente.contains(&voluta));
    assert!(!comando_del_motore(&ambiente(&[]), Some(r.path()), None).unwrap().ambiente.iter().any(|(k, _)| k == "MANGO_ANIMATION_LAVORO"));
}

#[test]
fn la_cartella_scelta_dopo_l_accensione_dell_app_arriva_al_motore_e_sostituisce_quella_di_prima() {
    let r = finta_radice();
    let (prima, dopo) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let cartella = |m: &Motore| m.comando_attuale().unwrap().ambiente.iter().filter(|(k, _)| k == "MANGO_ANIMATION_LAVORO").map(|(_, v)| v.clone()).collect::<Vec<_>>();
    let senza = Motore::nuovo(comando_del_motore(&ambiente(&[]), Some(r.path()), None), r.path().join("d.log"));
    assert!(cartella(&senza).is_empty());
    senza.usa_lavoro(dopo.path());
    assert_eq!(cartella(&senza), vec![dopo.path().as_os_str().to_owned()]);
    let con = Motore::nuovo(comando_del_motore(&ambiente(&[]), Some(r.path()), Some(prima.path())), r.path().join("d.log"));
    con.usa_lavoro(dopo.path());
    assert_eq!(cartella(&con), vec![dopo.path().as_os_str().to_owned()]);
}

#[test]
fn senza_la_radice_del_codice_o_senza_motore_dentro_lo_dice() {
    let altrove = tempfile::tempdir().unwrap();
    for radice in [None, Some(altrove.path())] {
        let e = comando_del_motore(&ambiente(&[]), radice, None).unwrap_err();
        assert_eq!(e.code, "motore_mancante");
        assert!(e.message.contains("motore/"), "{}", e.message);
    }
}

#[test]
fn una_variabile_cambia_il_motore_e_non_serve_la_radice() {
    let riga = r#""C:\Program Files\Motore\privato.exe" detta --lingua it"#;
    let c = comando_del_motore(&ambiente(&[(VARIABILE_COMANDO, riga)]), None, None).unwrap();
    assert_eq!(c.exe.to_str().unwrap(), r"C:\Program Files\Motore\privato.exe");
    assert_eq!(c.args, ["detta", "--lingua", "it"]);
    assert!(!c.di_base);
    assert_eq!(comando_del_motore(&ambiente(&[(VARIABILE_COMANDO, "\"aperta")]), None, None).unwrap_err().code, "comando_non_valido");
}

#[test]
fn la_riga_di_comando_si_divide_in_parole() {
    assert_eq!(dividi_comando("python -m motore  detta").unwrap(), ["python", "-m", "motore", "detta"]);
    assert_eq!(dividi_comando(r#""a b" c"#).unwrap(), ["a b", "c"]);
    assert_eq!(dividi_comando(r#"x "" y"#).unwrap(), ["x", "", "y"]);
    assert!(dividi_comando("   ").unwrap().is_empty());
}

#[test]
fn senza_comando_lo_stato_dice_perche_e_avvia_rifiuta() {
    let voce = Voce::con(Motore::nuovo(Err(Errore::new("motore_mancante", "manca", "missing")), "x.log".into()));
    assert_eq!(voce.stato(Lingua::It), json!({ "disponibile": false, "messaggio": "manca", "in_ascolto": false }));
    assert_eq!(voce.avvia(Sorgente::Microfono, raccogli().0, Lingua::It).unwrap_err().code, "motore_mancante");
    assert_eq!(voce.ferma(Lingua::It).unwrap_err().code, "non_in_ascolto");
}

#[test]
fn senza_python_o_senza_il_programma_indicato_l_errore_e_chiaro() {
    let t = tempfile::tempdir().unwrap();
    for (di_base, codice, parola) in [(true, "python_mancante", "Python"), (false, "motore_mancante", VARIABILE_COMANDO)] {
        let comando = Comando { exe: "programma-che-non-esiste-xyz".into(), args: vec![], cwd: t.path().to_path_buf(), ambiente: vec![], di_base };
        let voce = Voce::con(Motore::nuovo(Ok(comando), t.path().join("d.log")));
        let e = voce.avvia(Sorgente::Microfono, raccogli().0, Lingua::It).unwrap_err();
        assert_eq!(e.code, codice);
        assert!(e.message.contains(parola), "{}", e.message);
        assert_eq!(voce.stato(Lingua::It)["in_ascolto"], json!(false));
    }
}

#[test]
fn nello_studio_inglese_gli_errori_dell_app_escono_in_inglese() {
    let t = tempfile::tempdir().unwrap();
    let comando = Comando { exe: "programma-che-non-esiste-xyz".into(), args: vec![], cwd: t.path().to_path_buf(), ambiente: vec![], di_base: true };
    let voce = Voce::con(Motore::nuovo(Ok(comando), t.path().join("d.log")));
    let e = voce.avvia(Sorgente::Microfono, raccogli().0, Lingua::En).unwrap_err();
    assert_eq!((e.code, e.message.as_str()), ("python_mancante", "Cannot find Python, which dictation needs: install it from python.org (with \"Add to PATH\"), then reopen the app."));
    assert_eq!(voce.ferma(Lingua::En).unwrap_err().message, "Dictation is not on.");
    assert_eq!(voce.ferma(Lingua::It).unwrap_err().message, "La dettatura non è accesa.");
    let senza_comando = Voce::con(Motore::nuovo(Err(Errore::new("motore_mancante", "manca", "missing")), "x.log".into()));
    assert_eq!(senza_comando.stato(Lingua::En)["messaggio"], json!("missing"));
}

#[test]
fn la_lingua_si_legge_come_fa_il_server() {
    assert_eq!([Some("en"), Some(" EN "), Some("it"), Some("fr"), None].map(Lingua::da), [Lingua::En, Lingua::En, Lingua::It, Lingua::It, Lingua::It]);
}

#[test]
fn un_audio_illeggibile_non_lascia_la_dettatura_accesa() {
    let t = tempfile::tempdir().unwrap();
    let voce = Voce::con(Motore::nuovo(Ok(finto("normale", 0, None, t.path())), t.path().join("d.log")));
    let e = voce.avvia(Sorgente::File(t.path().join("manca.wav")), raccogli().0, Lingua::It).unwrap_err();
    assert_eq!(e.code, "file_illeggibile");
    assert_eq!(voce.stato(Lingua::It)["in_ascolto"], json!(false));
}

// ---------------------------------------------------------------- il protocollo, con un finto motore

/// Il finto motore: questo stesso eseguibile di prova, lanciato per eseguire solo `finto_motore`.
fn finto(modo: &str, attesa_ms: u64, segno: Option<&Path>, cwd: &Path) -> Comando {
    let mut ambiente = vec![("FINTO_MOTORE".into(), modo.into()), ("FINTO_ATTESA_MS".into(), attesa_ms.to_string().into())];
    if let Some(s) = segno {
        ambiente.push(("FINTO_SEGNO".into(), s.into()));
    }
    Comando {
        exe: std::env::current_exe().unwrap().into_os_string(),
        args: ["--exact", "voce::prove::finto_motore", "--nocapture", "--test-threads=1"].map(Into::into).to_vec(),
        cwd: cwd.to_path_buf(),
        ambiente,
        di_base: false,
    }
}

/// Fa il motore: risponde come `python -m motore detta`. Fuori dalle prove che lo lanciano non fa niente.
#[test]
fn finto_motore() {
    let Ok(modo) = std::env::var("FINTO_MOTORE") else { return };
    let dichiara = |v: Value| {
        println!("{v}");
        std::io::stdout().flush().unwrap();
    };
    eprintln!("finto motore ({modo}) pid {}", std::process::id());
    println!("rumore di una libreria, non del protocollo");
    std::thread::sleep(Duration::from_millis(std::env::var("FINTO_ATTESA_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(0)));
    if modo == "lingua" {
        dichiara(json!({ "tipo": "errore", "messaggio": std::env::var("MANGO_ANIMATION_LINGUA").unwrap_or_default(), "fatale": true }));
        std::process::exit(1);
    }
    if modo == "errore" {
        dichiara(json!({ "tipo": "errore", "messaggio": "Non riesco a preparare la dettatura: manca il modello", "fatale": true }));
        std::process::exit(1);
    }
    dichiara(json!({ "tipo": "pronto", "dispositivo": "cpu", "modello": "finto", "calcolo": "int8" }));
    let (mut id, mut pezzi) = (Value::Null, 0u32);
    for riga in std::io::stdin().lock().lines() {
        let m: Value = serde_json::from_str(&riga.unwrap()).unwrap();
        match m["tipo"].as_str().unwrap() {
            "nuova" => {
                (id, pezzi) = (m["id"].clone(), 0);
                dichiara(json!({ "tipo": "ascolto", "id": id }));
            }
            "audio" => {
                if let Some(segno) = std::env::var_os("FINTO_SEGNO").map(PathBuf::from).filter(|s| modo == "cade_la_prima_volta" && !s.exists()) {
                    std::fs::write(segno, "").unwrap();
                    eprintln!("boom");
                    std::process::exit(3);
                }
                pezzi += 1;
                if pezzi == 3 {
                    dichiara(json!({ "tipo": "parziale", "id": id, "testo": "tre pezzi" }));
                }
            }
            "fine" => {
                dichiara(json!({ "tipo": "definitiva", "id": id, "testo": format!("{pezzi} pezzi, motore {}", std::process::id()) }));
                dichiara(json!({ "tipo": "chiusa", "id": id }));
            }
            _ => {}
        }
    }
    // a stdin chiuso il motore vero esce da solo; questo no, così la prova del Job Object vede chi lo ferma
    std::thread::sleep(Duration::from_secs(60));
}

fn voce_finta(modo: &str, attesa_ms: u64) -> (tempfile::TempDir, Voce, PathBuf) {
    let t = tempfile::tempdir().unwrap();
    let segno = t.path().join("segno");
    let log = t.path().join("logs").join("dettatura.log");
    let voce = Voce::con(Motore::nuovo(Ok(finto(modo, attesa_ms, Some(&segno), t.path())), log));
    (t, voce, segno)
}

fn wav(cartella: &Path, secondi: f64) -> PathBuf {
    let file = cartella.join(format!("{secondi}.wav"));
    std::fs::write(&file, audio::wav_di_prova(16_000, 1, &vec![3000; (16_000.0 * secondi) as usize])).unwrap();
    file
}

fn testo_di(eventi: &[Value], tipo: &str) -> Vec<String> {
    eventi.iter().filter(|e| e["tipo"] == tipo).map(|e| e["testo"].as_str().unwrap().to_string()).collect()
}

fn pezzi_della_definitiva(eventi: &[Value]) -> u32 {
    testo_di(eventi, "definitiva")[0].split(' ').next().unwrap().parse().unwrap()
}

fn pid_della_definitiva(eventi: &[Value]) -> u32 {
    testo_di(eventi, "definitiva")[0].rsplit(' ').next().unwrap().parse().unwrap()
}

#[test]
fn l_audio_arriva_al_motore_il_testo_alla_pagina_e_fine_chiude_per_ultimo() {
    let (t, voce, _) = voce_finta("normale", 0);
    let (emetti, eventi) = raccogli();
    let id = voce.avvia(Sorgente::File(wav(t.path(), 1.0)), emetti, Lingua::It).unwrap();
    std::thread::sleep(Duration::from_millis(1400));
    let via = Instant::now();
    voce.ferma(Lingua::It).unwrap();
    assert!(via.elapsed() < Duration::from_millis(200), "ferma ha aspettato {:?}", via.elapsed());
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert_eq!(tipi(&visti), ["preparo", "ascolto", "parziale", "definitiva", "fine"], "{visti:?}");
    assert!(visti.iter().all(|e| e["id"] == json!(id)), "{visti:?}");
    assert_eq!(testo_di(&visti, "parziale"), ["tre pezzi"]);
    assert_eq!(pezzi_della_definitiva(&visti), 10, "un secondo di audio sono dieci pezzi da 100 ms");
    let livelli: Vec<f64> = visti.iter().filter(|e| e["tipo"] == "livello").map(|e| e["valore"].as_f64().unwrap()).collect();
    assert!(livelli.len() >= 10 && livelli.iter().all(|l| *l > 0.05), "{livelli:?}");
    assert_eq!(visti.last().unwrap()["tipo"], "fine");
    assert_eq!(voce.stato(Lingua::It)["in_ascolto"], json!(false));
}

#[test]
fn il_motore_resta_acceso_fra_una_dettatura_e_l_altra() {
    let (t, voce, _) = voce_finta("normale", 0);
    let mut pid = Vec::new();
    for volta in 0..2 {
        let (emetti, eventi) = raccogli();
        voce.avvia(Sorgente::File(wav(t.path(), 0.2)), emetti, Lingua::It).unwrap();
        std::thread::sleep(Duration::from_millis(500));
        voce.ferma(Lingua::It).unwrap();
        let visti = aspetta_fine(&eventi, Duration::from_secs(10));
        let attesi: &[&str] = if volta == 0 { &["preparo", "ascolto", "definitiva", "fine"] } else { &["ascolto", "definitiva", "fine"] };
        assert_eq!(tipi(&visti), attesi, "il modello si prepara solo la prima volta: {visti:?}");
        assert_eq!(pezzi_della_definitiva(&visti), 2, "ogni dettatura ricomincia da zero");
        pid.push(pid_della_definitiva(&visti));
    }
    assert_eq!(pid[0], pid[1], "il motore doveva restare lo stesso processo");
}

#[test]
fn mentre_il_modello_si_carica_la_pagina_lo_sa_e_l_audio_non_si_perde() {
    let (t, voce, _) = voce_finta("normale", 1500);
    let (emetti, eventi) = raccogli();
    let via = Instant::now();
    voce.avvia(Sorgente::File(wav(t.path(), 1.0)), emetti, Lingua::It).unwrap();
    assert!(via.elapsed() < Duration::from_millis(500), "avvia non deve aspettare il modello: {:?}", via.elapsed());
    std::thread::sleep(Duration::from_millis(1100));
    let prima_del_modello = eventi.lock().unwrap().clone();
    assert_eq!(tipi(&prima_del_modello), ["preparo"], "{prima_del_modello:?}");
    assert!(prima_del_modello.iter().any(|e| e["tipo"] == "livello"), "il livello si muove anche mentre il modello si carica");
    // si ferma prima che il modello sia pronto: ciò che è stato detto non va perso
    voce.ferma(Lingua::It).unwrap();
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert_eq!(tipi(&visti), ["preparo", "ascolto", "parziale", "definitiva", "fine"], "{visti:?}");
    assert_eq!(pezzi_della_definitiva(&visti), 10, "tutto l'audio detto mentre il modello si caricava arriva al motore");
}

#[test]
fn un_motore_che_cade_a_meta_lo_dice_con_il_suo_log_e_la_dettatura_dopo_riparte() {
    let (t, voce, segno) = voce_finta("cade_la_prima_volta", 0);
    let (emetti, eventi) = raccogli();
    voce.avvia(Sorgente::File(wav(t.path(), 1.0)), emetti, Lingua::It).unwrap();
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert!(segno.exists());
    let errori: Vec<&str> = visti.iter().filter(|e| e["tipo"] == "errore").map(|e| e["messaggio"].as_str().unwrap()).collect();
    assert_eq!(errori.len(), 1, "{visti:?}");
    assert!(errori[0].starts_with("Il motore della dettatura si è fermato") && errori[0].contains("boom"), "{}", errori[0]);
    assert_eq!(visti.last().unwrap()["tipo"], "fine");
    assert_eq!(voce.stato(Lingua::It)["in_ascolto"], json!(false), "caduto il motore, la dettatura è finita da sola");

    let (emetti, eventi) = raccogli();
    voce.avvia(Sorgente::File(wav(t.path(), 0.2)), emetti, Lingua::It).unwrap();
    std::thread::sleep(Duration::from_millis(500));
    voce.ferma(Lingua::It).unwrap();
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert_eq!(tipi(&visti), ["preparo", "ascolto", "definitiva", "fine"], "{visti:?}");
}

#[test]
fn un_errore_del_motore_arriva_una_volta_sola() {
    let (t, voce, _) = voce_finta("errore", 0);
    let (emetti, eventi) = raccogli();
    voce.avvia(Sorgente::File(wav(t.path(), 0.5)), emetti, Lingua::It).unwrap();
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert_eq!(
        visti.iter().filter(|e| e["tipo"] == "errore").map(|e| e["messaggio"].as_str().unwrap()).collect::<Vec<_>>(),
        ["Non riesco a preparare la dettatura: manca il modello"]
    );
    assert_eq!(visti.last().unwrap()["tipo"], "fine");
}

#[test]
fn il_motore_parte_nella_lingua_dello_studio() {
    let t = tempfile::tempdir().unwrap();
    let voce = Voce::con(Motore::nuovo(Ok(finto("lingua", 0, None, t.path())), t.path().join("logs").join("dettatura.log")));
    for lingua in [Lingua::En, Lingua::It] {
        let (emetti, eventi) = raccogli();
        voce.avvia(Sorgente::File(wav(t.path(), 0.3)), emetti, lingua).unwrap();
        let visti = aspetta_fine(&eventi, Duration::from_secs(10));
        let messaggi: Vec<&str> = visti.iter().filter(|e| e["tipo"] == "errore").map(|e| e["messaggio"].as_str().unwrap()).collect();
        assert_eq!(messaggi, [lingua.codice()], "{visti:?}");
    }
}

#[test]
fn le_frasi_dell_app_sulla_dettatura_seguono_la_lingua() {
    let (t, voce, segno) = voce_finta("cade_la_prima_volta", 0);
    let (emetti, eventi) = raccogli();
    voce.avvia(Sorgente::File(wav(t.path(), 1.0)), emetti, Lingua::En).unwrap();
    let visti = aspetta_fine(&eventi, Duration::from_secs(10));
    assert!(segno.exists());
    let errori: Vec<&str> = visti.iter().filter(|e| e["tipo"] == "errore").map(|e| e["messaggio"].as_str().unwrap()).collect();
    assert!(errori.len() == 1 && errori[0].starts_with("The dictation engine has stopped") && errori[0].contains("boom"), "{errori:?}");
}

#[test]
fn una_dettatura_nuova_prende_il_posto_di_una_che_aspetta_ancora_il_modello() {
    let (t, voce, _) = voce_finta("normale", 1200);
    let (prima, eventi_prima) = raccogli();
    let id_prima = voce.avvia(Sorgente::File(wav(t.path(), 0.5)), prima, Lingua::It).unwrap();
    std::thread::sleep(Duration::from_millis(300));
    voce.ferma(Lingua::It).unwrap();
    let (seconda, eventi_seconda) = raccogli();
    let id_seconda = voce.avvia(Sorgente::File(wav(t.path(), 0.5)), seconda, Lingua::It).unwrap();
    std::thread::sleep(Duration::from_millis(600));
    voce.ferma(Lingua::It).unwrap();
    let prima_vista = aspetta_fine(&eventi_prima, Duration::from_secs(10));
    let seconda_vista = aspetta_fine(&eventi_seconda, Duration::from_secs(10));
    assert_eq!(id_seconda, id_prima + 1);
    assert!(!tipi(&prima_vista).contains(&"definitiva"), "la prima è stata sostituita: {prima_vista:?}");
    assert_eq!(tipi(&seconda_vista), ["preparo", "ascolto", "parziale", "definitiva", "fine"], "{seconda_vista:?}");
}

// ---------------------------------------------------------------- il processo muore con l'app

/// Fa l'app: entra in un Job Object come all'avvio, accende il motore e aspetta di essere uccisa. Fuori dalla prova che la lancia non fa niente.
#[test]
fn app_finta() {
    let Ok(cartella) = std::env::var("PROVA_APP_FINTA").map(PathBuf::from) else { return };
    let giobbe = crate::supervisor::Giobbe::nuovo().unwrap();
    giobbe.assegna_questo_processo().unwrap();
    let motore = Motore::nuovo(Ok(finto("normale", 0, None, &cartella)), cartella.join("d.log"));
    let processo = motore.assicura(Lingua::It).unwrap();
    std::fs::write(cartella.join("pid"), processo.pid().to_string()).unwrap();
    std::thread::sleep(Duration::from_secs(120));
    drop(giobbe);
}

fn vivo(pid: u32) -> bool {
    let fuori = std::process::Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
    String::from_utf8_lossy(&fuori.stdout).contains(&pid.to_string())
}

fn aspetta(massimo: Duration, mut finche: impl FnMut() -> bool) -> bool {
    let limite = Instant::now() + massimo;
    while Instant::now() < limite {
        if finche() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

#[test]
fn il_motore_acceso_dall_app_muore_con_lei_anche_se_va_in_crash() {
    let t = tempfile::tempdir().unwrap();
    let mut app = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "voce::prove::app_finta", "--nocapture", "--test-threads=1"])
        .env("PROVA_APP_FINTA", t.path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let pid_file = t.path().join("pid");
    assert!(aspetta(Duration::from_secs(20), || pid_file.is_file() && !std::fs::read_to_string(&pid_file).unwrap().is_empty()), "l'app finta non ha acceso il motore");
    let motore: u32 = std::fs::read_to_string(&pid_file).unwrap().parse().unwrap();
    assert!(vivo(motore), "il motore doveva essere acceso");
    // solo l'app finta, non i suoi figli: ci pensa il Job Object
    let esito = std::process::Command::new("taskkill").args(["/PID", &app.id().to_string(), "/F"]).output().unwrap();
    assert!(esito.status.success(), "{}", String::from_utf8_lossy(&esito.stdout));
    app.wait().unwrap();
    assert!(aspetta(Duration::from_secs(10), || !vivo(motore)), "il motore doveva morire con l'app");
}

// ---------------------------------------------------------------- il motore vero

/// Il motore vero (`python -m motore detta`, il modello scelto in `stile.json`) su un WAV del creator a 16 bit, suonato in tempo reale.
/// `MANGO_ANIMATION_PROVA_WAV=<file> cargo test il_motore_vero -- --ignored --nocapture`; per la scheda, `CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=<n>`.
#[test]
#[ignore = "carica il modello vero e usa la scheda video o il processore (un minuto o più)"]
fn il_motore_vero_trascrive_la_voce_del_creator_in_tempo_reale() {
    let wav = PathBuf::from(std::env::var("MANGO_ANIMATION_PROVA_WAV").expect("serve MANGO_ANIMATION_PROVA_WAV: un WAV a 16 bit con la voce del creator in italiano"));
    let (campioni, rate) = audio::leggi_wav(&wav).unwrap();
    let durata = Duration::from_secs_f64(campioni.len() as f64 / rate as f64);
    let t = tempfile::tempdir().unwrap();
    let partenza = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let radice = crate::radice::trova_radice(&partenza, std::env::var("MANGO_ANIMATION_RADICE").ok().as_deref()).unwrap();
    let voce = Voce::nuova(t.path().to_path_buf(), Some(&radice), None);
    assert_eq!(voce.stato(Lingua::It)["disponibile"], json!(true), "{}", voce.stato(Lingua::It));
    let ordine = Arc::new(Mutex::new(Vec::<(Duration, Value)>::new()));
    let (inizio, dentro) = (Instant::now(), ordine.clone());
    let emetti: Emetti = Arc::new(move |e| dentro.lock().unwrap().push((inizio.elapsed(), e)));

    voce.avvia(Sorgente::File(wav), emetti, Lingua::It).unwrap();
    let pronto = aspetta(Duration::from_secs(300), || ordine.lock().unwrap().iter().any(|(_, e)| e["tipo"] == "ascolto"));
    assert!(pronto, "il modello non si è caricato: {}", std::fs::read_to_string(t.path().join("dettatura.log")).unwrap_or_default());
    let ascolto_a = ordine.lock().unwrap().iter().find(|(_, e)| e["tipo"] == "ascolto").unwrap().0;
    std::thread::sleep((durata + Duration::from_secs(2)).saturating_sub(inizio.elapsed()));
    let alt = Instant::now();
    voce.ferma(Lingua::It).unwrap();
    assert!(aspetta(Duration::from_secs(60), || ordine.lock().unwrap().iter().any(|(_, e)| e["tipo"] == "fine")), "la dettatura non è finita");
    let (fine_a, visti) = (alt.elapsed(), ordine.lock().unwrap().clone());
    let primo_parziale = visti.iter().find(|(_, e)| e["tipo"] == "parziale").map(|(t, _)| *t);
    eprintln!("durata del WAV {durata:?}; il modello pronto dopo {ascolto_a:?}; primo parziale a {primo_parziale:?}; dall'alt alla fine {fine_a:?}");
    for (t, e) in visti.iter().filter(|(_, e)| e["tipo"] != "livello") {
        eprintln!("  {t:>8.2?} {e}");
    }
    assert!(!visti.iter().any(|(_, e)| e["tipo"] == "errore"), "{visti:?}");
    assert!(visti.iter().any(|(_, e)| e["tipo"] == "definitiva"));
}
