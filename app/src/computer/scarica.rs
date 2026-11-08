//! Scaricare un file: riprende da dove era arrivato se la rete cade, e non lo mette al suo posto finché dimensione e impronta (SHA-256) non tornano.

use crate::lingua::t;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const TENTATIVI: u32 = 4;

/// Cosa scaricare e come riconoscerlo.
#[derive(Clone, Copy)]
pub struct Fonte<'a> {
    pub url: &'a str,
    pub sha256: &'a str,
    pub dimensione: u64,
}

fn parziale(destinazione: &Path) -> PathBuf {
    let mut nome = destinazione.as_os_str().to_owned();
    nome.push(".parte");
    nome.into()
}

/// L'impronta SHA-256 di un file, in esadecimale.
pub fn impronta(file: &Path) -> std::io::Result<String> {
    let mut f = File::open(file)?;
    let mut sha = Sha256::new();
    let mut blocco = vec![0u8; 1 << 20];
    loop {
        let letti = f.read(&mut blocco)?;
        if letti == 0 {
            break;
        }
        sha.update(&blocco[..letti]);
    }
    Ok(sha.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Un giro di scarico: da `da` byte in poi, aggiungendo a `file`. Torna quando il corpo è finito o la rete cade.
fn giro(url: &str, da: u64, file: &mut File, annulla: &AtomicBool, avanzamento: &mut dyn FnMut(u64)) -> Result<(), String> {
    let agente = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).user_agent("mango-animation").build();
    let mut richiesta = agente.get(url);
    if da > 0 {
        richiesta = richiesta.set("Range", &format!("bytes={da}-"));
    }
    let risposta = richiesta.call().map_err(|e| match e {
        ureq::Error::Status(codice, _) => t(format!("il server ha risposto {codice}"), format!("the server answered {codice}")),
        altro => t(format!("la rete non risponde ({altro})"), format!("the network is not responding ({altro})")),
    })?;
    // Un server che non sa riprendere risponde 200 col file intero: si riparte da zero.
    let mut scritti = if da > 0 && risposta.status() == 206 { da } else { 0 };
    if scritti == 0 {
        file.set_len(0).map_err(|e| e.to_string())?;
        std::io::Seek::seek(file, std::io::SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    } else {
        std::io::Seek::seek(file, std::io::SeekFrom::End(0)).map_err(|e| e.to_string())?;
    }
    let mut corpo = risposta.into_reader();
    let mut blocco = vec![0u8; 256 * 1024];
    loop {
        if annulla.load(Ordering::SeqCst) {
            return Err("annullato".into());
        }
        let letti = corpo.read(&mut blocco).map_err(|e| t(format!("la rete si è interrotta ({e})"), format!("the network was interrupted ({e})")))?;
        if letti == 0 {
            return Ok(());
        }
        file.write_all(&blocco[..letti]).map_err(|e| t(format!("non riesco a scrivere sul disco ({e})"), format!("I can't write to the disk ({e})")))?;
        scritti += letti as u64;
        avanzamento(scritti);
    }
}

/// Scarica `fonte` in `destinazione`, creando le cartelle che servono; `avanzamento` riceve i byte scaricati finora (anche quelli di un tentativo precedente).
/// Se la rete cade riprende da dove era (fino a quattro tentativi). Il file arriva al suo posto solo con dimensione e impronta giuste.
pub fn scarica(fonte: Fonte, destinazione: &Path, annulla: &AtomicBool, avanzamento: &mut dyn FnMut(u64)) -> Result<(), String> {
    if let Some(cartella) = destinazione.parent() {
        fs::create_dir_all(cartella).map_err(|e| t(format!("non riesco a creare {} ({e})", cartella.display()), format!("I can't create {} ({e})", cartella.display())))?;
    }
    let parte = parziale(destinazione);
    let mut ultimo_errore = String::new();
    for tentativo in 1..=TENTATIVI {
        let mut file = OpenOptions::new().create(true).read(true).write(true).truncate(false).open(&parte).map_err(|e| t(format!("non riesco ad aprire {} ({e})", parte.display()), format!("I can't open {} ({e})", parte.display())))?;
        let gia = file.metadata().map_err(|e| e.to_string())?.len();
        // Un parziale più lungo del file è di un'altra cosa: si ricomincia.
        let da = if gia > fonte.dimensione { 0 } else { gia };
        if gia > 0 && gia == fonte.dimensione {
            drop(file);
        } else {
            match giro(fonte.url, da, &mut file, annulla, avanzamento) {
                Ok(()) => drop(file),
                Err(e) if e == "annullato" => return Err(e),
                Err(e) => {
                    ultimo_errore = e;
                    drop(file);
                    if tentativo < TENTATIVI {
                        std::thread::sleep(Duration::from_secs(u64::from(tentativo)));
                    }
                    continue;
                }
            }
        }
        let arrivati = fs::metadata(&parte).map_err(|e| e.to_string())?.len();
        if arrivati != fonte.dimensione {
            ultimo_errore = t(format!("sono arrivati {arrivati} byte invece di {}", fonte.dimensione), format!("{arrivati} bytes arrived instead of {}", fonte.dimensione));
            // Un file più corto si riprende; uno più lungo è guasto.
            if arrivati > fonte.dimensione {
                let _ = fs::remove_file(&parte);
            }
            continue;
        }
        let trovata = impronta(&parte).map_err(|e| t(format!("non riesco a leggere {} ({e})", parte.display()), format!("I can't read {} ({e})", parte.display())))?;
        if !trovata.eq_ignore_ascii_case(fonte.sha256) {
            let _ = fs::remove_file(&parte);
            return Err(t(format!("il file scaricato da {} non è quello atteso (impronta {trovata}): è stato tolto, riprova", fonte.url), format!("the file downloaded from {} is not the expected one (checksum {trovata}): it was removed, try again", fonte.url)));
        }
        fs::rename(&parte, destinazione).map_err(|e| t(format!("non riesco a mettere {} al suo posto ({e})", destinazione.display()), format!("I can't put {} in its place ({e})", destinazione.display())))?;
        return Ok(());
    }
    Err(t(format!("non riesco a scaricare {}: {ultimo_errore}", fonte.url), format!("I can't download {}: {ultimo_errore}", fonte.url)))
}

#[cfg(test)]
pub mod prove {
    use super::*;
    use std::io::BufRead;
    use std::net::TcpListener;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;

    /// Un server di prova: serve `corpo` e sa riprendere (`Range`). Con `taglia_la_prima`, la prima connessione si chiude a metà.
    pub fn server(corpo: Vec<u8>, taglia_la_prima: Option<usize>, senza_range: bool) -> (String, Arc<AtomicUsize>) {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}/file", ascolto.local_addr().unwrap().port());
        let connessioni = Arc::new(AtomicUsize::new(0));
        let conteggio = connessioni.clone();
        std::thread::spawn(move || {
            for flusso in ascolto.incoming() {
                let Ok(mut f) = flusso else { return };
                let numero = conteggio.fetch_add(1, Ordering::SeqCst);
                let mut lettore = std::io::BufReader::new(f.try_clone().unwrap());
                let mut da = 0usize;
                loop {
                    let mut riga = String::new();
                    if lettore.read_line(&mut riga).unwrap_or(0) == 0 || riga.trim().is_empty() {
                        break;
                    }
                    if let Some(r) = riga.to_lowercase().strip_prefix("range: bytes=") {
                        da = r.trim().trim_end_matches('-').parse().unwrap_or(0);
                    }
                }
                let (stato, pezzo) = if da > 0 && !senza_range { ("206 Partial Content", &corpo[da..]) } else { ("200 OK", &corpo[..]) };
                let intestazioni = format!("HTTP/1.1 {stato}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", pezzo.len());
                let _ = f.write_all(intestazioni.as_bytes());
                match taglia_la_prima.filter(|_| numero == 0) {
                    Some(n) => {
                        let _ = f.write_all(&pezzo[..n.min(pezzo.len())]);
                    }
                    None => {
                        let _ = f.write_all(pezzo);
                    }
                }
            }
        });
        (url, connessioni)
    }

    pub fn sha_di(dati: &[u8]) -> String {
        Sha256::digest(dati).iter().map(|b| format!("{b:02x}")).collect()
    }

    fn dati(n: usize) -> Vec<u8> {
        (0..n).map(|i| (i * 7 % 251) as u8).collect()
    }

    fn scarica_prova(url: &str, dati: &[u8], sha: &str, dest: &Path) -> (Result<(), String>, Vec<u64>) {
        let mut visti = Vec::new();
        let esito = scarica(Fonte { url, sha256: sha, dimensione: dati.len() as u64 }, dest, &AtomicBool::new(false), &mut |n| visti.push(n));
        (esito, visti)
    }

    #[test]
    fn un_file_arriva_intero_con_l_avanzamento_e_solo_dopo_la_verifica() {
        let corpo = dati(700_000);
        let (url, _) = server(corpo.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("sotto").join("file.bin");
        let (esito, visti) = scarica_prova(&url, &corpo, &sha_di(&corpo), &dest);
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
        assert!(!parziale(&dest).exists());
        assert_eq!(*visti.last().unwrap(), 700_000);
        assert!(visti.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn se_la_rete_cade_a_meta_riprende_da_dove_era_e_non_riscarica_tutto() {
        let corpo = dati(900_000);
        let (url, connessioni) = server(corpo.clone(), Some(300_000), false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let (esito, visti) = scarica_prova(&url, &corpo, &sha_di(&corpo), &dest);
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
        assert_eq!(connessioni.load(Ordering::SeqCst), 2);
        // L'avanzamento non torna mai indietro: il secondo giro parte dai 300 mila byte già scritti.
        assert!(visti.windows(2).all(|w| w[0] < w[1]), "{visti:?}");
    }

    #[test]
    fn un_server_che_non_sa_riprendere_fa_ricominciare_da_zero_e_il_file_arriva_giusto() {
        let corpo = dati(500_000);
        let (url, _) = server(corpo.clone(), Some(100_000), true);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let (esito, _) = scarica_prova(&url, &corpo, &sha_di(&corpo), &dest);
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
    }

    #[test]
    fn un_file_con_l_impronta_sbagliata_non_arriva_al_suo_posto_e_si_toglie() {
        let corpo = dati(200_000);
        let (url, _) = server(corpo.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let (esito, _) = scarica_prova(&url, &corpo, &sha_di(b"un altro file"), &dest);
        let errore = esito.unwrap_err();
        assert!(errore.contains("non è quello atteso"), "{errore}");
        assert!(!dest.exists() && !parziale(&dest).exists());
    }

    #[test]
    fn un_parziale_di_un_altro_file_piu_lungo_non_si_riprende() {
        let corpo = dati(100_000);
        let (url, _) = server(corpo.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        std::fs::write(parziale(&dest), dati(150_000)).unwrap();
        let (esito, _) = scarica_prova(&url, &corpo, &sha_di(&corpo), &dest);
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
    }

    #[test]
    fn annullare_ferma_lo_scarico_e_tiene_il_parziale_per_dopo() {
        let corpo = dati(2_000_000);
        let (url, _) = server(corpo.clone(), None, false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let annulla = AtomicBool::new(false);
        let esito = scarica(Fonte { url: &url, sha256: &sha_di(&corpo), dimensione: corpo.len() as u64 }, &dest, &annulla, &mut |n| {
            if n > 300_000 {
                annulla.store(true, Ordering::SeqCst);
            }
        });
        assert_eq!(esito, Err("annullato".into()));
        assert!(!dest.exists());
        assert!(parziale(&dest).metadata().unwrap().len() > 0);
    }

    #[test]
    fn un_indirizzo_che_non_risponde_dice_perche_dopo_i_tentativi() {
        let t = tempfile::tempdir().unwrap();
        let libera = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let esito = scarica(Fonte { url: &format!("http://127.0.0.1:{libera}/x"), sha256: "00", dimensione: 10 }, &t.path().join("f"), &AtomicBool::new(false), &mut |_| {});
        assert!(esito.unwrap_err().contains("non riesco a scaricare"), "");
    }

    #[test]
    fn un_errore_di_rete_esce_nelle_due_lingue() {
        // Una porta su cui nessuno ascolta: la rete non risponde.
        let porta = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let url = format!("http://127.0.0.1:{porta}/file.bin");
        let t = tempfile::tempdir().unwrap();
        let mut file = File::create(t.path().join("file.bin")).unwrap();
        let mut prova = |lingua| crate::lingua::con(lingua, || giro(&url, 0, &mut file, &AtomicBool::new(false), &mut |_| {}).unwrap_err());
        assert!(prova(crate::lingua::Lingua::It).starts_with("la rete non risponde ("));
        assert!(prova(crate::lingua::Lingua::En).starts_with("the network is not responding ("));
    }
}
