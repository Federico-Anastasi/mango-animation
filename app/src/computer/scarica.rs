//! Scaricare un file: riprende da dove era arrivato se la rete cade, e non lo mette al suo posto finché dimensione e impronta (SHA-256) non tornano.

use crate::lingua::t;
use crate::rete;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use ureq::Agent;

/// Quanti giri di fila, senza che arrivi un solo byte in più, prima di arrendersi.
const TENTATIVI: u32 = 4;

/// Cosa scaricare e come riconoscerlo.
#[derive(Clone, Copy)]
pub struct Fonte<'a> {
    pub url: &'a str,
    pub sha256: &'a str,
    pub dimensione: u64,
}

/// Dove sta ciò che di `destinazione` è già arrivato.
pub fn parziale(destinazione: &Path) -> PathBuf {
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

/// Perché un giro si è fermato prima della fine.
enum Fermo {
    Annullato,
    /// Riprovare darebbe lo stesso errore: il disco non scrive (pieno, o negato), o un filtro di rete presenta un certificato che il computer non riconosce.
    Definitivo(String),
    Rete(String),
}

/// Quanto la rete può tacere, in un giro, prima che lo scarico lo conti come caduto: un collegamento fermo senza chiudersi bloccherebbe lo scarico per sempre.
const SILENZIO_MASSIMO: Duration = Duration::from_secs(60);

/// Un giro di scarico: da `da` byte in poi, aggiungendo a `file`. Torna quando il corpo è finito, la rete cade o tace per `silenzio`.
fn giro(url: &str, da: u64, silenzio: Duration, file: &mut File, annulla: &AtomicBool, avanzamento: &mut dyn FnMut(u64)) -> Result<(), Fermo> {
    let agente = Agent::new_with_config(rete::configurazione(url).timeout_connect(Some(Duration::from_secs(20))).timeout_per_read(Some(silenzio)).build());
    let mut richiesta = agente.get(url);
    if da > 0 {
        richiesta = richiesta.header("Range", &format!("bytes={da}-"));
    }
    let risposta = richiesta
        .call()
        .map_err(|e| match e {
            // Un filtro aziendale o un certificato sconosciuto non passano riprovando.
            ureq::Error::StatusCode(codice) => Fermo::Rete(t(format!("il server ha risposto {codice}"), format!("the server answered {codice}"))),
            altro => match rete::spiega(&altro, url) {
                Some(frase) if rete::e_certificato(&altro) => Fermo::Definitivo(frase),
                Some(frase) => Fermo::Rete(frase),
                None => Fermo::Rete(t(format!("la rete non risponde ({altro})"), format!("the network is not responding ({altro})"))),
            },
        })?;
    let disco = |e: std::io::Error| Fermo::Definitivo(t(format!("non riesco a scrivere sul disco ({e}): libera dello spazio e riprova"), format!("I can't write to the disk ({e}): free some space and try again")));
    // Un server che non sa riprendere risponde 200 col file intero: si riparte da zero.
    let mut scritti = if da > 0 && risposta.status().as_u16() == 206 { da } else { 0 };
    if scritti == 0 {
        file.set_len(0).map_err(disco)?;
        std::io::Seek::seek(file, std::io::SeekFrom::Start(0)).map_err(disco)?;
    } else {
        std::io::Seek::seek(file, std::io::SeekFrom::End(0)).map_err(disco)?;
    }
    let mut corpo = risposta.into_body().into_reader();
    let mut blocco = vec![0u8; 256 * 1024];
    loop {
        if annulla.load(Ordering::SeqCst) {
            return Err(Fermo::Annullato);
        }
        let letti = corpo.read(&mut blocco).map_err(|e| Fermo::Rete(t(format!("la rete si è interrotta ({e})"), format!("the network was interrupted ({e})"))))?;
        if letti == 0 {
            return Ok(());
        }
        file.write_all(&blocco[..letti]).map_err(disco)?;
        scritti += letti as u64;
        avanzamento(scritti);
    }
}

/// Scarica `fonte` in `destinazione`, creando le cartelle che servono; `avanzamento` riceve i byte scaricati finora (anche quelli di un tentativo precedente).
/// Se la rete cade riprende da dove era: si arrende dopo quattro giri di fila senza un byte in più. Il file arriva al suo posto solo con dimensione e impronta giuste.
pub fn scarica(fonte: Fonte, destinazione: &Path, annulla: &AtomicBool, avanzamento: &mut dyn FnMut(u64)) -> Result<(), String> {
    if let Some(cartella) = destinazione.parent() {
        fs::create_dir_all(cartella).map_err(|e| t(format!("non riesco a creare {} ({e})", cartella.display()), format!("I can't create {} ({e})", cartella.display())))?;
    }
    let parte = parziale(destinazione);
    let mut ultimo_errore = String::new();
    let mut tentativo = 0;
    while tentativo < TENTATIVI {
        tentativo += 1;
        let mut file = OpenOptions::new().create(true).read(true).write(true).truncate(false).open(&parte).map_err(|e| t(format!("non riesco ad aprire {} ({e})", parte.display()), format!("I can't open {} ({e})", parte.display())))?;
        let gia = file.metadata().map_err(|e| e.to_string())?.len();
        // Un parziale più lungo del file è di un'altra cosa: si ricomincia.
        let da = if gia > fonte.dimensione { 0 } else { gia };
        if gia > 0 && gia == fonte.dimensione {
            drop(file);
        } else {
            match giro(fonte.url, da, SILENZIO_MASSIMO, &mut file, annulla, avanzamento) {
                Ok(()) => drop(file),
                Err(Fermo::Annullato) => return Err("annullato".into()),
                Err(Fermo::Definitivo(e)) => return Err(e),
                Err(Fermo::Rete(e)) => {
                    ultimo_errore = e;
                    // Una rete che cade ma intanto porta byte non sta fallendo: il conto riparte, e si riprova subito.
                    let arrivati = file.metadata().map_or(0, |m| m.len());
                    drop(file);
                    if arrivati > da {
                        tentativo = 0;
                    } else if tentativo < TENTATIVI {
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
    Err(t(
        format!("non riesco a scaricare {}: {ultimo_errore}. Riprova: riparte da dove era arrivato", fonte.url),
        format!("I can't download {}: {ultimo_errore}. Try again: it resumes where it stopped", fonte.url),
    ))
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
        server_che_taglia(corpo, taglia_la_prima.map(|n| (n, 1)), senza_range)
    }

    /// Come `server`, ma tagliano le prime `volte` connessioni, ognuna dopo `byte` byte.
    pub fn server_che_taglia(corpo: Vec<u8>, taglia: Option<(usize, usize)>, senza_range: bool) -> (String, Arc<AtomicUsize>) {
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
                match taglia.filter(|(_, volte)| numero < *volte) {
                    Some((n, _)) => {
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
    fn una_rete_che_cade_ma_porta_byte_ogni_volta_non_esaurisce_i_tentativi() {
        let corpo = dati(600_000);
        // Sei connessioni tagliate dopo 80 mila byte: più dei quattro giri, ma ognuna ha portato qualcosa.
        let (url, connessioni) = server_che_taglia(corpo.clone(), Some((80_000, 6)), false);
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let (esito, _) = scarica_prova(&url, &corpo, &sha_di(&corpo), &dest);
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
        assert!(connessioni.load(Ordering::SeqCst) > TENTATIVI as usize);
    }

    #[test]
    fn un_disco_che_non_scrive_ferma_lo_scarico_con_una_frase_che_dice_cosa_fare() {
        let corpo = dati(100_000);
        let (url, _) = server(corpo, None, false);
        let t = tempfile::tempdir().unwrap();
        let sola_lettura = t.path().join("f.bin");
        File::create(&sola_lettura).unwrap();
        let mut file = File::open(&sola_lettura).unwrap();
        let Err(Fermo::Definitivo(frase)) = giro(&url, 0, SILENZIO_MASSIMO, &mut file, &AtomicBool::new(false), &mut |_| {}) else { panic!("doveva fermarsi sul disco") };
        assert!(frase.starts_with("non riesco a scrivere sul disco") && frase.contains("libera dello spazio"), "{frase}");
    }

    #[test]
    fn un_indirizzo_che_non_risponde_dice_perche_dopo_i_tentativi() {
        let t = tempfile::tempdir().unwrap();
        let libera = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let esito = scarica(Fonte { url: &format!("http://127.0.0.1:{libera}/x"), sha256: "00", dimensione: 10 }, &t.path().join("f"), &AtomicBool::new(false), &mut |_| {});
        assert!(esito.unwrap_err().contains("non riesco a scaricare"), "");
    }

    fn porta_di(url: &str) -> u16 {
        url.rsplit(':').next().unwrap().split('/').next().unwrap().parse().unwrap()
    }

    #[test]
    fn dietro_un_proxy_lo_scarico_passa_dal_proxy_e_se_la_rete_cade_riprende_da_dove_era() {
        use crate::rete::{con_proxy_di_sistema, proxy_finto::{Modo, ProxyFinto}};
        let corpo = dati(900_000);
        let (url, connessioni) = server(corpo.clone(), Some(300_000), false);
        let porta = porta_di(&url);
        let proxy = ProxyFinto::avvia(Modo::Inoltra(format!("127.0.0.1:{porta}").parse().unwrap()));
        // Per l'app il server sta su un indirizzo esterno: arriva solo perché il proxy lo sa raggiungere.
        let esterno = format!("http://scarichi.esempio.test:{porta}/file");
        let t = tempfile::tempdir().unwrap();
        let dest = t.path().join("file.bin");
        let (esito, visti) = con_proxy_di_sistema(&proxy.indirizzo, || scarica_prova(&esterno, &corpo, &sha_di(&corpo), &dest));
        assert_eq!(esito, Ok(()));
        assert_eq!(std::fs::read(&dest).unwrap(), corpo);
        assert_eq!(connessioni.load(Ordering::SeqCst), 2);
        assert_eq!(proxy.visti(), vec![format!("CONNECT scarichi.esempio.test:{porta} HTTP/1.1"); 2]);
        assert!(visti.windows(2).all(|w| w[0] < w[1]), "{visti:?}");
    }

    #[test]
    fn un_filtro_con_un_certificato_sconosciuto_ferma_lo_scarico_subito_con_la_frase_per_l_utente() {
        use crate::rete::{con_proxy_di_sistema, proxy_finto::{Modo, ProxyFinto}};
        let proxy = ProxyFinto::avvia(Modo::Ispeziona);
        let t = tempfile::tempdir().unwrap();
        let inizio = std::time::Instant::now();
        let esito = con_proxy_di_sistema(&proxy.indirizzo, || {
            scarica(Fonte { url: "https://scarichi.esempio.test/file", sha256: "00", dimensione: 10 }, &t.path().join("f"), &AtomicBool::new(false), &mut |_| {})
        });
        let frase = esito.unwrap_err();
        assert!(frase.starts_with("La rete di questo computer passa da un filtro aziendale"), "{frase}");
        // Una sola prova, senza le attese fra un tentativo e l'altro: riprovare non cambierebbe nulla.
        assert_eq!(proxy.visti().len(), 1);
        assert!(inizio.elapsed() < Duration::from_secs(3), "{:?}", inizio.elapsed());
    }

    #[test]
    fn una_rete_che_tace_a_meta_non_blocca_lo_scarico_per_sempre() {
        // Il server manda le intestazioni e 100 byte, poi tace senza chiudere.
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://127.0.0.1:{}/file", ascolto.local_addr().unwrap().port());
        std::thread::spawn(move || {
            let (mut f, _) = ascolto.accept().unwrap();
            let mut buf = [0u8; 2048];
            let _ = std::io::Read::read(&mut f, &mut buf);
            let _ = f.write_all(b"HTTP/1.1 200 OK
Content-Length: 1000

");
            let _ = f.write_all(&[7u8; 100]);
            std::thread::sleep(Duration::from_secs(30));
        });
        let t = tempfile::tempdir().unwrap();
        let mut file = File::create(t.path().join("file.bin")).unwrap();
        let inizio = std::time::Instant::now();
        let Err(Fermo::Rete(frase)) = giro(&url, 0, Duration::from_millis(700), &mut file, &AtomicBool::new(false), &mut |_| {}) else { panic!("doveva cadere la rete") };
        assert!(frase.starts_with("la rete si è interrotta"), "{frase}");
        assert!(inizio.elapsed() < Duration::from_secs(5), "{:?}", inizio.elapsed());
        assert_eq!(file.metadata().unwrap().len(), 100);
    }

    #[test]
    fn un_errore_di_rete_esce_nelle_due_lingue() {
        // Una porta su cui nessuno ascolta: la rete non risponde.
        let porta = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let url = format!("http://127.0.0.1:{porta}/file.bin");
        let t = tempfile::tempdir().unwrap();
        let mut file = File::create(t.path().join("file.bin")).unwrap();
        let mut prova = |lingua| {
            crate::lingua::con(lingua, || match giro(&url, 0, SILENZIO_MASSIMO, &mut file, &AtomicBool::new(false), &mut |_| {}) {
                Err(Fermo::Rete(e)) => e,
                _ => panic!("doveva essere la rete"),
            })
        };
        assert!(prova(crate::lingua::Lingua::It).starts_with("la rete non risponde ("));
        assert!(prova(crate::lingua::Lingua::En).starts_with("the network is not responding ("));
    }
}
