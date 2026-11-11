//! Il proxy di un ufficio, finto: ascolta su una porta di questo computer, scrive quali `CONNECT` riceve, e poi fa quel che gli si chiede.
//! Il certificato che presenta nasce a ogni collegamento, per `scarichi.esempio.test`, firmato da una radice generata lì e subito buttata: nessun computer la conosce.
#![allow(dead_code)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

pub(crate) enum Modo {
    /// Apre il tunnel (o gira la richiesta in chiaro) verso questo indirizzo qualunque sia la destinazione chiesta: come un proxy che sa raggiungere il mondo.
    Inoltra(SocketAddr),
    /// Risponde a ogni `CONNECT` con questo codice, per esempio 407.
    Rifiuta(u16),
    /// Apre il tunnel e presenta un certificato firmato da una radice che il computer non conosce (un filtro che ispeziona il traffico cifrato).
    Ispeziona,
}

pub(crate) struct ProxyFinto {
    pub(crate) indirizzo: String,
    pub(crate) richieste: Arc<Mutex<Vec<String>>>,
}

impl ProxyFinto {
    pub(crate) fn avvia(modo: Modo) -> Self {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let indirizzo = format!("http://127.0.0.1:{}", ascolto.local_addr().unwrap().port());
        let richieste = Arc::new(Mutex::new(Vec::new()));
        let registro = richieste.clone();
        let modo = Arc::new(modo);
        std::thread::spawn(move || {
            for cliente in ascolto.incoming().flatten() {
                let (registro, modo) = (registro.clone(), modo.clone());
                std::thread::spawn(move || serve(cliente, &registro, &modo));
            }
        });
        ProxyFinto { indirizzo, richieste }
    }

    pub(crate) fn visti(&self) -> Vec<String> {
        self.richieste.lock().unwrap().clone()
    }
}

fn serve(cliente: TcpStream, registro: &Mutex<Vec<String>>, modo: &Modo) {
    let mut lettore = BufReader::new(cliente.try_clone().unwrap());
    let mut prima = String::new();
    if lettore.read_line(&mut prima).unwrap_or(0) == 0 {
        return;
    }
    registro.lock().unwrap().push(prima.trim().to_owned());
    let mut testa = prima.clone();
    loop {
        let mut riga = String::new();
        if lettore.read_line(&mut riga).unwrap_or(0) == 0 {
            break;
        }
        testa.push_str(&riga);
        if riga.trim().is_empty() {
            break;
        }
    }
    let mut cliente = cliente;
    match modo {
        Modo::Rifiuta(codice) => {
            let _ = write!(cliente, "HTTP/1.1 {codice} Proxy Authentication Required\r\nProxy-Authenticate: NTLM\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
        Modo::Inoltra(origine) => {
            let Ok(mut su) = TcpStream::connect(origine) else { return };
            if prima.starts_with("CONNECT ") {
                let _ = cliente.write_all(b"HTTP/1.1 200 Connection established\r\n\r\n");
            } else {
                // Una richiesta HTTP in chiaro passata al proxy com'è (con l'indirizzo intero): la gira al server.
                let _ = su.write_all(testa.as_bytes());
            }
            let mut su_in = su.try_clone().unwrap();
            std::thread::spawn(move || {
                let _ = std::io::copy(&mut lettore, &mut su_in);
            });
            let mut pezzo = [0u8; 16 * 1024];
            while let Ok(n) = su.read(&mut pezzo) {
                if n == 0 || cliente.write_all(&pezzo[..n]).is_err() {
                    break;
                }
            }
            // Chiude anche il lato del cliente: la copia in corso tiene aperta la sua presa.
            let _ = cliente.shutdown(std::net::Shutdown::Both);
        }
        Modo::Ispeziona => {
            let _ = cliente.write_all(b"HTTP/1.1 200 Connection established\r\n\r\n");
            let _ = presenta_il_certificato_dell_azienda(cliente);
        }
    }
}

fn presenta_il_certificato_dell_azienda(mut flusso: TcpStream) -> Result<(), Box<dyn std::error::Error>> {
    use rcgen::{BasicConstraints, CertificateParams, IsCa, Issuer, KeyPair};
    let chiave_radice = KeyPair::generate()?;
    let mut radice = CertificateParams::new(Vec::<String>::new())?;
    radice.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let certificato_radice = radice.self_signed(&chiave_radice)?;
    let chiave = KeyPair::generate()?;
    let foglia = CertificateParams::new(vec!["scarichi.esempio.test".to_owned()])?.signed_by(&chiave, &Issuer::from_params(&radice, &chiave_radice))?;
    let catena = vec![foglia.der().clone(), certificato_radice.der().clone()];
    let configurazione = rustls::ServerConfig::builder_with_provider(rustls::crypto::ring::default_provider().into()).with_safe_default_protocol_versions()?.with_no_client_auth().with_single_cert(catena, chiave.into())?;
    let mut collegamento = rustls::ServerConnection::new(configurazione.into())?;
    collegamento.complete_io(&mut flusso)?;
    Ok(())
}
