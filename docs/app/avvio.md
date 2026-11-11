# L'app: la finestra, l'avvio, il server

Parte di `docs/APP.md`: la finestra dell'app, come parte e come accende il server.

## Come funziona

- **La radice del repo** si trova risalendo da dove sta l'eseguibile fino alla cartella con `CLAUDE.md` e `server/` (l'eseguibile
  costruito sta in `app/target/release/`, dentro il repo), altrimenti è `codice/` accanto all'eseguibile (l'app installata). Così dal repo
  le copie per l'installatore (`app/target/codice/`, e `app/target/release/codice/` che lascia la costruzione) non contano. Fuori dal repo si indica con
  `MANGO_ANIMATION_RADICE`. Se non la trova, la finestra lo dice e basta.
- **La cartella di lavoro** (`docs/ARCHITETTURA.md`, «La cartella di lavoro»): i dati di chi usa l'app, in un'altra cartella dal codice. La indica `MANGO_ANIMATION_LAVORO`, e
  vince su tutto (prove, chi sviluppa); se manca vale quella ricordata in `%APPDATA%\dev.mango.animation\lavoro.json`. Se non c'è nemmeno quella è il primo avvio
  e la sceglie il creator (`docs/app/cartella-dei-dati.md`): l'app non crea niente finché lui non dice «Usa questa cartella». Se la cartella ricordata non c'è più (disco staccato, cartella spostata) la pagina lo dice e offre
  «Ricrea in Documenti» o «Scegli un'altra cartella» (dialogo di sistema); una variabile che indica una cartella che non esiste è un errore, senza
  «Riprova». Per cambiarla quando tutto va: nello studio, il bottone con la cartella nella barra apre «Cartella dei dati» con «Sposta la cartella dei
  dati…» (`docs/app/cartella-dei-dati.md`, «Spostare la cartella dei dati»). L'app avvia il server dalla cartella del codice e gli passa
  `MANGO_ANIMATION_LAVORO`.
- **L'ordine dell'avvio**, quando il server lo accende l'app: una versione nuova (solo l'app installata, `docs/app/installer.md`), Claude Code installato e collegato (`docs/app/claude-code.md`),
  la cartella dei video (la scelta del primo avvio, o lo spostamento chiesto dallo studio: `docs/app/cartella-dei-dati.md`), il computer pronto (`docs/app/computer-pronto.md`), il server (e poi lo studio). Ogni passo che ha qualcosa da dire al creator lo dice
  nella pagina d'attesa e aspetta; un server già acceso li salta tutti.
- **La lingua delle pagine dell'app** (attesa, errori, scelte dell'avvio, dialogo della cartella): una funzione sola, `scegli` in `app/src/lingua.rs`; come decide: `docs/LINGUA.md`, «Le pagine dell'app».
- **Il Claude Code del creator** (`docs/app/claude-code.md`): l'app lo cerca prima di accendere il server e gli passa il percorso in `MANGO_ANIMATION_CLAUDE`.
- **Il server**: all'avvio l'app chiede `GET /api/lavori` sulla porta di `MANGO_ANIMATION_PORTA` (47431 se manca), portando la chiave delle API
  della cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`, «La chiave delle API»: la fa il server al primo avvio, e senza ogni risposta è 401). Se
  risponde 200, lo usa e non lo tocca; un 401 è un server di un'altra cartella, e non vale. Se no, lo accende (`bun run --cwd server avvia`, nascosto) e aspetta che
  risponda, fino a 90 s. Se la porta di serie è occupata da un altro programma, lo accende sulla prima libera e gliela passa in `MANGO_ANIMATION_PORTA` (chi ha impostato la variabile tiene la sua); nel frattempo una pagina d'attesa pulita, e se non parte mostra le ultime righe del log,
  col bottone «Riprova». Appena il server risponde la finestra **naviga** sullo studio entrando con la chiave
  (`http://127.0.0.1:<porta>/entra?chiave=…`, che mette il cookie e rimanda a `/`): è la pagina vera, non un riquadro dentro un'altra pagina.
