# Animazioni: gli elementi standard

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
