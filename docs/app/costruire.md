# Costruire, avviare e provare l'app

Parte di `docs/APP.md`. L'installatore e le uscite: `docs/app/installer.md`, `docs/app/fork-e-uscite.md`.

## Costruire e avviare

Gli strumenti per costruire l'app (Rust e `tauri-cli`) sono in `docs/NUOVO-COMPUTER.md`, «Cosa installare». Si lavora dentro `app/`.

    cd app
    cargo tauri build --no-bundle    # app/target/release/mango-animation.exe
    cargo test                       # prove senza finestra né microfono
    cargo test il_motore_vero -- --ignored --nocapture   # col motore vero della dettatura: serve MANGO_ANIMATION_PROVA_WAV=<un WAV a 16 bit con la voce>
    cargo tauri dev                  # per lavorarci

Lo studio (`studio/dist`) lo costruisce `bun run --cwd studio build`: l'app mostra quello che il server serve. Con l'app aperta l'eseguibile
non si può sovrascrivere: va chiusa prima, con `--ferma` del comando qui sotto.

### Riavviare l'app

    bun run --cwd server riavvia-app              # chiude l'app registrata e la riaccende; senza app accesa la accende
    bun run --cwd server riavvia-app --ferma      # solo la chiude (serve per ricostruire l'eseguibile)
    bun run --cwd server riavvia-app --exe <percorso> --dati <cartella>   # un altro eseguibile, un'altra cartella del registro (prove)

