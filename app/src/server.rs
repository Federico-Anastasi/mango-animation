//! Il server di Mango Animation: se risponde lo si usa, altrimenti lo accende l'app.

use crate::istanza::VARIABILE_PID;
use crate::lavoro::VARIABILE;
use crate::lingua::t;
use crate::supervisor::{coda_del_log, Comando, Supervisore};
use anyhow::{bail, Result};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::Url;

pub const PORTA_DI_DEFAULT: u16 = 47431;

#[derive(Debug, PartialEq, Eq)]
pub enum Decisione {
    GiaAcceso,
    DaAvviare,
}

/// La porta da `MANGO_ANIMATION_PORTA`, come la legge il server.
pub fn porta_da(valore: Option<&str>) -> Result<u16> {
    match valore.filter(|v| !v.is_empty()) {
        None => Ok(PORTA_DI_DEFAULT),
        Some(v) => match v.parse::<u16>() {
            Ok(porta) => Ok(porta),
            Err(_) => bail!(
                "{}",
                t(
                    format!("«{v}» non è una porta valida: MANGO_ANIMATION_PORTA vuole un numero da 0 a 65535."),
                    format!("“{v}” is not a valid port: MANGO_ANIMATION_PORTA wants a number from 0 to 65535."),
                )
            ),
        },
    }
}

/// Il comando che accende il server: parte dal codice e riceve la cartella di lavoro, che passa a motore e chat, il pid dell'app che lo accende e le variabili
/// in più che l'app ha preparato (il Claude Code del creator). `bun` è l'eseguibile con gli argomenti che gli servono per partire (`risolvi_bun`).
pub fn comando_server(bun: (PathBuf, Vec<OsString>), radice: &Path, lavoro: &Path, app_pid: u32, ambiente: Vec<(OsString, OsString)>) -> Comando {
    let (exe, mut args) = bun;
    args.extend(["run", "--cwd", "server", "avvia"].map(OsString::from));
    let env = [(VARIABILE.into(), lavoro.as_os_str().to_owned()), (VARIABILE_PID.into(), app_pid.to_string().into())].into_iter().chain(ambiente).collect();
    Comando { nome: "server".into(), exe, args, cwd: radice.to_path_buf(), env }
}

/// La chiave delle API di questa cartella di lavoro (`docs/API.md`, «La chiave delle API»): la fa il server al primo avvio, e senza ogni sua risposta è 401.
pub fn chiave_del_server(lavoro: &Path) -> Option<String> {
    let testo = std::fs::read_to_string(lavoro.join("archivio").join("arrivi").join("chiave-api.json")).ok()?;
    serde_json::from_str::<serde_json::Value>(&testo).ok()?.get("chiave")?.as_str().map(str::to_owned)
}

/// Il server risponde a `GET /api/lavori` con 200, con la chiave di questa cartella di lavoro? Un server che risponde 401 è di un'altra cartella (o non ha ancora la sua chiave).
pub fn decidi(porta: u16, lavoro: &Path) -> Decisione {
    let agente = ureq::AgentBuilder::new().timeout(Duration::from_secs(3)).build();
    let mut richiesta = agente.get(&format!("http://127.0.0.1:{porta}/api/lavori"));
    if let Some(chiave) = chiave_del_server(lavoro) {
        richiesta = richiesta.set("X-Chiave-Api", &chiave);
    }
    match richiesta.call() {
        Ok(risposta) if risposta.status() == 200 => Decisione::GiaAcceso,
        _ => Decisione::DaAvviare,
    }
}

/// Dove porta la finestra: lo studio, entrando con la chiave (`GET /entra` mette il cookie e rimanda allo studio). Senza chiave, lo studio e basta.
pub fn indirizzo_dello_studio(porta: u16, lavoro: &Path) -> String {
    let base = format!("http://127.0.0.1:{porta}/");
    match chiave_del_server(lavoro) {
        Some(chiave) => {
            let mut url = Url::parse(&format!("{base}entra")).expect("l'indirizzo del server è valido");
            url.query_pairs_mut().append_pair("chiave", &chiave);
            url.into()
        }
        None => base,
    }
}

