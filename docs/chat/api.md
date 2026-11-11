# La chat: le rotte

Le rotte `/api/chat` e i campi di una conversazione. Come la chat è fatta: `docs/chat/sessione.md`; cosa c'è nei messaggi e negli eventi: `docs/chat/messaggi.md`.

## API

L'`id` di una conversazione è quello di Claude Code (un UUID): lo stesso del suo file e di `claude --resume`.

| rotta | cosa fa |
|---|---|
| `GET /api/chat` | le conversazioni, dalla più recente: `[{ id, titolo, aggiornata, attiva }]` (`attiva`: c'è un `query` acceso) |
| `POST /api/chat` | `{ testo, allegati?, contesto?, modello?, effort? }` → 201 `{ id }`: una conversazione nuova col primo messaggio, e se si vuole il suo modello e il suo effort. Al posto del messaggio può avere `{ avvio, modello?, effort? }`, con `avvio` `"primo-giro"` o `"rifare-primo-giro"` (400 se ci sono anche `testo`, `allegati` o `contesto`): la conversazione comincia da Claude, che riceve l'istruzione di avviare la skill `welcome`, e il creator non vede nessun messaggio come suo (`docs/chat/metodo.md`, «Il primo giro») |
| `GET /api/chat/modelli` | `[{ id, nome, descrizione, effort: [livello], reale }]`: i modelli che Claude Code offre (`docs/chat/sessione.md`, «Modello ed effort») e, se è acceso, quelli di Mango Code (`docs/chat/mango-code.md`, «Mango Code») |
| `GET /api/chat/comandi` | `[{ nome, descrizione, argomenti, alias: [nome] }]`: i comandi con la barra di Claude Code in questa cartella di lavoro (`docs/chat/comandi.md`, «I comandi con la barra») |
| `GET /api/chat/:id` | `{ id, titolo, attiva, stato, lavora_da, lavoro, modello, effort, messaggi: [Messaggio], in_attesa: [Richiesta], task: [Task], contesto_usato, primo_giro }`: tutta la conversazione, anche una vecchia (letta dal suo file); `primo_giro` è `true` se è cominciata con l'avvio del primo giro |
| `POST /api/chat/:id/impostazioni` | `{ modello?, effort? }` → 200 `{ modello, effort }`: cambia modello e/o effort, anche a conversazione aperta (`docs/chat/sessione.md`, «Modello ed effort») |
| `POST /api/chat/:id/messaggi` | `{ testo, allegati?, contesto? }` → 202 `{ ok }`: un messaggio in coda (se la conversazione è chiusa la riapre con `resume`) |
| `POST /api/chat/:id/ferma` | ferma ciò che Claude sta facendo (`interrupt`) e nega le richieste in attesa; la conversazione resta → 200 `{ ok }`; 409 se è chiusa |
| `POST /api/chat/:id/chiudi` | chiude la conversazione: ferma ciò che sta facendo, nega le richieste in attesa e spegne il suo processo; resta nel suo file e un messaggio la riapre con `resume` → 200 `{ ok }`, anche se era già chiusa; 404 se non c'è |
| `POST /api/chat/:id/background` | manda in background i comandi e i sottoagenti che Claude sta aspettando, come Ctrl+B nel terminale (`docs/chat/messaggi.md`, «I lavori in background») → 200 `{ ok }`; 409 se la conversazione è chiusa o non c'è niente in primo piano |
| `POST /api/chat/:id/task/:task/ferma` | ferma un lavoro (`stopTask`) → 200 `{ ok }`; 404 se il lavoro non c'è più; 409 se la conversazione è chiusa |
| `POST /api/chat/:id/risposte/:richiesta` | la risposta a una richiesta (permesso o domanda, `docs/chat/messaggi.md`, «Richiesta») → 200 `{ ok }`; 404 se la richiesta non c'è più |
| `POST /api/chat/allegati` | il file nel corpo (`X-Nome`, il nome del file, con `encodeURIComponent` se ha lettere accentate) → 201 `{ percorso }`: salvato in `archivio/.chat/allegati/`, da mettere negli `allegati` |
| `POST /api/chat/allegati/locale` | `{ percorso }`, il percorso completo di un file del computer → 201 `{ percorso }`: il server lo mette in `archivio/.chat/allegati/` (stesso nome senza sovrascrivere): fino a 16 MB lo copia, come il caricamento; oltre lo collega senza copiarlo (un hard link, o un collegamento simbolico se sta su un altro disco), e se non riesce a collegarlo è un errore, non una copia; 400 se il percorso non è completo, il file non c'è, è una cartella o è vuoto; 403 se non è un file che il creator ha scelto con un gesto (`docs/API.md`, «I file scelti dal creator»: lo dice l'app, una volta sola). Vuole il corpo JSON, come ogni rotta che scrive |

Gli errori sono quelli del server (`{ errore }`, nella lingua dello studio: `docs/API.md`, «La lingua delle frasi»): 400 per un corpo sbagliato (JSON non valido, campo che non c'è,
messaggio vuoto, allegato che non esiste o fuori dall'archivio, contesto non valido, risposta non scritta bene, modello o effort che
non esistono), 404 per una conversazione, una richiesta o un lavoro che non c'è, 409 per fermare o mandare in background in una conversazione chiusa, 502 se Claude Code
non risponde o non accetta un cambio di modello o di effort, o di fermare un lavoro o spostarlo in background. Un corpo oltre 16 MB lo rifiuta il server
prima di arrivare alla chat.

