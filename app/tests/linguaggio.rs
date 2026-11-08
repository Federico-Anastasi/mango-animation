//! Le pagine proprie dell'app e le frasi che il Rust ci manda sono in italiano e in inglese: ogni frase nasce con le due versioni (`t("italiano", "inglese")`), e una frase
//! che resta in una lingua sola fa fallire queste prove. Modello: `studio/test/linguaggio.ts`. Leggono i sorgenti, non l'app: per questo stanno in un file a parte.

use std::path::Path;

const APP: &str = env!("CARGO_MANIFEST_DIR");

fn leggi(relativo: &str) -> String {
    std::fs::read_to_string(Path::new(APP).join(relativo)).unwrap_or_else(|e| panic!("{relativo}: {e}"))
}

#[derive(Debug, Clone, PartialEq)]
enum Segno {
    Nome(String),
    Segno(char),
    Testo(String),
}

/// Il sorgente a pezzi: nomi, segni e testi fra virgolette (ognuno con la riga). Commenti e caratteri singoli si scartano.
fn a_pezzi(sorgente: &str, js: bool) -> Vec<(usize, Segno)> {
    let c: Vec<char> = sorgente.chars().collect();
    let (mut i, mut riga, mut fuori) = (0, 1, Vec::new());
    while i < c.len() {
        let ch = c[i];
        if ch == '\n' {
            riga += 1;
            i += 1;
        } else if ch.is_whitespace() {
            i += 1;
        } else if ch == '/' && c.get(i + 1) == Some(&'/') {
            while i < c.len() && c[i] != '\n' {
                i += 1;
            }
        } else if ch == '/' && c.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < c.len() && !(c[i] == '*' && c[i + 1] == '/') {
                riga += usize::from(c[i] == '\n');
                i += 1;
            }
            i += 2;
        } else if !js && (ch == 'r' || (ch == 'b' && c.get(i + 1) == Some(&'r'))) && {
            let mut j = i + usize::from(ch == 'b') + 1;
            while c.get(j) == Some(&'#') {
                j += 1;
            }
            c.get(j) == Some(&'"') && !c[..i].last().is_some_and(|p| p.is_alphanumeric() || *p == '_')
        } {
            let mut j = i + usize::from(ch == 'b') + 1;
            let mut diesis = 0;
            while c[j] == '#' {
                diesis += 1;
                j += 1;
            }
            j += 1;
            let inizio = j;
            let chiusura: Vec<char> = std::iter::once('"').chain(std::iter::repeat('#').take(diesis)).collect();
            while c[j..j + chiusura.len()] != chiusura[..] {
                j += 1;
            }
            fuori.push((riga, Segno::Testo(c[inizio..j].iter().collect())));
            riga += c[inizio..j].iter().filter(|x| **x == '\n').count();
            i = j + chiusura.len();
        } else if ch == '"' || (js && (ch == '\'' || ch == '`')) {
            let (inizio_riga, mut testo, mut j) = (riga, String::new(), i + 1);
            let mut annidate = 0;
            while j < c.len() && (c[j] != ch || annidate > 0) {
                if c[j] == '\\' {
                    testo.push(c[j]);
                    j += 1;
                } else if ch == '`' && c[j] == '$' && c.get(j + 1) == Some(&'{') {
                    annidate += 1;
                } else if ch == '`' && c[j] == '}' && annidate > 0 {
                    annidate -= 1;
                }
                riga += usize::from(c[j] == '\n');
                testo.push(c[j]);
                j += 1;
            }
            fuori.push((inizio_riga, Segno::Testo(testo)));
            i = j + 1;
        } else if !js && ch == '\'' {
            // un carattere ('a', '\n', '\u{feff}') si scarta; un'etichetta ('a) è solo un apostrofo
            let chiude = if c.get(i + 1) == Some(&'\\') { c[i + 2..].iter().position(|x| *x == '\'').map(|p| i + 2 + p) } else { Some(i + 2).filter(|j| c.get(*j) == Some(&'\'')) };
            i = chiude.map_or(i + 1, |j| j + 1);
        } else if ch.is_alphabetic() || ch == '_' || ch == '$' {
            let inizio = i;
            while i < c.len() && (c[i].is_alphanumeric() || c[i] == '_' || c[i] == '$') {
                i += 1;
            }
            fuori.push((riga, Segno::Nome(c[inizio..i].iter().collect())));
        } else {
            fuori.push((riga, Segno::Segno(ch)));
            i += 1;
        }
    }
    fuori
}

