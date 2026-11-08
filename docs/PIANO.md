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
      "suoni": [ { "file": "materiali/disco.wav", "sorgente": "ripresa", "t": 0.8, "picco": -16 } ],
      "coda": 0.7
    }

## Le chiavi

- **`quadro`**: il nome di un quadro di `stile.json` (sotto). Vale per tutto il video; una scena può
  dichiararne un altro.
- **`sorgenti`**: i file del girato, ognuno col nome con cui il piano lo chiama. `file` è relativo ad
  `archivio/grezzo/`. Il file può essere solo audio (un memo vocale, una voce registrata a parte): se il quadro della scena mostra il girato,
  ogni suo pezzo vuole allora `girato`; sopra la sola animazione (`solo-animazione`) no. Una foto
  (JPEG, PNG) è una sorgente di un fotogramma solo, da mostrare come `girato` con `fermo: 0`. Facoltativi: `sfasamento` (di quanti secondi l'audio parte dopo il video nel file),
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
  - **senza voce**: solo `durata` (secondi), nessuna sorgente: per un video di sole animazioni e suoni, senza girato. Si vede
    l'animazione della scena, e il quadro non deve mostrare altro; si sentono solo i `suoni`.
  Su ogni pezzo con una sorgente: `evidenzia` (`[x, y, largo, alto]` nel fotogramma della sorgente: un riquadro attorno alla
  zona di cui si parla, per la durata del pezzo; colore e spessore dallo stile), `vista` (se diversa da quella della scena) e `zoom`
  (`{ "scala": 1.2, "centro": [0.5, 0.35] }`, oppure `"da"` e `"a"` al posto di `scala` per uno zoom che
  cresce lungo il pezzo; `centro` in frazioni del fotogramma della sorgente).
  `sottotitoli_tradotti` (`[ { "dalla": "<prime parole dette>", "testo": "<sottotitolo>" }, ... ]`, facoltativo): un pezzo detto in
  un'altra lingua (un keynote in inglese dentro un video italiano) ha questi sottotitoli al posto delle parole dette. Ogni riga comincia
  sulla parola detta da cui parte (`dalla`, cercata dopo la riga prima) e le sue parole si spargono, per lunghezza, fino alla fine
  dell'ultima parola detta prima della riga dopo; poi diventano battute come tutti gli altri sottotitoli. Se `dalla` non c'è,
  `risolvi` si ferma. La lingua in cui si trascrive il girato sta nella sua
  scheda nel grezzo (`docs/ARCHIVIO.md`).
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
- **`lingua`** (facoltativo: `"it"` se non c'è): la lingua del video. Con una lingua diversa
  dall'italiano i sottotitoli vogliono `sottotitoli.traduzione`, e le scene di `animazioni/` scrivono i loro
  testi tradotti (il `testi.ts` della scena): il motore passa la lingua a ogni scena, e la stessa scena in
  due lingue si rende due volte (la lingua entra nell'impronta della scena resa).
- **`sottotitoli`**: `modo` (`"parola per parola"`, `"a battute"`, `"nessuno"`: non si disegnano, ma `finale.srt` esce sempre, a battute); `scrittura`
  (`"minuscola"`: tutto minuscolo tranne `nomi`, senza la punteggiatura in coda; `"come trascritta"`: maiuscole
  e punteggiatura della trascrizione; senza, quella di `stile.json`); `nomi` (le parole che restano
  maiuscole); `rilievo` (le parole che contano, come «superintelligenza»: ognuna sta da sola nella sua battuta, più grande e nel
  colore di `sottotitoli.rilievo` dello stile, e quando viene detta fa un piccolo salto); `correzioni` (`{ "sorgente"?, "sentite": [...], "giuste": [...] }`: come si scrive ciò che la
  trascrizione ha sentito male, ovunque lo senta, senza badare a maiuscole e punteggiatura di ciò che cerca;
  `giuste` ha tante parole quante `sentite`, e una parola senza punteggiatura in coda tiene quella che aveva;
  oppure è una stringa sola che sostituisce tutte le `sentite`; un `*` davanti a una parola la scrive nel colore
  delle correzioni); `ritocchi` (`{ "sorgente", "minuto", "sentito", "detto" }`: dove la trascrizione ha saltato
  o cambiato parole; `dice` dei pezzi a parole si cerca nel testo già ritoccato, perché serve all'allineamento). `traduzione`
  (`[ { "it": "...", "en": "..." }, ... ]`: una riga per battuta, nell'ordine): per un piano in un'altra
  lingua `risolvi` sostituisce il testo di ogni battuta e pretende che `it` sia proprio quello che la battuta
  dice, così se il piano italiano cambia non si sfasa in silenzio. Coi sottotitoli tradotti non si va
  `"parola per parola"` (le parole inglesi non sono quelle dette): le battute restano `"a battute"`.
  Una parola senza lettere né cifre (i «...» della trascrizione) non entra nelle battute.
- **`titolo`**: `testo`, e facoltativi `da` e `a` in secondi del video (senza `da`, dall'inizio; senza `a`, per `titolo.durata` dello stile) e
  `parte` («Parte 1»: un secondo cartello sotto il titolo, staccato, nel colore di `titolo.parte` dello stile). Se lo stile chiede il maiuscolo (`titolo.maiuscolo`), titolo e parte escono in maiuscolo comunque siano scritti qui.
  Aspetto e posto vengono da `stile.json`.
- **`suoni`**: `file` (un percorso assoluto, oppure un nome in `materiali/` del video, in `materiali/` di un
  video da cui questo parte con `base`, o in `suoni/` del repo), `sorgente` e `t` (parte quando quella sorgente è a quel secondo, nella prima scena che la usa),
  oppure `scena` e `t` (parte `t` secondi dopo l'inizio di quella scena: un video senza voce non ha sorgenti a cui legarsi), `picco` in dB.
- **`copertina`** (`{ "disegno": "materiali/x.png", "istante": 0 }`): il primo fotogramma del video. `disegno` è un'immagine grande quanto il fotogramma (un percorso, o un file nella cartella del
  video); `monta` ci mette sopra la sagoma del primo fotogramma, o del secondo `istante` del video se nel primo il creator ha gli occhi chiusi, e il titolo, e la scrive davanti al video nella
  stessa codifica (`docs/MOTORE.md`, «La copertina»). Il video dura un fotogramma più dei tratti. Senza, il video si apre sul suo primo tratto, e `controlla` lo segna. In un video **orizzontale** (il creator non si vede) la copertina ha due chiavi in più: `sagoma` (`{ "sorgente": nome, "istante": secondo }`: la sagoma di un fotogramma di un'altra ripresa del piano, verticale, a sinistra col bordo bianco; se non c'è si scontorna solo quel fotogramma) e `righe` (le righe del titolo, una per cartello; senza, il titolo va a capo da solo). Il titolo sta a destra, dall'alto.
- **`coda`**: secondi tenuti dopo l'ultima parola del video (si aggiungono all'ultimo tratto). Si fermano prima della voce che nella sorgente segue quel tratto (a `voce.margine` da lei): il video non finisce sull'inizio di una frase.
- **`base`**: lo slug di un altro video: questo piano prende da quello tutto ciò che non dichiara. I
  campi semplici (`quadro`, `lingua`, `titolo`, `copertina`, `suoni`, `coda`, `modo`, `scrittura` e `traduzione` dei
  sottotitoli) si
  sostituiscono; le `scene` si sostituiscono per `nome` (quelle nuove si aggiungono in fondo) e le altre
  restano; per ogni sorgente `viste` e `riquadri` si sommano; `nomi`, `correzioni` e `ritocchi` dei
  sottotitoli si sommano. Serve per le varianti (una scena cambia) e per più video dalla stessa diretta (la
  scena che tiene tutti i pezzi ha lo stesso nome).

## I quadri

Un quadro è il modo in cui il fotogramma è composto: uno sfondo e degli strati, dal basso verso l'alto,
più il posto dei sottotitoli e del titolo. Stanno in `stile.json`, `quadri`. Non sono un elenco chiuso:
un quadro nuovo è una voce nuova fatta con gli stessi strati. Un quadro può dichiarare `"formato": "orizzontale"` (senza, è `verticale`): tutte le scene di un video vogliono quadri dello stesso formato. La sagoma è solo verticale. `corpo` e `corpo_minimo` di `sottotitoli` nel quadro cambiano il corpo dei cartelli; `fondo` (`null`: niente riquadro), `colore`, `bordo`, `contorno` e `colore_contorno` (il filo attorno alle lettere) ne cambiano l'aspetto. La `y` di `titolo` è il centro della prima riga: un titolo che va a capo cresce verso il basso, con la parte sotto.

| strato | cosa mette |
|---|---|
| `animazione` | la scena animata, nell'`area`; con `ritaglio` (`[x, y, largo, alto]`) se ne mostra solo quel rettangolo, sopra gli strati sotto: una scheda che non copre lo schermo. Una scena `trasparente` (in `animazioni/`) copre solo ciò che disegna: una scritta sopra il girato |
| `girato` | il fotogramma della sorgente nell'`area`: la `vista` del pezzo se c'è, altrimenti riempie l'area tenendo il centro (`centro`) |
| `sagoma` | la persona scontornata; `testa` è la riga della cima della testa, `x` lo spostamento (o `"testa"`: la testa al centro del fotogramma, misurata una volta per ripresa, con la sagoma ingrandita quanto basta per coprire ancora tutta la larghezza), `scala_minima`, `aria`, `sfuma` |
| `riquadro` | un rettangolo con nome della sorgente (`nome`), ingrandito di `scala`, centrato in orizzontale col bordo alto a `y`, con gli angoli di `raggio` |
| `viso` | il viso in un angolo (`angolo`: `basso-destra`, `basso-sinistra`, `alto-destra`, `alto-sinistra`), largo `largo`, a `margine` dal bordo, con gli angoli di `raggio`; viene dal riquadro `nome` della sorgente (la webcam dentro il fotogramma) oppure, se la sorgente dichiara `viso`, da un'altra sorgente |
| `inserto` | l'`inserto` della vista, largo `largo`, a `bordo` dall'angolo in alto a sinistra dello strato `girato` (senza inserto nella vista, niente) |

Lo strato `girato` tiene l'intera vista dentro l'area (`adatta`: `"contieni"`, con una vista è il modo
normale) o riempie l'area togliendo il di più attorno al `centro` (`"riempi"`, senza vista è il modo normale).
`scala_margine` della `sagoma` è ciò che si aggiunge alla scala calcolata. Un quadro che mostra
un'animazione vuole `animazione` nella scena; uno strato `inserto` vuole sotto di sé un `girato`.

**I lati che il telefono taglia.** Sui telefoni più allungati del 9:16 TikTok ingrandisce il video e ne taglia un
po' a destra e a sinistra. Nei quadri verticali ciò che si legge (animazione, schermo, titolo, sottotitoli) sta a
`telefono.margine_lati` dai lati: l'`area` di un'animazione a tutto fotogramma è più stretta e la scena vi entra
rimpicciolita, col fondo del quadro attorno. Uno strato che può finire tagliato (un viso, una persona sul palco, uno
schermo registrato già alto e stretto) dichiara `"al_vivo": true`. Una prova (`test_standard.py`) lo verifica su
ogni quadro verticale.

I quadri di serie:

| quadro | com'è | usato in |
|---|---|---|
| `sagoma-su-animazione` | animazione a tutto fotogramma, sagoma in basso a sinistra, sottotitoli accanto al viso | un video che spiega con un disegno a tutto fotogramma |
| `sagoma-al-centro` | dall'alto: l'animazione nella fascia, i sottotitoli centrati, la sagoma a tutta larghezza dalla testa in giù | un video che spiega con un disegno nella fascia |
| `girato-e-sagoma` | dall'alto: il girato nella fascia, i sottotitoli centrati, la sagoma a tutta larghezza; la sagoma può venire da un'altra ripresa (`sagoma` del pezzo) | l'ospite che parla sopra, il creator che reagisce sotto |
| `sagoma-sul-girato` | il girato a tutto fotogramma e, sopra, la sagoma a tutta larghezza; i sottotitoli fra le due; il girato può essere il fotogramma fermo di un'altra ripresa (`girato` del pezzo) | il creator che commenta davanti al talk di un altro |
| `sagoma-sul-girato-con-scena` | come `sagoma-sul-girato`, e sopra a tutto una scena animata trasparente (loghi, cartelli sopra la testa) | un video con loghi e cartelli sopra la testa |
| `schermo-e-viso` | carta, lo schermo in alto, il viso della webcam sotto, sottotitoli in mezzo | i video estratti da una diretta |
| `schermo-e-viso-scuro` | lo stesso, su fondo inchiostro | la variante scura per un video estratto da una diretta |
| `girato-pieno` | il girato a tutto fotogramma, sottotitoli in basso | parlato senza animazioni |
| `girato-con-scritte` | il girato a tutto fotogramma e, sopra, una scena animata trasparente a tutto fotogramma; sottotitoli in basso | parlato con scritte sopra |
| `girato-con-animazione` | il girato com'è (senza sagoma né scontorno) da 680 px in giù, col mento sopra la zona dei nomi di TikTok; sopra, a tutta larghezza, una scena animata trasparente che riempie la parte alta (ciò che si legge sta nella fascia, sotto l'intestazione di TikTok e lontano dai lati); i sottotitoli fra la scena e la testa | un video di notizia con una scena animata sopra il girato |
| `schermo-con-scheda` | lo schermo a tutto fotogramma e, sopra, una scheda animata che ne copre solo una fascia | una spiegazione che cammina sopra lo schermo registrato |
| `solo-animazione` | l'animazione su tutto il fotogramma meno i lati che il telefono taglia, la voce sotto, niente viso | — |
| `lungo-girato` | 16:9: il girato a tutto fotogramma (una diretta con la webcam già dentro), sottotitoli in basso | video lunghi |
| `lungo-schermo` | 16:9: lo schermo a tutto fotogramma e il viso in un riquadro nell'angolo in basso a destra | video lunghi |
| `lungo-animazione` | 16:9: l'animazione a tutto fotogramma, la voce sotto | video lunghi |
| `schermo-pieno` | uno schermo o un documento a tutto fotogramma, niente viso | — |
| `schermo-pieno-scuro` | lo stesso, su fondo nero | le foto di uno schermo acceso al buio |

## Il risolto

`python -m motore risolvi <slug>` scrive `lavoro/risolto.json`: il piano trasformato in tempi veri. È ciò
che l'interfaccia mostra e ciò che `monta` esegue. Non si scrive a mano.

    {
      "impronta": "…",                       del piano e delle sezioni dello stile che cambiano il montato (`docs/MOTORE.md`, «Il piano che cambia mentre monta»)
      "formato": { "largo": 1080, "alto": 1920, "fps": 30, "nome": "verticale" },
      "capitoli": [ { "titolo": "La partenza", "da": 0 } ],
      "durata": 60.2,
      "scene":  [ { "nome", "quadro", "inizio", "durata", "animazione", "ancore": [[t video, t scena]],
                    "tempi": { nome: secondo di scena } } ],
      "tratti": [ { "scena": 0, "pezzo": 0, "sorgente": "ripresa", "da": 0.43, "durata": 7.2, "esce": 0.0,
                    "vista": null, "zoom": null, "evidenzia": null, "legato": [null, null],
                    "immagine": null | { "da": 0.43, "passo": 1.12 },           da dove e a che passo corre l'immagine, se non segue la voce
                    "sagoma": null | { "sorgente": "muta", "da": 4.1 },         da quale ripresa e da quale secondo viene la sagoma, se non dalla voce
                    "girato": null | { "sorgente": "talk", "fermo": 40.5 }          il fotogramma fermo che fa da girato, se non è quello della voce,
                              | { "sorgente": "muto", "da": 12.3, "passo": 1.0 } } ],  o da dove e a che passo corre l'altra ripresa
      "parole": [ { "p": "ciao", "da": 0.10, "a": 0.32, "tratto": 0, "nella_sorgente": 0.53, "voto": 0.91 } ],
      "battute": [ { "da": 0.1, "a": 1.4, "testo": "ciao a tutti", "istanti": [0.1, 0.4, 0.7] } ],
      "titolo": { "testo": "…", "parte": null, "da": 0, "a": 1 } | null,
      "copertina": { "disegno": "materiali/x.png", "istante": 0 } | null,           com'è nel piano: il montato ha un fotogramma in più davanti
      "suoni": [ { "file": "…", "esce": 12.3, "guadagno": -4.1 } ],
      "avvisi": [ { "tratto": 3, "cosa": "il taglio all'inizio cade nella voce (-31 dB)", "cosa_en": "the cut at the start falls in the voice (-31 dB)" } ]
    }

`da`, `a`, `esce`, `istanti` di tratti, parole e battute sono secondi **del video**, tranne `da` e
`durata` di un tratto, che sono secondi **della sorgente**. `legato` dice se un bordo del tratto cade
dentro il parlato (i dB) invece che nel silenzio (`null`): sono i tagli da guardare. `avvisi` li ripete a parole
(«il taglio all'inizio / alla fine cade nella voce»), elenca le parole poco sicure per l'allineamento con la sicurezza in percentuale e dice anche dove una `rifila` taglia la voce: a che livello e quanta voce resta oltre il
taglio, coi secondi della sorgente, e dove un tratto riprende l'audio del tratto prima (stessa sorgente, i due si accavallano: si sentirebbe due volte). `cosa` è in italiano e `cosa_en` è la stessa frase in inglese.

- `ancore` di una scena: `[secondo del video dall'inizio della scena, secondo dell'animazione]`; `tempi`:
  secondi dall'inizio della scena. È ciò che arriva ad `animazioni/` (`docs/MOTORE.md`).
- `voto` di una parola è quello dell'allineamento, solo per i pezzi a parole; per i pezzi a tempo la parola
  ha i tempi della trascrizione e `voto` è `null`.
- `testo` di una battuta tiene gli asterischi delle correzioni (il `.srt` li toglie).
- Il tratto di un pezzo senza voce ha `sorgente` `null` e `da` 0: niente parole, il suo audio è silenzio.
- `suoni[].file` è come sta nel piano; `guadagno` porta il suo picco a quello chiesto.

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
