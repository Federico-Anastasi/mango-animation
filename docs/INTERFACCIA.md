# L'interfaccia

Una pagina nel browser su `http://127.0.0.1:47431`. Qui si guarda e si ritocca, e a destra c'è la chat con Claude
(sotto, «La chat»). Ogni schermata risponde a una domanda sola. L'aspetto sta in `src/theme.css`: carta
`#F1F0EB`, inchiostro `#17171B`, rosso, blu, filo; Archivo per i titoli, Instrument Sans per il testo,
Chivo Mono per numeri e tempi; niente ombre morbide, sfumature, bagliori; tema scuro dai token.

Lo studio serve a guardare e a decidere; i lavori (preparare, calcolare e montare, controllare, rendere le slide) e i video nuovi si
chiedono nella chat. Dove servirebbe uno di questi, la pagina dice a che punto è e, una volta per vista, in una riga di testo secondario,
cosa si può chiedere nella chat («Per prepararlo, chiedilo nella chat.»); l'unico bottone che scrive nella chat, e senza mandare, è quello della riga dei passi di un video (sotto).
A mano restano i ritocchi del montaggio, lo stile, le parole della scheda e i gesti che la chat non fa (fermare un lavoro, registrare,
togliere una proposta).

## La cornice

Barra in alto: **Video**, **Girato**, **Canale** (solo quando c'è un canale letto: sono Pubblico, Classifica e Crescita), **Produzione**, **Impostazioni** (sotto i 1000 px il menu va da solo sulla seconda riga e i segni di stato salgono accanto al marchio; a 430 px le cinque voci stanno su una riga e solo «Chat» tiene il suo nome fra i segni di stato); a destra, **solo quando servono**, lo stato dei lavori (compare con un lavoro in corso o in coda, e sparisce quando non c'è più niente; se il pannello è aperto resta finché lo si chiude; cosa sta girando e cosa
aspetta, si apre in un pannello con le ultime righe e «Ferma»; sotto il lavoro in corso, quanto dura e verso che ora finisce
(«circa 4 min, finisce verso le 15:42», dalla stima del server), o che non si sa ancora se non ci sono abbastanza lavori uguali
finiti; se il piano del video in montaggio è cambiato dopo la partenza,
la barra dice «Piano cambiato» con un punto esclamativo rosso, e nel pannello, sotto quel lavoro, una frase spiega che il montaggio
ripartirà da solo, che per non aspettare si ferma con «Ferma» e si chiede nella chat di rimontarlo), «Telefono pronto» (compare solo quando il telefono può mandare i file e porta al Girato; per collegarlo si usa Impostazioni › Telefono), **Chat**
(apre e chiude la chat, `Ctrl+J` da qualunque vista; il punto rosso dice che Claude lavora o aspetta una risposta) e
**Registra**: un pannello dove si sceglie cosa registrare (solo lo schermo, schermo e voce, schermo voce e
viso) e si avvia; per le voci con il microfono e per il viso anche quale microfono e quale webcam, fra quelli trovati: la scelta si ricorda
nel browser e vale finché il dispositivo c'è, altrimenti il pannello torna al primo trovato (alla prima webcam non virtuale). Mentre registra la barra mostra il tempo passato e dal pannello si ferma. I file finiscono
nel girato di oggi.

**Lingua.** L'interfaccia è in italiano e in inglese. Si sceglie in Impostazioni › Generali: la lingua del sistema, l'italiano o l'inglese; senza scelta vale la lingua del sistema (italiano per chi parla italiano, inglese per tutti gli altri); la scelta si ricorda nel browser e cambiandola la pagina si
ridisegna da capo. Numeri, tempi e date seguono la lingua (`1,5 s` e `7 ott 2026` in italiano, `1.5 s` e `7 Oct 2026` in inglese). Le frasi che scrivono il server e il motore (un rifiuto, un errore,
un avviso) escono nella lingua dello studio (`docs/API.md`, «La lingua delle frasi»), e così quelle dell'app e del suo motore di dettatura (`docs/APP.md`, «La dettatura»). I nomi dei quadri e dei colori dello stile di serie
(il menu «Quadro del video», i campioni di Stile) hanno un nome in parole in tutte e due le lingue (`nomeQuadro`, `nomeColore`, `src/testo.ts`); un quadro aggiunto dal creator si chiama come l'ha chiamato lui. Restano in italiano i testi dei file di dati (il piano di crescita, le note), quelli di Claude
e le eccezioni che `docs/API.md` elenca.

