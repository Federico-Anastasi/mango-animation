# Le rotte del girato

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Girato

| rotta | cosa fa |
|---|---|
| `GET /api/grezzo` | i giorni, dal più recente: `[{ giorno, file: [{ file, nome, byte, scheda, scheda_problemi, preparato, usato_in: [slug] }] }]` |
| `GET /api/grezzo/parole?file=…` | le parole coi tempi di un file preparato: `[{ p, da, a }]` |
| `GET /api/grezzo/cerca?q=…` | cerca nel parlato di tutti i file preparati (sotto) → `{ q, risultati: [{ file, da, a, prima, trovato, dopo }], totale, cercati, non_letti }`; 400 se `q` ha meno di due lettere |
| `PUT /api/grezzo/scheda?file=…` | scrive la scheda di un file → `{ ok }` |
| `PATCH /api/grezzo/scheda?file=…` | cambia solo i campi dati della scheda di un file, come `PATCH /api/video/:slug/scheda` (gli oggetti si fondono, `null` toglie); il risultato si valida → `{ ok, scheda }`; se non va 400 con `problemi` e il file non cambia; se la scheda scritta nel file non è valida, 409 con i suoi `problemi`: si corregge o si scrive intera con `PUT` |
| `POST /api/grezzo/prepara` | `{ file, ritrascrivi? }` → 202 `{ id }`: mette in coda `prepara-file` (la sagoma no: la fa `monta`, dei soli tratti montati); con `ritrascrivi: true` rifà le parole anche se ci sono (`--ritrascrivi`) |
| `POST /api/grezzo/aggiungi` | un video, una foto o un audio del computer nel girato di oggi → 201 `{ file, byte }` (`file` è `giorno/nome`). Un file per richiesta, in uno di due modi (sotto) |
| `POST /api/app/percorsi` | `{ percorsi: [percorso completo] }` con l'intestazione `X-Chiave-App` → `{ ok }`: l'app dice quali file ha scelto chi la usa (sotto, «I file scelti dal creator»). Senza la chiave dell'app, `403` |
| `POST /api/grezzo/scarica` | `{ url, da?, a?, nome? }` → 202 `{ id }`: mette in coda `scarica`, che con yt-dlp porta nel girato un video del web, o solo il suo tratto (sotto) |

