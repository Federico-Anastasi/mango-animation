//! Il computer pronto con un clic: cosa c'è (`hw`), cosa manca per le funzioni accese (`piano`), come si scarica con verifica (`scarica`, `installa`).
//! Ciò che l'app mostra al creator lo costruisce `vista`; ciò che esegue lo fa `esegui_piano`. La forma per lo studio è in `docs/APP.md`, «Il computer pronto».

pub mod hw;
pub mod installa;
pub mod manifesto;
pub mod piano;
pub mod ponte;
pub mod profilo;
pub mod scarica;

use crate::lingua::t;
use hw::Computer;
use installa::{fai, trova_programma, Evento, Strumenti};
use manifesto::{COSA_FA, FUNZIONI};
use piano::{moduli_per, Funzioni, Lavoro, Luoghi, Piano, SceltaPython, Sonde};
use serde::Serialize;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::sync::atomic::AtomicBool;

const MB: u64 = 1_048_576;

/// Come sta andando una voce del piano.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Progresso {
    pub stato: &'static str,
    pub fatti: u64,
    pub totale: u64,
    pub riga: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct FunzioneVista {
    pub id: &'static str,
    pub nome: String,
    /// Cosa fa, in una frase.
    pub cosa_fa: String,
    pub attiva: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct VoceVista {
    pub id: String,
    pub nome: String,
    pub scopo: String,
    pub funzione: Option<String>,
    /// Senza di lei il server non parte: non si può saltare.
    pub necessaria: bool,
    pub peso_mb: u64,
    pub licenza: String,
    pub fonte: String,
    /// «attesa», «in corso», «fatta» o «errore».
    pub stato: &'static str,
    pub fatti_mb: u64,
    pub totale_mb: u64,
    /// L'ultima riga di ciò che scrive un installatore.
    pub riga: Option<String>,
}

/// Ciò che la pagina vede: cosa c'è, cosa si può accendere o spegnere, cosa si scaricherebbe e quanto.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct StatoComputer {
    /// «piano» (il creator guarda e sceglie), «scarico» (si sta scaricando), «errore».
    pub fase: &'static str,
    pub computer: Computer,
    pub funzioni: Vec<FunzioneVista>,
    pub voci: Vec<VoceVista>,
    pub servono_mb: u64,
    pub libero_mb: u64,
    pub spazio_ok: bool,
    pub avvisi: Vec<String>,
    pub messaggio: Option<String>,
}

pub fn vista(fase: &'static str, computer: &Computer, funzioni: &Funzioni, piano: &Piano, avanzamento: &BTreeMap<String, Progresso>, messaggio: Option<String>) -> StatoComputer {
    let servono_mb = piano.servono_mb();
    StatoComputer {
        fase,
        computer: computer.clone(),
        funzioni: FUNZIONI.iter().zip(COSA_FA.iter()).map(|((id, it, en), (_, fa_it, fa_en))| FunzioneVista { id, nome: t(*it, *en), cosa_fa: t(*fa_it, *fa_en), attiva: funzioni.attiva(id) }).collect(),
        voci: piano
            .voci
            .iter()
            .map(|v| {
                let p = avanzamento.get(&v.id).cloned().unwrap_or(Progresso { stato: "attesa", ..Default::default() });
                VoceVista {
                    id: v.id.clone(),
                    nome: v.nome.clone(),
                    scopo: v.scopo.clone(),
                    funzione: v.funzione.clone(),
                    necessaria: v.necessaria(),
                    peso_mb: v.peso / MB,
                    licenza: v.licenza.clone(),
                    fonte: v.fonte.clone(),
                    stato: p.stato,
                    fatti_mb: p.fatti / MB,
                    totale_mb: p.totale / MB,
                    riga: p.riga,
                }
            })
            .collect(),
        servono_mb,
        libero_mb: computer.disco_libero_mb,
        spazio_ok: servono_mb <= computer.disco_libero_mb,
        avvisi: piano.avvisi.clone(),
        messaggio,
    }
}

/// Dove e con cosa si fa il piano: le cartelle, il PATH degli installatori, l'indirizzo di Hugging Face, e le sonde con cui si controlla Python.
#[derive(Clone, Copy)]
pub struct Dove<'a> {
    pub luoghi: &'a Luoghi,
    pub percorso: &'a OsStr,
    pub hf: &'a str,
    pub sonde: &'a dyn Sonde,
}

