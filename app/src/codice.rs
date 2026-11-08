//! Il codice del prodotto in `codice/` dopo un aggiornamento: l'installatore sovrascrive i file della versione nuova ma non toglie quelli che la versione nuova non ha più,
//! e Claude Code legge da lì le regole e le skill. `prepara.ts` scrive l'elenco dei file di ogni versione (`ELENCO`); qui si toglie ciò che nell'elenco non c'è (`docs/APP.md`, «Installer e aggiornamenti»).

use crate::lingua::t;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path};

/// Il nome del file, in `codice/`, con l'elenco dei file di questa versione.
pub const ELENCO: &str = ".mango-elenco.json";

/// Cosa `prepara.ts` ha portato: le cartelle e i file di primo livello del prodotto, tutti i file dentro, e ciò che il programma crea da sé in mezzo ai suoi file.
#[derive(Deserialize)]
struct Elenco {
    radici: Vec<String>,
    file: Vec<String>,
    /// Cartelle con questo nome, a qualunque profondità (i pacchetti, le cache di Python).
    conservati_per_nome: Vec<String>,
    /// Percorsi interi dal codice (la pagina delle animazioni, che il server ricostruisce).
    conservati_per_percorso: Vec<String>,
}

/// Percorsi di Windows: le maiuscole non contano, e le barre sono quelle dell'elenco.
fn chiave(percorso: &str) -> String {
    percorso.replace('\\', "/").to_lowercase()
}

fn dentro_il_codice(relativo: &str) -> bool {
    !relativo.is_empty() && Path::new(relativo).components().all(|c| matches!(c, Component::Normal(_)))
}

/// Toglie da `radice` i file delle cartelle del prodotto che l'elenco non nomina, e le cartelle che ne restano vuote. Tocca solo le cartelle dell'elenco: le impostazioni di Claude Code,
/// la sua memoria e tutto ciò che sta altrove restano. Torna i file tolti; se qualcuno non si toglie (aperto da un programma) toglie gli altri e dice quali.
pub fn togli_i_file_vecchi(radice: &Path) -> Result<Vec<String>, String> {
    let scritto = fs::read_to_string(radice.join(ELENCO)).map_err(|e| t(format!("non riesco a leggere {ELENCO} ({e})"), format!("I can't read {ELENCO} ({e})")))?;
    let elenco: Elenco = serde_json::from_str(&scritto).map_err(|e| t(format!("{ELENCO} non si legge ({e})"), format!("{ELENCO} cannot be read ({e})")))?;
    if let Some(strano) = elenco.radici.iter().chain(&elenco.file).find(|r| !dentro_il_codice(r)) {
        return Err(t(format!("{ELENCO} nomina «{strano}», che non sta nel codice"), format!("{ELENCO} names “{strano}”, which is not inside the code")));
    }
    let della_versione: BTreeSet<String> = elenco.file.iter().map(|f| chiave(f)).collect();
    let per_nome: BTreeSet<String> = elenco.conservati_per_nome.iter().map(|n| chiave(n)).collect();
    let per_percorso: BTreeSet<String> = elenco.conservati_per_percorso.iter().map(|p| chiave(p)).collect();
    let conservato = |relativo: &str, nome: &str| per_nome.contains(&chiave(nome)) || per_percorso.contains(&chiave(relativo));

    let (mut tolti, mut falliti, mut cartelle) = (Vec::new(), Vec::new(), BTreeSet::new());
    let mut da_guardare: Vec<String> = elenco.radici.iter().filter(|r| radice.join(r).is_dir()).cloned().collect();
    while let Some(cartella) = da_guardare.pop() {
        let Ok(voci) = fs::read_dir(radice.join(&cartella)) else { continue };
        for voce in voci.flatten() {
            let nome = voce.file_name().to_string_lossy().into_owned();
            let relativo = format!("{cartella}/{nome}");
            let Ok(tipo) = voce.file_type() else { continue };
            // I collegamenti non si seguono né si tolgono: potrebbero portare fuori dal codice.
            if tipo.is_symlink() || conservato(&relativo, &nome) {
                continue;
            }
            if tipo.is_dir() {
                da_guardare.push(relativo);
            } else if !della_versione.contains(&chiave(&relativo)) {
                match fs::remove_file(voce.path()) {
                    Ok(()) => {
                        cartelle.insert(cartella.clone());
                        tolti.push(relativo);
                    }
                    Err(e) => falliti.push(format!("{relativo} ({e})")),
                }
            }
        }
    }
    // Dal fondo verso l'alto: una cartella si toglie solo se è rimasta vuota, e mai quella di primo livello del prodotto.
    let mut da_chiudere: Vec<String> = cartelle.into_iter().collect();
    da_chiudere.sort_by_key(|c| std::cmp::Reverse(c.len()));
    for cartella in da_chiudere {
        let mut corrente = cartella;
        while !elenco.radici.iter().any(|r| chiave(r) == chiave(&corrente)) && fs::remove_dir(radice.join(&corrente)).is_ok() {
            let Some((sopra, _)) = corrente.rsplit_once('/') else { break };
            corrente = sopra.to_owned();
        }
    }
    if falliti.is_empty() {
        Ok(tolti)
    } else {
        Err(t(format!("non riesco a togliere i file vecchi: {}", falliti.join(", ")), format!("I can't remove the old files: {}", falliti.join(", "))))
    }
}

