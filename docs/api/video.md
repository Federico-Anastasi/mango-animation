# Le rotte dei video

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua). Il piano, la sua validazione, la fase e la storia: `docs/api/piano-e-fase.md`.

## Video

| rotta | cosa fa |
|---|---|
| `GET /api/video` | l'elenco, dal più recente: `[{ slug, scheda, durata, miniatura, anteprima, ha_piano, quadri, ha_finale, fase, ultimo_cambio }]` (`fase`: a che passo del metodo è il video, `docs/api/piano-e-fase.md`; `quadri`: i quadri che il piano usa, quello di base e quelli delle scene; vuoto senza piano); `miniatura` è, nell'ordine, la copertina, la miniatura dell'uscita, la prima slide di un carosello, l'anteprima, quella del primo girato o un fotogramma della prova (quello che è uscito vince sull'anteprima; l'anteprima vince sulle immagini prese da sé). `anteprima` è `materiali/anteprima.<png, jpg, jpeg o webp>` (il più recente, se ce n'è più d'uno) o `null`: lo studio segna come «senza anteprima» una proposta che ne è priva. Compare, cambia e sparisce da sola con il file (evento `materiali`); la sua data entra in `ultimo_cambio`, che lo studio mette nell'indirizzo dell'immagine perché una rifatta si ricarichi |
| `POST /api/video` | crea un video: `{ titolo, slug?, stato?, formato?, grezzo?: [file] }` → 201 `{ slug }`. Con `grezzo` (file come `giorno/nome`) nasce un piano col quadro `girato-pieno` e un pezzo per file. `formato` (`"video"` o `"carosello"`) va nella scheda; un carosello non ha girato né piano, quindi con `grezzo` è 400, e nasce `proposta` come ogni video; un altro valore è 400 |
| `GET /api/video/:slug` | tutto di un video (sotto) |
| `PUT /api/video/:slug/scheda` | sostituisce la scheda (validata sullo schema) → `{ ok }` |
| `PATCH /api/video/:slug/scheda` | cambia solo i campi dati (JSON Merge Patch: gli oggetti si fondono, `null` toglie, testi e liste si sostituiscono); il risultato si valida sullo schema → `{ ok, scheda }`; se non va 400 con `problemi` e il file non cambia |
| `PUT /api/video/:slug/piano` | sostituisce il piano (validato come in `docs/api/piano-e-fase.md`, «Il piano si valida»); la versione di prima va in `storia/`; mette in coda `risolvi` → `{ ok, puo_annullare, puo_rifare }` |
| `PATCH /api/video/:slug/piano` | `[{ op, path, value? }]` → `{ ok, piano, puo_annullare, puo_rifare }`: i ritocchi applicati in ordine al piano scritto (`op` è `replace`, `add`, `remove` o `test`; `path` un JSON Pointer, `-` per la fine di una lista; `test` non cambia niente e vuole il `value` che il campo deve avere, per un ritocco che non deve scavalcare le modifiche di un altro), poi il piano intero si valida e si salva come con `PUT`. Un percorso che non c'è è 400 con il numero del ritocco; un piano che non va è 400 e il file non cambia; un video senza piano è 409, e un `test` che non torna (il piano è cambiato dopo che chi ritocca l'ha letto, o il percorso non c'è più) è 409 e il file non cambia. Lo studio manda ogni gesto del montaggio così, con un `test` del valore di prima davanti a ogni cambio, e `PUT` resta per scrivere il piano intero. Due ritocchi insieme si mettono in fila: ognuno parte dal piano che ha lasciato l'altro |
| `POST /api/video/:slug/annulla`, `/rifai` | torna alla versione di prima, o a quella dopo → `{ ok, piano, puo_annullare, puo_rifare }`; 409 se non c'è dove andare |
| `GET /api/video/:slug/versioni` | le versioni del piano, dalla più recente: `{ versioni: [{ n, da, fino, scene, pezzi, in_uso }] }` (`docs/api/piano-e-fase.md`, «La storia»); 404 senza piano |
| `GET /api/video/:slug/versioni/:n` | il piano della versione `n` di `storia/`, com'era, senza toccare niente → `{ n, piano }`; 404 se non c'è |
| `POST /api/video/:slug/versioni/:n/ripristina` | il piano di adesso va in `storia/` e la versione `n` torna in uso → `{ ok, piano, puo_annullare, puo_rifare }`; mette in coda `risolvi`. 404 se `n` non c'è, 409 se è già quella in uso, 400 (con `problemi`) se non passa più i controlli (per esempio un file del girato non c'è più) e il piano non cambia |
| `POST /api/video/:slug/lavori` | `{ comando, … }` → 202 `{ id }`; 409 se il video non ha un piano (salvo `prova`). Un carosello (`formato: "carosello"` nella scheda) non ha piano e accetta solo `carosello`, che rende le sue slide; un video non lo accetta (409). `comando` è `prepara`, `risolvi`, `monta`, `controlla`, `carosello`, `prova` (la prova prima di registrare, dal copione della scheda: non vuole il piano, e la scheda resta `proposta`), oppure `anteprima` con `scena` (il nome di una scena) o con `da` e `a` (secondi del video, `a` dopo `da`), oppure `copertina` con `disegno` (il percorso dell'immagine) e, se serve, `istante` (secondo del video). Un campo che il comando non usa, o un testo che comincia per «-», è 400; un piano che non passa i controlli (`docs/api/piano-e-fase.md`, «Il piano si valida») è 409. Se la scheda è `proposta` passa a `in lavorazione` (validata come con `PUT …/scheda`), salvo con `prova`; gli altri stati non cambiano |
| `GET /api/video/:slug/commenti` | i commenti del video del canale legato a questo (`docs/api/canale.md`) |
| `DELETE /api/video/:slug` | solo una proposta senza montato e che non fa da base a un altro piano; altrimenti 409 (lo stato «scartato» è la via) |

`GET /api/video` e `GET /api/video/:slug` mostrano solo i video con una `scheda.json` valida. Una scheda o un piano scritti nel file che non
passano lo schema (o non sono JSON) non restano nascosti: la scheda resta l'ultima valida, il piano non è utilizzabile finché non si corregge, e il
dettaglio dice perché in `problemi`. Un video che non ha mai avuto una scheda valida non compare nell'elenco, e il suo dettaglio è un 404 con la frase «chiedi nella chat di sistemarla» e, in `problemi`, i motivi precisi (una frase ciascuno).

`GET /api/video/:slug` dà `{ slug, cartella, scheda, piano, problemi, piano_risolto_da_base, risolto, risolto_aggiornato,
controllo, uscite, montato, materiali, puo_annullare, puo_rifare, fase, lavoro, montaggio_superato, piano_cambiato, piano_dopo_montato, fotogrammi }`:

- `problemi` è `{ scheda: [frase], piano: [frase] }`: perché la scheda e il piano scritti nei file non passano i controlli di forma (le frasi
  sono in italiano, una per problema; un file che non è JSON dà «il file è scritto male e non si legge»). Vuote se tutto va. `scheda` è
  l'ultima scheda valida; `piano` è il testo del file (un piano che non è JSON lascia l'ultimo leggibile), e `piano_risolto_da_base` è `null`
  finché il piano non passa lo schema. Lo studio li mostra sopra le schede della pagina del video.
