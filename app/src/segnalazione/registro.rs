//! `ui.log`: gli errori delle pagine e le chiamate all'app lente, una riga ciascuno, con un tetto di righe al minuto. Testi per chi sistema l'errore, non per il creator: restano in inglese.

use chrono::{DateTime, Local};
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Oltre questa misura `ui.log` diventa `ui.1.log` (il precedente si perde).
const UI_LOG_MAX: u64 = 2 * 1024 * 1024;
const RIGHE_AL_MINUTO: usize = 100;
const TESTO_MAX: usize = 4000;

#[derive(Default)]
pub(super) struct Tetto {
    inizio: Option<Instant>,
    scritte: usize,
    omesse: usize,
}

#[derive(Debug, PartialEq)]
pub(super) enum Via {
    Scrivi,
    ScriviDopoOmesse(usize),
    Salta,
}

impl Tetto {
    fn chiede(&mut self, ora: Instant) -> Via {
        if self.inizio.is_some_and(|inizio| ora.duration_since(inizio) < Duration::from_secs(60)) {
            if self.scritte < RIGHE_AL_MINUTO {
                self.scritte += 1;
                return Via::Scrivi;
            }
            self.omesse += 1;
            return Via::Salta;
        }
        let omesse = std::mem::take(&mut self.omesse);
        (self.inizio, self.scritte) = (Some(ora), 1);
        if omesse > 0 {
            Via::ScriviDopoOmesse(omesse)
        } else {
            Via::Scrivi
        }
    }
}

pub(super) static TETTO: Mutex<Tetto> = Mutex::new(Tetto { inizio: None, scritte: 0, omesse: 0 });

pub(super) struct Riga<'a> {
    pub(super) livello: &'a str,
    pub(super) pagina: Option<&'a str>,
    pub(super) testo: &'a str,
}

pub(super) fn registra(cartella: &Path, tetto: &Mutex<Tetto>, istante: Instant, ora: DateTime<Local>, riga: &Riga) -> std::io::Result<()> {
    let via = tetto.lock().unwrap_or_else(|e| e.into_inner()).chiede(istante);
    if via == Via::Salta {
        return Ok(());
    }
    std::fs::create_dir_all(cartella)?;
    let file = cartella.join("ui.log");
    if std::fs::metadata(&file).is_ok_and(|m| m.len() > UI_LOG_MAX) {
        std::fs::rename(&file, cartella.join("ui.1.log"))?;
    }
    let mut fuori = std::fs::OpenOptions::new().create(true).append(true).open(&file)?;
    let quando = ora.format("%Y-%m-%d %H:%M:%S%.3f");
    if let Via::ScriviDopoOmesse(n) = via {
        writeln!(fuori, "{quando} [ui.log] {n} righe tralasciate nel minuto prima (tetto di {RIGHE_AL_MINUTO} al minuto)")?;
    }
    let livello: String = riga.livello.chars().filter(char::is_ascii_alphanumeric).take(12).collect();
    let livello = if livello.is_empty() { "ui".to_string() } else { livello };
    let pagina = riga.pagina.map(|p| format!(" {}", p.replace(['\r', '\n'], " "))).unwrap_or_default();
    let testo: String = riga.testo.chars().filter(|c| *c != '\r').take(TESTO_MAX).collect();
    writeln!(fuori, "{quando} [{livello}]{pagina} {}", testo.trim_end().replace('\n', "\n    "))
}

#[cfg(test)]
mod prove {
    use super::*;

