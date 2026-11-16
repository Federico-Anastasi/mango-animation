//! La sezione «Aiuto» delle impostazioni dello studio: la versione, «Controlla ora», «Aggiorna da solo», i registri. I suoi comandi stanno fra
//! quelli del ponte (`build.rs`, `capabilities/default.json`) perché lo studio è una pagina remota (127.0.0.1).

use crate::aggiornamento::{self, Fallito, Passo};
use crate::lingua::t;
use crate::{supervisor, Interno};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

/// Lo script che la finestra esegue in ogni pagina: definisce `window.__MANGO_ANIMATION__.aiuto`.
pub const PONTE: &str = r#"
(() => {
  if (window.top !== window) return;
  const chiama = (comando, argomenti) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|" + comando, argomenti);
  // aiuto.leggi(): { versione, aggiornaDaSolo }
  // aiuto.controlla(): { nuova } (la versione nuova, o null se quella installata è l'ultima); rifiuta con la frase se non riesce a controllare.
  // aiuto.aggiornaDaSolo(acceso): spento, all'avvio l'app non cerca versioni nuove.
  // aiuto.riavviaEAggiorna(): scarica la versione nuova e lancia l'installatore, che chiude l'app e la riapre; rifiuta con la frase se non riesce.
  // aiuto.apriRegistri(): la cartella dei registri in Esplora file.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    aiuto: Object.freeze({
      leggi: () => chiama("aiuto_leggi"),
      controlla: () => chiama("aiuto_controlla"),
      aggiornaDaSolo: (acceso) => chiama("aiuto_aggiorna_da_solo", { acceso }),
      riavviaEAggiorna: () => chiama("aiuto_aggiorna_ora"),
      apriRegistri: () => chiama("aiuto_apri_registri"),
    }),
  });
})();
"#;

const FILE_DA_SOLO: &str = "aggiorna-da-solo.txt";
const SPENTO: &str = "no";

/// «Aggiorna da solo» è acceso finché non lo si spegne.
pub fn aggiorna_da_solo(impostazioni: &Path) -> bool {
    !std::fs::read_to_string(impostazioni.join(FILE_DA_SOLO)).is_ok_and(|scritto| scritto.trim() == SPENTO)
}

/// Ricorda la scelta; acceso è di serie, e il file sparisce.
fn ricorda_da_solo(impostazioni: &Path, acceso: bool) -> std::io::Result<()> {
    let file = impostazioni.join(FILE_DA_SOLO);
    if acceso {
        return match std::fs::remove_file(file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        };
    }
    std::fs::create_dir_all(impostazioni)?;
    std::fs::write(file, SPENTO)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Aiuto {
    versione: String,
    aggiorna_da_solo: bool,
}

#[derive(Serialize)]
pub(crate) struct Controllo {
    nuova: Option<String>,
}

fn nel_registro(app: &AppHandle, testo: &str) {
    let Ok(file) = app.path().app_log_dir().map(|c| c.join("aggiornamento.log")) else { return };
    let _ = std::fs::create_dir_all(file.parent().unwrap_or(Path::new("")));
    let _ = std::fs::write(file, format!("{testo}\n"));
}

/// Solo l'app installata si aggiorna: quella di chi sviluppa sta nel suo repo.
fn solo_installata(stato: &Interno) -> Result<(), String> {
    let installata = stato.radice.as_ref().is_ok_and(|radice| std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)).is_some_and(|cartella| aggiornamento::installata(radice, &cartella)));
    if installata {
        return Ok(());
    }
    Err(t("Questa app è costruita dal codice: si aggiorna dal codice, non da qui.", "This app is built from the code: it is updated from the code, not from here."))
}

#[tauri::command]
pub(crate) async fn aiuto_leggi(app: AppHandle, stato: State<'_, Interno>) -> Result<Aiuto, String> {
    Ok(Aiuto { versione: app.package_info().version.to_string(), aggiorna_da_solo: aggiorna_da_solo(&stato.impostazioni) })
}