- `cartella` è il percorso assoluto della cartella del video: l'interfaccia lo mostra da copiare, per dirlo a
  Claude nel terminale.
- `piano_risolto_da_base` è il piano con `base` già applicata (uguale a `piano` se non c'è); `null` se la
  base non esiste o fa un giro.
- `risolto`, `controllo`: il contenuto del file, o `null` se non c'è.
- `risolto_aggiornato` è falso quando il piano (o quello della sua base) o lo stile sono cambiati dopo
  l'ultimo `risolvi`, o il risolto non c'è. Non dice che un `risolvi` è in arrivo: per quello c'è `lavoro` (e `GET /api/lavori`).
- `uscite`: `[{ file, byte, cambiato, stesso_file }]`, `file` relativo all'archivio (si apre con `/media/`), `cambiato` in ISO. Se
  c'è `uscite/prova.mp4` (il video per registrare, prima del girato) è qui come ogni altra uscita. `stesso_file` è `null`, o, per un file che sul disco è lo stesso
  di un altro di `uscite/` (un collegamento: `con-copertina.mp4` è un secondo nome di `finale.mp4`), il `file` di quell'altro, che è il primo per nome: i due compaiono tutti e due, ma sono un file solo.
- `montato`: `{ file, quando }` del video montato completo da guardare, o `null` senza montato: `uscite/con-copertina.mp4` se è lo stesso file di `finale.mp4` o non è più vecchio di lui
  (una copertina rimasta di un montaggio vecchio non conta), altrimenti `uscite/finale.mp4`. La scheda del telefono (`/guarda`) sceglie allo stesso modo.
- `materiali`: `[{ file, byte }]`, stessi percorsi. Ogni file che compare o cambia in `materiali/` si annuncia (`cosa: "materiali"`); l'elenco dei video rilegge allora l'anteprima.
- `fase`: `{ passo, azione }` o `null` (`docs/api/piano-e-fase.md`, «La fase»), la stessa dell'elenco.
- `lavoro`: `{ id, comando, stato: "in corso" | "in coda" }` se un lavoro di questo video gira o aspetta, altrimenti `null`.
- `montaggio_superato` è vero quando un `monta` di questo video è in corso e il suo piano (o quello della sua base) o `stile.json`
  sono stati salvati dopo che è partito: quel montaggio finirebbe su un piano vecchio. Si ricava dalla memoria (l'orario di
  partenza del lavoro e quello dei file visti dall'osservatore), senza leggere il disco. Il motore, da solo, riparte col piano
  nuovo alla fine della fase in corso; fermare il lavoro (`DELETE /api/lavori/:id`) e metterne in coda uno nuovo evita l'attesa.
  Un lavoro in coda non è «superato»: parte col piano di adesso.
- `piano_cambiato` è l'istante (ISO) in cui il piano di questo video, o quello di una sua base, è stato salvato l'ultima volta (la data del file); `null` senza piano. `piano_dopo_montato` è vero quando c'è un montato (`uscite/finale.mp4`) e il video montato non segue il piano di adesso: si confronta l'impronta del risolto da cui è stato montato
  (`uscite.finale` di `lavoro/montaggio.json`, `docs/MOTORE.md`) con quella del `risolto.json` di adesso, che comprende anche lo stile; un piano salvato di nuovo con lo stesso contenuto non conta, uno stile
  cambiato sì. Se manca una delle due impronte (un montato che non l'ha scritta) o il risolto è rimasto indietro (`risolto_aggiornato` falso: aspetta il `risolvi` che il server ha già messo
  in coda), si confronta la data del piano con quella di `finale.mp4`. Falso senza montato. Valgono anche dopo aver ricaricato la pagina.
- `fotogrammi`: un elemento per ogni tratto di `risolto.tratti`, nello stesso ordine: il percorso (relativo all'archivio) del fotogramma d'inizio di quel tratto, `null` se il tratto non ha girato
  o l'immagine non è ancora pronta. Il server li fa in un lavoro di sfondo, al decimo di secondo, quando un `risolto.json` nuovo (e all'avvio, per i video che ne hanno uno) nomina un tratto che non ne ha:
  `preparati/<file>/fotogrammi/<decimi>.jpg`, una volta per file e istante, e li tiene. Quando ne compare uno, l'evento `fotogrammi` (`docs/api/eventi.md`) avvisa i video che usano il file.
