//! Spostare la cartella dei dati in un'altra (`docs/APP.md`, «La cartella di lavoro»): copia di tutto sul disco, verifica di cosa e quanto è arrivato, la nuova cartella ricordata, e solo allora si tolgono gli originali.
//! Se qualcosa non torna gli originali restano dove sono e ciò che era stato copiato si toglie. Succede all'avvio dell'app, prima del server: nessun file è in uso.

use crate::cartella::{inizia_con, libero_in};
use crate::lingua::{self, t, Lingua};
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::os::windows::fs::{symlink_dir, symlink_file, MetadataExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

const PEZZO: usize = 8 * 1024 * 1024;
/// Sta nella destinazione finché la copia non è verificata: se l'app si ferma a metà, il suo contenuto è di uno spostamento interrotto e si può rifare da capo.
const SEGNO_DI_SPOSTAMENTO: &str = ".mango-spostamento";

/// Cosa mostra la pagina dello spostamento.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct StatoSpostamento {
    /// "copia", "verifica" e "rimozione" (in corso), "errore" e "annullato" (la pagina chiede cosa fare), "avanzi" (finito, ma qualche originale è rimasto).
    pub fase: String,
    pub da: String,
    pub a: String,
    pub fatti_mb: u64,
    pub totale_mb: u64,
    pub file_fatti: u64,
    pub file_totali: u64,
    pub messaggio: Option<String>,
    /// Quanti originali non si sono tolti, e i primi.
    pub rimasti: u64,
    pub primi_rimasti: Vec<String>,
}

impl StatoSpostamento {
    pub fn in_corso(avanzamento: Avanzamento, da: &Path, a: &Path) -> StatoSpostamento {
        let fase = match avanzamento.fase {
            Fase::Copia => "copia",
            Fase::Verifica => "verifica",
            Fase::Rimozione => "rimozione",
        };
        StatoSpostamento {
            fase: fase.into(),
            da: da.display().to_string(),
            a: a.display().to_string(),
            fatti_mb: avanzamento.fatti_byte / 1_048_576,
            totale_mb: avanzamento.totale_byte / 1_048_576,
            file_fatti: avanzamento.file_fatti,
            file_totali: avanzamento.file_totali,
            ..Default::default()
        }
    }

    /// Non è andato a buon fine (o il creator ha annullato): gli originali sono dove erano.
    pub fn fallito(fallita: &Fallita, da: &Path, a: &Path) -> StatoSpostamento {
        let (fase, messaggio) = match fallita {
            Fallita::Annullata => ("annullato", None),
            Fallita::Errore(m) => ("errore", Some(m.clone())),
        };
        StatoSpostamento { fase: fase.into(), da: da.display().to_string(), a: a.display().to_string(), messaggio, ..Default::default() }
    }

    /// È finito, ma qualche originale non si è tolto.
    pub fn con_avanzi(spostata: &Spostata, da: &Path, a: &Path) -> StatoSpostamento {
        StatoSpostamento {
            fase: "avanzi".into(),
            da: da.display().to_string(),
            a: a.display().to_string(),
            rimasti: spostata.rimasti.len() as u64,
            primi_rimasti: spostata.rimasti.iter().take(5).map(|p| p.display().to_string()).collect(),
            ..Default::default()
        }
    }
}

/// Cosa c'è in una cartella, per come lo sposta: i file con la loro misura, le cartelle e i collegamenti simbolici (che si rifanno uguali, non si seguono).
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Voce {
    Cartella,
    File(u64),
    Collegamento { bersaglio: PathBuf, verso_una_cartella: bool },
}

