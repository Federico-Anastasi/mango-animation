//! L'audio che entra nella dettatura: PCM mono a 16 kHz, quello che si aspetta whisper. Viene dal microfono
//! (cpal, in Rust: la pagina non usa `getUserMedia`) oppure, per le prove, da un file WAV.

use super::Errore;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, sync_channel, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::Arc;
use std::time::Duration;

pub const SAMPLE_RATE: u32 = 16_000;
/// Un pezzo di file passa ogni 10 ms, come fa il microfono: la prova vede gli stessi tempi di chi parla.
const PEZZO_FILE: usize = SAMPLE_RATE as usize / 100;

/// Da dove viene l'audio.
pub enum Sorgente {
    Microfono,
    /// Solo per le prove: un WAV suonato al posto del microfono, in tempo reale.
    File(PathBuf),
}

/// L'audio che scorre: i pezzi, e il modo di fermare la sorgente.
pub struct Ingresso {
    pub pezzi: Receiver<Vec<f32>>,
    /// Diventa vero appena `fermo` cade. Chi legge i pezzi si ferma su questo, non sulla fine dei pezzi: il flusso del
    /// microfono, chiuso, non sempre lascia cadere subito il suo mittente.
    pub fermato: Arc<AtomicBool>,
    pub fermo: Fermo,
}

/// Finché esiste la sorgente è aperta; lasciarlo cadere la chiude.
pub struct Fermo {
    fermato: Arc<AtomicBool>,
    _canale: Sender<()>,
}

impl Drop for Fermo {
    fn drop(&mut self) {
        self.fermato.store(true, Ordering::SeqCst);
    }
}

pub fn apri(sorgente: Sorgente) -> Result<Ingresso, Errore> {
    let (tx, pezzi) = channel();
    let (ferma, fermata) = channel::<()>();
    match sorgente {
        Sorgente::Microfono => apri_microfono(tx, fermata)?,
        Sorgente::File(percorso) => {
            let (pcm, rate) = leggi_wav(&percorso)?;
            let pcm = Ricampiona::nuovo(rate).tutto(&pcm);
            std::thread::spawn(move || suona_file(pcm, tx, fermata));
        }
    }
    let fermato = Arc::new(AtomicBool::new(false));
    Ok(Ingresso { pezzi, fermato: fermato.clone(), fermo: Fermo { fermato, _canale: ferma } })
}

fn suona_file(pcm: Vec<f32>, tx: Sender<Vec<f32>>, fermata: Receiver<()>) {
    // in tempo reale sull'orologio, non sulle attese: su Windows un'attesa di 10 ms ne dura 15, e il file parlerebbe più lento
    let inizio = std::time::Instant::now();
    for (i, pezzo) in pcm.chunks(PEZZO_FILE).enumerate() {
        let quando = inizio + Duration::from_millis(10 * (i as u64 + 1));
        // la chiusura del mittente è l'alt
        if fermata.recv_timeout(quando.saturating_duration_since(std::time::Instant::now())) != Err(RecvTimeoutError::Timeout) || tx.send(pezzo.to_vec()).is_err() {
            return;
        }
    }
    // finito il file la sorgente resta aperta, in silenzio, finché non si ferma
    let _ = fermata.recv();
}

/// Tutto l'audio arrivato, non un pezzo solo: il microfono ne manda cento al secondo, e prenderne uno per giro lascia
/// l'audio sempre più indietro rispetto a chi parla. Aspetta al più `attesa` il primo; vero se la sorgente è finita.
pub fn prendi_tutto(pezzi: &Receiver<Vec<f32>>, da_dare: &mut Vec<f32>, attesa: Duration) -> bool {
    match pezzi.recv_timeout(attesa) {
        Ok(p) => da_dare.extend(p),
        Err(RecvTimeoutError::Timeout) => return false,
        Err(RecvTimeoutError::Disconnected) => return true,
    }
    loop {
        match pezzi.try_recv() {
            Ok(p) => da_dare.extend(p),
            Err(TryRecvError::Empty) => return false,
            Err(TryRecvError::Disconnected) => return true,
        }
    }
}

