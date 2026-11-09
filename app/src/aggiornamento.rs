//! Gli aggiornamenti automatici: all'avvio l'app chiede all'indirizzo degli aggiornamenti se c'è una versione più nuova, e se il creator vuole la scarica e la installa.
//! Il pacchetto è firmato con la chiave dell'updater di Tauri (non è un certificato a pagamento): l'app controlla la firma con la chiave pubblica scritta in `tauri.conf.json`.

use crate::lingua::t;
use crate::supervisor::CREATE_BREAKAWAY_FROM_JOB;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const ATTESA_DELLA_RISPOSTA: Duration = Duration::from_secs(15);

/// Com'è l'aggiornamento, per la pagina d'attesa.
#[derive(Clone, Serialize, Default, Debug, PartialEq)]
pub struct StatoAggiornamento {
    /// «proposta» (c'è una versione nuova), «scarico» (si sta scaricando) o «errore» (il creator aveva detto sì e non è andata: `messaggio` dice perché).
    pub fase: String,
    pub corrente: String,
    pub nuova: String,
    pub note: Option<String>,
    pub fatti: u64,
    pub totale: u64,
    pub messaggio: Option<String>,
}

/// L'app è quella installata (il suo codice sta in `codice/` accanto all'eseguibile): solo lei si aggiorna. L'eseguibile costruito da chi sviluppa sta dentro il suo repo e non va
/// sovrascritto da un installatore.
pub fn installata(radice: &Path, cartella_dell_eseguibile: &Path) -> bool {
    radice == cartella_dell_eseguibile.join("codice")
}

pub struct Proposta {
    pub stato: StatoAggiornamento,
    update: Update,
}

/// La variabile con cui una prova degli aggiornamenti indica un altro `latest.json`, prima di pubblicare (`docs/APP.md`, «Cosa si prova solo installando»).
pub const VARIABILE_INDIRIZZO_DI_PROVA: &str = "MANGO_ANIMATION_UPDATE_URL";

/// L'indirizzo di prova, se c'è: solo di questo computer (`127.0.0.1` o `localhost`), perché chi controlla gli aggiornamenti da un altro indirizzo decide cosa si installa.
/// Un valore vuoto è come se la variabile non ci fosse; uno di un altro computer o non scritto bene è un errore, non si cerca altrove di nascosto.
pub fn indirizzo_di_prova(valore: Option<&str>) -> Result<Option<Url>, String> {
    let Some(valore) = valore.filter(|v| !v.is_empty()) else { return Ok(None) };
    match Url::parse(valore) {
        Ok(url) if matches!(url.scheme(), "http" | "https") && matches!(url.host_str(), Some("127.0.0.1" | "localhost")) => Ok(Some(url)),
        _ => Err(t(
            format!("{variabile} vale «{valore}»: si accetta solo un indirizzo http o https su 127.0.0.1 o localhost", variabile = VARIABILE_INDIRIZZO_DI_PROVA),
            format!("{variabile} is «{valore}»: only an http or https address on 127.0.0.1 or localhost is accepted", variabile = VARIABILE_INDIRIZZO_DI_PROVA),
        )),
    }
}

/// C'è una versione nuova? Se l'indirizzo non risponde (nessuna rete, nessuna uscita pubblicata) o il manifesto non è scritto bene, l'errore va a chi chiama.
/// L'indirizzo è quello di `tauri.conf.json`, o quello della variabile di prova.
pub fn cerca<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Proposta>, String> {
    cerca_su(app, std::env::var(VARIABILE_INDIRIZZO_DI_PROVA).ok().as_deref())
}

