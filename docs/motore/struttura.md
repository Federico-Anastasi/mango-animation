# Il motore: com'è fatto

Si lancia dalla radice del codice. L'archivio è `archivio/` nella cartella di lavoro, quella di `MANGO_ANIMATION_LAVORO` (`docs/ARCHITETTURA.md`); senza la variabile ogni comando esce con 1 e lo dice. Ogni comando scrive
l'avanzamento su stdout, una riga per passo, ed esce con 0 se è riuscito, 1 con una frase in italiano su
stderr se no (cosa manca e come si rimedia). Ciò che è già fatto con gli stessi ingredienti non si rifà. Le barre di avanzamento e gli avvisi delle librerie dei modelli e dell'immagine non escono: `motore/__init__.py` li spegne alla fonte, con le loro variabili d'ambiente, prima che le librerie si importino. I modelli (trascrizione, allineamento, scontorno)
girano sulla scheda di `macchina.scheda_video` del profilo del creator (l'indice di `nvidia-smi`; `docs/ARCHITETTURA.md`, «Il profilo»);
senza profilo, sulla scheda NVIDIA che c'è; senza scheda, o con `scheda_video: null`, sul processore, più lenti, e il motore lo dice su stderr.
Una scheda indicata che non c'è è un errore, non un ripiego. Ogni funzione può avere il suo posto e il suo interruttore in `motori` del profilo
(trascrizione, allineamento, sagoma, segui, voce pulita, dettatura: `docs/MOTORI.md`, §4): `dove` sceglie scheda o processore per quella funzione, `attiva: false` la spegne. Il motore numera le schede come `nvidia-smi` (`CUDA_DEVICE_ORDER=PCI_BUS_ID`, lo stesso ordine di `animazioni/`) e rende visibile al processo solo quella del profilo
(`CUDA_VISIBLE_DEVICES`), che per i modelli è la 0; un `CUDA_VISIBLE_DEVICES` già presente nell'ambiente di chi lancia il motore non conta: la scheda la decide il profilo. Senza `scheda_video` nel profilo quell'elenco resta com'è. Una scheda senza il
calcolo `float16` non regge la trascrizione: non va indicata.

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
`prova` (il video per registrare: quadro di partenza, caratteri al secondo e pausa fra le frasi per stimare i tempi, colori della parola detta, in corso e da dire e della traduzione di uno spezzone, il cartello delle frasi senza scena, `copione`: le misure della pagina da leggere sul telefono, la codifica); `uscita` (codifica; `anteprima`: la codifica veloce dell'anteprima; `leggero` e `leggero_orizzontale`; `tratti_massimo_mb` e `campione`: quanto spazio concedere ai tratti prima di montare in un passaggio solo); `sagoma` (come si misura la testa; `margine`: quanto prima e dopo ogni tratto parte lo scontorno; `scontorno`: le misure dello scontorno (`docs/motore/sagoma.md`, «La sagoma»); `codifica`: come si scrive il VP9 con alfa dei pezzi, `deadline`, `cpu_used`, `crf`, e `in_coda`, quanti fotogrammi scontornati aspettano l'encoder); `segui` (come si misura e si segue la persona in una vista); `zoom`; `evidenzia` (colore e spessore del riquadro attorno a una zona); `immagine` (per le sorgenti a immagine continua: oltre quale `salto` l'immagine stacca, il `minimo` che resta a schermo e il `passo_massimo`, il tetto alla velocità a cui corre fino al tratto dopo); `preparati` (copie leggere, trascrizione, i suoi `tratti_di_voce` e `parola_lunga`);
`controllo` (soglie di `controlla`); `quadri` (gli strati, `docs/PIANO.md`); `pagina` (le pagine vere: `larghezza` e `densita` del telefono, `finestra`, l'altezza minima in px CSS, `sotto_le_frasi`, i px della cattura che restano sotto ogni frase, `qualita` dei ritagli); `carosello` (`largo` e `alto` di una slide, `destra`, i px a destra dove stanno i bottoni di TikTok, `didascalia`, i px in basso dove sta la didascalia); `dettatura` (`docs/motore/dettatura.md`, «La dettatura»); `parallelismo` (`processori_per_lavoro`: quanti processori ha ogni lavoro tenuto in parallelo, 4 di serie, per il motore e per `animazioni/`); `sticker` (le misure dello sticker del creator: `bordo` in pixel, `altezza_busto` e `lati` in frazioni della larghezza, `per_ripresa` provini). Un valore che serve e non c'è
si aggiunge lì, con un nome che dice cosa è.

## La lingua delle frasi

Il motore scrive le sue frasi nelle due lingue dove nascono. `MANGO_ANIMATION_LINGUA=en` (la coda la mette in base a chi ha chiesto il lavoro; `it` o niente: italiano)
sceglie quale arriva al terminale.

- **Gli errori** sono `Errore(italiano, inglese)`: tutte e due le frasi sono obbligatorie, con gli stessi valori, e `str(errore)` dà quella della lingua in uso
  (`errore.it` e `errore.en` le danno entrambe). Una prova (`prove/test_lingua.py`) legge il sorgente e rifiuta un `Errore` con una lingua sola.
- **Gli elenchi di problemi e di avvisi** (`valida`, gli avvisi del taglio) sono `Frase(italiano, inglese)`: una stringa italiana che porta l'inglese in `.en`.
- **I file scritti per tutti** portano entrambe: ogni avviso di `risolto.json` è `{ tratto, cosa, cosa_en }`. `controllo.json` ha solo codici e numeri.
- **Le righe di avanzamento** (`avanza`, `print`: quelle che lo studio mostra nel pannello dei lavori) e gli avvisi delle slide del carosello passano da `dice(italiano, inglese)` ed escono nella lingua in uso; una prova (`prove/test_lingua.py`) legge il sorgente e rifiuta una riga scritta a mano senza `dice`.
  Gli script di `animazioni/script/` e gli strumenti di `strumenti/*.mjs` leggono la stessa variabile e scrivono righe ed errori con `dice(italiano, inglese)` (`animazioni/script/lingua.ts`, `strumenti/lingua.mjs`); prove: `animazioni/test/lingua.test.ts` e `prove/test_lingua.py`. Il motore riconosce le righe del render in tutte e due le lingue.
  Restano come arrivano l'uscita di ffmpeg e yt-dlp (riportata dentro una frase nelle due lingue) e le frasi del processo `detta`: non sono tradotte.
