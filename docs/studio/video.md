# Lo studio: i video

## Video — «a che punto sono i miei video?»

Una carta per video, in gruppi per stato (gli scartati stanno chiusi): copertina o miniatura (per un carosello la prima slide, per una proposta la sua anteprima), a che passo è (`fase` di `GET /api/video`; niente per un carosello, uno scartato o un video uscito) e, per i pubblicati, data e ultimi numeri. Una proposta senza anteprima ha accanto un segno tratteggiato, «senza anteprima»: non è un errore, dice che manca l'immagine con cui si presenta (`docs/ARCHIVIO.md`, «L'anteprima»); sparisce da solo appena il file c'è, e un'anteprima rifatta si ricarica da sola. Cerca per titolo; filtra per serie. Un video (o un carosello) nuovo nasce dalla chat, come proposta e con la sua anteprima. «Dal telefono» (anche nella pagina di un video) mostra il codice da inquadrare col telefono nel Wi-Fi di casa: apre la pagina coi video montati, ognuno nella versione completa, da salvare nella schermata Home.

## La pagina di un video

Testata con titolo e stato che si cambiano sul posto, la cartella da copiare per Claude e «Dal telefono». Sotto, **la riga dei passi** (`src/video/RigaDeiPassi.tsx`): gli otto passi del metodo e una frase su cosa dire nella chat per andare avanti, con **«Scrivila nella chat»**, che apre la chat e mette la frase nel campo (dopo ciò che c'è già scritto, senza ripeterla se c'è) senza mandarla (`proponiNellaChat`, `src/chat/bozza.ts`). Il passo lo dice il server, `fase` di `GET /api/video/:slug` (`docs/API.md`): lo studio mostra e basta. Sotto i 700 px di pagina (la chat accanto, il telefono) restano i segni e il passo corrente; un video uscito ha tutti i passi fatti e non ha frase; un carosello e uno scartato non hanno la riga. Sotto la testata, se la scheda o il piano scritti nel file non passano i controlli, un avviso dice con una frase semplice di chiederne la correzione nella chat, e il perché preciso (per chi la sistema) sta in un riquadro che si apre a richiesta (la scheda mostrata è l'ultima valida); sparisce da solo appena il file è corretto. Sotto, cinque schede, e davanti a tutte la **Prova** se c'è. Il video si apre sulla scheda che gli serve: la **Slide** per un carosello, la Prova se non ha ancora un piano, la **Scheda** (il copione) se non ha né piano né file finito, altrimenti il Montaggio.

Un carosello ha tre schede sole: **Slide**, Scheda, File.

### Slide — «com'è il carosello?»

Una slide grande alla volta, in 9:16, col numero e i bottoni per la precedente e la successiva (anche le frecce della tastiera, senza aver cliccato prima); accanto tutte le slide in piccolo, in ordine: un clic porta lì. Senza slide, o per rifarle, la scheda manda alla chat; mentre il lavoro c'è dice come va. Alla fine, accanto alle slide, gli **avvisi dell'ultima resa** (testo che il telefono taglia nei lati, testo nella zona della didascalia, immagini o caratteri che non si caricano): ognuno è un collegamento che porta alla sua slide; se sono zero lo dice, se la resa non è riuscita dice perché, e prima di ogni resa non dice niente. Le slide rifatte si rivedono da sole, senza ricaricare la pagina.

### Prova — «cosa devo registrare?»

Solo se il video (non un carosello) ha `uscite/prova.mp4`: il video da guardare mentre si registra, con le animazioni e la frase da dire (`docs/MOTORE.md`, `prova`). Se il video non ha ancora un piano, la pagina si apre qui.

La scheda Montaggio (l'anteprima, il pannello, la timeline, i gesti sui pezzi, le versioni) sta in `docs/studio/montaggio.md`.

### Scheda — «cosa so di questo video?»

Il copione (aggancio, centro, chiusa, note; una riga dice che si corregge lì, anche a mano, e che la chat lo rilegge), la scaletta, didascalia e hashtag con «Copia», dove deve uscire, le pubblicazioni, i numeri per data in una tabella e il loro andamento, e le note.

Si scrivono tutti dalla pagina, e ogni cambio manda la scheda intera al server (`PUT /api/video/:slug/scheda`, validata sullo schema; se la rifiuta la frase dice perché e ciò che era scritto resta nel campo). I testi si salvano uscendo dal campo.

Gli elenchi (la scaletta, gli hashtag, i canali, le pubblicazioni) si cambiano sul posto: una lista che resta vuota toglie la chiave dalla scheda (per `canali` lo schema ne vuole almeno uno), e un canale scritto nel file e fuori dall'elenco della pagina si vede e non si perde.

### Controllo — «c'è qualcosa che non va?»

L'esito dell'ultimo controllo: silenzi rimasti, parole fuori posto, tagli nel parlato, differenze fra voluto e sentito; ogni riga porta l'anteprima a quel secondo. Sotto, le cose da verificare segnate dal controllo dei contenuti, da spuntare. Se c'è un montato, sotto la data una riga dice che per controllarlo di nuovo si chiede nella chat. Se il montato è più nuovo del controllo, lo dice.

### Copertina — «con che faccia esce?»

La copertina, il video con la copertina in testa (solo se è del montaggio di adesso: se è di uno vecchio dice di rimontare, e se la copertina è stata rifatta dopo il montaggio dice che il video non ce l'ha ancora), i disegni in `materiali/`. La copertina entra nel video col montaggio: non c'è un secondo video da fare.

### File — «dove sono i file?»

Le uscite con peso e data (`finale.mp4` e `con-copertina.mp4` sono lo stesso file: una riga sola, che dice «è anche …»), «Mostra nella cartella», «Copia il percorso»; il girato usato, con il rimando alla sua riga in Girato.