/// Come `cerca`, con l'indirizzo di prova dato (vedi `indirizzo_di_prova`).
pub fn cerca_su<R: Runtime>(app: &AppHandle<R>, valore_di_prova: Option<&str>) -> Result<Option<Proposta>, String> {
    let mut costruttore = app.updater_builder().timeout(ATTESA_DELLA_RISPOSTA);
    if let Some(url) = indirizzo_di_prova(valore_di_prova)? {
        costruttore = costruttore.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let updater = costruttore.build().map_err(|e| e.to_string())?;
    let trovato = tauri::async_runtime::block_on(updater.check()).map_err(|e| e.to_string())?;
    Ok(trovato.map(|update| Proposta {
        stato: StatoAggiornamento { fase: "proposta".into(), corrente: update.current_version.clone(), nuova: update.version.clone(), note: update.body.clone().filter(|n| !n.trim().is_empty()), ..Default::default() },
        update,
    }))
}

/// Scarica l'installatore; `avanza` riceve i byte scaricati e il totale. Torna i byte solo se la loro firma è quella della chiave pubblica dell'app: un pacchetto non firmato, firmato con un'altra chiave o
/// alterato è un errore e non si installa.
pub fn scarica(proposta: &Proposta, mut avanza: impl FnMut(u64, u64)) -> Result<Vec<u8>, String> {
    let mut fatti = 0u64;
    tauri::async_runtime::block_on(proposta.update.download(
        |pezzo, totale| {
            fatti += pezzo as u64;
            avanza(fatti, totale.unwrap_or(0));
        },
        || {},
    ))
    .map_err(|e| e.to_string())
}

/// L'installatore NSIS in modalità passiva (`/P`), come aggiornamento (`/UPDATE`), e riapre l'app quando ha finito (`/R`).
const ARGOMENTI_DELL_INSTALLATORE: [&str; 3] = ["/P", "/UPDATE", "/R"];

/// Scrive l'installatore scaricato in `cartella`.
fn scrivi_installatore(cartella: &Path, versione: &str, pacchetto: &[u8]) -> Result<PathBuf, String> {
    let dove = cartella.join(format!("mango-animation-aggiornamento-{versione}"));
    let file = dove.join(format!("mango-animation-{versione}-setup.exe"));
    std::fs::create_dir_all(&dove).and_then(|_| std::fs::write(&file, pacchetto)).map_err(|e| format!("{}: {e}", file.display()))?;
    Ok(file)
}

/// Installa ciò che `scarica` ha dato e chiude l'app; l'installatore la riapre. Non si usa `update.install()` del plugin: lancia
/// l'installatore come figlio dell'app, dentro il giobbe con KILL_ON_JOB_CLOSE, e Windows lo ucciderebbe appena l'app esce.
/// Si fa all'avvio, prima del server: non ci sono altri processi dell'app da fermare. Se torna, è un errore.
pub fn installa(proposta: &Proposta, pacchetto: &[u8]) -> Result<(), String> {
    let file = scrivi_installatore(&std::env::temp_dir(), &proposta.update.version, pacchetto)?;
    Command::new(&file).args(ARGOMENTI_DELL_INSTALLATORE).creation_flags(CREATE_BREAKAWAY_FROM_JOB).spawn().map_err(|e| format!("{}: {e}", file.display()))?;
    std::process::exit(0)
}

/// Dove si è fermato un aggiornamento che il creator aveva voluto.
#[derive(Clone, Debug, PartialEq)]
pub enum Passo {
    /// Riprovando, il controllo della versione non è riuscito.
    Controllo,
    Scarico,
    Installazione,
    /// L'installatore è partito e l'app è ancora aperta.
    NonSiChiude,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Fallito {
    pub passo: Passo,
    /// Cosa ha detto l'updater: sta nel registro, non nella pagina.
    pub dettaglio: String,
}

impl Fallito {
    /// Il motivo per il creator, in parole semplici.
    pub fn frase(&self) -> String {
        match self.passo {
            Passo::Controllo => t(
                "Non riesco a controllare se la versione nuova c'è ancora. Controlla la connessione a internet e riprova.",
                "I can't check whether the new version is still there. Check your internet connection and try again.",
            ),
            Passo::Scarico => t(
                "La versione nuova non è arrivata intera o non è quella giusta. Controlla la connessione a internet e riprova.",
                "The new version did not arrive in full, or it is not the right one. Check your internet connection and try again.",
            ),
            Passo::Installazione => t(
                "Non sono riuscito a far partire l'installazione della versione nuova. Puoi riprovare, oppure continuare con la versione che hai.",
                "I could not start installing the new version. You can try again, or continue with the version you have.",
            ),
            Passo::NonSiChiude => t(
                "L'installazione è partita ma l'app non si è chiusa da sola. Chiudila e riaprila a mano.",
                "The installation started but the app did not close by itself. Close it and open it again by hand.",
            ),
        }
    }
}

/// La pagina «L'aggiornamento non è andato»: la versione di cui si parlava, e il motivo.
pub fn stato_d_errore(base: &StatoAggiornamento, fallito: &Fallito) -> StatoAggiornamento {
    StatoAggiornamento { fase: "errore".into(), note: None, fatti: 0, totale: 0, messaggio: Some(fallito.frase()), ..base.clone() }
}

/// Dopo il sì del creator: `installa` scarica e installa la versione `prima`; se non riesce `registra` lo scrive, `chiedi_errore` lo dice al creator e torna `true` se vuole riprovare
/// (si cerca di nuovo la versione: potrebbe non essere più quella) o `false` se continua con la versione installata.
pub fn dopo_il_si<P>(
    prima: P,
    mut cerca: impl FnMut() -> Result<Option<P>, String>,
    mut installa: impl FnMut(&P) -> Result<(), Fallito>,
    mut chiedi_errore: impl FnMut(&Fallito) -> bool,
    mut registra: impl FnMut(&Fallito),
) {
    let mut esito = installa(&prima);
    while let Err(fallito) = esito {
        registra(&fallito);
        if !chiedi_errore(&fallito) {
            return;
        }
        esito = match cerca() {
            Ok(Some(proposta)) => installa(&proposta),
            Ok(None) => return,
            Err(dettaglio) => Err(Fallito { passo: Passo::Controllo, dettaglio }),
        };
    }
}

#[cfg(test)]
mod prove {
    use super::*;
    use crate::lingua::{con, Lingua};
    use std::cell::RefCell;

    // L'avvio fuori dal giobbe non si prova qui: `cargo test` gira dentro un giobbe di cargo che non lascia uscire nessuno.
    // Lo prova l'aggiornamento vero da una versione installata (`docs/APP.md`, «Cosa si prova solo installando»).
    #[test]
    fn l_installatore_si_scrive_nella_cartella_data_e_parte_come_aggiornamento_passivo_che_riapre_l_app() {
        let t = tempfile::tempdir().unwrap();
        let file = scrivi_installatore(t.path(), "0.1.1", b"pacchetto").unwrap();
        assert_eq!(file, t.path().join("mango-animation-aggiornamento-0.1.1").join("mango-animation-0.1.1-setup.exe"));
        assert_eq!(std::fs::read(&file).unwrap(), b"pacchetto");
        assert_eq!(ARGOMENTI_DELL_INSTALLATORE, ["/P", "/UPDATE", "/R"]);
    }

    #[test]
    fn l_indirizzo_di_prova_si_accetta_solo_su_questo_computer() {
        assert_eq!(indirizzo_di_prova(None), Ok(None));
        assert_eq!(indirizzo_di_prova(Some("")), Ok(None));
        for valido in ["http://127.0.0.1:8765/latest.json", "http://localhost:8765/latest.json", "https://localhost/latest.json"] {
            assert_eq!(indirizzo_di_prova(Some(valido)).map(|u| u.map(String::from)), Ok(Some(valido.to_owned())), "{valido}");
        }
        for rifiutato in [
            "https://example.com/latest.json",
            "http://127.0.0.1.example.com/latest.json",
            "http://localhost@example.com/latest.json",
            "http://192.168.1.50:8765/latest.json",
            "http://0.0.0.0:8765/latest.json",
            "file:///C:/latest.json",
            "127.0.0.1:8765/latest.json",
            "non è un indirizzo",
        ] {
            let errore = indirizzo_di_prova(Some(rifiutato)).expect_err(rifiutato);
            assert!(errore.contains(VARIABILE_INDIRIZZO_DI_PROVA) && errore.contains(rifiutato), "{errore}");
        }
        let (it, en) = (con(Lingua::It, || indirizzo_di_prova(Some("https://example.com/")).unwrap_err()), con(Lingua::En, || indirizzo_di_prova(Some("https://example.com/")).unwrap_err()));
        assert!(it != en && !en.chars().any(|c| "àèéìòù".contains(c)), "{it} / {en}");
    }

    fn scarico_fallito() -> Fallito {
        Fallito { passo: Passo::Scarico, dettaglio: "error sending request for url (https://esempio.it/x.exe)".into() }
    }

    /// Un giro del «sì»: `installa` fallisce con ciò che dice `esiti` (uno per tentativo); `risposte` sono i «Riprova» (true) o «Continua» (false) del creator.
    fn giro(esiti: Vec<Fallito>, risposte: Vec<bool>, dopo_la_ricerca: Result<Option<u8>, String>) -> (Vec<String>, Vec<Passo>, usize, usize) {
        let esiti = RefCell::new(esiti.into_iter());
        let risposte = RefCell::new(risposte.into_iter());
        let (mostrati, scritti, ricerche) = (RefCell::new(Vec::new()), RefCell::new(Vec::new()), RefCell::new(0));
        let tentativi = RefCell::new(0);
        dopo_il_si(
            0u8,
            || {
                *ricerche.borrow_mut() += 1;
                dopo_la_ricerca.clone()
            },
            |_| {
                *tentativi.borrow_mut() += 1;
                Err(esiti.borrow_mut().next().expect("un tentativo in più del previsto"))
            },
            |f| {
                mostrati.borrow_mut().push(f.frase());
                risposte.borrow_mut().next().expect("la pagina ha chiesto una risposta in più")
            },
            |f| scritti.borrow_mut().push(f.passo.clone()),
        );
        (mostrati.into_inner(), scritti.into_inner(), ricerche.into_inner(), tentativi.into_inner())
    }

    #[test]
    fn se_lo_scarico_fallisce_la_pagina_lo_dice_e_chi_continua_resta_con_la_versione_installata() {
        let (mostrati, scritti, ricerche, tentativi) = giro(vec![scarico_fallito()], vec![false], Ok(None));
        assert_eq!((mostrati.len(), scritti, ricerche, tentativi), (1, vec![Passo::Scarico], 0, 1));
    }

    #[test]
    fn riprovare_cerca_di_nuovo_la_versione_e_se_non_c_e_piu_si_va_avanti_senza_chiedere() {
        let (mostrati, _, ricerche, tentativi) = giro(vec![scarico_fallito()], vec![true], Ok(None));
        assert_eq!((mostrati.len(), ricerche, tentativi), (1, 1, 1));
    }

    #[test]
    fn riprovare_e_fallire_ancora_riporta_la_pagina_d_errore_finche_il_creator_non_continua() {
        let (mostrati, scritti, ricerche, tentativi) = giro(vec![scarico_fallito(), Fallito { passo: Passo::Installazione, dettaglio: "x".into() }], vec![true, false], Ok(Some(1)));
        assert_eq!((mostrati.len(), scritti, ricerche, tentativi), (2, vec![Passo::Scarico, Passo::Installazione], 1, 2));
    }

    #[test]
    fn se_la_ricerca_del_riprovo_non_riesce_e_un_errore_da_mostrare_come_gli_altri() {
        let (mostrati, scritti, ricerche, tentativi) = giro(vec![scarico_fallito()], vec![true, false], Err("dns error".into()));
        assert_eq!((mostrati.len(), scritti, ricerche, tentativi), (2, vec![Passo::Scarico, Passo::Controllo], 1, 1));
    }

    #[test]
    fn ogni_errore_si_dice_in_parole_semplici_nelle_due_lingue_senza_il_dettaglio_tecnico() {
        for passo in [Passo::Controllo, Passo::Scarico, Passo::Installazione, Passo::NonSiChiude] {
            let f = Fallito { passo, dettaglio: "error sending request for url".into() };
            let (it, en) = (con(Lingua::It, || f.frase()), con(Lingua::En, || f.frase()));
            assert!(!it.is_empty() && !en.is_empty() && it != en, "{f:?}");
            assert!(!it.contains("request") && !en.contains("request"), "il dettaglio tecnico sta nel registro, non nella pagina: {it} / {en}");
            assert!(!en.chars().any(|c| "àèéìòù".contains(c)), "{en}");
        }
    }

    #[test]
    fn la_pagina_d_errore_porta_il_motivo_e_la_versione_che_si_stava_installando() {
        let base = StatoAggiornamento { fase: "proposta".into(), corrente: "0.1.0".into(), nuova: "0.1.1".into(), note: Some("n".into()), ..Default::default() };
        let s = stato_d_errore(&base, &scarico_fallito());
        assert_eq!((s.fase.as_str(), s.corrente.as_str(), s.nuova.as_str()), ("errore", "0.1.0", "0.1.1"));
        assert_eq!(s.messaggio, Some(scarico_fallito().frase()));
        assert_eq!((s.fatti, s.totale), (0, 0));
    }
}
