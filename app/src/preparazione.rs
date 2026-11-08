//! I passi dell'avvio che aspettano il creator: la pagina d'attesa mostra cosa manca e cosa fare, e l'avvio prosegue quando lui risponde.

use crate::aggiornamento::{self, dopo_il_si, stato_d_errore, Fallito, Passo, Proposta, StatoAggiornamento};
use crate::claude::{self, StatoClaude};
use crate::codice;
use crate::lingua::t;
use crate::computer::installa::{Evento, SondeVere, HUGGING_FACE};
use crate::computer::piano::{calcola, Funzioni, Luoghi, ModelliScelti, SceltaPython};
use crate::computer::{self, applica, computer_pronto, esegui_piano, hw, manifesto, profilo, vista, Dove, Progresso, Risposta};
use crate::{imposta_stato, Interno, Stato};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Cosa il creator risponde, dalla pagina d'attesa, a un passo che lo aspetta.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Azione {
    /// Ha sistemato (o crede di aver sistemato): si guarda di nuovo.
    Ricontrolla,
    /// Vuole fare l'accesso a Claude Code.
    Accedi,
    /// Va avanti così com'è.
    Continua,
    /// Ha acceso o spento delle funzioni (`{ "sagoma": false, … }`): si ricalcola cosa si scarica.
    Funzioni(BTreeMap<String, bool>),
    /// Prepara il computer con le funzioni scelte.
    Prepara,
    /// Ferma ciò che si sta scaricando.
    Annulla,
    /// Installa la versione nuova.
    Aggiorna,
}

/// Il passo che aspetta riceve da qui le risposte della pagina.
#[derive(Default)]
pub struct Risposte {
    mittente: std::sync::Mutex<Option<mpsc::Sender<Azione>>>,
    /// Si accende con «Annulla»: lo scarico in corso lo guarda e si ferma.
    annulla: Arc<AtomicBool>,
}

impl Risposte {
    /// Una risposta che nessun passo aspetta si perde: la pagina non ha più niente da rispondere. «Annulla» non è una risposta ma uno stop a ciò che gira.
    pub fn invia(&self, azione: Azione) {
        if azione == Azione::Annulla {
            self.annulla.store(true, Ordering::SeqCst);
        } else if let Some(mittente) = self.mittente.lock().unwrap().as_ref() {
            let _ = mittente.send(azione);
        }
    }

    fn apri(&self) -> mpsc::Receiver<Azione> {
        let (mittente, ricevitore) = mpsc::channel();
        *self.mittente.lock().unwrap() = Some(mittente);
        ricevitore
    }

    fn chiudi(&self) {
        *self.mittente.lock().unwrap() = None;
    }
}

/// Mostra `stato` e aspetta che il creator risponda.
fn chiedi(app: &AppHandle, stato: Stato) -> Azione {
    let risposte = &app.state::<Interno>().risposte;
    let ricevitore = risposte.apri();
    imposta_stato(app, stato);
    let azione = ricevitore.recv();
    risposte.chiudi();
    // La pagina non risponde più solo se l'app si sta chiudendo: l'avvio non ha più niente da fare.
    azione.unwrap_or(Azione::Continua)
}

/// Mostra lo stato dell'aggiornamento e aspetta se il creator lo vuole (`true`: «Aggiorna ora», o «Riprova» dopo un errore) o no (`false`, anche se la pagina si chiude).
fn chiedi_aggiornamento(app: &AppHandle, stato: StatoAggiornamento) -> bool {
    let risposte = &app.state::<Interno>().risposte;
    let ricevitore = risposte.apri();
    imposta_stato(app, Stato { fase: "aggiornamento".into(), aggiornamento: Some(stato), ..Default::default() });
    let vuole = loop {
        match ricevitore.recv() {
            Ok(Azione::Aggiorna) => break true,
            Ok(Azione::Continua) | Err(_) => break false,
            Ok(_) => {}
        }
    };
    risposte.chiudi();
    vuole
}

