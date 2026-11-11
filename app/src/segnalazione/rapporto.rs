//! La segnalazione: l'evento di Sentry, i suoi allegati e il testo con la fine dei registri, tutto già anonimizzato. Testi per chi sistema il problema, non per il creator: restano in inglese.

use super::anonimizza::{anonimizza, Chi};
use crate::computer::hw;
use crate::rete;
use chrono::{DateTime, NaiveDateTime, Utc};
use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Cos'è successo alla schermata della finestra, per chi legge la segnalazione.
pub(super) enum Schermata {
    NonChiesta,
    Allegata,
    SenzaInvio,
    SenzaFinestra,
    NonPresa(String),
}

impl Schermata {
    fn dice(&self) -> String {
        match self {
            Schermata::NonChiesta => "not requested".to_string(),
            Schermata::Allegata => "attached".to_string(),
            Schermata::SenzaInvio => "not attached: this build keeps the report in a file".to_string(),
            Schermata::SenzaFinestra => "requested but there is no window".to_string(),
            Schermata::NonPresa(perche) => format!("requested but not captured: {perche}"),
        }
    }
}

/// Quanto della fine di ogni registro entra nella segnalazione.
const CODA: u64 = 256 * 1024;

/// Ciò che la pagina sa del problema.
pub(super) struct Ingresso {
    pub(super) versione: String,
    pub(super) installata: bool,
    pub(super) lingua: &'static str,
    pub(super) errore: Option<String>,
    pub(super) nota: Option<String>,
    pub(super) pagina: Option<String>,
}

/// Una segnalazione già anonimizzata.
pub(super) struct Segnalazione {
    ingresso: Ingresso,
    windows: String,
    computer: hw::Computer,
    pub(super) testo: String,
}

pub(super) struct Dsn {
    pub(super) endpoint: String,
    pub(super) chiave: String,
    pub(super) intero: String,
}

/// Una voce della busta di Sentry: la sua riga di intestazione, poi i suoi byte.
fn voce(corpo: &mut Vec<u8>, intestazione: Value, byte: &[u8]) {
    corpo.extend_from_slice(intestazione.to_string().as_bytes());
    corpo.push(b'\n');
    corpo.extend_from_slice(byte);
    corpo.push(b'\n');
}

/// I registri dell'app (`*.log` nella sua cartella dei registri), dal meno al più recente. Nient'altro: le cartelle e gli altri file non contano.
fn registri_dell_app(cartella: &Path) -> Vec<PathBuf> {
    let mut trovati: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(cartella)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x == "log"))
        .map(|p| (std::fs::metadata(&p).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), p))
        .collect();
    trovati.sort();
    trovati.into_iter().map(|(_, p)| p).collect()
}

/// La fine di un registro (`CODA` byte); si legge anche mentre l'app lo scrive.
fn coda_di(percorso: &Path) -> String {
    let leggi = || -> std::io::Result<String> {
        let mut f = std::fs::File::open(percorso)?;
        let inizio = f.metadata()?.len().saturating_sub(CODA);
        f.seek(SeekFrom::Start(inizio))?;
        let mut byte = Vec::new();
        f.read_to_end(&mut byte)?;
        let testo = String::from_utf8_lossy(&byte).into_owned();
        Ok(if inizio > 0 { format!("[... {inizio} bytes]\n{testo}") } else { testo })
    };
    leggi().unwrap_or_else(|e| format!("(not read: {e})"))
}

fn senza_vuoti(testo: Option<String>, chi: &Chi) -> Option<String> {
    testo.map(|s| anonimizza(s.trim(), chi)).filter(|s| !s.is_empty())
}

