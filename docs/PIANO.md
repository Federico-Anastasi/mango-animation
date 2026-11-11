# Il piano di un video

`archivio/video/<slug>/piano.json` dice cosa si monta e come. Lo schema è
`motore/schemi/piano.schema.json`; gli standard a cui rimanda stanno in `stile.json`.

    {
      "quadro": "sagoma-su-animazione",
      "sorgenti": {
        "ripresa": { "file": "2026-03-06/20260306-101500-IMG_0042.MOV" },
        "diretta": { "file": "2026-03-08/diretta.mp4", "sfasamento": 0.479,
                     "riquadri": { "webcam": [1244, 26, 432, 246] },
                     "viste": { "demo": { "taglio": [720, 280, 960, 720], "inserto": [10, 105, 482, 250] } } }
      },
      "scene": [
        { "nome": "c1", "animazione": "c1",
          "pezzi": [ { "sorgente": "ripresa", "da": 0.43, "a": 7.63, "via": [[3.1, 3.4]] } ],
          "ancore": [ ["ripresa", 4.78, 1.2] ] },
        { "nome": "demo", "quadro": "schermo-e-viso", "vista": "demo",
          "pezzi": [ { "sorgente": "diretta", "minuto": "12:35", "dice": "ecco il risultato" } ] }
      ],
      "sottotitoli": { "modo": "parola per parola", "nomi": ["Anna"], "correzioni": [], "ritocchi": [] },
      "titolo": { "testo": "Cinque errori di montaggio" },
      "copertina": { "disegno": "materiali/copertina.png" },
      "suoni": [ { "file": "disco.wav", "sorgente": "ripresa", "t": 0.8, "picco": -16 } ],
      "coda": 0.7
    }

## Le chiavi

- **`quadro`**: il nome di un quadro di `stile.json` (`docs/QUADRI.md`). Vale per tutto il video; una scena può
  dichiararne un altro.
