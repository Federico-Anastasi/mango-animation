# Il motore: le pagine vere e il carosello

| comando | cosa fa | scrive |
|---|---|---|
| `python -m motore pagina <slug> [nome …] [--solo-ritagli] [--visibile]` | le pagine vere di `materiali/pagine.json` (tutte, o quelle nominate) in formato telefono, con dove stanno le frasi, e i loro ritagli per le scene («Le pagine vere», qui sotto); `--solo-ritagli` rifà solo i ritagli dalle catture che ci sono, `--visibile` usa il Chrome visibile per i siti che bloccano il browser senza finestra | `materiali/screen-<nome>.png`, `.json`, `.txt`, `materiali/ritagli/` |
| `python -m motore carosello <slug> [--nuovo]` | le slide di un carosello: ogni `<section class="slide">` di `materiali/carosello.html` in un PNG, coi controlli («Il carosello», qui sotto); `--nuovo` scrive invece la base da cui partire, dove la pagina non c'è | `uscite/slide-<n>.png`, o `materiali/carosello.html` |

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
  mostra con `Filmato` (`animazioni/standard.md`).

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
