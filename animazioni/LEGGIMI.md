# Animazioni

Le scene animate dei video e gli elementi standard con cui si fanno. Una scena è una funzione del tempo: la
pagina la disegna a ogni istante, Playwright ne fa uno screenshot per fotogramma e ffmpeg li unisce in un mp4
(30 fotogrammi al secondo; 1080×1920, oppure 1920×1080 per un video che si dichiara orizzontale). Formati, colori, fascia utile e titolo vengono dallo stile unito (`../stile.json` di serie con sopra quello del creator, sotto); il
motore chiede le scene con `registra` (`../docs/MOTORE.md`, «Le animazioni»). Le scene sono quelle del prodotto (`src/scene/`: la sigla, le dimostrazioni degli
elementi standard e tre scene d'esempio) e quelle del creator, che stanno nella sua cartella dei dati (sotto, «Le scene del creator»).

## Comandi

Da `animazioni/` (o con `bun run --cwd animazioni …` dalla radice del repo).

| comando | cosa fa |
|---|---|
| `bun install` | le dipendenze |
| `bun run dev` | sfoglia le scene nel browser, per video: `?animazione=<sigla>`, spazio avvia e ferma, ← → di mezzo secondo, Inizio e Fine |
| `bun run build` | typecheck e pagina costruita in `dist/` |
| `bun run registra -- --tempi <tempi.json> --uscita <cartella>` | una `<sigla>.mp4` per ogni scena del file di tempi, nella cartella |
| `bun run registra -- [--uscita <cartella>] [sigla …]` | le scene date (senza sigle: tutte) coi loro tempi propri; senza `--uscita`, in `video/` |
| `bun run foto -- [sigla …]` | i fotogrammi chiave in `foto/<sigla>-<t>s.png`, più `<sigla>-riquadri.png` con dove entrano testa e sottotitoli |
| `bun run mappa -- <slug> […]` | `mappe/mappa-<slug>.png`: la mappa da tenere davanti mentre si registra |
| `bun run elenco` | su stdout, `{ "<slug>": [{ "sigla", "titolo", "durata" }] }`: lo legge il server per `/api/animazioni` |
| `bun test` | le prove: ancore, registro delle scene, impronta, scene del creator |

`registra` stampa una riga per scena ed esce con 1 e una frase in italiano se una scena non esiste, un file di
tempi è sbagliato, il montaggio chiede una scena in un formato diverso da quello del suo video, o la pagina dà errore. Costruisce da sé la pagina se un sorgente è più nuovo di `dist/`, una volta sola anche con più processi insieme (blocco `dist.lock`, costruzione in `dist.nuova/` e scambio). Rende più scene insieme, una ogni `parallelismo.processori_per_lavoro` processori dello stile (4 di serie), ognuna nella sua pagina e col suo ffmpeg. Il browser disegna sulla scheda video (Direct3D), dieci volte più in fretta che sul processore: quella di `macchina.scheda_video` del profilo del creator (l'indice di `nvidia-smi`; `docs/ARCHITETTURA.md`, «Il profilo»), senza profilo la prima scheda NVIDIA che c'è, e la riga `animazioni: disegno su …` dice quale. Con `scheda_video: null`, o senza schede NVIDIA, disegna sul processore e lo dice. `ANIMAZIONI_SCHEDA=<un pezzo del nome>` nell'ambiente (`registra`, `foto`; ad esempio `1660`) ne sceglie un'altra per quella volta, oppure `ANIMAZIONI_SCHEDA=processore` (o `ANIMAZIONI_PROCESSORE=1`). Se la scheda voluta non si trova, la resa si ferma: non ripiega su un'altra. Se sta già lavorando, lo avvisa e va avanti.

**Non rifà una scena già resa**: accanto a `<sigla>.mp4` scrive `<sigla>.mp4.impronta`, un hash dei tempi che il
montaggio le ha dato e dei sorgenti da cui viene: il file della scena (`<sigla>.tsx` nella cartella del suo video, se
c'è; altrimenti `scene.tsx`) con tutto ciò che importa a catena, la pagina comune (`src/` fuori da `scene/`; per una scena del creator anche i file del prodotto che importa con `@animazioni/…`),
lo stile unito (solo le parti che la pagina legge, `PARTI_DELLO_STILE` in `script/impronta.ts`: formati, colori, caratteri, titolo, telefono e i quadri che un sorgente nomina, senza i loro sottotitoli; cambiare la voce, l'uscita, la sagoma, i sottotitoli o un quadro che nessuna scena nomina, nel file del prodotto come in quello del creator, non rifà nessuna scena) e gli script di resa. Stessi tempi e stessi sorgenti, il file resta; cambia una cosa, si rifà: un file di
un'altra scena, anche dello stesso video, non conta. Se un file della scena usa `import()` o `import.meta.glob`, o
importa qualcosa che non si trova, l'impronta copre l'intera cartella del video e `registra` lo scrive. Se tutte le
scene sono già rese, `registra` non costruisce la pagina né apre il browser; l'ultima riga è
`animazioni: rese N, già rese M`. Una scena che vive in `scene.tsx` insieme ad altre si rifà quando cambia una di
loro: per rifarsi da sola ha il suo file `<sigla>.tsx`.

**`foto` esce con 1** se, in un fotogramma chiave, un testo è sotto i 40 px, un testo o un disegno esce dalla
fascia della scena, un testo esce dal suo riquadro html (su un testo svg la misura non vale), o **lo sfondo resta fermo**: due fotogrammi a un secondo di
distanza identici, prima dell'ultimo secondo (la segnalazione dice sigla e istanti; non per una scena trasparente). In un video orizzontale la fascia
è tutto il fotogramma e la foto coi riquadri non si fa.

## Dove sta cosa

    animazioni/
      src/
        impianto.ts          i tipi Scena, Video, ScenaProps; curve, tra, decimali
        registro.ts          costruisce il registro dai moduli delle cartelle in scene/
        catalogo.ts          i moduli trovati da Vite (import.meta.glob), per la pagina: quelli del prodotto e quelli del creator
        virtuale.d.ts        il modulo `virtual:stile`, lo stile unito
        Animazioni.tsx       la pagina: palco, tempo, tasti, e window.animazione per chi registra
        Mappa.tsx            la mappa per registrare
        standard/            gli elementi standard
        scene/<slug>/        un video: scene.tsx (le scene) e dati.ts (i numeri, con fonte e data)
        scene/esempio-*/     tre video d'esempio: scene con le ancore, al passo del video (anche trasparente), orizzontale
        scene/sigla/         la sigla «mango animation», uguale in tutti i film animati: scena `sigla`, tempi in sigla.json
      script/                registra, foto, mappa, elenco, e ciò che condividono (tempo, impronta, comune, percorsi)
      script/plugin-bun.ts   lo stile unito e gli import delle scene del creator per Bun (`bunfig.toml`)
      test/

## I tempi

Una scena riceve `{ t, tempi }`. `t` sono i secondi dall'inizio della scena; `tempi` è `{ nome: secondo }`: il
secondo di scena in cui il video dice ogni parola dichiarata nel piano.

- **Scene con ancore** (`e1`, `e2` in `esempio-ancore`): `tempi` è vuoto. Ogni cosa entra a un istante suo, e il motore
  lega le ancore del piano alle parole: fra due ancore la scena scorre al suo passo e poi aspetta.
- **Scene al passo del video** (`p1`, `p2` in `esempio-al-passo-della-voce`): dichiarano `tempi` (e `durata`) nella loro
  definizione, come valori di partenza per guardarle in `dev`. Quando le chiede un montaggio, i tempi del file
  (`tempi` di ogni sigla in `tempi.json`) li sostituiscono parola per parola, e la scena dura quanto il suo tratto di
  video (`durata` del file).

## Aggiungere un video

1. Una cartella `<slug>/` (lo slug è quello del video in `archivio/video/`) in `scene/` della cartella dei dati del creator (sotto, «Le scene del creator»); nel prodotto, `src/scene/<slug>/`, solo per le scene d'esempio e la sigla.
2. `dati.ts`: i numeri che le scene mostrano, ognuno con la fonte e la data della misura. Mai numeri a mano nelle scene.
3. `scene.tsx`: esporta `video: Video = { titolo, scene }`, con le scene per sigla; un video in 16:9 aggiunge
   `formato: "orizzontale"` e le sue scene si disegnano su 1920×1080.

Il registro le trova da sé (`import.meta.glob`): niente elenco da aggiornare. La sigla è unica fra tutti i video;
`dev`, `registra`, `foto`, `mappa` ed `elenco` la vedono subito.

## Aggiungere una scena

Nell'oggetto `scene` del video, una voce per sigla:

    "x1": { titolo, voce, parole: [appiglio, appiglio, appiglio], durata, fotogrammi: [...], Componente: X }

- `voce` è ciò che si dice mentre scorre; `parole` sono i tre appigli della mappa.
- `fotogrammi`: gli istanti da fotografare, uno per ogni cosa che entra e uno vicino alla fine.
- `Componente({ t, tempi })` disegna il fotogramma di `t`: **nessuno stato, nessun timer, nessuna transizione CSS**;
  tutto ciò che si muove è funzione di `t`, e oltre `durata` resta identico.
- Una scena al passo del video aggiunge `tempi: { nome: secondo }`; il componente si tipa `ScenaProps<typeof TEMPI>`.
- `fascia: [x0, y0, x1, y1]` solo se la scena disegna fuori dalla fascia dello stile.
- `trasparente: true` per una scritta sopra una ripresa: la scena non ha sfondo, `registra` scrive accanto al video la sua maschera (`<sigla>.alfa.mkv`) e nel montaggio fuori da ciò che disegna resta il girato. Non è uno sfondo, quindi `foto` non la controlla come sfondo fermo.

Regole di stile (le controlla `foto`):

- Si disegna nella fascia utile del quadro della scena (`stile.json`, `fascia_animazione`; di serie quella di `sagoma-su-animazione`): sotto entrano la
  testa e i sottotitoli. Nel video il motore dà alla pagina la fascia del quadro che il piano dà alla scena (`fascia` in `tempi.json`) e `Campo` la legge da lì; per `dev` e per `foto` la scena dichiara il suo quadro
  (`quadro` nella scena, `impianto.ts`), altrimenti vale quello di serie. Una scena che disegna fuori dalla fascia del suo quadro dichiara `fascia`. I movimenti d'ingresso vengono dal basso o dall'alto, mai da fuori di lato.
- Nei quadri `sagoma-al-centro` e `solo-animazione` la scena entra nel video rimpicciolita (a 972 px di larghezza,
  `docs/PIANO.md`, «I lati che il telefono taglia»): si disegna sempre su 1080, e ciò che sta vicino ai bordi resta visibile.
- Testo mai sotto i 40 px; allineato a sinistra sul bordo della fascia; italiano con accenti e apostrofo tipografico.
- Colori solo dai token di `stile.json` (`var(--carta)`, `--inchiostro`, `--rosso`, `--blu`…). Un rosso per scena,
  sul numero o il segno che conta. Fanno eccezione gli aspetti che sono identità fissa e il creator non cambia: i film in 3D (`aspetto3d.ts`),
  la finestra da vecchio computer (`finestra.tsx`), il mango e la sigla.
- Niente glow, gradienti, ombre morbide, elenchi puntati, animazione decorativa.
- Ingresso 0,7 s con `curve.entra`, spostamenti 1,2 s con `curve.dolce`, conteggi 0,8–0,9 s, uscita 0,5 s; fra due cose
  che entrano almeno 0,5 s.
- Niente a schermo prima che la voce lo dica; lo sfondo non resta mai fermo; nelle domande, scenette e non testo;
  uno schema è fisicamente giusto.

## Le scene in 3D

Una scena può disegnare in 3D con three.js, come la sigla (`src/standard/palco3d.tsx`; `notazione.ts` per le scritte in notazione, `aspetto3d.ts` per i colori): un palco WebGL che si ridisegna intero a
ogni istante, senza stato fra un fotogramma e l'altro. Le scritte stanno su texture e si ridisegnano appena i caratteri sono arrivati.

## Gli elementi standard

In `src/standard/`, legati a `stile.json` a tempo di build (`stile.ts`: formati, fascia di serie e `fasciaDi(quadro)`, titolo; i colori diventano le
variabili CSS `--carta`, `--carta-scura`, `--grigio`, `--filo`, `--inchiostro`, `--rosso`, `--blu`, `--nero`,
`--verde`). Quelli con una scena nella colonna sotto hanno la loro scena dimostrativa nel video `standard` (sigle `std-…`), che si vede in `dev`; gli altri si provano nelle scene dei video.

| elemento | file | scena |
|---|---|---|
| il palco e la fascia utile: `Campo`, `Scatola` | `palco.tsx` | `std-palco` |
| i modi di entrare: `Appare`, `Filo`, le `curve` e `tra` di `impianto.ts` | `entrate.tsx` | `std-entrate` |
| il numero che conta: `Numero`, `Cifre` | `numero.tsx` | `std-numero` |
| la barra: `Misura` (nome, numero, barra che cresce) | `barra.tsx` | `std-barra` |
| la corsia di token alla velocità vera: `Velocita` | `corsia.tsx` | `std-corsia` |
| la finestra da vecchio computer: `Finestra`, `Avanzamento`, `Pulsante`, `Puntatore` | `finestra.tsx` | `std-finestra` |
| lo schema a nodi e fili: `Nodo`, `Collegamento`, `Pacchetto`, `Utente`, `Computer` | `schema.tsx` | `std-schema` |
| il titolo del video (fondo nero, scritta verde): `Titolo` | `titolo.tsx` | `std-titolo` |
| le pagine e le foto vere in banda: `Tela`, `Pagina`, `Foto`, `Foglio`, `inquadra`, `vicino`; il nome di una persona: `Etichetta` | `pagine.tsx` | — (si vede nei video di notizia) |
| un filmato dentro la scena (una pagina che si muove, `filmato` di `python -m motore pagina`): `Filmato`, portato all'istante `t` a ogni fotogramma; `vai` torna solo quando ogni filmato è fermo su quel fotogramma (`filmatiAlPosto`). In WebM (VP9) | `filmato.tsx` | — |
| la AI blu e l'umano a inchiostro: `AI`, `Umano`; i cammini: `Cammino`, `Croce`, `Bandiera`, `lungo` | `personaggi.tsx` | — (come sopra) |
| i loghi dei prodotti nominati: `Logo`, `CLAUDE`, `CHATGPT`, `META` (i file e la loro licenza in `loghi/`) | `loghi.tsx` | — (come sopra) |
| il palco 3D: `Palco3D`, `ripresa`, `inquadra`, le scritte su un piano (`Scritta`), la notazione | `palco3d.tsx`, `notazione.ts`, `aspetto3d.ts` | `sigla` |

Un elemento nuovo: un file in `standard/` che legge da `stile.ts` ogni misura e colore dello stile, e la sua scena
`std-…` in `scene/standard/scene.tsx`. Un elemento che serve a una scena sola resta nella scena.

## Le scene del creator

Una cartella dei dati (`MANGO_ANIMATION_LAVORO`, `../docs/ARCHITETTURA.md`) può avere le sue scene: `<lavoro>/animazioni/scene/<slug>/scene.tsx`, con i file che la scena importa accanto, come in `src/scene/<slug>/`. Il registro (la pagina, `elenco`, `registra`, `foto`, `mappa`, l'impronta) le mette accanto a quelle del prodotto: la sigla è unica fra tutti i video e uno slug non può stare in due cartelle.

- **Cosa importano dal prodotto**: `@animazioni/impianto`, `@animazioni/standard/<elemento>`, `@animazioni/scene/sigla/sigla`, e lo stile unito con `import stile from "virtual:stile"`. I pacchetti (`react`, `three`…) si risolvono sempre da `animazioni/`, anche se il file sta altrove; `../` verso il prodotto non vale, perché la cartella dei dati non sta in un posto fisso.
- **Come**: nella pagina, il plugin di `vite.config.ts` (alias `@animazioni`, `@scene-del-creator`, modulo `virtual:stile`, risoluzione dei pacchetti, accesso ai file della cartella dei dati); per Bun (`elenco`, `registra`, `foto`, `mappa`, le prove) `script/plugin-bun.ts`, che carica i file del creator con gli import già riscritti. La variabile arriva dal server e dal motore (che la passano ai programmi che lanciano).
- **Rifare**: la pagina costruita (`dist/`) sa per quale cartella di lavoro è fatta e si ricostruisce se cambia, o se cambiano le scene o lo stile del creator. L'impronta di una scena resa conta i file della scena nella cartella dei dati con i file del prodotto che importa, per nome relativo alla cartella delle scene: spostare la cartella non rifà niente.
- **Le prove di una cartella dei dati** stanno in `<lavoro>/animazioni/test/` e si lanciano da `animazioni/` col percorso: `MANGO_ANIMATION_LAVORO=<lavoro> bun test <lavoro>/animazioni/test`.