/// Fa le voci del piano una dopo l'altra, in ordine; si ferma alla prima che non riesce (con una frase che dice quale) o quando `annulla` si accende («annullato»).
/// `emetti` riceve ogni evento. Dopo Python controlla che sappia importare ciò che le funzioni accese vogliono.
pub fn esegui_piano(piano: &Piano, funzioni: &Funzioni, dove: &Dove, annulla: &AtomicBool, emetti: &mut dyn FnMut(Evento)) -> Result<(), String> {
    let Dove { luoghi, percorso, hf, sonde } = *dove;
    for voce in &piano.voci {
        emetti(Evento::Inizia(voce.id.clone()));
        let strumenti = Strumenti {
            uv: trova_programma(luoghi, "uv", percorso).unwrap_or_else(|| "uv".into()),
            bun: trova_programma(luoghi, "bun", percorso).unwrap_or_else(|| "bun".into()),
            percorso: percorso.to_owned(),
        };
        let (id, id_riga) = (voce.id.clone(), voce.id.clone());
        // Due chiusure mandano eventi mentre la voce gira: avanzamento dei byte e righe di un installatore.
        let emesso = RefCell::new(&mut *emetti);
        let esito = fai(
            voce,
            luoghi,
            &strumenti,
            hf,
            annulla,
            &mut |fatti, totale| (emesso.borrow_mut())(Evento::Avanza { id: id.clone(), fatti, totale }),
            &mut |riga| (emesso.borrow_mut())(Evento::Riga { id: id_riga.clone(), testo: riga.to_owned() }),
        );
        match esito {
            Err(e) if e == "annullato" => return Err(e),
            Err(e) => return Err(format!("{}: {e}", voce.nome)),
            Ok(()) => {}
        }
        if matches!(voce.lavoro, Lavoro::Python(_)) && piano.python == SceltaPython::DaPreparare && !sonde.python_importa(&luoghi.python_dell_app(), &moduli_per(funzioni)) {
            return Err(t(format!("{}: finito, ma l'ambiente non sa importare tutto ciò che serve", voce.nome), format!("{}: finished, but the environment cannot import everything it needs", voce.nome)));
        }
        emetti(Evento::Fatta(voce.id.clone()));
    }
    Ok(())
}

/// Cosa il creator risponde alla pagina del computer.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Risposta {
    /// Ha acceso o spento delle funzioni: si ricalcola cosa serve.
    Funzioni(BTreeMap<String, bool>),
    /// Prepara il computer con le funzioni scelte.
    Prepara,
    /// Va avanti così com'è.
    Continua,
}

/// Il giro della pagina del computer, senza finestra: `piano_per` calcola cosa serve per le funzioni scelte, `chiedi` fa vedere lo stato e aspetta la risposta,
/// `installa` fa il piano (e fa vedere da sé gli stati di avanzamento, che non aspettano risposte), `salva` scrive nel profilo le funzioni che il creator
/// ha cambiato. Quando non manca più niente, o il creator va avanti, torna. Un'installazione annullata riporta al piano; una fallita lo dice e aspetta.
pub fn computer_pronto(
    computer: impl Fn() -> Computer,
    iniziali: Funzioni,
    mut piano_per: impl FnMut(&Funzioni) -> Piano,
    mut chiedi: impl FnMut(StatoComputer) -> Risposta,
    mut installa: impl FnMut(&Piano, &Funzioni) -> Result<(), String>,
    mut salva: impl FnMut(&Funzioni) -> Result<(), String>,
) -> Result<(), String> {
    let mut scelte = iniziali;
    let mut errore: Option<String> = None;
    let mut provato_da_solo = false;
    loop {
        let piano = piano_per(&scelte);
        if piano.voci.is_empty() {
            return salva(&scelte);
        }
        // Mancano solo i pacchetti del codice (un aggiornamento che cambia un lockfile): non c'è niente da scegliere, si preparano.
        if !provato_da_solo && piano.voci.iter().all(|v| matches!(v.lavoro, Lavoro::PacchettiJs(_))) {
            provato_da_solo = true;
            if let Err(e) = installa(&piano, &scelte) {
                errore = (e != "annullato").then_some(e);
            }
            continue;
        }
        let fase = if errore.is_some() { "errore" } else { "piano" };
        // Il disco si rilegge a ogni giro: dopo un errore o un riavvio lo spazio libero non è più quello di prima.
        match chiedi(vista(fase, &computer(), &scelte, &piano, &BTreeMap::new(), errore.take())) {
            Risposta::Funzioni(nuove) => scelte.0.extend(nuove),
            Risposta::Continua => return Ok(()),
            Risposta::Prepara => {
                salva(&scelte)?;
                match installa(&piano, &scelte) {
                    Ok(()) => {}
                    // Fermata dal creator: torna al piano, con ciò che era già arrivato.
                    Err(e) if e == "annullato" => {}
                    Err(e) => errore = Some(e),
                }
            }
        }
    }
}