impl Segnalazione {
    /// Mette insieme la segnalazione: ciò che la pagina ha detto, il computer e la fine dei registri, tutto già anonimizzato. `schermata` dice cosa è successo alla schermata.
    pub(super) fn raccogli(ingresso: Ingresso, windows: String, computer: hw::Computer, schermata: &Schermata, registri: &Path, chi: &Chi) -> Segnalazione {
        let ingresso = Ingresso {
            errore: senza_vuoti(ingresso.errore, chi),
            nota: senza_vuoti(ingresso.nota, chi),
            pagina: senza_vuoti(ingresso.pagina, chi),
            ..ingresso
        };
        let mut s = Segnalazione { ingresso, windows, computer, testo: String::new() };
        let mut testo = format!("# Mango Animation problem report\n\n{}\nScreenshot: {}\n", s.riassunto(), schermata.dice());
        if let Some(p) = &s.ingresso.pagina {
            testo += &format!("Page: {p}\n");
        }
        if let Some(n) = &s.ingresso.nota {
            testo += &format!("\n## What the user says\n\n{n}\n");
        }
        if let Some(e) = &s.ingresso.errore {
            testo += &format!("\n## Error\n\n{e}\n");
        }
        testo += "\n## Logs (the end of each, oldest change first)\n";
        for registro in registri_dell_app(registri) {
            testo += &format!("\n===== {} =====\n{}\n", anonimizza(&registro.display().to_string(), chi), anonimizza(&coda_di(&registro), chi));
        }
        s.testo = testo;
        s
    }

    /// Versione, sistema e macchina: le righe in cima al testo, e quelle che vanno nella pagina di GitHub.
    pub(super) fn riassunto(&self) -> String {
        let (i, c) = (&self.ingresso, &self.computer);
        let mut r = format!(
            "Mango Animation {} ({})\n{}\nCPU: {} ({} threads), RAM {} MiB\n",
            i.versione,
            if i.installata { "installed" } else { "development" },
            self.windows,
            c.processore,
            c.thread,
            c.ram_mb
        );
        for (n, g) in c.schede.iter().enumerate() {
            r += &format!("GPU {n}: {} ({} MiB)\n", g.nome, g.memoria_mb);
        }
        r + &format!("Language: {}", i.lingua)
    }

    fn evento(&self, id: &str, ora: DateTime<Utc>) -> Value {
        let (i, c) = (&self.ingresso, &self.computer);
        let titolo: String = i
            .nota
            .as_deref()
            .or(i.errore.as_deref())
            .and_then(|t| t.lines().find(|l| !l.trim().is_empty()))
            .unwrap_or("Report from the app")
            .chars()
            .take(200)
            .collect();
        let gpu = c.schede.first().map_or_else(|| "none".to_string(), |g| g.nome.clone());
        let vram_mib: u64 = c.schede.iter().map(|g| g.memoria_mb).sum();
        json!({
            "event_id": id,
            "timestamp": ora.to_rfc3339(),
            "platform": "native",
            // Sempre `error`: Sentry le dà priorità alta, ed è quella per cui manda la mail. Il tag `kind` distingue la pagina d'errore dalla segnalazione di chi scrive.
            "level": "error",
            "logger": "report-a-problem",
            "release": format!("mango-animation@{}", i.versione),
            "environment": if i.installata { "production" } else { "development" },
            "message": { "formatted": titolo },
            "tags": {
                "kind": if i.errore.is_some() { "error-page" } else { "user-report" },
                "gpu": gpu,
                "vram_mib": vram_mib.to_string(),
                "ram_mib": c.ram_mb.to_string(),
                "lingua": i.lingua,
                "app": if i.installata { "installata" } else { "sviluppo" },
            },
            "contexts": {
                "os": { "name": "Windows", "version": self.windows },
                "device": { "cpu_description": format!("{} ({} threads)", c.processore, c.thread), "memory_size": c.ram_mb * 1024 * 1024 },
                // Nel contesto GPU di Sentry `memory_size` è in MiB; in `device` è in byte.
                "gpu": { "name": gpu, "memory_size": vram_mib },
            },
            "extra": {
                "note": i.nota,
                "error": i.errore,
                "page": i.pagina,
                "gpus": c.schede.iter().map(|g| format!("{} ({} MiB)", g.nome, g.memoria_mb)).collect::<Vec<_>>(),
            },
        })
    }

