# La dettatura

Parte di `docs/APP.md`.

Nel campo della chat c'è un microfono (`docs/INTERFACCIA.md`) che nel browser non compare: lo mostra lo studio solo se l'app gli ha messo
nella pagina `window.__MANGO_ANIMATION__.voce`. Il microfono si registra in Rust (cpal, il predefinito di Windows, ricampionato a 16 kHz
mono) e il testo lo dà un motore locale, faster-whisper: l'audio non lascia il computer, e l'app non legge né usa il login di Claude Code
(`app/src/voce/`: `locale.rs` il motore, `audio.rs` microfono e ricampionamento).

- **Il motore** è un processo che parla a righe JSON (il protocollo è in `docs/MOTORE.md`, «La dettatura»). Di base `python -m motore detta`,
  lanciato dalla radice del codice che l'app ha già trovato (`docs/app/avvio.md`, «La radice del repo»: il motore sta in `motore/` lì dentro) col Python
  di `MANGO_ANIMATION_PYTHON` (di base `python` del PATH) e il modulo di `MANGO_ANIMATION_MODULO` (di base `motore`), come il server. Per usarne un
  altro che parli lo stesso protocollo si scrive la riga di comando in `MANGO_ANIMATION_DETTATURA` (le virgolette doppie tengono insieme
  una parola con gli spazi): `"C:\Programmi\Motore\motore.exe" detta`. Parte alla prima dettatura, resta acceso con il modello
  caricato fra una dettatura e l'altra, e si chiude con l'app (Job Object: i figli lo ereditano). Se cade, la dettatura dopo lo riaccende.
  L'app gli passa la cartella dei dati che ha all'avvio (`MANGO_ANIMATION_LAVORO`), da cui legge lo stile e il profilo, e la lingua dello studio che lo
  accende (`MANGO_ANIMATION_LINGUA=it|en`, come il server coi lavori): le frasi dei suoi errori escono in quella lingua. Il motore resta acceso fra una
  dettatura e l'altra, ma gli errori li dice quando si accende; se cade, la dettatura dopo lo riaccende nella lingua di allora.
  Il suo log (ciò che scrive su stderr) è `dettatura.log` in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
- **Il modello** lo sceglie il motore in `stile.json` → `dettatura` (quello di serie con sopra quello del creator): la scheda NVIDIA se c'è (quella di
  `macchina.scheda_video` del profilo, se la indica), altrimenti il processore con un modello più piccolo (`docs/MOTORI.md`). La prima volta il modello si scarica (Hugging Face, serve la rete) e la dettatura è più
  lunga ad accendersi; poi si carica dal disco in pochi secondi, la prima dettatura dopo l'avvio dell'app.
- **Mentre si carica** il microfono ascolta già e il livello si muove: lo studio scrive «Preparo la dettatura…» (evento `preparo`), e ciò che
  il creator dice non va perso, perché arriva al motore appena è pronto.
- **Il ponte.** Tre comandi del plugin dell'app (`voce_stato`, `voce_avvia`, `voce_ferma`: un plugin, uno solo per tutti i comandi che lo studio chiama, perché lo studio è una pagina remota e
  vuole permessi suoi, `build.rs` e `capabilities/default.json`; i comandi sono elencati nel gestore di `prepara`, `app/src/lib.rs`), e uno script (`app/src/voce/ponte.js`) che li espone alla pagina:
  `voce.stato(lingua)` → `{ disponibile, messaggio?, in_ascolto }` (disponibile: il comando del motore si è trovato; Python e il modello si
  vedono solo accendendolo); `voce.avvia(lingua)` (restituisce l'`id` della dettatura), `voce.ferma(lingua)` (rifiutano con `{ code, message }`:
  `motore_mancante`, `python_mancante`, `motore_non_parte`, `motore_caduto`, `comando_non_valido`, `microfono_assente`, `microfono_negato`,
  `file_illeggibile`, `gia_in_ascolto`, `non_in_ascolto`; `message` è la frase nella `lingua`); `voce.su(f)` → riceve gli eventi `{ tipo }` e dà la
  funzione per smettere. `lingua` è `"it"` o `"en"`, quella dello studio (senza o con un'altra, italiano): le frasi di errore dell'app (`message`, il `messaggio` degli
  eventi `errore`) e del suo motore escono in quella lingua.
- **Gli eventi** portano tutti l'`id` della dettatura a cui appartengono, e lo studio ignora quelli di una dettatura vecchia: `preparo` (il
  motore sta caricando il modello), `ascolto` (il motore ascolta), `livello` (`valore` 0-1, dieci al secondo, calcolato dall'app), `parziale`
  (la frase in corso, `testo`: provvisoria), `definitiva` (la frase finita, `testo`), `errore` (`messaggio`: anche il motore che non carica il
  modello o cade, con le ultime righe del suo log), `fine` (sempre l'ultimo di quella dettatura, anche se il motore è caduto). Una frase è
  finita dopo `dettatura.silenzio_fine` secondi di silenzio.
- **Fermare**: `ferma()` libera subito il microfono e torna subito; un'altra dettatura può partire all'istante. Il thread della dettatura
  manda al motore l'audio che restava e `fine`, e aspetta che chiuda l'ultima frase (al più 30 s): le ultime parole arrivano quindi anche
  dopo `ferma()`, come eventi di quella dettatura. Una dettatura nuova prende il posto di una che aspettava ancora il modello.
- **Per provare senza parlare**: con `MANGO_ANIMATION_VOCE_FILE=<un .wav>` nell'ambiente dell'app, `voce.avvia()` suona quel WAV (PCM a 16 bit) in
  tempo reale al posto del microfono. Solo per le prove.