/// Scrive `nome` nella cartella dei registri dell'app (`%LOCALAPPDATA%\dev.mango.animation\logs\`): un errore che non si può dire al creator, ma che chi lo cerca deve trovare.
fn scrivi_nel_registro(app: &AppHandle, nome: &str, testo: &str) {
    let Ok(file) = app.path().app_log_dir().map(|c| c.join(nome)) else { return };
    let _ = std::fs::create_dir_all(file.parent().unwrap_or(Path::new("")));
    let _ = std::fs::write(file, format!("{testo}
"));
}

/// Scarica e installa la versione che il creator ha voluto, mostrando l'avanzamento. Su Windows l'app si chiude prima di arrivare in fondo: arrivarci è un errore.
fn scarica_e_installa(app: &AppHandle, proposta: &Proposta, base: &StatoAggiornamento) -> Result<(), Fallito> {
    let mostra = |fatti: u64, totale: u64| {
        imposta_stato(app, Stato { fase: "aggiornamento".into(), aggiornamento: Some(StatoAggiornamento { fase: "scarico".into(), fatti, totale, ..base.clone() }), ..Default::default() })
    };
    mostra(0, 0);
    let mut ultimo: Option<Instant> = None;
    let pacchetto = aggiornamento::scarica(proposta, |fatti, totale| {
        if ultimo.is_none_or(|t| t.elapsed() > Duration::from_millis(200)) {
            ultimo = Some(Instant::now());
            mostra(fatti, totale);
        }
    })
    .map_err(|dettaglio| Fallito { passo: Passo::Scarico, dettaglio })?;
    aggiornamento::installa(proposta, &pacchetto).map_err(|dettaglio| Fallito { passo: Passo::Installazione, dettaglio })?;
    Err(Fallito { passo: Passo::NonSiChiude, dettaglio: String::new() })
}

/// Questa è l'app installata (il suo codice sta in `codice/` accanto all'eseguibile), non quella di chi sviluppa.
fn e_l_app_installata(radice: &Path) -> bool {
    std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)).is_some_and(|cartella| aggiornamento::installata(radice, &cartella))
}

/// Dopo un aggiornamento `codice/` ha solo i file della versione nuova (`docs/APP.md`, «Installer e aggiornamenti»). Un errore non ferma l'avvio: si scrive in `codice.log`.
pub fn codice_in_ordine(app: &AppHandle, radice: &Path) {
    if !e_l_app_installata(radice) {
        return;
    }
    let Ok(dati) = app.path().app_local_data_dir() else { return };
    if let Err(e) = codice::in_ordine(radice, &dati.join("codice-in-ordine")) {
        scrivi_nel_registro(app, "codice.log", &e);
    }
}

/// Una versione più nuova, se c'è: la propone prima di far partire lo studio (così nessun lavoro in corso si perde) e, se il creator vuole, la installa: l'app si chiude e l'installatore
/// la riapre. Solo l'app installata si aggiorna. Un controllo che non riesce (niente rete, nessuna uscita pubblicata) non ferma l'avvio e non dice niente: si scrive in `aggiornamento.log`.
/// Dopo il sì invece un errore si dice, con il modo di riprovare o di continuare con la versione installata.
pub fn aggiornamento_del_prodotto(app: &AppHandle, radice: &Path) {
    if !e_l_app_installata(radice) {
        return;
    }
    imposta_stato(app, crate::attesa(0, t("Cerco una versione nuova", "Looking for a new version")));
    let proposta = match aggiornamento::cerca(app) {
        Ok(Some(proposta)) => proposta,
        Ok(None) => return,
        Err(e) => return scrivi_nel_registro(app, "aggiornamento.log", &format!("controllo: {e}")),
    };
    let base = proposta.stato.clone();
    if !chiedi_aggiornamento(app, base.clone()) {
        return;
    }
    dopo_il_si(
        proposta,
        || aggiornamento::cerca(app),
        |proposta| scarica_e_installa(app, proposta, &base),
        |fallito| chiedi_aggiornamento(app, stato_d_errore(&base, fallito)),
        |fallito| scrivi_nel_registro(app, "aggiornamento.log", &format!("{:?}: {}", fallito.passo, fallito.dettaglio)),
    );
}

/// Cosa il computer ha dato all'avvio: le variabili con cui accendere il server (il Python e i programmi che ha preparato l'app).
pub struct Preparato {
    pub ambiente: Vec<(OsString, OsString)>,
    /// Il Python dell'ambiente dell'app, se è quello che motore e dettatura devono usare.
    pub python: Option<PathBuf>,
}

