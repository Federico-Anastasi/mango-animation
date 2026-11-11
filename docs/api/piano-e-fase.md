# Il piano e la fase di un video

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua). Le rotte che mostrano e cambiano il piano: `docs/api/video.md`.

**La fase** (`server/src/fasi.ts`, l'unico posto che la decide) è il passo del metodo a cui è un video, ricavato dai file che già ci sono: nessuno la scrive. `passo` va da 1 a 8 (idea, copione, prova, riprese, animazioni, montaggio, correzioni, uscita); `azione` dice cosa c'è da fare o chiedere adesso, e lo studio la scrive in parole. Si va dal fondo, vale il primo che si verifica:

| se | `passo` · `azione` |
|---|---|
| la scheda è di un carosello, o `scartato` | `null` |
| stato `pubblicato` | 8 · `fatto` |
| stato `pronto` | 8 · `pubblica` |
| c'è `uscite/finale.mp4` e il piano è stato salvato dopo | 7 · `correzioni` |
| c'è `uscite/finale.mp4` | 6 · `guarda` |
| c'è un piano e una scena ha `animazione` | 6 · `monta` |
| c'è `materiali/testo-registrato.md` | 5 · `animazioni` |
| c'è un piano | 4 · `testo` |
| c'è `uscite/prova.mp4` | 4 · `riprese` |
| la scheda ha `proposta.aggancio` o `proposta.spezzoni` | 3 · `prova` |
| c'è `materiali/anteprima.*` | 2 · `copione` |
| altrimenti | 1 · `idea` |

Un passo saltato (per esempio la prova) non conta: vale l'ultimo di cui c'è un segno. «Dopo il piano» è il confronto di date di `indice.pianoPiuNuovoDelFinale`, uguale per l'elenco e per il dettaglio. Cambia da sola con i file (eventi `scheda`, `piano`, `uscite`, `materiali`).

**Il piano si valida** sullo schema (`motore/schemi/piano.schema.json`) e sui riferimenti, dopo aver
applicato la `base`: la `base` esiste, ha un piano e non fa giri; il piano ha quadro, sorgenti e scene (anche
per la base); ogni quadro è in `stile.json`; ogni sorgente nominata è dichiarata e il suo file esiste in
`archivio/grezzo/`; ogni vista nominata è dichiarata nella sua sorgente. Altrimenti 400 e il file non cambia.

**Un piano scritto a mano nel file** (senza passare dalle rotte, per esempio da un modello con la scrittura dei file) scavalcherebbe questi
controlli, quindi il server li rifà da sé: appena il file cambia (e all'avvio, a piani tutti letti) lo giudica con le stesse regole, anche
nei riferimenti, e se non va lo segnala in `problemi.piano`, non lo conta come piano valido e non mette in coda `risolvi`. Quando un file
nominato nel girato arriva dopo, i piani che lo aspettavano si giudicano di nuovo. `POST …/lavori` su un piano così risponde 409 con le
stesse ragioni (`problemi`) e il nome degli strumenti che correggono (`piano_ritocca`, `piano_scrivi`): nessun lavoro parte su un piano
che non va, salvo `carosello` e `prova`, che il piano non lo usano.

**La storia.** Ogni sostituzione del piano salva la versione di prima in `storia/<n>.json` (le ultime 200) e
`storia/cursore.json` ricorda dove si è tornati con `annulla`; un piano nuovo dopo un `annulla` cancella i
«rifai». Vale anche per ciò che Claude scrive da terminale in `piano.json`: il server salva la versione che
aveva visto prima.

**Le versioni** (`GET …/versioni`) sono i file di `storia/` più il piano di adesso. `n` è il numero del file (`null` per il piano di adesso quando non ha un file suo, cioè in testa alla storia);
`in_uso` è vero per una riga sola (dopo un `annulla` è un file di `storia/`, e le versioni più nuove restano sopra di lei). Un file è stato scritto quando un'altra versione l'ha sostituito, quindi `fino` è la sua data e `da` quella del file di prima
(`null` per la più vecchia, o se il file di prima è caduto fra le ultime 200); per la versione in uso `da` è la data di `piano.json` e `fino` è `null`. `scene` e `pezzi` sono quanti ne scrive il piano (quelli di una `base` non contano; `null` se il testo non si legge).
`ripristina` non perde niente: il piano di adesso diventa una versione di `storia/` (anche le versioni «da rifare» restano), e `annulla` riporta a lui.