    /// La busta di Sentry: l'evento e i suoi allegati.
    pub(super) fn busta(&self, dsn: &Dsn, id: &str, ora: DateTime<Utc>, png: Option<&[u8]>) -> Vec<u8> {
        let mut corpo = Vec::new();
        corpo.extend_from_slice(json!({ "event_id": id, "dsn": dsn.intero, "sent_at": ora.to_rfc3339() }).to_string().as_bytes());
        corpo.push(b'\n');
        let evento = self.evento(id, ora).to_string();
        voce(&mut corpo, json!({ "type": "event", "length": evento.len() }), evento.as_bytes());
        let testo = self.testo.as_bytes();
        voce(&mut corpo, json!({ "type": "attachment", "length": testo.len(), "filename": "report.txt", "content_type": "text/plain" }), testo);
        if let Some(png) = png {
            voce(&mut corpo, json!({ "type": "attachment", "length": png.len(), "filename": "screenshot.png", "content_type": "image/png" }), png);
        }
        corpo
    }

    pub(super) fn spedisci(&self, dsn: &Dsn, png: Option<&[u8]>) -> Result<(), String> {
        let corpo = self.busta(dsn, &uuid::Uuid::new_v4().simple().to_string(), Utc::now(), png);
        rete::agente(&dsn.endpoint, Duration::from_secs(30))
            .post(&dsn.endpoint)
            .header("Content-Type", "application/x-sentry-envelope")
            .header("X-Sentry-Auth", &format!("Sentry sentry_version=7, sentry_client=mango-animation/{}, sentry_key={}", self.ingresso.versione, dsn.chiave))
            .send(&corpo)
            .map(|_| ())
            .map_err(|e| rete::spiega(&e, &dsn.endpoint).unwrap_or_else(|| e.to_string()))
    }

    /// Senza Sentry: il testo in un file nella cartella dei registri.
    pub(super) fn salva(&self, cartella: &Path, ora: NaiveDateTime) -> std::io::Result<PathBuf> {
        std::fs::create_dir_all(cartella)?;
        let file = cartella.join(format!("segnalazione-{}.txt", ora.format("%Y-%m-%d-%H%M%S")));
        std::fs::write(&file, &self.testo)?;
        Ok(file)
    }
}

#[cfg(test)]
pub(super) mod aiuti {
    use super::*;


    pub fn computer() -> hw::Computer {
        hw::Computer {
            schede: vec![hw::SchedaNvidia { indice: 0, nome: "NVIDIA GeForce RTX 3060 Ti".into(), memoria_mb: 8192, libera_mb: 3578, capacita: Some("8.6".into()) }],
            processore: "AMD Ryzen 7 5800X".into(),
            thread: 16,
            ram_mb: 32768,
            disco_libero_mb: 100_000,
        }
    }

    pub fn ingresso(errore: Option<&str>, nota: Option<&str>) -> Ingresso {
        Ingresso {
            versione: "0.1.0".into(),
            installata: true,
            lingua: "it",
            errore: errore.map(Into::into),
            nota: nota.map(Into::into),
            pagina: Some("/#/video/pasta-fresca".into()),
        }
    }

    pub fn chi() -> Chi {
        Chi::nuovo(&["Gianni"], &["PC-STUDIO"], vec!["q7Zk2m_Vd9XaB4nTe1LpW0sRyH3cUfJo5GiN8xAt6MQ".into()])
    }