/// Aggiorna l'avanzamento di ogni voce con un evento.
pub fn applica(avanzamento: &mut BTreeMap<String, Progresso>, evento: &Evento) {
    match evento {
        Evento::Inizia(id) => {
            avanzamento.insert(id.clone(), Progresso { stato: "in corso", ..Default::default() });
        }
        Evento::Avanza { id, fatti, totale } => {
            let p = avanzamento.entry(id.clone()).or_default();
            (p.stato, p.fatti, p.totale) = ("in corso", *fatti, *totale);
        }
        Evento::Riga { id, testo } => {
            avanzamento.entry(id.clone()).or_default().riga = Some(testo.clone());
        }
        Evento::Fatta(id) => {
            let p = avanzamento.entry(id.clone()).or_default();
            (p.stato, p.fatti) = ("fatta", p.totale);
        }
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use manifesto::{Archivio, Elemento, Estratto, Tipo};
    use piano::prove::{computer, luoghi, Finte};
    use piano::{Gruppo, Voce};
    use scarica::prove::{server, sha_di};
    use std::io::Write;

    fn zip_con(nome: &str, contenuto: &[u8]) -> Vec<u8> {
        let mut dati = std::io::Cursor::new(Vec::new());
        let mut z = zip::ZipWriter::new(&mut dati);
        z.start_file(nome, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(contenuto).unwrap();
        z.finish().unwrap();
        dati.into_inner()
    }

    fn voce_archivio(id: &str, zip: &[u8], url: &str, estratto: &str, a: &str) -> Voce {
        let e = Elemento {
            id: id.into(),
            nome: id.into(),
            scopo: "serve".into(),
            scopo_en: "needed".into(),
            funzione: None,
            licenza: "MIT".into(),
            licenza_en: "MIT".into(),
            fonte: "https://esempio.it".into(),
            tipo: Tipo::Archivio(Archivio { url: url.into(), sha256: sha_di(zip), dimensione: zip.len() as u64, estrai: vec![Estratto { da: estratto.into(), a: a.into() }], cartella: None }),
        };
        Voce { id: id.into(), nome: id.into(), scopo: "serve".into(), funzione: None, licenza: "MIT".into(), fonte: "https://esempio.it".into(), peso: e.peso(), lavoro: Lavoro::Elemento(Box::new(e)), ordine: 1 }
    }

    fn tutte_accese() -> Funzioni {
        Funzioni::dal_profilo(&serde_json::json!({}))
    }

    #[test]
    fn le_voci_si_fanno_in_ordine_con_gli_eventi_e_l_avanzamento_le_segue() {
        let (z1, z2) = (zip_con("uno.exe", b"1"), zip_con("due.exe", b"22"));
        let (u1, _) = server(z1.clone(), None, false);
        let (u2, _) = server(z2.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let piano = Piano { voci: vec![voce_archivio("uno", &z1, &u1.replace("/file", "/uno.zip"), "uno.exe", "bin/uno.exe"), voce_archivio("due", &z2, &u2.replace("/file", "/due.zip"), "due.exe", "bin/due.exe")], python: SceltaPython::DelComputer, avvisi: vec![] };
        let mut eventi = Vec::new();
        let mut avanzamento = BTreeMap::new();
        esegui_piano(&piano, &tutte_accese(), &Dove { luoghi: &l, percorso: OsStr::new(""), hf: "http://x", sonde: &Finte::default() }, &AtomicBool::new(false), &mut |e| {
            applica(&mut avanzamento, &e);
            eventi.push(e);
        })
        .unwrap();
        let sequenza: Vec<String> = eventi
            .iter()
            .filter_map(|e| match e {
                Evento::Inizia(id) => Some(format!("inizia {id}")),
                Evento::Fatta(id) => Some(format!("fatta {id}")),
                _ => None,
            })
            .collect();
        assert_eq!(sequenza, ["inizia uno", "fatta uno", "inizia due", "fatta due"]);
        assert!(l.bin().join("uno.exe").is_file() && l.bin().join("due.exe").is_file());
        assert_eq!(avanzamento["uno"].stato, "fatta");
        assert_eq!((avanzamento["due"].fatti, avanzamento["due"].totale), (z2.len() as u64, z2.len() as u64));
    }

    #[test]
    fn alla_prima_voce_che_non_riesce_si_ferma_e_dice_quale() {
        let z1 = zip_con("uno.exe", b"1");
        let (u1, _) = server(z1.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let mut sbagliata = voce_archivio("uno", &z1, &u1.replace("/file", "/uno.zip"), "uno.exe", "bin/uno.exe");
        if let Lavoro::Elemento(e) = &mut sbagliata.lavoro {
            if let Tipo::Archivio(a) = &mut e.tipo {
                a.sha256 = sha_di(b"altro");
            }
        }
        sbagliata.nome = "Il programma uno".into();
        let dopo = voce_archivio("due", &z1, &u1.replace("/file", "/due.zip"), "uno.exe", "bin/due.exe");
        let piano = Piano { voci: vec![sbagliata, dopo], python: SceltaPython::DelComputer, avvisi: vec![] };
        let mut inizi = 0;
        let errore = esegui_piano(&piano, &tutte_accese(), &Dove { luoghi: &l, percorso: OsStr::new(""), hf: "http://x", sonde: &Finte::default() }, &AtomicBool::new(false), &mut |e| inizi += usize::from(matches!(e, Evento::Inizia(_)))).unwrap_err();
        assert!(errore.starts_with("Il programma uno: ") && errore.contains("non è quello atteso"), "{errore}");
        assert_eq!(inizi, 1);
        assert!(!l.bin().join("due.exe").exists());
    }

    #[test]
    fn dopo_python_si_controlla_che_l_ambiente_sappia_importare_tutto() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let uv = t.path().join("uv.cmd");
        std::fs::write(&uv, "@echo off\r\nexit /b 0\r\n").unwrap();
        std::fs::create_dir_all(l.bin()).unwrap();
        std::fs::copy(&uv, l.bin().join("uv.exe")).unwrap();
        let python = Voce { id: "python".into(), nome: "Python".into(), scopo: "x".into(), funzione: None, licenza: "x".into(), fonte: "x".into(), peso: 1, lavoro: Lavoro::Python(vec![Gruppo { pacchetti: vec!["x".into()], indice: None }]), ordine: 3 };
        let piano = Piano { voci: vec![python], python: SceltaPython::DaPreparare, avvisi: vec![] };
        // Il finto uv.exe è un file di testo: non parte, e l'errore lo dice con il nome della voce.
        let errore = esegui_piano(&piano, &tutte_accese(), &Dove { luoghi: &l, percorso: OsStr::new(""), hf: "http://x", sonde: &Finte::default() }, &AtomicBool::new(false), &mut |_| {}).unwrap_err();
        assert!(errore.starts_with("Python: "), "{errore}");
    }

    #[test]
    fn annullare_si_dice_con_una_parola_sola_e_non_come_un_errore_della_voce() {
        // Dati che l'archivio non comprime: lo scarico deve durare abbastanza da essere fermato.
        let mut seme = 12345u32;
        let casuali: Vec<u8> = (0..3_000_000).map(|_| { seme = seme.wrapping_mul(1_103_515_245).wrapping_add(12345); (seme >> 16) as u8 }).collect();
        let z1 = zip_con("uno.exe", &casuali);
        let (u1, _) = server(z1.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        let piano = Piano { voci: vec![voce_archivio("uno", &z1, &u1.replace("/file", "/uno.zip"), "uno.exe", "bin/uno.exe")], python: SceltaPython::DelComputer, avvisi: vec![] };
        let annulla = AtomicBool::new(false);
        let esito = esegui_piano(&piano, &tutte_accese(), &Dove { luoghi: &l, percorso: OsStr::new(""), hf: "http://x", sonde: &Finte::default() }, &annulla, &mut |e| {
            if matches!(e, Evento::Avanza { fatti, .. } if fatti > 200_000) {
                annulla.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        });
        assert_eq!(esito, Err("annullato".into()));
    }

    #[test]
    fn la_vista_dice_cosa_si_scarica_quanto_pesa_e_se_il_disco_basta() {
        let z = zip_con("a.exe", b"x");
        let piano = Piano { voci: vec![voce_archivio("uno", &z, "http://x/uno.zip", "a.exe", "bin/a.exe")], python: SceltaPython::DelComputer, avvisi: vec!["un avviso".into()] };
        let mut c = computer(true);
        c.disco_libero_mb = 5000;
        let s = vista("piano", &c, &tutte_accese(), &piano, &BTreeMap::new(), None);
        assert_eq!(s.fase, "piano");
        assert_eq!(s.funzioni.len(), 6);
        assert!(s.funzioni.iter().all(|f| f.attiva));
        assert_eq!((s.voci[0].stato, s.voci[0].licenza.as_str()), ("attesa", "MIT"));
        assert_eq!((s.servono_mb, s.libero_mb, s.spazio_ok), (1024, 5000, true));
        assert_eq!(s.avvisi, ["un avviso"]);
        c.disco_libero_mb = 100;
        assert!(!vista("piano", &c, &tutte_accese(), &piano, &BTreeMap::new(), None).spazio_ok);
        // Una funzione spenta si vede spenta.
        let spenta = Funzioni::dal_profilo(&serde_json::json!({ "motori": { "sagoma": { "attiva": false } } }));
        let s = vista("piano", &c, &spenta, &piano, &BTreeMap::new(), None);
        assert!(!s.funzioni.iter().find(|f| f.id == "sagoma").unwrap().attiva);
    }

    #[test]
    fn gli_eventi_riempiono_l_avanzamento_e_una_voce_fatta_ha_tutto_scaricato() {
        let mut a = BTreeMap::new();
        applica(&mut a, &Evento::Inizia("x".into()));
        applica(&mut a, &Evento::Avanza { id: "x".into(), fatti: 50, totale: 200 });
        applica(&mut a, &Evento::Riga { id: "x".into(), testo: "Resolved 6 packages".into() });
        assert_eq!(a["x"], Progresso { stato: "in corso", fatti: 50, totale: 200, riga: Some("Resolved 6 packages".into()) });
        applica(&mut a, &Evento::Fatta("x".into()));
        assert_eq!((a["x"].stato, a["x"].fatti), ("fatta", 200));
    }

    /// Fase, voci e messaggio di uno stato mostrato.
    type Mostrato = (String, Vec<String>, Option<String>);

    /// Il creator finto: risponde in ordine, e il giro registra ciò che gli si mostra, ciò che si installa e ciò che si salva.
    #[derive(Default)]
    struct Giro {
        risposte: RefCell<std::collections::VecDeque<Risposta>>,
        mostrati: RefCell<Vec<Mostrato>>,
        installati: RefCell<Vec<Vec<String>>>,
        salvati: RefCell<Vec<Funzioni>>,
        esiti: RefCell<std::collections::VecDeque<Result<(), String>>>,
        mancanti: RefCell<Vec<&'static str>>,
    }

    impl Giro {
        fn nuovo(risposte: Vec<Risposta>, esiti: Vec<Result<(), String>>, mancanti: &[&'static str]) -> Giro {
            Giro { risposte: RefCell::new(risposte.into()), esiti: RefCell::new(esiti.into()), mancanti: RefCell::new(mancanti.to_vec()), ..Default::default() }
        }

        fn piano_per(&self, scelte: &Funzioni) -> Piano {
            // Manca ciò che serve a una funzione accesa; «base» serve sempre. Dopo un'installazione riuscita non manca più niente.
            let voci = self
                .mancanti
                .borrow()
                .iter()
                .filter(|f| **f == "base" || f.starts_with("js-") || scelte.attiva(f))
                .map(|f| Voce { id: (*f).into(), nome: (*f).into(), scopo: "x".into(), funzione: None, licenza: "MIT".into(), fonte: "https://x".into(), peso: MB, lavoro: if f.starts_with("js-") { Lavoro::PacchettiJs((*f).into()) } else { Lavoro::Chromium }, ordine: 1 })
                .collect();
            Piano { voci, python: SceltaPython::DelComputer, avvisi: vec![] }
        }

        fn esegui(&self, scelte: Funzioni) -> Result<(), String> {
            let c = computer(true);
            computer_pronto(
                || c.clone(),
                scelte,
                |s| self.piano_per(s),
                |stato| {
                    self.mostrati.borrow_mut().push((stato.fase.to_owned(), stato.voci.iter().map(|v| v.id.clone()).collect(), stato.messaggio));
                    self.risposte.borrow_mut().pop_front().expect("la pagina ha chiesto una risposta in più")
                },
                |piano, _| {
                    self.installati.borrow_mut().push(piano.voci.iter().map(|v| v.id.clone()).collect());
                    let esito = self.esiti.borrow_mut().pop_front().unwrap_or(Ok(()));
                    if esito.is_ok() {
                        self.mancanti.borrow_mut().clear();
                    }
                    esito
                },
                |s| {
                    self.salvati.borrow_mut().push(s.clone());
                    Ok(())
                },
            )
        }
    }

    #[test]
    fn se_non_manca_niente_la_pagina_non_si_apre() {
        let g = Giro::nuovo(vec![], vec![], &[]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert!(g.mostrati.borrow().is_empty() && g.installati.borrow().is_empty());
    }

    #[test]
    fn accendere_e_spegnere_funzioni_cambia_cosa_si_scarica_e_prepara_scrive_la_scelta_e_scarica() {
        let g = Giro::nuovo(vec![Risposta::Funzioni([("sagoma".to_owned(), false)].into()), Risposta::Prepara], vec![], &["base", "sagoma", "dettatura"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        let mostrati = g.mostrati.borrow();
        assert_eq!(mostrati[0].1, ["base", "sagoma", "dettatura"]);
        assert_eq!(mostrati[1].1, ["base", "dettatura"]);
        // Ciò che si scarica è ciò che la scelta vuole, e la scelta va nel profilo prima di scaricare.
        assert_eq!(*g.installati.borrow(), [vec!["base".to_owned(), "dettatura".to_owned()]]);
        assert!(!g.salvati.borrow()[0].attiva("sagoma"));
        // Finito, non manca più niente: la scelta si salva ancora (se non è cambiata la scrittura non fa niente) e il giro finisce.
        assert_eq!(g.salvati.borrow().len(), 2);
    }

    #[test]
    fn spegnere_tutto_cio_che_mancava_basta_a_finire_e_la_scelta_resta_nel_profilo() {
        let g = Giro::nuovo(vec![Risposta::Funzioni([("sagoma".to_owned(), false)].into())], vec![], &["sagoma"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert!(g.installati.borrow().is_empty());
        assert!(!g.salvati.borrow().last().unwrap().attiva("sagoma"));
    }

    #[test]
    fn se_mancano_solo_i_pacchetti_del_codice_si_preparano_senza_chiedere() {
        // Dopo un aggiornamento che cambia un lockfile non c'è niente da scegliere: senza i pacchetti l'app non parte.
        let g = Giro::nuovo(vec![], vec![], &["js-server", "js-animazioni"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert!(g.mostrati.borrow().is_empty());
        assert_eq!(*g.installati.borrow(), [vec!["js-server".to_owned(), "js-animazioni".to_owned()]]);
    }

    #[test]
    fn se_i_pacchetti_del_codice_non_si_preparano_la_pagina_lo_dice_e_si_riprova() {
        let g = Giro::nuovo(vec![Risposta::Prepara], vec![Err("niente rete".into())], &["js-server"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert_eq!(*g.mostrati.borrow(), [("errore".to_owned(), vec!["js-server".to_owned()], Some("niente rete".to_owned()))]);
        assert_eq!(g.installati.borrow().len(), 2);
    }

    #[test]
    fn coi_pacchetti_del_codice_e_una_funzione_da_scegliere_si_chiede() {
        let g = Giro::nuovo(vec![Risposta::Prepara], vec![], &["js-server", "sagoma"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert_eq!(g.mostrati.borrow()[0].0, "piano");
    }

    #[test]
    fn andare_avanti_lascia_tutto_com_e_senza_scrivere_niente() {
        let g = Giro::nuovo(vec![Risposta::Continua], vec![], &["base"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        assert!(g.salvati.borrow().is_empty() && g.installati.borrow().is_empty());
    }

    #[test]
    fn un_errore_si_mostra_con_la_sua_frase_e_si_puo_riprovare() {
        let g = Giro::nuovo(vec![Risposta::Prepara, Risposta::Prepara], vec![Err("Python: non c'è rete".into())], &["base"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        let mostrati = g.mostrati.borrow();
        assert_eq!((mostrati[0].0.as_str(), mostrati[0].2.as_deref()), ("piano", None));
        assert_eq!((mostrati[1].0.as_str(), mostrati[1].2.as_deref()), ("errore", Some("Python: non c'è rete")));
        assert_eq!(g.installati.borrow().len(), 2);
    }

    #[test]
    fn un_errore_e_poi_andare_avanti_non_blocca_l_avvio() {
        let g = Giro::nuovo(vec![Risposta::Prepara, Risposta::Continua], vec![Err("non c'è rete".into())], &["base"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
    }

    #[test]
    fn annullare_riporta_al_piano_senza_dire_che_e_un_errore() {
        let g = Giro::nuovo(vec![Risposta::Prepara, Risposta::Continua], vec![Err("annullato".into())], &["base"]);
        assert_eq!(g.esegui(tutte_accese()), Ok(()));
        let mostrati = g.mostrati.borrow();
        assert_eq!((mostrati[1].0.as_str(), mostrati[1].2.as_deref()), ("piano", None));
    }

    #[test]
    fn la_vista_dice_i_nomi_delle_funzioni_e_degli_errori_nella_lingua_in_uso() {
        let piano = Piano { voci: vec![], python: SceltaPython::DelComputer, avvisi: vec![] };
        let nomi = |lingua| crate::lingua::con(lingua, || vista("piano", &computer(true), &tutte_accese(), &piano, &BTreeMap::new(), None).funzioni.into_iter().map(|f| f.nome).collect::<Vec<_>>());
        let frasi = |lingua| crate::lingua::con(lingua, || vista("piano", &computer(true), &tutte_accese(), &piano, &BTreeMap::new(), None).funzioni.into_iter().map(|f| f.cosa_fa).collect::<Vec<_>>());
        assert!(frasi(crate::lingua::Lingua::It)[1].contains("non commerciale") && frasi(crate::lingua::Lingua::En)[1].contains("non-commercial"));
        let it = nomi(crate::lingua::Lingua::It);
        let en = nomi(crate::lingua::Lingua::En);
        assert_eq!(it[0], "Capire cosa dico");
        assert_eq!(en[0], "Understanding what I say");
        assert_eq!(en.len(), 6);
        assert!(en.iter().zip(&it).all(|(e, i)| e != i));
    }

    #[test]
    fn l_errore_di_una_voce_esce_in_inglese_con_il_nome_della_voce() {
        let t = tempfile::tempdir().unwrap();
        let l = luoghi(t.path());
        std::fs::create_dir_all(l.bin()).unwrap();
        std::fs::write(l.bin().join("uv.exe"), "non è un programma").unwrap();
        let python = Voce { id: "python".into(), nome: "Python and its packages".into(), scopo: "x".into(), funzione: None, licenza: "x".into(), fonte: "x".into(), peso: 1, lavoro: Lavoro::Python(vec![Gruppo { pacchetti: vec!["x".into()], indice: None }]), ordine: 3 };
        let piano = Piano { voci: vec![python], python: SceltaPython::DaPreparare, avvisi: vec![] };
        let dove = Dove { luoghi: &l, percorso: OsStr::new(""), hf: "http://x", sonde: &Finte::default() };
        let errore = crate::lingua::con(crate::lingua::Lingua::En, || esegui_piano(&piano, &tutte_accese(), &dove, &AtomicBool::new(false), &mut |_| {}).unwrap_err());
        assert!(errore.starts_with("Python and its packages: I can't start "), "{errore}");
    }
}
