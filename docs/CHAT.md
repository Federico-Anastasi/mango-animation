# La chat

Nell'app (e nello studio, nel browser) il creator parla con Claude Code in una chat vera, accanto alle viste dei video. È lo stesso
Claude Code del terminale, con la stessa potenza: lo stesso abbonamento, `CLAUDE.md`, le regole di `.claude/rules/`, le skill di
`.claude/skills/`, gli strumenti MCP «video», la shell, la lettura e scrittura dei file, i sottoagenti. Cambia solo il
davanti: niente terminale, una conversazione con immagini, bottoni e lavori che si vedono.

## Com'è fatta

Il server (`server/src/chat/`) tiene le conversazioni con l'**Agent SDK** di Claude Code (`@anthropic-ai/claude-agent-sdk`,
funzione `query`), avviato nella cartella di lavoro (`docs/ARCHITETTURA.md`), con il metodo del prodotto come cartella in più (sotto, «Gli strumenti del progetto»), con le impostazioni del progetto e dell'utente (`settingSources: ["user",
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
| `mangocode.ts` | Mango Code al posto di Claude Code (sotto, «Mango Code») |
| `rotte.ts` | le rotte qui sotto |

**Nome e segno.** La chat è del prodotto, non di Claude Code: l'assistente di Claude non ha un nome né un segno suoi, né nella testata, né nelle frasi (il nome e il
segno di Claude Code non si usano per l'assistente di un altro prodotto, regole dell'Agent SDK). «Claude» compare solo come titolo del gruppo nel menu dei modelli,
accanto a «Mango Code»; le frasi che descrivono possono dire che il prodotto usa il Claude Code installato sul computer. Mango Code ha il suo nome e il suo segno.

Lo studio (`studio/src/chat/`) mostra la chat accanto alle viste e parla solo col server: le richieste con `fetch`, gli
aggiornamenti dagli eventi del server (`GET /api/eventi`, messaggi `tipo: "chat"`), niente polling.

## API

L'`id` di una conversazione è quello di Claude Code (un UUID): lo stesso del suo file e di `claude --resume`.