- **Il server che muore a finestra aperta**: se l'ha acceso l'app, lo guarda finché è acceso (`sorveglia` in `app/src/server.rs`). Se il processo esce la finestra torna alla pagina d'attesa («Il server si è fermato: lo riaccendo»),
  l'app lo riaccende con lo stesso comando (il log continua, non riparte da capo) e, appena risponde, ricarica lo studio. Ogni processo che l'app accende ha un Job Object suo, dentro quello dell'app: quando il server cade da solo e viene riacceso, i suoi discendenti rimasti vivi (Python, ffmpeg, Claude Code) si fermano con lui. Se il server riacceso si ferma di nuovo entro 60 s, o non riparte, la pagina è quella d'errore («Il server si è fermato», non «non parte»), con le ultime
  righe del log e «Riprova»; un server che ha girato più di 60 s si riaccende ancora. Un server già acceso prima dell'app non lo guarda: se cade, lo studio resta com'era (la riga di sopra vale solo per quello dell'app).
- **I link e la navigazione**: la finestra naviga solo sulle pagine dell'app, cioè la pagina locale e lo studio sulla porta in uso, alla radice e a `/entra` (`e_pagina_dell_app` in `lib.rs`). Ogni altro indirizzo,
  anche di un `<a target="_blank">`, non sostituisce la finestra: il web (`http`, `https`, `mailto`) si apre nel browser di sistema, una cartella del computer (`file:///C:/…`, o `/C:/…` sullo studio) in Esplora file.
  Un file non si apre mai (potrebbe essere un programma). Ciò che non si può aprire lo dice con un avviso nella finestra e va in `ui.log`.
- **I permessi dello studio**: i comandi del plugin dell'app (`capabilities/default.json`) valgono per la pagina locale; per lo studio, che è una pagina remota, li aggiunge l'app all'avvio solo per `http://127.0.0.1:<porta>`
  della porta in uso (`permessi_dello_studio` in `lib.rs`), non per ogni porta di `127.0.0.1`.
- **«Apri la cartella»** e ogni altro gesto dello studio che tocca il disco passano dal server, come nel browser:
  non servono all'app. Le sole cose che lo studio chiede all'app sono la dettatura (`docs/app/dettatura.md`), gli appunti (`window.__MANGO_ANIMATION__.appunti`), la cartella dei dati (`window.__MANGO_ANIMATION__.cartellaDati`) il computer (`window.__MANGO_ANIMATION__.computer`), le segnalazioni (`window.__MANGO_ANIMATION__.segnalazione`) e, da lei, i file trascinati (`window.__MANGO_ANIMATION__.trascinamento`).
- **La barra del titolo di Windows** prende lo stesso colore della pagina (chiara o scura, dallo sfondo vero,
  non da un tema fisso), e si aggiorna da sola se la pagina cambia tema (un attributo sulla radice, o il tema di Windows), senza guardare il tempo.
- **Lo zoom** (`app/src/zoom.rs`): Ctrl+ / Ctrl- / Ctrl+0 e Ctrl con la rotellina zoomano tutta la finestra (i tasti sono quelli del browser: la finestra nasce con `zoom_hotkeys_enabled`). La pagina, anche lo studio (`ricorda_zoom`, un comando del ponte come gli altri), dice all'app la sua scala 800 ms dopo l'ultimo cambio di misura; l'app ne ricava lo zoom (scala della pagina sulla scala dello schermo) e lo tiene
  in `zoom.txt` nella cartella `%LOCALAPPDATA%\dev.mango.animation\` (al 100% il file sparisce), e al prossimo avvio lo rimette alla finestra. Un file che non è un numero fra 0,25 e 5 si ignora.
- **Chiusura**: l'app entra in un Job Object di Windows che chiude ogni processo avviato da lei (il server, se
  l'ha acceso lei) quando si chiude, anche se va in crash. Se Windows non lo permette (l'app è già dentro un altro Job) parte lo stesso, e lo dice in `ui.log`. Un server già acceso prima non si tocca. I link e la pagina di una
  segnalazione che l'app apre per il creator partono invece fuori dal Job (`supervisor::apri_fuori_dal_giobbe`, `CREATE_BREAKAWAY_FROM_JOB`):
  un browser che non era acceso resta aperto quando l'app si chiude.
- **Una sola istanza**: un secondo avvio porta in primo piano la finestra già aperta.
- **Politica di contenuto** (`csp` in `tauri.conf.json`): la pagina locale dell'app carica solo i suoi file e parla solo con i comandi dell'app. Non vale per lo studio, che arriva dal server (127.0.0.1) con la sua.
- **Il registro** (`app/src/istanza.rs`): all'avvio l'app scrive `app.json` (`{ "pid", "exe" }`: il suo pid e il percorso del suo eseguibile; appena lo studio risponde vi aggiunge `"porta"`, quella in uso, che con il ripiego di porta può non essere la 47431) in `%LOCALAPPDATA%\dev.mango.animation\`, accanto a `logs\` e
  `computer\`; lo scrive intero o per niente (file provvisorio e rinomina), e alla chiusura lo toglie solo se il pid scritto è il suo. Nell'ambiente del server che accende mette `MANGO_ANIMATION_APP_PID`
  (il proprio pid): lo ereditano i figli del server, la chat compresa. Serve solo a quel comando: se non riesce a scriverlo l'app parte lo stesso. Se non riesce a partire per altro (la finestra non si crea) lo dice
  una finestra di Windows con il motivo, invece di sparire.
