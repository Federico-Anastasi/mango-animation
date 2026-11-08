# Le rotte del server

Il server (`server/`) ascolta su `127.0.0.1:47431` (`MANGO_ANIMATION_PORTA`). Tutte le risposte sono JSON, gli
errori sono `{ "errore": "frase che dice perché e cosa fare" }` (italiano, o la lingua dello studio: sotto) col codice giusto (400 dato non
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

**La lingua delle frasi.** Le frasi che il server dice a chi lo usa (`errore`, `problemi`, `motivo` e gli `errore` degli stati, l'`errore` di un lavoro finito) escono in italiano, o in inglese se la richiesta porta
l'intestazione `X-Lingua: en` (`it` o niente: italiano; una lingua che non c'è: italiano). Lo studio la manda in ogni richiesta, con la lingua scelta dal pulsante in alto; Claude, gli strumenti e gli script
non la mandano e leggono l'italiano. Il server scrive ogni frase nelle due lingue dove nasce (`server/src/lingua.ts`, `frase(italiano, inglese)`) e sceglie quando scrive la risposta; i log del terminale restano in italiano.
Due eccezioni di forma, perché una frase nasce prima della richiesta che la leggerà:

- **I lavori del motore** partono nella lingua di chi li ha chiesti (`POST …/lavori` con `X-Lingua`): il server passa al motore `MANGO_ANIMATION_LINGUA=it|en`, e l'`errore` del lavoro (e quello salvato in `lavori.json`) è in quella lingua.
  Un lavoro che parte da solo (il `risolvi` dopo una modifica del piano, `prepara-file` di un file che arriva) parla la lingua che lo studio ha dichiarato per ultima (l'ultima richiesta con `X-Lingua`; una richiesta senza l'intestazione, come quelle di Claude, non la cambia), italiano finché lo studio non ha scritto. Le righe di avanzamento (`righe`) sono nella stessa lingua, quelle del motore e quelle scritte dal server per lo scarico dal web; restano in italiano le righe `animazioni:` della resa e l'ultima riga di ffmpeg e yt-dlp quando un lavoro fallisce.
  Una pagina aperta dal browser (l'interfaccia non costruita, il 401 senza chiave o senza sessione) non porta `X-Lingua`: segue `Accept-Language` (italiano se parla italiano o se manca, inglese altrimenti), come lo studio senza una scelta.
- **I file che il motore scrive per tutti** portano le due lingue: ogni avviso di `risolto.json` è `{ tratto, cosa, cosa_en }` (`cosa` italiano, `cosa_en` inglese; `cosa_en` può mancare, e lo studio mostra allora `cosa`).

Le richieste con un corpo mandano JSON con `Content-Type: application/json`. Il corpo di un `PUT` è il
documento stesso (la scheda, il piano, lo stile), non un involucro. Il server risponde solo a `127.0.0.1` e
`localhost`, e rifiuta le scritture che arrivano da una pagina web di un altro sito (403). Un rifiuto per
dati non validi porta, oltre a `errore`, la lista `problemi` (una frase ciascuno) quando ce n'è più d'uno.

Le letture rispondono dalla memoria: l'elenco dei video, del girato e delle letture del canale si costruisce
all'avvio e si tiene al passo osservando i file. Lo stesso vale per ciò che i file decidono: gli schemi (`motore/schemi/`), `profilo.json`
e i due `stile.json` si rileggono da soli quando cambiano, senza riavviare il server (sotto, «Eventi»). Le sole letture dal disco di una `GET` sono: il dettaglio di
un video (rilegge i suoi `risolto`, `controllo` e `materiali`) e i file dei commenti e dei messaggi del canale
(grandi: se ne tengono in memoria solo i conti e gli identificatori). Anche la chat legge dal disco: una conversazione chiusa
dal suo file, e l'elenco delle conversazioni, rifatto solo quando un loro file cambia. I conti del lavoro di Claude (`GET /api/consumi`) si tengono in
memoria e si aggiornano dai file delle conversazioni, di cui si legge solo ciò che si è aggiunto.

## Video

| rotta | cosa fa |
|---|---|
| `GET /api/video` | l'elenco, dal più recente: `[{ slug, scheda, durata, miniatura, anteprima, ha_piano, ha_finale, ultimo_cambio }]`; `miniatura` è, nell'ordine, la copertina, la miniatura dell'uscita, la prima slide di un carosello, l'anteprima, quella del primo girato o un fotogramma della prova (quello che è uscito vince sull'anteprima; l'anteprima vince sulle immagini prese da sé). `anteprima` è `materiali/anteprima.<png, jpg, jpeg o webp>` (il più recente, se ce n'è più d'uno) o `null`: lo studio segna come «senza anteprima» una proposta che ne è priva. Compare, cambia e sparisce da sola con il file (evento `materiali`); la sua data entra in `ultimo_cambio`, che lo studio mette nell'indirizzo dell'immagine perché una rifatta si ricarichi |
| `POST /api/video` | crea un video: `{ titolo, slug?, stato?, formato?, grezzo?: [file] }` → 201 `{ slug }`. Con `grezzo` (file come `giorno/nome`) nasce un piano col quadro `girato-pieno` e un pezzo per file. `formato` (`"video"` o `"carosello"`) va nella scheda; un carosello non ha girato né piano, quindi con `grezzo` è 400, e nasce `proposta` come ogni video; un altro valore è 400 |
| `GET /api/video/:slug` | tutto di un video (sotto) |
| `PUT /api/video/:slug/scheda` | sostituisce la scheda (validata sullo schema) → `{ ok }` |
| `PATCH /api/video/:slug/scheda` | cambia solo i campi dati (JSON Merge Patch: gli oggetti si fondono, `null` toglie, testi e liste si sostituiscono); il risultato si valida sullo schema → `{ ok, scheda }`; se non va 400 con `problemi` e il file non cambia |
| `PUT /api/video/:slug/piano` | sostituisce il piano (validato come sotto); la versione di prima va in `storia/`; mette in coda `risolvi` → `{ ok, puo_annullare, puo_rifare }` |
| `PATCH /api/video/:slug/piano` | `[{ op, path, value? }]` → `{ ok, piano, puo_annullare, puo_rifare }`: i ritocchi applicati in ordine al piano scritto (`op` è `replace`, `add` o `remove`; `path` un JSON Pointer, `-` per la fine di una lista), poi il piano intero si valida e si salva come con `PUT`. Un percorso che non c'è è 400 con il numero del ritocco; un piano che non va è 400 e il file non cambia; un video senza piano è 409 |
| `POST /api/video/:slug/annulla`, `/rifai` | torna alla versione di prima, o a quella dopo → `{ ok, piano, puo_annullare, puo_rifare }`; 409 se non c'è dove andare |
| `POST /api/video/:slug/lavori` | `{ comando, … }` → 202 `{ id }`; 409 se il video non ha un piano (salvo `prova`). Un carosello (`formato: "carosello"` nella scheda) non ha piano e accetta solo `carosello`, che rende le sue slide; un video non lo accetta (409). `comando` è `prepara`, `risolvi`, `monta`, `controlla`, `carosello`, `prova` (la prova prima di registrare, dal copione della scheda: non vuole il piano, e la scheda resta `proposta`), oppure `anteprima` con `scena` (il nome di una scena) o con `da` e `a` (secondi del video, `a` dopo `da`), oppure `copertina` con `disegno` (il percorso dell'immagine) e, se serve, `istante` (secondo del video). Un campo che il comando non usa, o un testo che comincia per «-», è 400; un piano che non passa i controlli (sopra) è 409. Se la scheda è `proposta` passa a `in lavorazione` (validata come con `PUT …/scheda`), salvo con `prova`; gli altri stati non cambiano |
| `GET /api/video/:slug/commenti` | i commenti del video del canale legato a questo (sotto, «Il canale») |
| `DELETE /api/video/:slug` | solo una proposta senza montato e che non fa da base a un altro piano; altrimenti 409 (lo stato «scartato» è la via) |

`GET /api/video` e `GET /api/video/:slug` mostrano solo i video con una `scheda.json` valida. Una scheda o un piano scritti nel file che non
passano lo schema (o non sono JSON) non restano nascosti: la scheda resta l'ultima valida, il piano non è utilizzabile finché non si corregge, e il
dettaglio dice perché in `problemi`. Un video che non ha mai avuto una scheda valida non compare nell'elenco, e il suo dettaglio è un 404 con la frase «chiedi nella chat di sistemarla» e, in `problemi`, i motivi precisi (una frase ciascuno).

`GET /api/video/:slug` dà `{ slug, cartella, scheda, piano, problemi, piano_risolto_da_base, risolto, risolto_aggiornato,
controllo, uscite, montato, materiali, puo_annullare, puo_rifare, lavoro, montaggio_superato, piano_cambiato, piano_dopo_montato, fotogrammi }`:

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
  `preparati/<file>/fotogrammi/<decimi>.jpg`, una volta per file e istante, e li tiene. Quando ne compare uno, l'evento `fotogrammi` (sotto) avvisa i video che usano il file.

**Il piano si valida** sullo schema (`motore/schemi/piano.schema.json`) e sui riferimenti, dopo aver
applicato la `base`: la `base` esiste, ha un piano e non fa giri; il piano ha quadro, sorgenti e scene (anche
per la base); ogni quadro è in `stile.json`; ogni sorgente nominata è dichiarata e il suo file esiste in
`archivio/grezzo/`; ogni vista nominata è dichiarata nella sua sorgente. Altrimenti 400 e il file non cambia.

**Un piano scritto a mano nel file** (senza passare dalle rotte, per esempio da un modello con la scrittura dei file) scavalcherebbe questi
controlli, quindi il server li rifà da sé: appena il file cambia (e all'avvio, a piani tutti letti) lo giudica con le stesse regole, anche
nei riferimenti, e se non va lo segnala in `problemi.piano`, non lo conta come piano valido e non mette in coda `risolvi`. Quando un file
nominato nel girato arriva dopo, i piani che lo aspettavano si giudicano di nuovo. `POST …/lavori` su un piano così risponde 409 con le
stesse ragioni (`problemi`) e il nome degli strumenti che correggono (`piano_ritocca`, `piano_scrivi`): nessun lavoro parte su un piano
che non va, salvo `carosello` e `prova`, che il piano non lo usano.

**La storia.** Ogni sostituzione del piano salva la versione di prima in `storia/<n>.json` (le ultime 200) e
`storia/cursore.json` ricorda dove si è tornati con `annulla`; un piano nuovo dopo un `annulla` cancella i
«rifai». Vale anche per ciò che Claude scrive da terminale in `piano.json`: il server salva la versione che
aveva visto prima.

## Girato

| rotta | cosa fa |
|---|---|
| `GET /api/grezzo` | i giorni, dal più recente: `[{ giorno, file: [{ file, nome, byte, scheda, scheda_problemi, preparato, usato_in: [slug] }] }]` |
| `GET /api/grezzo/parole?file=…` | le parole coi tempi di un file preparato: `[{ p, da, a }]` |
| `PUT /api/grezzo/scheda?file=…` | scrive la scheda di un file → `{ ok }` |
| `PATCH /api/grezzo/scheda?file=…` | cambia solo i campi dati della scheda di un file, come `PATCH /api/video/:slug/scheda` (gli oggetti si fondono, `null` toglie); il risultato si valida → `{ ok, scheda }`; se non va 400 con `problemi` e il file non cambia |
| `POST /api/grezzo/prepara` | `{ file, ritrascrivi? }` → 202 `{ id }`: mette in coda `prepara-file` (la sagoma no: la fa `monta`, dei soli tratti montati); con `ritrascrivi: true` rifà le parole anche se ci sono (`--ritrascrivi`) |
| `POST /api/grezzo/scarica` | `{ url, da?, a?, nome? }` → 202 `{ id }`: mette in coda `scarica`, che con yt-dlp porta nel girato un video del web, o solo il suo tratto (sotto) |

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

## Stile, lavori, arrivi

| rotta | cosa fa |
|---|---|
| `GET /api/stile`, `PUT /api/stile` | legge lo stile unito (quello di serie del prodotto con sopra quello del creator, `docs/ARCHITETTURA.md`, «Lo stile») e scrive lo stile del creator; il `PUT` riceve lo stile completo, vuole `formato` e dei `quadri` con i loro `strati`, e rifiuta di togliere un quadro usato da un piano; nel file del creator (`stile.json` nella cartella di lavoro) scrive solo ciò che differisce dallo stile di serie, e non tocca mai quello del prodotto. Una chiave che il corpo non ha non si toglie: resta quella di serie. Poi ogni video con un piano viene risolto di nuovo |
| `GET /api/motori`, `PUT /api/motori` | la sezione `motori` di `profilo.json` (`docs/MOTORI.md`, §4): per funzione, `attiva` e `dove` (`scheda` o `processore`), e per la trascrizione `modello` e `calcolo`; `{}` se il profilo non la dice. Il `PUT` riceve la sezione intera, la fa passare dallo schema del profilo (`motore/schemi/profilo.schema.json`) e riscrive `profilo.json` con quella al posto di quella di prima, lasciando il resto com'è (senza profilo, lo crea con `versione` e `motori`); una sezione che lo schema non ammette è un `400` con la frase e `problemi`, e il file non cambia. Risponde con la sezione com'è dopo la scrittura |
| `GET /api/macchina` | la sezione `macchina` del profilo (`scheda_video`, `scheda_registrazione`, `profilo_chrome`, `disco_quasi_pieno`), `{}` se il profilo non la dice: la pagina «Motori» la guarda accanto a ciò che l'app dice del computer. Cambia con l'evento `profilo` |
| `GET /api/profilo` | `{ valido, problemi }`: `problemi` sono le frasi (nella lingua della richiesta) di ciò che in `profilo.json` non passa lo schema, o che il file non è JSON; vuote se il profilo va o non c'è. Il server in quel caso lavora con l'ultimo profilo valido, o senza profilo se non ce n'è mai stato uno. Cambia con l'evento `profilo`. Mentre `valido` è falso `PUT /api/motori` risponde `409` (con `problemi`) e non riscrive il file |
| `GET /api/animazioni` | le scene del prodotto e quelle del creator (`<lavoro>/animazioni/scene/`, che il server crea se manca), per video: `{ "<slug>": [{ sigla, titolo, durata }] }`; `{}` se il comando non c'è o fallisce (l'errore è nel terminale del server). Si rifà quando cambia un file di quelle cartelle, e se l'elenco è diverso lo annuncia l'evento `animazioni` |
| `GET /api/lavori` | `{ in_corso, in_coda, finiti }` (sotto) |
| `DELETE /api/lavori/:id` | toglie dalla coda o ferma quello in corso → `{ ok, esito: "tolto" \| "fermato" }`; 404 se l'id non c'è più |
| `GET /api/arrivi` | lo stato del ricevitore (sotto) |
| `PUT /api/arrivi` | `{ acceso: true \| false }` collega o scollega i telefoni (la ricezione è spenta di base) e dà lo stato nuovo. Solo dal computer: dalla rete, `403` |
| `POST /api/arrivi/controlla` | rifà il controllo del firewall di Windows e dà lo stato aggiornato (come `GET /api/arrivi`) |
| `GET /api/accesso-studio`, `PUT /api/accesso-studio`, `POST /api/accesso-studio/chiave` | lo studio dalla rete (sotto, «Lo studio sulla rete»): lo stato; `{ acceso: true \| false }` lo accende o lo spegne; la chiave nuova. Solo dal computer: dalla rete, `403` |
| `POST /api/apri` | `{ percorso }` relativo all'archivio (un file o una cartella) → lo mostra in Esplora file; 400 fuori dall'archivio. Con `dove: "browser"` apre invece nel browser di sistema, già dentro (passando da `/entra`, la chiave non esce dal server): `{ dove: "browser", video: "<slug>", scheda? }` la pagina di un video, `{ dove: "browser", percorso }` un file (non una cartella) servito da `/media/` → `{ ok, aperto }`; 404 se il video o il file non c'è |
| `GET /api/registrazione` | lo stato della registrazione dello schermo (sotto) |
| `POST /api/registrazione` | `{ modo: "schermo" \| "voce" \| "viso", microfono?, camera? }` → 201 con lo stato; 409 se una è già in corso, se manca ffmpeg o il dispositivo che serve |
| `DELETE /api/registrazione` | la ferma e dà lo stato; 409 se non ce n'è una in corso |
| `POST /api/registrazione/dispositivi` | cerca di nuovo microfoni e webcam e dà lo stato |

**Il profilo.** `profilo.json` (nella cartella di lavoro) si rilegge quando cambia. Se passa lo schema è il nuovo profilo; se no resta l'ultimo valido
(il motivo è nel terminale del server e in `GET /api/profilo`). All'avvio un profilo non valido non ferma il server: parte senza profilo, con lo stesso avviso. Del profilo il server usa `macchina.scheda_registrazione`, a ogni registrazione dello schermo, e scrive la sezione `motori` (`PUT /api/motori`); il motore e gli strumenti rileggono il file a ogni comando.

**I lavori.** Uno solo alla volta. Ogni lavoro è `{ id, slug, comando, file, secondi_video }` (`slug` è `null` e `file` è
`giorno/nome` per `prepara-file`). `in_corso` aggiunge `iniziato`, `righe` (le ultime 200 righe di stdout e
stderr), `stima`, `trascorsi` (secondi da quando è partito) e `fine_prevista` (`iniziato` più la stima, ISO; `null` senza
stima); `in_coda` aggiunge `accodato` e `stima`; `finiti` (gli ultimi 20, dal più recente, anche dopo un riavvio:
stanno in `archivio/lavori.jsonl`) hanno `iniziato`, `finito`, `esito` (`"riuscito"`, `"fallito"`,
`"fermato"` o `"interrotto"`), `errore` (l'ultima riga di stderr, `null` se è andato bene; se il processo esce con errore senza scrivere niente, una frase che manda alle righe, e l'ultima riga è «Uscito con codice N.») e le ultime 30 `righe`. Un lavoro **interrotto** è uno che il server stava eseguendo quando si è fermato (chiuso, o morto): quando un lavoro parte il server scrive la sua riga in `lavori.jsonl`, e al riavvio quelle senza la fine passano fra i finiti con `esito: "interrotto"`, una frase che dice di rilanciarlo (nella lingua di chi l'aveva chiesto) in `errore` e nessuna riga. Non si rimette in coda da solo. Chi lo aspettava (`lavoro_aspetta`) lo ritrova con `lavoro_stato`.

`secondi_video` sono i secondi di video su cui il lavoro lavora, dall'indice in memoria: per `prepara` e `prepara-file` la
durata del girato non ancora trascritto (0 se è tutto preparato), per `anteprima` la scena o il pezzo `da`–`a`, per gli
altri comandi la durata del risolto; `null` se non si sa (un video senza risolto, un file senza durata nella scheda).
`stima` sono i secondi che il lavoro dovrebbe durare, presi dagli ultimi 10 lavori **riusciti** con lo stesso comando:
la mediana dei secondi impiegati per secondo di video, per `secondi_video`; se `secondi_video` è `null`, la mediana delle
durate dei lavori che non lo sapevano. Con meno di 3 lavori così è `null`: non c'è storia per stimarlo. Si fissa quando il
lavoro parte (in coda si calcola con ciò che si sa in quel momento). Il motore non dice quanto ha fatto del lavoro intero
(le righe come «tratto 3/40» sono di una fase sola), quindi l'avanzamento è `trascorsi` contro `stima`. Quando
`lavori.jsonl` supera le 100 righe si accorcia agli ultimi 20 finiti più i lavori da cui vengono le stime (le righe di partenza non servono più).
`risolvi` passa avanti agli altri lavori in coda; un lavoro identico a uno già in coda si fonde con quello
e dà lo stesso `id`. Un lavoro passa fra i `finiti` (e lo annuncia l'evento `lavori`) solo dopo che il server ha riletto ciò
che può aver scritto (risolto, controllo e uscite del suo video, i preparati dei file del piano o del file preparato), senza
aspettare l'osservatore: appena è finito, le letture mostrano già i suoi file. Fermare un lavoro ferma il suo processo e quelli che ha lanciato.

**`risolvi` si mette in coda da solo** quando cambia un `piano.json` (per quel video e per quelli che lo
hanno come `base`) o `stile.json` (per tutti i video con un piano), senza doppioni in coda. All'avvio, finita la lettura dell'archivio, si
mette in coda per ogni video con una scheda e un piano validi il cui `risolto.json` manca o è più vecchio del piano (o di quello di una sua base): il server può essere stato spento
mentre il piano cambiava. Lo stile no: uno stile più nuovo del risolto non rifà l'archivio a ogni avvio, e il video resta con `risolto_aggiornato` falso finché non si chiede un `risolvi`.

**Gli arrivi.** `GET /api/arrivi` dà `{ acceso, in_ascolto, indirizzo, qr, errore, ultimi, firewall, pronto, motivo }`:

- `acceso` è la scelta di chi usa il computer: **di base la ricezione dal telefono è spenta**, e finché non collega un telefono (Girato, «Collega un telefono», che fa `PUT /api/arrivi`) il computer non ascolta la rete
  per gli arrivi. Spenta, `in_ascolto` è falso, `indirizzo`, `qr`, `guarda` e `carica` sono `null`, `pronto` è falso e `motivo` lo dice; le rotte del telefono rispondono `404`. La scelta sta in
  `archivio/arrivi/ricezione.json` e resta dopo un riavvio.
- `indirizzo` è `ip:porta` del computer sulla rete di casa (`null` senza rete o se non è in ascolto), `qr` è un
  SVG con il codice che apre la guida sull'iPhone (`null` se non è in ascolto). Se la porta è occupata il
  server funziona lo stesso: `in_ascolto` è falso e `errore` dice perché.
- `ultimi`: gli ultimi 10 file messi al loro posto in `grezzo/`, `[{ file, quando, byte }]` (`file` è `giorno/nome`,
  `quando` è l'ora di arrivo in ISO).
- `firewall` è quello che Windows ha scritto per il programma: `"consentito"`, `"bloccato"`, `"in-attesa"`
  (non ha ancora chiesto il permesso), `"sconosciuto"` (non si riesce a leggere) o `"non-controllato"` (il
  controllo all'avvio non è ancora finito). Si controlla una volta all'avvio e con `POST /api/arrivi/controlla`,
  mai dentro la `GET`.
- `pronto` dice se un telefono può arrivare; `motivo` dice perché no e che strada fare (sbloccare il programma
  in «Sicurezza di Windows», o passare il Wi-Fi a «Rete privata»), oppure, se è pronto ma Windows non ha ancora
  chiesto il permesso e nessun telefono si è mai visto, di toccare «Consenti» nella sua finestra.

**La registrazione.** Registra lo schermo intero con ffmpeg dentro `archivio/grezzo/<giorno di oggi>/`, una
alla volta. I modi: `schermo` (senza audio), `voce` (lo schermo con la voce del microfono, in un file solo),
`viso` (in più la webcam, in un secondo file). I file sono `<AAAAMMGG-HHMMSS>-schermo.mp4` e `-viso.mp4` (mp4 a frammenti: il browser li legge senza preparazione e restano leggibili anche se ffmpeg si interrompe);
la loro scheda nasce all'avvio (`tipo` «schermo» o «ripresa», `origine` «registrazione») e prende durata e
misure quando la registrazione si ferma. `GET /api/registrazione` dà `{ disponibile, motivo, dispositivi,
in_corso, ultima }`:

- `disponibile` è falso se ffmpeg non è installato, e `motivo` lo dice.
- `dispositivi`: `{ microfoni: [nome], camere: [nome] }`, cercati all'avvio e con `POST …/dispositivi`, mai
  dentro la `GET`; `null` finché la prima ricerca non è finita. Senza indicazione si usano il primo microfono e la prima
  webcam che non sia una camera virtuale; `POST /api/registrazione` può nominare `microfono` e `camera`, che devono essere fra i dispositivi
  trovati (anche la camera virtuale, se è lei che si sceglie): uno che non c'è è un `409` che dice di sceglierne un altro, e un nome che non è un testo è un `400`.
- `in_corso`: `{ modo, iniziata, file: [giorno/nome] }` o `null`.
- `ultima`: `{ file, finita, errore }` dell'ultima registrazione chiusa da quando il server è acceso; `errore`
  è l'ultima riga di ffmpeg se si è interrotta da sola (dispositivo occupato, disco pieno), altrimenti `null`.

Fermare il server ferma bene anche la registrazione in corso. L'ingresso dello schermo e la codifica stanno
in `server/src/configurazione.ts`: lo schermo a 30 fotogrammi, codificato dalla scheda di `macchina.scheda_registrazione` del profilo del creator
(l'indice di `nvidia-smi`); senza quel campo, dalla scheda NVIDIA che c'è; con `null`, o senza nessuna scheda, dal processore (`libx264`).

## Il canale

Le letture di un canale le scrive Claude da terminale in `archivio/canali/<canale>/letture/<AAAA-MM-GG-HHMM>/`
(`docs/ARCHIVIO.md`, «Una lettura del canale»). Il server le tiene in memoria cartella per cartella. Una
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
  delle due), oppure `null` se nessuna lettura prima lo contiene.
- `classifica`: `classifica.json` del canale (`docs/ARCHIVIO.md`, «La classifica dei profili») col punteggio
  calcolato. `righe`: i primi `quanti`, `[{ posto, nome, cosa_fa, follower, mi_piace, visualizzazioni, punteggio }]`.
  La riga di `io` ha i numeri dell'ultima lettura che ha letto bene profilo e video, e `quando_io` è il `quando`
  di quella lettura; senza una lettura così resta quella del file e `quando_io` è `quando`. Un canale senza il
  file risponde `{ quando: null, io: null, quando_io: null, come: [], righe: [] }`. Il file a metà resta com'era.
- `crescita`: `crescita.json` del canale (`docs/ARCHIVIO.md`, «La crescita del canale»). Si carica solo se ha
  `quando`, `obiettivo` e `scenari` con tappe `{ data, follower }`, e se `obiettivo` è il nome di uno scenario;
  altrimenti, come un file a metà, resta quello di prima.
- `commenti`: senza `lettura` si prende la più recente che ha il file di quel video. `nuovi` sono gli `id` che
  non c'erano nella lettura precedente che ha quel file; vuoto se non ce n'è una. 400 senza `video`, 404 se
  non ci sono commenti per quel video o per quella lettura.
- `messaggi`: senza `lettura`, la più recente che ha `messaggi.json`. In ogni conversazione, `nuovi` sono gli
  indici (da 0) dei messaggi che nella lettura precedente che ha i messaggi non c'erano; una conversazione
  che prima non c'era è nuova per intero; senza lettura precedente `nuovi` è sempre vuoto.
- `GET /api/video/:slug/commenti` (il video del canale il cui `slug` in `video.json` è questo) dà `{ legato: true, canale, video, lettura, quando, commenti, nuovi }` (come i
  commenti del canale, per il video più recente della lettura più recente che li ha), `{ legato: true, canale,
  video, lettura: null, commenti: [], nuovi: [] }` se è legato ma nessuna lettura ha i suoi commenti, e
  `{ commenti: [], legato: false }` se nessun video del canale ha questo `slug`.

## Consumi

Quanto lavoro di Claude è andato in ogni video: `GET /api/consumi` dà `{ pronto, video, senza_video }`.

    { "pronto": true,
      "video": { "<slug>": { "tempo": 7860, "giri": 17,
                             "token": { "scritti": 300000, "riletti": 130000000, "nuovi": 1200000 },
                             "dal": "2026-11-03T08:12:00.000Z", "al": "2026-11-03T11:40:00.000Z" } },
      "senza_video": { "tempo": 80400, "giri": 700, "token": { … } } }

I conti si ricavano dai file delle conversazioni di Claude Code della cartella di lavoro (`~/.claude/projects/<cartella>/<id>.jsonl`, e le
sottocartelle dei sottoagenti), da terminale o dalla chat di Claude Code, senza distinguerle. Le conversazioni di Mango Code non sono lette: il suo lavoro non è contato. Il server li legge tutti una volta, in sfondo (`pronto` è
falso finché non ha finito: i conti di allora sono parziali), e poi di ogni file solo ciò che si aggiunge, quando l'osservatore dice che è
cambiato (a file fermo da un paio di secondi: un giro in corso si vede a pausa). Come ogni altra lettura, la rotta risponde dalla memoria.
Quando i conti cambiano arriva l'evento `consumi`; l'elenco dei video e la pagina di un video non dipendono da qui.

- **Giro.** Un giro è un messaggio del creator (o di un lavoro in sfondo che sveglia Claude) con tutto ciò che Claude fa fino al messaggio
  dopo. Gli esiti degli strumenti, i comandi e le note del sistema non aprono un giro; un messaggio senza nessuna risposta di Claude
  (un comando, un'interruzione) non conta.
- **Tempo di lavoro** (`tempo`, secondi): dal messaggio del creator all'ultima risposta di Claude del giro. Comprende l'attesa degli
  strumenti (un montaggio, una resa) e di una domanda a cui il creator non ha ancora risposto; non comprende il tempo fra un giro e l'altro
  (le pause del creator, un lavoro o un sottoagente lasciati in sfondo mentre Claude non fa altro: quando finiscono, il giro in cui Claude
  risponde conta da sé). Non è il tempo di parete della conversazione. I sottoagenti non aggiungono tempo: ciò che fanno dentro il giro
  che li ha lanciati è già lì.
- **Token.** Per ogni richiesta a Claude, una volta sola (una risposta scritta in più pezzi ha la stessa riga d'uso in ognuno; una conversazione ripresa o
  biforcata ripete richieste di un'altra, che si contano nel file più vecchio, cioè dove sono nate): `scritti` sono ciò che Claude ha scritto, `riletti` il contesto già
  visto che a ogni richiesta viene riletto (da qui il numero grosso), `nuovi` il contesto messo per la prima volta (`input_tokens` più
  `cache_creation_input_tokens`). Sono quelli dei sottoagenti, sommati al giro che li ha lanciati (l'id della chiamata che li ha lanciati sta nel
  loro file di dati; senza quel legame contano da soli, con i video che toccano).
- **A quale video va un giro.** Ogni giro va a un solo video, e un giro non si divide:
  1. il video che le chiamate di strumento del giro (e dei suoi sottoagenti) hanno toccato più volte: per il suo percorso (`archivio/video/<slug>/…`,
     `/api/video/<slug>`, `#/video/<slug>`), con `slug` negli strumenti «video», o come argomento di `python -m motore <comando> <slug>`; a parità, quello
     della riga di contesto se è fra loro;
  2. se nessuno strumento ha toccato un video, quello della riga di contesto che la chat manda col messaggio (`docs/CHAT.md`, `contesto`; anche la riga
     `[Contesto: …]` delle conversazioni salvate): lo sviluppo del motore fatto da dentro la pagina di un video conta per quel video;
  3. altrimenti il giro non è di nessun video: sta in `senza_video` (tempo e token compresi), e non si ripartisce.
  Gli strumenti vincono sul contesto perché dicono cosa Claude ha fatto davvero, mentre la pagina aperta nello studio può essere rimasta quella di ieri;
  da terminale c'è solo il primo criterio. Un `slug` è quello scritto, anche di un video che non c'è più.
- **`dal` e `al`**: il primo messaggio e l'ultima risposta dei giri del video.
- **Mango Code non entra**: le sue conversazioni non hanno questi file (stanno in `archivio/.chat/mango-code.json`, con i messaggi
  nel suo servizio) e i suoi modelli girano sul computer, non costano token a Claude.
- **Fin dove arrivano i conti**: Claude Code toglie da sé le conversazioni più vecchie (di base dopo 30 giorni, `cleanupPeriodDays`
  nelle sue impostazioni): un file tolto esce dai conti, quindi «da sempre» vuol dire «dalle conversazioni che ci sono ancora».

## La chat

Le rotte `/api/chat` sono in `docs/CHAT.md` (conversazioni con Claude Code, messaggi, richieste di permesso, allegati).

## File

`GET /media/<percorso relativo all'archivio>` serve un file con `Range` (206, `Content-Range`,
`Accept-Ranges`; 416 oltre la fine; un intervallo oltre 4 MB si accorcia a 4 MB, e il `Content-Range` lo dice), il tipo dal nome
del file, solo dentro l'archivio. Il file resta aperto solo mentre si legge un pezzo, mai mentre si spedisce: su Windows un file
aperto non si sostituisce, e un montaggio deve poter riscrivere il video che lo studio sta mostrando. Percorsi assoluti,
`..`, `\` e `:` sono 400. Non si servono (404, maiuscole o no) `arrivi/` (chiavi, sessioni, registro) e le cartelle nascoste
(`.chat/` con lo stato della chat, `.git/`), tranne gli allegati della chat in `.chat/allegati/`: passano anche dallo studio sulla rete. `GET /font/…` i caratteri del repo, con le stesse regole. Ogni altra rotta serve
`studio/dist` (con `index.html` per le rotte dell'interfaccia); se `studio/dist` non c'è, una pagina in
italiano dice di costruirlo con `bun run --cwd studio build`.

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
    { "tipo": "consumi" }                i conti del lavoro di Claude sono cambiati (sopra, «Consumi»)
    { "tipo": "modelli" }                Mango Code si è acceso o spento: i modelli della chat sono da rileggere (`docs/CHAT.md`, «Mango Code»)
    { "tipo": "comandi" }                i comandi con la barra della chat sono cambiati: da rileggere (`docs/CHAT.md`, «I comandi con la barra»)
    { "tipo": "profilo" }                `profilo.json` è cambiato e il server ha il profilo nuovo, oppure ora non passa lo schema (`GET /api/profilo`); anche una scrittura di `PUT /api/motori`
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

## Il ricevitore degli arrivi

Un ascoltatore a parte, su tutta la rete di casa, porta `47420` (`MANGO_ANIMATION_PORTA_ARRIVI`), **in ascolto solo se serve**: quando si collega
un telefono (`PUT /api/arrivi`) o si accende lo studio dalla rete (sotto); spenti tutti e due, la porta è chiusa. Le sue
rotte vogliono tutte la chiave. `/arrivi/contenuti-video` e `/installa/contenuti-video` servono alla Scorciatoia «Manda a Mango Animation» dell'iPhone; `/carica` manda i video dal telefono senza la Scorciatoia; `/guarda…` serve a
guardare dal telefono i video montati, le prove e il copione da leggere:

- `POST /arrivi/contenuti-video?chiave=…` (o `Authorization: Bearer`, o `X-Chiave`): corpo grezzo (nome in
  `X-Nome-File`) o `multipart/form-data`. Scrive a pezzi in `archivio/arrivi/.in-corso/` e risponde `201`
  `{ ok, messaggio, file, byte }` (`file` è `<AAAAMMGG-HHMMSS di arrivo>-<nome ripulito>`) senza aspettare
  il resto. Poi, in un lavoro di sfondo, `ffprobe` lo misura: il file va in
  `archivio/grezzo/<giorno di arrivo>/` con quel nome, byte per byte uguale, preceduto dalla sua scheda
  (`tipo: "ripresa"`, `origine: "telefono"`, `arrivato`, durata e misure). Finché non è misurato il file resta in `.in-corso/` col suffisso
  `.attesa`; se il server si ferma prima, lo colloca al riavvio. Se la cartella del giorno in `grezzo/` sta su un altro disco (è un collegamento),
  il file vi si copia accanto e poi si toglie l'originale. Accetta video, audio e foto fino a 20 GB.
  Se `ffprobe` non legge il file il terminale dice quale file e perché (e all'avvio dice se `ffprobe` non c'è nel PATH): il file entra lo stesso, senza durata, e
  il server la completa da sé appena il file è fermo. Di una HEIC la scheda non porta misure: le dà il motore.
  Risposte JSON: `201` ricevuto, `401` chiave, `413` troppo grande, `415` genere non accettato, `507` disco
  pieno, `400` file vuoto, a metà o illeggibile, `500` il computer non è riuscito a salvarlo. Un invio che il telefono interrompe (Wi-Fi lento, iPhone che sospende
  Comandi rapidi) è un `400` che dice che il collegamento si è interrotto; un errore imprevisto dice la causa (il codice, o «un altro programma tiene aperta la
  cartella» per i permessi di Windows). Ogni rifiuto è una riga di `registro.jsonl` con `motivo` e, per un errore imprevisto, `dettaglio`.
- `GET /installa/contenuti-video?chiave=…`: la guida per l'iPhone.
- `GET /carica?chiave=…`: una pagina da aprire in Safari: un bottone «Carica video» sceglie uno o più file dalla
  libreria, o da File (i memo vocali, che il selettore vuole per estensione: `.m4a` e gli altri audio di `nomi.ts`), e li manda uno dopo l'altro, com'è l'originale, con `POST /arrivi/contenuti-video` a corpo grezzo
  (`XMLHttpRequest`, il file passato senza leggerlo in memoria); per ogni file mostra barra, MB inviati, MB/s ed
  esito.
- `GET /guarda?chiave=…`: una pagina coi video montati, il più recente in cima, ognuno col link al suo file, e sotto, a parte, «Da registrare» (i video con una `uscite/copione.html`: le frasi da leggere mentre si registra) e «Le prove» (i video con una `uscite/prova.mp4`), anche se non sono montati.
- `GET /guarda/<slug>.mp4?chiave=…` (anche `HEAD`): il video completo, `con-copertina.mp4` se c'è, altrimenti
  `finale.mp4`, con `Range` come `/media/`; `404` se il video non è montato.
- `GET /guarda/prova/<slug>.mp4?chiave=…` (anche `HEAD`): la prova prima di registrare (`uscite/prova.mp4`), con `Range`; `404` se il video non ha una prova.
- `GET /guarda/copione/<slug>.html?chiave=…`: la pagina `uscite/copione.html`, da leggere sul telefono mentre si registra; `404` se il video non ce l'ha.

`GET /api/arrivi` dà anche `guarda` e `carica` (l'indirizzo delle due pagine, con la chiave) e `qr_guarda` e
`qr_carica` (i loro codici QR, in SVG).

La chiave sta in `archivio/arrivi/chiave.json`; ogni richiesta, e ogni file collocato, è una riga di
`archivio/arrivi/registro.jsonl`.

## Lo studio sulla rete

Lo stesso ricevitore (porta `47420`) serve anche lo studio intero (interfaccia, `/api/…`, `/media/…`), per usarlo dal telefono in casa e fuori casa con
Tailscale. **Spento di base**; si accende dallo studio (Girato, «Lo studio dal telefono»), e la porta si apre per lui anche se gli arrivi restano spenti. Il server interno resta su `127.0.0.1:47431` e per chi lo usa da lì non cambia niente.

- **La chiave dello studio** è un'altra da quella degli arrivi (che sta nelle Scorciatoie del telefono): 24 byte casuali, confrontata a tempo costante, in
  `archivio/arrivi/studio-remoto.json` insieme a `acceso` e alle sessioni (di ognuna solo l'impronta SHA-256 e la scadenza; al massimo 20).
- `GET /studio?chiave=…`: con la chiave giusta risponde `303` verso `/` e mette il cookie `mango_studio` (valore casuale di una sessione, mai la chiave), `HttpOnly; SameSite=Strict; Path=/`,
  valido 90 giorni; con quella sbagliata `401`. Ogni entrata e ogni rifiuto sono una riga di `registro.jsonl`. Il cookie non porta la chiave e non si rinnova: dopo 90 giorni si rientra col link.
- Ogni altra richiesta che non è una rotta degli arrivi (`/arrivi/…`, `/installa/…`, `/carica`, `/guarda…`, che restano con la chiave degli arrivi) e ha una sessione valida si gira al server interno, con lo stesso metodo, percorso
  e corpo, a flusso: gli eventi (`GET /api/eventi`) e i video a pezzi (`Range`) passano senza bufferizzare. L'indirizzo chiesto dev'essere numerico
  (`http://192.168.1.20:47420`, `http://100.x.y.z:47420`): un nome è quello di un altro sito che punta al computer (DNS rebinding), `403` anche
  per `/studio`. Se c'è `Origin`, deve essere `http://<l'indirizzo a cui è arrivata la richiesta>`, altrimenti `403`.
  Il ricevitore toglie `Host`, `Origin`, `Referer`, `Cookie` e `Authorization`, mette `X-Dalla-Rete: 1` e, dopo aver controllato la sessione, la chiave delle API del server interno: il server interno, vedendola, rifiuta (`403`) le rotte
  `/api/accesso-studio`, perché l'interfaccia del telefono non le offre. Non è un confine di sicurezza: chi ha una sessione comanda la chat,
  che esegue comandi sul computer, e da lì arriva a tutto. **Una sessione vale il computer**: la chiave e il link si danno solo ai propri telefoni.
  Senza sessione `401` (una frase in HTML per chi apre una pagina dal browser, JSON per il resto); metodi diversi da `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`: `405`; server interno che non risponde: `502`.
- **Spento**: tutto ciò che non è un arrivo risponde `404` come prima, anche con un cookie che prima valeva.
- Spegnere e **rifare la chiave** fanno cadere tutte le sessioni e chiudono i flussi degli eventi già aperti; spegnere cambia anche la chiave,
  così un link visto prima non riapre l'accesso quando si riaccende.
- **In casa il traffico passa in chiaro** sul Wi-Fi (HTTP: la chiave nel link d'ingresso, poi il cookie, che per questo non ha `Secure`); su
  Tailscale è cifrato.

`GET /api/accesso-studio` dà `{ acceso, in_ascolto, casa, fuori, pronto, motivo }`: `casa` e `fuori` sono `{ indirizzo, link, qr }` (il link con la chiave, e il suo codice QR in SVG) e sono `null`
se spento; `casa` anche senza rete; `fuori` se il computer non ha un indirizzo di Tailscale (IPv4 in `100.64.0.0/10`, su qualunque interfaccia), e in più ha `pronto` e `motivo`: `pronto` è falso se Windows
dà alla rete di Tailscale un tipo di rete che nessuna regola del programma copre (il controllo di `POST /api/arrivi/controlla` legge anche il tipo di rete dell'interfaccia «Tailscale»). `pronto` e `motivo` sono quelli degli arrivi, per il Wi-Fi di casa.
`PUT` e `POST …/chiave` danno lo stato nuovo e annunciano l'evento `accesso-studio`.

## Avvio e chiusura

`bun run avvia` (nella cartella `server/`; in un terminale scrive il link che apre lo studio con la chiave, e `--apri` lo apre nel browser). Si chiude con Ctrl+C, con
Ctrl+Interr o chiudendo la console: ferma il lavoro del motore in corso per PID insieme ai suoi figli, chiude
le porte e i flussi degli eventi. Se il processo viene ucciso a forza (Gestione attività, `taskkill /F`) Windows spegne con lui il lavoro in corso
e tutto ciò che questo ha lanciato: all'avvio il server entra in un Job Object che si chiude con lui (`server/src/figli.ts`).
Se Windows lo rifiuta il server parte lo stesso e lo dice nel terminale.

## Strumenti MCP

Un server MCP su stdio (`server/src/mcp/`) dà ai modelli gli strumenti «video». Si accende con `bun run --cwd server mcp`.
Il server della chat lo dà a Claude Code (server «video»: gli strumenti si chiamano
`mcp__video__<nome>`; `docs/CHAT.md`). Quello che il server fa già lo chiede alla sua API (validazione e `storia/`
comprese): il server vero dev'essere acceso (`bun run --cwd server avvia`), altrimenti lo strumento risponde con questa
frase e il comando. I comandi leggeri del motore li lancia lui dalla cartella del codice (`python -m motore …`), con un tempo
massimo di 120 s: se lo supera, il processo si ferma per PID e lo strumento lo dice; quelli lunghi passano dalla coda
(`lavoro`). Usa le variabili d'ambiente del server: `MANGO_ANIMATION_PORTA` (dove sta il server), `MANGO_ANIMATION_PYTHON`,
`MANGO_ANIMATION_MODULO`, `MANGO_ANIMATION_LAVORO` (da cui trova la chiave delle API, sopra).

Ogni risultato è un testo JSON compatto (tranne `parole`, che è il testo del motore, e le foto, che sono immagini). Un errore
ha `isError` vero e una frase in italiano: quella del server, o quella che il motore scrive su stderr, così com'è.
`slug` è sempre quello di `video_elenco` (lettere minuscole, numeri, trattini).

| strumento | argomenti | risultato |
|---|---|---|
| `video_elenco` | — | `[{ slug, titolo, stato, ha_piano, ha_finale }]`, dal più recente (`GET /api/video`) |
| `video_leggi` | `slug` | `{ slug, scheda, piano, problemi, risolto, risolto_aggiornato, montato, lavoro }`; `montato` è `null` senza video montato, altrimenti `{ file, fatto_il, segue_il_piano, con_copertina }`: il `montato` del dettaglio (`fatto_il` è il suo `quando`), con `segue_il_piano` falso quando il piano o lo stile sono cambiati dopo il montaggio (l'opposto di `piano_dopo_montato`) e `con_copertina` vero quando il file è `con-copertina.mp4`; `problemi` come nel dettaglio (`{ scheda, piano }`, frasi: anche un piano scritto a mano nel file con un riferimento sbagliato); `risolto` è `{ durata, scene: [{ nome, quadro, inizio, durata, animazione }], avvisi }` o `null`: le parole e i tratti non ci sono (`GET /api/video/:slug`) |
| `video_nuovo` | `titolo`, `riga` (una riga che dice di cosa parla; obbligatoria), `formato` (`video`, di base, o `carosello`), `girato` (facoltativo: file `giorno/nome` da cui parte) | `{ slug, formato, anteprima }`: il video nuovo come proposta (`POST /api/video`, con `girato` come `grezzo`: nasce anche il piano `girato-pieno`, un pezzo per file; un carosello col girato è l'errore del server), con l'indirizzo della sua pagina nello studio e il percorso della sua anteprima, fatta da `python -m motore anteprima-proposta` col titolo e la riga. Se l'anteprima non si fa il video c'è lo stesso e l'errore lo dice, con il comando per rifarla |
| `scheda_cambia` | `slug`, `campi` (solo quelli da cambiare; `null` toglie) | la scheda nuova; una scheda che lo schema non ammette è un errore con cosa correggere e il file non cambia (`PATCH /api/video/:slug/scheda`) |
| `piano_scrivi` | `slug`, `piano` (l'oggetto intero) | `{ ok, puo_annullare, puo_rifare }`; un piano non valido è un errore con cosa correggere e il file non cambia (`PUT /api/video/:slug/piano`) |
| `piano_ritocca` | `slug`, `ritocchi` (`[{ op, path, value? }]`) | il piano nuovo (`PATCH /api/video/:slug/piano`): solo i campi indicati per percorso cambiano; un percorso che non c'è o un piano che non va è l'errore del server e il file non cambia |
| `piano_annulla` | `slug` | `{ ok, piano, puo_annullare, puo_rifare }`: il piano di prima; errore se è già la prima versione (`POST /api/video/:slug/annulla`) |
| `valida` | `slug` | `{ valido: true, avvisi: [frase] }`; se il piano non va, l'errore elenca cosa (`python -m motore valida`) |
| `parole` | `slug` | il testo di `python -m motore parole`: ogni tratto con le sue parole e i loro istanti |
| `foto` | `slug`, `secondi` (da 1 a 8 numeri, da 0 in su), `video` (`montato`, di base, `anteprima` o `prova`) | per ogni secondo un testo «Secondo N» (con la prova «Secondo N della prova») e l'immagine del montato, dell'ultima anteprima o della prova (`python -m motore foto`, con `--anteprima` o `--prova`). I secondi sono quelli del video montato, salvo nella prova che ha i suoi: nell'anteprima si traducono con `uscite/anteprima.json` (`docs/MOTORE.md`). Errore se il video non è montato o è più corto, se non c'è un'anteprima o non si sa quale pezzo copre, o se un secondo sta fuori da quel pezzo (la frase dice quale copre) |
| `girato_foto` | `file` (`giorno/nome` nel grezzo), `secondi` (da 1 a 8) | per ogni secondo «Secondo N di <file>» e il fotogramma del file a quel suo secondo (`python -m motore foto-girato`). Errore se il file non c'è o è più corto |
| `girato_parole` | `file` (`giorno/nome`), `da`, `a` (al più 600 s dopo) | `{ file, da, a, parole: [[parola, da, a]] }`: le parole del file preparato che cadono nella finestra (`GET /api/grezzo/parole`); un file che non c'è o non è preparato è l'errore del server |
| `ascolta` | `slug` (il montato) oppure `file` (`giorno/nome`), `da`, `a` (al più 10 s dopo) | un testo JSON `{ da, passo, silenzio_db, livello, voce }` e l'immagine dello spettrogramma (`python -m motore ascolta`). Errore senza `slug` né `file`, con tutti e due, o con un pezzo oltre 10 s |
| `slide` | `slug`, `numeri` (facoltativo, da 1 a 8 numeri dalla 1) | per ogni slide del carosello «Slide <n>» e l'immagine `uscite/slide-<n>.png` rimpicciolita, in ordine di numero: quelle chieste, o le prime 8 (e quante sono in tutto). Se la resa (`carosello`) di quel video è in coda o in corso, prima aspetta che finisca (al più 300 s). Errore se il video non è un carosello, se non ha ancora slide o se ne manca una chiesta |
| `scene_foto` | `sigla` | un testo JSON `{ sigla, controlli: "superati" \| "falliti", segnalazioni: [frase] }`, poi per ogni fotogramma chiave il nome del file e l'immagine (`bun run --cwd animazioni foto -- <sigla>`, 300 s al massimo). Un controllo fallito non è un errore: esce con 1 e le segnalazioni sono il risultato; è un errore una sigla che non c'è o una pagina che non parte |
| `lavoro` | `slug`, `comando` (anche `carosello` e `prova`), e per `anteprima` `scena` oppure `da` e `a`, per `copertina` `disegno` e `istante` | subito, come `lavoro_stato`: l'id, lo stato e la stima (`POST /api/video/:slug/lavori`, le stesse regole, anche la scheda che passa a «in lavorazione», salvo con `prova`) |
| `girato_prepara` | `file` (`giorno/nome`), `ritrascrivi` (facoltativo) | subito, come `lavoro`: id, stato e stima di `prepara-file` per quel file (`POST /api/grezzo/prepara`); un file che non c'è o scritto male è l'errore del server. Prepararlo dalla shell salterebbe la coda: la scheda video è una sola |
| `girato_scheda` | `file` (`giorno/nome`), `campi` | la scheda nuova del file (`PATCH /api/grezzo/scheda`): solo i campi dati cambiano, `null` toglie; il server la valida. Dopo aver cambiato la `lingua` di un file preparato, le parole si rifanno con `girato_prepara` e `ritrascrivi` |
| `apri` | `video` (slug) con `scheda` facoltativa, oppure `percorso` di un file dell'archivio | apre la pagina o il file nel browser del creator, già dentro (`POST /api/apri` con `dove: "browser"`): l'unico modo di mostrargli qualcosa nel browser, la chiave non passa mai da chi lo chiede |
| `girato_scarica` | `url`, `da`, `a` (secondi o `mm:ss`), `nome`; solo `url` è obbligatorio | subito, come `lavoro`: id, stato e stima di `scarica` (`POST /api/grezzo/scarica`, sopra). A lavoro finito (`lavoro_aspetta`) l'ultima riga è `Scaricato: <giorno>/<nome>.mp4`. Un tratto sbagliato, un indirizzo che non è web o yt-dlp mancante sono l'errore del server |
| `web_testo` | `url`, `lingua` (due lettere) | il testo di un video in rete dai suoi sottotitoli (scritti, se no automatici: `lingua` e `lingua-orig`), senza scaricarlo: una riga per frase nuova, «mm:ss testo» (`server/src/vtt.ts`). Lancia yt-dlp da sé, non passa dalla coda: non usa la scheda video. Errore se yt-dlp manca o il video non ha sottotitoli in quella lingua |
| `lavoro_stato` | `id` | `{ id, comando, slug, stato: "in coda" \| "in corso" \| "finito", stima?, trascorsi?, fine_prevista?, esito?, errore?, righe }`: le ultime 20 righe; `stima` (secondi, `null` senza storia) in coda e in corso; `trascorsi` (secondi) e `fine_prevista` (l'ora del computer, «15:42», o `null`) in corso; `esito` (`riuscito`, `fallito`, `fermato`, `interrotto`) e `errore` solo se è finito (`GET /api/lavori`); errore se l'id non è né in corso né in coda né fra gli ultimi 20 finiti |
| `lavoro_aspetta` | `id`, `secondi` (da 1 a 300, di base 60) | come `lavoro_stato`, appena il lavoro finisce (i suoi file sono già nelle letture: `video_leggi` li vede); se il tempo scade prima, lo stato di allora (`in corso`). Ascolta `GET /api/eventi` e rilegge la coda solo quando cambia: niente richieste a intervalli |

Le immagini sono JPEG con il lato lungo di 960 px al massimo (un verticale 1080×1920 arriva a 540×960): leggibili senza
riempire il contesto. Le rimpicciolisce `ffmpeg`; la misura sta in `server/src/mcp/processi.ts`.

## Variabili d'ambiente

`MANGO_ANIMATION_LAVORO` (la cartella di lavoro, obbligatoria: l'archivio è `<lavoro>/archivio`, il profilo `<lavoro>/profilo.json`; senza la cartella il server non parte e lo dice; un profilo che lo schema non ammette no, `GET /api/profilo`), `MANGO_ANIMATION_PORTA`, `MANGO_ANIMATION_PORTA_ARRIVI`,
`MANGO_ANIMATION_PYTHON` (l'eseguibile, default `python`), `MANGO_ANIMATION_MODULO` (il modulo del motore, default
`motore`), `MANGO_ANIMATION_CLAUDE` (il percorso del programma `claude` che la chat usa al posto della copia dell'SDK; lo passa l'app, `docs/CHAT.md`). Ai lavori del motore il server passa `MANGO_ANIMATION_LINGUA` (`it` o `en`). Le variabili dell'app sono in `docs/APP.md`. La macchina (schede video, profilo di Chrome) non si indica con variabili: sta in `profilo.json` (`docs/ARCHITETTURA.md`). Un lavoro è `<python> -m <modulo> <comando> <argomenti>` lanciato dalla cartella del codice, con
`MANGO_ANIMATION_LAVORO` impostata.
