# La chat: com'è fatta, modelli, permessi

Come la chat parla con Claude Code, i modelli e l'effort, i permessi e il collegamento a claude.ai.

## Com'è fatta

Il server (`server/src/chat/`) tiene le conversazioni con l'**Agent SDK** di Claude Code (`@anthropic-ai/claude-agent-sdk`,
funzione `query`), avviato nella cartella di lavoro (`docs/ARCHITETTURA.md`), con il metodo del prodotto come cartella in più (`docs/chat/metodo.md`, «Gli strumenti del progetto»), con le impostazioni del progetto e dell'utente (`settingSources: ["user",
"project", "local"]`), quindi con tutto ciò che Claude Code carica da terminale. Un `query` per conversazione aperta, in streaming
(l'ingresso è una coda di messaggi utente, così si scrive mentre Claude lavora), con il testo che arriva a pezzi
(`includePartialMessages`). Il modello e l'effort sono quelli di Claude Code dell'utente finché il creator non ne sceglie altri («Modello ed effort»);
l'accesso è quello già fatto sul computer
(l'abbonamento), nessuna chiave nel codice. Il programma è il `claude` che il creator ha già: lo trova l'app (`docs/APP.md`, «Il Claude Code del creator») e lo
passa al server con `MANGO_ANIMATION_CLAUDE`, e ogni `query` parte con quel percorso (`pathToClaudeCodeExecutable`), non con la copia che l'SDK porta con sé. Senza la
variabile (chi sviluppa, a mano) vale la copia dell'SDK. Le conversazioni sono quelle di Claude Code (`~/.claude/projects/…`): si
riprendono con `resume`, e una conversazione aperta da terminale si apre anche qui.

| file | cosa fa |
|---|---|
| `chat.ts` | `Chat`: l'unico proprietario in memoria delle conversazioni aperte e dell'elenco di quelle sul disco |
| `conversazione.ts` | una conversazione: il `query`, la coda di ingresso, le richieste in attesa (`canUseTool`), `ferma` |
| `modelli.ts` | l'elenco dei modelli di Claude Code e il controllo delle scelte di modello ed effort |
| `lettura.ts` | ciò che Claude Code dice di sé all'avvio, modelli e comandi, con una sola `query` senza messaggi, subito chiusa, letta una volta per vita del server |
| `comandi.ts` | l'elenco dei comandi con la barra e i messaggi che sono comandi |
| `task.ts` | i lavori in corso di Claude Code (comandi e sottoagenti), seguiti dai messaggi `task_*` dell'SDK |
| `trascrizione.ts` | i messaggi di una conversazione e la traduzione dei messaggi dell'SDK in Parti, con un evento per ogni cambio |
| `storico.ts`, `sessioni.ts` | la conversazione letta dal suo file (`getSessionMessages`, `listSessions`, e le righe `system` che l'SDK dà senza testo, lette dal file) e il controllo dei suoi cambi |
| `allegati.ts` | gli allegati, il contesto e il testo che arriva a Claude |
| `mangocode.ts` | Mango Code al posto di Claude Code (`docs/chat/mango-code.md`) |
| `rotte.ts` | le rotte (`docs/chat/api.md`) |

**Nome e segno.** La chat è del prodotto, non di Claude Code: l'assistente di Claude non ha un nome né un segno suoi, né nella testata, né nelle frasi (il nome e il
segno di Claude Code non si usano per l'assistente di un altro prodotto, regole dell'Agent SDK). «Claude» compare solo come titolo del gruppo nel menu dei modelli,
accanto a «Mango Code»; le frasi che descrivono possono dire che il prodotto usa il Claude Code installato sul computer. Mango Code ha il suo nome e il suo segno.

Lo studio (`studio/src/chat/`) mostra la chat accanto alle viste e parla solo col server: le richieste con `fetch`, gli
aggiornamenti dagli eventi del server (`GET /api/eventi`, messaggi `tipo: "chat"`), niente polling.

## Modello ed effort

`GET /api/chat/modelli` dà i modelli di Claude Code (`supportedModels()`): `id` è il nome da usare in `modello` (`default` è il modello di
Claude Code dell'utente, e il suo `nome` dice quale, preso dall'elenco stesso: «Predefinito (<modello>)», in inglese «Default (<modello>)» secondo `X-Lingua`, o solo «Predefinito» se nell'elenco non c'è il modello a cui rimanda; `traduciModelli` in `server/src/chat/modelli.ts`), `nome` e `descrizione` sono quelli di Claude Code
(la descrizione è in inglese), `effort` i livelli che il modello ha (vuoto: nessuno), `reale` il modello vero a cui `id` rimanda. L'elenco si
legge una volta sola per vita del server (una `query` senza messaggi, subito chiusa).

I livelli di effort sono `low`, `medium`, `high`, `xhigh`, `max` (nello studio: Basso, Medio, Alto, Molto alto, Massimo); `null` è il
predefinito del modello. `modello` ed `effort` valgono per una conversazione:

- **Alla creazione** (`POST /api/chat`): la conversazione parte con quelli. Senza, valgono quelli di Claude Code.
- **A conversazione aperta** (`POST /api/chat/:id/impostazioni`): il modello cambia con `setModel` e l'effort con `applyFlagSettings({ effortLevel })`,
  senza riavviare il `query`: la conversazione, i suoi lavori e le sue richieste restano dove sono. Vale dal messaggio dopo. Se la conversazione è
  chiusa o è solo nel suo file, la scelta si ricorda e vale quando la si riapre con un messaggio (`model` ed `effort` nelle opzioni del `query`, con `resume`).
- Un effort che il modello non ha è rifiutato (400, coi livelli che ha). Cambiando solo il modello, l'effort che il nuovo non ha torna al
  predefinito; la risposta e l'evento `impostazioni` dicono com'è rimasto. Se Claude Code non accetta il cambio, la scelta resta com'era (502).
- `modello` ed `effort` di `GET /api/chat/:id` sono la scelta del creator; se non ne ha fatta, ciò che Claude Code dice di aver acceso all'avvio
  (il modello vero, per esempio `claude-sonnet-5-5`, che il client riconosce da `reale`); `null` finché non è partito niente. Una conversazione
  ripresa senza scelta riparte con ciò che Claude Code accende da sé; il modello vero si vede dopo il primo messaggio.
- La scelta del creator come predefinito delle conversazioni nuove la ricorda lo studio nel browser, non il server.

## I permessi

**La chat salta sempre i permessi**: Claude Code parte come `claude --dangerously-skip-permissions` (modalità `bypassPermissions`, con
`allowDangerouslySkipPermissions`) e lavora in autonomia; non c'è una scelta da cambiare. Valgono solo le regole di rifiuto delle impostazioni di Claude Code.
La **domanda** di Claude (`AskUserQuestion`) è la Richiesta `domanda`. Mango Code ha le sue regole di permesso: quando chiedono, la Richiesta `permesso`
coi bottoni «Consenti», «Consenti sempre» (per quello strumento, fino alla fine della conversazione) e «No».

## Controllo da claude.ai

Ogni conversazione di Claude Code è collegata all'app di Claude (il controllo remoto di Claude Code), come una chat aperta da terminale con `claude --remote-control`:
compare nell'app sul telefono e su claude.ai/code col nome «Mango Animation · <titolo>», si legge e si continua da lì. Appena Claude Code è partito, `Conversazione`
(`server/src/chat/conversazione.ts`, `collega`) gli chiede di accendere il collegamento (`enableRemoteControl`, una richiesta dell'SDK che non sta nei suoi tipi; una prova
controlla che l'SDK installato ce l'abbia ancora). Una conversazione ripresa si riaggancia da sé alla sua sessione remota. Il server non tocca l'accesso dell'utente: il
collegamento lo apre Claude Code col login che ha già, e l'indirizzo della sessione che risponde non si tiene né si scrive. Se il collegamento non si apre (accesso con chiave
API, organizzazione che non lo consente, rete) la chat parte lo stesso e il registro del server dice perché (`non è collegata all'app di Claude`).
`remoteControlAtStartup` e `--remote-control` non servono qui: Claude Code li legge solo nelle sessioni interattive, non in quelle dell'SDK. Le chat di Mango Code non
passano da Claude Code e non sono collegate. Il collegamento dura quanto la conversazione è aperta nello studio.