    /// Una cartella dei registri com'è sul computer di un creator: i registri dell'app, e accanto altro che non deve uscire.
    pub fn registri() -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("server.log"), "avvio da C:\\Users\\Gianni\\Documents\\Mango Animation\nGET /entra?chiave=q7Zk2m_Vd9XaB4nTe1LpW0sRyH3cUfJo5GiN8xAt6MQ\nvideo «Pasta fresca»\n").unwrap();
        std::fs::write(t.path().join("ui.log"), "2026-11-08 10:00:00.000 [console] /#/video errore finto\n").unwrap();
        std::fs::write(t.path().join("trascrizione.json"), "{\"testo\":\"parole del creator\"}").unwrap();
        std::fs::create_dir(t.path().join("chat")).unwrap();
        std::fs::write(t.path().join("chat").join("conversazione.log"), "messaggio privato").unwrap();
        t
    }

    pub fn segnalazione(errore: Option<&str>, nota: Option<&str>) -> (Segnalazione, tempfile::TempDir) {
        let cartella = registri();
        (Segnalazione::raccogli(ingresso(errore, nota), "Microsoft Windows [Version 10.0.19045.1]".into(), computer(), &Schermata::Allegata, cartella.path(), &chi()), cartella)
    }

    pub fn ora() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-11-08T10:30:00Z").unwrap().with_timezone(&Utc)
    }

    /// Una busta come la legge Sentry: una riga di intestazione, poi per ogni voce la sua riga e i suoi byte.
    pub fn leggi_busta(busta: &[u8]) -> Vec<(Value, Vec<u8>)> {
        let mut resto = &busta[busta.iter().position(|b| *b == b'\n').unwrap() + 1..];
        let mut voci = Vec::new();
        while !resto.is_empty() {
            let fine = resto.iter().position(|b| *b == b'\n').unwrap();
            let intestazione: Value = serde_json::from_slice(&resto[..fine]).unwrap();
            let lunghezza = intestazione["length"].as_u64().unwrap() as usize;
            voci.push((intestazione, resto[fine + 1..fine + 1 + lunghezza].to_vec()));
            assert_eq!(resto[fine + 1 + lunghezza], b'\n');
            resto = &resto[fine + 2 + lunghezza..];
        }
        voci
    }
}

#[cfg(test)]
mod prove {
    use super::aiuti::*;
    use super::*;

    #[test]
    fn nella_segnalazione_entrano_solo_i_registri_dell_app_e_senza_i_dati_personali() {
        let (s, _cartella) = segnalazione(None, Some("non parte"));
        assert!(s.testo.contains("server.log") && s.testo.contains("ui.log") && s.testo.contains("errore finto"), "{}", s.testo);
        assert!(s.testo.contains("video «Pasta fresca»"), "i nomi dei video restano: la schermata di invio lo dice");
        for fuori in ["parole del creator", "messaggio privato", "conversazione", "Gianni", "q7Zk2m", "trascrizione"] {
            assert!(!s.testo.contains(fuori), "«{fuori}» è nella segnalazione:\n{}", s.testo);
        }
        assert!(s.testo.contains("C:\\Users\\<user>\\Documents"), "{}", s.testo);
    }

    #[test]
    fn di_un_registro_lungo_entra_la_fine_e_si_dice_quanto_manca() {
        let t = tempfile::tempdir().unwrap();
        // Un carattere che il percorso della cartella temporanea non può avere: nel testo c'è solo quello del registro.
        std::fs::write(t.path().join("lungo.log"), "|".repeat((CODA + 10) as usize)).unwrap();
        let s = Segnalazione::raccogli(ingresso(None, None), String::new(), computer(), &Schermata::NonChiesta, t.path(), &chi());
        assert!(s.testo.contains("[... 10 bytes]"));
        assert_eq!(s.testo.matches('|').count(), CODA as usize);
    }

    #[test]
    fn l_evento_ha_la_forma_comune_a_tutte_le_app() {
        let (s, _c) = segnalazione(None, Some("non parte\nsecondo rigo"));
        let e = s.evento("0123", ora());
        assert_eq!(e["level"], "error");
        assert_eq!(e["release"], "mango-animation@0.1.0");
        assert_eq!(e["environment"], "production");
        assert_eq!(e["message"]["formatted"], "non parte");
        assert_eq!(e["event_id"], "0123");
        let tag = &e["tags"];
        assert_eq!(tag["kind"], "user-report");
        assert_eq!((tag["gpu"].as_str(), tag["vram_mib"].as_str(), tag["ram_mib"].as_str()), (Some("NVIDIA GeForce RTX 3060 Ti"), Some("8192"), Some("32768")));
        assert_eq!((tag["lingua"].as_str(), tag["app"].as_str()), (Some("it"), Some("installata")));
        assert_eq!(e["contexts"]["os"]["name"], "Windows");
        assert_eq!(e["contexts"]["os"]["version"], "Microsoft Windows [Version 10.0.19045.1]");
        assert_eq!(e["contexts"]["device"]["cpu_description"], "AMD Ryzen 7 5800X (16 threads)");
        assert_eq!(e["contexts"]["device"]["memory_size"], 32768u64 * 1024 * 1024);
        assert_eq!(e["contexts"]["gpu"]["name"], "NVIDIA GeForce RTX 3060 Ti");
        assert_eq!(e["contexts"]["gpu"]["memory_size"], 8192u64);
        assert_eq!(e["extra"]["note"], "non parte\nsecondo rigo");
        assert_eq!(e["extra"]["error"], Value::Null);
        assert_eq!(e["extra"]["page"], "/#/video/pasta-fresca");
    }