- **`sorgenti`**: i file del girato, ognuno col nome con cui il piano lo chiama. `file` è relativo ad
  `archivio/grezzo/`. Il file può essere solo audio (un memo vocale, una voce registrata a parte): se il quadro della scena mostra il girato,
  ogni suo pezzo vuole allora `girato`; sopra la sola animazione (`solo-animazione`) no. Una foto
  (JPEG, PNG) è una sorgente di un fotogramma solo, da mostrare come `girato` con `fermo: 0`. Un video senza traccia audio (una registrazione dello schermo) è una sorgente senza voce: non ha parole né livello, i suoi pezzi vogliono `da` e `a` (con `dice` il piano non va) e si tengono interi, senza pause da togliere; il suo audio è silenzio. Facoltativi: `sfasamento` (di quanti secondi l'audio parte dopo il video nel file),
  `immagine` (`"continua"`: per uno schermo registrato, senza viso; l'immagine non salta a ogni taglio della voce ma corre fino al tratto dopo, fra due salti veri non resta mai meno di `immagine.minimo` di `stile.json`, e non corre mai oltre `immagine.passo_massimo` volte la velocità: oltre, corre al massimo e poi salta),
  `riquadri` (rettangoli `[x, y, largo, alto]` del fotogramma con un nome: la webcam di una diretta),
  `viste` (rettangoli da mostrare, con un nome; `inserto` è un secondo rettangolo tenuto sopra; `"segui": true` tiene la persona al centro: il `taglio` dà misure e altezza, e scorre in orizzontale dietro la testa, levigato come una camera che segue), `viso` (`{ "sorgente": nome di un'altra sorgente del piano, "scarto": secondi }`: il file del viso registrato a parte, che a `scarto` ha lo stesso istante del secondo zero di questa sorgente).
- **`scene`**: in ordine. Una scena ha un `nome`, i suoi `pezzi`, e ciò che fa da sfondo: `animazione` (la
  sigla di una scena di `animazioni/`) o `vista`. Facoltativi: `quadro`, `ancore`, `parole`.
- **`pezzi`**: un pezzo è un tratto di una sorgente, scelto in uno dei due modi, oppure un pezzo senza voce:
  - **a tempo**: `da`, `a` (secondi della sorgente; senza, dalla prima all'ultima voce), `via` (tratti da
    togliere), `pausa` (i silenzi dentro il pezzo più corti di così restano). I silenzi si tolgono sul livello della voce; in
    testa e in coda il silenzio va via sempre, fino al margine della voce (`voce.margine`): `da` e `a` delimitano dove cercare.
  - **a parole**: `minuto` (`"mm:ss"`) e `dice` (le parole, come le scrive la trascrizione): si prende la
    prima volta che vengono dette da quel minuto. I confini veri delle parole li trova l'allineamento
    forzato; dove l'allineamento non è sicuro (voto sotto `taglio.a_parole.voto_bordo`, oppure cifre, sigle e %,
    che l'allineatore non sa scrivere in lettere) il bordo del pezzo si cerca sul livello della voce. `rifila: [inizio, fine]`
    sposta a mano i due bordi, in secondi (negativo = prima), da quello già trovato: se cade dentro la voce
    finisce negli `avvisi`.
  - **senza voce**: `durata` (secondi del video), nessuna sorgente; si sentono solo i `suoni`, e non ci sono sottotitoli. Da solo
    mostra l'animazione della scena, e il quadro non deve mostrare altro. Con `girato` (lo stesso del pezzo con la voce, sotto)
    mostra muta quella ripresa: `fermo`, o da `da` a velocità vera, o da `da` ad `a` stretta nella `durata` (accelerata), con
    facoltativi `vista`, `zoom` ed `evidenzia`; il quadro mostra il girato ma non la sagoma (`girato-pieno`). Serve a un primo
    montaggio su una ripresa muta, con la voce da registrare dopo.
  Su ogni pezzo con una sorgente: `evidenzia` (`[x, y, largo, alto]` nel fotogramma della sorgente: un riquadro attorno alla
  zona di cui si parla, per la durata del pezzo; colore e spessore dallo stile), `vista` (se diversa da quella della scena) e `zoom`
  (`{ "scala": 1.2, "centro": [0.5, 0.35] }`, oppure `"da"` e `"a"` al posto di `scala` per uno zoom che
  cresce lungo il pezzo; `centro` in frazioni del fotogramma della sorgente).
  `sottotitoli_tradotti` (`[ { "dalla": "<prime parole dette>", "testo": "<sottotitolo>" }, ... ]`, facoltativo): un pezzo detto in
  un'altra lingua (un keynote in inglese dentro un video italiano) ha questi sottotitoli al posto delle parole dette. Ogni riga comincia
  sulla parola detta da cui parte (`dalla`, cercata dopo la riga prima) e le sue parole si spargono, per lunghezza, fino alla fine
  dell'ultima parola detta prima della riga dopo; poi diventano battute come tutti gli altri sottotitoli. Se `dalla` non c'è,
  `risolvi` si ferma. La lingua in cui si trascrive il girato sta nella sua
  scheda nel grezzo (`docs/SCHEDE.md`, «La scheda di un file grezzo»).
  `sagoma` (`{ "sorgente": nome, "scarto": secondi }`, facoltativo): la sagoma del pezzo viene da un'altra ripresa
  invece che da quella della voce, al secondo del pezzo più `scarto`: una reazione girata muta guardando il pezzo. Senza, voce e
  sagoma vengono dalla stessa ripresa.
  `girato` (facoltativo): lo strato `girato` mostra, per tutto il pezzo, un'altra ripresa (o una foto) invece di quella della voce,
  inquadrata con la `vista` (che è di quella ripresa) e lo `zoom` del pezzo; voce e sagoma restano del pezzo.
  `{ "sorgente": nome, "fermo": secondo }` è il fotogramma fermo a quel secondo: un talk dietro la sagoma di chi lo commenta.
  `{ "sorgente": nome, "da": secondo }` è la ripresa che scorre da `da` a velocità vera, di seguito anche dove la voce ha pause tolte;
  con `a`, il tratto da `da` ad `a` occupa tutto il pezzo, più veloce o più lento. È la voce registrata a parte sopra un girato
  muto: l'immagine cambia da un pezzo all'altro, e coi pezzi a parole cambia sulla parola che la nomina.
- **`capitolo`** (di una scena, facoltativo): il titolo di un capitolo che comincia con la scena. `risolvi` li mette in `capitoli` e `monta` scrive `uscite/capitoli.txt` nella forma che YouTube legge in descrizione (`0:00 Titolo`; `1:02:03` dopo l'ora). YouTube vuole il primo capitolo a `0:00`.
- **`ancore`**: `[sorgente, secondo della sorgente, secondo della scena]`: quando si dice quella parola,
  l'animazione è a quel punto. Fra due ancore l'animazione scorre al suo passo e poi aspetta.
- **`parole`** (di una scena): `{ nome: [sorgente, secondo della sorgente] }`. Il motore scrive per
  l'animazione il secondo di scena in cui ogni nome viene detto: è il modo per le scene che scorrono al
  passo del video, senza ancore.
- **`lingua`**, **`sottotitoli`**, **`titolo`**, **`suoni`**, **`copertina`**, **`coda`**: le chiavi che riguardano ciò che esce, in `docs/PIANO-USCITA.md`.
- **`base`**: lo slug di un altro video: questo piano prende da quello tutto ciò che non dichiara. I
  campi semplici (`quadro`, `lingua`, `titolo`, `copertina`, `suoni`, `coda`, `modo`, `scrittura` e `traduzione` dei
  sottotitoli) si
  sostituiscono; le `scene` si sostituiscono per `nome` (quelle nuove si aggiungono in fondo) e le altre
  restano; per ogni sorgente `viste` e `riquadri` si sommano; `nomi`, `correzioni` e `ritocchi` dei
  sottotitoli si sommano. Serve per le varianti (una scena cambia) e per più video dalla stessa diretta (la
  scena che tiene tutti i pezzi ha lo stesso nome).
  Una versione tradotta è un video a sé (`archivio/video/<slug>-<lingua>/`, con la sua scheda) che parte dall'originale con `base`; le righe
  di `traduzione` vengono dalle `battute[].testo` del risolto dell'originale, in ordine, non scritte a mano:

      { "base": "<slug>", "lingua": "en",
        "sottotitoli": { "modo": "a battute",
                         "traduzione": [ { "it": "<riga italiana>", "en": "<riga inglese>" }, … ] },
        "titolo": { "testo": "<titolo tradotto>", "da": 0, "a": … } }

  Il `titolo` c'è solo se l'originale ne ha uno, con `da` e `a` copiati.

## I quadri

Il modo in cui è composto il fotogramma: lo sfondo e gli strati, il posto di sottotitoli e titolo, i quadri di serie. Sta in `docs/QUADRI.md`.

- **I lati che il telefono taglia.** Ciò che si legge sta lontano dai lati che TikTok ritaglia sui telefoni allungati: `docs/QUADRI.md`.

## Il risolto

`python -m motore risolvi <slug>` scrive `lavoro/risolto.json`, il piano in tempi veri: ciò che l'interfaccia mostra e ciò che `monta` esegue. La sua forma sta in `docs/RISOLTO.md`.

## I ritocchi a mano

L'interfaccia cambia il piano, mai il risolto:

| gesto | cosa scrive nel piano |
|---|---|
| trascinare il bordo di un tratto | `da` / `a` del pezzo a tempo; `rifila` del pezzo a parole |
| trascinare il bordo fra due tratti di un pezzo a parole (dove una pausa è stata tolta) | il pezzo diviso in due `dice` nel punto del bordo, e il bordo spostato in `rifila` del pezzo che lo affaccia (la fine del primo, l'inizio del secondo): lo zoom, se c'è, si divide con lui |
| togliere un pezzo, spostarlo, cambiare l'ordine delle scene | la lista `pezzi` / `scene` |
| portare un pezzo in un'altra scena (trascinandolo sulla scena, o dal pannello del tratto) | il pezzo esce dalla lista `pezzi` di una scena ed entra in quella dell'altra: in testa se la scena viene dopo, in fondo se viene prima; tiene la vista della scena da cui viene. Non si sposta l'unico pezzo di una scena, né uno che ha un'ancora o una `parole` della sua scena, né un pezzo senza voce in un quadro che mostra il girato |
| dividere un pezzo | due pezzi al posto di uno |
| togliere una parola | pezzo a tempo: un tratto in `via`; pezzo a parole: il pezzo diviso in due `dice` |
| zoom | `zoom` del pezzo |
| correggere un sottotitolo | una voce in `sottotitoli.correzioni` |