/// Una chiamata `t(...)`: gli argomenti al primo livello, ognuno coi testi che contiene.
#[derive(Debug)]
struct Chiamata {
    riga: usize,
    argomenti: Vec<Vec<String>>,
}

/// Le chiamate a `t(` e i testi che stanno fuori da ogni `t(` (con il nome che li precede, per le eccezioni).
fn chiamate_e_resto(sorgente: &str, js: bool) -> (Vec<Chiamata>, Vec<(usize, String, String)>) {
    let pezzi = a_pezzi(sorgente, js);
    let (mut chiamate, mut resto, mut i) = (Vec::new(), Vec::new(), 0);
    while i < pezzi.len() {
        let prima = if i > 0 { Some(&pezzi[i - 1].1) } else { None };
        let e_t = matches!(&pezzi[i].1, Segno::Nome(n) if n == "t") && matches!(pezzi.get(i + 1), Some((_, Segno::Segno('('))))
            && !matches!(prima, Some(Segno::Segno('.'))) && !matches!(prima, Some(Segno::Nome(n)) if n == "fn" || n == "function");
        if e_t {
            let (mut profondita, mut j, mut argomenti, mut corrente) = (0, i + 1, Vec::new(), Vec::new());
            loop {
                match &pezzi[j].1 {
                    Segno::Segno('(' | '[' | '{') => {
                        profondita += 1;
                    }
                    Segno::Segno(')' | ']' | '}') => {
                        profondita -= 1;
                        if profondita == 0 {
                            break;
                        }
                    }
                    Segno::Segno(',') if profondita == 1 => argomenti.push(std::mem::take(&mut corrente)),
                    Segno::Testo(t) => corrente.push(t.clone()),
                    _ => {}
                }
                j += 1;
            }
            // una virgola prima della parentesi che chiude non apre un argomento
            if !(corrente.is_empty() && matches!(pezzi[j - 1].1, Segno::Segno(','))) {
                argomenti.push(corrente);
            }
            chiamate.push(Chiamata { riga: pezzi[i].0, argomenti });
            i = j + 1;
            continue;
        }
        if let Segno::Testo(t) = &pezzi[i].1 {
            let contesto = (i.saturating_sub(3)..i).map(|k| match &pezzi[k].1 { Segno::Nome(n) => n.clone(), Segno::Segno(c) => c.to_string(), Segno::Testo(_) => String::new() }).collect::<Vec<_>>().join("");
            resto.push((pezzi[i].0, t.clone(), contesto));
        }
        i += 1;
    }
    (chiamate, resto)
}

/// I segnaposto di un testo (`{nome}`, `{}`, `${espressione}`), in ordine alfabetico: le due lingue ne vogliono gli stessi.
fn segnaposto(testo: &str, js: bool) -> Vec<String> {
    let mut trovati = Vec::new();
    let c: Vec<char> = testo.chars().collect();
    let mut i = 0;
    while i < c.len() {
        let apre = if js { c[i] == '$' && c.get(i + 1) == Some(&'{') } else { c[i] == '{' && c.get(i + 1) != Some(&'{') };
        if apre {
            let inizio = i + usize::from(js) + 1;
            let fine = c[inizio..].iter().position(|x| *x == '}').map_or(c.len(), |p| inizio + p);
            trovati.push(c[inizio..fine].iter().collect::<String>());
            i = fine;
        } else if !js && c[i] == '{' {
            i += 2;
        }
        i += 1;
    }
    trovati.sort();
    trovati
}

const PAROLE_ITALIANE: [&str; 21] = [
    "il", "lo", "gli", "non", "che", "di", "del", "della", "nel", "nella", "sono", "per", "con", "una", "uno", "dei", "delle", "più", "è", "si", "ho",
];

/// Un testo inglese con dentro una parola italiana (o una lettera accentata) è quasi certamente un italiano copiato.
fn sa_di_italiano(testo: &str) -> Option<String> {
    if let Some(l) = testo.chars().find(|c| "àèéìòùÀÈÉÌÒÙ".contains(*c)) {
        return Some(l.to_string());
    }
    let senza_segnaposto = testo.replace(|c: char| matches!(c, '{' | '}' | '$'), " ");
    senza_segnaposto.split(|c: char| !c.is_alphabetic() && c != '-').find(|p| PAROLE_ITALIANE.contains(&p.to_lowercase().as_str())).map(str::to_owned)
}