type Elenco = Vec<(PathBuf, Voce)>;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Fase {
    #[default]
    Copia,
    Verifica,
    Rimozione,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Avanzamento {
    pub fase: Fase,
    pub fatti_byte: u64,
    pub totale_byte: u64,
    pub file_fatti: u64,
    pub file_totali: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Fallita {
    /// Il creator ha premuto «Annulla».
    Annullata,
    Errore(String),
}

/// Lo spostamento è finito: la destinazione ha tutto. `rimasti` sono gli originali che non si sono potuti togliere (un programma li tiene aperti).
#[derive(Debug, PartialEq, Eq)]
pub struct Spostata {
    pub rimasti: Vec<PathBuf>,
}

/// La frase dell'errore di sistema senza il suo numero: «(os error 32)» non dice niente a chi non programma.
fn motivo(e: std::io::Error) -> String {
    let testo = e.to_string();
    match testo.strip_suffix(')').and_then(|t| t.rsplit_once(" (")) {
        Some((frase, numero)) if numero.starts_with("os ") => frase.to_owned(),
        _ => testo,
    }
}

fn dimensione(byte: u64) -> String {
    let mb = byte as f64 / 1_048_576.0;
    if mb < 1000.0 {
        return format!("{} MB", mb.ceil() as u64);
    }
    let gb = format!("{:.1}", mb / 1024.0);
    format!("{} GB", if lingua::corrente() == Lingua::It { gb.replace('.', ",") } else { gb })
}

/// La cartella scelta può ricevere quella attuale? Vuota o da creare, e non dentro l'altra (né l'altra dentro di lei).
pub fn controlla_destinazione(origine: &Path, destinazione: &Path) -> Result<(), String> {
    if inizia_con(destinazione, origine) {
        return Err(t("La cartella scelta è dentro quella attuale: scegline una fuori.", "The chosen folder is inside the current one: choose one outside it."));
    }
    if inizia_con(origine, destinazione) {
        return Err(t("La cartella attuale è dentro quella scelta: scegline una fuori.", "The current folder is inside the chosen one: choose one outside it."));
    }
    match fs::read_dir(destinazione) {
        Ok(_) if destinazione.join(SEGNO_DI_SPOSTAMENTO).is_file() => Ok(()),
        Ok(mut voci) => match voci.next() {
            Some(_) => Err(t("La cartella scelta non è vuota: scegline una vuota, o creane una nuova.", "The chosen folder is not empty: choose an empty one, or create a new one.")),
            None => Ok(()),
        },
        Err(_) if !destinazione.exists() => Ok(()),
        Err(_) => Err(t(format!("«{}» non è una cartella che si può usare.", destinazione.display()), format!("“{}” is not a folder that can be used.", destinazione.display()))),
    }
}

fn controlla_spazio(servono_byte: u64, liberi_byte: u64) -> Result<(), String> {
    if servono_byte <= liberi_byte {
        return Ok(());
    }
    Err(t(
        format!("Nel disco della cartella scelta non c'è abbastanza spazio: servono {}, ne restano {}.", dimensione(servono_byte), dimensione(liberi_byte)),
        format!("There is not enough space on the disk of the chosen folder: {} is needed, {} is left.", dimensione(servono_byte), dimensione(liberi_byte)),
    ))
}

/// Tutto ciò che sta in `radice`, con le cartelle prima del loro contenuto. Un collegamento (simbolico, o una giunzione di Windows) non si segue: si rifà uguale.
fn scansiona(radice: &Path) -> Result<Elenco, String> {
    let mut elenco = Elenco::new();
    let mut da_vedere = vec![radice.to_path_buf()];
    while let Some(cartella) = da_vedere.pop() {
        let voci = fs::read_dir(&cartella).map_err(motivo).map_err(|e| t(format!("Non riesco a leggere {}: {e}", cartella.display()), format!("I can't read {}: {e}", cartella.display())))?;
        let mut voci: Vec<_> = voci.collect::<Result<_, _>>().map_err(motivo).map_err(|e| t(format!("Non riesco a leggere {}: {e}", cartella.display()), format!("I can't read {}: {e}", cartella.display())))?;
        voci.sort_by_key(|v| std::cmp::Reverse(v.file_name()));
        for voce in voci {
            let percorso = voce.path();
            let relativo = percorso.strip_prefix(radice).expect("sta dentro la radice").to_path_buf();
            let meta = fs::symlink_metadata(&percorso).map_err(motivo).map_err(|e| t(format!("Non riesco a leggere {}: {e}", percorso.display()), format!("I can't read {}: {e}", percorso.display())))?;
            if meta.file_type().is_symlink() {
                let bersaglio = fs::read_link(&percorso).map_err(motivo).map_err(|e| t(format!("Non riesco a leggere il collegamento {}: {e}", percorso.display()), format!("I can't read the link {}: {e}", percorso.display())))?;
                elenco.push((relativo, Voce::Collegamento { bersaglio, verso_una_cartella: meta.file_attributes() & 0x10 != 0 }));
            } else if meta.is_dir() {
                elenco.push((relativo, Voce::Cartella));
                da_vedere.push(percorso);
            } else {
                elenco.push((relativo, Voce::File(meta.len())));
            }
        }
    }
    Ok(elenco)
}

/// Ciò che si è creato nella destinazione, per toglierlo se lo spostamento non finisce.
struct Creato {
    voci: Vec<PathBuf>,
    /// Le cartelle sopra la destinazione che non c'erano, dalla più vicina alla più lontana.
    livelli_nuovi: Vec<PathBuf>,
}

impl Creato {
    fn prepara(destinazione: &Path) -> Result<Creato, String> {
        let livelli_nuovi: Vec<PathBuf> = destinazione.ancestors().take_while(|a| !a.exists()).map(Path::to_path_buf).collect();
        fs::create_dir_all(destinazione).map_err(motivo).map_err(|e| t(format!("Non riesco a preparare {}: {e}", destinazione.display()), format!("I can't prepare {}: {e}", destinazione.display())))?;
        Ok(Creato { voci: Vec::new(), livelli_nuovi })
    }

    /// Toglie ciò che questo spostamento ha messo nella destinazione, e niente altro.
    fn disfa(self) {
        for voce in self.voci.iter().rev() {
            if fs::remove_file(voce).is_err() {
                let _ = fs::remove_dir(voce);
            }
        }
        for livello in &self.livelli_nuovi {
            let _ = fs::remove_dir(livello);
        }
    }
}

/// L'avanzamento e chi lo ascolta: lo si dice a ogni pezzo e a ogni file, e chi ascolta decide ogni quanto mostrarlo.
struct Cadenza<'a> {
    avanzamento: Avanzamento,
    dire: &'a mut dyn FnMut(Avanzamento),
}

impl Cadenza<'_> {
    fn aggiorna(&mut self) {
        (self.dire)(self.avanzamento);
    }
}