/// All'avvio dell'app installata: se l'elenco di questa versione non è già stato applicato (`marcatore` ne tiene l'impronta), toglie i file vecchi. Torna quanti ne ha tolti.
/// L'impronta si scrive solo se tutto è andato: un file rimasto aperto si riprova al prossimo avvio.
pub fn in_ordine(radice: &Path, marcatore: &Path) -> Result<usize, String> {
    let elenco = fs::read(radice.join(ELENCO)).map_err(|e| t(format!("non riesco a leggere {ELENCO} ({e})"), format!("I can't read {ELENCO} ({e})")))?;
    let impronta: String = Sha256::digest(&elenco).iter().map(|b| format!("{b:02x}")).collect();
    if fs::read_to_string(marcatore).is_ok_and(|scritta| scritta == impronta) {
        return Ok(0);
    }
    let tolti = togli_i_file_vecchi(radice)?;
    fs::create_dir_all(marcatore.parent().unwrap_or(Path::new(""))).map_err(|e| e.to_string())?;
    fs::write(marcatore, impronta).map_err(|e| t(format!("non riesco a scrivere {} ({e})", marcatore.display()), format!("I can't write {} ({e})", marcatore.display())))?;
    Ok(tolti.len())
}

#[cfg(test)]
mod prove {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::os::windows::fs::OpenOptionsExt;
    use std::path::{Path, PathBuf};

