# Architettura

Mango Animation è l'archivio e il banco di montaggio dei video di un creator. È fatto di file: Claude lavora da
terminale nella cartella di lavoro (regole in `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`), l'interfaccia
nel browser mostra gli stessi file e li ritocca, e ha una chat con Claude Code o con Mango Code, un progetto a parte (`docs/CHAT.md`), che lavora sugli stessi file.

## I pezzi

| cartella | cosa fa | con cosa |
|---|---|---|
| `motore/` | prepara il girato, risolve un piano in tratti, monta, controlla, fa la copertina | Python 3.12, ffmpeg, torch (la scheda del profilo) |
| `animazioni/` | le scene animate e gli elementi standard, resi fotogramma per fotogramma | React, Vite, Playwright, Bun |
| `server/` | serve l'interfaccia, legge e scrive l'archivio, osserva i file, tiene la coda dei lavori, riceve dal telefono, registra lo schermo, scarica dal web nel girato, tiene le conversazioni con Claude Code (`src/chat/`, `docs/CHAT.md`) | Bun, ffmpeg, Agent SDK di Claude Code |
| `studio/` | l'interfaccia nel browser | React, Vite, TypeScript, CSS a moduli |
| `app/` | l'app desktop Mango Animation: una finestra con lo studio a tutta pagina, accende il server e chiude tutto con sé (`docs/APP.md`) | Rust, Tauri 2 |
| `strumenti/` | la lettura del canale TikTok, gli sticker | Python |
| `.claude-plugin/`, `plugin/` | il metodo (skill, strumento «video», regole) come plugin di Claude Code (sotto, «Come il metodo arriva a Claude») | Bun |
| `stile.json` | lo stile di serie: formati, colori, quadri, sottotitoli, titolo, copertina, voce; quello del creator ci si sovrappone (sotto) | — |
| `archivio/` | i dati: girato, video, arrivi. Sta nella cartella di lavoro, non qui | `docs/ARCHIVIO.md` |

## La cartella di lavoro

Il prodotto vive in due cartelle. Il **codice** (questa: motore, strumenti, server, studio, animazioni, app, `stile.json`, `stili-di-partenza.json`, `font/`, e il metodo in
`CLAUDE.md`, `.claude/rules/`, `.claude/metodo/`, `.claude/skills/`) è uguale per tutti e non cambia con l'uso. La **cartella di lavoro** è di chi lo usa:

| dentro la cartella di lavoro | cosa |
|---|---|
| `archivio/` | i dati: girato, video, preparati, arrivi, canali (`docs/ARCHIVIO.md`) |
| `CLAUDE.md`, `.claude/` | le regole e le skill del creator, e le conversazioni con Claude; si sommano al metodo del codice |
| `profilo.json` | i dati del creator che leggono il codice e le skill, e la sua macchina (sotto) |
| `stile.json` | lo stile del creator, che si sovrappone a quello di serie del codice (sotto) |
| `animazioni/scene/<slug>/` | le scene animate dei suoi video: il catalogo di `animazioni/` le trova accanto a quelle del prodotto (`animazioni/LEGGIMI.md`, «Le scene del creator») |

**Come la trovano tutti**: una variabile sola, `MANGO_ANIMATION_LAVORO`, che indica la cartella; letta in un solo punto per linguaggio.
Non esiste un ripiego sulla cartella del codice: server, motore e strumenti, senza variabile o con una cartella che non c'è, si fermano con una
frase che dice cosa fare. L'app invece la prepara da sola (riga sotto), e la variabile resta la forzatura per le prove e per chi sviluppa.

| chi | dove la legge | cosa fa |
|---|---|---|
| l'app | `app/src/lavoro.rs` | la variabile, che vince su tutto; se manca, la scelta ricordata in `%APPDATA%\dev.mango.animation\lavoro.json`; se manca anche quella (primo avvio), l'app chiede dove tenere i video e ricorda la scelta; dallo studio si può spostare (tutto in `docs/app/cartella-dei-dati.md`). La passa al server che accende |
| il server | `server/src/configurazione.ts` (`cartellaDiLavoro`) | `archivio` è `<lavoro>/archivio`. Passa la variabile ai lavori del motore, allo strumento «video» e a Claude |
| il motore e gli strumenti | `motore/archivio.py` (`cartella_di_lavoro`) | `Archivio()` e ogni comando in `strumenti/` cercano i dati lì |

**Lo stile.** Il codice ha il suo `stile.json` di serie (e `stili-di-partenza.json`, i tre stili che il primo giro propone), valido per tutti; la cartella di lavoro può averne uno suo, con solo ciò che cambia, e quello che vale è la somma dei due: la regola (`unisci_stile` in `motore/archivio.py`, `unisciStile` in `strumenti/stile.mjs`) è in `docs/PROFILO.md`. Lo leggono tutti con `leggi_stile` / `leggiStile`: motore e strumenti, il server (che serve lo stile unito su `GET /api/stile` e salva su `PUT /api/stile` solo la differenza, `docs/API.md`), le animazioni (`animazioni/LEGGIMI.md`) e, tramite il server, lo studio.

