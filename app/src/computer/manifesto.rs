//! Ciò che l'app scarica dalla sua fonte, con la licenza di ciascuno, l'impronta e la dimensione (`manifesto.json`, scritto una volta con le impronte
//! pubblicate dalle fonti: GitHub, Hugging Face). I modelli non si distribuiscono con l'app: si scaricano da qui, al primo avvio.

use serde::Deserialize;

/// Le funzioni pesanti che il creator accende o spegne (`docs/MOTORI.md`, `motori.<funzione>` del profilo): per ognuna l'etichetta in italiano e in
/// inglese, come nella pagina «Motori» dello studio.
pub const FUNZIONI: [(&str, &str, &str); 6] = [
    ("trascrizione", "Capire cosa dico", "Understanding what I say"),
    ("allineamento", "Tagli precisi sulle parole", "Precise cuts on words"),
    ("sagoma", "La mia sagoma sopra le animazioni", "My silhouette over the animations"),
    ("segui", "Seguire la persona nelle riprese larghe", "Following the person in wide shots"),
    ("pulizia_voce", "Voce pulita", "Clean voice"),
    ("dettatura", "Dettare alla chat", "Dictating to the chat"),
];

/// Cosa fa ogni funzione, in una frase, nelle due lingue: la pagina del primo avvio la mostra sotto il nome.
pub const COSA_FA: [(&str, &str, &str); 6] = [
    ("trascrizione", "Trascrive quello che dici: servono i sottotitoli parola per parola e i pezzi scelti a parole.", "Transcribes what you say: needed for word-by-word subtitles and for clips picked by words."),
    ("allineamento", "Trova dove comincia e finisce ogni parola. Il modello è solo per uso non commerciale: se guadagni dai video, spegnilo.", "Finds where each word starts and ends. The model is for non-commercial use only: if you earn from your videos, turn it off."),
    ("sagoma", "Ti ritaglia dallo sfondo delle riprese.", "Cuts you out of the background of your shots."),
    ("segui", "Ti tiene al centro se riprendi da lontano.", "Keeps you centred when you film from far away."),
    ("pulizia_voce", "Toglie il rumore di fondo dalla voce.", "Removes background noise from your voice."),
    ("dettatura", "Il microfono nella chat: parli invece di scrivere.", "The microphone in the chat: speak instead of typing."),
];

#[derive(Clone, Debug, Deserialize)]
pub struct Estratto {
    /// Il file dentro l'archivio.
    pub da: String,
    /// Dove va, sotto la cartella dell'app.
    pub a: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Cartella {
    /// Il prefisso dentro l'archivio: tutto ciò che sta sotto va in `a`.
    pub da: String,
    pub a: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Archivio {
    pub url: String,
    pub sha256: String,
    pub dimensione: u64,
    #[serde(default)]
    pub estrai: Vec<Estratto>,
    pub cartella: Option<Cartella>,
}

/// Un file solo, da mettere dove il motore lo cerca: `modelli` è `~/.cache/mango-animation/modelli`, `torch` la cartella dei pesi di PyTorch.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Posto {
    Modelli,
    Torch,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FileSolo {
    pub url: String,
    pub sha256: String,
    pub dimensione: u64,
    pub posto: Posto,
    pub nome: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct FileDiRepo {
    pub nome: String,
    pub sha256: String,
    pub dimensione: u64,
}

/// Un modello di Hugging Face, a una revisione precisa: i suoi file vanno nella cache di Hugging Face, dove `from_pretrained` li trova senza rete.
#[derive(Clone, Debug, Deserialize)]
pub struct RepoHf {
    pub repo: String,
    pub revisione: String,
    pub file: Vec<FileDiRepo>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    Archivio(Archivio),
    File(FileSolo),
    Hf(RepoHf),
}

#[derive(Clone, Debug, Deserialize)]
pub struct Elemento {
    pub id: String,
    pub nome: String,
    /// A cosa serve, in una frase per il creator, e la stessa in inglese.
    pub scopo: String,
    pub scopo_en: String,
    /// La funzione che lo vuole; `None`: serve sempre.
    pub funzione: Option<String>,
    pub licenza: String,
    pub licenza_en: String,
    pub fonte: String,
    #[serde(flatten)]
    pub tipo: Tipo,
}

impl Elemento {
    /// Quanto pesa scaricarlo, in byte.
    pub fn peso(&self) -> u64 {
        match &self.tipo {
            Tipo::Archivio(a) => a.dimensione,
            Tipo::File(f) => f.dimensione,
            Tipo::Hf(r) => r.file.iter().map(|f| f.dimensione).sum(),
        }
    }
}

#[derive(Deserialize)]
struct Manifesto {
    elementi: Vec<Elemento>,
}

/// Il manifesto che l'app porta con sé.
pub fn elementi() -> Vec<Elemento> {
    serde_json::from_str::<Manifesto>(include_str!("manifesto.json")).expect("manifesto.json è scritto male").elementi
}

#[cfg(test)]
mod prove {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn il_manifesto_si_legge_e_ogni_elemento_ha_impronta_dimensione_e_licenza() {
        let tutti = elementi();
        assert!(tutti.len() >= 10);
        let mut visti = HashSet::new();
        for e in &tutti {
            assert!(visti.insert(e.id.clone()), "{} è due volte", e.id);
            assert!(!e.licenza.is_empty() && !e.licenza.contains('?') && e.fonte.starts_with("https://") && !e.scopo.is_empty(), "{}", e.id);
            assert!(e.peso() > 0, "{}", e.id);
            let impronte: Vec<&str> = match &e.tipo {
                Tipo::Archivio(a) => vec![&a.sha256],
                Tipo::File(f) => vec![&f.sha256],
                Tipo::Hf(r) => r.file.iter().map(|f| f.sha256.as_str()).collect(),
            };
            for i in impronte {
                assert!(i.len() == 64 && i.chars().all(|c| c.is_ascii_hexdigit()), "{}: impronta «{i}»", e.id);
            }
        }
    }

    #[test]
    fn ogni_funzione_ha_la_sua_frase_nello_stesso_ordine() {
        let funzioni: Vec<&str> = FUNZIONI.iter().map(|(f, _, _)| *f).collect();
        let frasi: Vec<&str> = COSA_FA.iter().map(|(f, _, _)| *f).collect();
        assert_eq!(funzioni, frasi);
    }

    #[test]
    fn ogni_funzione_nominata_dal_manifesto_e_una_di_quelle_che_il_creator_accende() {
        let note: HashSet<&str> = FUNZIONI.iter().map(|(f, _, _)| *f).collect();
        for e in elementi() {
            if let Some(f) = &e.funzione {
                assert!(note.contains(f.as_str()), "{}: la funzione «{f}» non c'è", e.id);
            }
        }
    }

    #[test]
    fn gli_indirizzi_sono_quelli_delle_fonti_e_i_modelli_hanno_una_revisione_precisa() {
        for e in elementi() {
            match &e.tipo {
                Tipo::Archivio(a) => assert!(a.url.starts_with("https://github.com/"), "{}", e.id),
                Tipo::File(f) => assert!(f.url.starts_with("https://github.com/") || f.url.starts_with("https://dl.fbaipublicfiles.com/"), "{}", e.id),
                Tipo::Hf(r) => assert!(r.revisione.len() == 40 && r.repo.contains('/') && !r.file.is_empty(), "{}", e.id),
            }
        }
    }

    #[test]
    fn la_licenza_non_commerciale_dell_allineamento_si_dice() {
        let mms = elementi().into_iter().find(|e| e.id == "mms-fa").unwrap();
        assert!(mms.licenza.contains("non commerciale"));
    }
}