**Segnala un problema** (solo nell'app, `docs/APP.md`, «Le segnalazioni dei problemi»): un bottone con la bandierina, fra i segni di stato, apre un pannello con un campo facoltativo, l'interruttore della schermata e «Invia»; la vista d'errore comune offre lo stesso modulo («Segnala il problema») con il suo messaggio.

**Profilo da correggere**: se `profilo.json` non passa lo schema (`GET /api/profilo`, `valido: false`) sotto la barra compare un avviso rosso: lo studio lavora con l'ultimo profilo buono (o senza),
si può chiedere nella chat di correggerlo o correggere il file a mano, e sotto stanno le frasi di ciò che non va. Compare e sparisce da solo con l'evento `profilo`; cambiando lingua le frasi si rileggono nella lingua nuova.

## La chat — «parlo con Claude, accanto a ciò che sto guardando»

Un pannello a destra delle viste (a 1400 e 1000 px), largo 420 px di partenza: si trascina il bordo sinistro (o si usano le frecce sul
bordo a fuoco; il doppio clic torna alla larghezza di partenza); la larghezza e l'essere aperta si ricordano nel browser. A 430 px la chat
prende tutto lo schermo, sopra la vista, col bottone «Torna alla vista»; un collegamento a un video scopre la vista. La testata dice il titolo della conversazione e, sotto, come sta («Pronta», «Sta lavorando», «Aspetta una tua risposta»), il tempo di lavoro di Claude in tutta la conversazione, «Sta lavorando · 12:14» (la somma delle risposte: va avanti mentre Claude lavora e resta ferma mentre aspetta il creator, `docs/CHAT.md`, `lavoro`; ogni risposta dice il suo tempo in fondo, «Fatto in 42 s») e quanto è pieno il contesto («Contesto 52%», con una barretta che sopra il 70% diventa arancione e sopra il 90% rossa, e da lì dice «meglio una conversazione nuova»; senza la misura del modello, «Contesto 146 mila token»; al passaggio, i token esatti e cosa succede quando si riempie). Ha l'elenco delle conversazioni (si riprende una vecchia, anche una aperta da terminale), «Nuova conversazione» e «Chiudi». Solo una conversazione di Mango Code dice con chi si parla: il suo segno e «Mango Code», che lo dice anche l'invito di una conversazione nuova (i motori stanno in `studio/src/chat/motore.ts`). L'assistente di Claude non ha né nome né segno nella chat. Finché una conversazione si sta aprendo, o non si apre, la testata non dice nessun motore e le frasi della chat non ne nominano uno.
**Il primo giro**: finché il creator non ha un profilo (`GET /api/profilo`, `presente: false`) la chat si apre da sola, più larga, e manda a Claude
il primo messaggio; Claude comincia la skill `welcome` (`docs/CHAT.md`, «Il primo giro»). Sopra la conversazione sta un «Salta» discreto, che
ferma Claude e non fa ripartire il giro; dalla chat vuota «Rifai il primo giro» lo rifà quando si vuole. La scelta di saltare o di aver cominciato si ricorda nel browser. La conversazione del primo giro (e quella del «Rifai») parte con l'Opus più recente che l'elenco dei modelli offre, o con «Predefinito» se non ce n'è; il menu lo cambia, e la scelta ricordata per le altre conversazioni non si tocca (se il creator ha scelto Mango Code, resta Mango Code).

Senza una conversazione la chat si apre su un
invito (cosa fa: «Lavora sui tuoi file e monta i video, con il Claude Code installato sul computer») e sulle ultime conversazioni. Se una conversazione non si apre (per esempio perché è di Mango Code e Mango Code è spento) la chat dice perché, con «Riprova».

- **La conversazione.** I messaggi del creator a destra, quelli di Claude a tutta larghezza. Il testo di Claude è in markdown (titoli, elenchi,
  tabelle, citazioni; il codice in carattere a spaziatura fissa con «Copia») e arriva a pezzi senza scatti. Il pensiero sta chiuso
  («Ha ragionato»). Ogni strumento è una riga: icona, cosa fa in parole («Legge docs/PIANO.md», «Lancia: bun test», «Video · lavoro
  monta cinque-errori»), «in corso…» finché non finisce (dopo tre secondi diventa «in corso · 0:42» e va avanti da sé), «non riuscito» se è andato storto; un
  passo che è durato almeno cinque secondi dice quanto («2 min 5 s»), uno breve no; un clic mostra cosa ha chiesto e cosa è tornato. Gli strumenti finiti e riusciti di fila (almeno due, con i pensieri fra l'uno e l'altro) si raccolgono in una sola riga chiusa, «Ha lavorato · 9 passi · 1 min 8 s» (la durata, da quando è partito il primo a quando è finito l'ultimo, se dura almeno cinque secondi), che si apre con un clic sui passi di sempre. Restano sempre in vista lo strumento in corso, quello non riuscito, quelli che mostrano qualcosa (un'immagine, il lavoro in coda, la domanda a scelta, il piano proposto) e le richieste di permesso, che stanno fuori dai messaggi.
  Le immagini degli strumenti (foto dei video, slide) stanno nella conversazione e al clic si aprono a tutto schermo. Scorre da sola in
  fondo solo se chi legge è già in fondo; se è salito a rileggere resta dov'è e compare «Vai in fondo». Mentre il motore lavora, sotto l'ultimo messaggio, il passo che sta facendo adesso e da quanto («Sta pensando · 0:42», «Aspetta lo strumento · 0:06»; il tempo di tutta la conversazione è nella testata); alla fine di un giro «Fatto in 1 min 12 s», o in rosso perché si è fermato.
- **I tempi attesi.** Una durata che il creator sta aspettando (la stima di un lavoro nella sua scheda e nel pannello dei lavori, e quelle che Claude scrive nel testo: «circa 3 minuti», «verso le 15:42», in italiano e in inglese) ha un leggero risalto (`studio/src/chat/stime.ts`); non lo ha una durata passata, un conteggio o un'ora senza contesto. I cronometri sono un orologio della pagina: un solo timer al secondo, acceso solo finché qualcosa corre.
- **Il modello e l'effort.** Nella testata due menu: **Modello** (i modelli che Claude Code offre e, se Mango Code è acceso, quelli di Mango Code, in due gruppi «Claude» e «Mango Code»; di Claude il menu mostra «Predefinito» e i tre modelli più recenti, e «Altri…» apre gli altri sotto «Altri» (restano tutti raggiungibili, e se il modello scelto è fra gli altri sono già aperti); i più recenti si riconoscono dalla versione nel nome, «Opus 5.5»; una conversazione già iniziata offre solo quelli del suo motore) ed **Effort** (solo i livelli che il modello ha; senza livelli il menu non compare). Cambiano la conversazione aperta dal messaggio dopo, senza interromperla, e l'ultima scelta vale per le conversazioni nuove (ricordata nel browser). Se Claude Code non accetta il cambio, una riga rossa dice perché.
- **Le richieste.** La chat salta sempre i permessi di Claude Code (`docs/CHAT.md`, «I permessi»): arrivano le sue domande e, da Mango Code,
  i permessi che le sue regole chiedono. Un permesso dice cosa si vuole fare e ha «Consenti», «Consenti sempre» (per quello strumento, fino alla fine
  della conversazione) e «No», con un campo per dire perché (facoltativo). Una domanda ha le opzioni come bottoni con la loro descrizione,
  «Altro» con un campo di testo, e se ce n'è più d'una un solo «Invia le risposte». Finché non si risponde la conversazione sta ferma e il
  bottone Chat nella barra lo dice, anche a chat chiusa.
- **I lavori in background.** Quando Claude aspetta un comando lungo o un sottoagente compare **«Manda in background»** (anche `Ctrl+B`, solo se c'è qualcosa da spostare): il lavoro continua da solo e Claude legge subito ciò che il creator ha scritto. Ogni lavoro in background è una scheda sotto la conversazione, con «Ferma», che sparisce quando il lavoro finisce. Con Mango Code non ci sono (`docs/CHAT.md`, «I lavori in background»).
- **Il campo di testo.** Invio manda, Maiusc+Invio va a capo (su telefono e tablet Invio va a capo e si manda col pulsante). Mentre il motore lavora si può scrivere: il messaggio resta «in coda» finché lo legge; c'è «Ferma». Un'immagine incollata (anche uno screenshot), un file trascinato, scelto con la graffetta o (nell'app) copiato in Esplora risorse diventa un allegato, con anteprima se è un'immagine e la x per toglierlo. Un file incollato oltre i 16 MB si collega senza copiarlo; uno trascinato oltre i 16 MB non sale e la riga dell'allegato dice di incollarlo da Esplora risorse. Ciò che è scritto e non mandato resta se si chiude la chat e la si riapre. Una pagina può metterci una frase da rileggere (la riga dei passi di un video, «La pagina di un video»): niente parte da solo.
- **Il microfono** (solo nell'app, `docs/APP.md`, «La dettatura»). Un clic accanto alla graffetta, o `Ctrl+Spazio`, comincia a dettare; un altro finisce. Le parole entrano nel campo mentre il creator parla, nel punto del cursore o al posto della selezione, ma niente parte da solo: il creator rilegge e manda con Invio, che spegne il microfono. Il testo lo dà un motore locale (faster-whisper): l'audio non lascia il computer. Se manca il microfono o Python, la striscia sopra il campo lo scrive in rosso. Chiusa la chat il microfono si spegne.
- **Cosa sa Claude di dove sei.** Con ogni messaggio parte, senza che il creator lo scriva né lo veda, il video e la scheda che ha aperti
  (`docs/CHAT.md`, «contesto»): «questo carosello» basta.
- **I video nelle risposte.** Il nome di un video e i percorsi della sua cartella (`archivio/video/<nome>/…`) sono collegamenti che aprono la
  vista giusta. Un lavoro messo in coda da Claude si vede nella conversazione come scheda viva: in attesa, o in corso con quanto va,
  la stima, la fine prevista e «Ferma»; poi com'è finito. Quando Claude fa «guarda» (lo strumento `apri`), dentro l'app la finestra cambia pagina da sola: un video con la sua scheda, un file di `video/…` sulla scheda che lo mostra, uno di `grezzo/…` sul Girato (messaggio `vai`, `docs/API.md`); a 430 px la chat si chiude per far vedere la pagina. Fuori dall'app apre il browser.
- **I percorsi del computer nelle risposte.** Un file o una cartella del computer scritti da Claude (`file:///…`, `C:\…`, `\\server\…`, `/…`) non sono mai un collegamento che porta
  la finestra altrove. Se stanno nell'archivio (c'è `archivio/` nel percorso) diventano un pulsante che li mostra in Esplora File
  (`POST /api/apri`, e la frase del server se non si apre); gli altri si leggono come testo con «Copia». Solo `https:`, `mailto:` e `#…` sono collegamenti. Ogni «Copia» funziona anche dallo studio aperto dal telefono su `http://`, dove il browser non ha gli appunti moderni (si copia da un campo nascosto).
- **Una pagina che si rompe.** Un'eccezione nel disegno di una vista (o un pezzo di interfaccia che non si scarica) mostra una frase con «Ricarica»
  al posto della vista; la cornice e la chat restano. Se si rompe la cornice o la chat, la frase prende tutta la finestra.

## Video — «a che punto sono i miei video?»

Cinque gruppi per stato, in quest'ordine: in lavorazione, proposte, pronti, pubblicati, scartati (chiuso).
Ogni video è una carta: copertina o miniatura (per un carosello la prima slide, per una proposta la sua anteprima), titolo, durata (o «carosello»), a che passo è («Passo 3 di 8 · Prova», `fase` di `GET /api/video`; niente per un carosello, uno scartato o un video uscito), serie, e per i pubblicati data e ultimi
numeri. Una proposta senza anteprima ha accanto un segno tratteggiato, «senza anteprima»: non è un errore, dice che manca l'immagine con cui si presenta (`docs/ARCHIVIO.md`, «L'anteprima»); sparisce da solo appena il file c'è, e un'anteprima rifatta si ricarica da sola. Cerca per titolo; filtra per serie. Sotto il titolo, «Per un video nuovo, chiedilo nella chat.»: il video (o il carosello) nasce dalla chat,
come proposta e con la sua anteprima. «Dal telefono» (anche nella
pagina di un video) mostra il codice da inquadrare col telefono nel Wi-Fi di casa: apre la pagina coi video montati,
ognuno nella versione completa, da salvare nella schermata Home.

## La pagina di un video

Testata: titolo (si cambia sul posto), stato (si cambia da un menu), la cartella da copiare per Claude,
«Apri la cartella», «Dal telefono». Sotto, **la riga dei passi** (`src/video/RigaDeiPassi.tsx`): gli otto passi del metodo (idea, copione, prova, riprese, animazioni, montaggio, correzioni, uscita) con i fatti segnati e quello di adesso in rilievo, e una frase su cosa dire nella chat per andare avanti, con **«Scrivila nella chat»**: apre la chat e mette la frase nel campo (dopo ciò che c'è già scritto, senza ripeterla se c'è) e non la manda (`proponiNellaChat`, `src/chat/bozza.ts`). Il passo lo dice il server, `fase` di `GET /api/video/:slug` (`docs/API.md`): lo studio mostra e basta. Sotto i 700 px di pagina (la chat accanto, il telefono) restano otto segni e «Passo 3 di 8 · Prova»; un video uscito li ha tutti fatti e non ha frase; un carosello e uno scartato non hanno la riga. Sotto la testata, se la scheda o il piano scritti nel file non passano i controlli, un avviso dice con una frase
semplice di chiederne la correzione nella chat, e il perché preciso (per chi la sistema) sta in un riquadro che si apre a richiesta
(la scheda mostrata è l'ultima valida); sparisce da solo appena il file è corretto. Sotto, cinque schede, e davanti a tutte la **Prova** se c'è. Il video si apre sulla scheda che gli serve: la **Slide** per un carosello, la Prova se non ha ancora un piano, la **Scheda** (il copione) se non ha né piano né file finito, altrimenti il Montaggio.

Un carosello ha tre schede sole: **Slide**, Scheda, File.

### Slide — «com'è il carosello?»

Una slide grande alla volta, in 9:16, col numero («2 / 9») e i bottoni per la precedente e la successiva (anche le
frecce della tastiera, senza aver cliccato prima); accanto tutte le slide in piccolo, in ordine: un clic porta lì.
Senza slide, la scheda dice di chiedere nella chat di scriverle e renderle.

Con le slide, una riga dice che per renderle di nuovo si chiede nella chat; mentre il lavoro c'è, al suo posto la scheda dice come va,
«in attesa» o «Sto rendendo le slide…». Alla fine, accanto alle slide, gli **avvisi dell'ultima resa** (testo che il telefono taglia nei lati,
testo nella zona della didascalia, immagini o caratteri che non si caricano): ognuno è un collegamento che porta alla sua slide;
«Nessun avviso» se sono zero; se la resa non è riuscita, dice perché. Prima di ogni resa non dice niente. Le slide rifatte si
rivedono da sole, senza ricaricare la pagina.

### Prova — «cosa devo registrare?»

Solo se il video (non un carosello) ha `uscite/prova.mp4`: il video da guardare mentre si registra, con le animazioni e la frase da dire (`docs/MOTORE.md`, `prova`). Se il video non ha ancora un piano, la pagina si apre qui.

### Montaggio — «com'è montato, e cosa cambio?»

Due colonne ridimensionabili: a sinistra l'anteprima, a destra il pannello; sotto, a tutta larghezza, la
timeline.

- **Anteprima**, in 9:16, con due modi; si apre su «Montato» se il video è montato, altrimenti su «Piano»:
  - **Piano**: mostra subito ciò che dice il risolto, componendo nel browser gli stessi strati del quadro
    (carta, animazione già resa, girato con la sua vista, sagoma, riquadro, inserto), i sottotitoli e il titolo,
    alle stesse misure di `stile.json`. Usa le copie leggere. Non ha la copertina. È la guida di chi corregge, non l'uscita.
    La sagoma sta dove la mette il montato (scala, posto della testa, bordo che sfuma) ricavandolo da `lavoro/teste.json`, che il montaggio scrive:
    prima del primo montaggio la posa è approssimata e l'anteprima lo dice. I testi sono disegnati sulla stessa tela, col carattere
    del motore, gli stessi a capo e gli stessi istanti (una parola in rilievo sta sola e salta; il titolo ha la sua parte); la
    larghezza delle parole può scostarsi di qualche pixel da quella del montato.
  - **Montato**: il video completo che dice il server (`montato` del dettaglio, `docs/API.md`): `uscite/con-copertina.mp4`, che è lo stesso file di `finale.mp4` col primo fotogramma
    della copertina, o `uscite/finale.mp4` se la copertina manca o è di un montaggio più vecchio. Se il piano è cambiato dopo l'ultimo montaggio lo dice, con la data del piano e «Chiedi nella chat di rimontarlo» (lo sa dal server, quindi anche dopo aver ricaricato la pagina).
- **Montaggio non aggiornato**: se il risolto è più vecchio del piano o dello stile, i ritocchi dei pezzi sono bloccati e una riga lo dice. «Il montaggio si sta ricalcolando…» solo se un `risolvi` di questo video gira o aspetta
  in coda; altrimenti «Il montaggio non segue ancora il piano o lo stile di adesso… chiedilo nella chat» (per esempio dopo un cambio di stile, che non rifà il risolto da solo all'avvio).
- I file di `uscite/` si chiedono con la data del file nell'indirizzo: un file rifatto si ricarica, non resta
  quello vecchio in memoria del browser.
- **Timeline**: righello in secondi; una riga per le scene; una per i pezzi (il fotogramma d'inizio di quel pezzo — finché il server non l'ha fatto, l'immagine del file —, onda della voce,
  bordi che si trascinano e si agganciano ai confini delle parole come le conta il motore (i tempi della trascrizione con lo sfasamento del piano, e dove il montaggio ha le parole allineate, i loro); in rosso i bordi che cadono nel
  parlato); una per le parole; una per le battute dei sottotitoli; una per titolo e suoni. La linea rossa del punto in cui sta il video,
  ingrandimento, scorrimento orizzontale dentro la timeline (la pagina non scorre di lato). Tasti, in tutta
  la scheda tranne dentro un campo: spazio avvia o ferma, frecce (un fotogramma dello stile; con Maiusc mezzo secondo; non sulle maniglie che le usano per allargare le colonne),
  `S` divide il pezzo dove sta la linea rossa, `Canc` toglie il pezzo o le parole scelte, `Ctrl+Z` / `Ctrl+Maiusc+Z`.
  Li dice il suggerimento al passaggio sulle righe della timeline, in parole («Spazio: avvia o ferma ·
  Frecce: un fotogramma avanti o indietro, con Maiusc mezzo secondo · S: dividi qui il pezzo · Canc: togli
  il pezzo o le parole scelte»); annulla e rifai li dicono i loro bottoni.
- **Gesti sui pezzi.** In un pezzo scelto a parole anche il bordo fra due parole (dove una pausa è stata tolta) si trascina: il pezzo si divide lì in due
  e il bordo spostato si scrive nella `rifila` di quello affacciato. Un pezzo trascinato sopra i vicini della sua scena cambia posto; lasciato
  su un'altra scena ci passa, e il menu «Porta in un'altra scena» del pannello fa lo stesso (in testa alla scena che viene dopo, in fondo a quella che viene
  prima). Non si sposta l'unico pezzo di una scena, né un pezzo che ha un punto dell'animazione della sua scena (un'ancora); un pezzo senza voce va
  solo in una scena che mostra la sola animazione. Il pezzo tiene la vista che aveva.
- Un pezzo senza voce (`docs/PIANO.md`) è un pezzo con un segno a righe al posto della miniatura, senza onda
  né bordi da trascinare; il suo pannello dice la durata e offre solo «Togli» e «Sposta»; non ha parole e
  l'anteprima mostra la sola animazione della scena.
- **Pannello** del pezzo scelto: sorgente, da e a al centesimo, vista, zoom (scala e centro, col punto
  da trascinare sull'anteprima), «Porta in un'altra scena», «Dividi qui», «Togli», «Sposta prima / dopo». Senza niente di scelto:
  quadro del video, modo dei sottotitoli, titolo, coda, e gli avvisi del risolto.
- **Parole**: il parlato del video come testo; un clic porta la linea rossa lì, selezionare e «Togli» le
  toglie dal montaggio, doppio clic corregge come si scrive.
- In alto «Annulla», «Rifai» e, mentre gira un montaggio, «Sto montando…». Sotto, **«Versioni · 4»** (`src/montaggio/Versioni.tsx`, solo se il piano ha versioni di prima): aperto, un elenco dal più recente con la data e l'ora («In uso adesso, dal 10 nov 2026, 15:30», «Fino al 10 nov 2026, 14:00») e quante scene e quanti pezzi scriveva ogni versione. Ognuna di prima ha **«Guarda»** (mostra com'era, scena per scena, cosa mostra e cosa dice, in sola lettura: niente cambia e niente si rende; non è l'immagine, perché l'anteprima «Piano» si compone dal montaggio calcolato, che per un piano vecchio non c'è) e **«Torna a questa»**, con conferma: il piano torna com'era, quello di adesso resta fra le versioni e il montaggio si ricalcola; il video montato cambia solo quando lo si rimonta. Una versione che non passa più i controlli (un file del girato che non c'è più) non torna e dice perché. Si vede anche quando il piano ha un errore, per tornare a uno che andava (`docs/API.md`, «La storia»). Ogni ritocco scrive il piano e il risolto si aggiorna da sé: un gesto è un solo `PATCH` con i soli campi che ha cambiato (`docs/API.md`), così ciò che Claude ha scritto nel frattempo in altri punti resta, e se ha cambiato proprio quel punto la riga dice «Il piano è cambiato nel frattempo», rilegge il piano e il gesto si rifà; se il risolto non c'è ancora, la scheda lo dice e dice di chiedere
  nella chat di calcolarlo. Un file del piano non ancora preparato è un avviso sotto l'anteprima, chiuso da «Per prepararlo, chiedilo
  nella chat.».

### Scheda — «cosa so di questo video?»

Il copione (aggancio, centro, chiusa, note; una riga dice che si corregge lì, anche a mano, e che la chat lo rilegge), la scaletta, didascalia e hashtag con «Copia», dove deve uscire, le pubblicazioni, i numeri per data in una tabella e il loro
andamento e le note.

Si scrivono tutti dalla pagina, e ogni cambio manda la scheda intera al server (`PUT /api/video/:slug/scheda`, validata sullo schema; se la rifiuta la frase dice perché e ciò che
era scritto resta nel campo). I testi si salvano uscendo dal campo.

- **La scaletta** (passi numerati: cosa aprire, cosa fare, cosa spiegare): ogni campo si scrive, un passo si sposta su e giù e si toglie, e in fondo se ne aggiunge uno scrivendo cosa
  aprire. «Cosa aprire» non può restare vuoto; «cosa fare» e «cosa spiegare» svuotati spariscono dal passo. Senza passi la sezione c'è lo stesso, con il campo per il primo.
- **Gli hashtag**: si aggiungono scrivendoli (anche più di uno insieme, con o senza `#`, senza doppioni) e si tolgono con la croce. Senza hashtag la lista sparisce dalla scheda.
- **Dove deve uscire** (`canali`): TikTok, Instagram, YouTube, X da spuntare. Senza nessun canale la chiave sparisce dalla scheda (lo schema ne vuole almeno uno).
- **Dove è uscito** (`pubblicazioni`): per ognuna canale, giorno e ora, indirizzo (con «Apri l'indirizzo») e «Togli»; sotto, una riga per aggiungerne una, dove giorno e ora sono
  obbligatori e il canale parte dal primo dei canali del video. Un canale scritto nel file e fuori dall'elenco si vede e non si perde. Un indirizzo vuoto toglie la chiave.

### Controllo — «c'è qualcosa che non va?»

L'esito dell'ultimo controllo: silenzi rimasti, parole fuori posto, tagli nel parlato, differenze fra
voluto e sentito; ogni riga porta l'anteprima a quel secondo. Sotto, le cose da verificare segnate dal
controllo dei contenuti, da spuntare. Se c'è un montato, sotto la data una riga dice che per controllarlo di nuovo si chiede nella chat. Se il montato è più nuovo del
controllo, lo dice.

### Copertina — «con che faccia esce?»

La copertina, il video con la copertina in testa (solo se è del montaggio di adesso: se è di uno vecchio dice di rimontare, e se la copertina è stata rifatta dopo il montaggio dice che il video non ce l'ha ancora), i disegni in `materiali/`. La copertina entra nel video col montaggio: non c'è un secondo video da fare.

### File — «dove sono i file?»

Le uscite con peso e data (`finale.mp4` e `con-copertina.mp4` sono lo stesso file: una riga sola, che dice «è anche …»), «Mostra nella cartella», «Copia il percorso»; il girato usato, con il rimando
alla sua riga in Girato.

## Girato — «cosa ho girato, e cosa ne ho fatto?»

Per giorno, dal più recente, a griglia: più file sulla stessa riga. Ogni file: miniatura (c'è appena il file entra, senza prepararlo), nome, durata, tipo, da dove viene, in quali video è
usato (o «mai usato»). Una foto (HEIC, JPEG, PNG… dall'estensione) si chiama «Foto» e si apre sull'immagine: la foto intera che prepara il motore (`preparato.foto`), altrimenti l'originale se il browser lo apre,
altrimenti la miniatura; senza nessuna dice che non è ancora pronta. Una foto non ha né «Tipo» né parlato: restano «Da dove viene», le note e dove è usata.
Aprendo un video: il lettore (la copia leggera se c'è, altrimenti l'originale; se il browser non lo apre lo dice), il parlato con i tempi (un clic salta lì), le note,
«Non ancora preparato» se manca qualcosa, e una riga che dice cosa chiedere nella chat: «Per preparare questo file o farne un video nuovo,
chiedilo nella chat.», o solo il video nuovo se il file è preparato. **«Aggiungi video»** (in testa alla pagina, e nel Girato vuoto) apre la finestra di scelta dei file del computer, più file insieme, e i file lasciati sulla pagina fanno lo stesso: mentre si trascinano, un riquadro tratteggiato copre la vista (non la chat) e dice dove rilasciare. I file entrano nel girato di oggi uno dopo l'altro,
come quelli del telefono (`docs/API.md`, «Aggiungere un file dal computer»); sotto la testata un elenco mostra per ognuno l'avanzamento (percentuale, byte partiti, «il computer lo sta salvando»), «Aggiunto al girato», oppure perché non è entrato (non è un video, una foto o un audio; è già nel girato; è troppo grande; manca spazio sul computer), e resta finché non lo si chiude con «Chiudi l'elenco». Nell'app un file lasciato sulla finestra arriva col suo percorso e il server lo collega, senza copiarlo se sta sullo stesso disco; nel browser (anche dal telefono) il file parte col suo contenuto. Filtri: mai usati, per tipo. In testa alla lista, **«Cerca nel parlato»** (`src/girato/CercaNelParlato.tsx`, solo se c'è almeno un file): dalla seconda lettera, dopo un attimo, la lista dei giorni e i filtri lasciano il posto ai risultati, raggruppati per file (nome e giorno) con il secondo e la frase intorno, le parole trovate in evidenza (`GET /api/grezzo/cerca`, `docs/API.md`: senza badare a maiuscole e accenti). Un clic apre il file a quel punto (`#/girato?file=…&t=12.5`: il lettore va a quel secondo e il dettaglio torna in vista). Dice quanti sono in tutto se i risultati sono più di cento, cosa provare se non c'è niente, e di quanti file il parlato non si legge. Senza file propone prima **«Aggiungi video»**, poi dice che si può mandare dal telefono, e ha «Apri la cartella del girato». In testa una riga sul telefono, quanto serve mentre si riceve un file: se può mandare («Il telefono può mandare i file») e gli ultimi arrivati; se è spento manda a «collega un telefono», se non è pronto dice perché; in ogni caso un collegamento porta a Impostazioni › Telefono, dove sta il resto.
Se la scheda di un file non passa i controlli, la pagina del file lo dice con una frase semplice (chiedere nella chat di sistemarla) al posto di «sto ancora leggendo il file»; il perché preciso sta in un riquadro che si apre a richiesta.

## Canale — «come va il mio canale?»

Tre schede di una voce: **Pubblico**, **Classifica**, **Crescita** (`#/canale/pubblico`, `#/canale/classifica`, `#/canale/crescita`; gli indirizzi di prima, `#/pubblico`, `#/classifica`, `#/crescita`, portano alla scheda giusta, e `#/canale` a Pubblico). La voce compare in barra solo quando c'è un canale letto (l'ultima lettura di `GET /api/canale/tiktok` esiste); per un creator nuovo non c'è, e la prima lettura si chiede da Impostazioni › Profilo («Leggi i dati di TikTok» accanto ai canali), da Produzione o dalla chat («aggiorna i dati di TikTok», skill `scarica-tiktok`). Finché non c'è nessuna lettura, da ogni indirizzo del canale la pagina è una sola: cosa farà, e un pulsante che apre la chat con la richiesta giusta. La pagina ha un titolo solo, «Canale»; le schede non ripetono il proprio.

Se una rilettura dal server fallisce e restano i dati di prima, la scheda lo dice in cima («Dati del 3 nov 2026, 10:00: l'ultima rilettura non è riuscita.» con «Riprova»; `DatiVecchi` in `src/comuni/Stati.tsx`) invece di mostrarli come se fossero freschi. Una scheda senza i suoi dati (la classifica o il piano non fatti) dice cosa manca, in due righe, con un pulsante che apre la chat con la richiesta giusta (`src/comuni/PaginaVuota.tsx`); il pulsante segue i canali del profilo (`GET /api/profilo`, `canali`): senza canale «Collega un canale», con TikTok «Leggi i dati di TikTok» (la conversazione è sempre di Claude Code, che ha il browser del creator, anche se di solito si sceglie Mango Code: la scelta ricordata non cambia), con un solo altro canale la pagina dice che la lettura automatica non c'è ancora e propone di far guardare alla chat il profilo pubblico, con il permesso del creator.

- **Pubblico — «cosa dice il pubblico, e come vanno i video usciti?»** L'ultima lettura del canale: quando è stata fatta e cosa le manca; follower e mi piace del profilo; la tabella dei video usciti con data e numeri e, in blu, la crescita dalla lettura precedente; i rapporti ogni 1000 visualizzazioni; i commenti del video scelto, con quelli nuovi segnati (se non si leggono, «Riprova»); i messaggi privati. L'intestazione di una colonna ordina la tabella, un secondo tocco la rovescia.
- **Classifica — «a che punto sono fra i profili con cui mi confronto?»** I profili in archivio con posto, nome, follower, mi piace, visualizzazioni mediane e punteggio; la riga del creator è segnata e un riquadro fisso dice a che posto è. Si riordina per punteggio o per uno dei numeri.
- **Crescita — «dove sono su TikTok, dove devo arrivare, e come?»** Il piano del canale (`crescita.json`) accanto alle letture vere: da dove viene (follower e grafico delle letture), dove andare (le tappe, con lo scenario scelto), cosa fare questa settimana, cosa porta follower per tipo di video. I numeri cambiano a ogni lettura; il piano lo riscrive Claude.

## Produzione — «quanti video faccio, quanto lavoro di Claude costano e cosa rendono?»

Legge ciò che sta in archivio e i conti di Claude, e come Canale non aggiorna niente da sé (la lettura del canale si chiede nella chat; senza lettura la pagina lo dice). Un video è **fatto** quando è pronto o pubblicato (data della prima uscita, o dell'ultima modifica). Tre righe (ultima settimana, ultimo mese, da sempre) con quanti video e, in media, il lavoro di Claude; i video fatti con più e con meno lavoro; una riga per video con lavoro, visualizzazioni, minuti di lavoro ogni 1000 visualizzazioni, mi piace e nuovi follower dall'ultima lettura del canale. Si aggiorna da sola; finché il server legge le conversazioni avverte che i conti sono parziali. Il lavoro fatto con Mango Code non è contato. È una voce a sé, e non una scheda di Canale, perché serve a ogni creator, anche a chi non ha un canale letto; senza video fatti dice come cominciare.

## Impostazioni — «dove cambio le cose che valgono sempre?»

Una pagina con cinque sezioni, come schede (`#/impostazioni/profilo`, `/stile`, `/computer`, `/telefono`, `/generali`; `#/impostazioni` apre il Profilo). Gli indirizzi di prima, `#/stile` e `#/motori`, portano a Stile e a Computer, con la voce «Impostazioni» accesa. La pagina non ha un titolo suo: ogni sezione ha il proprio.

- **Profilo — «chi sono per Mango Animation?»** I campi di `profilo.json` che il creator corregge a mano (`docs/PROFILO.md`): il nome e la lingua in cui parla; il pubblico (livello, lingua, testate, separate da virgole); i canali (piattaforma, nome, formato; si aggiungono e si tolgono); cosa non dice, una cosa per riga. Si salvano insieme con «Salva» (`PUT /api/profilo`): il server li fa passare dallo schema e, se non vanno, la frase dice quale campo e perché, e il form resta com'è scritto. «Annulla le modifiche» torna a ciò che c'è nel profilo. Ciò che la chat scrive nel profilo compare qui da solo (evento `profilo`); se cambia mentre si sta scrivendo, la pagina lo dice e offre «Ricarica dal profilo» invece di sostituirlo in silenzio. Il testo sopra i campi ricorda che si può anche dire in chat. Accanto ai canali, con TikTok, «Leggi i dati di TikTok» apre la chat con la richiesta (conversazione di Claude Code): è il modo di avere la prima lettura, che fa comparire «Canale» in barra; per gli altri canali dice che per ora si leggono solo i numeri di TikTok. Senza profilo la sezione propone soltanto il primo giro in chat («Fai il primo giro», che parte con l'Opus come quello che si apre da solo) e non offre i campi: un profilo scritto a mano prima del giro lo farebbe sembrare fatto. Se `profilo.json` non passa lo schema (l'avviso rosso sotto la barra dice perché) la sezione non offre i campi: finché non è corretto da qui non si cambia niente (`PUT /api/profilo` risponde `409`). Le altre sezioni del profilo (`macchina`, `motori`, `fonti_delle_idee`) non si cambiano da qui: `motori` e `macchina` stanno in Computer.
- **Stile — «quali sono i miei standard?»** La pagina Stile (sotto), ospitata come sezione.
- **Computer — «cosa fa girare il mio computer?»** La pagina dei motori (sotto), ospitata come sezione.
- **Telefono — «come collego il telefono?»** Il riquadro **«Arrivi dal telefono»**: spento di base («Collega un telefono» lo accende; «Scollega i telefoni» lo spegne); acceso e pronto, dice che il telefono può mandare i file e mostra l'indirizzo con «Copia l'indirizzo», due codici da inquadrare (**iPhone: la Scorciatoia**, **Qualsiasi telefono: carica dalla pagina**) e gli ultimi arrivati; se non può arrivare dice perché, con «Controlla di nuovo». Sotto, **«Lo studio dal telefono»**: spento di base; «Accendi»
mostra due strade, **In casa** (stesso Wi-Fi) e **Fuori casa (Tailscale)**, ognuna col suo codice da inquadrare, l'indirizzo e «Copia il link»; il telefono entra una volta col link e poi si ricorda.
Dice che chi ha il link può far lavorare la chat sul computer. Con «Spegni» lo studio sulla rete smette di rispondere, chi era entrato esce
subito e il link cambia (riaccendendo si inquadra il codice nuovo); «Rifai la chiave» dà un link nuovo e i telefoni già entrati devono rientrare.
Senza Tailscale sul computer la strada di fuori casa lo dice; se Windows non lascia entrare dalla rete di Tailscale lo dice e spiega dove sbloccarlo, con «Controlla di nuovo».
Il riquadro dello studio c'è solo aperto dal computer (`127.0.0.1`): dal telefono non si cambia l'accesso. Nel Girato resta solo la riga con cosa arriva.
- **Generali.** La **cartella dei dati** (solo nell'app, `docs/APP.md`): dice dove stanno i video e il girato, e «Sposta la cartella dei dati…» apre la scelta di sistema. La nuova cartella vale dal prossimo avvio, e all'avvio l'app sposta i file prima di accendere il server (con avanzamento e annulla, `docs/APP.md`): la sezione lo dice. Se la cartella è fissata all'avvio (`MANGO_ANIMATION_LAVORO`), dice che da lì non si cambia e non offre di spostarla. **Lingua e tema**: due scelte, la lingua (del sistema, italiano, inglese) e il tema (del sistema, chiaro, scuro); valgono per questo schermo e si ricordano nel browser. **Guida**: «Apri la guida» apre nel browser la guida (`docs/guida/`) nella lingua dello studio.

### Stile (Impostazioni › Stile)

In ordine: **Parti da uno stile**, tre cartoline affiancate (Scuro, Caldo, Vivace: `stili-di-partenza.json`, `GET /api/stile/partenza`), ognuna con un cartello di esempio disegnato con i calcoli e il carattere dell'anteprima del montaggio (`src/stile/CartolineDiStile.tsx`) e «Usa questo», che mette nella bozza colori, sottotitoli, titolo e i due caratteri dello stile e lascia il resto (quadri, voce, tagli); si salva con «Salva» e si annulla con «Annulla le modifiche», e se ci sono già modifiche all'aspetto non salvate (che non siano quelle di un'altra cartolina) una riga chiede conferma prima di sostituirle; i colori (con il nome di ciò che fanno: «Sfondo», «Testo», «Linee»; il codice esadecimale sta nel suggerimento del campione); il
cartello dei sottotitoli e il titolo resi nel loro carattere, con le scelte del carattere (dei sottotitoli e delle animazioni, del titolo: i caratteri del prodotto e quelli del creator col nome letto dal file) e «Aggiungi un carattere», che porta un file `.ttf`, `.otf` o `.woff2` nella cartella dei caratteri del creator (`POST /api/caratteri`; un file che non va o più grande di 5 MB dice perché); la voce, coi livelli in decibel sotto «Avanzate»; i tagli; il video che esce; in fondo ogni quadro disegnato in scala, con le aree degli strati, dei sottotitoli e del titolo. I valori
si cambiano e si salvano; un valore non valido dice perché. Se lo stile cambia nel file mentre c'è una bozza aperta, una riga lo dice con due scelte, «Tieni le mie» e «Prendi le nuove», e finché non si sceglie «Salva» è spento. La persona sta «con la testa al centro» o spostata a mano di tanti px
(nel disegno, con la testa al centro, la sagoma è centrata).

### Computer (Impostazioni › Computer)

Le funzioni pesanti del prodotto (capire cosa dico, tagli precisi sulle parole, la mia sagoma, seguire la persona nelle riprese larghe, voce pulita, dettare alla chat), una per riga: cosa fa e
cosa succede se è spenta, un interruttore («La voglio» / «Spenta») e, per quelle che hanno una scelta, **dove gira**: «Come decide il computer» (nessuna indicazione nel profilo: la scheda
che il profilo nomina, altrimenti quella che c'è, altrimenti il processore), «Scheda video» o «Processore»; la voce pulita gira solo sul processore e non ha scelta. Ogni cambio scrive la sezione
`motori` del profilo attraverso il server (`PUT /api/motori`, validata sullo schema: se la rifiuta la frase dice perché e la scelta resta com'era) e la pagina si aggiorna da sola anche
se il profilo lo cambia un altro. Se la scelta non può partire (la scheda manca o è occupata) il lavoro si ferma e lo dice: non passa da solo al processore. Il modello e il calcolo della
trascrizione si cambiano nel profilo e la pagina li lascia com'erano.

In cima, **Questo computer**: scheda NVIDIA con memoria libera e totale e capacità di calcolo, processore e thread, memoria, disco libero dove l'app scarica, misurati dall'app
(`window.__MANGO_ANIMATION__.computer`, `docs/APP.md`) e rimisurati con «Controlla di nuovo». Sotto ogni funzione una frase dice dove gira davvero con la scelta di adesso e se basta
(memoria della scheda, RAM per il modello grande, thread per la sagoma sul processore); «Scheda video» è spenta dove la scheda non c'è o il profilo la esclude (`macchina.scheda_video`,
`GET /api/macchina`), così una scelta impossibile si vede prima di salvare e non al primo lavoro. Nel browser, senza l'app, la sezione dice che il controllo del computer c'è solo nell'app.

## Regole

- Tre larghezze: 1400, 1000 e 430 px. La pagina non scorre mai in orizzontale; ciò che deve scorrere
  per conto suo scorre lì, e un'ombra sul bordo dice dove c'è altro (le tabelle: `scorri-con-segno`, `src/theme.css`). Chi sta accanto alla chat (a 860 px la vista è larga la metà) si stringe in base alla sua larghezza e non a quella dello schermo: query su contenitore, sull'involucro interno della pagina e non su `<main>`.
- Un vuoto o un errore dice perché e cosa fare, nella lingua in uso. Niente slug, percorsi, nomi di comandi o di
  file JSON nei testi, tranne la cartella del video da copiare e i nomi dei file in «File» e «Girato».
- Testi, numeri e date nelle due lingue, da `src/lingua.ts` (`t("italiano", "inglese")`) e `src/testo.ts` (`1,5 s` e `7 ott 2026, 13:15` in italiano; `1.5 s` e `7 Oct 2026, 13:15` in inglese).
- Niente polling: un solo `EventSource` su `/api/eventi`; una vista rilegge solo ciò che il messaggio
  dice cambiato.
- Colori solo dai token.

## Verificare nel browser

Gli script di `studio/verifica/` guidano un browser vero (Playwright) e dicono in testa cosa provano. `bun run foto` in `studio/` fotografa ogni vista e scheda a 1400, 1000 e 430 px, nel tema chiaro e nello scuro, e fallisce se la pagina scorre in orizzontale, se un controllo esce dal bordo, se una vista resta su «carico…» o se la console ha errori. Quelli contro un server vero vogliono un server di prova su una porta libera (`MANGO_ANIMATION_PORTA`, mai quella in uso) con la stessa `MANGO_ANIMATION_LAVORO`; chiudono solo i processi che hanno avviato, per PID.
