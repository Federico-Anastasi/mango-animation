//! Toglie da un testo i dati personali di chi usa questo computer prima che esca dall'app.

use regex::Regex;
use std::sync::LazyLock;

/// Chi usa questo computer: ciò che `anonimizza` toglie.
pub struct Chi {
    percorsi: Vec<(Regex, String)>,
    segreti: Vec<String>,
}

impl Chi {
    /// `utenti`: i nomi con cui l'account compare nei percorsi (con un account Microsoft il nome dell'account e quello della cartella del profilo sono diversi).
    /// `segreti` sono valori esatti da togliere ovunque compaiano (la chiave delle API di questo studio).
    /// `computer`: i nomi con cui questo computer compare nei registri (il suo nome e quello del dominio Windows, se è in un'azienda).
    pub fn nuovo(utenti: &[&str], computer: &[&str], segreti: Vec<String>) -> Chi {
        let mut nomi: Vec<&str> = Vec::new();
        for nome in utenti.iter().map(|n| n.trim()).filter(|n| n.len() >= 2) {
            if !nomi.iter().any(|g| g.eq_ignore_ascii_case(nome)) {
                nomi.push(nome);
            }
        }
        // Il più lungo per primo: «alice.rossi» prima di «alice», altrimenti resterebbe «<user>.rossi».
        nomi.sort_by_key(|n| std::cmp::Reverse(n.len()));
        // Solo nei percorsi: come parola qualunque il nome potrebbe essere una parola comune.
        let mut percorsi: Vec<(Regex, String)> =
            nomi.into_iter().map(|n| (Regex::new(&format!(r"(?i)(users[\\/]+){}\b", regex::escape(n))).unwrap(), "${1}<user>".to_string())).collect();
        for nome in computer.iter().filter(|n| n.len() >= 4) {
            percorsi.push((Regex::new(&format!(r"(?i)\b{}\b", regex::escape(nome))).unwrap(), "<pc>".to_string()));
        }
        Chi { percorsi, segreti: segreti.into_iter().filter(|s| s.len() >= 16).collect() }
    }

    pub fn attuale(segreti: Vec<String>) -> Chi {
        let cartella = std::env::var("USERPROFILE").ok().and_then(|p| Some(std::path::Path::new(&p).file_name()?.to_string_lossy().into_owned()));
        let account = std::env::var("USERNAME").unwrap_or_default();
        let (computer, dominio) = (std::env::var("COMPUTERNAME").unwrap_or_default(), std::env::var("USERDOMAIN").unwrap_or_default());
        Chi::nuovo(&[account.as_str(), cartella.as_deref().unwrap_or_default()], &[computer.as_str(), dominio.as_str()], segreti)
    }
}

/// Il nome corto che Windows dà alla cartella del profilo (`ALICER~1`, `ALICE~1.ROS`): la cartella temporanea spesso compare così, e porta l'inizio del nome.
static NOME_CORTO: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(users[\\/]+)[^\\/\s"'<>]{1,6}~\d+(?:\.[^\\/\s"'<>]{1,3})?"#).unwrap());
static EMAIL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").unwrap());
/// Una cartella di OneDrive di lavoro porta il nome dell'azienda: `OneDrive - Nome Azienda`.
static ONEDRIVE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\b(OneDrive - )[^\\/"'\r\n]+"#).unwrap());
/// Un indirizzo IPv6 completo (otto gruppi) o abbreviato con `::` (almeno un gruppo prima): un'ora come `12:34:56` non lo è.
static IPV6: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b|\b(?:[0-9a-f]{1,4}:){1,6}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,5})?").unwrap());
static IPV4: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b").unwrap());
static CHIAVE_NOTA: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(?:sk-[A-Za-z0-9_\-]{16,}|hf_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})").unwrap());
static BEARER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}").unwrap());
static INTESTAZIONE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)\b(x-chiave-api["']?\s*[:=]\s*["']?)[^\s",;']+"#).unwrap());
static PARAMETRO: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\b((?:k|key|chiave|token|access_token|api_key|apikey|password|passwd|secret|mango_api_\d+|mango_studio)=)[^&\s"';]+"#).unwrap()
});
/// `token: …`, `password: …` nei registri (fuori dal JSON, dove il nome è tra virgolette e li prende `CAMPO_JSON`).
static COPPIA_CON_DUE_PUNTI: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)\b((?:token|access_token|password|passwd|api_key|apikey|secret)\s*:\s*)[^\s"',;}]+"#).unwrap());
static CAMPO_JSON: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)("(?:token|password|api_key|apikey|chiave|access_token|secret)"\s*:\s*")[^"]*""#).unwrap());

