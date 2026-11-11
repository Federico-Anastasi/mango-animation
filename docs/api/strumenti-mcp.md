# Gli strumenti «video» (MCP)

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Strumenti MCP

Un server MCP su stdio (`server/src/mcp/`) dà ai modelli gli strumenti «video». Si accende con `bun run --cwd server mcp`.
Il server della chat lo dà a Claude Code (server «video»: gli strumenti si chiamano
`mcp__video__<nome>`; `docs/CHAT.md`). Quello che il server fa già lo chiede alla sua API (validazione e `storia/`
comprese): il server vero dev'essere acceso (`bun run --cwd server avvia`), altrimenti lo strumento risponde con questa
frase e il comando. I comandi leggeri del motore li lancia lui dalla cartella del codice (`python -m motore …`), con un tempo
massimo di 120 s: se lo supera, il processo si ferma per PID e lo strumento lo dice; quelli lunghi passano dalla coda
(`lavoro`). Usa le variabili d'ambiente del server: `MANGO_ANIMATION_PORTA` (dove sta il server), `MANGO_ANIMATION_PYTHON`,
`MANGO_ANIMATION_MODULO`, `MANGO_ANIMATION_LAVORO` (da cui trova la chiave delle API: `docs/API.md`, «La chiave delle API»).

Ogni risultato è un testo JSON compatto (tranne `parole`, che è il testo del motore, e le foto, che sono immagini). Un errore
ha `isError` vero e una frase in italiano: quella del server, o quella che il motore scrive su stderr, così com'è.
`slug` è sempre quello di `video_elenco` (lettere minuscole, numeri, trattini).

Gli strumenti sono quelli di `server/src/mcp/strumenti.ts`, e argomenti e risultati stanno nella descrizione che il modello legge: `video_elenco`, `video_leggi`, `video_nuovo`, `scheda_cambia`, `piano_scrivi`, `piano_ritocca`, `piano_annulla`, `valida`, `parole`, `foto`, `ascolta`, `slide`, `scene_foto`, `lavoro`, `lavoro_stato`, `lavoro_aspetta`, `apri`, `web_testo` e, per il girato, `girato_foto`, `girato_parole`, `girato_prepara`, `girato_scheda`, `girato_scarica`. Dove c'è una rotta, lo strumento la chiama (`scheda_cambia` è `PATCH /api/video/:slug`, `piano_scrivi` e `piano_ritocca` sono `PUT` e `PATCH …/piano`, `girato_parole`, `girato_prepara`, `girato_scheda` e `girato_scarica` sono le rotte di «Girato»); `girato_foto`, `valida`, `parole`, `foto` e `ascolta` lanciano il motore. `scene_foto` mette in coda `scene-foto` (`POST /api/animazioni/foto`), aspetta il lavoro come `slide` aspetta `carosello` e dà le foto rimpicciolite con le segnalazioni; se l'attesa scade (300 secondi) risponde con l'id del lavoro, e richiamato con quell'id (`lavoro`) dà il risultato senza rifare la resa.

Le immagini sono JPEG con il lato lungo di 960 px al massimo (un verticale 1080×1920 arriva a 540×960): leggibili senza
riempire il contesto. Le rimpicciolisce `ffmpeg`; la misura sta in `server/src/mcp/processi.ts`.
