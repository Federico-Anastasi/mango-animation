# Il motore

Si lancia dalla radice del codice. L'archivio è `archivio/` nella cartella di lavoro, quella di `MANGO_ANIMATION_LAVORO` (`docs/ARCHITETTURA.md`); senza la variabile ogni comando esce con 1 e lo dice. Ogni comando scrive
l'avanzamento su stdout, una riga per passo, ed esce con 0 se è riuscito, 1 con una frase in italiano su
stderr se no (cosa manca e come si rimedia). Ciò che è già fatto con gli stessi ingredienti non si rifà. Le barre di avanzamento e gli avvisi delle librerie dei modelli e dell'immagine non escono: `motore/__init__.py` li spegne alla fonte, con le loro variabili d'ambiente, prima che le librerie si importino. I modelli (trascrizione, allineamento, scontorno)
girano sulla scheda di `macchina.scheda_video` del profilo del creator (l'indice di `nvidia-smi`; `docs/ARCHITETTURA.md`, «Il profilo»);
senza profilo, sulla scheda NVIDIA che c'è; senza scheda, o con `scheda_video: null`, sul processore, più lenti, e il motore lo dice su stderr.
Una scheda indicata che non c'è è un errore, non un ripiego. Ogni funzione può avere il suo posto e il suo interruttore in `motori` del profilo
(trascrizione, allineamento, sagoma, segui, voce pulita, dettatura: `docs/MOTORI.md`, §4): `dove` sceglie scheda o processore per quella funzione, `attiva: false` la spegne. Il motore numera le schede come `nvidia-smi` (`CUDA_DEVICE_ORDER=PCI_BUS_ID`, lo stesso ordine di `animazioni/`) e rende visibile al processo solo quella del profilo
(`CUDA_VISIBLE_DEVICES`), che per i modelli è la 0; un `CUDA_VISIBLE_DEVICES` già presente nell'ambiente di chi lancia il motore non conta: la scheda la decide il profilo. Senza `scheda_video` nel profilo quell'elenco resta com'è. Una scheda senza il
calcolo `float16` non regge la trascrizione: non va indicata.

| comando | cosa fa | scrive |
|---|---|---|
| `python -m motore prova <slug>` | prima di registrare: le scene della proposta (`proposta.scene` della scheda, `docs/ARCHIVIO.md`) rese coi tempi stimati del copione (`prova` dello stile; una scena con `parole` riceve il secondo stimato di ognuna), nel quadro della proposta, e sotto ogni frase intera con la parola in corso in rosso. Gli spezzoni della proposta (`proposta.spezzoni`: un talk, un keynote che il creator commenta) passano fra le frasi alla loro durata vera (scelti a parole come un pezzo del piano, con le pause in mezzo tolte, o a secondi), nel posto del girato del quadro, con la loro voce e la loro traduzione intera dove stanno le frasi; mentre il creator parla il girato resta fermo. Una scena senza animazione con un `girato` (un podcast, un keynote in un'altra lingua che il creator racconta con la sua voce) lo fa scorrere muto sotto le sue frasi, dal secondo `da`, nel posto del girato del `quadro` della scena. L'unico audio è quello degli spezzoni. Le scene si rendono in `lavoro/prova/`, non in `lavoro/scene/`. Scrive anche `uscite/copione.html`, la pagina che `/guarda` offre al telefono per leggere le frasi mentre si registra (una per riga, grandi, uno spezzone è la sua traduzione in grigio; titolo, colori e misure da `prova` dello stile, `lang` dal profilo; una pagina sola, senza niente di esterno) | `uscite/prova.mp4`, `uscite/copione.html` |
| `python -m motore valida <slug>` | schema e riferimenti del piano (sorgenti, quadri, formati, viste, viso, animazioni — le sigle si chiedono a `bun run elenco` e, se una non c'è, la frase dice quali ci sono —, parole di `dice`) | niente |
| `python -m motore prepara <slug>` | per ogni sorgente del piano: parole, copia leggera, onda, miniatura. La sagoma e dove sta la persona no: le fa `monta`, dei soli tratti. La trascrizione va a tratti di voce (`preparati.tratti_di_voce`), ognuno da solo e senza il testo degli altri tratti, con i `sottotitoli.nomi` del piano come suggerimento; una parola più lunga di `preparati.parola_lunga` secondi (una falsa partenza fusa con la frase ridetta) si ritrascrive da sola, e se ne escono più parole prendono il suo posto; le parole senza voce sotto (sotto `voce.silenzio_db` fino a `dopo_parola` dopo la loro fine) non entrano | `archivio/preparati/…` |
| `python -m motore prepara-file <file> [--ritrascrivi]` | lo stesso per un file grezzo solo (con `--ritrascrivi` rifà le parole anche se ci sono: dopo aver cambiato la `lingua` nella scheda del file) (un file solo audio non ha copia leggera né miniatura) (un video senza traccia audio non ha onda né parole: non c'è niente da trascrivere); per i file oltre 10 minuti anche `trascrizione.txt`. Una foto (HEIC/HEIF, JPEG, PNG, WebP, TIFF, BMP, GIF, DNG) non passa da ffmpeg né dalla trascrizione: `foto.jpg`, intera e raddrizzata secondo l'EXIF, col lato lungo al più `preparati.lato_foto` e qualità `preparati.qualita_foto`, e `miniatura.jpg` (`lato_miniatura`, `qualita_miniatura`). Una HEIC dell'iPhone è una griglia di riquadri che ffmpeg legge a uno solo: si apre con `pillow-heif` | `archivio/preparati/…` |
| `python -m motore risolvi <slug>` | il piano in tempi veri | `lavoro/risolto.json` |
| `python -m motore monta <slug>` | risolve, rende le animazioni, scontorna i soli tratti in sagoma (in un passaggio, ognuno allargato di `sagoma.margine`; un tratto già portato da un pezzo di sagoma non si rifà), misura la testa nei soli tratti di una vista che segue la persona, monta; se il piano dichiara `copertina`, la compone e la mette come primo fotogramma della stessa codifica | `uscite/finale.mp4`, `finale.srt` (sempre, anche con `modo: "nessuno"`), `capitoli.txt` (se le scene hanno `capitolo`); con `copertina` nel piano anche `copertina.png` e `con-copertina.mp4`, che è lo stesso file di `finale.mp4` |
| `python -m motore anteprima <slug> --scena <nome>` (o `--da <s> --a <s>`) | solo un pezzo del video, per guardare una correzione: rende le scene e compone i tratti che toccano il pezzo (gli stessi file di `lavoro/` che poi usa `monta`, che non li rifà), con sottotitoli, titolo e suoni, codificato veloce (`uscita.anteprima`); il pezzo si allarga ai tratti interi. La sagoma si fa come in `monta`: dei tratti che ancora non l'hanno | `uscite/anteprima.mp4`, `anteprima.json` (`{ "da", "a" }`: i secondi del video che copre, scritto dopo il video) |
| `python -m motore anteprima <slug> --foto <secondo>` | un solo fotogramma composto del video a quel secondo (secondi del video): il quadro del suo tratto con la sagoma, i sottotitoli e il titolo, e della scena solo il suo fotogramma (`registra --foto`, un'immagine: niente scena intera, niente tratto scritto). Per un posto, un colore, una posizione. La sagoma deve esserci già (un `monta` o un'`anteprima` la fa); una scena trasparente no (vuole la sua maschera: l'anteprima della scena) | `lavoro/foto/composta-<secondo>.jpg` |
| `python -m motore leggero <slug>` | la copia piccola del video completo, con la copertina, solo quando il creator la chiede (guarda dal telefono o la manda); senza una copertina più nuova del montato si ferma | `uscite/leggero.mp4` |
| `python -m motore controlla <slug>` | riascolta il montato | `lavoro/controllo.json` |
| `python -m motore parole <slug>` | stampa ogni tratto con le sue parole e i loro istanti, nella sorgente e nel video | niente |
| `python -m motore foto <slug> <secondo> [...] [--anteprima \| --prova]` | fotogrammi del montato a quei secondi, per guardarli; con `--anteprima` dall'anteprima, ma sempre coi secondi del video montato (tradotti con `anteprima.json`): un secondo fuori dal pezzo che copre, o un `anteprima.json` che manca o è più vecchio del video, è un errore; con `--prova` dalla prova, coi suoi secondi | `lavoro/foto/<secondo>.jpg`, `anteprima-<secondo>.jpg`, `prova-<secondo>.jpg` |
| `python -m motore foto-girato <file> <secondo> [...]` | fotogrammi di un file del girato a quei suoi secondi | `archivio/preparati/<file>/foto/<secondo>.jpg` |
| `python -m motore ascolta <da> <a> (--file <file> \| --video <slug>)` | il suono di un pezzo di un file del girato (secondi del file) o del montato (secondi del video): una riga JSON col livello della voce ogni centesimo (`livello`, dB, da `da`), i tratti sopra `voce.silenzio_db` (`voce`) e il percorso dello spettrogramma (0-8 kHz, `ascolta.largo` × `ascolta.alto`; il suo asse del tempo parte da 0, cioè da `da`) | `archivio/preparati/<file>/ascolta/…png`, `lavoro/foto/ascolta-…png` |
| `python -m motore copertina <slug> [<disegno>] [--istante <secondo>]` | l'immagine della copertina, per guardarla prima di montare: il disegno (un percorso, o un file nella cartella del video: `materiali/x.png`) con sopra la sagoma del primo fotogramma (o di quel secondo del video, se nel primo il creator ha gli occhi chiusi) e il titolo. Disegno e istante, se non si danno, sono quelli di `copertina` nel piano. Nel video la mette `monta` | `uscite/copertina.png` |
| `python -m motore pagina <slug> [nome …] [--solo-ritagli] [--visibile]` | le pagine vere di `materiali/pagine.json` (tutte, o quelle nominate) in formato telefono, con dove stanno le frasi, e i loro ritagli per le scene (sotto «Le pagine vere»); `--solo-ritagli` rifà solo i ritagli dalle catture che ci sono, `--visibile` usa il Chrome visibile per i siti che bloccano il browser senza finestra | `materiali/screen-<nome>.png`, `.json`, `.txt`, `materiali/ritagli/` |
| `python -m motore carosello <slug> [--nuovo]` | le slide di un carosello: ogni `<section class="slide">` di `materiali/carosello.html` in un PNG, coi controlli (sotto «Il carosello»); `--nuovo` scrive invece la base da cui partire, dove la pagina non c'è | `uscite/slide-<n>.png`, o `materiali/carosello.html` |
| `python -m motore anteprima-proposta <slug> [--riga <testo>]` | l'anteprima di una proposta: una carta nello stile (`anteprima` di `stile.json`) con una barra, il titolo della scheda e, sotto, la riga, al centro del riquadro; il titolo si rimpicciolisce finché ci sta, e se non ci sta nemmeno al corpo minimo è un errore che dice di accorciare. Rifatta, sostituisce la precedente; una foto o un disegno si salvano sullo stesso nome | `materiali/anteprima.png` |
| `python -m motore detta` | la dettatura dell'app: un processo che resta acceso col modello caricato e parla a righe JSON su stdin e stdout (sotto «La dettatura»); non ha slug e non vuole la cartella di lavoro | niente |

## I moduli

    motore/
      __main__.py     i comandi
      errori.py       l'errore che dice cosa fare
      dispositivo.py  dove gira ogni funzione pesante: `motori.<funzione>.dove`, o la scheda del profilo, o il processore; `dispositivo_voce` per la dettatura
      archivio.py     dove stanno le cose; lettura di piano (con `base`), stile unito; validazione
      profilo.py      lettura e schema del profilo del creator (`macchina` e `motori`, letti una volta per processo)
      media.py        ffmpeg, ffprobe, l'audio di un file
      foto.py         le foto: foto.jpg intera e dritta e miniatura (Pillow, pillow-heif per le HEIC)
      prepara.py      trascrizione (faster-whisper large-v3), sagoma e posto della testa nei soli tratti, leggero, onda, miniatura
      persona.py      dove sta la persona in un fotogramma: il riquadro (RT-DETR) e il viso (YuNet)
      scontorno.py    la persona senza sfondo: SAM2, ViTMatte e flusso ottico
      sagoma.py       i pezzi di sagoma di una sorgente: quale file porta un tratto, e da che secondo del file
      voce.py         il livello della voce (onda.bin) e i suoi silenzi
      allinea.py      allineamento forzato (torchaudio MMS_FA), con la sua cache
      sorgenti.py     una sorgente preparata: parole pulite, livello della voce, la scelta di un `dice`
      sottotitoli.py  parole come si scrivono (correzioni, ritocchi), battute, cartelli (sottotitoli e titolo)
      taglio.py       un pezzo → i suoi tratti: a tempo e a parole
      risolvi.py      piano → risolto
      quadri.py       un tratto + un quadro → il filtro di ffmpeg che lo compone
      segui.py        la vista che segue la persona: il centro levigato e il taglio che scorre
      animazioni.py   le scene animate: cosa chiedere, cosa è già reso
      monta.py        tratti, unione, sottotitoli, titolo, suoni, uscita; l'anteprima di un pezzo
      prova.py        il video per registrare: copione a frase intera sulle scene
      pulizia.py      la voce montata senza rumore di fondo (DeepFilterNet3)
      controlla.py    il montato riascoltato
      copertina.py    la copertina: il disegno con la sagoma e il titolo sopra
      carosello.py    le slide di un carosello (`strumenti/carosello.mjs`) e i loro controlli
      proposta.py     l'anteprima di una proposta: una carta col titolo e una riga
      pagina.py       le pagine vere: la cattura (`strumenti/pagina.mjs`) e i ritagli
      detta.py        la dettatura: le frasi dalla voce che arriva a pezzi, il protocollo, il modello
      schemi/         gli schemi JSON, usati anche dal server
      prove/          pytest, senza scheda video

## Cosa legge dallo stile

Nessuna misura, colore o soglia sta nel codice: tutto viene da `stile.json`: quello di serie del prodotto con sopra quello del creator, se la cartella di lavoro ne ha uno (`docs/ARCHITETTURA.md`, «Lo stile»; `leggi_stile`). `formati` (`verticale`, il predefinito, e `orizzontale`: largo, alto, fps; un quadro dichiara il suo con `formato`; la sagoma si scontorna sempre nel `verticale`, e una ripresa che non ne ha la proporzione è un errore), `telefono` (`margine_lati`: i pixel ai lati che TikTok taglia sui telefoni più allungati, `docs/PIANO.md`), `colori`, `caratteri` (un percorso `font/<file>`, cercato prima in `font/` della cartella di lavoro e poi in quella del prodotto);
`voce` (livello, soglia di silenzio, margini, filtri della voce; `pulizia`: se la voce si pulisce e di quanti dB al
massimo si abbassa il rumore); `taglio.a_tempo` e `taglio.a_parole` (le
misure dei due modi di tagliare); `sottotitoli`, `titolo` (l'aspetto dei cartelli: il carattere è Metropolis Medium e gli angoli sono tondi di `raggio` pixel, titolo e parte; `sottotitoli.rilievo`: corpo, colore e salto delle parole in rilievo; `durata`: quanto sta a schermo il titolo se il piano non dice `a`); `suoni`; `anteprima` (la carta di una proposta: misure, margine, la barra, i corpi e i colori del titolo e della riga); `copertina`; `ascolta` (le misure dello spettrogramma);
`prova` (il video per registrare: quadro di partenza, caratteri al secondo e pausa fra le frasi per stimare i tempi, colori della parola detta, in corso e da dire e della traduzione di uno spezzone, il cartello delle frasi senza scena, `copione`: le misure della pagina da leggere sul telefono, la codifica); `uscita` (codifica; `anteprima`: la codifica veloce dell'anteprima; `leggero` e `leggero_orizzontale`; `tratti_massimo_mb` e `campione`: quanto spazio concedere ai tratti prima di montare in un passaggio solo); `sagoma` (come si misura la testa; `margine`: quanto prima e dopo ogni tratto parte lo scontorno; `scontorno`: le misure dello scontorno, sotto «La sagoma»; `codifica`: come si scrive il VP9 con alfa dei pezzi, `deadline`, `cpu_used`, `crf`, e `in_coda`, quanti fotogrammi scontornati aspettano l'encoder); `segui` (come si misura e si segue la persona in una vista); `zoom`; `evidenzia` (colore e spessore del riquadro attorno a una zona); `immagine` (per le sorgenti a immagine continua: oltre quale `salto` l'immagine stacca, il `minimo` che resta a schermo e il `passo_massimo`, il tetto alla velocità a cui corre fino al tratto dopo); `preparati` (copie leggere, trascrizione, i suoi `tratti_di_voce` e `parola_lunga`);
`controllo` (soglie di `controlla`); `quadri` (gli strati, `docs/PIANO.md`); `pagina` (le pagine vere: `larghezza` e `densita` del telefono, `finestra`, l'altezza minima in px CSS, `sotto_le_frasi`, i px della cattura che restano sotto ogni frase, `qualita` dei ritagli); `carosello` (`largo` e `alto` di una slide, `destra`, i px a destra dove stanno i bottoni di TikTok, `didascalia`, i px in basso dove sta la didascalia); `dettatura` (sotto «La dettatura»); `parallelismo` (`processori_per_lavoro`: quanti processori ha ogni lavoro tenuto in parallelo, 4 di serie, per il motore e per `animazioni/`); `sticker` (le misure dello sticker del creator: `bordo` in pixel, `altezza_busto` e `lati` in frazioni della larghezza, `per_ripresa` provini). Un valore che serve e non c'è
si aggiunge lì, con un nome che dice cosa è.

## Cosa si tiene

`archivio/preparati/<giorno>/<file>/` (`docs/ARCHIVIO.md`) tiene anche `allineate.json`: i confini veri delle
parole dei pezzi a parole, con l'impronta delle parole da cui vengono (se cambiano, si rifanno). In
`lavoro/`: `tratti/<impronta>.mkv` (ogni tratto già composto, con l'impronta di tutto ciò da cui dipende: il suo quadro senza `sottotitoli` e `titolo`, che si mettono sul video intero, e il file del pezzo di sagoma che legge),
`scene/` (le scene animate, ognuna con accanto `<sigla>.mp4.impronta`: i tempi e i sorgenti per cui è stata resa), `misure.json` (volume di ogni sorgente),
`teste.json` (per sorgente: gli intervalli di cui si è guardata la testa e la riga più alta vista; si guardano solo gli intervalli nuovi).

`montaggio.json` (i tempi delle fasi e i tratti degli ultimi due montaggi; `monta` ricomincia le fasi, `controlla`
aggiunge le sue se il piano è lo stesso):

    {
      "impronta": "<quella del risolto>", "quando": "2026-03-14T18:20:11",
      "fasi": [ { "nome": "animazioni", "secondi": 12.4, "fatti": 1, "saltati": 5 } ],
      "tratti": ["<impronta>.mkv"], "tratti_prima": ["<impronta>.mkv"],
      "uscite": { "finale": "<impronta del risolto da cui è montato finale.mp4>" }
    }

Le fasi, nell'ordine: `animazioni` (scene), `sagoma` (sorgenti), `tratti` (tratti), `uscita` (il video intero: sempre
fatti 1), poi `ascolto`, `parole` (parole cercate), `trascrizione`, `fotogrammi` (di `controlla`). «Fatti» sono gli elementi rifatti in quel giro, «saltati» quelli già buoni. Se i tratti si compongono
mentre si codifica, `tratti` conta solo il suono e il resto del tempo sta in `uscita`. Ogni fase stampa anche una riga:
`fase <nome>: <secondi> s, fatti <n>, saltati <n>`. Un tratto con la stessa impronta di un altro si compone una volta sola
e conta una volta in «fatti» e «saltati».

`tratti` sono i file di `lavoro/tratti/` del montaggio appena finito, `tratti_prima` quelli del montaggio con un altro
piano che lo precedeva (rimontare lo stesso piano non li cambia). Quando `finale.mp4` è scritto, `monta` toglie da
`lavoro/tratti/` ogni altro file (anche `.parziale` e `.campione.mkv` rimasti) e da `lavoro/scene/` le scene, col loro
`.impronta`, di sigle che il piano non chiede più. Non sa se un altro lavoro sta usando lo stesso video: la coda del server
ne fa uno alla volta; lanciato a mano insieme a un altro, `monta` può togliere ciò che l'altro sta leggendo. La riga
finale è `finale.mp4: <secondi> s, lavoro/ <n> MB`.

## La sagoma

Lo scontorno (`scontorno.py`) segue la persona con SAM2.1 base+ (Apache-2.0) e ne rifà il bordo con ViTMatte-small (`vitmatte-small-composition-1k`, Apache-2.0 sulla sua scheda). Per ogni intervallo: RT-DETR (`persona.py`, Apache-2.0, 20 M di parametri) trova nel primo fotogramma la persona più grande, e il suo riquadro è
la prima indicazione a SAM2 (sopra il viso, trovato da YuNet, il riquadro non sale oltre `sopra_il_viso` altezze del viso: una lampada dietro la testa non diventa un cappello); SAM2 guarda un fotogramma ogni `passo_maschera` e in mezzo la sua maschera si sposta col flusso ottico (DIS,
OpenCV); dalla maschera si ricava la fascia incerta (`raggio_trimap`), e ViTMatte rifà l'alfa a scala ridotta (`scala_matting`) solo
sulle righe vicine a quella fascia; l'alfa si leviga coi fotogrammi vicini portati sul corrente dal flusso
(`peso_vicini`) e si riporta a piena misura; il colore è quello del girato. Lettura, flusso e SAM2 vanno in fili a parte; i fotogrammi già
usati da tutti si tolgono (`fotogrammi_in_memoria`). Le misure stanno in `sagoma.scontorno` dello stile; i modelli si scaricano da Hugging Face al primo uso.

**Sulla scheda NVIDIA** (`motori.sagoma.dove`, o la scheda di `macchina.scheda_video`) SAM2 e ViTMatte girano in mezza precisione, ViTMatte in un grafo CUDA per altezza e SAM2 su una
corsia a parte: su una ripresa 4K dell'iPhone circa 17 fotogrammi al secondo su una scheda NVIDIA di prova, con 1,2 GB di memoria. **Sul processore** gli stessi modelli girano in precisione piena e
senza grafi né corsie: lo stesso risultato, molto più lento. Un pezzo già scontornato non si rifà da sé: per rifarlo (un altro motore, un altro modello) si toglie la
cartella `sagoma` (e `sagoma.json`) dai preparati della sorgente.

**Dove sta la testa** (le viste con `"segui": true`): `monta` la misura nei soli tratti che stanno in una di quelle viste, ognuno allargato di tre volte `segui.morbido` secondi perché la
levigatura ai bordi non senta il vuoto accanto. YuNet (`persona.py`, MIT, 0,2 MB, su OpenCV, senza torch) dà il viso più grande di un fotogramma ogni `1 / segui.misure_al_secondo` secondi
(`segui.soglia_viso`); il suo centro, in frazioni della larghezza, è la misura. In `persona.json` (`docs/ARCHIVIO.md`) `x` ha una misura per passo dall'inizio della ripresa, `null` dove non
è stato misurato o non si vede nessun viso (la camera tiene il posto che aveva), e `misurati` elenca gli intervalli fatti: ciò che c'è già non si rifà. Un `persona.json` senza `misurati` si rifà.

`sagoma_dei_tratti` in `prepara.py` lavora per sorgente, sui soli tratti in sagoma. Ogni tratto vuole un *pezzo* che
parta almeno `sagoma.margine` secondi prima di lui (o dall'inizio della ripresa) e ne contenga la fine: così il modello arriva al
primo fotogramma col bordo già stabile. I tratti non ancora portati da un pezzo, allargati del margine e fusi dove si toccano, si
scontornano in un passaggio solo, coi modelli caricati una volta. Se al primo fotogramma di un intervallo il rilevatore non vede nessuno
(chi parla si sta ancora sedendo davanti al telefono), lo scontorno parte dal primo fotogramma del margine in cui la persona c'è, provato
ogni tre fotogrammi: il pezzo copre comunque il tratto, e il suo `inizio` dice dove comincia il file. Se nel margine non c'è mai nessuno,
l'errore resta. Ogni intervallo è un
file `sagoma/<primo>-<ultimo>.webm` (numeri di fotogramma) che comincia al suo primo fotogramma. Un pezzo già scritto non si tocca,
e con lui non cambiano i tratti che lo leggono: allargare un taglio scontorna solo ciò che manca, anche se si sovrappone a un pezzo
vecchio. Lo scontorno e la codifica VP9 vanno in due fili (`sagoma.codifica.in_coda`), così la velocità è quella del più lento dei due.
`sagoma.json` (`{"pezzi": [{da, a, file, inizio}]}`, `docs/ARCHIVIO.md`) si riscrive a ogni file finito. Chi legge la sagoma (`Compositore.pezzo_sagoma`,
la copertina, `strumenti/sticker.py`) chiede a `sagoma.py` il file e il secondo del file; una sagoma in un `sagoma.webm` intero è letta come un pezzo solo
e, quando serve altro, le si aggiungono pezzi accanto.

## La voce pulita

Con `voce.pulizia.attiva`, la voce di un montaggio (e di un'anteprima) si pulisce dal rumore di fondo dopo i tagli e prima dei
suoni e del limitatore (un video fatto solo di pezzi senza voce non ha niente da pulire, e la pulizia si salta): la voce di tutti i tratti in un wav solo, passata a DeepFilterNet3 (`-D`, allineata) e riportata alla
stessa lunghezza. Tagli, allineamento, livello della voce e `controlla` lavorano sull'audio vero; la voce pulita ha gli stessi
istanti. Si tiene in `lavoro/voce/finale/` (e `voce/anteprima/`) col nome dell'impronta dei tratti e della `pulizia`: rimontare gli
stessi tratti non la rifà.

## Il piano che cambia mentre monta

Prima di ogni fase (`animazioni`, `sagoma`, `tratti`, `uscita`) e dopo la codifica finale, prima che `finale.mp4` prenda il suo
posto, `monta` rilegge dal disco il piano (con la sua `base`) e `stile.json` e ne ricalcola l'impronta, la stessa di
`risolto.impronta` (`impronta_su_disco` in `risolvi.py`: due letture e un hash, senza risolvere). L'impronta è dell'intero piano e delle sole sezioni dello stile che cambiano il montato: quelle di altri lavori (`prova`, `anteprima`, `carosello`, `controllo`, `preparati`, `dettatura`, `ascolta`, `pagina`, `oggetti`, `scarico`; `SEZIONI_FUORI_DAL_MONTATO`) non la toccano, quindi aggiungere o ritoccare una chiave lì non rimonta nessun video. Una sezione nuova conta finché non è classificata, e la prova `test_risolvi.py` fallisce finché qualcuno non lo fa. Se non è più quella da cui è
partito stampa «il piano è cambiato mentre montavo: riparto con quello nuovo» e riparte da `risolvi`; ciò che è già fatto resta.
Al terzo cambio di fila esce con errore. Un `finale.mp4` di un piano superato non prende mai il posto di quello buono, e
`finale.srt` e `capitoli.txt` si scrivono solo con un montaggio che regge. Un piano che nel frattempo non si legge più (JSON a
metà, schema rotto) conta come cambiato: se resta rotto lo dice `risolvi` alla ripartenza.

## La copertina

Il piano la dichiara (`copertina`: `disegno` e, se serve, `istante`, `docs/PIANO.md`) e `monta` la compone dopo la sagoma e prima della codifica: il disegno a tutto fotogramma, la sagoma del primo
fotogramma (o di `istante`) dove sta nel video, il titolo. L'immagine (`uscite/copertina.png`) è il primo fotogramma della stessa codifica che scrive i tratti, con un fotogramma di silenzio davanti al suono:
niente seconda codifica e niente seconda compressione. `con-copertina.mp4` è un secondo nome dello stesso file (un collegamento; una copia, su un disco senza collegamenti fisici), non un'altra codifica. Con la copertina in testa i secondi del
montato sono quelli del piano più un fotogramma: `foto` e `ascolta --video` lo tolgono da soli, e `controlla` salta il primo fotogramma e il suo silenzio (`risolto.copertina` dice che c'è). In un video orizzontale (`copertina.orizzontale` dello stile: misure della sagoma e del titolo, 1920×1080) la sagoma non è quella del primo fotogramma ma quella di un altro girato (`copertina.sagoma` del piano), ritagliata da `aria` pixel sopra la testa, col bordo bianco; il titolo, col carattere, i colori e gli angoli del titolo dello stile, sta a destra, un cartello per riga (`copertina.righe`), attaccato al margine destro. Un piano senza `copertina` non ne ha:
`controlla` lo dice (`copertina: manca`). `python -m motore copertina` rifà solo l'immagine, in un attimo, per guardarla prima di montare.

## Il formato e lo spazio

Un video ha un formato solo, quello dei quadri delle sue scene (`verticale` 1080×1920, `orizzontale` 1920×1080); `valida` e `risolvi` rifiutano scene di formati diversi. Il risolto lo porta in `formato` (`largo`, `alto`, `fps`, `nome`). La copia leggera è 720×1280 in verticale, 1280×720 in orizzontale.

`monta` compone ogni tratto in un file (`lavoro/tratti/<impronta>.mkv`), più tratti insieme (uno ogni `parallelismo.processori_per_lavoro` processori), e li legge uno dopo l'altro: niente copia unita. Un tratto si scrive a parte e prende il suo nome solo a lavoro finito: un montaggio interrotto non lascia tratti a metà che sembrano buoni. Prima codifica i primi secondi di tre tratti sparsi nel video e ne ricava lo spazio che tutti i tratti prenderebbero; se supera `uscita.tratti_massimo_mb` (3 GB) non li scrive: prepara solo il suono di ogni tratto (`.wav`, 0,19 MB al secondo) e compone i fotogrammi mentre li codifica, con lo stesso risultato. Così una diretta di 72 minuti non riempie il disco.

`finale.mp4`, `finale.srt`, `capitoli.txt`, `leggero.mp4` e `copertina.png`/`con-copertina.mp4` si scrivono in un file nascosto accanto e si rinominano alla fine. Così ogni JSON che il motore scrive (`risolto.json`, `livelli.json`, `parole.json`, …): chi lo legge non lo trova mai a metà.

## Il controllo

`lavoro/controllo.json`, scritto da `controlla`:

    {
      "quando": "2026-03-09T18:20:11", "del_finale": "<mtime del finale controllato>",
      "durata": 60.2,
      "silenzi": [ { "a": 12.3, "dura": 0.41 } ],                      oltre la pausa dello stile
      "esitazioni": [ { "a": 31.9, "dura": 1.1, "fra": ["oggi", "tenta"], "numero": false } ],   vuoti fra due parole oltre la pausa, anche pieni di suono;
                                                                       `numero`: una delle due è un numero o una sigla, che l'allineamento non sa
                                                                       quanto dura detta a voce: si riascolta prima di tagliare
      "senza_parole": [ { "a": 58.4, "dura": 1.8 } ],                  girato prima della prima parola e dopo l'ultima: zero
      "colpi": [ { "tratto": 20, "a": 55.3, "dopo": "7%" } ],          colpi di tasto dopo l'ultima parola di un tratto: zero
      "parole_fuori_posto": [ { "parola", "attesa": [da, a], "trovata": [da, a], "voto": 0.4 } ],   ogni parola ritrovata sul suono: non si ritrova (voto sotto `controllo.voto_minimo`) o, nei pezzi a parole, sta oltre `tolleranza` dal suo posto
      "sentito": "ciò che la trascrizione sente nel montato",
      "differenze": [ { "a": 31.2, "voluto": "…", "sentito": "…" } ],
      "doppioni": [ { "a": 12.0, "parole": "poi poi" } ],              ripetizioni di fila che il voluto non ha: zero
      "parole_lunghe": [ { "a": 9.3, "parola": "migliorare", "dura": 4.58, "sentito": "…" } ],   parole oltre `preparati.parola_lunga`: zero
      "sottotitoli": [ { "a": 40.2, "voluto": "?", "scritto": "" } ],   contro il testo fissato: zero; null senza testo fissato
      "tagli_nel_parlato": [ { "a": 8.1, "db": -31 } ],
      "lampi": [ { "a": 69.27, "salto": 89.7 } ],                      fotogrammi isolati: devono essere zero
      "bordi": [ { "tratto": 12, "lato": "coda", "a": 31.2, "cosa": "muto", "dura": 0.62 },
                 { "tratto": 14, "lato": "testa", "a": 40.1, "cosa": "rumore", "dura": 0.4 },
                 { "tratto": 20, "lato": "coda", "a": 55.0, "cosa": "voce", "db": -18.0 } ],  devono essere zero
      "zona_alta": [ { "a": 90.2, "dura": 5.8, "cosa": "ferma" }, { "a": 6.9, "dura": 6.7, "cosa": "vuota" } ],   zero
      "copertina": [ { "cosa": "manca" } ],                            `manca`: il piano non la dichiara; o "vecchia", o { "cosa": "vuota", "occupata": 0.1 }: vuoto
      "spente": ["allineamento", "trascrizione"]                       funzioni spente nel profilo: i controlli che ne vivono (parole fuori posto; sentito, differenze,
                                                                       doppioni, parole lunghe) non sono stati fatti e restano vuoti
    }

`controlla` si ferma se il montato non è del risolto di adesso (`uscite.finale` di `montaggio.json`; se `montaggio.json` non c'è,
una durata diversa da quella del risolto oltre `controllo.scarto_montato` secondi): confrontato
con un risolto più nuovo darebbe quasi ogni parola fuori posto. Si rimonta, poi si controlla.
Lo stesso confronto lo fa il server per l'avviso «piano cambiato dopo il montato» dello studio (`piano_dopo_montato`, `docs/API.md`): l'impronta di `uscite.finale` contro quella del `risolto.json` di adesso.

L'allineamento del montato si fa a finestre di `controllo.finestra` secondi: un video di qualche minuto non
sta intero nella scheda video. `esitazioni` conta i vuoti che il taglio non ha tolto: dentro un pezzo a
parole un vuoto oltre `taglio.a_parole.pausa` fra due parole trovate bene (voto da `voto_esitazione` in su)
si taglia anche se suona, perché la trascrizione non scrive gli «ehm». `lampi` sono i fotogrammi diversi sia
da quello prima sia da quello dopo (oltre `controllo.lampo.salto`, su 255) mentre quei due si somigliano: un
tratto che parte o finisce senza lo schermo o il viso. `bordi` sono i lati dei tratti che non vanno (`controllo.bordi`):
`muto`, silenzio dal bordo verso l'interno oltre `muto` secondi (il silenzio in fondo al video lo decide `coda` del piano e non
conta); `rumore`, suono oltre `rumore` secondi fra il bordo e la parola sicura più vicina (voto da `taglio.a_parole.voto_bordo`,
non cifre né sigle; i pezzi a tempo non hanno parole sicure); `voce`, un taglio che `risolvi` ha fatto dentro la voce a un
livello da `voce_db` in su. Un bordo con una parola incerta lo cerca `risolvi` sul suono: `taglio.a_parole.voto_bordo`, `cerca_incerta`
(quanto lontano dall'allineamento cercare la voce), `silenzio_bordo` (il vuoto che chiude la voce), `rumore_db` (quanto più
piano del resto è un fruscio staccato), `voce_tagliata` (quanta voce oltre una `rifila` fa dare l'avviso).

`senza_parole` è il girato tenuto senza nessuna parola in testa al video (prima della prima) e in coda (dopo l'ultima, anche se il piano
chiede una `coda`), oltre la pausa di `silenzi`; i vuoti fra due parole, anche quando sono un tratto intero, li conta `esitazioni`.
`colpi` cerca, da dove comincia l'ultima parola di ogni tratto fino al bordo, un attacco secco (`controllo.colpi`, sul livello a passi di
`passo` secondi): sopra il silenzio dei `prima` secondi prima di almeno `salto_db`, non più piano della voce del video di oltre
`sotto_voce_db`, e tornato sotto di altrettanto da `durata` a `durata` + `prima` secondi dopo, tutto dentro il tratto. Lo scoppio di una
consonante dentro la parola («otto») è seguito dalla voce e non conta; quello finale di una parola che chiude su una consonante («bit»)
sì, e si riascolta. `sentito` è il montato riascoltato con la trascrizione, a tratti di fila della stessa lingua: ogni tratto nella lingua
del suo girato (`lingua` nella scheda del file nel grezzo, se no quella dello stile), così un keynote in inglese non sembra perso;
`differenze` confronta, dentro ogni lingua, le parole del risolto con quelle sentite. `doppioni` sono le parole o le coppie di parole
ripetute di fila in `sentito` che le parole del risolto non ripetono. `parole_lunghe` sono le parole del risolto più lunghe di
`preparati.parola_lunga` secondi, con ciò che la trascrizione sente nella loro sola finestra: di solito una falsa partenza fusa con la
frase ridetta, che il montato riascoltato intero fonde di nuovo e che né `differenze` né `doppioni` vedono.
`sottotitoli` confronta le battute del risolto con la colonna «battuta» di `materiali/testo-registrato.md` (le righe che cominciano con un
numero; le maiuscole e le cuciture `|` non contano): parole diverse, mancanti o in più, e i «?» o «!» persi. Il resto della punteggiatura
non si confronta: i sottotitoli in minuscolo la tolgono. `a` è il secondo del cartello.

`zona_alta` guarda il montato largo `controllo.zona_alta.lato` pixel, in grigio, un fotogramma alla volta, nelle scene coi quadri di
`zona_alta.quadri`: la zona è la `fascia_animazione` del quadro o, se non ne ha, il suo `girato` (lo schermo sopra la sagoma). `ferma`:
fra un fotogramma e quello `distanza` secondi prima meno di `mosso` dei pixel cambia di oltre `soglia` (su 255), per più di `secondi`, anche
fra due scene. `vuota`: la zona divisa in una `griglia` (colonne, righe) ha meno di `occupata` delle celle con qualcosa sopra (più di `piena`
dei pixel lontani di oltre `soglia` dal colore di fondo), per più di `secondi`: un colore solo, o una scritta piccola in mezzo; un disegno a
tratto sottile che attraversa la zona la occupa. `copertina`: `uscite/con-copertina.mp4` che manca, più vecchio di `finale.mp4`, o col
primo fotogramma vuoto nello stesso senso (nella zona del quadro della prima scena, o tutto il fotogramma se quel quadro non ha zona).

## Le animazioni

Il motore chiede le animazioni ad `animazioni/` con un file di tempi e un comando:

    bun run --cwd animazioni registra -- --tempi <lavoro>/tempi.json --uscita <lavoro>/scene

`tempi.json`: `{ sigla: { "durata": secondi, "ancore": [[secondo del video nella scena, secondo della scena]], "tempi": { nome: secondo }, "formato": { "largo": 1080, "alto": 1920 }, "fascia": [x0, y0, x1, y1] } }`. `fascia` è la fascia utile (`fascia_animazione`) del quadro della scena nel piano, se ce l'ha: `Campo` e i controlli la leggono da lì invece che da quella di serie. `formato` è la misura in pixel del fotogramma da rendere (1920×1080 per i quadri orizzontali): `animazioni/` rende ogni scena nel formato del suo video (`formato` in `scene.tsx`) ed esce con 1 se il montaggio ne chiede un altro.
Esce un `<sigla>.mp4` per scena, grande quanto `formato` e a 30 fotogrammi, lungo `durata`; una scena `trasparente` esce anche con `<sigla>.alfa.mkv`, la sua maschera in grigi (bianco dove disegna, nero dove è vuota), e il motore la usa per lasciare visibili gli strati sotto. `tempi` arriva alla scena come
proprietà: è il secondo in cui viene detta ogni parola dichiarata nel piano (`parole` della scena).
Il comando gira da `animazioni/` con `MANGO_ANIMATION_LAVORO` dell'archivio (le scene e lo stile del creator): i percorsi vanno assoluti. Per una scena che scorre al passo del video (`parole`
nel piano) `durata` è quanto dura il suo tratto e i `tempi` mancanti restano quelli di partenza della scena; per le
altre contano le `ancore`. Una scena già resa con gli stessi tempi e gli stessi sorgenti non si rifà (accanto al
file, `<sigla>.mp4.impronta`): i sorgenti sono il file della scena (`<sigla>.tsx` nella cartella del suo video, se c'è,
altrimenti `scene.tsx`; nel prodotto `src/scene/<slug>/`, per il creator `<lavoro>/animazioni/scene/<slug>/`) con ciò che importa a catena, la pagina comune e lo stile unito (solo le parti che la pagina legge); se non si riesce a seguire un
import (`import()`, `import.meta.glob`, un file che non si trova) l'impronta copre l'intera cartella del video e
`registra` lo dice. Una sigla che `animazioni/` non conosce o una pagina che dà errore fanno uscire con 1
e una frase in italiano su stderr; l'avanzamento è una riga per scena su stdout e l'ultima riga è
`animazioni: rese N, già rese M`. Se tutte le scene sono già rese non costruisce la pagina né apre il browser.

    bun run --cwd animazioni elenco     # {"<slug del video>": [{"sigla", "titolo", "durata"}]}, per `GET /api/animazioni`

Il motore chiede sempre tutte le scene del video, coi loro tempi, e si fida di `registra` per sapere quali rifare; ripete
le sue righe `animazioni:` nell'avanzamento. `registra` riscrive il file di una scena sul posto: se un file di `lavoro/scene/` è collegato a quello di un altro video (un collegamento fisico), il
motore lo trasforma prima in una copia, così rifare la scena in un video non la cambia nell'altro.

## Le pagine vere

Nei video di notizia le pagine vere (un comunicato, un articolo) vanno a schermo sopra la testa del creator e la telecamera ci cerchia le
frasi (`.claude/metodo/montaggio.md`). `pagina` le prende col Chrome installato sul computer (Playwright, `strumenti/pagina.mjs`), in formato
telefono: `pagina.larghezza` px CSS a densità `pagina.densita` (432 × 2,5 = 1080 px). Le scrive in `materiali/` e non in `lavoro/`
perché una pagina cambia o sparisce: una cattura non si rifà uguale. L'elenco sta in `materiali/pagine.json`
(`motore/schemi/pagine.schema.json`), una voce per pagina:

    { "comunicato": { "url": "https://esempio.it/comunicato",
                  "intera": true,
                  "frasi": { "data": "12 marzo 2026", "titolo": ["Il titolo del comunicato", 2] },
                  "ritagli": { "testa": [0, 120, 1080, 880], "pagina": "tutta" } } }

- `intera`: tutta la pagina. Senza, la cattura va almeno fino in fondo alla finestra (`pagina.finestra` px CSS) e sotto l'ultima
  frase per `pagina.sotto_le_frasi` px: la pagina dev'essere abbastanza lunga perché la telecamera porti la frase nella metà alta.
- `frasi`: il testo esatto (maiuscole e spazi non contano), oppure `[testo, n]` per l'n-esima volta che compare fra il testo che si
  vede (un titolo torna anche nell'indice in cima). Il testo nascosto non conta: su Wikipedia da telefono l'indice e le sezioni chiuse.
- `ritagli`: `[x, y, largo, alto]` in px della cattura, oppure `"tutta"`; diventano `ritagli/<pagina>-<nome>.jpg`.
- `filmato`: `[da, a]`, secondi del tempo della pagina, per una pagina che si muove (un sito animato, una demo). La pagina si apre grande
  quanto lo schermo del telefono (`pagina.larghezza` per l'altezza che dà le proporzioni del formato `verticale`, a densità `pagina.densita`) con
  un orologio finto (`strumenti/orologio.mjs`): `Date`, `performance.now`, `requestAnimationFrame`, i timer e le animazioni CSS vanno
  avanti solo un trentesimo alla volta, quindi il filmato scorre liscio anche se un fotogramma costa più di un trentesimo a disegnarlo.
  A `da` si prende `screen-<nome>.png` (con le frasi), poi un fotogramma ogni `1/fps` fino ad `a` in `filmato-<nome>.webm` (VP9, senza
  suono: il browser che registra le scene non legge l'H.264); la provenienza dice anche l'intervallo. Non va con `intera`. Una scena lo
  mostra con `Filmato` (`animazioni/LEGGIMI.md`).

Per ogni pagina scrive `screen-<nome>.png`; `screen-<nome>.json`, `{ "larghezza", "altezza", "frasi": { chiave: [x, y, largo, alto] } }`
in px dell'immagine; `screen-<nome>.txt`, la provenienza: URL, stato HTTP e titolo, quando è stata presa. Ogni ritaglio ha accanto il
suo `.json` nella stessa forma, con le sole frasi che stanno tutte dentro, nelle coordinate del ritaglio: la scena le importa da lì,
senza numeri a mano. Una frase che non si trova resta fuori dal JSON e si dice; si dice anche una frase fuori dall'immagine (un testo
nascosto: si sceglie un'altra occorrenza) e una che ha sotto meno di `sotto_le_frasi` px di pagina. Un ritaglio che esce dalla cattura
ferma il comando.

Un controllo anti-bot («Checking your browser…») si aspetta fino a 40 s; se non si scioglie la pagina non è presa e i suoi file
precedenti restano com'erano. Il comando esce con 1 se una pagina non è stata presa, dopo aver rifatto i ritagli di quelle che ci sono. Un
sito che blocca il browser senza finestra si prende con `--visibile`; alcuni non si lasciano prendere nemmeno
così. Una foto del computer si prende allo stesso modo, con `file:///…` in `url`.

## Il carosello

Un carosello (`formato: "carosello"` nella scheda) non ha piano: le slide si scrivono a mano in `materiali/carosello.html`, una
`<section class="slide">` ciascuna, grande `carosello.largo` × `carosello.alto`, con i percorsi delle immagini relativi alla pagina
(gli sticker di `archivio/sticker/`, i caratteri di `font/`).

**La base.** `carosello <slug> --nuovo` scrive la pagina da cui partire, solo se non c'è (se c'è, dice che c'è già e non tocca niente):
il sistema di serie del carosello (fondo scuro, carattere `font/Archivo-700.ttf`, numero «n/N», titolo in maiuscolo, testo, zone libere
per la didascalia e per i bottoni di TikTok) e tre slide d'esempio da sostituire: l'apertura (con il primo sticker di
`archivio/sticker/`, se ce n'è uno), un disegno a barre, la chiusa con la domanda. Colori e misure della pagina sono variabili CSS in
testa (`:root`) scritte da `carosello.colori` e `carosello.base` di `stile.json`; il modello è `motore/carosello-base.html`. La base
resa non ha avvisi.

**La resa.** `carosello` apre la pagina col Chrome installato sul computer (`strumenti/carosello.mjs`) e scrive `uscite/slide-<n>.png`,
dalla 1, togliendo quelle vecchie oltre l'ultima. Per ogni slide dice, senza fermarsi:

| avviso | quando | misura (`stile.json`, `carosello`) |
|---|---|---|
| lato sinistro, lato destro | testo nei lati: a sinistra `telefono.margine_lati`, a destra `destra` px | `destra` |
| didascalia | testo nella zona in basso | `didascalia` px dal fondo |
| immagine, carattere | un'immagine o un carattere dichiarato che non si carica | |
| piccolo | testo sotto `testo_minimo` px sullo schermo (la dimensione vera: in un disegno rimpicciolito conta la scala) | `testo_minimo` |
| tagliato | testo che esce da un contenitore con `overflow` nascosto, da un disegno o dalla slide; si perdona `taglio_tolleranza` volte il corpo del carattere (la riga di un testo è più alta dell'inchiostro) | `taglio_tolleranza` |
| accavallato | due testi diversi i cui riquadri si sovrappongono per più di `accavallamento` del più piccolo; le righe di un titolo stretto non contano | `accavallamento` |
| vuota | meno di `pieno_minimo` della slide ha un colore diverso (oltre `differenza_colore` su 255) da quello che ne occupa di più: quasi vuota, o di un solo colore | `pieno_minimo`, `differenza_colore` |

Le immagini possono scendere nella didascalia (lo sticker del creator). Si ferma se una slide non è grande quanto deve o se non ce n'è
nessuna. Le soglie di serie sono in `carosello` di `stile.json`: testo più piccolo di `testo_minimo` (24 px), slide con meno di `pieno_minimo` (4%) di punti diversi
dallo sfondo, testo che sfora il suo disegno di più di `taglio_tolleranza` (0,2 volte il corpo), righe i cui riquadri si sovrappongono per più di
`accavallamento` (25% del più piccolo).

## La lingua delle frasi

Il motore scrive le sue frasi nelle due lingue dove nascono. `MANGO_ANIMATION_LINGUA=en` (la coda la mette in base a chi ha chiesto il lavoro; `it` o niente: italiano)
sceglie quale arriva al terminale.

- **Gli errori** sono `Errore(italiano, inglese)`: tutte e due le frasi sono obbligatorie, con gli stessi valori, e `str(errore)` dà quella della lingua in uso
  (`errore.it` e `errore.en` le danno entrambe). Una prova (`prove/test_lingua.py`) legge il sorgente e rifiuta un `Errore` con una lingua sola.
- **Gli elenchi di problemi e di avvisi** (`valida`, gli avvisi del taglio) sono `Frase(italiano, inglese)`: una stringa italiana che porta l'inglese in `.en`.
- **I file scritti per tutti** portano entrambe: ogni avviso di `risolto.json` è `{ tratto, cosa, cosa_en }`. `controllo.json` ha solo codici e numeri.
- **Le righe di avanzamento** (`avanza`, `print`: quelle che lo studio mostra nel pannello dei lavori) e gli avvisi delle slide del carosello passano da `dice(italiano, inglese)` ed escono nella lingua in uso; una prova (`prove/test_lingua.py`) legge il sorgente e rifiuta una riga scritta a mano senza `dice`.
  Restano come arrivano l'uscita di ffmpeg e yt-dlp, le righe `animazioni:` che passano dal render in `animazioni/`, e le frasi del processo `detta`: non sono tradotte.

## La dettatura

`python -m motore detta` è il motore della dettatura dell'app (`docs/APP.md`): non è un lavoro che finisce, ma un processo che l'app accende alla
prima dettatura e tiene acceso. Carica il modello (faster-whisper) e poi aspetta la voce a righe JSON. Non legge la cartella di lavoro. Su
stdout scrive solo il protocollo (ciò che le librerie stampano va su stderr, che l'app tiene in un log).

**Dove gira.** Sulla scheda NVIDIA se c'è (quella di `macchina.scheda_video`, se il profilo la indica), altrimenti sul processore (`dispositivo_voce`; `scheda_video: null` lo forza); il modello e il
calcolo sono di `dettatura.dispositivi.cuda` o `.cpu` in `stile.json`, e per il calcolo vale il primo della lista che il dispositivo sa fare
(una scheda senza `float16`, come le Pascal (GTX 10xx), passa a `float32`). La scelta si legge nell'evento `pronto`; non c'è un ripiego silenzioso:
una scheda senza memoria libera, o a cui manca una libreria di CUDA (`docs/MOTORI.md`), è un errore, che dice di liberarla o di mettere `null` in `macchina.scheda_video`. Sulla scheda `carica` trascrive mezzo secondo di silenzio prima di dire `pronto`, così l'errore compare al caricamento e non alla prima frase. Il processo riceve la cartella dei dati (`MANGO_ANIMATION_LAVORO`) dall'app, da cui legge lo stile e il profilo.

**Il protocollo.** Una riga JSON per messaggio.

| da | messaggio | significato |
|---|---|---|
| app | `{"tipo":"nuova","id":N}` | comincia una dettatura (l'`id` lo sceglie l'app); ciò che restava della precedente si scarta |
| app | `{"tipo":"audio","id":N,"pcm":"…"}` | un pezzo d'audio: PCM a 16 bit little-endian, 16 kHz, mono, in base64 |
| app | `{"tipo":"fine","id":N}` | la dettatura è finita: la frase in corso si chiude subito |
| motore | `{"tipo":"pronto","dispositivo":"cuda","modello":"…","calcolo":"…"}` | una volta, a modello caricato; l'app non manda niente prima |
| motore | `{"tipo":"ascolto","id":N}` | risposta a `nuova` |
| motore | `{"tipo":"parziale","id":N,"testo":"…"}` | la frase in corso, tutta, dall'inizio; cresce e si corregge |
| motore | `{"tipo":"definitiva","id":N,"testo":"…"}` | la frase finita |
| motore | `{"tipo":"chiusa","id":N}` | risposta a `fine`, sempre dopo l'ultima `definitiva` |
| motore | `{"tipo":"errore","messaggio":"…","fatale":true}` | `fatale`: il motore esce subito dopo (modello che non si carica, pacchetto o memoria che mancano) |

**Le frasi** (`Frasi` in `detta.py`). Prima della voce si tiene solo `prima` secondi d'audio, per non perdere l'attacco; la voce la
riconosce il VAD (Silero, quello di `prepara`) con le soglie di `dettatura.vad`. Da lì la frase in corso si ritrascrive ogni `ogni_parziale`
secondi di audio nuovo (`parziale`, `fasci_parziale` fasci, sul tratto fino all'ultima voce più `vad.margine`). Il silenzio si guarda solo
sulla coda dell'audio, lunga `silenzio_fine` + `vad.guardia`: dopo `silenzio_fine` secondi senza voce la frase si trascrive una volta con
`fasci_definitiva` fasci (`definitiva`) e si riparte. Una frase che arriva a `massimo_frase` secondi si chiude nell'ultima pausa lunga almeno
`vad.pausa_interna` (o dove è arrivata, se non ne ha), e ciò che segue è l'inizio della prossima. Alla `fine` la frase in corso si chiude
subito, senza aspettare il silenzio. L'audio che arriva mentre si trascrive aspetta (un thread lo legge): al giro dopo si prende tutto.