/// Il testo senza il nome dell'account nei percorsi, il nome del PC, email, indirizzi di rete, chiavi e token. Restano errori, versioni, tempi e i nomi dei video del creator
/// (per questo la schermata di invio avvisa che i registri possono contenerli).
pub fn anonimizza(testo: &str, chi: &Chi) -> String {
    let mut s = chi.segreti.iter().fold(testo.to_string(), |s, segreto| s.replace(segreto.as_str(), "<secret>"));
    s = NOME_CORTO.replace_all(&s, "${1}<user>").into_owned();
    for (cerca, metti) in &chi.percorsi {
        s = cerca.replace_all(&s, metti.as_str()).into_owned();
    }
    s = ONEDRIVE.replace_all(&s, "${1}<org>").into_owned();
    s = EMAIL.replace_all(&s, "<email>").into_owned();
    s = IPV6.replace_all(&s, "<ip>").into_owned();
    s = CHIAVE_NOTA.replace_all(&s, "<secret>").into_owned();
    s = BEARER.replace_all(&s, "$1 <secret>").into_owned();
    s = INTESTAZIONE.replace_all(&s, "${1}<secret>").into_owned();
    s = PARAMETRO.replace_all(&s, "${1}<secret>").into_owned();
    s = CAMPO_JSON.replace_all(&s, "${1}<secret>\"").into_owned();
    s = COPPIA_CON_DUE_PUNTI.replace_all(&s, "${1}<secret>").into_owned();
    // Loopback e «qualunque indirizzo» non dicono niente di chi usa il computer; un numero a quattro parti oltre 255 è una versione.
    IPV4.replace_all(&s, |c: &regex::Captures| {
        let tutto = &c[0];
        if (1..=4).any(|i| c[i].parse::<u16>().map_or(true, |n| n > 255)) || tutto.starts_with("127.") || tutto == "0.0.0.0" {
            tutto.to_string()
        } else {
            "<ip>".to_string()
        }
    })
    .into_owned()
}

#[cfg(test)]
mod prove {
    use super::*;

    const CHIAVE: &str = "q7Zk2m_Vd9XaB4nTe1LpW0sRyH3cUfJo5GiN8xAt6MQ";

    /// Un account Microsoft: nome dell'account `Alice`, cartella del profilo `alice.rossi`.
    fn chi() -> Chi {
        Chi::nuovo(&["Alice", "alice.rossi"], &["DESKTOP-7Q2K", "AZIENDA"], vec![CHIAVE.to_string()])
    }

