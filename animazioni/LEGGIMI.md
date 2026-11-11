# Animazioni

Le scene animate dei video e gli elementi standard con cui si fanno. Una scena è una funzione del tempo: la
pagina la disegna a ogni istante, Playwright ne fa uno screenshot per fotogramma e ffmpeg li unisce in un mp4
(30 fotogrammi al secondo; 1080×1920, oppure 1920×1080 per un video che si dichiara orizzontale). Formati, colori, fascia utile e titolo vengono dallo stile unito (`../stile.json` di serie con sopra quello del creator); il
motore chiede le scene con `registra` (`../docs/MOTORE.md`, «Le animazioni»). Le scene sono quelle del prodotto (`src/scene/`: la sigla, le dimostrazioni degli
elementi standard e tre scene d'esempio) e quelle del creator, che stanno nella sua cartella dei dati (`animazioni/scene-del-creator.md`).

Il documento è diviso per argomento in questa cartella; ogni sezione qui sotto dice dove sta adesso.

## Comandi

`dev`, `build`, `registra`, `foto`, `mappa`, `elenco`, `test`; perché `registra` non rifà una scena già resa; cosa controlla `foto`. → `animazioni/registra.md`

## Dove sta cosa

L'albero di `animazioni/`. → `animazioni/scene.md`

## I tempi

Cosa riceve una scena: `t` e `tempi`; scene con ancore e scene al passo del video. → `animazioni/scene.md`

## Aggiungere un video

La cartella, `dati.ts`, `scene.tsx`. → `animazioni/scene.md`

## Aggiungere una scena

Una voce per sigla, e le regole di stile che controlla `foto`. → `animazioni/scene.md`

## Le scene in 3D

Il palco three.js. → `animazioni/scene.md`

## Gli elementi standard

Gli elementi di `src/standard/` e le scene dimostrative `std-…`. → `animazioni/standard.md`

## Le scene del creator

Le scene nella cartella dei dati: cosa importano dal prodotto, come si risolvono, quando si rifanno, le prove. → `animazioni/scene-del-creator.md`