| rotta | cosa fa |
|---|---|
| `GET /api/chat` | le conversazioni, dalla più recente: `[{ id, titolo, aggiornata, attiva }]` (`attiva`: c'è un `query` acceso) |
| `POST /api/chat` | `{ testo, allegati?, contesto?, modello?, effort? }` → 201 `{ id }`: una conversazione nuova col primo messaggio, e se si vuole il suo modello e il suo effort |
| `GET /api/chat/modelli` | `[{ id, nome, descrizione, effort: [livello], reale }]`: i modelli che Claude Code offre (sotto, «Modello ed effort») e, se è acceso, quelli di Mango Code (sotto, «Mango Code») |
| `GET /api/chat/comandi` | `[{ nome, descrizione, argomenti, alias: [nome] }]`: i comandi con la barra di Claude Code in questa cartella di lavoro (sotto, «I comandi con la barra») |
| `GET /api/chat/:id` | `{ id, titolo, attiva, stato, lavora_da, lavoro, modello, effort, messaggi: [Messaggio], in_attesa: [Richiesta], task: [Task], contesto_usato }`: tutta la conversazione, anche una vecchia (letta dal suo file) |
| `POST /api/chat/:id/impostazioni` | `{ modello?, effort? }` → 200 `{ modello, effort }`: cambia modello e/o effort, anche a conversazione aperta (sotto) |
| `POST /api/chat/:id/messaggi` | `{ testo, allegati?, contesto? }` → 202 `{ ok }`: un messaggio in coda (se la conversazione è chiusa la riapre con `resume`) |
| `POST /api/chat/:id/ferma` | ferma ciò che Claude sta facendo (`interrupt`) e nega le richieste in attesa; la conversazione resta → 200 `{ ok }`; 409 se è chiusa |
| `POST /api/chat/:id/chiudi` | chiude la conversazione: ferma ciò che sta facendo, nega le richieste in attesa e spegne il suo processo; resta nel suo file e un messaggio la riapre con `resume` → 200 `{ ok }`, anche se era già chiusa; 404 se non c'è |
| `POST /api/chat/:id/background` | manda in background i comandi e i sottoagenti che Claude sta aspettando, come Ctrl+B nel terminale (sotto, «I lavori in background») → 200 `{ ok }`; 409 se la conversazione è chiusa o non c'è niente in primo piano |
| `POST /api/chat/:id/task/:task/ferma` | ferma un lavoro (`stopTask`) → 200 `{ ok }`; 404 se il lavoro non c'è più; 409 se la conversazione è chiusa |
| `POST /api/chat/:id/risposte/:richiesta` | la risposta a una richiesta (permesso o domanda, sotto) → 200 `{ ok }`; 404 se la richiesta non c'è più |
| `POST /api/chat/allegati` | il file nel corpo (`X-Nome`, il nome del file, con `encodeURIComponent` se ha lettere accentate) → 201 `{ percorso }`: salvato in `archivio/.chat/allegati/`, da mettere negli `allegati` |
| `POST /api/chat/allegati/locale` | `{ percorso }`, il percorso completo di un file del computer → 201 `{ percorso }`: il server lo mette in `archivio/.chat/allegati/` (stesso nome senza sovrascrivere): fino a 16 MB lo copia, come il caricamento; oltre lo collega senza copiarlo (un hard link, o un collegamento simbolico se sta su un altro disco), e se non riesce a collegarlo è un errore, non una copia; 400 se il percorso non è completo, il file non c'è, è una cartella o è vuoto. Vuole il corpo JSON, come ogni rotta che scrive |

Gli errori sono quelli del server (`{ errore }` in italiano): 400 per un corpo sbagliato (JSON non valido, campo che non c'è,
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
  errore che il creator può agire dice anche cosa fare: «riscrivi il messaggio»).
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
  accorciato a 60 caratteri; uguale nell'elenco e nella conversazione. Le conversazioni fatte solo di comandi («/clear») non sono
  nell'elenco.
- Una conversazione resta accesa (un processo di Claude Code) finché il creator non la chiude (`POST /api/chat/:id/chiudi`, il bottone
  «Chiudi la conversazione» nella testata, `/exit`, `/clear`), il server non si ferma o il collegamento cade. Aprirne un'altra non la chiude.
  Un messaggio che arriva mentre si chiude aspetta la fine della chiusura e riapre la conversazione con `resume`; un giro in corso che si chiude non
  lascia nessun errore.

**Messaggio** (ciò che la chat mostra, in ordine). Un messaggio di Claude è un giro intero: tutto ciò che fa fra un messaggio
del creator e la sua fine. Se il creator scrive mentre Claude lavora, il messaggio di Claude si chiude lì e ciò che segue è un messaggio nuovo
sotto; la Parte `fine` va sull'ultimo messaggio del giro.

    { id, ruolo: "utente" | "claude", quando, parti: [Parte] }
    Parte:
      { tipo: "testo", testo }                                   markdown
      { tipo: "pensiero", testo }                                 ragionamento, chiuso di base
      { tipo: "strumento", id, nome, ingresso, esito?, errore?, immagini?: [{ media_type, data }], iniziato?, finito? }
                                                                 una chiamata (Bash, Read, Edit, Skill, mcp__video__…)
                                                                 col suo esito (al massimo 20.000 caratteri; poi «… altri N
                                                                 caratteri non mostrati»); le immagini degli strumenti (foto,
                                                                 slide) si vedono nella chat; `errore` al posto di `esito` se
                                                                 lo strumento ha fallito o il creator ha detto di no; `iniziato` e `finito` sono
                                                                 gli istanti (ISO) in cui è partito e tornato: finché lavora c'è solo il primo
                                                                 (nelle conversazioni lette dal file sono le ore delle righe del file)
      { tipo: "allegato", percorso, immagine: bool }             ciò che il creator ha allegato (percorso relativo all'archivio)
      { tipo: "fine", costo?, durata_ms, lavoro_ms?, errore? }   la fine di un giro; `durata_ms` quanto è durato tutto (lo dice Claude Code),
                                                                 `lavoro_ms` quanto Claude ha lavorato, senza le attese del creator;
                                                                 `errore` è la frase in italiano di cosa è
                                                                 andato storto; un giro fermato dal creator non ha errore

Nelle conversazioni lette dal file non c'è la Parte `fine` (il file non ha costo né durata dei giri).

**Task** (un lavoro che Claude Code ha in corso, sotto «I lavori in background»).

    { id, tipo: "comando" | "agente" | "altro", descrizione, iniziato, background, uso?: { token, strumenti } }
                                                                 `descrizione`: ciò che Claude Code dice del lavoro; `iniziato`: l'istante (ISO)
                                                                 in cui il server l'ha visto; `background`: `false` se Claude lo sta aspettando;
                                                                 `uso`: i token e gli strumenti usati dall'inizio, dall'ultimo messaggio di
                                                                 avanzamento (assente finché non ne arriva uno)

**Richiesta** (Claude chiede, il creator risponde con un bottone). L'`id` è quello della chiamata dello strumento.

    { id, tipo: "permesso", strumento, ingresso, frase }         «Vuole usare Bash: rm …» → «Consenti», «Consenti sempre», «No»
    { id, tipo: "domanda", domande: [{ domanda, intestazione, opzioni: [{ etichetta, descrizione }], multipla }] }
                                                                 lo strumento AskUserQuestion di Claude Code: le opzioni sono bottoni,
                                                                 più «Altro» con un campo di testo

Il corpo della risposta a un **permesso** è `{ scelta: "consenti" | "sempre" | "no", motivo? }`: `sempre` vale per quello strumento
fino alla fine della conversazione (finché il server resta acceso); `motivo` (solo con `no`) lo legge Claude. Per una **domanda** è
`{ scelta: { risposte: { [domanda]: etichetta | testo } } }`: una risposta per ogni domanda; con `multipla` anche un elenco di
etichette, che il server unisce con «, ». Una risposta non valida non tocca la richiesta, che resta in attesa.

**Eventi** (`GET /api/eventi`, `tipo: "chat"`). Un client che apre una conversazione legge `GET /api/chat/:id` e poi segue gli eventi.

    { tipo: "chat", id, evento: "messaggio", messaggio }          un messaggio nuovo (anche quello del creator), con le Parti che ha già
    { tipo: "chat", id, evento: "parte", messaggio, indice, parte }  una Parte nuova o cresciuta: il testo arriva a pezzi e la Parte
                                                                 si sostituisce per `messaggio` (l'id) + `indice`
    { tipo: "chat", id, evento: "stato", stato, da?, lavoro }     `da`: come `lavora_da`, presente quando la conversazione non è pronta né in errore;
                                                                 `lavoro`: come in `GET /api/chat/:id`
    { tipo: "chat", id, evento: "impostazioni", modello, effort }  modello o effort sono cambiati (una scelta del creator, o ciò che Claude Code ha acceso)
    { tipo: "chat", id, evento: "task", task: [Task] }            i lavori in corso sono cambiati: l'elenco intero, che sostituisce il precedente
    { tipo: "chat", id, evento: "contesto_usato", contesto_usato }  il contesto occupato è cambiato (`{ usati, totale }`, come nella lettura; `null` dopo il riassunto)
    { tipo: "chat", id, evento: "richiesta", richiesta }          Claude chiede
    { tipo: "chat", id, evento: "risposta", richiesta }           la richiesta (l'id) non è più in attesa: risposta, o fermata
    { tipo: "chat", id, evento: "titolo", titolo }               il titolo è cambiato (`/rename`)
    { tipo: "chat", id, evento: "chiusa" }                       la conversazione si è chiusa (`attiva` diventa `false`)
    { tipo: "chat", id, evento: "elenco" }                       l'elenco delle conversazioni è cambiato (`id`: quella che è cambiata)
    { tipo: "comandi" }                                          i comandi con la barra sono cambiati: da rileggere (`GET /api/chat/comandi`)
    { tipo: "modelli" }                                          Mango Code si è acceso o spento: i modelli sono da rileggere (`GET /api/chat/modelli`, sotto «Mango Code»)

L'elenco si rilegge dal disco solo quando un file di conversazione è cambiato (anche per quelle aperte da terminale); il server
comincia a seguirli alla prima lettura dell'elenco.

## I comandi con la barra

Nella chat si usano i comandi di Claude Code come nel terminale: scrivendo `/` all'inizio del messaggio si apre la tendina dei comandi.

- **La tendina.** Si apre finché il messaggio è `/` più il nome che si sta scrivendo (senza spazi) e lo filtra: prima i comandi il cui nome
  comincia con ciò che è scritto, poi quelli con un alias che comincia così, poi quelli che lo contengono. Ogni riga: `/nome`, gli argomenti (`argomenti`, se ce ne sono) e la
  descrizione su una riga. Frecce su e giù per scegliere, Tab per completare (`/nome `, per scrivere gli argomenti), Invio per mandare il
  comando scelto (come nel terminale), Esc per chiuderla; un clic completa. Ci sono i comandi dello studio (sotto) e, in una conversazione di
  Claude Code, quelli di `GET /api/chat/comandi`. In una di Mango Code solo quelli dello studio.
- **L'elenco di Claude Code** (`GET /api/chat/comandi`): ciò che Claude Code offre in questa cartella di lavoro (`supportedCommands()`: i suoi,
  le skill del prodotto e del creator, quelli dei plugin), con `descrizione` (in inglese, com'è in Claude Code), `argomenti` (il suggerimento,
  vuoto se non ne vuole) e `alias`. Si legge una volta per vita del server, con la stessa `query` senza messaggi dei modelli (una sola per tutti e due); quando una
  conversazione aperta riceve `commands_changed` l'elenco si sostituisce e il server annuncia `{ tipo: "comandi" }`.
- **Cosa arriva a Claude Code.** Un messaggio che comincia con `/` arriva com'è scritto, senza la riga di contesto davanti (che lo farebbe
  leggere come testo) e senza immagini: gli allegati diventano righe `[Allegato: …]` dopo il testo. Claude Code lo esegue come nel
  terminale: i comandi locali rispondono subito con il loro testo (`/context`, `/usage`, `/mcp`, `/rename`…), che la chat mostra come
  messaggio di Claude; `/compact` riassume la conversazione; le skill e i comandi che sono istruzioni lavorano come un messaggio. Uno che
  Claude Code non esegue qui risponde da sé che non è disponibile.
- **I comandi dello studio** fanno nello studio ciò che nel terminale ha la sua finestra, e non arrivano a Claude Code:

  | comando | cosa fa |
  |---|---|
  | `/clear` (`/reset`, `/new`) | chiude la conversazione e ne apre una nuova vuota |
  | `/exit` (`/quit`) | chiude la conversazione |
  | `/resume` (`/continue`) | apre l'elenco delle conversazioni |
  | `/model [modello]` | senza argomento apre il menu del modello; con un argomento (l'`id` o il nome di un modello dell'elenco) lo sceglie |
  | `/effort [livello]` | senza argomento apre il menu dell'effort; con un livello lo sceglie |

  Il server rifiuta (400) un messaggio `/clear`, `/reset`, `/new`, `/model …` o `/effort …` per una conversazione di Claude Code, con la
  frase che dice come si fa: `/clear` farebbe cambiare a Claude Code l'id della conversazione sotto la chat, e modello ed effort si cambiano
  con `POST /api/chat/:id/impostazioni`, che tiene il menu allineato.
- **Riletta dal file**, una conversazione mostra i comandi come messaggi del creator (`/rename prova`) e le loro risposte come messaggi di
  Claude, come mentre girava; una risposta vuota non mostra niente, e il riassunto che Claude Code scrive per sé dopo `/compact` non è un
  messaggio del creator. Di una conversazione riassunta (`/compact` o in automatico) si vede solo ciò che segue l'ultimo riassunto, come
  nel terminale. `getSessionMessages` (con `includeSystemMessages`) dà le righe `system` solo con `uuid` e orario, senza `subtype` né
  `content`: il testo della risposta (`local_command`) e il riassunto della conversazione (`compact_boundary`) il server li legge dal file della
  sessione, per `uuid`.

## Modello ed effort

`GET /api/chat/modelli` dà i modelli di Claude Code (`supportedModels()`): `id` è il nome da usare in `modello` (`default` è il modello di
Claude Code dell'utente, e il suo `nome` dice quale: «Predefinito (Sonnet 5.5)», in inglese «Default (Sonnet 5.5)», secondo `X-Lingua`), `nome` e `descrizione` sono quelli di Claude Code
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

## I lavori in background

Un comando lungo (`Bash`) o un sottoagente tiene Claude fermo finché non finisce, e un messaggio che il creator scrive nel frattempo
resta in coda: Claude lo legge solo quando lo strumento ha finito. Come con Ctrl+B nel terminale, `Query.backgroundTasks()` sposta
in background i lavori in primo piano: lo strumento torna subito con «in background», Claude va avanti e legge il messaggio, e il
lavoro continua e si segnala da solo quando finisce. La priorità `now` di un messaggio non basta (il messaggio
aspetta lo stesso la fine del comando): non si usa.

- **Cosa si segue.** I messaggi `system` dell'SDK: `task_started` (con `is_backgrounded`: `false` è un lavoro che Claude aspetta; Claude Code lo
  manda dopo qualche secondo di comando, non subito), `task_updated` (il passaggio in background, la fine), `task_notification` (la fine) e
  `background_tasks_changed`, l'elenco di ciò che è in background a ogni cambio, che rimette a posto ciò che si fosse perso, e `task_progress`
  (`usage.total_tokens` e `usage.tool_uses` diventano `uso`, solo di un lavoro già nell'elenco; ogni cambio è un evento `task`). `task.ts` ne fa
  l'elenco `task` della conversazione e ogni cambio è l'evento `task`. Non entrano i lavori di servizio e quelli di un sottoagente. Lo studio scrive
  `uso` come «12,4k token · 18 strumenti» nella scheda di un lavoro in background e, sommato, nella riga di lavoro mentre Claude ne aspetta uno in primo piano. Un
  lavoro in background resta da un giro all'altro e finisce con il processo di Claude Code (la conversazione che si chiude o cade).
- **Mandare in background** (`POST /api/chat/:id/background`): il server lo rifiuta (409) se nell'elenco non c'è niente in primo piano; poi
  chiede `backgroundTasks()` per tutti, senza scegliere un lavoro.
- **Fermare** (`POST /api/chat/:id/task/:task/ferma`): `stopTask`; il lavoro sparisce dall'elenco con la sua `task_notification`.
- **Mango Code** non ha lavori in background: non manda mai `task_*`, quindi per lui l'elenco è vuoto e la chat non offre né l'uno né l'altro.

## Mango Code

Al posto di Claude Code una conversazione può parlare con **Mango Code**, che lavora coi modelli sul computer (Mango Code è un progetto a parte;
il contratto è in [`docs/INTEGRATION.md`](https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md)). Il server lo usa attraverso `server/src/chat/mangocode.ts`, che dà alla
conversazione la stessa `query` di Claude Code: gli eventi di Mango Code diventano i messaggi dell'SDK, così messaggi, Parti, eventi e
richieste sono gli stessi di sopra.

- **Quando c'è.** Se Mango Code è pronto (`service.json` nella sua cartella dei dati, `MANGO_DATA`, di base `%LOCALAPPDATA%\MangoCode`, col
  processo `pid` vivo e `agent` che risponde),
  `GET /api/chat/modelli` aggiunge i suoi modelli dopo quelli di Claude Code: `id` `mango-code/<chiave>` (la chiave è quella che Mango Code dà al modello, per esempio `mango-code/toq`),
  `nome` «Mango Code · <nome>», nessun effort. L'elenco si rilegge a ogni richiesta, perché Mango Code si accende e si spegne per conto suo: il
  server osserva il suo `service.json` e, quando compare, cambia o sparisce, annuncia l'evento `modelli`, a cui lo studio rilegge il menu.
  Se Claude Code non risponde, bastano quelli di Mango Code. Il server non accende Mango Code: lo si apre dalla sua icona. Acceso ma non
  pronto (il file c'è con `reason` al posto di `agent` e `engine`: si sta preparando, o aspetta una scelta nella sua finestra) non offre
  modelli, e una sua conversazione dice «Mango Code si sta preparando o non è pronto: guarda la sua finestra e riscrivi il messaggio.»
  (alla lettura: «… che non è ancora pronto: guarda la sua finestra e riprova.»); il testo di `reason` non si legge né si ripete.
- **Una conversazione è dell'uno o dell'altro.** Nasce di Mango Code con un suo modello (`POST /api/chat` con `modello: "mango-code/…"`);
  poi cambia modello solo fra quelli di Mango Code (400 per uno di Claude, e viceversa). La testata dello studio dice «Mango Code».
- **Cosa riceve.** Lo strumento «video» (aggiunto alla cartella di lavoro con `POST /mcp` se non è già collegato, finché Mango Code
  resta acceso); il metodo del prodotto come cartella in più (`PUT /mango/extra-folders` `{ folders }`, la cartella del codice, a ogni
  avvio della conversazione): Mango Code ne legge `CLAUDE.md`, regole e skill come quelli della cartella di lavoro, che legge da sé (il `CLAUDE.md` e
  le regole del creator); le istruzioni dell'app, con ciò che Claude Code sa dall'ambiente (dove sono i dati, che il codice si legge
  e basta, come si lancia il motore). Ogni chiamata si presenta come «Mango Animation» (`User-Agent`), come la scrive il registro del
  suo gestore. Un Mango Code senza le cartelle in più non apre la conversazione: «Questa versione di Mango Code è troppo vecchia: aggiornala.»
- **Cosa entra nel prompt.** Le app non possono spegnere voci dalla rotta (`PUT /mango/settings` dà 403 senza `Origin`), ma Mango Code
  legge `.mango/settings.json` nella cartella di lavoro. All'avvio di ogni conversazione, accanto alle cartelle in più, il server
  (`server/src/chat/vociSpente.ts`) vi spegne i server MCP `chrome-devtools` e `documenti`, che pesano nel prompt e il metodo non usa
  (`web-search` resta acceso): aggiunge solo le voci mancanti a `false` e lascia le altre, anche le altre voci di `prompt.mcp`. Una voce
  si spegne una volta sola per cartella di lavoro, e ciò che è già fatto sta in `archivio/.chat/mango-code-voci-spente.json`: la pagina
  di Mango Code, quando il creator riaccende una voce «solo per questa cartella», la toglie dal file, e senza il ricordo la voce assente
  si rispegnerebbe al messaggio dopo. Una voce già scritta nel file, vera o falsa, è del creator. Un file che non si legge non si
  riscrive: la conversazione dice di correggerlo o toglierlo.
- **Contesto usato.** Ogni passo del giro (una richiesta al modello) è un messaggio suo; il contesto dopo il passo è il suo `tokens.total`
  (ingresso, cache letta e scritta, uscita e ragionamento), preso dall'ultimo passo finito (`finish`) che non è il riassunto
  (`summary`): un passo a zero è in corso o fermato, non un contesto vuoto, e il riassunto porta i token della richiesta che lo scrive.
  Dopo `session.compacted` il contesto non si sa fino alla fine del passo che riprende (vedi `contesto_usato`). Gli eventi ripetuti
  identici (`message.updated` due volte, `session.idle` più volte per giro) non cambiano niente.
- **Domande, permessi, «Ferma».** Le domande di Mango Code diventano la Richiesta `domanda`, e la risposta torna a lui (per ogni
  domanda le etichette scelte, o il testo scritto); i permessi, se le sue regole li chiedono, la Richiesta `permesso`; «Ferma» ferma
  il giro (`abort`). Un errore del giro è la Parte `fine` con `errore`.
- **Le conversazioni.** Quale sessione di Mango Code è di quale conversazione, col suo modello, titolo e data, sta in
  `archivio/.chat/mango-code.json`: la conversazione resta nell'elenco anche a Mango Code spento, e si rilegge dai suoi messaggi
  quando è acceso (502 se è spento). Un messaggio nuovo continua la stessa sessione.
- **Cosa non c'è** (scritto nel contratto di Mango Code): effort, sottoagenti, Claude in Chrome, fermare o mandare in background un lavoro da solo, le immagini nei risultati degli strumenti.
- **Errori.** Ogni errore di Mango Code arriva al creator come una frase completa, mai incapsulata in un'altra, e il dettaglio tecnico (lo stato e il
  corpo della risposta) va nel registro del server (`chat di Mango Code: …`): «Mango Code è spento: aprilo dalla sua icona e riscrivi il
  messaggio.», «Mango Code non ha preso il messaggio: riprova.», «Mango Code non risponde.», «Mango Code ha chiuso il collegamento:
  riscrivi il messaggio.». Un giro andato male finisce con «Mango Code si è fermato: <motivo>.» (per Claude Code, che nella chat non ha un nome, «Si è fermato: …»).
  Gli errori di un solo motore portano il suo nome; quelli che valgono per entrambi no («Questa richiesta non c'è più», «Non c'è un lavoro
  in corso da mandare in background»). Le frasi che dicono cosa il motore vuole fare («Vuole usare Bash: …» per Claude Code, «Mango Code vuole usare …»)
  non riportano mai l'ingresso grezzo dello strumento: quello sta in `ingresso`.

## Controllo da claude.ai

La chat non si collega a claude.ai e non tocca l'accesso dell'utente: Claude Code usa da sé l'accesso che ha già sul computer. Chi vuole guidare una
sessione dal telefono o da claude.ai apre `claude` da terminale nella cartella di lavoro e usa il controllo remoto di Claude Code (`claude --remote-control`).

## Gli strumenti del progetto

Il server passa a ogni conversazione lo strumento «video» come configurazione esplicita (`server/src/chat/metodo.ts`): il suo codice sta nel prodotto
(`bun run --cwd <codice>/server mcp`, percorsi assoluti), i dati che legge nella cartella di lavoro (`MANGO_ANIMATION_LAVORO`). C'è anche dove le impostazioni
locali di un computer lo spengono per il terminale (`disabledMcpjsonServers`).

**La lingua.** Ciò che istruisce Claude è metodo e sta in inglese: le istruzioni che il server aggiunge al prompt di sistema (`NELL_APP` in
`server/src/chat/conversazione.ts`, che gli dicono anche di rispondere nella lingua del creator, l'italiano di base), le descrizioni degli strumenti e dei loro
parametri, la riga di contesto. I nomi degli strumenti non cambiano. Sono in italiano gli errori che gli strumenti riportano (sono quelli del server, che anche
l'interfaccia mostra) e la riga `[Allegato: …]`.

Il metodo del prodotto arriva a Claude Code come cartella in più (`additionalDirectories` col codice, `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`):
Claude Code legge da sé `CLAUDE.md`, regole e skill del codice. `PYTHONPATH` e `MANGO_ANIMATION_LAVORO` stanno nell'ambiente dei processi di Claude perché
`python -m motore` funzioni dalla cartella di lavoro: i dettagli, e il plugin che porta lo stesso metodo a Claude Code da terminale, sono in `docs/ARCHITETTURA.md`,
«Come il metodo arriva a Claude». A Mango Code il metodo arriva come cartella in più (sopra). Le conversazioni sono quelle
di quella cartella (`~/.claude/projects/<cartella di lavoro>`): una aperta da terminale nella cartella di lavoro si ritrova qui.

Ogni conversazione parte anche con Claude in Chrome (`extraArgs: { chrome: null }`, come `claude --chrome`): gli strumenti
`mcp__claude-in-chrome__*` sono fra quelli che Claude ha, e lavorano nel Chrome dell'utente con l'estensione installata.

## Cosa ha in più del terminale, per i video

- Le immagini degli strumenti (`foto`, `slide`, `scene_foto`) dentro la chat, grandi al clic.
- Un lavoro della coda chiesto da Claude (`lavoro`) si vede come una scheda viva nella chat, con stima, trascorso e «Ferma»
  (dagli eventi `lavori` che lo studio già riceve).
- Un nome di video o un percorso dell'archivio nella risposta è un link che apre quella vista nello studio.
- Il contesto: Claude sa quale video e quale scheda il creator sta guardando, senza che il creator lo scriva.
- Incolla e trascina: un'immagine dagli appunti, un file trascinato o (nell'app) uno o più file copiati in Esplora risorse diventano allegati.
  Il browser dà alla pagina le immagini e i file trascinati (fino a 16 MB; un file più grande si incolla da Esplora risorse); nell'app i file
  copiati li legge l'app dagli appunti di Windows (`docs/APP.md`, «Gli appunti») e quelli trascinati li dà l'app col loro percorso
  (`docs/APP.md`, «I file trascinati»): la pagina li manda al server per percorso (`POST /api/chat/allegati/locale`), che li copia se piccoli e
  li collega se grandi.