    #[test]
    fn con_un_errore_la_pagina_e_quella_d_errore_e_il_titolo_e_la_prima_riga_dell_errore() {
        let (s, _c) = segnalazione(Some("\nIl server non parte\nultime righe del log"), None);
        let e = s.evento("1", ora());
        assert_eq!(e["tags"]["kind"], "error-page");
        assert_eq!(e["message"]["formatted"], "Il server non parte");
        assert_eq!(e["extra"]["error"], "Il server non parte\nultime righe del log");
    }

    #[test]
    fn senza_scheda_video_i_campi_della_scheda_lo_dicono_e_chi_sviluppa_non_sporca_la_produzione() {
        let cartella = registri();
        let mut i = ingresso(None, None);
        i.installata = false;
        let s = Segnalazione::raccogli(i, String::new(), hw::Computer { schede: vec![], ..computer() }, &Schermata::NonChiesta, cartella.path(), &chi());
        let e = s.evento("1", ora());
        assert_eq!((e["tags"]["gpu"].as_str(), e["tags"]["vram_mib"].as_str()), (Some("none"), Some("0")));
        assert_eq!((e["environment"].as_str(), e["tags"]["app"].as_str()), (Some("development"), Some("sviluppo")));
        assert_eq!(e["message"]["formatted"], "Report from the app");
    }

    #[test]
    fn la_busta_porta_l_evento_il_riepilogo_e_la_schermata_solo_se_c_e() {
        let (s, _c) = segnalazione(None, Some("non parte"));
        let dsn = Dsn { endpoint: String::new(), chiave: "chiavepubblica".into(), intero: "https://chiavepubblica@o4510.ingest.de.sentry.io/4512".into() };
        let png = [137u8, 80, 78, 71, 0, 10, 255];

        let con = leggi_busta(&s.busta(&dsn, "0123", ora(), Some(&png)));
        assert_eq!(con.len(), 3);
        assert_eq!(con[0].0["type"], "event");
        assert_eq!(serde_json::from_slice::<Value>(&con[0].1).unwrap()["release"], "mango-animation@0.1.0");
        assert_eq!((con[1].0["type"].as_str(), con[1].0["filename"].as_str(), con[1].0["content_type"].as_str()), (Some("attachment"), Some("report.txt"), Some("text/plain")));
        assert_eq!(con[1].1, s.testo.as_bytes());
        assert_eq!((con[2].0["filename"].as_str(), con[2].0["content_type"].as_str()), (Some("screenshot.png"), Some("image/png")));
        assert_eq!(con[2].1, png);

        assert_eq!(leggi_busta(&s.busta(&dsn, "0123", ora(), None)).len(), 2);
    }

    #[test]
    fn il_riepilogo_dice_versione_computer_e_se_la_schermata_e_allegata() {
        let (s, _c) = segnalazione(None, None);
        let r = s.riassunto();
        for c in ["Mango Animation 0.1.0", "Windows [Version 10.0.19045.1]", "AMD Ryzen 7 5800X (16 threads), RAM 32768 MiB", "GPU 0: NVIDIA GeForce RTX 3060 Ti (8192 MiB)"] {
            assert!(r.contains(c), "{c} manca in:\n{r}");
        }
        assert!(s.testo.contains("Screenshot: attached"));
    }
}