**Il profilo.** `profilo.json` (`docs/PROFILO.md`, schema in `motore/schemi/profilo.schema.json`) ha le sezioni `creator`, `pubblico`, `canali`, `non_si_dice`, `fonti_delle_idee`, che leggono le skill e le regole, e `macchina`, che legge il codice al posto di variabili d'ambiente e valori scritti. Senza `profilo.json`, o senza un campo, vale ciò che il computer ha, e una scheda indicata che non c'è è un errore (`docs/PROFILO.md`, `docs/MOTORI.md`); un profilo che lo schema non ammette non ferma il server (`docs/PROFILO.md`, «Un profilo che lo schema non ammette»).

**Le variabili d'ambiente** (le imposta l'app, o chi sviluppa) sono tutte in `docs/VARIABILI.md`.

Il motore e il server si lanciano dalla cartella del **codice**; Claude Code, nella chat, lavora nella cartella di **lavoro**.

**Come il metodo arriva a Claude.** Il metodo (`CLAUDE.md`, regole, skill, lo strumento «video») è una versione sola, quella del codice: la chat dell'app lo passa a Claude Code come cartella in più, da terminale è un plugin. Come: `docs/METODO.md`.

Ogni pacchetto (`animazioni/`, `server/`, `studio/`) ha il suo `package.json`, l'app (`app/`) il suo `Cargo.toml`; il motore si lancia dalla
radice con `python -m motore`.

## Chi scrive cosa

- **Il piano** (`archivio/video/<slug>/piano.json`, `docs/PIANO.md`) è l'unica verità di un montaggio. Lo
  scrive Claude da terminale, oppure l'interfaccia quando il creator ritocca a mano (`PATCH` sul server, che applica solo i ritocchi al piano del file, valida
  e tiene la versione di prima in `storia/`, che lo studio elenca e da cui rimette in uso una versione: «Versioni»).
- **Il motore** legge piano e `stile.json` e scrive solo in `lavoro/` e `uscite/` del video e in
  `archivio/preparati/`; `pagina` scrive in `materiali/`, perché una pagina del web cambia e la sua cattura non si
  rifà uguale. Non scrive mai il piano né la scheda.
- **Il server** non monta e non decide: valida, salva, osserva, mette in coda i comandi del motore. Ricava dai file, senza che nessuno li scriva, a che passo del metodo è ogni video (`server/src/fasi.ts`) e cerca nel parlato già trascritto (`server/src/parlato.ts`). Le conversazioni della chat sono di `server/src/chat/` (un solo proprietario in memoria); i conti del lavoro di Claude per video, ricavati dai file di quelle
conversazioni, di `server/src/consumi/` (un altro, che osserva la stessa cartella: `docs/api/consumi.md`); gli allegati e le conversazioni di Mango Code (`docs/CHAT.md`) stanno in `archivio/.chat/`, fuori da git.
- **L'interfaccia** non legge mai il disco: passa dal server (`docs/API.md`).

## Il giro

1. Un file arriva dal telefono (`POST /arrivi/…`, porta 47420), viene registrato dallo schermo («Registra»
   nella barra, `docs/api/registrazione.md`), viene scaricato dal web, tutto o solo un tratto (`POST /api/grezzo/scarica`: il lavoro `scarica` della coda lancia yt-dlp e il server
   mette il file e la scheda al loro posto) o viene messo in `archivio/grezzo/`. Il server ne ricava subito la miniatura; per una foto HEIC mette in coda `prepara-file`, che fa la foto intera e la miniatura.
2. `python -m motore prepara <slug>`: parole coi tempi, copia leggera, onda, miniatura. Una volta per file, in
   `archivio/preparati/`. La sagoma la fa `monta`, dei soli tratti montati: mai la ripresa intera.