fn errore_su(percorso: &Path, e: std::io::Error) -> Fallita {
    let e = motivo(e);
    Fallita::Errore(t(format!("Non riesco a copiare {}: {e}", percorso.display()), format!("I can't copy {}: {e}", percorso.display())))
}

/// Copia un file a pezzi, guardando se il creator ha annullato.
fn copia_file(da: &Path, a: &Path, annulla: &AtomicBool, cadenza: &mut Cadenza) -> Result<(), Fallita> {
    let mut lettura = File::open(da).map_err(|e| errore_su(da, e))?;
    let modificato = lettura.metadata().and_then(|m| m.modified()).ok();
    let mut scrittura = File::options().write(true).create_new(true).open(a).map_err(|e| errore_su(a, e))?;
    let mut pezzo = vec![0u8; PEZZO];
    loop {
        if annulla.load(Ordering::SeqCst) {
            return Err(Fallita::Annullata);
        }
        let letti = lettura.read(&mut pezzo).map_err(|e| errore_su(da, e))?;
        if letti == 0 {
            break;
        }
        scrittura.write_all(&pezzo[..letti]).map_err(|e| errore_su(a, e))?;
        cadenza.avanzamento.fatti_byte += letti as u64;
        cadenza.aggiorna();
    }
    if let Some(quando) = modificato {
        scrittura.set_modified(quando).map_err(|e| errore_su(a, e))?;
    }
    // Gli originali si tolgono dopo: il file deve stare sul disco, non solo nella memoria di Windows.
    scrittura.sync_all().map_err(|e| errore_su(a, e))?;
    Ok(())
}

fn copia(origine: &Path, destinazione: &Path, elenco: &Elenco, annulla: &AtomicBool, creato: &mut Creato, cadenza: &mut Cadenza) -> Result<(), Fallita> {
    for (relativo, voce) in elenco {
        if annulla.load(Ordering::SeqCst) {
            return Err(Fallita::Annullata);
        }
        let (da, a) = (origine.join(relativo), destinazione.join(relativo));
        match voce {
            Voce::Cartella => {
                fs::create_dir(&a).map_err(|e| errore_su(&a, e))?;
                creato.voci.push(a);
            }
            Voce::File(_) => {
                // Il file entra nell'elenco prima di nascere: se la copia si ferma a metà, il pezzo scritto si toglie.
                creato.voci.push(a.clone());
                copia_file(&da, &a, annulla, cadenza)?;
                cadenza.avanzamento.file_fatti += 1;
            }
            Voce::Collegamento { bersaglio, verso_una_cartella } => {
                let fa = if *verso_una_cartella { symlink_dir } else { symlink_file };
                fa(bersaglio, &a).map_err(motivo).map_err(|e| {
                    Fallita::Errore(t(
                        format!("Non riesco a rifare il collegamento {}: {e}", a.display()),
                        format!("I can't recreate the link {}: {e}", a.display()),
                    ))
                })?;
                creato.voci.push(a);
                cadenza.avanzamento.file_fatti += 1;
            }
        }
        cadenza.aggiorna();
    }
    cadenza.aggiorna();
    Ok(())
}

