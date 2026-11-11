# Le rotte del server

Il server (`server/`) ascolta su `127.0.0.1:47431` (`MANGO_ANIMATION_PORTA`). Tutte le risposte sono JSON, gli
errori sono `{ "errore": "frase che dice perché e cosa fare" }` (italiano, o la lingua dello studio: `docs/LINGUA.md`) col codice giusto (400 dato non
valido, 401 manca la chiave, 403 richiesta che non viene dall'interfaccia, 404 non c'è, 405 metodo sbagliato, 409 conflitto). I
percorsi dei file nelle risposte sono relativi all'archivio.

**La chiave delle API.** Il server ascolta solo su `127.0.0.1`, ma dal computer ci arriva qualunque programma, e la chat esegue comandi: ogni richiesta
(`/api/…`, `/media/…`, `/font/…`, lo studio, gli eventi) vuole la chiave, altrimenti è 401. La chiave è una per cartella di lavoro e sta in
`archivio/arrivi/chiave-api.json` (la fa il server al primo avvio; la legge chi può leggere la cartella, e `/media/` non la serve). Si porta in un modo di questi:

- l'intestazione `X-Chiave-Api: <chiave>`, o `Authorization: Bearer <chiave>`: lo strumento «video» la rilegge dal file a ogni richiesta; Claude e gli script da terminale la leggono dallo stesso file;
- il cookie `mango_api_<porta>` (`HttpOnly`, `SameSite=Strict`, un anno), che mette `GET /entra?chiave=<chiave>` e rimanda a `dopo` (di base lo studio: `/entra?chiave=…&dopo=/media/video/<slug>/uscite/finale.mp4`
  apre quel file; `dopo` è solo un percorso di questo sito). Così la pagina dello studio, le immagini, i video e gli eventi la portano da soli: l'app apre lo studio da questo indirizzo; da terminale, `bun run avvia`
  scrive il link intero e con `--apri` lo apre nel browser.

Senza chiave la risposta è una frase in HTML per chi apre una pagina nel browser e JSON `{ errore }` per il resto. Il controllo dell'host e dell'origine viene prima della chiave (403).

**I file scelti dal creator.** Una rotta che prende il percorso di un file del computer la accetta solo se il creator l'ha scelto con un gesto, e solo l'app lo sa dire al server: `docs/api/girato.md`.

**La lingua delle frasi.** Le frasi del server escono in italiano o in inglese secondo l'intestazione `X-Lingua`; come si decide, e le eccezioni (lavori del motore, ricevitore del telefono, file del motore): `docs/LINGUA.md`.

Le richieste con un corpo mandano JSON con `Content-Type: application/json`. Il corpo di un `PUT` è il
documento stesso (la scheda, il piano, lo stile), non un involucro. Il server risponde solo a `127.0.0.1` e
`localhost`, e rifiuta le scritture che arrivano da una pagina web di un altro sito (403). Un rifiuto per
dati non validi porta, oltre a `errore`, la lista `problemi` (una frase ciascuno) quando ce n'è più d'uno.

Le letture rispondono dalla memoria: l'elenco dei video, del girato e delle letture del canale si costruisce
all'avvio e si tiene al passo osservando i file. Lo stesso vale per ciò che i file decidono: gli schemi (`motore/schemi/`), `profilo.json`
e i due `stile.json` si rileggono da soli quando cambiano, senza riavviare il server (`docs/api/eventi.md`). Le sole letture dal disco di una `GET` sono: il dettaglio di
un video (rilegge i suoi `risolto`, `controllo` e `materiali`) e i file dei commenti e dei messaggi del canale
(grandi: se ne tengono in memoria solo i conti e gli identificatori). Anche la chat legge dal disco: una conversazione chiusa
dal suo file, e l'elenco delle conversazioni, rifatto solo quando un loro file cambia. I conti del lavoro di Claude (`GET /api/consumi`) si tengono in
memoria e si aggiornano dai file delle conversazioni, di cui si legge solo ciò che si è aggiunto.

Ogni sezione qui sotto sta in un file della cartella `docs/api/`; i titoli sono quelli di sempre, così i rimandi esistenti restano validi.

## Video

Le rotte dei video, il dettaglio di un video e le sue letture: `docs/api/video.md`.

- **La fase.** A che passo del metodo è un video, ricavato dai file: `docs/api/piano-e-fase.md`.
- **La storia.** Le versioni del piano, annulla, rifai, ripristina: `docs/api/piano-e-fase.md`.

## Girato

I giorni, le schede dei file, la ricerca nel parlato, aggiungere un file dal computer, scaricare dal web: `docs/api/girato.md`.

- **Aggiungere un file dal computer.** `docs/api/girato.md`.

## Stile, lavori, arrivi

- Lo stile, i caratteri, il profilo, i motori e le animazioni: `docs/api/impostazioni.md`.
- La coda dei lavori e `risolvi` che si mette in coda da solo: `docs/api/lavori.md`.
- Gli arrivi dal telefono e lo studio dalla rete: `docs/api/rete.md`.
- La registrazione dello schermo: `docs/api/registrazione.md`.

## Il canale

Le letture di TikTok e degli altri canali: `docs/api/canale.md`.

## Consumi

Quanto lavoro di Claude è andato in ogni video: `docs/api/consumi.md`.

## La chat

Le rotte `/api/chat` sono in `docs/CHAT.md` (conversazioni con Claude Code, messaggi, richieste di permesso, allegati).

## File

I file serviti da `/media/` e `/font/`, lo studio costruito e `POST /api/apri` (mostrare un file al creator): `docs/api/file-e-avvio.md`.

## Eventi

Il flusso `GET /api/eventi` e i suoi messaggi: `docs/api/eventi.md`.

## Il ricevitore degli arrivi

La porta `47420`, le rotte del telefono (`/arrivi`, `/carica`, `/guarda`): `docs/api/rete.md`.

## Lo studio sulla rete

Lo studio dal telefono, con la sua chiave a parte: `docs/api/rete.md`.

## Avvio e chiusura

Come si accende e si chiude il server: `docs/api/file-e-avvio.md`.

## Strumenti MCP

Gli strumenti «video» di Claude: `docs/api/strumenti-mcp.md`.

## Variabili d'ambiente

Tutte, con chi le legge e cosa fanno: `docs/VARIABILI.md`.
