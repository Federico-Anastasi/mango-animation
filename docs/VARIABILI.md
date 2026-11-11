# Le variabili d'ambiente

Le imposta l'app, o chi sviluppa. Qui sta cosa fa ognuna e dove si spiega.

| variabile | cosa dice | chi la legge | dove si spiega |
|---|---|---|---|
| `MANGO_ANIMATION_LAVORO` | la cartella di lavoro: i dati del creator. Obbligatoria per server, motore e strumenti (senza, si fermano e dicono cosa fare); l'app la prepara da sola e la passa al server | app, server, motore, strumenti, animazioni | `docs/ARCHITETTURA.md`, «La cartella di lavoro» |
| `MANGO_ANIMATION_PORTA` | la porta del server (di serie `47431`) | server, app, `riavvia-app` | `docs/API.md`; l'app ripiega su una libera se quella di serie è occupata (`docs/app/avvio.md`) |
| `MANGO_ANIMATION_PORTA_ARRIVI` | la porta del ricevitore dei telefoni e dello studio sulla rete (di serie `47420`) | server | `docs/api/rete.md` |
| `MANGO_ANIMATION_PYTHON`, `MANGO_ANIMATION_MODULO` | il programma Python (di serie `python`) e il modulo del motore (di serie `motore`) con cui si lanciano i comandi | server, app (la dettatura) | `docs/app/computer-pronto.md`, «Quale Python usano il motore e la dettatura» |
| `MANGO_ANIMATION_CLAUDE` | il percorso del programma `claude` che usa la chat: vince su tutto ed è un errore se indica ciò che non c'è | app, server | `docs/app/claude-code.md` |
| `MANGO_ANIMATION_LINGUA` | `it` o `en`: la lingua delle frasi di un lavoro, che il server mette in base a chi l'ha chiesto | server (la mette), motore, strumenti, animazioni | `docs/LINGUA.md` |
| `MANGO_ANIMATION_RADICE` | la cartella del codice, se l'app non la trova risalendo da dove sta l'eseguibile | app | `docs/app/avvio.md` |
| `MANGO_ANIMATION_APP_PID` | il pid dell'app: la mette lei nell'ambiente del server (e dei suoi figli, la chat compresa) | server, `riavvia-app` | `docs/app/avvio.md`, `docs/app/costruire.md` |
| `MANGO_ANIMATION_DETTATURA` | la riga di comando di un altro motore della dettatura, che parli lo stesso protocollo | app | `docs/app/dettatura.md` |
| `MANGO_ANIMATION_VOCE_FILE` | un `.wav` che la dettatura suona al posto del microfono: solo per le prove | app | `docs/app/dettatura.md` |
| `MANGO_ANIMATION_PROVA_WAV` | il `.wav` della prova col motore vero della dettatura (`cargo test il_motore_vero`) | prove dell'app | `docs/app/costruire.md` |
| `MANGO_ANIMATION_UPDATE_URL` | l'indirizzo degli aggiornamenti di una prova, accettato solo su `127.0.0.1` o `localhost` | app | `docs/app/installer.md` |
| `MANGO_ANIMATION_SENTRY_DSN` | dove vanno le segnalazioni; si legge quando si costruisce l'app: vuota o `off` le spegne | costruzione dell'app | `docs/app/segnalazioni.md`, `docs/app/fork-e-uscite.md` |
| `MANGO_ANIMATION_SERVER` | il server a cui lo studio in sviluppo (`bun run --cwd studio dev`) gira le chiamate (di serie `http://127.0.0.1:47431`) | studio, in sviluppo | `docs/NUOVO-COMPUTER.md`, «Lanciare» |

Altre variabili che il prodotto legge o scrive hanno la loro pagina: le chiavi di firma degli aggiornamenti (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) in `docs/app/fork-e-uscite.md`; i proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, `NO_PROXY`) in `docs/app/rete-in-uscita.md`; `CLAUDE_CODE_PLUGIN_DIRS` in `docs/METODO.md`.
