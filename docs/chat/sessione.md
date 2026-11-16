# La chat: com'è fatta, modelli, permessi

Come la chat parla coi motori, i modelli e l'effort, i permessi e il collegamento a claude.ai.

## Com'è fatta

Il server (`server/src/chat/`) non conosce il protocollo di nessun motore: ha un **registro di motori** (`OpzioniChat.motori`, costruito da `configurazione.ts`: Claude Code, Mango Code e, se l'ambiente indica il suo programma, Codex, in questo ordine, che è quello del menu dello studio) e parla con
ciascuno attraverso il contratto di `motore.ts`. Un `Motore` è l'oggetto intero di un motore:

- chi è: `id` (`claude-code`, `mango-code`, `codex`: è quello che le rotte e lo studio usano), `nomi` (come lo chiamano le frasi: il programma, il servizio che risponde, il nome nel menu, il comando da terminale, il nome con cui la chat lo chiama mentre lavora) e `prefisso`, l'inizio dell'`id` dei suoi modelli (`mango-code/`, `codex/`; `null` per i modelli di Claude Code: uno solo dei motori ha `null`, ed è quello delle conversazioni che nessun altro dice sue);
- cosa sa fare, le **capacità**: livelli di effort, comandi con la barra, fermare un lavoro, mandarlo in background, immagini negli esiti degli strumenti, controllo remoto, sottoagenti, browser del creator, e se ha uno strumento suo per fare domande al creator (se manca lo dà il server MCP «video», «Le domande di un motore senza uno strumento suo»). Ciò che un motore non ha lo studio non lo offre e le rotte lo rifiutano (409, con una frase nelle due lingue che nomina il motore);
- `pronto` (risponde adesso), `modelli()` e `comandi()` (letti dal motore), `modelloGrande` (il modello che indica per il primo giro, fra i suoi) e, se può accendersi e spegnersi per conto suo, `osservaAccensione` (il server annuncia l'evento `{ tipo: "modelli" }` e lo studio rilegge motori e modelli);
- le sue conversazioni: `elenca`, `leggi` (messaggi, contesto, primo giro e il modello con cui la conversazione girava, nell'`id` dell'elenco dei modelli), `osservaConversazioni` se i suoi file cambiano anche fuori dalla chat e, per il motore che dà lui l'identificativo alle sue conversazioni, `eSua`;
- `apri`: la sessione di una conversazione accesa. Una sessione dà gli eventi del suo lavoro (`EventoMotore`: avvio, testo e pensiero a pezzi, strumenti e loro esiti, contesto, lavori, comandi,
  titolo, fine del giro), riceve i messaggi del creator e chiede al creator un permesso o una domanda (`chiedi`). Un giro finito male porta un codice del prodotto (`ErroreDelGiro`), e la frase per il creator è scritta in un posto solo (`fraseDellErrore`, in
  `trascrizione.ts`) coi nomi del motore.

`Chat` tiene il motore di ogni conversazione: quello del prefisso del modello scelto alla creazione (senza prefisso, Claude Code), o quello che dice sua una conversazione già sul disco. Il campo `motore` di `GET /api/chat` e di `GET /api/chat/:id` lo dice allo studio. Una conversazione non cambia motore: il modello si cambia dentro il suo.

**Il registro delle conversazioni.** Un motore che dà lui l'identificativo alle sue conversazioni (Mango Code, Codex) tiene in `archivio/.chat/<id del motore>.json` quale sessione è di quale conversazione, col modello, il titolo, la data e, per Codex, l'ultima misura del contesto (`registro.ts`); le sue conversazioni si vedono nell'elenco anche a motore spento. Claude Code non ne ha bisogno: l'identificativo della conversazione è quello del suo file.

**Claude Code.** I file di `server/src/chat/claude/` sono tutto ciò che è suo. `claude/claude.ts` tiene le sue conversazioni con l'**Agent SDK** (`@anthropic-ai/claude-agent-sdk`,
funzione `query`), avviato nella cartella di lavoro (`docs/ARCHITETTURA.md`), con il metodo del prodotto come cartella in più (`docs/chat/metodo.md`, «Gli strumenti del progetto»), con le impostazioni del progetto e dell'utente (`settingSources: ["user",
"project", "local"]`), quindi con tutto ciò che Claude Code carica da terminale. Un `query` per conversazione aperta, in streaming
(l'ingresso è una coda di messaggi utente, così si scrive mentre Claude lavora), con il testo che arriva a pezzi
(`includePartialMessages`). Il modello e l'effort sono quelli di Claude Code dell'utente finché il creator non ne sceglie altri («Modello ed effort»);
l'accesso è quello già fatto sul computer
(l'abbonamento), nessuna chiave nel codice. Il programma è il `claude` che il creator ha già: lo trova l'app (`docs/APP.md`, «I motori della chat del creator») e lo
passa al server con `MANGO_ANIMATION_CLAUDE`, e ogni `query` parte con quel percorso (`pathToClaudeCodeExecutable`), non con la copia che l'SDK porta con sé. Senza la
variabile (chi sviluppa, a mano) vale la copia dell'SDK. Le conversazioni sono quelle di Claude Code (`~/.claude/projects/…`): si
riprendono con `resume`, e una conversazione aperta da terminale si apre anche qui.

| file | cosa fa |
|---|---|
| `chat.ts` | `Chat`: l'unico proprietario in memoria delle conversazioni aperte e dell'elenco di quelle sul disco; sceglie il motore di ognuna |
| `motore.ts` | il contratto fra la chat e un motore: il `Motore` con le sue capacità, gli eventi, la sessione, le richieste al creator, la conversazione riletta, i nomi del motore nelle frasi, l'errore di ciò che un motore non ha |
| `conversazione.ts` | una conversazione: la sessione accesa presso il motore, i suoi eventi, le richieste in attesa del creator, `ferma` |
| `modelli.ts` | i modelli di tutti i motori e il controllo delle scelte di modello ed effort |
| `comandi.ts` | l'elenco dei comandi con la barra di un motore e i messaggi che sono comandi |
| `domande.ts` | le domande di uno strumento del server (`POST /api/chat/:id/domande`), lette dal corpo della richiesta |
| `registro.ts` | il registro delle conversazioni di un motore |
| `metodo.ts` | lo strumento «video» come arriva a un motore (`serverVideo`) |
| `task.ts` | i lavori in corso del motore (comandi e sottoagenti), seguiti dai suoi eventi `lavoro` |
| `trascrizione.ts` | i messaggi di una conversazione e la traduzione degli eventi del motore in Parti, con un evento per ogni cambio; la frase di un giro finito male |
| `traduzione.ts` | le regole delle Parti comuni a ogni motore: l'esito sullo strumento a cui risponde, il suo troncamento |
| `storico.ts` | le regole comuni di una conversazione riletta (`RigaLetta`, `messaggiDalleRighe`) |
| `allegati.ts` | gli allegati, il contesto e il testo che arriva al motore |
| `rotte.ts` | le rotte (`docs/chat/api.md`) |
| `mangocode.ts` | Mango Code (`docs/chat/mango-code.md`) |
| `codex/codex.ts` | Codex come motore: le sue conversazioni su `codex app-server`, il registro, i modelli, le skill come comandi, le richieste di Codex al creator, gli errori (`docs/chat/codex.md`) |
| `codex/istruzioni.ts` | ciò che Codex riceve all'apertura di una conversazione: il metodo, le regole del creator, le righe dell'app |
| `codex/cliente.ts`, `codex/protocollo.ts` | chi parla con `codex app-server` (JSON-RPC su stdio, un programma solo, riavviato se cade) e la forma che la chat gli chiede |
| `codex/voci.ts` | le voci e le notifiche di un thread di Codex negli eventi del prodotto, in diretta e rilette |
| `livelli.ts` | i nomi dei livelli di effort, uguali per ogni motore |
| `primoGiro.ts` | l'istruzione che avvia il primo giro (`docs/chat/metodo.md`, «Il primo giro») |
| `vociSpente.ts` | i server MCP che il metodo non usa, spenti nel prompt di Mango Code (`docs/chat/mango-code.md`) |
| `claude/claude.ts` | Claude Code come motore: il `query` dell'Agent SDK in streaming e la coda di ingresso, tradotti negli eventi del motore (le opzioni dell'SDK, `AskUserQuestion`, il controllo remoto, i codici d'errore dell'API di Claude, i messaggi `task_*`) |
| `claude/ingresso.ts` | la coda dei messaggi del creator che l'SDK legge man mano |
| `claude/query.ts` | ciò che la chat usa dell'SDK: la `query`, le conversazioni dei suoi file, la misura del contesto |
| `claude/blocchi.ts` | i blocchi dell'API di Claude, come li danno l'SDK e i file di Claude Code, letti nelle forme del prodotto |
| `claude/lettura.ts` | ciò che Claude Code dice di sé all'avvio, modelli e comandi, con una sola `query` senza messaggi, subito chiusa, letta una volta per vita del server |
| `claude/modelli.ts`, `claude/comandi.ts` | i modelli e i comandi dell'SDK come li mostra la chat; il modello grande; i comandi che lo studio non lascia passare |
| `claude/sessioni.ts` | la conversazione di Claude Code letta dal suo file (`getSessionMessages`, `listSessions`, e le righe `system` che l'SDK dà senza testo, lette dal file) e il controllo dei suoi cambi |
| `claude/storico.ts` | le righe dei file di Claude Code ricomposte in messaggi |
| `claude/metodo.ts` | come il metodo del prodotto arriva a Claude Code (cartella in più, ambiente) e il `claude` del creator |

**Nome e segno.** La chat è del prodotto, non di Claude Code: l'assistente di Claude non ha un nome né un segno suoi, né nella testata, né nelle frasi (il nome e il
segno di Claude Code non si usano per l'assistente di un altro prodotto, regole dell'Agent SDK). «Claude» compare solo come titolo del gruppo nel menu dei modelli,
accanto a «Codex» e «Mango Code»; le frasi che descrivono possono dire che il prodotto usa il Claude Code installato sul computer. Codex e Mango Code hanno il loro nome e il loro segno.

Lo studio (`studio/src/chat/`) mostra la chat accanto alle viste e parla solo col server: le richieste con `fetch`, gli
aggiornamenti dagli eventi del server (`GET /api/eventi`, messaggi `tipo: "chat"`), niente polling.

## I motori

`GET /api/chat/motori` dà i motori nell'ordine in cui lo studio li mostra:

```json
{
  "id": "mango-code",
  "nome": "Mango Code",
  "nelle_frasi": "Mango Code",
  "prefisso": "mango-code/",
  "pronto": true,
  "modello_grande": null,
  "capacita": { "effort": false, "comandi": true, "ferma_lavoro": false, "in_background": false, "immagini_negli_esiti": false, "controllo_remoto": false, "sottoagenti": false, "browser": false }
}
```

- `nome`: nel menu dei motori (Claude Code vi compare come «Claude»). `nelle_frasi`: come lo nominano le frasi dello studio, `null` se non lo nominano (Claude Code). `prefisso`: l'inizio dell'`id` dei suoi modelli, `null` per Claude Code.
- `pronto`: risponde adesso. Mango Code è pronto se è acceso (`docs/chat/mango-code.md`); Codex se risponde e l'account è collegato (`docs/chat/codex.md`); Claude Code se ha dato l'elenco dei suoi modelli (la prima richiesta lo legge, come `GET /api/chat/modelli`). Quando cambia, il server annuncia `{ tipo: "modelli" }`.
- `modello_grande`: l'`id` del modello che il motore indica per il primo giro (per Claude Code l'Opus più recente, non la variante a contesto lungo; per Codex il modello che indica come predefinito); `null` se non ne indica uno o il motore non è pronto.
- `capacita`: ciò che il motore sa fare. `browser`: sa usare il browser del creator. Chi ne manca non offre il bottone, e la rotta corrispondente risponde 409.

## Modello ed effort

`GET /api/chat/modelli` unisce i modelli di tutti i motori, nell'ordine dei motori: l'errore di uno non toglie quelli degli altri, e se nessuno risponde si dà l'errore. Ogni modello è `{ id, nome, descrizione, motore, effort, reale }`:
`id` è il nome da usare in `modello` (quelli di Claude Code non hanno prefisso, gli altri sì: `mango-code/toq`; `default` è il modello di
Claude Code dell'utente, e il suo `nome` dice quale, preso dall'elenco stesso: «Predefinito (<modello>)», in inglese «Default (<modello>)» secondo `X-Lingua`, o solo «Predefinito» se nell'elenco non c'è il modello a cui rimanda; `traduciModelli` in `server/src/chat/claude/modelli.ts`), `nome` e `descrizione` sono quelli del motore
(per Claude Code la descrizione è in inglese), `motore` l'`id` del motore a cui appartiene, `effort` i livelli che il modello ha (vuoto: nessuno), `reale` il modello vero a cui `id` rimanda. L'elenco di Claude Code si
legge una volta sola per vita del server (una `query` senza messaggi, subito chiusa); quello degli altri motori a ogni richiesta.

Ogni livello di `effort` è `{ id, nome: { it, en } }`: `id` è ciò che si scrive in `effort`, `nome` come lo chiama lo studio. I livelli di Claude Code sono `low`, `medium`, `high`, `xhigh`, `max` (Basso, Medio, Alto, Molto alto, Massimo) e ogni modello ha i suoi; quelli di Codex sono i livelli che il modello dichiara (`docs/chat/codex.md`); `null` è il
predefinito del modello. `modello` ed `effort` valgono per una conversazione, e sono sempre stringhe:

- **Alla creazione** (`POST /api/chat`): la conversazione parte con quelli, e il suo motore è quello del prefisso del modello. Senza modello, Claude Code, coi suoi predefiniti.
- **A conversazione aperta** (`POST /api/chat/:id/impostazioni`): il motore cambia modello ed effort senza riavviare la conversazione (per Claude Code `setModel` e `applyFlagSettings({ effortLevel })`, senza riavviare il `query`): la conversazione, i suoi lavori e le sue richieste restano dove sono. Vale dal messaggio dopo. Se la conversazione è
  chiusa o è solo nel suo file, la scelta si ricorda e vale quando la si riapre con un messaggio (per Claude Code `model` ed `effort` nelle opzioni del `query`, con `resume`).
- Un modello di un altro motore è rifiutato (400: «Questa conversazione è di <programma>: per un modello di <servizio dell'altro motore> aprine una nuova»).
- Un effort che nessun modello ha è rifiutato (400, coi livelli che ci sono); uno che il modello scelto non ha, anche (400, coi livelli che il modello ha); a un motore che non ha l'effort, 409 (la capacità `effort`). Cambiando solo il modello, l'effort che il nuovo non ha torna al
  predefinito; la risposta e l'evento `impostazioni` dicono com'è rimasto. Se il motore non accetta il cambio, la scelta resta com'era (502).
- `modello` ed `effort` di `GET /api/chat/:id` sono la scelta del creator; se non ne ha fatta, ciò che il motore dice di aver acceso all'avvio
  (per Claude Code il modello vero, per esempio `claude-sonnet-5-5`, che il client riconosce da `reale`); `null` finché non è partito niente.
- **Una conversazione riletta dal suo file continua col modello con cui girava.** Il motore lo dice leggendola, anche chiusa: per Claude Code è il modello dell'ultima risposta scritta nel file (quelle che Claude Code scrive da sé, senza un modello vero, non contano), tradotto
  nell'`id` del modello offerto che gira con quel nome (non il «Predefinito», che ripete un altro modello; fra due varianti, quella senza contesto lungo); per Codex e Mango Code è il modello che il loro registro ricorda. `modello` di `GET /api/chat/:id` lo mostra e il messaggio dopo ci riparte. Se il modello non è più offerto, o la conversazione non lo dice,
  `modello` è `null` e riparte con ciò che il motore accende da sé.
- La scelta del creator come predefinito delle conversazioni nuove la ricorda lo studio nel browser, non il server.

## I permessi

**La chat salta sempre i permessi di Claude Code e di Codex**: Claude Code parte come `claude --dangerously-skip-permissions` (modalità `bypassPermissions`, con
`allowDangerouslySkipPermissions`) e lavora in autonomia; non c'è una scelta da cambiare. Valgono solo le regole di rifiuto delle impostazioni di Claude Code.
La **domanda** di Claude (`AskUserQuestion`) è la Richiesta `domanda`. Mango Code ha le sue regole di permesso: quando chiedono, la Richiesta `permesso`
coi bottoni «Consenti», «Consenti sempre» (per quello strumento, fino alla fine della conversazione) e «No». Codex parte senza permessi da chiedere e senza recinto; se ne chiede uno è la stessa Richiesta (`docs/chat/codex.md`).

### Le domande di un motore senza uno strumento suo

Claude Code e Mango Code hanno uno strumento loro per fare domande al creator; Codex no. Un motore che non lo ha (capacità `strumentoDelleDomande` mancante) le fa con lo strumento `domanda` del server MCP «video»: `serverVideo` mette `MANGO_ANIMATION_DOMANDE=1` nell'ambiente dello strumento solo in quel caso, accanto all'id della conversazione (`MANGO_ANIMATION_CONVERSAZIONE`), e lo strumento chiama `POST /api/chat/:id/domande`
(`docs/chat/api.md`), che apre la Richiesta `domanda` nella conversazione aperta e risponde quando il creator ha scelto, senza scadenza.

## Controllo da claude.ai

Ogni conversazione di Claude Code è collegata all'app di Claude (il controllo remoto di Claude Code), come una chat aperta da terminale con `claude --remote-control`:
compare nell'app sul telefono e su claude.ai/code col nome «Mango Animation · <titolo>», si legge e si continua da lì. Appena Claude Code è partito, `Conversazione`
(`server/src/chat/conversazione.ts`) chiede alla sessione di collegarsi (`collega`) e `claude/claude.ts` accende il collegamento (`enableRemoteControl`, una richiesta dell'SDK che non sta nei suoi tipi; una prova
controlla che l'SDK installato ce l'abbia ancora). Una conversazione ripresa si riaggancia da sé alla sua sessione remota. Il server non tocca l'accesso dell'utente: il
collegamento lo apre Claude Code col login che ha già, e l'indirizzo della sessione che risponde non si tiene né si scrive. Se il collegamento non si apre (accesso con chiave
API, organizzazione che non lo consente, rete) la chat parte lo stesso e il registro del server dice perché (`non è collegata all'app di Claude`).
`remoteControlAtStartup` e `--remote-control` non servono qui: Claude Code li legge solo nelle sessioni interattive, non in quelle dell'SDK. Le chat degli altri motori non
passano da Claude Code e non sono collegate. Il collegamento dura quanto la conversazione è aperta nello studio.