    /// Una regola per riga: il testo com'è nei registri e com'è dopo.
    #[test]
    fn ogni_regola_toglie_il_suo_dato_e_lascia_il_resto() {
        let regole: [(&str, String, String); 26] = [
            ("nome dell'account nel percorso", r"C:\Users\Alice\AppData\Local\x.exe".into(), r"C:\Users\<user>\AppData\Local\x.exe".into()),
            ("nome corto di Windows della cartella del profilo", r"C:\Users\ALICER~1\AppData\Local\Temp\x.exe".into(), r"C:\Users\<user>\AppData\Local\Temp\x.exe".into()),
            ("nome corto di una cartella del profilo col punto", r"C:\Users\ALICE~1.ROS\AppData\Local\Temp".into(), r"C:\Users\<user>\AppData\Local\Temp".into()),
            ("nome della cartella del profilo, diverso dall'account", r"C:\Users\alice.rossi\Desktop".into(), r"C:\Users\<user>\Desktop".into()),
            ("percorso con le doppie barre del JSON", r#"{"lavoro":"C:\Users\alice.rossi\Documents"}"#.into(), r#"{"lavoro":"C:\Users\<user>\Documents"}"#.into()),
            ("percorso con barre dritte e maiuscole diverse", "file:///C:/Users/ALICE/Videos/girato.mp4".into(), "file:///C:/Users/<user>/Videos/girato.mp4".into()),
            ("il nome utente fuori dai percorsi resta", "Alice ha aperto Alice Studio".into(), "Alice ha aperto Alice Studio".into()),
            ("nome del computer", "sul computer DESKTOP-7Q2K, scheda 1".into(), "sul computer <pc>, scheda 1".into()),
            ("nome del dominio Windows", r"AZIENDA\alice in sessione".into(), r"<pc>\alice in sessione".into()),
            ("cartella OneDrive dell'azienda", r"C:\Users\Alice\OneDrive - Rossi Srl\Video\a.mp4".into(), r"C:\Users\<user>\OneDrive - <org>\Video\a.mp4".into()),
            ("indirizzo IPv6 abbreviato e completo", "link-local fe80::1c2d:3e4f:5a6b:7c8d e 2001:0db8:85a3:0000:0000:8a2e:0370:7334".into(), "link-local <ip> e <ip>".into()),
            ("un'ora e l'IPv6 di loopback restano", "alle 12:34:56 su ::1".into(), "alle 12:34:56 su ::1".into()),
            ("email", "scrivi a alice.rossi@example.com subito".into(), "scrivi a <email> subito".into()),
            ("indirizzo IPv4", "telefono su http://192.168.1.50:47420/guarda".into(), "telefono su http://<ip>:47420/guarda".into()),
            ("loopback, qualunque indirizzo e versioni restano", "127.0.0.1:47431 su 0.0.0.0, Windows 10.0.19045.1".into(), "127.0.0.1:47431 su 0.0.0.0, Windows 10.0.19045.1".into()),
            ("chiave sk-", "sk-or-v1-0123456789abcdef0123".into(), "<secret>".into()),
            ("chiave hf_", "hf_abcdefghijklmnopqrstu".into(), "<secret>".into()),
            ("chiave gh?_", "ghp_0123456789abcdefghijklmnop".into(), "<secret>".into()),
            ("chiave github_pat_", "github_pat_11ABCDEFG0123456789_abcdefghij".into(), "<secret>".into()),
            ("Bearer", "Authorization: Bearer eyJhbGciOi.abc.def".into(), "Authorization: Bearer <secret>".into()),
            ("parametri ?key= e &token=", "GET /entra?key=abc123def456&dopo=/&token=ZZZ999 -> 303".into(), "GET /entra?key=<secret>&dopo=/&token=<secret> -> 303".into()),
            ("coppia con =", "password=hunter22 aperta".into(), "password=<secret> aperta".into()),
            ("coppie con i due punti nei registri", "token: ZZZ999 e password: hunter22".into(), "token: <secret> e password: <secret>".into()),
            ("coppia nel JSON", r#"{ "api_key":"AAA111", "token" : "BBB222" }"#.into(), r#"{ "api_key":"<secret>", "token" : "<secret>" }"#.into()),
            ("intestazione della chiave dello studio", "x-chiave-api: AAA111".into(), "x-chiave-api: <secret>".into()),
            ("valore esatto della chiave dello studio", format!("copiata {CHIAVE} dal file"), "copiata <secret> dal file".into()),
        ];
        for (nome, prima, dopo) in regole {
            assert_eq!(anonimizza(&prima, &chi()), dopo, "regola: {nome}");
        }
    }

    #[test]
    fn il_nome_piu_lungo_va_per_primo_e_i_doppioni_e_i_vuoti_non_contano() {
        let chi = Chi::nuovo(&["Alice", "", "alice.rossi", "ALICE", "x"], &[], vec![]);
        assert_eq!(chi.percorsi.len(), 2);
        assert_eq!(anonimizza(r"C:\Users\alice.rossi\a e C:\Users\Alice\b", &chi), r"C:\Users\<user>\a e C:\Users\<user>\b");
    }

    #[test]
    fn un_nome_utente_comune_cambia_solo_nei_percorsi() {
        let chi = Chi::nuovo(&["Studio"], &[], vec![]);
        assert_eq!(anonimizza(r"Studio è in C:\Users\Studio\x", &chi), r"Studio è in C:\Users\<user>\x");
    }

    #[test]
    fn una_chiave_corta_o_vuota_non_si_cerca_nel_testo() {
        let chi = Chi::nuovo(&[], &[], vec![String::new(), "abc".to_string()]);
        assert_eq!(anonimizza("abc è una parola", &chi), "abc è una parola");
    }
}
