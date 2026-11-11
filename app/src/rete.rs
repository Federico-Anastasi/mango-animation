//! La rete in uscita dell'app: un solo posto dice come si esce (proxy e certificati) e come si spiega un errore.
//! Ogni chiamata HTTP dell'app parte da `configurazione`: certificati di Windows, e il proxy che Windows (o le variabili `HTTPS_PROXY` / `NO_PROXY`) indica per quell'indirizzo.
//! Le chiamate verso questo computer (`127.0.0.1`, `localhost`) non passano mai dal proxy.

use crate::lingua::t;
use std::ffi::OsString;
use std::net::IpAddr;
use std::time::Duration;
use tauri::Url;
use ureq::config::ConfigBuilder;
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
use ureq::typestate::AgentScope;
use ureq::{Agent, Proxy};

/// Da dove si sa quale proxy usare: le variabili d'ambiente e le impostazioni di Windows. Le prove ne mettono di finte.
pub(crate) struct Fonti<'a> {
    pub variabile: &'a dyn Fn(&str) -> Option<String>,
    pub sistema: &'a dyn Fn(&Url) -> Option<String>,
}

fn variabile_vera(nome: &str) -> Option<String> {
    std::env::var(nome).ok().map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

#[cfg(test)]
thread_local! {
    /// Le prove che passano da funzioni che non prendono le `Fonti` (lo scarico, l'invio) indicano qui il proxy di sistema finto di questo thread; le variabili d'ambiente non contano.
    static PROXY_DI_PROVA: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// Esegue `f` con questo come proxy di sistema di Windows (e nessuna variabile d'ambiente), solo in questo thread.
#[cfg(test)]
pub(crate) fn con_proxy_di_sistema<R>(proxy: &str, f: impl FnOnce() -> R) -> R {
    PROXY_DI_PROVA.with(|p| *p.borrow_mut() = Some(proxy.to_owned()));
    let esito = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
    PROXY_DI_PROVA.with(|p| *p.borrow_mut() = None);
    esito.unwrap_or_else(|e| std::panic::resume_unwind(e))
}

fn con_le_fonti_vere<R>(f: impl FnOnce(&Fonti) -> R) -> R {
    #[cfg(test)]
    if let Some(proxy) = PROXY_DI_PROVA.with(|p| p.borrow().clone()) {
        return f(&Fonti { variabile: &|_| None, sistema: &|_| Some(proxy.clone()) });
    }
    f(&Fonti { variabile: &variabile_vera, sistema: &proxy_di_windows })
}

/// Il punto di partenza di ogni agente HTTP dell'app: chi chiama aggiunge le attese e costruisce.
pub fn configurazione(url: &str) -> ConfigBuilder<AgentScope> {
    con_le_fonti_vere(|fonti| configurazione_con(url, fonti))
}

pub(crate) fn configurazione_con(url: &str, fonti: &Fonti) -> ConfigBuilder<AgentScope> {
    let proxy = proxy_per_con(url, fonti).and_then(|p| Proxy::new(&p).ok());
    let tls = TlsConfig::builder().provider(TlsProvider::Rustls).root_certs(RootCerts::PlatformVerifier).build();
    Agent::config_builder().user_agent("mango-animation").proxy(proxy).tls_config(tls)
}

/// Un agente il cui giro intero (collegarsi, chiedere, ricevere) non dura più di `attesa`.
pub fn agente(url: &str, attesa: Duration) -> Agent {
    Agent::new_with_config(configurazione(url).timeout_global(Some(attesa)).build())
}

/// Le variabili con cui i programmi che l'app lancia per scaricare (`uv`, `bun`, Playwright) escono dal proxy di Windows: loro leggono solo `HTTPS_PROXY`. Se il creator ne ha già una, vale la sua.
/// Vale il proxy che Windows indica per `pypi.org`, uno dei posti da cui scaricano.
pub fn variabili_per_i_programmi() -> Vec<(OsString, OsString)> {
    con_le_fonti_vere(variabili_per_i_programmi_con)
}

fn variabili_per_i_programmi_con(fonti: &Fonti) -> Vec<(OsString, OsString)> {
    let gia = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"].iter().any(|n| (fonti.variabile)(n).is_some());
    match Url::parse("https://pypi.org/").ok().filter(|_| !gia).and_then(|u| (fonti.sistema)(&u)) {
        Some(proxy) => ["HTTPS_PROXY", "HTTP_PROXY"].map(|n| (n.into(), proxy.clone().into())).into(),
        None => Vec::new(),
    }
}

/// Il proxy per questo indirizzo (`http://host:porta`), se ce n'è uno.
pub fn proxy_per(url: &str) -> Option<String> {
    con_le_fonti_vere(|fonti| proxy_per_con(url, fonti))
}

fn proxy_per_con(url: &str, fonti: &Fonti) -> Option<String> {
    let url = Url::parse(url).ok()?;
    let host = url.host_str()?.trim_matches(['[', ']']).to_ascii_lowercase();
    if e_di_questo_computer(&host) {
        return None;
    }
    let da_non_passare = |elenco: &str| escluso(&host, elenco);
    if (fonti.variabile)("NO_PROXY").or_else(|| (fonti.variabile)("no_proxy")).is_some_and(|e| da_non_passare(&e)) {
        return None;
    }
    let nomi: &[&str] = if url.scheme() == "https" { &["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] } else { &["HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"] };
    if let Some(proxy) = nomi.iter().find_map(|n| (fonti.variabile)(n)) {
        return Some(con_schema(&proxy));
    }
    (fonti.sistema)(&url)
}

fn e_di_questo_computer(host: &str) -> bool {
    host == "localhost" || host.ends_with(".localhost") || host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

/// `host` sta nell'elenco di chi non passa dal proxy? L'elenco è quello di `NO_PROXY` (separato da virgole) o quello di Windows (da punti e virgola): `*`, `<local>` (nomi senza punti),
/// nomi interi (valgono anche per i loro sottodomini), `.dominio`, e modelli con `*` come `10.*`.
fn escluso(host: &str, elenco: &str) -> bool {
    elenco.split([',', ';', ' ']).map(|v| v.trim().to_ascii_lowercase()).filter(|v| !v.is_empty()).any(|voce| {
        let voce = voce.split_once("://").map_or(voce.as_str(), |(_, resto)| resto);
        let voce = voce.rsplit_once(':').filter(|(_, porta)| porta.bytes().all(|b| b.is_ascii_digit())).map_or(voce, |(nome, _)| nome);
        match voce {
            "*" => true,
            "<local>" => !host.contains('.'),
            _ if voce.contains('*') => corrisponde(voce, host),
            _ => host == voce.trim_start_matches('.') || host.ends_with(&format!(".{}", voce.trim_start_matches('.'))),
        }
    })
}

/// Il modello con `*` (qualunque sequenza) corrisponde a tutto `testo`?
fn corrisponde(modello: &str, testo: &str) -> bool {
    let pezzi: Vec<&str> = modello.split('*').collect();
    let (primo, ultimo) = (pezzi[0], pezzi[pezzi.len() - 1]);
    if !testo.starts_with(primo) || testo.len() < primo.len() + ultimo.len() || !testo.ends_with(ultimo) {
        return false;
    }
    let mut resto = &testo[primo.len()..testo.len() - ultimo.len()];
    for pezzo in &pezzi[1..pezzi.len() - 1] {
        match resto.find(pezzo) {
            Some(i) => resto = &resto[i + pezzo.len()..],
            None => return false,
        }
    }
    true
}

fn con_schema(proxy: &str) -> String {
    if proxy.contains("://") {
        proxy.to_owned()
    } else {
        format!("http://{proxy}")
    }
}

/// Dall'elenco dei proxy di Windows (`host:porta`, oppure `http=a:1;https=b:2`, a volte più voci) quello per lo schema dell'indirizzo; i SOCKS non si usano.
fn voce_per(elenco: &str, schema: &str) -> Option<String> {
    let voci: Vec<&str> = elenco.split([';', ' ']).map(str::trim).filter(|v| !v.is_empty()).collect();
    let del_suo_schema = voci.iter().find_map(|v| v.split_once('=').filter(|(nome, _)| nome.eq_ignore_ascii_case(schema)).map(|(_, valore)| valore));
    let senza_nome = voci.iter().find(|v| !v.contains('=') || v.contains("://")).copied();
    del_suo_schema.or(senza_nome).map(con_schema)
}

/// Le impostazioni proxy di Windows di questo utente, per questo indirizzo: lo script di configurazione automatica o il rilevamento (lo risolve WinHTTP), altrimenti il proxy a mano con la sua lista di esclusioni.
#[cfg(windows)]
fn proxy_di_windows(url: &Url) -> Option<String> {
    use windows::core::{w, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{GlobalFree, HGLOBAL};
    use windows::Win32::Networking::WinHttp::*;

    fn testo(p: PWSTR) -> Option<String> {
        // SAFETY: WinHTTP dà stringhe terminate da zero, oppure nulle.
        (!p.is_null()).then(|| unsafe { p.to_string().ok() }).flatten()
    }
    fn larghe(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    // SAFETY: le strutture sono inizializzate a zero e riempite da WinHTTP; le stringhe che WinHTTP alloca si liberano con GlobalFree, una volta, dopo averle copiate.
    unsafe {
        let mut impostazioni = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
        WinHttpGetIEProxyConfigForCurrentUser(&mut impostazioni).ok()?;
        let (rilevamento, script, manuale, esclusi) = (impostazioni.fAutoDetect.as_bool(), testo(impostazioni.lpszAutoConfigUrl), testo(impostazioni.lpszProxy), testo(impostazioni.lpszProxyBypass));
        for p in [impostazioni.lpszAutoConfigUrl, impostazioni.lpszProxy, impostazioni.lpszProxyBypass] {
            if !p.is_null() {
                let _ = GlobalFree(HGLOBAL(p.0.cast()));
            }
        }

        if rilevamento || script.is_some() {
            let sessione = WinHttpOpen(w!("Mango Animation"), WINHTTP_ACCESS_TYPE_NO_PROXY, PCWSTR::null(), PCWSTR::null(), 0);
            if !sessione.is_null() {
                let script_largo = script.as_deref().map(larghe);
                let mut opzioni = WINHTTP_AUTOPROXY_OPTIONS { fAutoLogonIfChallenged: true.into(), ..Default::default() };
                if rilevamento {
                    opzioni.dwFlags |= WINHTTP_AUTOPROXY_AUTO_DETECT;
                    opzioni.dwAutoDetectFlags = WINHTTP_AUTO_DETECT_TYPE_DHCP | WINHTTP_AUTO_DETECT_TYPE_DNS_A;
                }
                if let Some(s) = &script_largo {
                    opzioni.dwFlags |= WINHTTP_AUTOPROXY_CONFIG_URL;
                    opzioni.lpszAutoConfigUrl = PCWSTR(s.as_ptr());
                }
                let indirizzo = larghe(url.as_str());
                let mut info = WINHTTP_PROXY_INFO::default();
                let riuscito = WinHttpGetProxyForUrl(sessione, PCWSTR(indirizzo.as_ptr()), &mut opzioni, &mut info).is_ok();
                let risposta = riuscito.then(|| (info.dwAccessType, testo(info.lpszProxy)));
                for p in [info.lpszProxy, info.lpszProxyBypass] {
                    if !p.is_null() {
                        let _ = GlobalFree(HGLOBAL(p.0.cast()));
                    }
                }
                let _ = WinHttpCloseHandle(sessione);
                // Lo script ha risposto: la sua parola vale, anche quando dice «direttamente».
                if let Some((tipo, elenco)) = risposta {
                    return if tipo == WINHTTP_ACCESS_TYPE_NAMED_PROXY { elenco.and_then(|e| voce_per(&e, url.scheme())) } else { None };
                }
            }
        }

        let host = url.host_str()?.to_ascii_lowercase();
        if esclusi.as_deref().is_some_and(|e| escluso(&host, e)) {
            return None;
        }
        manuale.and_then(|m| voce_per(&m, url.scheme()))
    }
}

#[cfg(not(windows))]
fn proxy_di_windows(_: &Url) -> Option<String> {
    None
}

/// Una frase per l'utente quando la rete fallisce per il proxy o per un certificato che il computer non riconosce; `None` per ogni altro errore.
pub fn spiega(errore: &ureq::Error, url: &str) -> Option<String> {
    spiega_con(errore, url, proxy_per(url))
}

/// Il collegamento è fallito perché il certificato del server (o di un filtro in mezzo) non è accettato da Windows? Vale per gli errori di `ureq` e per qualunque errore che lo porti nella sua catena di cause.
pub fn e_certificato(errore: &(dyn std::error::Error + 'static)) -> bool {
    // Dal collegamento cifrato l'errore del certificato arriva dentro un errore di I/O.
    fn della_fiducia(e: &(dyn std::error::Error + 'static)) -> bool {
        match (e.downcast_ref::<rustls::Error>(), e.downcast_ref::<std::io::Error>().and_then(|io| io.get_ref())) {
            (Some(r), _) => matches!(r, rustls::Error::InvalidCertificate(_)),
            (None, Some(dentro)) => dentro.downcast_ref::<rustls::Error>().is_some_and(|r| matches!(r, rustls::Error::InvalidCertificate(_))),
            _ => false,
        }
    }
    let mut corrente = Some(errore);
    while let Some(e) = corrente {
        let dentro_ureq: Option<&(dyn std::error::Error + 'static)> = match e.downcast_ref::<ureq::Error>() {
            Some(ureq::Error::Io(io)) => Some(io),
            Some(ureq::Error::Rustls(r)) => Some(r),
            _ => None,
        };
        if della_fiducia(e) || dentro_ureq.is_some_and(della_fiducia) {
            return true;
        }
        corrente = e.source();
    }
    false
}

/// La frase per l'utente quando un certificato non è accettato.
pub fn frase_certificato() -> String {
    t(
        "La rete di questo computer passa da un filtro aziendale: il certificato che presenta non è tra quelli che Windows accetta. Chiedi a chi gestisce il computer di installare in Windows il certificato dell'azienda (Mango Animation usa quelli di Windows), oppure riprova da un'altra rete.",
        "This computer's network goes through a company filter: the certificate it presents is not among those Windows accepts. Ask whoever manages the computer to install the company certificate in Windows (Mango Animation uses Windows's own), or try again from another network.",
    )
}

fn spiega_con(errore: &ureq::Error, url: &str, proxy: Option<String>) -> Option<String> {
    let host = Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_else(|| url.to_owned());
    let proxy = proxy.map(|p| p.trim_start_matches("http://").trim_end_matches('/').to_owned());
    if e_certificato(errore) {
        return Some(frase_certificato());
    }
    match (errore, proxy) {
        (ureq::Error::ConnectProxyFailed(_), Some(proxy)) => Some(t(
            format!("Il proxy di questo computer ({proxy}) ha rifiutato la connessione a {host}: forse chiede nome utente e password, o non lascia passare questo sito. Chiedi a chi gestisce la rete di far passare {host}, oppure riprova da un'altra rete."),
            format!("This computer's proxy ({proxy}) refused the connection to {host}: it may ask for a user name and password, or not allow this site. Ask whoever manages the network to let {host} through, or try again from another network."),
        )),
        (ureq::Error::Io(_) | ureq::Error::Timeout(_) | ureq::Error::HostNotFound | ureq::Error::ConnectionFailed, Some(proxy)) => Some(t(
            format!("Non riesco a raggiungere {host} passando dal proxy di questo computer ({proxy}). Controlla le impostazioni proxy di Windows, oppure riprova da un'altra rete."),
            format!("I can't reach {host} through this computer's proxy ({proxy}). Check Windows's proxy settings, or try again from another network."),
        )),
        _ => None,
    }
}

#[cfg(test)]
#[path = "../prove/rete/proxy_finto.rs"]
pub(crate) mod proxy_finto;

#[cfg(test)]
mod prove {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};

    fn ambiente<'a>(variabili: &'a HashMap<&'a str, &'a str>) -> impl Fn(&str) -> Option<String> + 'a {
        move |n| variabili.get(n).map(|v| (*v).to_owned())
    }

    fn proxy(url: &str, variabili: &[(&str, &str)], sistema: Option<&str>) -> Option<String> {
        let mappa: HashMap<_, _> = variabili.iter().copied().collect();
        let var = ambiente(&mappa);
        let sis = |_: &Url| sistema.map(str::to_owned);
        proxy_per_con(url, &Fonti { variabile: &var, sistema: &sis })
    }

    #[test]
    fn senza_proxy_si_esce_direttamente() {
        assert_eq!(proxy("https://huggingface.co/x", &[], None), None);
    }

    #[test]
    fn il_proxy_di_windows_vale_quando_le_variabili_non_ci_sono() {
        assert_eq!(proxy("https://huggingface.co/x", &[], Some("http://proxy.azienda:8080")).as_deref(), Some("http://proxy.azienda:8080"));
    }

    #[test]
    fn le_variabili_vincono_sul_proxy_di_windows_e_ognuna_per_il_suo_schema() {
        let v = [("HTTPS_PROXY", "cifrato.azienda:3128"), ("HTTP_PROXY", "http://chiaro.azienda:3129")];
        assert_eq!(proxy("https://huggingface.co/x", &v, Some("http://windows:1")).as_deref(), Some("http://cifrato.azienda:3128"));
        assert_eq!(proxy("http://esempio.it/x", &v, Some("http://windows:1")).as_deref(), Some("http://chiaro.azienda:3129"));
        assert_eq!(proxy("https://huggingface.co/x", &[("ALL_PROXY", "tutto.azienda:1")], None).as_deref(), Some("http://tutto.azienda:1"));
    }

    #[test]
    fn verso_questo_computer_il_proxy_non_si_usa_mai() {
        let v = [("ALL_PROXY", "http://proxy.azienda:8080")];
        for url in ["http://127.0.0.1:47431/api/lavori", "http://localhost:8080/", "http://[::1]:9/", "http://127.9.9.9/x", "https://studio.localhost/"] {
            assert_eq!(proxy(url, &v, Some("http://windows:1")), None, "{url}");
        }
    }

    #[test]
    fn no_proxy_esclude_gli_host_elencati_e_i_loro_sottodomini() {
        let v = [("HTTPS_PROXY", "http://proxy.azienda:8080"), ("NO_PROXY", "interno.azienda, .cdn.esempio.it,10.*")];
        assert_eq!(proxy("https://interno.azienda/x", &v, None), None);
        assert_eq!(proxy("https://modelli.interno.azienda/x", &v, None), None);
        assert_eq!(proxy("https://a.cdn.esempio.it/x", &v, None), None);
        assert_eq!(proxy("https://10.1.2.3/x", &v, None), None);
        assert_eq!(proxy("https://huggingface.co/x", &v, None).as_deref(), Some("http://proxy.azienda:8080"));
        // `NO_PROXY` vale anche per il proxy di Windows.
        assert_eq!(proxy("https://interno.azienda/x", &[("no_proxy", "interno.azienda")], Some("http://windows:1")), None);
    }

    #[test]
    fn l_elenco_di_windows_dice_cosa_non_passa_dal_proxy() {
        assert!(escluso("stampante", "<local>"));
        assert!(!escluso("huggingface.co", "<local>"));
        assert!(escluso("sito.interno.azienda", "*.azienda;<local>"));
        assert!(escluso("192.168.1.5", "10.*;192.168.*"));
        assert!(!escluso("192.169.1.5", "10.*;192.168.*"));
        assert!(escluso("qualunque.it", "*"));
        assert!(escluso("esempio.it", "https://esempio.it:443"));
        assert!(!escluso("esempio.it", ""));
        assert!(corrisponde("a*c*e", "abcde") && !corrisponde("a*c*e", "abde") && corrisponde("*", "x"));
    }

    #[test]
    fn dalla_lista_di_windows_si_prende_la_voce_dello_schema() {
        assert_eq!(voce_per("proxy.azienda:8080", "https").as_deref(), Some("http://proxy.azienda:8080"));
        assert_eq!(voce_per("http=a:1;https=b:2;ftp=c:3", "https").as_deref(), Some("http://b:2"));
        assert_eq!(voce_per("http=a:1;https=b:2", "http").as_deref(), Some("http://a:1"));
        assert_eq!(voce_per("http=a:1", "https"), None);
        assert_eq!(voce_per("socks=s:1080", "https"), None);
        assert_eq!(voce_per("a:1 b:2", "https").as_deref(), Some("http://a:1"));
        assert_eq!(voce_per("https://sicuro:443", "https").as_deref(), Some("https://sicuro:443"));
    }

    /// Un server dell'azienda finto: risponde `ciao` a qualunque richiesta.
    fn origine() -> SocketAddr {
        let ascolto = TcpListener::bind("127.0.0.1:0").unwrap();
        let indirizzo = ascolto.local_addr().unwrap();
        std::thread::spawn(move || {
            for mut flusso in ascolto.incoming().flatten() {
                let mut buf = [0u8; 4096];
                let _ = flusso.read(&mut buf);
                let _ = flusso.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nciao");
            }
        });
        indirizzo
    }

    fn scarica_con(url: &str, variabili: &[(&str, &str)], sistema: Option<&str>) -> Result<String, ureq::Error> {
        let mappa: HashMap<_, _> = variabili.iter().copied().collect();
        let var = ambiente(&mappa);
        let sis = |_: &Url| sistema.map(str::to_owned);
        let agente = Agent::new_with_config(configurazione_con(url, &Fonti { variabile: &var, sistema: &sis }).timeout_global(Some(Duration::from_secs(10))).build());
        agente.get(url).call()?.into_body().read_to_string()
    }

    #[test]
    fn uno_scarico_verso_un_host_esterno_passa_dal_proxy_configurato() {
        let proxy = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Inoltra(origine()));
        assert_eq!(scarica_con("http://scarichi.esempio.test:8080/file", &[], Some(&proxy.indirizzo)).unwrap(), "ciao");
        assert_eq!(proxy.visti(), ["CONNECT scarichi.esempio.test:8080 HTTP/1.1"]);
        // Lo stesso con il proxy nelle variabili d'ambiente.
        let altro = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Inoltra(origine()));
        assert_eq!(scarica_con("http://scarichi.esempio.test/file", &[("HTTP_PROXY", &altro.indirizzo)], None).unwrap(), "ciao");
        assert_eq!(altro.visti(), ["CONNECT scarichi.esempio.test:80 HTTP/1.1"]);
    }

    #[test]
    fn una_chiamata_a_questo_computer_non_passa_dal_proxy() {
        let proxy = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Rifiuta(502));
        let porta = origine().port();
        for host in ["127.0.0.1", "localhost"] {
            let url = format!("http://{host}:{porta}/api/lavori");
            assert_eq!(scarica_con(&url, &[("ALL_PROXY", &proxy.indirizzo)], Some(&proxy.indirizzo)).unwrap(), "ciao", "{host}");
        }
        assert!(proxy.visti().is_empty(), "{:?}", proxy.visti());
    }

    #[test]
    fn no_proxy_tiene_un_host_fuori_dal_proxy() {
        let proxy = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Rifiuta(502));
        // Il nome non esiste: se non passa dal proxy, l'errore è del DNS e il proxy non vede nulla.
        let esito = scarica_con("http://assente.esempio.invalid/x", &[("HTTP_PROXY", &proxy.indirizzo), ("NO_PROXY", "esempio.invalid")], None);
        assert!(esito.is_err());
        assert!(proxy.visti().is_empty(), "{:?}", proxy.visti());
    }

    #[test]
    fn un_certificato_di_una_radice_che_il_computer_non_conosce_e_rifiutato_con_la_frase_giusta() {
        let proxy = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Ispeziona);
        let url = "https://scarichi.esempio.test/file";
        let errore = scarica_con(url, &[], Some(&proxy.indirizzo)).unwrap_err();
        assert!(e_certificato(&errore), "{errore:?}");
        let it = crate::lingua::con(crate::lingua::Lingua::It, || spiega_con(&errore, url, Some(proxy.indirizzo.clone())).unwrap());
        let en = crate::lingua::con(crate::lingua::Lingua::En, || spiega_con(&errore, url, Some(proxy.indirizzo.clone())).unwrap());
        assert!(it.starts_with("La rete di questo computer passa da un filtro aziendale") && it.contains("installare in Windows il certificato"), "{it}");
        assert!(en.starts_with("This computer's network goes through a company filter") && en.contains("install the company certificate in Windows"), "{en}");
    }

    #[test]
    fn un_proxy_che_rifiuta_lo_dice_con_il_suo_indirizzo() {
        let proxy = proxy_finto::ProxyFinto::avvia(proxy_finto::Modo::Rifiuta(407));
        let url = "http://scarichi.esempio.test/file";
        let errore = scarica_con(url, &[], Some(&proxy.indirizzo)).unwrap_err();
        let frase = crate::lingua::con(crate::lingua::Lingua::It, || spiega_con(&errore, url, Some(proxy.indirizzo.clone())).unwrap());
        assert!(frase.starts_with("Il proxy di questo computer (127.0.0.1:") && frase.contains("ha rifiutato la connessione a scarichi.esempio.test"), "{frase}");
    }

    #[test]
    fn un_proxy_irraggiungibile_non_si_confonde_con_un_sito_che_non_risponde() {
        let porta = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let proxy = format!("http://127.0.0.1:{porta}");
        let url = "http://scarichi.esempio.test/file";
        let errore = scarica_con(url, &[], Some(&proxy)).unwrap_err();
        let frase = crate::lingua::con(crate::lingua::Lingua::It, || spiega_con(&errore, url, Some(proxy.clone())).unwrap());
        assert!(frase.contains("passando dal proxy di questo computer") && frase.contains("Controlla le impostazioni proxy di Windows"), "{frase}");
        // Senza proxy, un errore di rete qualunque non ha una frase sua.
        assert_eq!(spiega_con(&errore, url, None), None);
    }

    #[test]
    fn i_programmi_lanciati_dall_app_ricevono_il_proxy_di_windows_se_il_creator_non_ha_messo_il_suo() {
        let sistema = |_: &Url| Some("http://proxy.azienda:8080".to_owned());
        let nessuna = |_: &str| None;
        let con_la_sua = |n: &str| (n == "HTTPS_PROXY").then(|| "http://suo:1".to_owned());
        let attese: Vec<(OsString, OsString)> = vec![("HTTPS_PROXY".into(), "http://proxy.azienda:8080".into()), ("HTTP_PROXY".into(), "http://proxy.azienda:8080".into())];
        assert_eq!(variabili_per_i_programmi_con(&Fonti { variabile: &nessuna, sistema: &sistema }), attese);
        assert!(variabili_per_i_programmi_con(&Fonti { variabile: &con_la_sua, sistema: &sistema }).is_empty());
        assert!(variabili_per_i_programmi_con(&Fonti { variabile: &nessuna, sistema: &|_: &Url| None }).is_empty());
    }

    #[test]
    fn le_impostazioni_proxy_di_windows_si_leggono_senza_errori() {
        // Legge soltanto: qualunque cosa abbia questo computer, una risposta c'è e ha la forma di un indirizzo.
        let risposta = proxy_di_windows(&Url::parse("https://huggingface.co/").unwrap());
        assert!(risposta.as_ref().is_none_or(|p| Proxy::new(p).is_ok()), "{risposta:?}");
    }
}
