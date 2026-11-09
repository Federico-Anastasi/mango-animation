# L'interfaccia

Una pagina nel browser su `http://127.0.0.1:47431`. Qui si guarda e si ritocca, e a destra c'è la chat con Claude
(sotto, «La chat»). Ogni schermata risponde a una domanda sola. L'aspetto è quello di `base`: carta
`#F1F0EB`, inchiostro `#17171B`, rosso, blu, filo; Archivo per i titoli, Instrument Sans per il testo,
Chivo Mono per numeri e tempi; niente ombre morbide, sfumature, bagliori; tema scuro dai token.

Lo studio serve a guardare e a decidere; i lavori (preparare, calcolare e montare, controllare, rendere le slide) e i video nuovi si
chiedono nella chat. Dove servirebbe uno di questi, la pagina dice a che punto è e, una volta per vista, in una riga di testo secondario,
cosa si può chiedere nella chat («Per montare, rimontare o cambiare il video, chiedilo nella chat.»); nessun bottone scrive nella chat.
A mano restano i ritocchi del montaggio, lo stile, le parole della scheda e i gesti che la chat non fa (fermare un lavoro, registrare,
togliere una proposta).

## La cornice

Barra in alto: **Video**, **Girato**, **Pubblico**, **Classifica**, **Crescita**, **Produzione**, **Stile**, **Motori** (a 430 px le voci vanno su due righe); a destra lo stato dei lavori (cosa sta girando e cosa
aspetta, si apre in un pannello con le ultime righe e «Ferma»; sotto il lavoro in corso, quanto dura e verso che ora finisce
(«circa 4 min, finisce verso le 15:42», dalla stima del server), o che non si sa ancora se non ci sono abbastanza lavori uguali
finiti; se il piano del video in montaggio è cambiato dopo la partenza,
la barra dice «Piano cambiato» con un punto esclamativo rosso, e nel pannello, sotto quel lavoro, una frase spiega che il montaggio
ripartirà da solo, che per non aspettare si ferma con «Ferma» e si chiede nella chat di rimontarlo), lo stato degli arrivi dal telefono, **Chat**
(apre e chiude la chat, `Ctrl+J` da qualunque vista; il punto rosso dice che Claude lavora o aspetta una risposta) e
**Registra**: un pannello dove si sceglie cosa registrare (solo lo schermo, schermo e voce, schermo voce e
viso) e si avvia; per le voci con il microfono e per il viso anche quale microfono e quale webcam, fra quelli trovati: la scelta si ricorda
nel browser e vale finché il dispositivo c'è, altrimenti il pannello torna al primo trovato (alla prima webcam non virtuale). Mentre registra la barra mostra il tempo passato e dal pannello si ferma. I file finiscono
nel girato di oggi.

**Lingua.** L'interfaccia è in italiano e in inglese. Un pulsante accanto al tema (la sigla della lingua in uso, `IT` o `EN`) passa dalla scelta del sistema all'italiano
all'inglese: senza scelta vale la lingua del sistema (italiano per chi parla italiano, inglese per tutti gli altri); la scelta si ricorda nel browser e cambiandola la pagina si
ridisegna da capo. Numeri, tempi e date seguono la lingua (`1,5 s` e `7 ott 2026` in italiano, `1.5 s` e `7 Oct 2026` in inglese). Le frasi che scrivono il server e il motore (un rifiuto, un errore,
un avviso) escono nella lingua dello studio (`docs/API.md`, «La lingua delle frasi»), e così quelle dell'app e del suo motore di dettatura (`docs/APP.md`, «La dettatura»). I nomi dei quadri dello stile di serie
(il menu «Quadro del video») hanno il loro nome inglese nello studio (`nomeQuadro`, `src/testo.ts`); un quadro aggiunto dal creator si chiama come l'ha chiamato lui. Restano in italiano i testi dei file di dati (il piano di crescita, le note), quelli di Claude
e le eccezioni che `docs/API.md` elenca.

