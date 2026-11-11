# La chat: messaggi, richieste ed eventi

Le forme che portano le rotte di `docs/chat/api.md`: il Messaggio e le sue Parti, il Task, la Richiesta, gli Eventi; e i lavori in background da cui vengono i Task.

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
                                                                 `errore` è la frase di cosa è andato storto, nella
                                                                 lingua che lo studio ha usato per ultima; un giro
                                                                 fermato dal creator non ha errore

Nelle conversazioni lette dal file non c'è la Parte `fine` (il file non ha costo né durata dei giri).

**Task** (un lavoro che Claude Code ha in corso, «I lavori in background» più sotto).

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
    { tipo: "modelli" }                                          Mango Code si è acceso o spento: i modelli sono da rileggere (`GET /api/chat/modelli`, `docs/chat/mango-code.md`, «Mango Code»)

L'elenco si rilegge dal disco solo quando un file di conversazione è cambiato (anche per quelle aperte da terminale); il server
comincia a seguirli alla prima lettura dell'elenco.

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