fn metti_il_segno(destinazione: &Path, creato: &mut Creato) -> Result<(), String> {
    let segno = destinazione.join(SEGNO_DI_SPOSTAMENTO);
    fs::write(&segno, b"").map_err(motivo).map_err(|e| t(format!("Non riesco a scrivere in {}: {e}", destinazione.display()), format!("I can't write in {}: {e}", destinazione.display())))?;
    creato.voci.push(segno);
    Ok(())
}

/// Una destinazione con il segno di uno spostamento interrotto si svuota: ciò che c'è è di quello spostamento, e si rifà da capo.
fn pulisci_gli_avanzi(destinazione: &Path) -> Result<(), String> {
    if !destinazione.join(SEGNO_DI_SPOSTAMENTO).is_file() {
        return Ok(());
    }
    let non_si_svuota = |e: std::io::Error| {
        let e = motivo(e);
        t(format!("Non riesco a svuotare {}: {e}", destinazione.display()), format!("I can't empty {}: {e}", destinazione.display()))
    };
    for voce in fs::read_dir(destinazione).map_err(non_si_svuota)? {
        let percorso = voce.map_err(non_si_svuota)?.path();
        let e_cartella = fs::symlink_metadata(&percorso).map_err(non_si_svuota)?.file_type().is_dir();
        let tolto = if e_cartella { fs::remove_dir_all(&percorso) } else { fs::remove_file(&percorso).or_else(|_| fs::remove_dir(&percorso)) };
        tolto.map_err(non_si_svuota)?;
    }
    Ok(())
}

/// Nella destinazione c'è tutto, e di ogni file la stessa misura.
fn verifica(destinazione: &Path, elenco: &Elenco) -> Result<(), Fallita> {
    let mut arrivato = scansiona(destinazione).map_err(Fallita::Errore)?;
    arrivato.retain(|(relativo, _)| relativo != Path::new(SEGNO_DI_SPOSTAMENTO));
    let mut atteso = elenco.clone();
    arrivato.sort();
    atteso.sort();
    if arrivato == atteso {
        return Ok(());
    }
    let diversa = atteso.iter().find(|v| !arrivato.contains(v)).map(|(p, _)| p.display().to_string()).unwrap_or_default();
    Err(Fallita::Errore(t(
        format!("Dopo la copia {} non coincide con l'originale (nella cartella nuova ci sono {} voci, in quella vecchia {}).", diversa, arrivato.len(), atteso.len()),
        format!("After copying, {} does not match the original (the new folder has {} items, the old one {}).", diversa, arrivato.len(), atteso.len()),
    )))
}

/// Toglie gli originali, i contenuti prima delle cartelle. Quelli che non si tolgono (un programma li tiene aperti) si elencano.
fn togli_gli_originali(origine: &Path, elenco: &Elenco) -> Vec<PathBuf> {
    let mut rimasti = Vec::new();
    for (relativo, voce) in elenco.iter().rev() {
        let percorso = origine.join(relativo);
        let tolto = match voce {
            Voce::File(_) | Voce::Collegamento { verso_una_cartella: false, .. } => fs::remove_file(&percorso),
            Voce::Cartella | Voce::Collegamento { verso_una_cartella: true, .. } => fs::remove_dir(&percorso),
        };
        // Una cartella che non si toglie perché ha ancora dentro un file che resta non ha altro da dire.
        if tolto.is_err() && !matches!(voce, Voce::Cartella) {
            rimasti.push(percorso);
        }
    }
    let _ = fs::remove_dir(origine);
    rimasti
}