**Cartella dei dati** (solo nell'app, `docs/APP.md`): un bottone con la cartella apre un pannello che dice dove stanno i video e il girato, e
«Sposta la cartella dei dati…» apre la scelta di sistema. La nuova cartella vale dal prossimo avvio, e all'avvio l'app sposta i file
prima di accendere il server (con avanzamento e annulla, `docs/APP.md`): il pannello lo dice. Se la cartella è fissata all'avvio (`MANGO_ANIMATION_LAVORO`), il pannello dice che da lì non si cambia e non offre di spostarla.

**Segnala un problema** (solo nell'app, `docs/APP.md`, «Le segnalazioni dei problemi»): un bottone con la bandierina, accanto a lingua e tema, apre un pannello con un campo facoltativo, l'interruttore della schermata e «Invia»; la vista d'errore comune offre lo stesso modulo («Segnala il problema») con il suo messaggio.

**Profilo da correggere**: se `profilo.json` non passa lo schema (`GET /api/profilo`, `valido: false`) sotto la barra compare un avviso rosso: lo studio lavora con l'ultimo profilo buono (o senza),
si può chiedere nella chat di correggerlo o correggere il file a mano, e sotto stanno le frasi di ciò che non va. Compare e sparisce da solo con l'evento `profilo`; cambiando lingua le frasi si rileggono nella lingua nuova.

## La chat — «parlo con Claude, accanto a ciò che sto guardando»

Un pannello a destra delle viste (a 1400 e 1000 px), largo 420 px di partenza: si trascina il bordo sinistro (o si usano le frecce sul
bordo a fuoco; il doppio clic torna alla larghezza di partenza); la larghezza e l'essere aperta si ricordano nel browser. A 430 px la chat
prende tutto lo schermo, sopra la vista, col bottone «Torna alla vista»; un collegamento a un video scopre la vista. La testata dice il titolo della conversazione e, sotto, come sta («Pronta», «Sta lavorando», «Aspetta una tua risposta»), il tempo di lavoro di Claude in tutta la conversazione, «Sta lavorando · 12:14» (la somma delle risposte: va avanti mentre Claude lavora e resta ferma mentre aspetta il creator, `docs/CHAT.md`, `lavoro`; ogni risposta dice il suo tempo in fondo, «Fatto in 42 s») e quanto è pieno il contesto («Contesto 52%», con una barretta che sopra il 70% diventa arancione e sopra il 90% rossa; senza la misura del modello, «Contesto 146 mila token»; al passaggio, i token esatti e cosa succede quando si riempie). Ha l'elenco delle conversazioni (si riprende una vecchia, anche una aperta da terminale), «Nuova conversazione» e «Chiudi». Solo una conversazione di Mango Code dice con chi si parla: il suo segno e «Mango Code», che lo dice anche l'invito di una conversazione nuova (i motori stanno in `studio/src/chat/motore.ts`). L'assistente di Claude non ha né nome né segno nella chat. Finché una conversazione si sta aprendo, o non si apre, la testata non dice nessun motore e le frasi della chat non ne nominano uno.
**Il primo giro**: finché il creator non ha un profilo (`GET /api/profilo`, `presente: false`) la chat si apre da sola, più larga, e manda a Claude
il primo messaggio; Claude comincia la skill `welcome` (`docs/CHAT.md`, «Il primo giro»). Sopra la conversazione sta un «Salta» discreto, che
ferma Claude e non fa ripartire il giro; dalla chat vuota «Rifai il primo giro» lo rifà quando si vuole. La scelta di saltare o di aver cominciato si ricorda nel browser.

Senza una conversazione la chat si apre su un
invito (cosa fa: «Lavora sui tuoi file e monta i video, con il Claude Code installato sul computer») e sulle ultime conversazioni. Se una conversazione non si apre (per esempio perché è di Mango Code e Mango Code è spento) la chat dice perché, con «Riprova».

- **La conversazione.** I messaggi del creator a destra, quelli di Claude a tutta larghezza. Il testo di Claude è in markdown (titoli, elenchi,
  tabelle, citazioni; il codice in carattere a spaziatura fissa con «Copia») e arriva a pezzi senza scatti. Il pensiero sta chiuso
  («Ha ragionato»). Ogni strumento è una riga: icona, cosa fa in parole («Legge docs/PIANO.md», «Lancia: bun test», «Video · lavoro
  monta cinque-errori»), «in corso…» finché non finisce (dopo tre secondi diventa «in corso · 0:42» e va avanti da sé), «non riuscito» se è andato storto; un
  passo che è durato almeno cinque secondi dice quanto («2 min 5 s»), uno breve no; un clic mostra cosa ha chiesto e cosa è tornato.
  Le immagini degli strumenti (foto dei video, slide) stanno nella conversazione e al clic si aprono a tutto schermo. Scorre da sola in
  fondo solo se chi legge è già in fondo; se è salito a rileggere resta dov'è e compare «Vai in fondo». Mentre il motore lavora, sotto l'ultimo messaggio,
  il passo che sta facendo adesso e da quanto (il tempo di tutta la conversazione è nella testata): «Sta pensando · 0:42», da quando è finito
  l'ultimo strumento o è arrivato l'ultimo messaggio (e, all'inizio, da quando il server dice che è partito il giro, quindi riaprendo la chat
  non riparte da zero); con uno strumento in corso «Aspetta lo strumento · 0:06», da quando è partito. In una conversazione di Mango
  Code dice «Mango Code». Alla fine di un giro: «Fatto in 1 min 12 s», o in rosso perché si è fermato.
- **I tempi attesi.** Un tempo che il creator sta aspettando ha un leggero risalto (un fondo azzurro tenue): la stima di un lavoro nella sua scheda
  («circa 4 min, finisce verso le 15:42», e «circa 4 min» dopo «In attesa da 1 min 15 s» se è in coda; «più del previsto» se sfora) e nel pannello
  dei lavori, e quelli che Claude scrive nel testo: una durata approssimata («circa 3 minuti», «~40 s», «qualche minuto», «meno di un minuto»), una durata
  che la frase dà per ciò che manca («ci vorranno 90 secondi», «tra 2 minuti»), un orario previsto («verso le 15:42», «finisce alle 15:42»), in italiano e in
  inglese (`studio/src/chat/stime.ts`). Non si segna una durata passata o un fatto («Fatto in 6 minuti», «un video di 40 secondi», «3 minuti fa»), un
  conteggio («3 video») o un'ora senza contesto («alla scena 15:42»); nel codice, in linea o a blocco, niente. I cronometri sono un orologio della pagina
  (un solo timer al secondo, acceso solo finché qualcosa corre).
- **Il modello e l'effort.** Nella testata, sotto il titolo, due menu: **Modello** («Predefinito (Sonnet 5.5)», «Opus 5.5», «Sonnet 5.5», …:
  i modelli che Claude Code offre, e dopo quelli di Mango Code se è acceso, «Mango Code · …»; una conversazione resta dell'uno o
  dell'altro; quando il menu li offre tutti e due sono due gruppi, «Claude» e «Mango Code»: è l'unico posto in cui la chat scrive «Claude») ed **Effort** («Predefinito», «Basso», «Medio», «Alto», «Molto alto», «Massimo»: solo i livelli che il modello
  ha; senza livelli il menu non compare, come con Mango Code). Una conversazione già iniziata offre solo i modelli del suo motore (il server non cambia motore a conversazione aperta); una nuova li offre tutti. Se Mango Code è spento, il menu di una sua conversazione dice «Mango Code (spento)». Cambiano la conversazione aperta dal messaggio dopo, senza interromperla, e l'ultima scelta diventa quella delle
  conversazioni nuove (ricordata nel browser). Se Claude Code non accetta il cambio i menu restano com'erano e una riga rossa dice perché.
- **Le richieste.** La chat salta sempre i permessi di Claude Code (`docs/CHAT.md`, «I permessi»): arrivano le sue domande e, da Mango Code,
  i permessi che le sue regole chiedono. Un permesso dice cosa si vuole fare e ha «Consenti», «Consenti sempre» (per quello strumento, fino alla fine
  della conversazione) e «No», con un campo per dire perché (facoltativo). Una domanda ha le opzioni come bottoni con la loro descrizione,
  «Altro» con un campo di testo, e se ce n'è più d'una un solo «Invia le risposte». Finché non si risponde la conversazione sta ferma e il
  bottone Chat nella barra lo dice, anche a chat chiusa.
- **I lavori in background.** Quando Claude aspetta un comando lungo o un sottoagente (dopo qualche secondo), accanto a «Sta
  lavorando · 2:14» compare **«Manda in background»**, e vale anche `Ctrl+B` (solo se c'è qualcosa da spostare; altrimenti il tasto resta al
  browser): il lavoro continua da solo, Claude va avanti e legge subito ciò che il creator ha scritto. Il messaggio in coda lo dice: «In coda: sarà
  letto quando finisce il lavoro in corso. Con Ctrl+B si legge subito.» (con Mango Code, che non ha lavori in background: «In coda: Mango Code lo legge appena finisce.») Ogni lavoro in background è una scheda sotto la conversazione: cosa
  fa, se è un comando o un sottoagente, «In background da 1 min 5 s» che va avanti, e «Ferma»; sparisce da sola quando il lavoro finisce. Se il
  server rifiuta, una riga rossa dice perché. Con Mango Code non compaiono (`docs/CHAT.md`, «I lavori in background»).
- **Il campo di testo.** Invio manda, Maiusc+Invio va a capo. Il campo dice con chi si parla solo per Mango Code («Scrivi a Mango Code»; per Claude «Scrivi un messaggio»); mentre il motore lavora si può scrivere e mandare («Scrivi pure: il messaggio va in coda», «Mango Code sta lavorando: …»: il messaggio resta «in coda»
  finché lo legge) e c'è «Ferma»; mentre aspetta una risposta del creator dice «Aspetta una tua risposta qui sopra». Un'immagine incollata dagli appunti (anche uno screenshot), un file trascinato sul pannello, scelto con la graffetta o
  (nell'app) copiato in Esplora risorse e incollato, uno o più, diventa un allegato, con anteprima se è un'immagine e la x per toglierlo;
  il testo copiato resta testo; un allegato da solo basta. Un file incollato oltre i 16 MB (un video) si collega senza copiarlo; uno
  trascinato oltre i 16 MB non sale, e la riga dell'allegato dice di incollarlo da Esplora risorse. Ciò che è scritto e non mandato resta se si chiude la chat e la si riapre.
- **Il microfono** (solo nell'app Mango Animation, `docs/APP.md`; nel browser non c'è). Un clic sul microfono accanto alla graffetta, o
  `Ctrl+Spazio`, comincia a dettare; un altro clic finisce, e il microfono torna subito cliccabile. Mentre ascolta il bottone è rosso e pulsa, e
  sopra il campo una striscia dice «Ti ascolto» col tempo e il livello della voce. La prima dettatura dopo l'apertura dell'app, mentre il
  modello si carica (una decina di secondi), la striscia dice «Preparo la dettatura…» e «Puoi già parlare»: il microfono ascolta, le parole
  compaiono appena è pronta. Le parole entrano nel campo mentre il creator parla (con circa un secondo e mezzo di ritardo sulla prima parola, poi
  una volta al secondo; sul processore, senza scheda NVIDIA, il doppio), nel punto del cursore o al posto di ciò che è selezionato: la frase
  in corso si sostituisce man mano che cresce, quando è finita si chiude e la successiva comincia dopo. Se il creator scrive mentre detta, la frase
  in corso riparte dal cursore di adesso. Le ultime parole che il motore consegna dopo la fine entrano ancora nel campo. Niente parte da
  solo: il creator rilegge e manda con Invio, e mandare (Invio o «Manda») spegne il microfono: ciò che il motore consegna dopo non torna nel campo
  vuoto. Il testo lo dà un motore locale (faster-whisper): l'audio non lascia il computer e non serve nessun login. Se manca il microfono o
  Python, la striscia lo scrive in rosso e il bottone resta com'era. Chiusa la chat il microfono si spegne.
- **Cosa sa Claude di dove sei.** Con ogni messaggio parte, senza che il creator lo scriva né lo veda, il video e la scheda che ha aperti
  (`docs/CHAT.md`, «contesto»): «questo carosello» basta.
- **I video nelle risposte.** Il nome di un video e i percorsi della sua cartella (`archivio/video/<nome>/…`) sono collegamenti che aprono la
  vista giusta. Un lavoro messo in coda da Claude si vede nella conversazione come scheda viva: in attesa, o in corso con quanto va,
  la stima, la fine prevista e «Ferma»; poi com'è finito.

## Video — «a che punto sono i miei video?»

Cinque gruppi per stato, in quest'ordine: in lavorazione, proposte, pronti, pubblicati, scartati (chiuso).
Ogni video è una carta: copertina o miniatura (per un carosello la prima slide, per una proposta la sua anteprima), titolo, durata (o «carosello»), serie, e per i pubblicati data e ultimi
numeri. Una proposta senza anteprima ha accanto un segno tratteggiato, «senza anteprima»: non è un errore, dice che manca l'immagine con cui si presenta (`docs/ARCHIVIO.md`, «L'anteprima»); sparisce da solo appena il file c'è, e un'anteprima rifatta si ricarica da sola. Cerca per titolo; filtra per serie. Sotto il titolo, «Per un video nuovo, chiedilo nella chat.»: il video (o il carosello) nasce dalla chat,
come proposta e con la sua anteprima. «Dal telefono» (anche nella
pagina di un video) mostra il codice da inquadrare col telefono nel Wi-Fi di casa: apre la pagina coi video montati,
ognuno nella versione completa, da salvare nella schermata Home.

## La pagina di un video

Testata: titolo (si cambia sul posto), stato (si cambia da un menu), la cartella da copiare per Claude,
«Apri la cartella», «Dal telefono». Sotto la testata, se la scheda o il piano scritti nel file non passano i controlli, un avviso dice con una frase
semplice di chiederne la correzione nella chat, e il perché preciso (per chi la sistema) sta in un riquadro che si apre a richiesta
(la scheda mostrata è l'ultima valida); sparisce da solo appena il file è corretto. Sotto, cinque schede.

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
- **Montaggio non aggiornato**: se il risolto è più vecchio del piano o dello stile, i ritocchi dei tratti sono bloccati e una riga lo dice. «Il montaggio si sta ricalcolando…» solo se un `risolvi` di questo video gira o aspetta
  in coda; altrimenti «Il montaggio non segue ancora il piano o lo stile di adesso… chiedilo nella chat» (per esempio dopo un cambio di stile, che non rifà il risolto da solo all'avvio).
- I file di `uscite/` si chiedono con la data del file nell'indirizzo: un file rifatto si ricarica, non resta
  quello vecchio in memoria del browser.
- **Timeline**: righello in secondi; una riga per le scene; una per i tratti (il fotogramma d'inizio di quel tratto — finché il server non l'ha fatto, l'immagine del file —, onda della voce,
  bordi che si trascinano e si agganciano ai confini delle parole; in rosso i bordi che cadono nel
  parlato); una per le parole; una per le battute dei sottotitoli; una per titolo e suoni. La linea rossa del punto in cui sta il video,
  ingrandimento, scorrimento orizzontale dentro la timeline (la pagina non scorre di lato). Tasti, in tutta
  la scheda tranne dentro un campo: spazio avvia o ferma, frecce (un fotogramma; con Maiusc mezzo secondo),
  `S` divide il pezzo dove sta la linea rossa, `Canc` toglie il tratto o le parole scelte, `Ctrl+Z` / `Ctrl+Maiusc+Z`.
  Li dice il suggerimento al passaggio sulle righe della timeline, in parole («Spazio: avvia o ferma ·
  Frecce: un fotogramma avanti o indietro, con Maiusc mezzo secondo · S: dividi qui il pezzo · Canc: togli
  il pezzo o le parole scelte»); annulla e rifai li dicono i loro bottoni.
- **Gesti sui pezzi.** In un pezzo scelto a parole anche il bordo fra due parole (dove una pausa è stata tolta) si trascina: il pezzo si divide lì in due
  e il bordo spostato si scrive nella `rifila` di quello affacciato. Un pezzo trascinato sopra i vicini della sua scena cambia posto; lasciato
  su un'altra scena ci passa, e il menu «Porta in un'altra scena» del pannello fa lo stesso (in testa alla scena che viene dopo, in fondo a quella che viene
  prima). Non si sposta l'unico pezzo di una scena, né un pezzo che ha un punto dell'animazione della sua scena (un'ancora); un pezzo senza voce va
  solo in una scena che mostra la sola animazione. Il pezzo tiene la vista che aveva.
- Un pezzo senza voce (`docs/PIANO.md`) è un tratto con un segno a righe al posto della miniatura, senza onda
  né bordi da trascinare; il suo pannello dice la durata e offre solo «Togli» e «Sposta»; non ha parole e
  l'anteprima mostra la sola animazione della scena.
- **Pannello** del tratto scelto: sorgente, da e a al centesimo, vista, zoom (scala e centro, col punto
  da trascinare sull'anteprima), «Porta in un'altra scena», «Dividi qui», «Togli», «Sposta prima / dopo». Senza niente di scelto:
  quadro del video, modo dei sottotitoli, titolo, coda, e gli avvisi del risolto.
- **Parole**: il parlato del video come testo; un clic porta la linea rossa lì, selezionare e «Togli» le
  toglie dal montaggio, doppio clic corregge come si scrive.
- In alto «Annulla», «Rifai» e la riga «Per montare, rimontare o cambiare il video, chiedilo nella chat.» («Sto montando…» mentre
  gira). Ogni ritocco scrive il piano e il risolto si aggiorna da sé; se il risolto non c'è ancora, la scheda lo dice e dice di chiedere
  nella chat di calcolarlo. Un file del piano non ancora preparato è un avviso sotto l'anteprima, chiuso da «Per prepararlo, chiedilo
  nella chat.».

### Scheda — «cosa so di questo video?»

La proposta (aggancio, centro, chiusa, note), la scaletta, didascalia e hashtag con «Copia», dove deve uscire, le pubblicazioni, i numeri per data in una tabella e il loro
andamento, **il lavoro di Claude** su questo video (sotto) e le note.

Si scrivono tutti dalla pagina, e ogni cambio manda la scheda intera al server (`PUT /api/video/:slug/scheda`, validata sullo schema; se la rifiuta la frase dice perché e ciò che
era scritto resta nel campo). I testi si salvano uscendo dal campo.

- **La scaletta** (passi numerati: cosa aprire, cosa fare, cosa spiegare): ogni campo si scrive, un passo si sposta su e giù e si toglie, e in fondo se ne aggiunge uno scrivendo cosa
  aprire. «Cosa aprire» non può restare vuoto; «cosa fare» e «cosa spiegare» svuotati spariscono dal passo. Senza passi la sezione c'è lo stesso, con il campo per il primo.
- **Gli hashtag**: si aggiungono scrivendoli (anche più di uno insieme, con o senza `#`, senza doppioni) e si tolgono con la croce. Senza hashtag la lista sparisce dalla scheda.
- **Dove deve uscire** (`canali`): TikTok, YouTube, X da spuntare. Senza nessun canale la chiave sparisce dalla scheda (lo schema ne vuole almeno uno).
- **Dove è uscito** (`pubblicazioni`): per ognuna canale, giorno e ora, indirizzo (con «Apri l'indirizzo») e «Togli»; sotto, una riga per aggiungerne una, dove giorno e ora sono
  obbligatori e il canale parte dal primo dei canali del video. Un canale scritto nel file e fuori dall'elenco si vede e non si perde. Un indirizzo vuoto toglie la chiave.

**Il lavoro di Claude.** Quattro numeri grandi, sommati da tutte le conversazioni di Claude che hanno lavorato sul video (`docs/API.md`, «Consumi»):
il tempo di lavoro, con quante richieste e da quando a quando; ciò che Claude ha scritto; ciò che ha letto per la prima volta; ciò che ha riletto dalla
conversazione. I conteggi sono in pezzi di testo («token», spiegati sotto i numeri) a parole: «234 mila», «1,2 milioni». Una nota dice che il lavoro fatto con Mango Code non è contato. Senza conversazioni su
questo video la sezione lo dice; finché il server legge le conversazioni la prima volta dice che i conti sono parziali. Si aggiorna da sola.

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
chiedilo nella chat.», o solo il video nuovo se il file è preparato. Filtri: mai usati, per tipo. In testa il riquadro
degli arrivi: se il telefono può mandare, l'indirizzo, il codice da inquadrare, gli ultimi arrivati. Sotto, **«Lo studio dal telefono»**: spento di base; «Accendi»
mostra due strade, **In casa** (stesso Wi-Fi) e **Fuori casa (Tailscale)**, ognuna col suo codice da inquadrare, l'indirizzo e «Copia il link»; il telefono entra una volta col link e poi si ricorda.
Dice che chi ha il link può far lavorare la chat sul computer. Con «Spegni» lo studio sulla rete smette di rispondere, chi era entrato esce
subito e il link cambia (riaccendendo si inquadra il codice nuovo); «Rifai la chiave» dà un link nuovo e i telefoni già entrati devono rientrare.
Senza Tailscale sul computer la strada di fuori casa lo dice; se Windows non lascia entrare dalla rete di Tailscale lo dice e spiega dove sbloccarlo, con «Controlla di nuovo».
Il riquadro c'è solo aperto dal computer (`127.0.0.1`): dal telefono non si cambia l'accesso. Lo studio dal telefono è lo stesso, alle tre larghezze.
Se la scheda di un file non passa i controlli, la pagina del file lo dice con una frase semplice (chiedere nella chat di sistemarla) al posto di «sto ancora leggendo il file»; il perché preciso sta in un riquadro che si apre a richiesta.

## Pubblico — «cosa dice il pubblico, e come vanno i video usciti?»

Ciò che l'ultima lettura del canale ha portato in archivio (skill `scarica-tiktok`): quando è stata fatta e
cosa le manca; follower e mi piace del profilo; la tabella dei video usciti con la prima immagine, la data
e i numeri, e in blu la crescita dalla lettura precedente; **i rapporti**, cioè quante volte ogni cosa è
successa ogni 1000 visualizzazioni (mi piace, commenti, condivisioni, salvati, nuovi follower), con in testa
la riga dei totali e le ore viste; l'intestazione di una colonna ordina la tabella, e un secondo tocco la
rovescia; i commenti del video scelto, con le risposte e
quelli nuovi segnati; i messaggi privati. Il titolo di un video porta alla sua scheda. L'interfaccia non
aggiorna i dati da sé: dice di chiederlo nella chat («aggiorna i dati di TikTok»).

Senza dati la pagina dice in due righe cosa fa e ha un pulsante che apre la chat con la richiesta giusta; lo stesso fanno Classifica e Crescita (`src/comuni/PaginaVuota.tsx`).
Con i canali del profilo (`GET /api/profilo`, `canali`) il pulsante cambia: senza un canale, «Collega un canale»; con TikTok, «Leggi i dati di TikTok»; con un solo altro
canale (Instagram, YouTube, X) la pagina dice che la lettura automatica non c'è ancora e propone di far guardare alla chat il profilo pubblico, con il permesso del creator.

## Classifica — «a che punto sono fra i profili con cui mi confronto?»

I profili della classifica in archivio, dal primo: posto, nome (porta al profilo su TikTok), cosa fa, follower,
mi piace, visualizzazioni mediane, punteggio. La riga del creator è segnata e ha i numeri dell'ultima lettura del
canale; un riquadro che resta in alto mentre si scorre dice a che posto è per il punteggio e per ognuno dei tre
numeri. Si riordina per punteggio o per uno dei numeri; toccando di nuovo la stessa voce l'ordine si rovescia. La
testata dice di quando sono i numeri degli altri e di quando i suoi; in fondo, come è stata fatta.

## Crescita — «dove sono su TikTok, dove devo arrivare, e come?»

Il piano del canale in archivio (`crescita.json`) accanto alle letture vere. **Da dove vieni**: follower di
oggi, guadagnati negli ultimi 7 giorni e in media a settimana; il grafico delle letture con la strada dello
scenario scelto per le quattro settimane dopo e una riga all'uscita dei due video più visti. **Dove andare**:
il grafico fino all'ultima tappa, con la linea dello scenario scelto e la fascia fra il più basso e il più alto,
e la tabella delle tappe. **Questa settimana**: i follower da guadagnare (la pendenza dello scenario scelto),
dove essere al giorno del controllo, quelli guadagnati dal lunedì, e il piano dei giorni. **Cosa porta
follower**: per ogni tipo di video, follower ogni mille visualizzazioni, parte dei follower e visualizzazioni
mediane. Poi il mix dei video, i consigli, le novità di TikTok divise fra «da usare adesso», «più avanti» e
«non per te», e come è fatto il piano. I numeri veri cambiano a ogni lettura; il piano lo riscrive Claude.

## Produzione — «quanti video faccio, quanto lavoro di Claude costano e cosa rendono?»

Un video conta come **fatto** quando è pronto o pubblicato; la data è quella della prima uscita, o dell'ultima modifica se non è ancora uscito.
Senza video fatti la pagina dice cosa mostra e ha il pulsante «Facciamo il primo video», che apre la chat.
Le sezioni, dall'alto:

- **Quanti video e quanto lavoro.** Tre righe, l'ultima settimana, l'ultimo mese e da sempre: quanti video fatti e, in media per video, il lavoro
  di Claude, ciò che ha scritto, letto per la prima volta e riletto. La media è sui video di cui Claude ha un conto; quelli che ne sono privi sono
  detti accanto al numero dei video. A 430 px ogni riga diventa un blocco con le sue etichette.
- **I più lunghi e i più rapidi.** I video fatti con più e con meno lavoro di Claude (fino a tre per lista, e mai lo stesso video in
  tutte e due); non compare con meno di due video.
- **Quanto costa e quanto rende.** Una riga per ogni video fatto di cui Claude ha un conto: il lavoro di Claude, le visualizzazioni, i minuti di
  lavoro ogni 1000 visualizzazioni (meno sono, più il video ha reso per quanto è costato), mi piace e nuovi follower, presi dall'ultima lettura del
  canale per il video con lo stesso `slug`. In cima chi costa di più rispetto a quanto rende; chi non ha i numeri del canale, in fondo, con un trattino.
  L'intestazione di Lavoro, Visite e Minuti ordina, un secondo tocco rovescia. Le barre accanto a lavoro e visite hanno la stessa scala. A 430 px
  restano video, lavoro, visite e minuti, senza barre.

Si aggiorna da sola quando cambiano i conti di Claude, l'elenco dei video o le letture del canale. Finché il server legge le conversazioni la prima
volta avverte che i conti sono parziali; senza letture del canale dice di chiederle nella chat. Il lavoro fatto con Mango Code non è contato, e la nota lo dice.

## Stile — «quali sono i miei standard?»

Ogni quadro disegnato in scala, con le aree degli strati, dei sottotitoli e del titolo; i colori; il
cartello dei sottotitoli e il titolo resi col testo di prova; le soglie della voce e dei tagli. I valori
si cambiano e si salvano; un valore non valido dice perché. La persona sta «con la testa al centro» o spostata a mano di tanti px
(nel disegno, con la testa al centro, la sagoma è centrata).

## Motori — «cosa fa girare il mio computer?»

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
  per conto suo scorre lì.
- Un vuoto o un errore dice perché e cosa fare, nella lingua in uso. Niente slug, percorsi, nomi di comandi o di
  file JSON nei testi, tranne la cartella del video da copiare e i nomi dei file in «File» e «Girato».
- Testi, numeri e date nelle due lingue, da `src/lingua.ts` (`t("italiano", "inglese")`) e `src/testo.ts` (`1,5 s` e `7 ott 2026, 13:15` in italiano; `1.5 s` e `7 Oct 2026, 13:15` in inglese).
- Niente polling: un solo `EventSource` su `/api/eventi`; una vista rilegge solo ciò che il messaggio
  dice cambiato.
- Colori solo dai token.

## Verificare nel browser

Gli script di `studio/verifica/` guidano un browser vero (Playwright) e scrivono le foto in `studio/verifica/viste/`; chiudono solo i processi che hanno avviato, per PID. `fotografa.mjs` e `vive.mjs` lavorano contro un finto server su un archivio di esempio (`genera-archivio.ts`, `finto-server.ts`), `appunti-pagina.mjs` contro un server vero che avvia da sé, gli altri contro un server vero già acceso (`fedelta.mjs` anche contro il finto).

- `fotografa.mjs`: ogni vista e scheda a 1400, 1000 e 430 px, nel tema chiaro e nello scuro; fallisce se la pagina scorre in orizzontale, se un controllo esce dal bordo, se una vista resta su «carico…» o se la console ha errori (`bun run foto` in `studio/`).
- `vive.mjs`: le prove dal vivo di un browser contro il finto server (`bun run vive`).
- `fedelta.mjs`: quanto l'anteprima «Piano» somiglia al montato. Per ogni secondo dato disegna il «Piano», prende lo stesso fotogramma del montato con ffmpeg e dice il PSNR fra i due, con i due fotogrammi affiancati.
- `appunti-pagina.mjs`: gli allegati della chat (incolla, trascinamento, anteprima servita dal server) contro il server vero, con una cartella dei dati temporanea e porte di prova; il ponte degli appunti dell'app è finto nella pagina.
- `chat-vera.mjs`: la chat contro un server vero con un Claude Code vero: si scrive tasto per tasto, si manda, si guarda la risposta, la riga di uno strumento e un file scritto senza permesso.
- `chat-modello.mjs`: modello, effort, permessi, domande e Chrome della chat, contro un server vero con un Claude Code vero.
- `vero.mjs`: foto di rotte indicate sul server vero (`node verifica/vero.mjs <cartella> <larghezza> <rotta...>`).

Gli script sul server vero chiedono un server di prova su una porta libera (`MANGO_ANIMATION_PORTA`, mai quella in uso) con la stessa `MANGO_ANIMATION_LAVORO`: la chiave delle API la legge `chiave.mjs` dalla cartella di lavoro. `chat-vera.mjs` e `chat-modello.mjs` aprono conversazioni vere in quella cartella di lavoro (`chat-modello.mjs` dice alla fine l'id da cancellare).