    fn scrivi(radice: &Path, relativi: &[&str]) {
        for r in relativi {
            let file = radice.join(r);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, "x").unwrap();
        }
    }

    fn c_e(radice: &Path, relativo: &str) -> bool {
        radice.join(relativo).exists()
    }

    /// L'elenco di una versione che porta questi file.
    fn elenco(radice: &Path, file: &[&str]) {
        let scritto = json!({
            "radici": ["CLAUDE.md", "server", "animazioni", "motore", ".claude/rules", ".claude/skills", "docs"],
            "file": file,
            "conservati_per_nome": ["node_modules", "__pycache__"],
            "conservati_per_percorso": ["animazioni/dist", "animazioni/dist.lock", "animazioni/dist.nuova", "animazioni/dist.vecchia"],
        });
        fs::write(radice.join(ELENCO), scritto.to_string()).unwrap();
    }

    #[test]
    fn il_file_e_le_voci_dell_elenco_sono_quelli_che_scrive_l_installer() {
        let scrive = include_str!("../installer/prepara.ts");
        for voce in [ELENCO, "radici", "file", "conservati_per_nome", "conservati_per_percorso"] {
            assert!(scrive.contains(voce), "prepara.ts non scrive «{voce}»");
        }
    }

    const DELLA_VERSIONE: &[&str] = &["CLAUDE.md", "server/src/avvia.ts", "animazioni/package.json", "motore/monta.py", ".claude/rules/montaggio.md", ".claude/skills/monta/SKILL.md", "docs/APP.md"];

    #[test]
    fn i_file_che_la_versione_nuova_non_ha_piu_si_tolgono_con_le_cartelle_rimaste_vuote_e_gli_altri_restano() {
        let t = tempfile::tempdir().unwrap();
        scrivi(t.path(), DELLA_VERSIONE);
        scrivi(t.path(), &[".claude/skills/vecchia/SKILL.md", ".claude/skills/vecchia/riferimenti/a.md", ".claude/rules/tolta.md", "server/src/vecchio.ts", "docs/VECCHIO.md", "motore/pesi/x.bin"]);
        elenco(t.path(), DELLA_VERSIONE);
        let tolti = togli_i_file_vecchi(t.path()).unwrap();
        assert_eq!(tolti.len(), 6, "{tolti:?}");
        for sparito in [".claude/skills/vecchia", ".claude/rules/tolta.md", "server/src/vecchio.ts", "docs/VECCHIO.md", "motore/pesi"] {
            assert!(!c_e(t.path(), sparito), "{sparito} doveva sparire");
        }
        for resta in DELLA_VERSIONE.iter().chain(&[".claude/skills", "server/src"]) {
            assert!(c_e(t.path(), resta), "{resta} doveva restare");
        }
    }

    #[test]
    fn i_pacchetti_la_pagina_delle_animazioni_e_le_cache_di_python_non_si_toccano() {
        let t = tempfile::tempdir().unwrap();
        scrivi(t.path(), DELLA_VERSIONE);
        let create = ["server/node_modules/z/i.js", "animazioni/node_modules/q/i.js", "animazioni/dist/index.html", "animazioni/dist/assets/uno-a1.js", "animazioni/dist.nuova/index.html", "animazioni/dist.lock", "motore/__pycache__/monta.pyc", "server/src/__pycache__/x.pyc", "motore/sotto/node_modules/a.js"];
        scrivi(t.path(), &create);
        elenco(t.path(), DELLA_VERSIONE);
        assert!(togli_i_file_vecchi(t.path()).unwrap().is_empty());
        for resta in create {
            assert!(c_e(t.path(), resta), "{resta} non va toccato");
        }
    }

    #[test]
    fn fuori_dalle_cartelle_del_prodotto_non_si_tocca_niente() {
        let t = tempfile::tempdir().unwrap();
        scrivi(t.path(), DELLA_VERSIONE);
        let altri = [".claude/settings.local.json", ".claude/memoria/ricordo.md", ".claude/worktrees/a/x", "appunti/mio.md", "NOTE.txt", "studio/src/App.tsx"];
        scrivi(t.path(), &altri);
        elenco(t.path(), DELLA_VERSIONE);
        assert!(togli_i_file_vecchi(t.path()).unwrap().is_empty());
        for resta in altri {
            assert!(c_e(t.path(), resta), "{resta} non è del prodotto");
        }
    }

    #[test]
    fn le_maiuscole_dei_nomi_non_contano_come_in_windows() {
        let t = tempfile::tempdir().unwrap();
        scrivi(t.path(), &["docs/App.md", "animazioni/Dist/x.js"]);
        elenco(t.path(), &["docs/APP.md"]);
        assert!(togli_i_file_vecchi(t.path()).unwrap().is_empty());
        assert!(c_e(t.path(), "docs/App.md") && c_e(t.path(), "animazioni/Dist/x.js"));
    }

    #[test]
    fn un_elenco_che_esce_dalla_cartella_o_che_manca_non_toglie_niente() {
        let t = tempfile::tempdir().unwrap();
        scrivi(t.path(), DELLA_VERSIONE);
        assert!(togli_i_file_vecchi(t.path()).unwrap_err().contains(ELENCO));
        let fuori = tempfile::tempdir().unwrap();
        scrivi(fuori.path(), &["importante.txt"]);
        let relativo_a_fuori = format!("../{}", fuori.path().file_name().unwrap().to_string_lossy());
        for pericolosa in [relativo_a_fuori.as_str(), "..", "/radice", r"C:\Windows", ""] {
            fs::write(t.path().join(ELENCO), json!({ "radici": [pericolosa], "file": [], "conservati_per_nome": [], "conservati_per_percorso": [] }).to_string()).unwrap();
            assert!(togli_i_file_vecchi(t.path()).is_err(), "«{pericolosa}» non è una cartella del prodotto");
        }
        assert!(c_e(fuori.path(), "importante.txt") && c_e(t.path(), "server/src/avvia.ts"));
    }

    fn marcatore(t: &Path) -> PathBuf {
        t.join("dati").join("codice-in-ordine")
    }

    #[test]
    fn si_mette_in_ordine_una_volta_per_elenco_e_si_rifa_quando_l_elenco_cambia() {
        let t = tempfile::tempdir().unwrap();
        let radice = t.path().join("codice");
        scrivi(&radice, DELLA_VERSIONE);
        scrivi(&radice, &["docs/VECCHIO.md"]);
        elenco(&radice, DELLA_VERSIONE);
        assert_eq!(in_ordine(&radice, &marcatore(t.path())).unwrap(), 1);
        assert!(!c_e(&radice, "docs/VECCHIO.md"));
        // Stesso elenco: niente da guardare, e ciò che il prodotto crea da sé fra i suoi file non si tocca a ogni avvio.
        scrivi(&radice, &["docs/creato-dal-programma.md"]);
        assert_eq!(in_ordine(&radice, &marcatore(t.path())).unwrap(), 0);
        assert!(c_e(&radice, "docs/creato-dal-programma.md"));
        // Una versione nuova: nuovo elenco.
        let nuova: Vec<&str> = DELLA_VERSIONE.iter().copied().filter(|f| *f != "docs/APP.md").collect();
        elenco(&radice, &nuova);
        assert_eq!(in_ordine(&radice, &marcatore(t.path())).unwrap(), 2);
        assert!(!c_e(&radice, "docs/APP.md") && !c_e(&radice, "docs/creato-dal-programma.md"));
    }

    #[test]
    fn un_file_che_non_si_riesce_a_togliere_si_dice_si_toglie_il_resto_e_si_riprova_all_avvio_dopo() {
        let t = tempfile::tempdir().unwrap();
        let radice = t.path().join("codice");
        scrivi(&radice, DELLA_VERSIONE);
        scrivi(&radice, &["docs/BLOCCATO.md", "docs/VECCHIO.md"]);
        elenco(&radice, DELLA_VERSIONE);
        // Aperto da qualcuno senza permesso di cancellarlo.
        let aperto = fs::OpenOptions::new().read(true).share_mode(1).open(radice.join("docs/BLOCCATO.md")).unwrap();
        let errore = in_ordine(&radice, &marcatore(t.path())).unwrap_err();
        assert!(errore.contains("BLOCCATO.md"), "{errore}");
        assert!(!c_e(&radice, "docs/VECCHIO.md"), "il resto si toglie lo stesso");
        assert!(!marcatore(t.path()).exists());
        drop(aperto);
        assert_eq!(in_ordine(&radice, &marcatore(t.path())).unwrap(), 1);
        assert!(!c_e(&radice, "docs/BLOCCATO.md") && marcatore(t.path()).is_file());
    }
}
