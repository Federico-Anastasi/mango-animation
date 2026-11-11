# I file che il creator porta nella chat

Parte di `docs/APP.md`.

## Gli appunti

Un file copiato in Esplora risorse (`CF_HDROP`) non arriva sempre alla pagina come file nell'evento di incolla. Nel campo della chat, se
Ctrl+V non porta né file né testo, la pagina chiede all'app i percorsi (`window.__MANGO_ANIMATION__.appunti.percorsi()`, un comando del ponte come la
dettatura: `app/src/appunti.rs`, `build.rs`, `capabilities/default.json`) e li manda al server (`POST /api/chat/allegati/locale`,
`docs/CHAT.md`), che li copia fra gli allegati. L'app dà solo i file che esistono (le cartelle no), e prima di darli li dice al server (`POST /api/app/percorsi`, `app/src/percorsi.rs`, `docs/api/girato.md`, «I file scelti dal creator»), che altrimenti non ne prende il percorso; senza file negli appunti dà un elenco vuoto
e la pagina non fa niente; se gli appunti sono usati da un altro programma rifiuta con la frase, che la chat mostra. Immagini (uno
screenshot) e testo restano al browser. Nel browser senza l'app il ponte non c'è e vale ciò che il browser sa fare.

## I file trascinati

Un file lasciato sulla finestra la pagina lo riceve col suo percorso, non col solo contenuto: così un video grande si collega invece di essere
copiato, come quando è incollato. Il trascinamento di Tauri è acceso (`app/src/trascinamento.rs`) e, con lui acceso, su Windows la pagina non riceve
più `dragenter` e `drop` dei file: li riceve come eventi `mango-trascinamento` sulla finestra, dal ponte `window.__MANGO_ANIMATION__.trascinamento`.

- `trascinamento.su(f)` → `f({ tipo, x, y, percorsi? })` e restituisce la funzione che smette di ascoltare. `tipo`: `entra` (con i `percorsi`), `sopra`
  (a ogni movimento), `lascia` (con i `percorsi`), `esce` (senza `x` e `y`; anche per un trascinamento annullato). `x` e `y` sono in pixel della pagina,
  come `clientX` e `clientY`: la pagina decide se il file è sopra la chat (`document.elementFromPoint`).
- I `percorsi` sono quelli che Windows dà: file e anche cartelle. Con `lascia` l'app li dice prima al server (`POST /api/app/percorsi`) e solo dopo manda l'evento alla pagina. Una cartella la rifiuta il server (`POST /api/chat/allegati/locale`) con la sua frase, e la chat la mostra
  sull'allegato.
- La chat (`studio/src/chat/PannelloChat.tsx`) manda i file lasciati sopra di lei a `POST /api/chat/allegati/locale`, uno per file: fino a 16 MB il server li copia, oltre li collega.
  Nel browser senza l'app il ponte non c'è e vale il `drop` della pagina (sotto i 16 MB; oltre, la chat dice di incollare il file da Esplora risorse).
