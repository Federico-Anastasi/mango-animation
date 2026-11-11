# Gli eventi

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Eventi

`GET /api/eventi` (SSE), una riga `data:` per messaggio, più un battito ogni 20 s (un commento) che non è un messaggio:

    { "tipo": "video", "slug": "…", "cosa": "scheda" | "piano" | "risolto" | "controllo" | "uscite" | "materiali" | "fotogrammi" | "nuovo" | "tolto" }
    { "tipo": "grezzo" }                 un file è arrivato, è stato preparato o ha cambiato scheda, o è cambiato chi lo usa
    { "tipo": "stile" }
    { "tipo": "animazioni" }             è cambiato l'elenco delle scene animate disponibili
    { "tipo": "lavori" }                 la coda è cambiata o il lavoro in corso ha scritto una riga
    { "tipo": "arrivi" }                 è arrivato un file dal telefono, o è cambiato il giudizio sul firewall
    { "tipo": "accesso-studio" }         lo studio dalla rete è stato acceso, spento o ha una chiave nuova
    { "tipo": "registrazione" }          una registrazione è partita o finita, o i dispositivi sono stati cercati
    { "tipo": "canale", "canale": "tiktok" }   è cambiato qualcosa sotto archivio/canali/<canale>/ (letture o classifica)
    { "tipo": "consumi" }                i conti del lavoro di Claude sono cambiati (`docs/api/consumi.md`)
    { "tipo": "modelli" }                Mango Code si è acceso o spento: i modelli della chat sono da rileggere (`docs/CHAT.md`, «Mango Code»)
    { "tipo": "comandi" }                i comandi con la barra della chat sono cambiati: da rileggere (`docs/CHAT.md`, «I comandi con la barra»)
    { "tipo": "vai", "video"?, "scheda"?, "percorso"? }   lo studio porta la finestra su quella pagina o su quel file (`POST /api/apri`, `dove: "browser"`, nell'app)
    { "tipo": "profilo" }                `profilo.json` è cambiato e il server ha il profilo nuovo, oppure ora non passa lo schema (`GET /api/profilo`); anche una scrittura di `PUT /api/motori` o di `PUT /api/profilo`
    { "tipo": "chat", "id": "…", "evento": … }   una conversazione con Claude Code: messaggi, parti, stato, richieste (`docs/CHAT.md`)

Li genera un osservatore su `archivio/`, sui due `stile.json` (del prodotto e del creator), su `profilo.json`, su `motore/schemi/`, sulle cartelle delle
scene animate e su quella delle conversazioni di Claude Code (per `consumi`): vale anche per ciò che Claude scrive da terminale.

`nuovo` e `tolto` dicono che un video compare o sparisce dall'elenco; `piano` arriva anche per i video che
hanno come `base` quello cambiato. `uscite` arriva una volta sola, quando i file di `uscite/` hanno smesso di
cambiare (il montaggio li scrive per minuti). Dentro `lavoro/` si annunciano solo `risolto.json` e
`controllo.json`: tratti, scene e foto sono file che il motore scrive a raffica e che nessuna rotta mostra.

**Gli schemi si ricaricano da soli.** Quando cambia un file di `motore/schemi/` il server lo ricompila e giudica di nuovo ciò che ne dipende: le schede
dei video (`scheda`), i piani (`piano`, e se ora sono validi mette in coda `risolvi`), le schede dei file del girato (`grezzo`) e il profilo (`profilo`).
Chi cambia ciò che si vede riceve l'evento solito (`video` con `cosa: "scheda"` o `"piano"`, `grezzo`). Uno schema che non è JSON o non compila non
ferma il server: resta in uso l'ultimo buono e il motivo è scritto nel terminale del server. Anche una scrittura che passa dal server (`PUT` e `PATCH`
della scheda, `PUT` del piano, creazione di un video, `PUT` della scheda di un file) rilegge gli schemi dal disco prima di rifiutare un dato: chi cambia lo
schema e scrive subito dopo non trova la versione di prima.