/// Un modello di testo del JS senza le espressioni: `Ho ${n} file` → `Ho   file`. Quello che resta è ciò che si legge.
fn senza_espressioni(testo: &str) -> String {
    let (mut fuori, mut profondita) = (String::new(), 0);
    let mut c = testo.chars().peekable();
    while let Some(ch) = c.next() {
        if ch == '$' && c.peek() == Some(&'{') {
            profondita += 1;
            c.next();
        } else if profondita > 0 {
            match ch {
                '{' => profondita += 1,
                '}' => profondita -= 1,
                _ => {}
            }
        } else {
            fuori.push(ch);
        }
    }
    fuori
}

/// I nomi del prodotto non si traducono: non contano come parole.
const NOMI: [&str; 1] = ["Mango Animation"];

/// Una frase da leggere: due o più parole (nel JS anche una parola con la maiuscola), non il nome di un file, di un campo o di una variabile.
fn e_una_frase(testo: &str, js: bool) -> bool {
    let mut testo = if js { senza_espressioni(testo) } else { testo.to_owned() };
    for nome in NOMI {
        testo = testo.replace(nome, " ");
    }
    let lettere = |p: &str| p.chars().filter(|c| c.is_alphabetic()).count();
    let parole = testo.split_whitespace().filter(|p| lettere(p) >= 2).count();
    let una_parola_con_maiuscola = js && testo.trim().chars().next().is_some_and(char::is_uppercase) && lettere(&testo) >= 3 && testo.chars().any(char::is_lowercase);
    (parole >= 2 || una_parola_con_maiuscola) && !testo.contains("://")
}

/// Controlla `t(…)` e i testi fuori da `t(…)` di un sorgente; torna le colpe, una per riga.
fn controlla(nome: &str, sorgente: &str, js: bool, ammessi: &[(&str, &str)]) -> Vec<String> {
    let mut colpe = Vec::new();
    let (chiamate, resto) = chiamate_e_resto(sorgente, js);
    for c in &chiamate {
        let dove = format!("{nome}:{}", c.riga);
        // Una frase che arriva da un dato (`t(*it, *en)`, il manifesto) non ha testi qui: la controlla la prova di quel dato.
        if c.argomenti.len() != 2 || c.argomenti.iter().all(|a| a.is_empty()) {
            if c.argomenti.len() != 2 || c.argomenti.iter().any(|a| !a.is_empty()) {
                colpe.push(format!("{dove}: t() vuole due frasi scritte per esteso, italiano e inglese"));
            }
            continue;
        }
        if c.argomenti.iter().any(|a| a.is_empty()) {
            colpe.push(format!("{dove}: t() ha una frase scritta e una no"));
            continue;
        }
        let (it, en) = (c.argomenti[0].concat(), c.argomenti[1].concat());
        if it.trim().is_empty() || en.trim().is_empty() {
            colpe.push(format!("{dove}: una delle due frasi è vuota"));
        } else if it == en {
            colpe.push(format!("{dove}: italiano e inglese sono uguali («{it}»)"));
        }
        // Nel JS i segnaposto sono espressioni e devono essere le stesse; nel Rust contano i posti (`{}`, `{nome}`), e le due lingue possono chiamarli in modo diverso.
        let (nell_it, nell_en) = (segnaposto(&it, js), segnaposto(&en, js));
        if if js { nell_it != nell_en } else { nell_it.len() != nell_en.len() } {
            colpe.push(format!("{dove}: i segnaposto dell'italiano e dell'inglese non sono gli stessi («{it}» / «{en}»)"));
        }
        if let Some(p) = sa_di_italiano(&en) {
            colpe.push(format!("{dove}: l'inglese ha una parola italiana («{p}» in «{en}»)"));
        }
    }
    for (riga, testo, contesto) in resto {
        let di_servizio = ["expect(", "panic!(", "unreachable!(", "eprintln!(", "assert!("].iter().any(|k| contesto.ends_with(k) || contesto.contains(k.trim_end_matches('(')));
        if e_una_frase(&testo, js) && !di_servizio && !ammessi.iter().any(|(file, inizio)| *file == nome && testo.trim_start().starts_with(inizio)) {
            colpe.push(format!("{nome}:{riga}: «{}» è fuori da t()", testo.chars().take(70).collect::<String>().replace('\n', " ")));
        }
    }
    colpe
}

