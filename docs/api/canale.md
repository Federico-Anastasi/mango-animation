# Le rotte del canale

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).

## Il canale

Le letture di un canale le scrive Claude da terminale in `archivio/canali/<canale>/letture/<AAAA-MM-GG-HHMM>/`
(`docs/CANALE.md`, «Una lettura del canale»). Il server le tiene in memoria cartella per cartella. Una
lettura compare nelle rotte quando il suo `esito.json` si legge (la skill lo scrive per ultimo); un file che
manca o che è ancora a metà (JSON incompleto mentre Claude scrive) non rompe niente: resta com'era e si
riprova alla notizia dopo. `:canale` ha lettere minuscole, numeri e trattini (`tiktok`); un canale senza
letture risponde con i campi vuoti, non con un errore.

| rotta | cosa fa |
|---|---|
| `GET /api/canale/:canale` | `{ ultima, letture, profilo, video }` |
| `GET /api/canale/:canale/andamento` | la serie nel tempo del profilo, dalla lettura più vecchia: `[{ quando, follower, mi_piace, video }]`, una voce per lettura (`null` dove il profilo non c'è) |
| `GET /api/canale/:canale/classifica` | `{ quando, io, quando_io, come, righe }` |
| `GET /api/canale/:canale/crescita` | `crescita.json` del canale com'è scritto, o `{ quando: null }` |
| `GET /api/canale/:canale/commenti?video=<id>&lettura=<nome>` | il file dei commenti di quel video, più `lettura` e `nuovi: [id]` |
| `GET /api/canale/:canale/messaggi?lettura=<nome>` | `messaggi.json`, più `lettura`, e in ogni conversazione `nuovi: [indice]` |

- `ultima`: `{ lettura, quando }` dell'ultima lettura leggibile, o `null`. `letture`: tutte, dalla più recente,
  `[{ lettura, quando, completa, mancano }]`. `quando` è quello di `esito.json`.
- `profilo` e `video` sono quelli dell'ultima lettura che ha letto bene sia `profilo.json` sia `video.json`
  (può essere una più vecchia di `ultima`). Ogni video è quello di `video.json` con in più `commenti_letti`
  (quanti commenti ha il suo file, 0 se non c'è) e `variazione`: `{ visualizzazioni, mi_piace, commenti }`,
  differenza rispetto alla lettura precedente che contiene quel video (`null` per un campo che manca in una
  delle due), oppure `null` se nessuna lettura prima lo contiene. Lo `slug` è quello della lettura; se la lettura non lo
  lega, è il video dell'archivio la cui scheda ha, in `pubblicazioni`, un indirizzo di quel canale che contiene l'`id` del video
  (e `null` se non c'è).
- `classifica`: `classifica.json` del canale (`docs/CANALE.md`, «La classifica dei profili») col punteggio
  calcolato. `righe`: i primi `quanti`, `[{ posto, nome, cosa_fa, follower, mi_piace, visualizzazioni, punteggio }]`.
  La riga di `io` ha i numeri dell'ultima lettura che ha letto bene profilo e video, e `quando_io` è il `quando`
  di quella lettura; senza una lettura così resta quella del file e `quando_io` è `quando`. Un canale senza il
  file risponde `{ quando: null, io: null, quando_io: null, come: [], righe: [] }`. Il file a metà resta com'era.
- `crescita`: `crescita.json` del canale (`docs/CANALE.md`, «La crescita del canale»). Si carica solo se è intero:
  `quando`, `obiettivo` e `scenari` con tappe `{ data, follower }` (e `obiettivo` è il nome di uno scenario), `partenza`
  come una tappa, e `settimana`, `tipi` (ognuno con `video`), `mix`, `consigli`, `novita` e `come` con le loro voci, con le
  date che si leggono; altrimenti, come un file a metà, resta quello di prima (o `{ quando: null }`) e il terminale
  dice che `crescita.json` non è completo.
- `commenti`: senza `lettura` si prende la più recente che ha il file di quel video. `nuovi` sono gli `id` che
  non c'erano nella lettura precedente che ha quel file; vuoto se non ce n'è una. 400 senza `video`, 404 se
  non ci sono commenti per quel video o per quella lettura.
- `messaggi`: senza `lettura`, la più recente che ha `messaggi.json`. In ogni conversazione, `nuovi` sono gli
  indici (da 0) dei messaggi che nella lettura precedente che ha i messaggi non c'erano; una conversazione
  che prima non c'era è nuova per intero; senza lettura precedente `nuovi` è sempre vuoto.
- `GET /api/video/:slug/commenti` (il video del canale legato a questo `slug`, dalla lettura o dalla scheda, come sopra) dà `{ legato: true, canale, video, lettura, quando, commenti, nuovi }` (come i
  commenti del canale, per il video più recente della lettura più recente che li ha), `{ legato: true, canale,
  video, lettura: null, commenti: [], nuovi: [] }` se è legato ma nessuna lettura ha i suoi commenti, e
  `{ commenti: [], legato: false }` se nessun video del canale è legato a questo `slug`.