fn percorso_con(luoghi: &Luoghi, base: &std::ffi::OsStr) -> OsString {
    let cartelle = luoghi.cartelle_del_percorso().into_iter().chain(std::env::split_paths(base));
    std::env::join_paths(cartelle).unwrap_or_else(|_| base.to_owned())
}

/// Il computer pronto (`docs/APP.md`): vede cosa c'è e cosa manca per le funzioni accese, lo fa vedere al creator con peso e licenza di ciascuno, e scarica con
/// avanzamento e verifica. Se non manca niente non mostra niente. Torna le variabili per il server.
pub fn computer_del_creator(app: &AppHandle, radice: &Path, lavoro: &Path) -> Result<Preparato, String> {
    let dati = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("computer");
    let luoghi = Luoghi::dell_utente(dati, radice.to_path_buf(), &|nome| std::env::var(nome).ok());
    let base = std::env::var_os("PATH").unwrap_or_default();
    let variabile_python = std::env::var("MANGO_ANIMATION_PYTHON").is_ok_and(|v| !v.is_empty());
    let profilo_iniziale = profilo::leggi(lavoro)?;
    let stile_di_serie = profilo::leggi_stile(&radice.join("stile.json"))?;
    let stile_del_creator = profilo::leggi_stile(&lavoro.join("stile.json"))?;
    let computer = hw::leggi(&luoghi.dati);
    let modelli = ModelliScelti::da(&profilo_iniziale, &stile_del_creator, &stile_di_serie, computer.ha_scheda_per_cuda());
    let elementi = manifesto::elementi();
    let piano_per = |funzioni: &Funzioni| calcola(&luoghi, &SondeVere { percorsi: percorso_con(&luoghi, &base) }, &computer, funzioni, &modelli, variabile_python, &elementi);

    computer_pronto(
        &computer,
        Funzioni::dal_profilo(&profilo_iniziale),
        &piano_per,
        |stato| chiedi_computer(app, stato),
        |piano, funzioni| {
            let risposte = &app.state::<Interno>().risposte;
            risposte.annulla.store(false, Ordering::SeqCst);
            let sonde = SondeVere { percorsi: percorso_con(&luoghi, &base) };
            let (mut avanzamento, mut ultimo): (BTreeMap<String, Progresso>, Option<Instant>) = (BTreeMap::new(), None);
            let mostra = |avanzamento: &BTreeMap<String, Progresso>| {
                imposta_stato(app, Stato { fase: "computer".into(), computer: Some(vista("scarico", &computer, funzioni, piano, avanzamento, None)), ..Default::default() })
            };
            mostra(&avanzamento);
            let percorso = percorso_con(&luoghi, &base);
            esegui_piano(piano, funzioni, &Dove { luoghi: &luoghi, percorso: &percorso, hf: HUGGING_FACE, sonde: &sonde }, &risposte.annulla, &mut |e| {
                applica(&mut avanzamento, &e);
                // I byte arrivano a centinaia al secondo: la pagina li vede cinque volte al secondo.
                if !matches!(e, Evento::Avanza { .. }) || ultimo.is_none_or(|t| t.elapsed() > Duration::from_millis(200)) {
                    ultimo = Some(Instant::now());
                    mostra(&avanzamento);
                }
            })
        },
        |funzioni| scrivi_le_scelte(lavoro, funzioni),
    )?;

    let finale = piano_per(&Funzioni::dal_profilo(&profilo::leggi(lavoro)?));
    let python = (finale.python == SceltaPython::DellApp).then(|| luoghi.python_dell_app());
    let mut ambiente: Vec<(OsString, OsString)> = vec![("PATH".into(), percorso_con(&luoghi, &base))];
    if let Some(p) = &python {
        ambiente.push(("MANGO_ANIMATION_PYTHON".into(), p.clone().into_os_string()));
    }
    Ok(Preparato { ambiente, python })
}