fn tronca_alle_prove(sorgente: &str) -> &str {
    sorgente.find("\n#[cfg(test)]").map_or(sorgente, |p| &sorgente[..p])
}

fn senza_colpe(colpe: Vec<String>) {
    assert!(colpe.is_empty(), "\n{}\n", colpe.join("\n"));
}

#[test]
fn la_pagina_non_ha_testo_fisso_nell_html_che_sia_di_una_lingua_sola() {
    let html = leggi("ui/index.html");
    let mut resto = String::new();
    let (mut dentro, mut in_titolo, mut in_script) = (false, false, false);
    let mut tag = String::new();
    for ch in html.chars() {
        match (dentro, ch) {
            (false, '<') => (dentro, tag) = (true, String::new()),
            (true, '>') => {
                dentro = false;
                let nome = tag.trim_start_matches('/').split_whitespace().next().unwrap_or("").to_lowercase();
                let chiude = tag.starts_with('/');
                match nome.as_str() {
                    "title" => in_titolo = !chiude,
                    "script" => in_script = !chiude,
                    _ => {}
                }
                for attributo in ["aria-label=", "title=", "alt=", "placeholder="] {
                    assert!(!tag.contains(attributo), "index.html: <{}> ha {attributo}, che è testo di una lingua sola: va in app.js", tag.split_whitespace().next().unwrap_or(""));
                }
            }
            (true, c) => tag.push(c),
            (false, c) if !in_script && !in_titolo => resto.push(c),
            _ => {}
        }
    }
    assert!(resto.trim().is_empty(), "index.html ha del testo fisso («{}»): i testi stanno in app.js, con t(\"italiano\", \"inglese\")", resto.split_whitespace().collect::<Vec<_>>().join(" "));
}

#[test]
fn ogni_frase_di_app_js_ha_l_italiano_e_l_inglese() {
    let js = leggi("ui/app.js");
    senza_colpe(controlla("app.js", &js, true, &[("app.js", "in corso"), ("app.js", "use strict")]));
    let (chiamate, _) = chiamate_e_resto(&js, true);
    assert!(chiamate.len() > 40, "app.js: ci si aspettano decine di frasi tradotte, ne ho trovate {}", chiamate.len());
}

/// Testi del Rust che non sono frasi per chi legge: il codice di un altro programma (che non si traduce) e i codici di stato che la pagina traduce da sé.
const AMMESSI: [(&str, &str); 6] = [
    ("supervisor.rs", "AssignProcessToJobObject"),
    ("computer/installa.rs", "import "),
    ("lavoro.rs", "Add-Type"),
    ("dati.rs", "(() =>"),
    ("computer/ponte.rs", "(() =>"),
    ("computer/mod.rs", "in corso"),
];

const FILE_RUST: [&str; 18] = [
    "lib.rs",
    "server.rs",
    "claude.rs",
    "preparazione.rs",
    "aggiornamento.rs",
    "dati.rs",
    "lavoro.rs",
    "radice.rs",
    "supervisor.rs",
    "istanza.rs",
    "computer/mod.rs",
    "computer/piano.rs",
    "computer/installa.rs",
    "computer/scarica.rs",
    "computer/profilo.rs",
    "computer/hw.rs",
    "computer/ponte.rs",
    "segnalazione/mod.rs",
];

#[test]
fn ogni_frase_del_rust_che_arriva_alla_pagina_ha_l_italiano_e_l_inglese() {
    let mut colpe = Vec::new();
    for file in FILE_RUST {
        let sorgente = leggi(&format!("src/{file}"));
        colpe.extend(controlla(file, tronca_alle_prove(&sorgente), false, &AMMESSI));
    }
    senza_colpe(colpe);
}