/// Aspetta che il server risponda; se il processo `nome` esce prima, o scade il tempo, l'errore porta le ultime righe del log.
/// `passo` riceve i secondi trascorsi.
pub fn aspetta_pronto(sup: &Supervisore, nome: &str, porta: u16, lavoro: &Path, massimo: Duration, mut passo: impl FnMut(u64)) -> Result<()> {
    let inizio = Instant::now();
    loop {
        if decidi(porta, lavoro) == Decisione::GiaAcceso {
            return Ok(());
        }
        if let Some(codice) = sup.uscito(nome) {
            bail!("{}\n{}", t(format!("Il server si è chiuso subito (codice {codice})."), format!("The server closed right away (code {codice}).")), coda_del_log(&sup.log(nome), 12));
        }
        let secondi = inizio.elapsed().as_secs();
        if inizio.elapsed() >= massimo {
            bail!("{}\n{}", t(format!("Il server non risponde dopo {secondi} s."), format!("The server is not responding after {secondi} s.")), coda_del_log(&sup.log(nome), 12));
        }
        passo(secondi);
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Cosa succede a un server che l'app ha acceso.
#[derive(Debug, PartialEq, Eq)]
pub enum Evento {
    /// Il server è uscito (codice) e l'app lo sta riaccendendo.
    Caduto(i32),
    /// Il server è di nuovo in risposta.
    Riacceso,
    /// Non si riaccende più: il messaggio dice perché, con le ultime righe del log.
    Arreso(String),
}

/// Guarda il server che l'app ha acceso (`nome`, già avviato dal supervisore): se esce lo riaccende con lo stesso `comando` e aspetta che risponda. Se la riaccensione
/// cade di nuovo prima di `finestra`, o non riparte, si arrende. Finisce quando il processo viene sostituito o fermato (`ferma_tutto`), o dopo `Arreso`.
pub fn sorveglia(sup: &Supervisore, comando: &Comando, porta: u16, lavoro: &Path, finestra: Duration, attesa: Duration, mut evento: impl FnMut(Evento)) {
    let nome = comando.nome.as_str();
    let Some(mut pid) = sup.pid(nome) else { return };
    let mut riacceso: Option<Instant> = None;
    loop {
        let Some(codice) = sup.attendi_uscita(nome, pid) else { return };
        if riacceso.is_some_and(|t| t.elapsed() < finestra) {
            let frase = t(format!("Il server si è fermato di nuovo (codice {codice})."), format!("The server has stopped again (code {codice})."));
            evento(Evento::Arreso(format!("{frase}\n{}", coda_del_log(&sup.log(nome), 12))));
            return;
        }
        evento(Evento::Caduto(codice));
        pid = match sup.riaccendi(comando) {
            Ok(pid) => pid,
            Err(e) => return evento(Evento::Arreso(format!("{e:#}"))),
        };
        riacceso = Some(Instant::now());
        if let Err(e) = aspetta_pronto(sup, nome, porta, lavoro, attesa, |_| {}) {
            return evento(Evento::Arreso(format!("{e:#}")));
        }
        evento(Evento::Riacceso);
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use crate::supervisor::Comando;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Un server finto che risponde `stato` a ogni richiesta, su una porta libera.
    fn server_finto(stato: &'static str) -> u16 {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = ascolto.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for flusso in ascolto.incoming() {
                let Ok(mut f) = flusso else { return };
                let mut buf = [0u8; 1024];
                let _ = f.read(&mut buf);
                let _ = write!(f, "HTTP/1.1 {stato}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}");
            }
        });
        porta
    }

    /// Un server finto che risponde 200 solo a chi porta la chiave, come il vero, e 401 agli altri.
    fn server_con_chiave(chiave: &'static str) -> u16 {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = ascolto.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for flusso in ascolto.incoming() {
                let Ok(mut f) = flusso else { return };
                let mut buf = [0u8; 2048];
                let n = f.read(&mut buf).unwrap_or(0);
                let richiesta = String::from_utf8_lossy(&buf[..n]).to_lowercase();
                let stato = if richiesta.contains(&format!("x-chiave-api: {chiave}")) { "200 OK" } else { "401 Unauthorized" };
                let _ = write!(f, "HTTP/1.1 {stato}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}");
            }
        });
        porta
    }

    fn lavoro_con_chiave(chiave: Option<&str>) -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        if let Some(chiave) = chiave {
            let cartella = t.path().join("archivio").join("arrivi");
            std::fs::create_dir_all(&cartella).unwrap();
            std::fs::write(cartella.join("chiave-api.json"), format!("{{ \"chiave\": \"{chiave}\", \"creata\": \"2026-11-05T18:06:47.949Z\" }}")).unwrap();
        }
        t
    }

    fn porta_libera() -> u16 {
        TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
    }

    fn comando(nome: &str, cmd: &str, cwd: &std::path::Path) -> Comando {
        Comando { nome: nome.into(), exe: "cmd".into(), args: vec!["/c".into(), cmd.into()], cwd: cwd.to_path_buf(), env: vec![] }
    }

    #[test]
    fn il_server_parte_dal_codice_e_riceve_la_cartella_di_lavoro() {
        let codice = tempfile::tempdir().unwrap();
        let lavoro = tempfile::tempdir().unwrap();
        let c = comando_server((PathBuf::from("cmd"), vec!["/c".into(), "bun.cmd".into()]), codice.path(), lavoro.path(), 4242, Vec::new());
        assert_eq!(c.cwd, codice.path());
        assert_eq!(c.env[0], (OsString::from("MANGO_ANIMATION_LAVORO"), lavoro.path().as_os_str().to_owned()));
        let args: Vec<String> = c.args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(args, ["/c", "bun.cmd", "run", "--cwd", "server", "avvia"]);
    }

    #[test]
    fn il_server_riceve_anche_le_variabili_che_l_app_ha_preparato() {
        let codice = tempfile::tempdir().unwrap();
        let lavoro = tempfile::tempdir().unwrap();
        let claude = (OsString::from("MANGO_ANIMATION_CLAUDE"), OsString::from(r"C:\Users\esempio\.local\bin\claude.exe"));
        let c = comando_server((PathBuf::from("bun.exe"), Vec::new()), codice.path(), lavoro.path(), 4242, vec![claude.clone()]);
        assert_eq!(c.env[0], (OsString::from("MANGO_ANIMATION_LAVORO"), lavoro.path().as_os_str().to_owned()));
        assert_eq!(c.env[2], claude);
    }

    #[test]
    fn il_server_sa_di_quale_app_e_figlio() {
        let codice = tempfile::tempdir().unwrap();
        let lavoro = tempfile::tempdir().unwrap();
        let c = comando_server((PathBuf::from("bun.exe"), Vec::new()), codice.path(), lavoro.path(), 4242, Vec::new());
        assert!(c.env.contains(&(OsString::from("MANGO_ANIMATION_APP_PID"), OsString::from("4242"))));
    }

    #[test]
    fn un_server_che_risponde_si_usa_e_basta() {
        assert_eq!(decidi(server_finto("200 OK"), lavoro_con_chiave(None).path()), Decisione::GiaAcceso);
    }

    #[test]
    fn il_server_protetto_si_riconosce_solo_con_la_chiave_della_cartella_di_lavoro() {
        let porta = server_con_chiave("abc123");
        assert_eq!(decidi(porta, lavoro_con_chiave(Some("abc123")).path()), Decisione::GiaAcceso);
        // Senza chiave ancora, o con quella di un'altra cartella, il 401 non è il nostro server.
        assert_eq!(decidi(porta, lavoro_con_chiave(None).path()), Decisione::DaAvviare);
        assert_eq!(decidi(porta, lavoro_con_chiave(Some("altra")).path()), Decisione::DaAvviare);
    }

    #[test]
    fn la_chiave_si_legge_dal_file_del_server_e_se_non_si_legge_non_c_e() {
        assert_eq!(chiave_del_server(lavoro_con_chiave(Some("k9")).path()), Some("k9".into()));
        assert_eq!(chiave_del_server(lavoro_con_chiave(None).path()), None);
        let guasto = lavoro_con_chiave(Some("x"));
        std::fs::write(guasto.path().join("archivio/arrivi/chiave-api.json"), "non è json").unwrap();
        assert_eq!(chiave_del_server(guasto.path()), None);
    }

    #[test]
    fn la_finestra_entra_nello_studio_con_la_chiave_e_senza_chiave_va_alla_radice() {
        assert_eq!(indirizzo_dello_studio(47431, lavoro_con_chiave(Some("a b&c")).path()), "http://127.0.0.1:47431/entra?chiave=a+b%26c");
        assert_eq!(indirizzo_dello_studio(47431, lavoro_con_chiave(None).path()), "http://127.0.0.1:47431/");
    }

    #[test]
    fn senza_server_si_avvia() {
        assert_eq!(decidi(porta_libera(), lavoro_con_chiave(None).path()), Decisione::DaAvviare);
    }

    #[test]
    fn una_porta_che_risponde_male_non_e_il_server() {
        assert_eq!(decidi(server_finto("500 Internal Server Error"), lavoro_con_chiave(None).path()), Decisione::DaAvviare);
    }

    #[test]
    fn la_porta_viene_dalla_variabile() {
        assert_eq!(porta_da(None).unwrap(), 47431);
        assert_eq!(porta_da(Some("")).unwrap(), 47431);
        assert_eq!(porta_da(Some("48000")).unwrap(), 48000);
        assert!(porta_da(Some("abc")).unwrap_err().to_string().contains("abc"));
    }

    #[test]
    fn se_il_processo_esce_l_errore_ha_le_righe_del_log() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        sup.avvia(&comando("server", "echo La porta e occupata & exit 1", t.path())).unwrap();
        let e = aspetta_pronto(&sup, "server", porta_libera(), lavoro_con_chiave(None).path(), Duration::from_secs(10), |_| {}).unwrap_err().to_string();
        assert!(e.contains("La porta e occupata") && e.contains("codice 1"), "{e}");
    }

    #[test]
    fn se_il_server_non_arriva_l_errore_dice_il_tempo() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        sup.avvia(&comando("server", "echo parto & ping -n 30 127.0.0.1 >nul", t.path())).unwrap();
        let e = aspetta_pronto(&sup, "server", porta_libera(), lavoro_con_chiave(None).path(), Duration::from_secs(2), |_| {}).unwrap_err().to_string();
        sup.ferma_tutto();
        assert!(e.contains("non risponde dopo 2 s") && e.contains("parto"), "{e}");
    }

    fn lungo(cwd: &std::path::Path) -> Comando {
        comando("server", "ping -n 60 127.0.0.1 >nul", cwd)
    }

    fn aspetta(rx: &std::sync::mpsc::Receiver<Evento>) -> Evento {
        rx.recv_timeout(Duration::from_secs(20)).expect("l'evento doveva arrivare")
    }

    fn uccidi_il_server(sup: &Supervisore) {
        crate::supervisor::uccidi_albero(sup.pid("server").unwrap());
    }

    #[test]
    fn il_server_ucciso_si_riaccende_e_se_ricade_subito_ci_si_arrende() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let porta = server_finto("200 OK");
        let c = lungo(t.path());
        sup.avvia(&c).unwrap();
        let primo = sup.pid("server").unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::scope(|s| {
            s.spawn(|| sorveglia(&sup, &c, porta, lavoro_con_chiave(None).path(), Duration::from_secs(60), Duration::from_secs(10), |e| tx.send(e).unwrap()));
            uccidi_il_server(&sup);
            assert!(matches!(aspetta(&rx), Evento::Caduto(_)));
            assert_eq!(aspetta(&rx), Evento::Riacceso);
            assert_ne!(sup.pid("server").unwrap(), primo);
            uccidi_il_server(&sup);
            let Evento::Arreso(m) = aspetta(&rx) else { panic!("doveva arrendersi") };
            assert!(m.starts_with("Il server si è fermato di nuovo (codice "), "{m}");
        });
        sup.ferma_tutto();
    }

    #[test]
    fn un_server_che_ha_girato_a_lungo_si_riaccende_ancora() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let porta = server_finto("200 OK");
        let c = lungo(t.path());
        sup.avvia(&c).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::scope(|s| {
            let guardia = s.spawn(|| sorveglia(&sup, &c, porta, lavoro_con_chiave(None).path(), Duration::from_secs(1), Duration::from_secs(10), |e| tx.send(e).unwrap()));
            uccidi_il_server(&sup);
            assert!(matches!(aspetta(&rx), Evento::Caduto(_)));
            assert_eq!(aspetta(&rx), Evento::Riacceso);
            std::thread::sleep(Duration::from_millis(1500));
            uccidi_il_server(&sup);
            assert!(matches!(aspetta(&rx), Evento::Caduto(_)));
            assert_eq!(aspetta(&rx), Evento::Riacceso);
            sup.ferma_tutto();
            guardia.join().unwrap();
        });
    }

    #[test]
    fn un_server_che_non_riparte_porta_il_log_nell_errore() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let c = comando("server", "echo manca la porta & exit 1", t.path());
        sup.avvia(&c).unwrap();
        let mut eventi = Vec::new();
        sorveglia(&sup, &c, porta_libera(), lavoro_con_chiave(None).path(), Duration::from_secs(60), Duration::from_secs(10), |e| eventi.push(e));
        assert!(matches!(eventi[0], Evento::Caduto(1)));
        let Some(Evento::Arreso(m)) = eventi.get(1) else { panic!("{eventi:?}") };
        assert!(m.contains("si è chiuso subito") && m.contains("manca la porta"), "{m}");
        assert_eq!(eventi.len(), 2);
    }

    #[test]
    fn se_il_server_arriva_ha_finito() {
        let t = tempfile::tempdir().unwrap();
        let sup = Supervisore::nuovo(t.path());
        let porta = server_finto("200 OK");
        sup.avvia(&comando("server", "ping -n 30 127.0.0.1 >nul", t.path())).unwrap();
        aspetta_pronto(&sup, "server", porta, lavoro_con_chiave(None).path(), Duration::from_secs(5), |_| {}).unwrap();
        sup.ferma_tutto();
    }

    #[test]
    fn le_frasi_del_server_escono_anche_in_inglese() {
        crate::lingua::con(crate::lingua::Lingua::En, || {
            let e = porta_da(Some("abc")).unwrap_err().to_string();
            assert!(e.contains("abc") && e.contains("is not a valid port"), "{e}");

            let t = tempfile::tempdir().unwrap();
            let sup = Supervisore::nuovo(t.path());
            sup.avvia(&comando("server", "echo La porta e occupata & exit 1", t.path())).unwrap();
            let e = aspetta_pronto(&sup, "server", porta_libera(), lavoro_con_chiave(None).path(), Duration::from_secs(10), |_| {}).unwrap_err().to_string();
            assert!(e.contains("The server closed right away (code 1)") && e.contains("La porta e occupata"), "{e}");
        });
    }

    #[test]
    fn il_server_che_cade_due_volte_lo_dice_con_una_frase_per_il_creator_in_italiano_e_in_inglese() {
        let t = tempfile::tempdir().unwrap();
        let porta = server_finto("200 OK");
        let c = lungo(t.path());
        let arreso = |lingua: crate::lingua::Lingua| {
            let sup = Supervisore::nuovo(&t.path().join(lingua.codice()));
            sup.avvia(&c).unwrap();
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::scope(|s| {
                // la sorveglianza gira in un thread suo, come nell'app: la lingua di prova vale per quel thread
                s.spawn(|| crate::lingua::con(lingua, || sorveglia(&sup, &c, porta, lavoro_con_chiave(None).path(), Duration::from_secs(60), Duration::from_secs(10), |e| tx.send(e).unwrap())));
                uccidi_il_server(&sup);
                assert!(matches!(aspetta(&rx), Evento::Caduto(_)));
                assert_eq!(aspetta(&rx), Evento::Riacceso);
                uccidi_il_server(&sup);
                let Evento::Arreso(m) = aspetta(&rx) else { panic!("doveva arrendersi") };
                sup.ferma_tutto();
                m
            })
        };
        let it = arreso(crate::lingua::Lingua::It);
        assert!(it.starts_with("Il server si è fermato di nuovo (codice "), "{it}");
        let en = arreso(crate::lingua::Lingua::En);
        assert!(en.starts_with("The server has stopped again (code "), "{en}");
    }
}