/// Nel profilo vanno solo le funzioni che il creator ha cambiato rispetto a ciò che il profilo già dice.
fn scrivi_le_scelte(lavoro: &Path, scelte: &Funzioni) -> Result<(), String> {
    let attuali = Funzioni::dal_profilo(&profilo::leggi(lavoro)?);
    let cambiate: BTreeMap<String, bool> = scelte.0.iter().filter(|(f, a)| attuali.0.get(*f) != Some(*a)).map(|(f, a)| (f.clone(), *a)).collect();
    if cambiate.is_empty() {
        Ok(())
    } else {
        profilo::scrivi_funzioni(lavoro, &cambiate)
    }
}

/// Mostra lo stato del computer e aspetta una risposta che lo riguarda; le altre (un «Ricontrolla» di Claude Code arrivato tardi) si lasciano cadere.
fn chiedi_computer(app: &AppHandle, stato: computer::StatoComputer) -> Risposta {
    let risposte = &app.state::<Interno>().risposte;
    let ricevitore = risposte.apri();
    imposta_stato(app, Stato { fase: "computer".into(), computer: Some(stato), ..Default::default() });
    let risposta = loop {
        match ricevitore.recv() {
            Ok(Azione::Funzioni(scelte)) => break Risposta::Funzioni(scelte),
            Ok(Azione::Prepara) => break Risposta::Prepara,
            Ok(Azione::Continua) | Err(_) => break Risposta::Continua,
            Ok(_) => {}
        }
    };
    risposte.chiudi();
    risposta
}

/// Il Claude Code del creator, controllato e, se non va, spiegato (`docs/APP.md`). Torna il programma da dare alla chat, o `None` se non c'è e il creator
/// va avanti senza.
pub fn claude_del_creator(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let percorsi = std::env::var_os("PATH").unwrap_or_default();
    let indicato = std::env::var(claude::VARIABILE).ok();
    let casa = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
    claude_pronto(
        || claude::trova(indicato.as_deref(), &percorsi, casa.as_deref(), appdata.as_deref()),
        claude::esamina,
        claude::accedi,
        |stato| chiedi(app, Stato { fase: "claude".into(), claude: Some(stato), ..Default::default() }),
    )
}