#[tauri::command]
pub(crate) async fn aiuto_controlla(app: AppHandle, stato: State<'_, Interno>) -> Result<Controllo, String> {
    solo_installata(&stato)?;
    let registro = app.clone();
    let trovata = tauri::async_runtime::spawn_blocking(move || aggiornamento::cerca(&app)).await.map_err(|e| e.to_string())?;
    match trovata {
        Ok(proposta) => Ok(Controllo { nuova: proposta.map(|p| p.stato.nuova) }),
        Err(dettaglio) => {
            nel_registro(&registro, &format!("controllo: {dettaglio}"));
            Err(aggiornamento::frase_del_controllo(&dettaglio))
        }
    }
}

#[tauri::command]
pub(crate) async fn aiuto_aggiorna_da_solo(stato: State<'_, Interno>, acceso: bool) -> Result<(), String> {
    ricorda_da_solo(&stato.impostazioni, acceso).map_err(|e| t(format!("Non riesco a ricordare la scelta ({e})."), format!("I can't remember the choice ({e}).")))
}

/// Scarica la versione nuova e lancia l'installatore, che chiude l'app (e con lei il server e i suoi lavori) e la riapre. Se torna, è un errore.
#[tauri::command]
pub(crate) async fn aiuto_aggiorna_ora(app: AppHandle, stato: State<'_, Interno>) -> Result<(), String> {
    solo_installata(&stato)?;
    let registro = app.clone();
    // `None`: non c'è una versione più nuova di questa.
    let fallito = tauri::async_runtime::spawn_blocking(move || {
        let proposta = match aggiornamento::cerca(&app) {
            Ok(Some(proposta)) => proposta,
            Ok(None) => return None,
            Err(dettaglio) => return Some(Fallito { passo: Passo::Controllo, dettaglio }),
        };
        let pacchetto = match aggiornamento::scarica(&proposta, |_, _| {}) {
            Ok(pacchetto) => pacchetto,
            Err(dettaglio) => return Some(Fallito { passo: Passo::Scarico, dettaglio }),
        };
        Some(match aggiornamento::installa(&proposta, &pacchetto) {
            Ok(()) => Fallito { passo: Passo::NonSiChiude, dettaglio: String::new() },
            Err(dettaglio) => Fallito { passo: Passo::Installazione, dettaglio },
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(fallito) = fallito else { return Err(t("Hai già l'ultima versione.", "You already have the latest version.")) };
    nel_registro(&registro, &format!("{:?}: {}", fallito.passo, fallito.dettaglio));
    Err(if fallito.passo == Passo::Controllo { aggiornamento::frase_del_controllo(&fallito.dettaglio) } else { fallito.frase() })
}

#[tauri::command]
pub(crate) async fn aiuto_apri_registri(app: AppHandle) -> Result<(), String> {
    let registri = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&registri).and_then(|()| supervisor::apri_cartella(&registri)).map_err(|e| t(format!("Non riesco ad aprire la cartella dei registri ({e})."), format!("I can't open the logs folder ({e}).")))
}

#[cfg(test)]
mod prove {
    use super::*;

    #[test]
    fn aggiorna_da_solo_e_acceso_finche_non_lo_si_spegne_e_riacceso_non_lascia_il_file() {
        let t = tempfile::tempdir().unwrap();
        let impostazioni = t.path().join("non-c-e-ancora");
        assert!(aggiorna_da_solo(&impostazioni));
        ricorda_da_solo(&impostazioni, false).unwrap();
        assert!(!aggiorna_da_solo(&impostazioni));
        ricorda_da_solo(&impostazioni, true).unwrap();
        assert!(aggiorna_da_solo(&impostazioni));
        assert!(!impostazioni.join(FILE_DA_SOLO).exists());
        ricorda_da_solo(&impostazioni, true).unwrap();
    }

    #[test]
    fn un_file_che_non_dice_di_no_lascia_gli_aggiornamenti_accesi() {
        let t = tempfile::tempdir().unwrap();
        for scritto in ["", "sì", "boh"] {
            std::fs::write(t.path().join(FILE_DA_SOLO), scritto).unwrap();
            assert!(aggiorna_da_solo(t.path()), "{scritto:?}");
        }
        std::fs::write(t.path().join(FILE_DA_SOLO), " no\n").unwrap();
        assert!(!aggiorna_da_solo(t.path()));
    }
}