Fa, in ordine: legge `app.json`; controlla che il pid sia vivo e che l'eseguibile di quel processo sia quello scritto (un pid che non c'è più o è diventato un altro programma vuol dire file vecchio: lo dice, lo toglie e non
ferma niente); chiude la finestra con garbo e aspetta fino a 15 s; se il processo non esce (o non ha una finestra) lo ferma con `taskkill /PID <pid> /T /F` e il Job Object ferma il server; aspetta fino a 10 s che la porta
del server si liberi (quella che l'app chiusa scriveva in `app.json`, `"porta"`; senza, `MANGO_ANIMATION_PORTA` o 47431); accende l'eseguibile registrato (senza app accesa: `--exe`, o `app/target/release/mango-animation.exe`) staccato dal comando; aspetta fino a 120 s che
`app.json` abbia un pid nuovo, di quell'eseguibile, con la sua `"porta"`, e che lo studio risponda lì, e scrive pid e porta (l'app può ripiegare su un'altra porta se la 47431 è occupata: conta quella che dichiara). Se non succede, l'errore indica `logs\server.log`.

- Ferma solo il pid del registro, mai per nome. Con `--exe` diverso dall'app accesa non la tocca. Un server che resta sulla porta senza che l'app lo abbia acceso non si ferma: l'avviso dice che la nuova app lo usa così
  com'è, con il codice del server non ricaricato.
- L'app nuova eredita l'ambiente di chi lancia il comando (`MANGO_ANIMATION_LAVORO`, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` messi per una prova arrivano all'app), tranne `MANGO_ANIMATION_APP_PID`.
- **Limiti.** Un'app che non ha scritto il registro non si vede: va chiusa a mano (se il secondo avvio viene assorbito dall'istanza unica, il comando lo dice). Dall'interno dell'app, cioè dalla chat, non si può:
  il comando rifiuta quando `MANGO_ANIMATION_APP_PID` è il pid registrato, perché fermerebbe se stesso con l'app; si lancia da un terminale fuori dall'app.
- **Perché un comando del server.** Non è uno strumento MCP, perché l'MCP lanciato dalla chat gira nel Job Object dell'app e morirebbe con lei a metà riavvio; non è un argomento dell'app, perché un figlio dell'app muore con
  il suo Job Object quando l'app si chiude. Il codice è `server/src/riavvia-app.ts` (entrata) e `server/src/riavvio.ts` (logica, con il sistema iniettabile per le prove).

L'icona nasce da `app/icons/sorgente.svg`; per rifarla: `cargo tauri icon icons/sorgente.svg -o <cartella vuota>` da `app/` e si copiano `32x32.png`,
`128x128.png`, `icon.ico` (`icon.png` è la sorgente resa a 1024 px: il comando la dà a 512, va resa a parte); le altre misure che il
comando crea non servono. Cargo non vede il cambio d'icona: prima di `cargo tauri build` si tocca `app/build.rs`, altrimenti l'eseguibile
tiene quella vecchia.

## Come si prova

Le prove `cargo test` non aprono finestre. La finestra vera non si guida con tastiera e mouse simulati a livello di Windows (finirebbero nella finestra che l'utente ha in primo piano): si usa il debug remoto di WebView2 (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta libera>` all'avvio dell'eseguibile, poi `chromium.connectOverCDP` di `playwright-core`, già in `studio/`), che arriva solo alla pagina dell'app anche in sottofondo. La finestra intera si fotografa come fa la segnalazione (`app/src/segnalazione/schermata.rs`) e si chiude chiedendolo a quella finestra, mai per nome di processo: solo per il PID di ciò che si è avviato.

## Dove sta cosa

| | |
|---|---|
| `app/src/lib.rs` | la finestra, l'avvio, la navigazione verso lo studio |
| `app/src/istanza.rs` | il registro dell'app in esecuzione (`app.json`) e la variabile col suo pid per il server |
| `app/src/radice.rs`, `server.rs` | dove sta il codice; il server già acceso o da accendere, e il comando che lo accende |
| `app/src/lavoro.rs` | la cartella di lavoro: la variabile, la scelta ricordata (e lo spostamento chiesto), la cartella predefinita in Documenti, il dialogo di sistema |
| `app/src/dati.rs` | la cartella dei dati vista dallo studio: leggerla e chiedere di spostarla (un comando del ponte, come la dettatura) |
| `app/src/cartella.rs` | dove stanno i video: lo spazio dei dischi, la cartella proposta, le scelte rapide e il riconoscimento di OneDrive |
| `app/src/sposta.rs` | lo spostamento della cartella dei dati: copia con avanzamento, verifica, originali tolti, o tutto com'era |
| `app/src/supervisor.rs` | i processi avviati, il Job Object, i log |
| `app/src/lingua.rs` | la lingua delle pagine dell'app: come si sceglie, la scelta ricordata, `t(it, en)`, il ponte con cui lo studio dice la sua (un comando del ponte) |
| `app/src/titolo.rs` | il colore della barra del titolo (un comando del ponte: lo studio è una pagina remota) |
| `app/src/claude.rs` | il Claude Code del creator: dove sta, versione e account, l'accesso e l'installazione |
| `app/src/codice.rs` | `codice\` dopo un aggiornamento: toglie i file che la versione nuova non ha più (l'elenco di `prepara.ts`) |
| `app/src/preparazione.rs` | i passi dell'avvio che aspettano il creator, e le sue risposte dalla pagina d'attesa |
| `app/src/computer/` | il computer pronto: cosa c'è (`hw.rs`), il manifesto di ciò che si scarica, il piano (`piano.rs`), lo scarico con verifica (`scarica.rs`), gli installatori (`installa.rs`), il profilo (`profilo.rs`), il ponte per lo studio (`ponte.rs`) |
| `app/src/segnalazione/` | «Segnala un problema» e `ui.log`: l'evento per Sentry, l'anonimizzazione, la schermata, il ponte per le pagine (comandi del ponte) |
| `app/src/aggiornamento.rs` | cercare, scaricare e installare una versione nuova, e l'errore dopo il sì |
| `app/installer/`, `app/tests/aggiornamento.rs` | costruire e pubblicare l'installatore (`costruisci.ts`, `prepara.ts`, `pubblica.ts`) e provare gli aggiornamenti con l'updater vero e un server finto |
| `app/src/zoom.rs` | lo zoom della finestra (Ctrl+ / Ctrl- / Ctrl+0), ricordato fra un avvio e l'altro |
| `app/src/appunti.rs` | i file copiati in Esplora risorse, per la chat (un comando del ponte, come la dettatura) |
| `app/src/trascinamento.rs` | i file lasciati sulla finestra, con il loro percorso (eventi, niente comandi) |
| `app/src/voce/` | la dettatura: il microfono, il motore locale (`locale.rs`), il ponte verso la pagina (`ponte.js`) e le sue prove (`prove.rs`) |
| `app/ui/`, `app/prove/pagina.test.ts` | la pagina d'attesa e d'errore, locale all'app, e le sue prove |
| `app/tests/linguaggio.rs` | le prove sui sorgenti: ogni frase della pagina e del Rust ha italiano e inglese |

I log (`server.log`, `aggiornamento.log`, `codice.log`) stanno in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