**La ricerca nel parlato** (`server/src/parlato.ts`) cerca `q` nelle parole di `preparati/<giorno>/<file>/parole.json`, dei soli file che sono ancora nel girato, dal giorno più recente. Non bada a maiuscole, accenti e punteggiatura (`Perché` si trova con `perche`; l'apostrofo separa: `l'impasto` si trova con `impasto`). Più parole cercano una frase: parole di fila, tutte intere tranne l'ultima, che può essere l'inizio di una parola (`segreto è la pazien`). `risultati` ne porta al più cento, nell'ordine dei file e del tempo, e `totale` dice quanti sono in tutto: `file` è `giorno/nome`; `da` e `a` sono i secondi del file in cui comincia e finisce ciò che si è trovato; `trovato` sono le parole trovate come sono scritte, `prima` e `dopo` otto parole attorno. `cercati` sono i file col parlato cercati e `non_letti` quelli il cui `parole.json` non si legge (scritto male o non nella forma `[{ p, da, a }]`). Di ogni file il server tiene in memoria solo il testo semplificato (una quindicina di byte a parola, ~7 MB per mezzo milione di parole), ricaricato quando il file cambia di data o di peso, e rilegge le parole scritte dei soli file con un risultato. Misurato su 300 file da 1.500 parole: la prima ricerca 0,3 s, le altre 6 ms.

`file` è sempre `giorno/nome`, come nei piani. `scheda_problemi` è la lista (vuota se tutto va) di ciò che nella scheda scritta nel file non passa lo schema,
o «il file è scritto male e non si legge»: allora `scheda` è `null` finché non si corregge, e lo studio dice il motivo nella pagina del file. `preparato` è `{ parole, sagoma, sagoma_pezzi, leggero, onda, miniatura, foto,
trascrizione }`: il percorso del file preparato (relativo all'archivio) o `null`. `sagoma_pezzi` è l'elenco di `sagoma.json` ridotto ai pezzi che hanno il file:
`[{ da, a, file, inizio }]` (i secondi della ripresa che il pezzo copre, il suo file in `sagoma/` come percorso dell'archivio, il secondo della ripresa a cui il file comincia),
`null` senza elenco o senza pezzi: allora vale `sagoma`, un file solo che copre tutta la ripresa. `scheda` è `null` finché il
file non ne ha una: per un file messo in `grezzo/` a mano il server la scrive da solo, una volta, con `ffprobe`
(`tipo` e `origine` «altro», da correggere con `PUT`), ma solo quando il file ha smesso di crescere
(dimensione e data di modifica uguali per qualche secondo). Un file dal telefono ha la scheda completa di
durata e misure già quando compare qui (le misure di un video girato in verticale sono quelle ruotate). Una
scheda senza `durata` (la misura all'arrivo non è riuscita) il server la completa allo stesso modo, una volta
per avvio: aggiunge le misure che mancano e lascia il resto com'è.
`preparato.miniatura` non aspetta la preparazione: appena la scheda di un file ha la durata, il server ne ricava
l'immagine con `ffmpeg` in un lavoro di sfondo (`preparati/<file>/miniatura.jpg`, alle misure di `stile.json`,
la stessa che farebbe il motore); lo fa anche all'avvio per i file che non l'hanno. Di una foto è la foto intera, di un audio non c'è.
`preparato.foto` (`preparati/<file>/foto.jpg`) è la foto intera e dritta di un file immagine, per il browser, che le HEIC non le
mostra. La fa il motore, non il server: quando un file HEIC/HEIF ha la sua scheda e non ha ancora `foto.jpg`, il server mette in coda
da solo `prepara-file` per quel file, una volta per file e per avvio. Per una HEIC il server non ricava la miniatura (`ffmpeg` ne legge un
riquadro: la fa il motore) e la scheda non porta `durata`, `largo`, `alto`, `fps`, che `ffprobe` darebbe del riquadro.
Lo stesso fa per la prova di un video: da `uscite/prova.mp4` ricava `uscite/prova.jpg`, un fotogramma preso a
`miniatura_al` della durata (non il primo, che spesso è vuoto), e lo rifà se la prova cambia dopo di lui. Serve
solo come ultima fonte della `miniatura` dell'elenco.

**I file scelti dal creator.** Una rotta che prende il percorso di un file del computer (`POST /api/chat/allegati/locale`, `POST /api/grezzo/aggiungi` con `{ percorso }`) lo accetta solo se il creator l'ha scelto con un gesto: l'ha lasciato sulla finestra dell'app o l'ha copiato in Esplora risorse. Solo l'app lo vede, e lo dice al server con `POST /api/app/percorsi` e la sua chiave, che sta in `archivio/arrivi/chiave-app.json` (la fa il server al primo avvio, come l'altra): la chiave delle API non basta. Un percorso detto così vale dieci minuti e una volta sola. Fuori dall'app, e per chi ha soltanto la chiave delle API, i file entrano per caricamento.

**Aggiungere un file dal computer** (`aggiungi`). Entra in `grezzo/<oggi>/` per la strada degli arrivi dal telefono: nome `AAAAMMGG-HHMMSS-<nome ripulito>`, passaggio da `arrivi/.in-corso/`, `ffprobe` che misura e scheda scritta prima del file
(`tipo` «ripresa», `origine` «altro», `arrivato`, durata e misure). Sono ammessi i generi che ammettono gli arrivi: video, foto e audio (le estensioni di `server/src/arrivi/nomi.ts`), fino al massimo degli arrivi (20 GB); un documento o un file di un altro
genere è 415. Non è un arrivo dal telefono: non compare fra gli `ultimi` di `GET /api/arrivi` e il registro lo scrive come `aggiunto`. La risposta arriva a file collocato. Due modi:

- **Il file nel corpo** (il browser, anche da un telefono che apre lo studio dalla rete): corpo grezzo, nome nell'intestazione `X-Nome-File` (codificato come URL), `Content-Length`. Si scrive a pezzi, mai intero in memoria. È l'unica rotta che accetta un corpo di oltre 16 MB (le altre,
  con `Content-Length` più grande, sono 413). Se `Content-Length` c'è, un doppione e un file troppo grande si rifiutano prima di ricevere il corpo.
- **Il percorso** (l'app): `{ percorso }` con `Content-Type: application/json`. Vale solo per un file scelto con un gesto (sopra, «I file scelti dal creator»); un file collegato con un hard link non costa spazio né tempo, e se il collegamento non si può (un altro disco) il file si copia, controllando lo spazio.

Un file con lo stesso nome (senza il giorno e l'ora d'arrivo) e la stessa grandezza di uno già nel girato è un doppione, 409, e non si aggiunge due volte; un nome già preso con un'altra grandezza prende un numero (`-2`). Altri errori: 400 senza nome, vuoto, arrivato a metà o un percorso che non c'è più o è una cartella,
403 un percorso non scelto, 413 troppo grande, 507 disco quasi pieno. Ogni errore ha la frase nella lingua dello studio.

**Lo scarico dal web** (`scarica`, un lavoro della coda: uno alla volta come gli altri). `url` è un indirizzo `http://` o `https://`; `da` e `a`
sono istanti del video, in secondi (`90`, `12.5`) o come `1:30` e `1:02:03`, con `a` dopo `da`: se manca `da` si parte dall'inizio, se manca `a` si va
alla fine, se mancano tutti e due si scarica il video intero (per uno lungo si danno sempre, il disco è limitato). `nome` è il nome del file senza
cartelle (`.mp4` si aggiunge): senza, viene dal titolo del video; un nome già preso in quel giorno non si sovrascrive, si aggiunge un numero. Altro nella richiesta è 400.
Senza yt-dlp installato (`docs/NUOVO-COMPUTER.md`) è 409 e non si mette niente in coda.
yt-dlp lavora in `arrivi/.scarichi/<lavoro>/` (tolta alla fine, anche se il lavoro fallisce o viene fermato, e all'avvio del server) e scarica un solo video, in mp4
con H.264 e AAC dove la fonte li ha, alto al più `scarico.altezza_massima` di `stile.json` (`codec_video` e `codec_audio` dicono quali
preferire); per un tratto taglia sul punto esatto (`--force-keyframes-at-cuts`). Poi il server, non il motore, scrive in `grezzo/<oggi>/<nome>.mp4`: prima la
scheda, poi il file con una rinomina, e annuncia il cambio come per un arrivo. L'ultima riga del lavoro è `Scaricato: <giorno>/<nome>.mp4`: è il `file`
da usare nei piani e per `prepara`. La scheda ha `tipo` «altro», `origine` «scaricato», `arrivato`, le misure (`durata`, `largo`, `alto`, `fps`) e, dal video,
`url`, `tratto` (`{ da, a? }`, assente per il video intero), `titolo` e `canale` (se yt-dlp li dà). La stima del lavoro è la mediana degli ultimi scarichi
riusciti, `null` finché non sono tre.
