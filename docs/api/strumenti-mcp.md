# Gli strumenti «video» (MCP)

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Strumenti MCP

Un server MCP su stdio (`server/src/mcp/`) dà ai modelli gli strumenti «video». Si accende con `bun run --cwd server mcp`.
Il server della chat lo dà a ogni motore (server «video»: gli strumenti si chiamano
`mcp__video__<nome>`; `docs/CHAT.md`, `docs/chat/metodo.md`). Quello che il server fa già lo chiede alla sua API (validazione e `storia/`
comprese): il server vero dev'essere acceso (`bun run --cwd server avvia`), altrimenti lo strumento risponde con questa
frase e il comando. I comandi leggeri del motore li lancia lui dalla cartella del codice (`python -m motore …`), con un tempo
massimo di 120 s: se lo supera, il processo si ferma per PID e lo strumento lo dice; quelli lunghi passano dalla coda
(`lavoro`). Usa le variabili d'ambiente del server: `MANGO_ANIMATION_PORTA` (dove sta il server), `MANGO_ANIMATION_PYTHON`,
`MANGO_ANIMATION_MODULO`, `MANGO_ANIMATION_LAVORO` (da cui trova la chiave delle API: `docs/API.md`, «La chiave delle API»).

Ogni risultato è un testo JSON compatto (tranne `parole`, che è il testo del motore, e le foto, che sono immagini). Un errore
ha `isError` vero e una frase in italiano: quella del server, o quella che il motore scrive su stderr, così com'è.
`slug` è sempre quello di `video_elenco` (lettere minuscole, numeri, trattini).

Gli strumenti sono quelli di `server/src/mcp/strumenti.ts`, e argomenti e risultati stanno nella descrizione che il modello legge: `video_elenco`, `video_leggi`, `video_nuovo`, `scheda_cambia`, `piano_scrivi`, `piano_ritocca`, `piano_annulla`, `valida`, `parole`, `foto`, `ascolta`, `slide`, `scene_foto`, `lavoro`, `lavoro_stato`, `lavoro_aspetta`, `apri`, `web_testo` e, per il girato, `girato_foto`, `girato_parole`, `girato_prepara`, `girato_scheda`, `girato_scarica`. Dove c'è una rotta, lo strumento la chiama (`scheda_cambia` è `PATCH /api/video/:slug`, `piano_scrivi` e `piano_ritocca` sono `PUT` e `PATCH …/piano`, `girato_parole`, `girato_prepara`, `girato_scheda` e `girato_scarica` sono le rotte di «Girato»); `girato_foto`, `valida`, `parole`, `foto` e `ascolta` lanciano il motore. `scene_foto` mette in coda `scene-foto` (`POST /api/animazioni/foto`), aspetta il lavoro come `slide` aspetta `carosello` e dà le foto rimpicciolite con le segnalazioni; se l'attesa scade (300 secondi) risponde con l'id del lavoro, e richiamato con quell'id (`lavoro`) dà il risultato senza rifare la resa.

Con `MANGO_ANIMATION_CONVERSAZIONE` nell'ambiente, l'id della conversazione della chat a cui il processo appartiene, l'attesa di un lavoro
(`lavoro_aspetta`, `scene_foto`, `slide`) si chiude appena il creator scrive in quella conversazione: lo strumento tiene aperta
`GET /api/chat/<id>/in-coda` e, quando risponde, torna con lo stato di quel momento e `messaggio_del_creator`, la frase che dice al modello di
leggere il messaggio e rispondere prima di tornare ad aspettare (`scene_foto` e `slide` la danno come errore, con il modo di richiamarli). Il
lavoro continua nella coda. Senza la variabile l'attesa finisce solo col lavoro o col tempo.

`domanda` c'è solo se l'ambiente ha anche `MANGO_ANIMATION_DOMANDE=1`; senza, l'elenco è quello sopra. Serve ai modelli che non hanno uno strumento loro per fare domande: nella chat le domande
diventano bottoni e il creator può anche scrivere una risposta sua. L'ingresso è `domande`, da 1 a 4, ciascuna con `domanda`,
`intestazione` (corta), `opzioni` (da 2 a 4, ognuna con `etichetta` e `descrizione`) e `multipla` (falso se manca). Lo strumento chiama
`POST /api/chat/<id>/domande` e aspetta, senza scadenza, finché il creator ha risposto: se il modello ritira la chiamata, la richiesta
si chiude e il server ritira la domanda. Il risultato è una riga per domanda, `«domanda» → risposta`, con la scelta fatta o il testo
scritto; se il creator ferma o la conversazione si chiude, la frase che il server dà al modello è l'errore dello strumento, come le frasi
del server per una conversazione non aperta o domande scritte male.

Le immagini sono JPEG con il lato lungo di 960 px al massimo (un verticale 1080×1920 arriva a 540×960): leggibili senza
riempire il contesto. Le rimpicciolisce `ffmpeg`; la misura sta in `server/src/mcp/processi.ts`.