/// Sposta tutto ciò che sta in `origine` dentro `destinazione`. `progresso` riceve l'avanzamento; `annulla` si accende dal creator e ferma la copia.
/// `ricorda` scrive la nuova cartella come quella in uso: si chiama a copia verificata e prima di togliere un solo originale, così un blocco in qualunque momento lascia
/// una cartella con tutto, e quella ricordata la ha. Se non finisce (`Fallita`, anche perché `ricorda` non riesce), `origine` è com'era e `destinazione` anche.
pub fn sposta(origine: &Path, destinazione: &Path, annulla: &AtomicBool, progresso: &mut dyn FnMut(Avanzamento), ricorda: &mut dyn FnMut() -> Result<(), String>) -> Result<Spostata, Fallita> {
    controlla_destinazione(origine, destinazione).map_err(Fallita::Errore)?;
    let elenco = scansiona(origine).map_err(Fallita::Errore)?;
    let (byte, file) = elenco.iter().fold((0u64, 0u64), |(b, f), (_, v)| match v {
        Voce::File(n) => (b + n, f + 1),
        Voce::Collegamento { .. } => (b, f + 1),
        Voce::Cartella => (b, f),
    });
    pulisci_gli_avanzi(destinazione).map_err(Fallita::Errore)?;
    controlla_spazio(byte, libero_in(destinazione).saturating_mul(1_048_576)).map_err(Fallita::Errore)?;

    let mut cadenza = Cadenza { avanzamento: Avanzamento { fase: Fase::Copia, totale_byte: byte, file_totali: file, ..Default::default() }, dire: progresso };
    cadenza.aggiorna();
    let mut creato = Creato::prepara(destinazione).map_err(Fallita::Errore)?;
    let esito = metti_il_segno(destinazione, &mut creato).map_err(Fallita::Errore).and_then(|()| copia(origine, destinazione, &elenco, annulla, &mut creato, &mut cadenza)).and_then(|()| {
        cadenza.avanzamento.fase = Fase::Verifica;
        cadenza.aggiorna();
        if annulla.load(Ordering::SeqCst) {
            return Err(Fallita::Annullata);
        }
        verifica(destinazione, &elenco)
    })
    .and_then(|()| ricorda().map_err(Fallita::Errore));
    if let Err(fallita) = esito {
        creato.disfa();
        return Err(fallita);
    }
    let _ = fs::remove_file(destinazione.join(SEGNO_DI_SPOSTAMENTO));
    cadenza.avanzamento.fase = Fase::Rimozione;
    cadenza.aggiorna();
    Ok(Spostata { rimasti: togli_gli_originali(origine, &elenco) })
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;

    fn sposta(origine: &Path, destinazione: &Path, annulla: &AtomicBool, progresso: &mut dyn FnMut(Avanzamento)) -> Result<Spostata, Fallita> {
        super::sposta(origine, destinazione, annulla, progresso, &mut || Ok(()))
    }

    /// Una cartella dei dati di prova: file di misure diverse, una cartella vuota, file annidati.
    fn cartella_di_prova(radice: &Path) {
        fs::create_dir_all(radice.join("archivio").join("grezzo").join("2026-01-01")).unwrap();
        fs::create_dir_all(radice.join("vuota")).unwrap();
        fs::write(radice.join("profilo.json"), b"{\"creator\":{}}").unwrap();
        fs::write(radice.join("archivio").join("grezzo").join("2026-01-01").join("ripresa.mp4"), vec![7u8; 20 * 1024 * 1024 + 5]).unwrap();
        fs::write(radice.join("archivio").join("grezzo").join("2026-01-01").join("ripresa.scheda.json"), b"{}").unwrap();
        fs::write(radice.join("archivio").join("nota.txt"), b"").unwrap();
    }

    fn contenuto(radice: &Path) -> Elenco {
        let mut e = scansiona(radice).unwrap();
        e.sort();
        e
    }

    fn nessun_annullo() -> AtomicBool {
        AtomicBool::new(false)
    }

    #[test]
    fn sposta_tutto_verifica_e_toglie_gli_originali_dicendo_l_avanzamento() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova").join("Mango Animation"));
        cartella_di_prova(&origine);
        let prima = contenuto(&origine);
        let mut visti: Vec<Avanzamento> = Vec::new();
        let esito = sposta(&origine, &destinazione, &nessun_annullo(), &mut |a| visti.push(a)).unwrap();
        assert_eq!(esito.rimasti, Vec::<PathBuf>::new());
        assert_eq!(contenuto(&destinazione), prima);
        assert_eq!(fs::read(destinazione.join("profilo.json")).unwrap(), b"{\"creator\":{}}");
        assert!(destinazione.join("vuota").is_dir());
        assert!(!origine.exists(), "la cartella vecchia è rimasta");
        // l'avanzamento: prima la copia fino in fondo, poi la verifica, poi la rimozione
        let totale = 20 * 1024 * 1024 + 5 + 14 + 2;
        assert_eq!((visti[0].fase, visti[0].fatti_byte, visti[0].totale_byte, visti[0].file_totali), (Fase::Copia, 0, totale, 4));
        let fasi: Vec<Fase> = visti.iter().map(|a| a.fase).collect();
        assert_eq!(fasi.last(), Some(&Fase::Rimozione));
        assert!(fasi.windows(2).all(|c| c[0] as u8 <= c[1] as u8));
        let fine_copia = visti.iter().rfind(|a| a.fase == Fase::Copia).unwrap();
        assert_eq!((fine_copia.fatti_byte, fine_copia.file_fatti), (totale, 4));
        assert!(visti.iter().map(|a| a.fatti_byte).collect::<Vec<_>>().windows(2).all(|c| c[0] <= c[1]));
    }

    #[test]
    fn la_nuova_cartella_si_ricorda_a_copia_verificata_e_prima_di_togliere_un_originale() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let prima = contenuto(&origine);
        let mut al_momento = None;
        super::sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}, &mut || {
            let mut arrivato = contenuto(&destinazione);
            arrivato.retain(|(relativo, _)| relativo != Path::new(SEGNO_DI_SPOSTAMENTO));
            al_momento = Some((contenuto(&origine), arrivato));
            Ok(())
        })
        .unwrap();
        // Alla chiamata gli originali ci sono ancora tutti e la destinazione ha già tutto.
        assert_eq!(al_momento, Some((prima.clone(), prima)));
    }

    #[test]
    fn se_la_nuova_cartella_non_si_riesce_a_ricordare_gli_originali_restano_e_la_copia_si_toglie() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let prima = contenuto(&origine);
        let esito = super::sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}, &mut || Err("il disco è pieno".into()));
        assert_eq!(esito, Err(Fallita::Errore("il disco è pieno".into())));
        assert_eq!(contenuto(&origine), prima);
        assert!(!destinazione.exists());
    }

    #[test]
    fn la_data_di_modifica_dei_file_si_conserva() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        fs::create_dir_all(&origine).unwrap();
        let file = origine.join("ripresa.mp4");
        fs::write(&file, b"x").unwrap();
        let antica = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
        File::options().write(true).open(&file).unwrap().set_modified(antica).unwrap();
        sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}).unwrap();
        assert_eq!(fs::metadata(destinazione.join("ripresa.mp4")).unwrap().modified().unwrap(), antica);
    }

    #[test]
    fn se_un_file_non_si_legge_a_meta_gli_originali_restano_e_la_destinazione_torna_com_era() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("livello").join("nuova"));
        cartella_di_prova(&origine);
        // L'ultimo file in ordine di copia è tenuto aperto da un altro programma, in modo esclusivo.
        let bloccato = origine.join("archivio").join("zzz-bloccato.bin");
        fs::write(&bloccato, vec![1u8; 1000]).unwrap();
        let _tenuto = File::options().read(true).share_mode(0).open(&bloccato).unwrap();
        let prima = contenuto(&origine);
        let Err(Fallita::Errore(motivo)) = sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}) else { panic!("la copia doveva fallire") };
        assert!(motivo.contains("zzz-bloccato.bin") && !motivo.contains("os error"), "{motivo}");
        assert_eq!(contenuto(&origine), prima);
        assert!(!destinazione.exists() && !destinazione.parent().unwrap().exists(), "la destinazione non è tornata com'era");
    }

    #[test]
    fn la_destinazione_che_c_era_vuota_resta_e_si_svuota_se_la_copia_non_finisce() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        fs::create_dir(&destinazione).unwrap();
        let annulla = AtomicBool::new(false);
        let esito = sposta(&origine, &destinazione, &annulla, &mut |a| {
            if a.file_fatti >= 1 {
                annulla.store(true, Ordering::SeqCst);
            }
        });
        assert_eq!(esito, Err(Fallita::Annullata));
        assert!(destinazione.is_dir() && fs::read_dir(&destinazione).unwrap().next().is_none());
        assert!(origine.join("archivio").join("grezzo").join("2026-01-01").join("ripresa.mp4").is_file());
    }

    #[test]
    fn annullare_nel_mezzo_di_un_file_grande_lascia_tutto_com_era() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let prima = contenuto(&origine);
        let annulla = AtomicBool::new(false);
        // il file da 20 MB si copia a pezzi da 8: si annulla quando ne è arrivato un pezzo
        let esito = sposta(&origine, &destinazione, &annulla, &mut |a| {
            if a.fatti_byte >= PEZZO as u64 {
                annulla.store(true, Ordering::SeqCst);
            }
        });
        assert_eq!(esito, Err(Fallita::Annullata));
        assert_eq!(contenuto(&origine), prima);
        assert!(!destinazione.exists());
    }

    #[test]
    fn un_file_che_cambia_durante_la_copia_non_supera_la_verifica_e_gli_originali_restano() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let da_far_crescere = origine.join("archivio").join("nota.txt");
        let mut fatto = false;
        let Err(Fallita::Errore(motivo)) = sposta(&origine, &destinazione, &nessun_annullo(), &mut |a| {
            if a.file_fatti >= 1 && !fatto {
                fatto = true;
                File::options().append(true).open(&da_far_crescere).unwrap().write_all(b" cresciuto").unwrap();
            }
        }) else {
            panic!("la verifica doveva fallire")
        };
        assert!(motivo.contains("non coincide con l'originale"), "{motivo}");
        assert!(origine.join("archivio").join("nota.txt").is_file() && !destinazione.exists());
    }

    #[test]
    fn un_originale_che_non_si_toglie_si_dice_e_la_destinazione_ha_tutto_lo_stesso() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        // Aperto da un altro programma che lascia leggere ma non cancellare.
        let tenuto_aperto = origine.join("archivio").join("nota.txt");
        let _aperto = File::options().read(true).share_mode(1).open(&tenuto_aperto).unwrap();
        let esito = sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}).unwrap();
        assert_eq!(esito.rimasti, vec![tenuto_aperto.clone()]);
        assert!(destinazione.join("archivio").join("nota.txt").is_file() && destinazione.join("profilo.json").is_file());
        assert!(tenuto_aperto.is_file() && !origine.join("profilo.json").exists());
    }

    #[test]
    fn i_collegamenti_simbolici_si_rifanno_uguali_senza_seguirli_e_l_originale_dei_video_non_si_tocca() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione, altro_disco) = (t.path().join("vecchia"), t.path().join("nuova"), t.path().join("altro-disco"));
        fs::create_dir_all(origine.join("archivio")).unwrap();
        fs::create_dir_all(&altro_disco).unwrap();
        fs::write(altro_disco.join("video.mp4"), b"video pesante").unwrap();
        if symlink_file(altro_disco.join("video.mp4"), origine.join("archivio").join("video.mp4")).is_err() {
            eprintln!("questo computer non lascia fare collegamenti simbolici: la prova non può dire niente");
            return;
        }
        symlink_dir(&altro_disco, origine.join("archivio").join("cartella-collegata")).unwrap();
        let prima = contenuto(&origine);
        sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}).unwrap();
        assert_eq!(contenuto(&destinazione), prima);
        assert_eq!(fs::read_link(destinazione.join("archivio").join("video.mp4")).unwrap(), altro_disco.join("video.mp4"));
        assert_eq!(fs::read(altro_disco.join("video.mp4")).unwrap(), b"video pesante");
        assert!(!origine.exists());
    }

    #[test]
    fn la_destinazione_deve_essere_vuota_o_nuova_e_fuori_dalla_cartella_attuale() {
        let t = tempfile::tempdir().unwrap();
        let origine = t.path().join("Mango Animation");
        fs::create_dir_all(origine.join("archivio")).unwrap();
        let vuota = t.path().join("vuota");
        fs::create_dir(&vuota).unwrap();
        let piena = t.path().join("piena");
        fs::create_dir(&piena).unwrap();
        fs::write(piena.join("dato.txt"), "x").unwrap();
        let un_file = t.path().join("file.txt");
        fs::write(&un_file, "x").unwrap();
        assert_eq!(controlla_destinazione(&origine, &vuota), Ok(()));
        assert_eq!(controlla_destinazione(&origine, &t.path().join("non-c-e-ancora").join("Video")), Ok(()));
        assert!(controlla_destinazione(&origine, &piena).unwrap_err().contains("non è vuota"));
        assert!(controlla_destinazione(&origine, &un_file).unwrap_err().contains("non è una cartella"));
        assert!(controlla_destinazione(&origine, &origine.join("archivio").join("nuova")).unwrap_err().contains("dentro quella attuale"));
        assert!(controlla_destinazione(&origine, t.path()).unwrap_err().contains("dentro quella scelta"));
        // il nome della cartella non distingue maiuscole e minuscole, come Windows
        assert!(controlla_destinazione(&origine, &PathBuf::from(origine.to_string_lossy().to_uppercase()).join("x")).is_err());
        assert!(sposta(&origine, &piena, &nessun_annullo(), &mut |_| {}).is_err());
        assert!(origine.join("archivio").is_dir() && piena.join("dato.txt").is_file());
    }

    #[test]
    fn uno_spostamento_interrotto_a_meta_si_rifa_da_capo_e_la_cartella_di_un_altro_no() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let prima = contenuto(&origine);
        // l'app è stata chiusa durante la copia: nella destinazione restano il segno e un pezzo
        fs::create_dir_all(destinazione.join("archivio")).unwrap();
        fs::write(destinazione.join(SEGNO_DI_SPOSTAMENTO), b"").unwrap();
        fs::write(destinazione.join("archivio").join("mezzo.mp4"), b"mezzo").unwrap();
        assert_eq!(controlla_destinazione(&origine, &destinazione), Ok(()));
        sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}).unwrap();
        assert_eq!(contenuto(&destinazione), prima);
        assert!(!destinazione.join("archivio").join("mezzo.mp4").exists() && !destinazione.join(SEGNO_DI_SPOSTAMENTO).exists());
        // una cartella con dei file senza il segno non è nostra: non si svuota
        let altrui = t.path().join("altrui");
        fs::create_dir_all(&altrui).unwrap();
        fs::write(altrui.join("foto.jpg"), b"x").unwrap();
        cartella_di_prova(&t.path().join("altra-origine"));
        assert!(sposta(&t.path().join("altra-origine"), &altrui, &nessun_annullo(), &mut |_| {}).is_err());
        assert!(altrui.join("foto.jpg").is_file());
    }

    #[test]
    fn il_segno_non_resta_nella_destinazione_nemmeno_se_la_copia_non_finisce() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione) = (t.path().join("vecchia"), t.path().join("nuova"));
        cartella_di_prova(&origine);
        let annulla = AtomicBool::new(true);
        assert_eq!(sposta(&origine, &destinazione, &annulla, &mut |_| {}), Err(Fallita::Annullata));
        assert!(!destinazione.exists());
    }

    #[test]
    fn senza_spazio_nel_disco_di_destinazione_non_si_comincia() {
        assert_eq!(controlla_spazio(10, 10), Ok(()));
        let motivo = controlla_spazio(5 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024).unwrap_err();
        assert_eq!(motivo, "Nel disco della cartella scelta non c'è abbastanza spazio: servono 5,0 GB, ne restano 2,0 GB.");
        lingua::con(Lingua::En, || assert_eq!(controlla_spazio(5 * 1024 * 1024 * 1024, 300 * 1024 * 1024).unwrap_err(), "There is not enough space on the disk of the chosen folder: 5.0 GB is needed, 300 MB is left."));
    }

    #[test]
    fn una_giunzione_di_windows_si_tratta_da_collegamento_e_la_cartella_a_cui_porta_non_si_copia_ne_si_svuota() {
        let t = tempfile::tempdir().unwrap();
        let (origine, destinazione, bersaglio) = (t.path().join("vecchia"), t.path().join("nuova"), t.path().join("bersaglio"));
        fs::create_dir_all(origine.join("archivio")).unwrap();
        fs::create_dir_all(&bersaglio).unwrap();
        fs::write(bersaglio.join("dato.txt"), "x").unwrap();
        let esito = std::process::Command::new("cmd").args(["/c", "mklink", "/J"]).arg(origine.join("archivio").join("giunzione")).arg(&bersaglio).stdout(std::process::Stdio::null()).status();
        if !esito.is_ok_and(|s| s.success()) {
            eprintln!("la giunzione non si è potuta fare: la prova non può dire niente");
            return;
        }
        match sposta(&origine, &destinazione, &nessun_annullo(), &mut |_| {}) {
            Ok(_) => {
                assert!(destinazione.join("archivio").join("giunzione").join("dato.txt").exists(), "il collegamento nuovo non porta al bersaglio");
                assert!(fs::symlink_metadata(destinazione.join("archivio").join("giunzione")).unwrap().file_type().is_symlink());
                assert!(!origine.exists());
            }
            // Dove i collegamenti simbolici non si possono fare si rinuncia, e si dice: gli originali restano.
            Err(Fallita::Errore(motivo)) => {
                assert!(motivo.contains("giunzione"), "{motivo}");
                assert!(origine.join("archivio").join("giunzione").exists() && !destinazione.exists());
                let _ = fs::remove_dir(origine.join("archivio").join("giunzione"));
            }
            Err(altro) => panic!("{altro:?}"),
        }
        assert_eq!(fs::read(bersaglio.join("dato.txt")).unwrap(), b"x");
    }
}