/// L'audio a 16 bit little-endian, come lo vuole il motore.
pub fn pcm16(campioni: &[f32]) -> Vec<u8> {
    campioni.iter().flat_map(|c| ((c.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes()).collect()
}

/// Quanto è forte l'audio, da 0 a 1 (radice della media dei quadrati, ingrandita: la voce normale sta sotto 0,2).
pub fn livello(pcm: &[f32]) -> f32 {
    if pcm.is_empty() {
        return 0.0;
    }
    ((pcm.iter().map(|v| v * v).sum::<f32>() / pcm.len() as f32).sqrt() * 4.0).min(1.0)
}

/// Il microfono di Windows predefinito. Il flusso di cpal non si sposta fra thread: vive in uno suo, che lo
/// tiene finché arriva l'alt, e dice qui se è riuscito ad aprirlo.
fn apri_microfono(tx: Sender<Vec<f32>>, fermata: Receiver<()>) -> Result<(), Errore> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let (esito_tx, esito) = sync_channel::<Result<(), Errore>>(1);
    std::thread::Builder::new()
        .name("voce-microfono".into())
        .spawn(move || {
            let negato = |dettaglio: String| Errore::new(
                "microfono_negato",
                format!("Non riesco a usare il microfono ({dettaglio}). Controlla in Windows che le app desktop possano usarlo."),
                format!("Cannot use the microphone ({dettaglio}). Check in Windows that desktop apps may use it."),
            );
            let aperto = (|| {
                let dispositivo = cpal::default_host()
                    .default_input_device()
                    .ok_or_else(|| {
                        Errore::new(
                            "microfono_assente",
                            "Non trovo nessun microfono: collegane uno, o sceglilo fra i dispositivi audio di Windows.",
                            "Cannot find a microphone: plug one in, or pick it among the Windows audio devices.",
                        )
                    })?;
                let config = dispositivo.default_input_config().map_err(|e| negato(e.to_string()))?;
                let canali = config.channels() as usize;
                let mut ricampiona = Ricampiona::nuovo(config.sample_rate());
                let errore = |e| eprintln!("[voce] errore del microfono: {e}");
                let flusso = match config.sample_format() {
                    cpal::SampleFormat::F32 => dispositivo.build_input_stream(config.config(), move |d: &[f32], _| manda(d, canali, &mut ricampiona, &tx), errore, None),
                    cpal::SampleFormat::I16 => dispositivo.build_input_stream(config.config(), move |d: &[i16], _| manda(d, canali, &mut ricampiona, &tx), errore, None),
                    cpal::SampleFormat::U16 => dispositivo.build_input_stream(config.config(), move |d: &[u16], _| manda(d, canali, &mut ricampiona, &tx), errore, None),
                    altro => return Err(negato(format!("formato audio {altro:?} non letto"))),
                }
                .map_err(|e| negato(e.to_string()))?;
                flusso.play().map_err(|e| negato(e.to_string()))?;
                Ok(flusso)
            })();
            match aperto {
                Ok(flusso) => {
                    let _ = esito_tx.send(Ok(()));
                    let _ = fermata.recv();
                    drop(flusso);
                }
                Err(e) => {
                    let _ = esito_tx.send(Err(e));
                }
            }
        })
        .map_err(|e| Errore::new("microfono_negato", format!("thread del microfono: {e}"), format!("microphone thread: {e}")))?;
    esito.recv().map_err(|_| Errore::new("microfono_negato", "Il microfono non risponde.", "The microphone is not responding."))?
}

fn manda<T: cpal::Sample>(dati: &[T], canali: usize, ricampiona: &mut Ricampiona, tx: &Sender<Vec<f32>>)
where
    f32: cpal::FromSample<T>,
{
    let mono: Vec<f32> = dati.chunks_exact(canali).map(|f| f.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / canali as f32).collect();
    let _ = tx.send(ricampiona.dai(&mono));
}

/// Ricampionamento a 16 kHz in streaming: ogni campione in uscita è la media dell'audio che copre.
pub struct Ricampiona {
    passo: f64,
    /// Dove finisce la finestra in uscita in corso, nelle unità dei campioni in ingresso.
    fine: f64,
    cursore: u64,
    somma: f64,
}

impl Ricampiona {
    pub fn nuovo(rate: u32) -> Self {
        let passo = rate as f64 / SAMPLE_RATE as f64;
        Ricampiona { passo, fine: passo, cursore: 0, somma: 0.0 }
    }

    pub fn dai(&mut self, mono: &[f32]) -> Vec<f32> {
        let mut fuori = Vec::with_capacity((mono.len() as f64 / self.passo) as usize + 1);
        for &x in mono {
            let (mut da, a) = (self.cursore as f64, (self.cursore + 1) as f64);
            while a - da > 1e-9 {
                let fino = a.min(self.fine);
                self.somma += x as f64 * (fino - da);
                da = fino;
                if self.fine - fino < 1e-9 {
                    fuori.push((self.somma / self.passo) as f32);
                    self.somma = 0.0;
                    self.fine += self.passo;
                }
            }
            self.cursore += 1;
        }
        fuori
    }

    pub fn tutto(mut self, mono: &[f32]) -> Vec<f32> {
        self.dai(mono)
    }
}

/// Un WAV PCM a 16 bit, di qualunque frequenza e numero di canali: l'audio mono e la sua frequenza.
pub fn leggi_wav(percorso: &Path) -> Result<(Vec<f32>, u32), Errore> {
    let illeggibile = |it: &str, en: &str| Errore::new("file_illeggibile", format!("{}: {it}", percorso.display()), format!("{}: {en}", percorso.display()));
    let byte = std::fs::read(percorso).map_err(|e| illeggibile(&e.to_string(), &e.to_string()))?;
    if byte.len() < 12 || &byte[..4] != b"RIFF" || &byte[8..12] != b"WAVE" {
        return Err(illeggibile("non è un WAV", "not a WAV"));
    }
    let (mut canali, mut rate, mut bit) = (0usize, 0u32, 0u16);
    let mut pos = 12;
    while pos + 8 <= byte.len() {
        let misura = u32::from_le_bytes(byte[pos + 4..pos + 8].try_into().unwrap()) as usize;
        let corpo = &byte[pos + 8..(pos + 8 + misura).min(byte.len())];
        match &byte[pos..pos + 4] {
            b"fmt " if corpo.len() >= 16 => {
                canali = u16::from_le_bytes([corpo[2], corpo[3]]) as usize;
                rate = u32::from_le_bytes(corpo[4..8].try_into().unwrap());
                bit = u16::from_le_bytes([corpo[14], corpo[15]]);
            }
            b"data" => {
                if canali == 0 || bit != 16 {
                    return Err(illeggibile("serve un WAV PCM a 16 bit", "a 16-bit PCM WAV is needed"));
                }
                let mono = corpo
                    .chunks_exact(2 * canali)
                    .map(|f| f.as_chunks::<2>().0.iter().map(|b| i16::from_le_bytes(*b) as f32 / 32768.0).sum::<f32>() / canali as f32)
                    .collect();
                return Ok((mono, rate));
            }
            _ => {}
        }
        pos += 8 + misura + (misura & 1);
    }
    Err(illeggibile("nel WAV non c'è l'audio", "there is no audio in the WAV"))
}

/// Un WAV PCM a 16 bit, per le prove.
#[cfg(test)]
pub(super) fn wav_di_prova(rate: u32, canali: u16, campioni: &[i16]) -> Vec<u8> {
    let dati: Vec<u8> = campioni.iter().flat_map(|s| s.to_le_bytes()).collect();
    let mut w = b"RIFF".to_vec();
    w.extend((36 + dati.len() as u32).to_le_bytes());
    w.extend(b"WAVEfmt ");
    w.extend(16u32.to_le_bytes());
    w.extend(1u16.to_le_bytes());
    w.extend(canali.to_le_bytes());
    w.extend(rate.to_le_bytes());
    w.extend((rate * 2 * canali as u32).to_le_bytes());
    w.extend((2 * canali).to_le_bytes());
    w.extend(16u16.to_le_bytes());
    w.extend(b"data");
    w.extend((dati.len() as u32).to_le_bytes());
    w.extend(dati);
    w
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seno(rate: u32, hz: f64, secondi: f64) -> Vec<f32> {
        (0..(rate as f64 * secondi) as usize).map(|i| (2.0 * std::f64::consts::PI * hz * i as f64 / rate as f64).sin() as f32).collect()
    }

    fn rms(x: &[f32]) -> f64 {
        (x.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / x.len() as f64).sqrt()
    }

    #[test]
    fn un_giro_prende_tutto_l_audio_arrivato_non_un_pezzo_solo() {
        let (tx, pezzi) = channel();
        for _ in 0..50 {
            tx.send(vec![0.0f32; 160]).unwrap();
        }
        let mut da_dare = Vec::new();
        assert!(!prendi_tutto(&pezzi, &mut da_dare, Duration::from_millis(30)));
        assert_eq!(da_dare.len(), 50 * 160);
        drop(tx);
        assert!(prendi_tutto(&pezzi, &mut da_dare, Duration::from_millis(30)));
    }

    #[test]
    fn l_audio_va_a_16_bit_little_endian() {
        assert_eq!(pcm16(&[0.0, 1.0, -1.0, 2.0]), vec![0, 0, 0xff, 0x7f, 0x01, 0x80, 0xff, 0x7f]);
        assert_eq!(pcm16(&vec![0.1; SAMPLE_RATE as usize / 10]).len(), 3200);
    }

    #[test]
    fn il_livello_va_da_zero_a_uno() {
        assert_eq!(livello(&[]), 0.0);
        assert_eq!(livello(&[0.0; 100]), 0.0);
        assert_eq!(livello(&[1.0; 100]), 1.0);
        assert!((livello(&[0.1; 100]) - 0.4).abs() < 1e-5);
    }

    #[test]
    fn ricampiona_conserva_durata_e_ampiezza() {
        for rate in [48_000, 44_100, 22_050, 16_000] {
            let y = Ricampiona::nuovo(rate).tutto(&seno(rate, 300.0, 1.0));
            assert!((y.len() as i64 - 16_000).abs() <= 1, "{rate}: {}", y.len());
            assert!((rms(&y) - std::f64::consts::FRAC_1_SQRT_2).abs() < 0.02, "{rate}: {}", rms(&y));
        }
    }

    #[test]
    fn ricampiona_a_pezzi_come_tutto_insieme() {
        let x = seno(44_100, 440.0, 0.5);
        let intero = Ricampiona::nuovo(44_100).tutto(&x);
        let mut r = Ricampiona::nuovo(44_100);
        let a_pezzi: Vec<f32> = x.chunks(441).flat_map(|p| r.dai(p)).collect();
        assert_eq!(intero.len(), a_pezzi.len());
        assert!(intero.iter().zip(&a_pezzi).all(|(a, b)| (a - b).abs() < 1e-5));
    }

    #[test]
    fn il_wav_stereo_diventa_mono() {
        let cartella = tempfile::tempdir().unwrap();
        let file = cartella.path().join("s.wav");
        std::fs::write(&file, wav_di_prova(22_050, 2, &[16384, -16384, 8192, 8192])).unwrap();
        let (mono, rate) = leggi_wav(&file).unwrap();
        assert_eq!(rate, 22_050);
        assert_eq!(mono, vec![0.0, 0.25]);
    }

    #[test]
    fn un_file_che_non_e_un_wav_e_un_errore() {
        let cartella = tempfile::tempdir().unwrap();
        let file = cartella.path().join("no.wav");
        std::fs::write(&file, b"non audio, e abbastanza lungo").unwrap();
        assert_eq!(leggi_wav(&file).unwrap_err().code, "file_illeggibile");
        assert_eq!(leggi_wav(&cartella.path().join("manca.wav")).unwrap_err().code, "file_illeggibile");
    }

    #[test]
    fn la_sorgente_file_da_l_audio_e_si_ferma() {
        let cartella = tempfile::tempdir().unwrap();
        let file = cartella.path().join("a.wav");
        std::fs::write(&file, wav_di_prova(16_000, 1, &vec![1000; 4_800])).unwrap();
        let Ingresso { pezzi, fermato, fermo } = apri(Sorgente::File(file)).unwrap();
        let primo = pezzi.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(primo.len(), PEZZO_FILE);
        assert!(!fermato.load(Ordering::SeqCst));
        drop(fermo);
        assert!(fermato.load(Ordering::SeqCst), "l'alt si sa subito, senza aspettare che i pezzi finiscano");
        // dopo l'alt il ricevitore si esaurisce
        while pezzi.recv_timeout(Duration::from_secs(2)).is_ok() {}
        assert!(pezzi.recv_timeout(Duration::from_millis(50)).is_err());
    }
}