/// Il giro dei controlli, senza finestra: `trova`, `esamina` e `accedi` sono quelli veri o quelli finti di una prova, `chiedi` mostra lo stato e aspetta.
fn claude_pronto(
    trova: impl Fn() -> Result<Option<PathBuf>, String>,
    esamina: impl Fn(&Path) -> StatoClaude,
    accedi: impl Fn(&Path) -> Result<(), String>,
    mut chiedi: impl FnMut(StatoClaude) -> Azione,
) -> Result<Option<PathBuf>, String> {
    let mut avviso: Option<String> = None;
    loop {
        let programma = trova()?;
        let stato = match &programma {
            Some(p) => esamina(p),
            None => StatoClaude::default(),
        };
        if stato.pronto() {
            return Ok(programma);
        }
        // Un accesso che non è andato a buon fine si dice sopra lo stato di Claude Code, che nel frattempo si è riletto.
        let stato = StatoClaude { messaggio: avviso.take().or(stato.messaggio), ..stato };
        match chiedi(stato) {
            Azione::Ricontrolla => {}
            Azione::Accedi => {
                if let Some(p) = &programma {
                    avviso = accedi(p).err();
                }
            }
            // Un Claude Code che c'è ma non è collegato lo si dà alla chat lo stesso: sarà lei a dire che non è collegato.
            Azione::Continua => return Ok(programma),
            // Le risposte della pagina del computer non riguardano Claude Code.
            Azione::Funzioni(_) | Azione::Prepara | Azione::Annulla | Azione::Aggiorna => {}
        }
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::collections::VecDeque;

    fn programma() -> PathBuf {
        PathBuf::from(r"C:\claude\claude.exe")
    }

    fn pronto() -> StatoClaude {
        StatoClaude { trovato: true, collegato: true, versione: Some("2.1.318".into()), ..Default::default() }
    }

    fn non_collegato() -> StatoClaude {
        StatoClaude { trovato: true, versione: Some("2.1.318".into()), ..Default::default() }
    }

    /// Le risposte del creator in ordine, e gli stati che la pagina ha mostrato.
    struct Prova {
        risposte: RefCell<VecDeque<Azione>>,
        mostrati: RefCell<Vec<StatoClaude>>,
    }

    impl Prova {
        fn nuova(risposte: &[Azione]) -> Self {
            Prova { risposte: RefCell::new(risposte.iter().cloned().collect()), mostrati: RefCell::default() }
        }

        fn chiedi(&self, stato: StatoClaude) -> Azione {
            self.mostrati.borrow_mut().push(stato);
            self.risposte.borrow_mut().pop_front().expect("la pagina ha chiesto una risposta in più")
        }
    }

    #[test]
    fn se_claude_code_va_la_pagina_non_si_ferma_a_chiedere() {
        let p = Prova::nuova(&[]);
        let esito = claude_pronto(|| Ok(Some(programma())), |_| pronto(), |_| unreachable!(), |s| p.chiedi(s));
        assert_eq!(esito, Ok(Some(programma())));
        assert!(p.mostrati.borrow().is_empty());
    }

    #[test]
    fn se_manca_la_pagina_lo_dice_e_dopo_l_installazione_il_ricontrollo_lo_trova() {
        let p = Prova::nuova(&[Azione::Ricontrolla, Azione::Ricontrolla]);
        let giri = Cell::new(0);
        let trova = || {
            giri.set(giri.get() + 1);
            Ok((giri.get() >= 3).then(programma))
        };
        let esito = claude_pronto(trova, |_| pronto(), |_| unreachable!(), |s| p.chiedi(s));
        assert_eq!(esito, Ok(Some(programma())));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 2);
        assert!(mostrati.iter().all(|s| !s.trovato && s.percorso.is_none()));
    }

    #[test]
    fn se_non_e_collegato_l_accesso_lo_fa_claude_e_poi_si_ricontrolla() {
        let p = Prova::nuova(&[Azione::Accedi]);
        let acceduto = Cell::new(false);
        let esamina = |_: &Path| if acceduto.get() { pronto() } else { non_collegato() };
        let accedi = |_: &Path| {
            acceduto.set(true);
            Ok(())
        };
        let esito = claude_pronto(|| Ok(Some(programma())), esamina, accedi, |s| p.chiedi(s));
        assert_eq!(esito, Ok(Some(programma())));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati.len(), 1);
        assert!(mostrati[0].trovato && !mostrati[0].collegato);
    }

    #[test]
    fn un_accesso_che_non_riesce_si_dice_nella_pagina_di_dopo() {
        let p = Prova::nuova(&[Azione::Accedi, Azione::Continua]);
        let esito = claude_pronto(|| Ok(Some(programma())), |_| non_collegato(), |_| Err("L'accesso a Claude Code non è finito entro dieci minuti: riprova.".into()), |s| p.chiedi(s));
        assert_eq!(esito, Ok(Some(programma())));
        let mostrati = p.mostrati.borrow();
        assert_eq!(mostrati[0].messaggio, None);
        assert_eq!(mostrati[1].messaggio.as_deref(), Some("L'accesso a Claude Code non è finito entro dieci minuti: riprova."));
    }

    #[test]
    fn andare_avanti_senza_claude_code_non_da_alla_chat_un_programma_che_non_c_e() {
        let p = Prova::nuova(&[Azione::Continua]);
        assert_eq!(claude_pronto(|| Ok(None), |_| unreachable!(), |_| unreachable!(), |s| p.chiedi(s)), Ok(None));
    }

    #[test]
    fn una_variabile_che_indica_un_programma_che_non_c_e_e_un_errore_e_non_una_pagina_da_aspettare() {
        let p = Prova::nuova(&[]);
        let esito = claude_pronto(|| Err("Il programma indicato non c'è.".into()), |_| unreachable!(), |_| unreachable!(), |s| p.chiedi(s));
        assert_eq!(esito, Err("Il programma indicato non c'è.".into()));
        assert!(p.mostrati.borrow().is_empty());
    }

    #[test]
    fn la_risposta_che_nessuno_aspetta_si_perde_e_quella_attesa_arriva() {
        let risposte = Risposte::default();
        risposte.invia(Azione::Accedi);
        let ricevitore = risposte.apri();
        risposte.invia(Azione::Ricontrolla);
        assert_eq!(ricevitore.try_recv(), Ok(Azione::Ricontrolla));
        risposte.chiudi();
        risposte.invia(Azione::Accedi);
        assert!(ricevitore.try_recv().is_err());
    }
}
