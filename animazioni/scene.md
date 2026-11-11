# Animazioni: come si scrive una scena

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

1. Una cartella `<slug>/` (lo slug è quello del video in `archivio/video/`) in `scene/` della cartella dei dati del creator (`animazioni/scene-del-creator.md`); nel prodotto, `src/scene/<slug>/`, solo per le scene d'esempio e la sigla.
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