3. Claude scrive il piano. A ogni cambio del piano (di Claude o dell'interfaccia), e all'avvio per i piani il cui risolto manca o è
   più vecchio, il server mette in coda `risolvi`, che scrive `lavoro/risolto.json`: i tratti veri, ogni parola col suo istante, gli avvisi.
   L'interfaccia mostra quello.
4. `python -m motore monta <slug>` scrive `uscite/finale.mp4`; `controlla` riascolta il montato.
5. La scheda (`scheda.json`) dice a che punto è il video: proposta, in lavorazione, pronto, pubblicato, scartato.

## Regole di costruzione

- **Un lavoro pesante alla volta**: la coda del server ne esegue uno solo; il motore e la resa delle scene (`scene_foto`) usano la scheda del profilo.
- **Le schede video e Mango Code** (`server/src/schede.ts`): se il modello di Mango Code è acceso e tiene la scheda del profilo
  (`macchina.scheda_video`; senza, tutte), un lavoro che la vuole (`prepara`, `prepara-file`, `monta`, `anteprima`, `controlla`,
  `copertina`, `prova`, `carosello`, `scene-foto`) la chiede prima di partire al gestore del motore di Mango Code (`POST /engine/release`, che salva la
  conversazione e spegne il modello: lascia finire la risposta che sta scrivendo fino a 60 s, e prima aspetta un modello che si sta
  accendendo; [contratto di Mango Code](https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md), «The engine and the GPUs») e lo scrive fra le sue righe; quando in coda non restano lavori sulla scheda, gliela ridà (`POST /engine/resume`) e la conversazione riprende.
  Un lavoro che arriva mentre il modello si riaccende aspetta la fine della riaccensione; una riaccensione fallita si riprova alla
  resa dopo; alla chiusura del server le schede si rendono. Il prestito è legato al processo del server (Mango Code lo riconosce dalla
  connessione, senza `pid`): se il server si ferma senza renderle, il modello torna da solo; un modello spento a mano da Mango Code non
  lo riaccende il server. Se il modello non la lascia (o il gestore rifiuta la richiesta, 400), il lavoro fallisce con la frase che lo
  dice, senza partire e senza prestare altre schede.
  Con Mango Code spento, col modello su altre schede o col lavoro sul processore, non succede niente.
- **Niente polling**: il server osserva `archivio/`, i due `stile.json`, `profilo.json`, gli schemi (`motore/schemi/`) e le cartelle delle scene animate, e annuncia i cambi su
  `GET /api/eventi`; l'interfaccia rilegge solo ciò che il messaggio dice cambiato. Nessun file che può cambiare a server acceso si legge una volta sola
  all'avvio: se cambia, lo stato in memoria si aggiorna e si annuncia (gli schemi rivalutano schede, piani e schede del girato). Una scheda o un piano
  che non passano lo schema non si nascondono: il dettaglio del video e l'elenco del girato dicono perché (`docs/API.md`).
- **Una lettura non scrive.**
- **Il girato non si tocca mai**: `archivio/grezzo/` è in sola lettura per tutti; vi scrive solo il server, quando un file entra (telefono, registrazione, scarico dal web).
- **Ciò che sta in `lavoro/` si rigenera**: cancellarlo non perde niente.
- **Gli standard stanno solo in `stile.json`** (di serie, con sopra quello del creator): nessuna misura, colore o soglia scritta nel codice del
  motore o delle animazioni.
- Il server ascolta su `127.0.0.1:47431` (interfaccia e API), e ogni richiesta vuole la chiave della cartella di lavoro (`docs/API.md`, «La chiave delle API»); sulla rete sta solo il ricevitore degli arrivi, porta 47420 (chiusa finché non si collega un telefono o non si accende lo studio dalla rete), con le
  sue rotte, tutte con la chiave: i file in arrivo, la guida della Scorciatoia, la pagina per caricare i video dal telefono, e i video montati, le prove
  e il copione da guardare sul telefono (`docs/api/rete.md`, «Il ricevitore degli arrivi»). Lo stesso ricevitore, se il creator lo accende (spento di base), gira lo studio intero al server interno
  (`server/src/arrivi/studio.ts`, `docs/api/rete.md`, «Lo studio sulla rete»): chiave a parte, sessione in un cookie, indirizzo e `Origin`
  controllati; il server interno non sa chi c'è fuori e non cambia. Chi ha una sessione comanda la chat, quindi il computer.
- Testi a schermo in italiano e in inglese, scritti nelle due lingue dove nascono (come si sceglie la lingua: `docs/LINGUA.md`), senza gergo interno, senza percorsi né nomi di comandi tranne dove servono
  al creator per darli a Claude (il percorso della cartella di un video).
- Un video grande non si copia, si collega (hard link): il disco può essere quasi pieno; i test usano video
  sintetici di pochi secondi in una cartella temporanea.

## Comandi

    bun run --cwd server avvia          # server e interfaccia costruita su http://127.0.0.1:47431 (con MANGO_ANIMATION_LAVORO nell'ambiente)
    bun run --cwd server riavvia-app    # chiude l'app desktop registrata e la riaccende (--ferma: solo chiude; docs/app/costruire.md); da un terminale fuori dall'app
    bun run --cwd studio build          # costruisce l'interfaccia in studio/dist
    bun run --cwd studio dev            # l'interfaccia in sviluppo, con le chiamate girate al server acceso (MANGO_ANIMATION_SERVER)
    python -m motore <comando> <slug>   # (con MANGO_ANIMATION_LAVORO) prepara, risolvi, monta, controlla, copertina, pagina, parole, foto, valida
    bun run --cwd animazioni dev        # le scene nel browser
    bun run --cwd animazioni foto       # i fotogrammi chiave delle scene, con i controlli (testo, fascia, sfondo fermo)

Le prove di ogni pacchetto: `CONTRIBUTING.md`.