#[test]
fn ogni_elemento_del_manifesto_dice_a_cosa_serve_e_la_licenza_nelle_due_lingue() {
    let manifesto: serde_json::Value = serde_json::from_str(&leggi("src/computer/manifesto.json")).unwrap();
    let mut colpe = Vec::new();
    for e in manifesto["elementi"].as_array().unwrap() {
        let id = e["id"].as_str().unwrap();
        for chiave in ["scopo", "licenza"] {
            let (it, en) = (e[chiave].as_str().unwrap_or_default(), e[format!("{chiave}_en")].as_str().unwrap_or_default());
            if en.is_empty() {
                colpe.push(format!("{id}: manca {chiave}_en"));
            } else if let Some(p) = sa_di_italiano(en) {
                colpe.push(format!("{id}: {chiave}_en ha una parola italiana («{p}» in «{en}»)"));
            } else if chiave == "scopo" && it == en {
                colpe.push(format!("{id}: scopo e scopo_en sono uguali"));
            }
        }
        if let Some(p) = sa_di_italiano(e["nome"].as_str().unwrap_or_default()) {
            colpe.push(format!("{id}: il nome ha una parola italiana («{p}»): un nome non si traduce, e non deve avere spiegazioni in italiano"));
        }
    }
    senza_colpe(colpe);
}

#[test]
fn ogni_funzione_che_il_creator_accende_ha_l_etichetta_nelle_due_lingue() {
    for costante in ["pub const FUNZIONI", "pub const COSA_FA"] {
        let sorgente = leggi("src/computer/manifesto.rs");
        let da = sorgente.find(costante).unwrap();
        let elenco = &sorgente[da..da + sorgente[da..].find("];").unwrap()];
        let testi: Vec<String> = a_pezzi(elenco, false).into_iter().filter_map(|(_, s)| if let Segno::Testo(t) = s { Some(t) } else { None }).collect();
        assert!(testi.len() >= 18 && testi.len() % 3 == 0, "{costante} dovrebbe avere id, italiano e inglese per ogni funzione: {testi:?}");
        for terna in testi.chunks(3) {
            assert_ne!(terna[1], terna[2], "{}: italiano e inglese sono uguali", terna[0]);
            assert_eq!(sa_di_italiano(&terna[2]), None, "{}: l'inglese ha una parola italiana", terna[0]);
        }
    }
}

#[test]
fn il_lettore_dei_sorgenti_capisce_il_rust_e_il_js() {
    let rust = "fn f() { let a = t(\"ciao {x}\", &format!(\"hi {x}\")); let b = \"da tradurre qui\"; let c = 'a'; let d: &'static str = \"x\"; // t(\"no\", \"no\")\n let e = r#\"raw \"con virgolette\"\"#; }";
    let (chiamate, resto) = chiamate_e_resto(rust, false);
    assert_eq!(chiamate.len(), 1);
    assert_eq!(chiamate[0].argomenti, vec![vec!["ciao {x}".to_owned()], vec!["hi {x}".to_owned()]]);
    let testi: Vec<&str> = resto.iter().map(|(_, t, _)| t.as_str()).collect();
    assert_eq!(testi, ["da tradurre qui", "x", "raw \"con virgolette\""]);

    let js = "const a = t(\"Riprova\", \"Try again\"); const b = `Ho ${x.y} file`; el.textContent = 'Fatto bene'; // t(\"no\")\nconst c = t(`Scarico ${n}`, `Downloading ${n}`);";
    let (chiamate, resto) = chiamate_e_resto(js, true);
    assert_eq!(chiamate.len(), 2);
    assert_eq!(resto.iter().map(|(_, t, _)| t.as_str()).collect::<Vec<_>>(), ["Ho ${x.y} file", "Fatto bene"]);
    assert_eq!(segnaposto("Ho ${x.y} su ${z}", true), ["x.y", "z"]);
    assert_eq!(segnaposto("{b} e {a} {{no}} {}", false), ["", "a", "b"]);
}

#[test]
fn una_frase_senza_inglese_o_con_l_inglese_copiato_dall_italiano_viene_vista() {
    let colpe = controlla("x.js", "t(\"Solo italiano\"); t(\"Ciao\", \"Ciao\"); t(\"Non c'è\", \"Non c'è\"); t(\"Apri ${a}\", \"Open\"); t(\"Apri\", \"Apri il file\"); const x = \"Una frase sola\";", true, &[]);
    assert_eq!(colpe.len(), 7, "{colpe:#?}");
    assert!(controlla("x.js", "t(\"Apri\", \"Open\"); const url = \"https://esempio.it/una cosa\"; const campo = \"fase\";", true, &[]).is_empty());
}