- `testo`: il testo del messaggio; può mancare solo se ci sono `allegati`.
- `allegati`: `[{ percorso }]`, i percorsi (relativi all'archivio) dati dal caricamento; qualunque file dell'archivio va bene.
  Una immagine (`png`, `jpg`, `gif`, `webp`, fino a 5 MB) arriva a Claude come immagine; ogni allegato arriva anche come riga
  `[Allegato: <percorso intero>]` in fondo al testo, così Claude può aprirlo. Un nome già preso non si sovrascrive
  (`foto-2.png`): una conversazione vecchia cita ancora il primo. `archivio/.chat/` si ignora da solo in git.
- `contesto`: `{ video?: slug, vista?: string }`: cosa il creator sta guardando nello studio. Il server lo mette davanti al testo in una
  riga che Claude legge e il creator non vede nel messaggio: `[Context: the creator is looking at the video «Titolo» (slug), tab «Slide».]`
  (senza video: `the page «Girato»`). Riaprendo una conversazione dal suo file la riga, nella forma `[Context: …]` o `[Contesto: …]`, e le righe degli allegati si tolgono dal
  testo del creator e gli allegati tornano Parti.
- `stato`: `"pronta"` (aspetta il creator), `"lavora"` (Claude sta rispondendo), `"aspetta"` (una richiesta senza risposta), `"errore"`
  (il collegamento con Claude Code è caduto: il messaggio dopo lo riapre). Una conversazione chiusa è `"pronta"`.
  Un giro che finisce male dice l'errore una volta sola, nella Parte `fine` dell'ultimo messaggio; la chat non ne aggiunge una seconda sotto (una frase di
  errore che il creator può agire dice anche cosa fare: «riscrivi il messaggio»; un account non più collegato dice di riaprire l'app, che porta ad accedere; un limite dell'abbonamento raggiunto dice a che ora si libera, se Claude Code la dà con `rate_limit_event`, altrimenti che di solito passano alcune ore).
- `lavora_da`: l'istante (ISO) in cui è cominciato il giro in corso, uguale finché il giro dura (anche se il creator scrive in coda o Claude aspetta una
  risposta); `null` se `stato` è `"pronta"` o `"errore"`. Da qui la riga del passo in corso nello studio.
- `lavoro`: `{ ms, da }`, quanto Claude ha lavorato in tutta la conversazione, senza le attese del creator (le domande, i permessi, il tempo fra un
  giro e l'altro). `ms` è il lavoro già fatto: la somma di `lavoro_ms` delle Parti `fine` (se `lavoro_ms` manca vale `durata_ms`), e per i
  giri letti da una sessione senza `fine` la stima dal messaggio del creator all'ultima cosa di Claude (l'ultimo messaggio o strumento finito);
  `da` è l'istante (ISO) in cui è cominciato il tratto di lavoro in corso, `null` se Claude non lavora. Lo studio mostra `ms` più il tempo da `da`: è il
  contatore della testata.
- `contesto_usato`: `{ usati, totale }`, quanta memoria del modello occupa la conversazione, in token; `null` finché nessuna risposta lo dice.
  `usati` è ciò che l'ultima risposta ha letto (anche dalla cache) più ciò che ha scritto, e cambia a ogni risposta, anche a metà giro (dal
  messaggio intero o dal conto che arriva coi pezzi); a fine giro Claude Code dà la misura intera (`getContextUsage`, riassunto) e con
  essa `totale`, la finestra su cui riassume la conversazione. Una conversazione di Mango Code ha i token dei suoi passi e, come
  `totale`, il contesto del suo modello (`GET /config/providers`). Letta dal file, `usati` è quello dell'ultima risposta scritta e
  `totale` è `null` per Claude Code (lo dà solo acceso) e il contesto del modello per Mango Code acceso. I sottoagenti hanno un contesto
  loro e non contano. Quando la conversazione viene riassunta (`compact_boundary` di Claude Code, `session.compacted` di Mango Code)
  `contesto_usato` torna `null`, perché il contesto nuovo si sa solo alla risposta dopo; così anche rileggendo una conversazione il cui
  ultimo messaggio è il riassunto. La `totale` già misurata resta per il conto che viene dopo.
- `titolo`: quello che Claude Code mostra in `/resume` (il titolo dato alla conversazione, o il primo messaggio del creator), su una riga,
  accorciato a 60 caratteri; uguale nell'elenco e nella conversazione (senza testo, «Conversazione senza titolo» o «Nuova conversazione», nella lingua dello studio). Le conversazioni fatte solo di comandi («/clear») non sono
  nell'elenco.
- Una conversazione resta accesa (un processo di Claude Code) finché il creator non la chiude (`POST /api/chat/:id/chiudi`, il bottone
  «Chiudi la conversazione» nella testata, `/exit`, `/clear`), il server non si ferma o il collegamento cade. Aprirne un'altra non la chiude.
  Un messaggio che arriva mentre si chiude aspetta la fine della chiusura e riapre la conversazione con `resume`; un giro in corso che si chiude non
  lascia nessun errore.