    fn riga<'a>(livello: &'a str, pagina: Option<&'a str>, testo: &'a str) -> Riga<'a> {
        Riga { livello, pagina, testo }
    }

    #[test]
    fn ui_log_scrive_una_riga_con_l_ora_il_livello_e_la_pagina_e_rientra_le_righe_dopo_la_prima() {
        let t = tempfile::tempdir().unwrap();
        let tetto = Mutex::new(Tetto::default());
        let ora = Local::now();
        registra(&t.path().join("logs"), &tetto, Instant::now(), ora, &riga("error", Some("/#/motori"), "TypeError: x\n  at a.js:1\n")).unwrap();
        registra(&t.path().join("logs"), &tetto, Instant::now(), ora, &riga("slow", None, "computer.leggi: 2400 ms")).unwrap();
        let scritto = std::fs::read_to_string(t.path().join("logs").join("ui.log")).unwrap();
        let righe: Vec<&str> = scritto.lines().collect();
        assert_eq!(righe.len(), 3, "{scritto}");
        assert!(righe[0].contains("[error] /#/motori TypeError: x") && righe[0].starts_with(&ora.format("%Y-%m-%d %H:%M:%S").to_string()));
        assert_eq!(righe[1], "      at a.js:1");
        assert!(righe[2].ends_with("[slow] computer.leggi: 2400 ms"));
    }

    #[test]
    fn ui_log_non_prende_il_livello_per_una_riga_e_taglia_i_testi_enormi() {
        let t = tempfile::tempdir().unwrap();
        let tetto = Mutex::new(Tetto::default());
        let enorme = "x".repeat(TESTO_MAX * 3);
        registra(t.path(), &tetto, Instant::now(), Local::now(), &riga("er\nror[", None, &enorme)).unwrap();
        let scritto = std::fs::read_to_string(t.path().join("ui.log")).unwrap();
        assert_eq!(scritto.lines().count(), 1);
        assert!(scritto.contains("[error]") && scritto.len() < TESTO_MAX + 200, "{}", scritto.len());
    }

    #[test]
    fn ui_log_troppo_grande_passa_in_ui_1_log() {
        let t = tempfile::tempdir().unwrap();
        std::fs::write(t.path().join("ui.log"), vec![b'x'; (UI_LOG_MAX + 1) as usize]).unwrap();
        registra(t.path(), &Mutex::new(Tetto::default()), Instant::now(), Local::now(), &riga("error", None, "nuova")).unwrap();
        assert_eq!(std::fs::metadata(t.path().join("ui.1.log")).unwrap().len(), UI_LOG_MAX + 1);
        assert!(std::fs::read_to_string(t.path().join("ui.log")).unwrap().contains("nuova"));
    }

    #[test]
    fn il_tetto_lascia_passare_cento_righe_al_minuto_e_poi_dice_quante_ne_ha_tolte() {
        let mut tetto = Tetto::default();
        let inizio = Instant::now();
        assert_eq!((0..RIGHE_AL_MINUTO).filter(|_| tetto.chiede(inizio) == Via::Scrivi).count(), RIGHE_AL_MINUTO);
        assert_eq!(tetto.chiede(inizio + Duration::from_secs(30)), Via::Salta);
        assert_eq!(tetto.chiede(inizio + Duration::from_secs(59)), Via::Salta);
        assert_eq!(tetto.chiede(inizio + Duration::from_secs(61)), Via::ScriviDopoOmesse(2));
        assert_eq!(tetto.chiede(inizio + Duration::from_secs(62)), Via::Scrivi);
    }

    #[test]
    fn le_righe_tolte_dal_tetto_si_leggono_nel_registro() {
        let t = tempfile::tempdir().unwrap();
        let tetto = Mutex::new(Tetto::default());
        let inizio = Instant::now();
        for i in 0..RIGHE_AL_MINUTO + 3 {
            registra(t.path(), &tetto, inizio, Local::now(), &riga("console", None, &format!("riga {i}"))).unwrap();
        }
        registra(t.path(), &tetto, inizio + Duration::from_secs(61), Local::now(), &riga("console", None, "dopo")).unwrap();
        let scritto = std::fs::read_to_string(t.path().join("ui.log")).unwrap();
        assert_eq!(scritto.lines().count(), RIGHE_AL_MINUTO + 2);
        assert!(!scritto.contains("riga 100") && scritto.contains("riga 99"));
        assert!(scritto.contains("3 righe tralasciate"), "{scritto}");
    }
}
