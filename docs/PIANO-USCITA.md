# Le chiavi del piano che riguardano ciò che esce

Sottotitoli, titolo, suoni, copertina, coda e lingua del video. Le altre chiavi del piano, e il piano intero: `docs/PIANO.md`, «Le chiavi».

- **`lingua`** (`"it"` o `"en"`; facoltativo, `"it"` se non c'è): la lingua del video. Con una lingua diversa
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
  video da cui questo parte con `base`), `sorgente` e `t` (parte quando quella sorgente è a quel secondo, nella prima scena che la usa),
  oppure `scena` e `t` (parte `t` secondi dopo l'inizio di quella scena: un video senza voce non ha sorgenti a cui legarsi), `picco` in dB.
- **`copertina`** (`{ "disegno": "materiali/x.png", "istante": 0 }`): il primo fotogramma del video. `disegno` è un'immagine grande quanto il fotogramma (un percorso, o un file nella cartella del
  video); `monta` ci mette sopra la sagoma del primo fotogramma, o del secondo `istante` del video se nel primo il creator ha gli occhi chiusi, e il titolo, e la scrive davanti al video nella
  stessa codifica (`docs/MOTORE.md`, «La copertina»). Il video dura un fotogramma più dei tratti. Senza, il video si apre sul suo primo tratto, e `controlla` lo segna. In un video **orizzontale** (il creator non si vede) la copertina ha due chiavi in più: `sagoma` (`{ "sorgente": nome, "istante": secondo }`: la sagoma di un fotogramma di un'altra ripresa del piano, verticale, a sinistra col bordo bianco; se non c'è si scontorna solo quel fotogramma) e `righe` (le righe del titolo, una per cartello; senza, il titolo va a capo da solo). Il titolo sta a destra, dall'alto.
- **`coda`**: secondi tenuti dopo l'ultima parola del video (si aggiungono all'ultimo tratto). Si fermano prima della voce che nella sorgente segue quel tratto (a `voce.margine` da lei): il video non finisce sull'inizio di una frase.
