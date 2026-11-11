# Mango Animation (l'app)

Una finestra sola: lo studio del server a tutta pagina, come nel browser ma aperta col doppio clic
dell'icona sul Desktop. La posizione, la misura e la finestra si ricordano fra un avvio e l'altro. La chat con
Claude Code dentro lo studio (`docs/CHAT.md`, `studio/src/chat/`)
funziona qui dentro come ogni altra vista dello studio, senza bisogno di niente in più nell'app.

## Come funziona

- **La radice del repo** si trova risalendo da dove sta l'eseguibile fino alla cartella con `CLAUDE.md` e `server/` (l'eseguibile
  costruito sta in `app/target/release/`, dentro il repo), altrimenti è `codice/` accanto all'eseguibile (l'app installata). Così dal repo
  le copie per l'installatore (`app/target/codice/`, e `app/target/release/codice/` che lascia la costruzione) non contano. Fuori dal repo si indica con
  `MANGO_ANIMATION_RADICE`. Se non la trova, la finestra lo dice e basta.
- **La cartella di lavoro** (`docs/ARCHITETTURA.md`): i dati di chi usa l'app, in un'altra cartella dal codice. La indica `MANGO_ANIMATION_LAVORO`, e
  vince su tutto (prove, chi sviluppa); se manca vale quella ricordata in `%APPDATA%\dev.mango.animation\lavoro.json`. Se non c'è nemmeno quella è il primo avvio
  e la sceglie il creator («Dove stanno i video», sotto): l'app non crea niente finché lui non dice «Usa questa cartella». Se la cartella ricordata non c'è più (disco staccato, cartella spostata) la pagina lo dice e offre
  «Ricrea in Documenti» o «Scegli un'altra cartella» (dialogo di sistema); una variabile che indica una cartella che non esiste è un errore, senza
  «Riprova». Per cambiarla quando tutto va: nello studio, il bottone con la cartella nella barra apre «Cartella dei dati» con «Sposta la cartella dei
  dati…» (sotto, «Spostare la cartella dei dati»). L'app avvia il server dalla cartella del codice e gli passa
  `MANGO_ANIMATION_LAVORO`.
- **L'ordine dell'avvio**, quando il server lo accende l'app: una versione nuova (solo l'app installata, «Installer e aggiornamenti»), Claude Code installato e collegato («Il Claude Code del creator»),
  la cartella dei video (la scelta del primo avvio, o lo spostamento chiesto dallo studio: «Dove stanno i video»), il computer pronto («Il computer pronto»), il server (e poi lo studio). Ogni passo che ha qualcosa da dire al creator lo dice
  nella pagina d'attesa e aspetta; un server già acceso li salta tutti.
- **La lingua delle pagine dell'app** (attesa, errori, scelte dell'avvio, dialogo della cartella, e le frasi che il Rust ci manda): italiano o inglese, decisa da una funzione sola
  (`scegli` in `app/src/lingua.rs`). Vale la lingua che lo studio ha scelto, se l'app la conosce: lo studio la dice a ogni apertura e a ogni cambio, e l'app la ricorda in
  `%APPDATA%\dev.mango.animation\lingua.json`; al primo avvio, e se non la conosce, vale quella dell'interfaccia di Windows (italiano se è in italiano, inglese altrimenti). Ogni
  stato che l'app manda alla pagina porta `lingua` (`it` o `en`) già nelle sue frasi; le frasi fisse sono in `app/ui/app.js` (`t("italiano", "inglese")`, niente testo nell'HTML), quelle
  del Rust sono `t(it, en)` di `lingua.rs`. `app/tests/linguaggio.rs` fa fallire una frase che resta in una lingua sola.
- **Il Claude Code del creator**: vedi sotto. L'app lo cerca prima di accendere il server e gli passa il percorso in `MANGO_ANIMATION_CLAUDE`.
- **Il server**: all'avvio l'app chiede `GET /api/lavori` sulla porta di `MANGO_ANIMATION_PORTA` (47431 se manca), portando la chiave delle API
  della cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`: la fa il server al primo avvio, e senza ogni risposta è 401). Se
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
  non servono all'app. Le sole cose che lo studio chiede all'app sono la dettatura (sotto), gli appunti (`window.__MANGO_ANIMATION__.appunti`), la cartella dei dati (`window.__MANGO_ANIMATION__.cartellaDati`) il computer (`window.__MANGO_ANIMATION__.computer`), le segnalazioni (`window.__MANGO_ANIMATION__.segnalazione`) e, da lei, i file trascinati (`window.__MANGO_ANIMATION__.trascinamento`).
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

## Il Claude Code del creator

L'app non porta Claude Code: usa quello che il creator ha già, e la chat parte con quel programma e non con la copia che l'SDK porta con sé
(`docs/CHAT.md`). L'app non legge né usa il suo accesso: gli chiede, come da terminale, `claude --version` e `claude auth status` (un JSON, anche se non si è collegati),
e per l'accesso lascia fare a lui (`claude auth login`).

- **Dove lo cerca** (`app/src/claude.rs`): `MANGO_ANIMATION_CLAUDE` (il percorso del programma: vince su tutto, ed è un errore se indica qualcosa che non c'è); poi `claude.exe`
  nelle cartelle del PATH, e un `claude.cmd` di npm con il suo programma accanto (`node_modules\@anthropic-ai\claude-code\bin\claude.exe`); poi dove si installa senza che il PATH
  dell'app lo sappia ancora: `%USERPROFILE%\.local\bin\claude.exe` (l'installatore di Anthropic) e `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`.
- **Cosa fa all'avvio**, solo se il server lo accende lei (con un server già acceso non c'è passo): se Claude Code c'è, parte e risulta collegato, passa avanti senza dire niente. Altrimenti la pagina
  d'attesa lo dice e aspetta il creator (`app/src/preparazione.rs`, `app/ui/`): senza Claude Code collegato l'app non serve a niente, e non c'è modo di andare avanti. La pagina dice prima che serve **un account Claude con un
  abbonamento** (Pro, Max, Ultra, Team o Enterprise; il piano gratuito non include Claude Code: `code.claude.com/docs/en/setup`, «Authenticate»), col link ai piani (`claude.com/pricing`).
  - **manca o non parte**: «Installa Claude Code» apre una finestra di PowerShell con il comando di Anthropic (`irm https://claude.ai/install.ps1 | iex`) e, quando la finestra si chiude, l'app ricontrolla da sola. Se
    Claude Code ancora non c'è la pagina dice che l'installazione non è andata a buon fine e offre «Riprova»; se la finestra ha trovato un errore resta aperta, perché il creator lo legga. In piccolo restano il comando da copiare
    («Copia il comando»: per chi preferisce incollarlo da sé) e il link alla guida di Anthropic; poi «Ricontrolla»;
  - **non è collegato**: «Accedi a Claude Code» apre una finestra di terminale con `claude auth login` (apre il browser dell'account; se serve un passo in più il creator lo legge lì), e quando si chiude
    l'app ricontrolla da sola; «Ricontrolla» per chi ha fatto l'accesso altrove;
  La pagina riceve dal controllo versione e se è collegato; l'indirizzo email e l'abbonamento che `claude auth status` dice non entrano nello stato e non vanno da nessuna parte.
- **Al server** il percorso arriva in `MANGO_ANIMATION_CLAUDE`; senza (si sviluppa a mano, o si va avanti senza) il server usa la copia dell'SDK se c'è.
- La prova col `claude` installato nel computer: `cargo test il_claude_vero -- --ignored --nocapture`.

## Dove stanno i video

Al primo avvio (nessuna cartella ricordata e nessuna `MANGO_ANIMATION_LAVORO`), dopo Claude Code, l'app chiede dove tenere i video; il codice è in `app/src/cartella.rs` (cosa dire di una cartella),
`app/src/lavoro.rs` (la scelta ricordata) e `app/src/preparazione.rs` (il giro della pagina). Chi ha già una cartella ricordata non vede niente di nuovo.

- **La pagina** «Dove tengo i tuoi video?»: la cartella proposta (`Mango Animation` dentro Documenti, quella vera di Windows) con lo spazio libero del suo disco; «Usa questa cartella» la prepara (con `archivio/`) e la ricorda;
  «Scegli un'altra cartella» apre il dialogo di sistema (se non si apre, perché un criterio del computer lo vieta, la pagina lo dice e il creator sceglie fra le cartelle proposte). Sotto, «Altre cartelle»: i dischi fissi con più spazio libero di quello della cartella in discussione (non quelli rimovibili o di rete), ognuno con `Mango Animation` dentro
  e il suo spazio libero, che si prendono con un clic. Senza Documenti non c'è proposta: il creator ne sceglie una. Finché non dice «Usa questa cartella» l'app non crea niente.
- **OneDrive**: una cartella dentro una cartella che OneDrive sincronizza porta l'avviso «i video verrebbero copiati online, e pesano molto». Le cartelle sincronizzate sono quelle delle variabili di Windows (`OneDrive`,
  `OneDriveConsumer`, `OneDriveCommercial`) e le cartelle `OneDrive` o `OneDrive - <nome>` dentro la cartella dell'utente (un secondo account di lavoro non ha una variabile); il confronto è per cartelle intere e senza distinguere
  maiuscole e minuscole, così `OneDriveVecchio` o `D:\OneDrive` non danno falsi allarmi. Se Documenti è su OneDrive, la cartella proposta (quella del pulsante grande) è `Mango Animation`
  nella cartella dell'utente, fuori da OneDrive; l'avviso resta per chi sceglie a mano una cartella sincronizzata.
- **Il motore della dettatura** riceve la cartella scelta appena è scelta (`Voce::usa_lavoro`): il primo avvio non ha bisogno di riaprire l'app.

### Spostare la cartella dei dati

«Sposta la cartella dei dati…» dello studio (`window.__MANGO_ANIMATION__.cartellaDati.sposta()`, `app/src/dati.rs`) apre il dialogo e ricorda la scelta in `lavoro.json` come `sposta_a`; la cartella in uso non cambia
(`leggi()` la dà come `prossima`). I file li sposta l'app **al prossimo avvio, prima di accendere il server**, quando nessun file è in uso (`app/src/sposta.rs`, la pagina «Sposto i tuoi video»):

- la destinazione deve essere vuota o nuova, e non dentro la cartella attuale (né l'attuale dentro di lei); il dialogo rifiuta con la frase altrimenti. Scegliere la cartella in uso annulla uno spostamento chiesto. Con
  `MANGO_ANIMATION_LAVORO` non si sposta: la variabile vince;
- si guarda prima che nel disco di destinazione ci sia lo spazio (quanto pesa tutto); poi si copia a pezzi di 8 MB, con avanzamento (MB, file) e «Annulla lo spostamento», conservando la data di ogni file; i collegamenti
  simbolici (i video su un altro disco, `docs/ARCHIVIO.md`) si rifanno uguali, non si seguono;
- ogni file copiato è scritto sul disco, non lasciato alla memoria di Windows; si verifica che nella destinazione ci sia tutto: stesse voci, stesse misure di ogni file e stessi collegamenti. Solo allora la nuova cartella
  diventa quella ricordata (`lavoro.json` si scrive per intero o per niente) e solo dopo si tolgono gli originali, i contenuti prima delle cartelle. Se l'app si ferma (o il PC si spegne) mentre li toglie, la cartella ricordata è già la nuova, con tutto, e la
  vecchia resta come una copia da togliere a mano;
- se qualcosa non va (un file non si legge, il disco si riempie, la verifica non torna) o il creator annulla, gli originali restano dove erano, ciò che era stato copiato si toglie e la pagina lo dice con «Riprova» e «Continua con la
  cartella di prima» (che cancella lo spostamento chiesto). Una copia interrotta perché l'app è stata chiusa lascia nella destinazione un segno (`.mango-spostamento`): al tentativo dopo si svuota e si rifà da capo, mentre una
  cartella con dei file senza il segno non si tocca;
- se la copia è verificata ma qualche originale non si toglie (un altro programma lo tiene aperto) la nuova cartella vale lo stesso e la pagina elenca i file rimasti, da togliere a mano. Con un server già acceso (anche
  per un'altra app) lo spostamento aspetta il prossimo avvio vero.

## Il computer pronto

Al primo avvio (e a ogni avvio in cui manca qualcosa) l'app vede cosa c'è nel computer e scarica, con avanzamento e verifica, ciò che le funzioni accese richiedono
(`docs/MOTORI.md`). Lo fa solo quando il server lo accende lei, dopo il passo di Claude Code; se non manca niente non mostra niente. Il codice sta in `app/src/computer/`.

- **Cosa legge** (`hw.rs`, in Rust, senza accendere Python): le schede NVIDIA con memoria, memoria libera e capacità di calcolo (`nvidia-smi`), il processore e i suoi thread, la RAM, lo spazio
  libero sul disco dove scarica (`%LOCALAPPDATA%\dev.mango.animation\computer\`). Le funzioni accese sono `motori.<funzione>.attiva` del profilo (`docs/MOTORI.md`, §4; una funzione che il profilo
  non nomina è accesa): trascrizione, allineamento, sagoma, segui, pulizia_voce, dettatura. I modelli di Whisper li dice il profilo (`motori.trascrizione.modello`), poi lo stile del creator, poi quello di serie
  (`preparati.modello_trascrizione`, `dettatura.dispositivi.cuda|cpu.modello`).
- **Cosa può scaricare** (`manifesto.json`, con la fonte, la licenza, la dimensione e l'impronta SHA-256 di ogni file; i modelli sono a una revisione precisa):

  | cosa | quando | peso | dove va |
  |---|---|---|---|
  | Bun | sempre, se non c'è nel PATH | 40 MB | `computer\bin\` |
  | ffmpeg (build intera, 7.1.1) | sempre, se `ffmpeg` e `ffprobe` non sono nel PATH | 72 MB | `computer\ffmpeg\` |
  | `uv`, poi Python 3.12 e i pacchetti | se nessun Python (la variabile, quello dell'app, quello nel PATH) importa i moduli delle funzioni accese | uv 15 MB; Python e pacchetti da 0,3 a 5 GB (stima) | `computer\ambiente\` (il venv), `computer\python\` |
  | `bun install` in `server/` e `animazioni/` | se non hanno `node_modules`, o se il loro `bun.lock` o `package.json` non sono più quelli con cui sono stati installati | 120 e 150 MB (stima; con la cache di Bun un aggiornamento costa molto meno) | nel codice |
  | Chromium (`bun x playwright install chromium`) | se Playwright non ne ha uno; dopo `bun install` in `animazioni/`, se ce n'è già uno, si rilancia per prendere la revisione che il lockfile vuole | 710 MB (stima) | dove lo tiene Playwright |
  | Whisper (large-v3, large-v3-turbo o small) | trascrizione e dettatura: il modello che chiedono | da 0,5 a 3,1 GB | cache di Hugging Face, `models--<org>--<nome>/snapshots/<revisione>/` e `refs/main` |
  | MMS (allineamento delle parole, CC-BY-NC) | allineamento | 1,3 GB | `~/.cache/torch/hub/checkpoints/` |
  | SAM 2.1, ViTMatte, RT-DETR | sagoma | 324, 103 e 81 MB | cache di Hugging Face |
  | YuNet | segui | 0,2 MB | cache di Hugging Face |
  | DeepFilterNet3 | pulizia_voce | 27 MB | `~/.cache/mango-animation/modelli/` |

  I modelli **non si distribuiscono con l'app**: si scaricano dalla loro fonte, con la licenza di ciascuno accanto nella pagina. Un modello già nella cache di Hugging Face, di qualunque revisione, non si riscarica.
  I pacchetti Python sono quelli di `piano.rs` (versioni fissate, non impronte: l'integrità dei pacchetti dipende da PyPI e dal TLS, a differenza degli altri file, che si verificano per SHA-256); PyTorch viene dall'indice CUDA 12.4 se c'è una scheda NVIDIA con capacità di calcolo da 5.0, dall'indice del
  processore altrimenti. Con quella scheda e senza PyTorch (allineamento e sagoma spente) si aggiunge `nvidia-cublas-cu12` (circa 380 MB), che porta la cublas di CUDA 12 per trascrizione e dettatura. Python lo prepara `uv` (`uv python install --no-bin`, `uv venv`, `uv pip install`): non tocca il Python del computer né `~/.local/bin`.
  Mentre scarica `uv` scrive righe solo a inizio e fine: la barra di «Python e i suoi pacchetti» è quanto sono cresciute, dall'inizio, `computer\uv-cache\` e `computer\python\` rispetto al peso stimato (si guarda ogni
  secondo, `installa.rs`). Non torna indietro e non arriva in fondo prima che `uv` finisca; con la cache già piena (un'installazione ripresa) resta bassa e si completa alla fine.
- **Pacchetti e versioni dopo un aggiornamento.** I moduli presenti non dicono la versione, e `node_modules` non dice da quale lockfile viene: a installazione finita l'app scrive cosa ha messo, e a ogni avvio confronta.
  Per i pacchetti JS è l'impronta (SHA-256) di `package.json`, `bun.lock` e `bun.lockb` com'erano a `bun install` finito, in `node_modules/.mango-impronta` (tolto `node_modules`, sparisce anche lei); cambia il lockfile, o manca
  l'impronta, e `bun install` si rifà; uguale, non si fa niente. Per Python è l'elenco dei pacchetti con il loro indice (`ambiente\.mango-pacchetti`): l'ambiente dell'app vale solo se contiene tutto ciò che le funzioni
  accese chiedono adesso (spegnere una funzione non rifà niente; una versione fissata diversa, una funzione accesa in più, o PyTorch che passa da CPU a CUDA, sì). Un Python indicato dalla variabile o quello del computer
  che ha già tutto non passano da qui. Scritte solo a installazione riuscita: una a metà si rifà al prossimo avvio.
- **Quale Python usano il motore e la dettatura**, in quest'ordine: `MANGO_ANIMATION_PYTHON` (chi sviluppa: non si controlla niente); quello dell'ambiente dell'app, se importa tutto; quello nel PATH, se importa tutto
  (un computer che ha già tutto non scarica niente); altrimenti l'app prepara il suo. Il controllo a ogni avvio cerca i moduli senza importarli; dopo aver installato li importa davvero.
- **Senza chiedere** si preparano i pacchetti del codice (`bun install`): quando mancano solo loro (il primo avvio dopo un aggiornamento che cambia un lockfile) non c'è niente da scegliere, e la pagina mostra
  solo l'avanzamento («Preparo l'app»). Se non riesce, si apre la pagina con l'errore.
- **La pagina** (`app/ui/`), «Scegli cosa vuoi fare»: una riga sul computer (quante schede NVIDIA e quanta memoria; i nomi nel suggerimento); le funzioni come schede con un interruttore, il nome e la frase di
  «Motori» (`FUNZIONI` e `COSA_FA` in `manifesto.rs`) e quanto scaricano, oppure «Pronta» o «Spenta» (cambiandole si ricalcola cosa serve); i componenti comuni (le voci senza funzione: prima a cosa servono,
  poi il nome del programma), con «Serve sempre» su quelle senza cui il server non parte (`necessaria`: Bun e i pacchetti del codice); licenze e fonti dentro «Cosa scarico e da dove», chiuso. In fondo,
  fissi, quanto si scarica, lo spazio libero e i bottoni: se lo spazio non basta (i pacchetti Python contano due volte, per la cache di `uv`, più un gigabyte) «Scarica e comincia» resta spento. «Scarica e
  comincia» scrive nel profilo le funzioni che il creator ha cambiato (`motori.<funzione>.attiva`, il resto del profilo com'è) e comincia; «Ferma» torna al piano; un errore dice quale voce e perché e si può
  riprovare; «Non ora» lascia tutto com'è, e non c'è quando manca una voce necessaria. Un file arriva al suo posto solo con dimensione e impronta giuste; uno scarico interrotto riprende da dove era (`Range`): si arrende dopo quattro giri di fila senza un byte in più, e un disco che non scrive ferma subito, con la frase che dice di liberare spazio.
  Un programma estratto da uno zip conta come presente solo a estrazione finita (lo zip si toglie dopo): con lo zip ancora lì si rifà. Lo spazio che serve non conta ciò che è già nei `.parte`, e si rilegge ogni volta che la pagina lo mostra.
- **Al server** arrivano il PATH con davanti le cartelle di ciò che ha scaricato l'app e, se è quello da usare, `MANGO_ANIMATION_PYTHON`; la dettatura prende lo stesso Python (`Voce::usa_python`).
- **Per lo studio** (Impostazioni › Computer), il ponte `window.__MANGO_ANIMATION__.computer`: `leggi()` → `{ schede: [{ indice, nome, memoria_mb, libera_mb, capacita }], processore, thread, ram_mb, disco_libero_mb }`
  (un comando del ponte, come la dettatura: `app/src/computer/ponte.rs`). Le schede sono quelle NVIDIA nell'ordine di `nvidia-smi` (`macchina.scheda_video` del profilo è questo indice); senza scheda l'elenco è vuoto.
  Ciò che si accende nei Motori lo scarica l'app al prossimo avvio.
- **Prove**: `cargo test` (con un server di prova locale: scarico, ripresa, impronta sbagliata, annullo, archivi; installatori finti); dalla rete vera, in una cartella temporanea, `cargo test il_computer_vero -- --ignored --nocapture`
  (uv, Bun, ffmpeg, DeepFilterNet, YuNet, Python con un pacchetto).

## La dettatura

Nel campo della chat c'è un microfono (`docs/INTERFACCIA.md`) che nel browser non compare: lo mostra lo studio solo se l'app gli ha messo
nella pagina `window.__MANGO_ANIMATION__.voce`. Il microfono si registra in Rust (cpal, il predefinito di Windows, ricampionato a 16 kHz
mono) e il testo lo dà un motore locale, faster-whisper: l'audio non lascia il computer, e l'app non legge né usa il login di Claude Code
(`app/src/voce/`: `locale.rs` il motore, `audio.rs` microfono e ricampionamento).

- **Il motore** è un processo che parla a righe JSON (il protocollo è in `docs/MOTORE.md`, «La dettatura»). Di base `python -m motore detta`,
  lanciato dalla radice del codice che l'app ha già trovato («La radice del repo», sopra: il motore sta in `motore/` lì dentro) col Python
  di `MANGO_ANIMATION_PYTHON` (di base `python` del PATH) e il modulo di `MANGO_ANIMATION_MODULO` (di base `motore`), come il server. Per usarne un
  altro che parli lo stesso protocollo si scrive la riga di comando in `MANGO_ANIMATION_DETTATURA` (le virgolette doppie tengono insieme
  una parola con gli spazi): `"C:\Programmi\Motore\motore.exe" detta`. Parte alla prima dettatura, resta acceso con il modello
  caricato fra una dettatura e l'altra, e si chiude con l'app (Job Object: i figli lo ereditano). Se cade, la dettatura dopo lo riaccende.
  L'app gli passa la cartella dei dati che ha all'avvio (`MANGO_ANIMATION_LAVORO`), da cui legge lo stile e il profilo, e la lingua dello studio che lo
  accende (`MANGO_ANIMATION_LINGUA=it|en`, come il server coi lavori): le frasi dei suoi errori escono in quella lingua. Il motore resta acceso fra una
  dettatura e l'altra, ma gli errori li dice quando si accende; se cade, la dettatura dopo lo riaccende nella lingua di allora.
  Il suo log (ciò che scrive su stderr) è `dettatura.log` in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
- **Il modello** lo sceglie il motore in `stile.json` → `dettatura` (quello di serie con sopra quello del creator): la scheda NVIDIA se c'è (quella di
  `macchina.scheda_video` del profilo, se la indica), altrimenti il processore con un modello più piccolo (`docs/MOTORI.md`). La prima volta il modello si scarica (Hugging Face, serve la rete) e la dettatura è più
  lunga ad accendersi; poi si carica dal disco in pochi secondi, la prima dettatura dopo l'avvio dell'app.
- **Mentre si carica** il microfono ascolta già e il livello si muove: lo studio scrive «Preparo la dettatura…» (evento `preparo`), e ciò che
  il creator dice non va perso, perché arriva al motore appena è pronto.
- **Il ponte.** Tre comandi del plugin dell'app (`voce_stato`, `voce_avvia`, `voce_ferma`: un plugin, uno solo per tutti i comandi che lo studio chiama, perché lo studio è una pagina remota e
  vuole permessi suoi, `build.rs` e `capabilities/default.json`; i comandi sono elencati nel gestore di `prepara`, `app/src/lib.rs`), e uno script (`app/src/voce/ponte.js`) che li espone alla pagina:
  `voce.stato(lingua)` → `{ disponibile, messaggio?, in_ascolto }` (disponibile: il comando del motore si è trovato; Python e il modello si
  vedono solo accendendolo); `voce.avvia(lingua)` (restituisce l'`id` della dettatura), `voce.ferma(lingua)` (rifiutano con `{ code, message }`:
  `motore_mancante`, `python_mancante`, `motore_non_parte`, `motore_caduto`, `comando_non_valido`, `microfono_assente`, `microfono_negato`,
  `file_illeggibile`, `gia_in_ascolto`, `non_in_ascolto`; `message` è la frase nella `lingua`); `voce.su(f)` → riceve gli eventi `{ tipo }` e dà la
  funzione per smettere. `lingua` è `"it"` o `"en"`, quella dello studio (senza o con un'altra, italiano): le frasi di errore dell'app (`message`, il `messaggio` degli
  eventi `errore`) e del suo motore escono in quella lingua.
- **Gli eventi** portano tutti l'`id` della dettatura a cui appartengono, e lo studio ignora quelli di una dettatura vecchia: `preparo` (il
  motore sta caricando il modello), `ascolto` (il motore ascolta), `livello` (`valore` 0-1, dieci al secondo, calcolato dall'app), `parziale`
  (la frase in corso, `testo`: provvisoria), `definitiva` (la frase finita, `testo`), `errore` (`messaggio`: anche il motore che non carica il
  modello o cade, con le ultime righe del suo log), `fine` (sempre l'ultimo di quella dettatura, anche se il motore è caduto). Una frase è
  finita dopo `dettatura.silenzio_fine` secondi di silenzio.
- **Fermare**: `ferma()` libera subito il microfono e torna subito; un'altra dettatura può partire all'istante. Il thread della dettatura
  manda al motore l'audio che restava e `fine`, e aspetta che chiuda l'ultima frase (al più 30 s): le ultime parole arrivano quindi anche
  dopo `ferma()`, come eventi di quella dettatura. Una dettatura nuova prende il posto di una che aspettava ancora il modello.
- **Per provare senza parlare**: con `MANGO_ANIMATION_VOCE_FILE=<un .wav>` nell'ambiente dell'app, `voce.avvia()` suona quel WAV (PCM a 16 bit) in
  tempo reale al posto del microfono. Solo per le prove.

## Gli appunti

Un file copiato in Esplora risorse (`CF_HDROP`) non arriva sempre alla pagina come file nell'evento di incolla. Nel campo della chat, se
Ctrl+V non porta né file né testo, la pagina chiede all'app i percorsi (`window.__MANGO_ANIMATION__.appunti.percorsi()`, un comando del ponte come la
dettatura: `app/src/appunti.rs`, `build.rs`, `capabilities/default.json`) e li manda al server (`POST /api/chat/allegati/locale`,
`docs/CHAT.md`), che li copia fra gli allegati. L'app dà solo i file che esistono (le cartelle no), e prima di darli li dice al server (`POST /api/app/percorsi`, `app/src/percorsi.rs`, `docs/API.md`: «I file scelti dal creator»), che altrimenti non ne prende il percorso; senza file negli appunti dà un elenco vuoto
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

## La rete in uscita

Ogni chiamata HTTP dell'app (scarichi, controllo del server, invio delle segnalazioni) nasce in `app/src/rete.rs` (`ureq` 3): i certificati sono quelli di Windows (`rustls-platform-verifier`) e non si installa né si spegne
il controllo di nessun certificato. Il proxy si decide per ogni indirizzo, in quest'ordine:
1. verso questo computer (`127.0.0.1`, `localhost`, `::1`) mai il proxy;
2. `NO_PROXY` (voci separate da virgole: `host`, `.dominio`, `*`, modelli come `10.*`) toglie l'host dal proxy, anche quello di Windows;
3. `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` (anche minuscole) vincono su Windows; con `http://utente:password@proxy:porta` il proxy riceve l'accesso Basic;
4. il proxy di Windows di quell'utente (Impostazioni › Rete › Proxy): lo script di configurazione automatica o il rilevamento (lo risolve WinHTTP), altrimenti il proxy a mano con la sua lista «non usare per».

Non si usano i proxy SOCKS né quelli che vogliono l'accesso di Windows (NTLM, Kerberos). Se la rete tace per 60 s a metà di uno scarico, il giro cade e il successivo riprende da dove era. Quando il certificato di un filtro aziendale non è tra quelli di Windows lo scarico, l'invio e il controllo degli aggiornamenti lo dicono con una frase che spiega cosa chiedere a chi gestisce il
computer, e non riprovano; un proxy che rifiuta o non risponde dice quale proxy.

Il plugin degli aggiornamenti ha la sua rete (`reqwest`, anch'essa con i certificati di Windows): `aggiornamento.rs` gli dà il proxy che `rete.rs` indica per l'indirizzo degli aggiornamenti. Anche `uv`, `bun` e Playwright,
che l'app lancia per scaricare, ricevono `HTTPS_PROXY` e `HTTP_PROXY` dal proxy di Windows se il creator non ne ha già messa una; i loro certificati sono i loro, non quelli di Windows.
Le prove stanno in `rete.rs`, `scarica.rs`, `segnalazione/mod.rs`, `tests/aggiornamento.rs`, con un proxy finto (`app/prove/rete/proxy_finto.rs`: registra i `CONNECT`, inoltra, rifiuta o presenta un certificato
firmato da una radice che nessun computer conosce; la chiave di quella radice non esiste più). La lettura delle impostazioni di Windows è dietro `proxy_di_windows`, che le prove sostituiscono.

## Le segnalazioni dei problemi

Chi usa l'app può mandare a chi la sistema ciò che sta andando storto, con un clic e senza dati personali. Il codice è `app/src/segnalazione/`
(`mod.rs` i comandi e la pagina «nuova issue», `rapporto.rs` l'evento e il testo, `registro.rs` `ui.log`, `anonimizza.rs`, `schermata.rs`, `ponte.js` lo script delle pagine).

- **Dove sta «Segnala un problema»**: nello studio, il bottone con la bandierina nella barra in alto (fra i segni di stato, raggiungibile da ogni vista) e, nella vista d'errore comune, «Segnala il problema»
  (porta con sé il messaggio e il dettaglio dell'errore); nelle pagine dell'app (`app/ui/`), un bottone in fondo a ogni pagina, d'attesa e d'errore comprese (nelle pagine d'errore porta il titolo e il messaggio). Nel browser,
  senza l'app, il ponte `window.__MANGO_ANIMATION__.segnalazione` non c'è e il bottone dello studio non compare.
- **Il dialogo**: «Cosa è successo?» (facoltativo); l'interruttore «Includi una schermata della finestra», spento di base (la finestra può mostrare i video e la chat), con la spiegazione che può mostrare contenuti del creator; una frase che dice che i registri allegati
  possono contenere i nomi dei suoi video e dei suoi file, che nome utente, nome del computer, email, indirizzi di rete e chiavi vengono tolti, e che trascrizioni, chat e file della cartella di lavoro non partono mai; «Invia» →
  «Inviato, grazie». Non parte niente senza il clic. Con la schermata, il dialogo si nasconde il tempo di riprendere la finestra, che altrimenti mostrerebbe il dialogo e non la pagina di cui si parla.
- **Dove va**: la segnalazione parte come un'unica busta HTTP (`ureq`, senza SDK) verso il progetto Sentry `mango-animation` dell'organizzazione `mango-o6` (dati in UE), il cui DSN sta in `segnalazione/mod.rs`
  (`SENTRY_DSN_DEL_PROGETTO`: un DSN permette solo di inviare). Una costruzione lo sostituisce con la variabile `MANGO_ANIMATION_SENTRY_DSN`, e vuota o `off` lo spegne: chi fa un fork la mette a `off` o al DSN di un suo
  progetto. Il comando `segnalazione_invio_attivo` dice alle pagine se l'invio è acceso: senza, l'interruttore della schermata non si mostra. Senza indirizzo il testo resta in
  `segnalazione-<data>-<ora>.txt` nella cartella dei registri, si mostra in Esplora file e si apre la pagina «nuova issue» di `github.com/Federico-Anastasi/mango-animation`, con titolo e testo già scritti: la macchina e la
  richiesta di allegare il file, niente di personale; la schermata in quel caso non si prende.
- **Cosa contiene**: `level: "error"`; `message` (la nota del creator o la prima riga dell'errore); `release: mango-animation@<versione>`; `environment` (`production` l'app installata, `development` quella di chi sviluppa);
  `tags` `kind` (`user-report` o `error-page`), `gpu`, `vram_mib`, `ram_mib`, `lingua`, `app` (`installata` o `sviluppo`); `contexts` `os`, `device`, `gpu`; `extra` `note`, `error`, `page`, `gpus`; allegati `report.txt` (riepilogo, nota,
  errore, e la fine di 256 KB di ogni `*.log` della cartella dei registri dell'app) e `screenshot.png` (`PrintWindow`, solo se l'interruttore è acceso). L'hardware lo legge `computer/hw.rs`. Non entra mai altro: né trascrizioni, né
  chat, né file della cartella di lavoro.
- **Anonimizzazione** (`anonimizza.rs`, su ogni testo e allegato): il nome utente nei percorsi (anche con le barre doppie dei JSON, e nel nome corto di Windows come `ALICER~1`) → `<user>`, il nome del PC e del dominio Windows → `<pc>`, il nome dell'azienda in `OneDrive - <nome>` → `<org>`, email → `<email>`, IPv4 (tranne `127.x` e `0.0.0.0`) e IPv6 (completi o abbreviati con `::`) → `<ip>`,
  chiavi e token (`sk-…`, `hf_…`, `ghp_…`, `github_pat_…`, `Bearer …`, `?key=`, `chiave=`, `token=`, `password=`, l'intestazione `X-Chiave-Api`, i cookie `mango_api_<porta>` e `mango_studio`) → `<secret>`, e la chiave delle API
  di questa cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`) ovunque compaia. I nomi dei video non si toccano: il dialogo lo dice.
- **`ui.log`** (`%LOCALAPPDATA%\dev.mango.animation\logs\`): gli errori non gestiti delle pagine (quelle dell'app e lo studio dentro l'app), i `console.error` e le chiamate dei ponti all'app più lente di 1 s o senza risposta dopo 5 s
  (`ponte.js` le avvolge; la scelta di una cartella aspetta il creator e non conta). Al più 100 righe al minuto (quelle tolte si contano in una riga), oltre 2 MB passa in `ui.1.log`.
  Le chiamate delle pagine dell'app a se stessa (`stato_app`, `azione`, …) non sono misurate: ogni loro errore sì.
- **Prove**: `cargo test` da `app/` (anonimizzazione con dati realistici, forma dell'evento, busta con le lunghezze esatte, invio contro un server locale, file e pagina di GitHub, tetto di `ui.log`; la schermata con una finestra vera:
  `cargo test una_finestra_vera -- --ignored`), `bun test prove installer` da `app/` (lo script delle pagine e il dialogo dell'app), `bun run test` da `studio/` (il bottone, il dialogo, la vista d'errore). Nei test niente va a Sentry.

## Costruire e avviare

Servono Rust (`rustup`) e `cargo install tauri-cli --version "^2"`; per il resto `docs/NUOVO-COMPUTER.md`. Si lavora dentro `app/`.

    cd app
    cargo tauri build --no-bundle    # app/target/release/mango-animation.exe
    cargo test                       # prove senza finestra né microfono
    cargo test il_motore_vero -- --ignored --nocapture   # col motore vero della dettatura: serve MANGO_ANIMATION_PROVA_WAV=<un WAV a 16 bit con la voce>
    cargo tauri dev                  # per lavorarci

Lo studio (`studio/dist`) lo costruisce `bun run --cwd studio build`: l'app mostra quello che il server serve. Con l'app aperta l'eseguibile
non si può sovrascrivere: va chiusa prima, con `--ferma` del comando qui sotto.

### Riavviare l'app

    bun run --cwd server riavvia-app              # chiude l'app registrata e la riaccende; senza app accesa la accende
    bun run --cwd server riavvia-app --ferma      # solo la chiude (serve per ricostruire l'eseguibile)
    bun run --cwd server riavvia-app --exe <percorso> --dati <cartella>   # un altro eseguibile, un'altra cartella del registro (prove)

Fa, in ordine: legge `app.json`; controlla che il pid sia vivo e che l'eseguibile di quel processo sia quello scritto (un pid che non c'è più o è diventato un altro programma vuol dire file vecchio: lo dice, lo toglie e non
ferma niente); chiude la finestra con garbo e aspetta fino a 15 s; se il processo non esce (o non ha una finestra) lo ferma con `taskkill /PID <pid> /T /F` e il Job Object ferma il server; aspetta fino a 10 s che la porta
del server si liberi (quella che l'app chiusa scriveva in `app.json`, `"porta"`; senza, `MANGO_ANIMATION_PORTA` o 47431); accende l'eseguibile registrato (senza app accesa: `--exe`, o `app/target/release/mango-animation.exe`) staccato dal comando; aspetta fino a 120 s che
`app.json` abbia un pid nuovo, di quell'eseguibile, con la sua `"porta"`, e che lo studio risponda lì, e scrive pid e porta (l'app può ripiegare su un'altra porta se la 47431 è occupata: conta quella che dichiara). Se non succede, l'errore indica `logs\server.log`.

- Ferma solo il pid del registro, mai per nome. Con `--exe` diverso dall'app accesa non la tocca. Un server che resta sulla porta senza che l'app lo abbia acceso non si ferma: l'avviso dice che la nuova app lo usa così
  com'è, con il codice del server non ricaricato.
- L'app nuova eredita l'ambiente di chi lancia il comando (`MANGO_ANIMATION_LAVORO`, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` messi per una prova arrivano all'app), tranne `MANGO_ANIMATION_APP_PID`.
- **Limiti.** Un'app che non ha scritto il registro non si vede: va chiusa a mano (se il secondo avvio viene assorbito dall'istanza unica, il comando lo dice). Dall'interno dell'app, cioè dalla chat, non si può:
  il comando rifiuta quando `MANGO_ANIMATION_APP_PID` è il pid registrato, perché fermerebbe se stesso con l'app; si lancia da un terminale fuori dall'app.
- **Perché un comando del server.** Non è uno strumento MCP, perché l'MCP lanciato dalla chat gira nel Job Object dell'app e morirebbe con lei a metà riavvio; non è un argomento dell'app, perché un figlio dell'app muore con
  il suo Job Object quando l'app si chiude. Il codice è `server/src/riavvia-app.ts` (entrata) e `server/src/riavvio.ts` (logica, con il sistema iniettabile per le prove).

L'icona nasce da `app/icons/sorgente.svg`; per rifarla: `cargo tauri icon icons/sorgente.svg -o <cartella vuota>` da `app/` e si copiano `32x32.png`,
`128x128.png`, `icon.ico` (`icon.png` è la sorgente resa a 1024 px: il comando la dà a 512, va resa a parte); le altre misure che il
comando crea non servono. Cargo non vede il cambio d'icona: prima di `cargo tauri build` si tocca `app/build.rs`, altrimenti l'eseguibile
tiene quella vecchia.

## Installer e aggiornamenti

L'installatore è un NSIS per utente (`installMode: currentUser`: niente amministratore), in italiano e in inglese, che mette l'app in `%LOCALAPPDATA%\Mango Animation\` con il codice del prodotto in `codice\` accanto
all'eseguibile (l'app lo trova da lì: `app/src/radice.rs`). **Non è firmato con un certificato di firma del codice**: al primo avvio Windows mostra «Windows ha protetto il PC»
(SmartScreen); la guida per chi la usa dice di premere «Ulteriori informazioni» e poi «Esegui comunque» (`docs/guida/italiano.md`).

- **Costruirlo**, da `app/` (dopo `bun install` in `studio/` e in `animazioni/`): `bun run installer/costruisci.ts`. È lo stesso comando del workflow delle uscite. Prima lancia `installer/prepara.ts` (costruisce studio e animazioni e mette in
  `target/codice/` il codice da portare: senza `node_modules`, prove e dati; i pacchetti li fa `bun install` al primo avvio, «Il computer pronto»), poi `cargo tauri build --config tauri.installer.conf.json`; se un passo non riesce, si ferma
  con un codice d'uscita diverso da zero. La costruzione non vede mai la chiave: la firma è un passo a parte (`cargo tauri signer sign`) che la riceve da solo. `--senza-firma` prepara e costruisce senza leggere nessuna chiave; `--solo-firma` firma l'installatore già costruito
  e senza chiave è un errore; senza opzioni fa le due cose. La chiave la cerca da sé, in quest'ordine: le variabili `TAURI_SIGNING_PRIVATE_KEY` (il testo della chiave, non il suo percorso) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; i file
  `mango-animation.key` e `mango-animation.password` in `%USERPROFILE%\.tauri\` («La firma», sotto); nessuna delle due: l'installatore esce lo stesso, senza firma e senza i file degli aggiornamenti. Una chiave trovata senza la sua
  password, o una password che non si apre, ferma la costruzione. Esce `target\release\bundle\nsis\Mango Animation_<versione>_x64-setup.exe` (con la sua `.sig` se c'era la chiave). La versione è `version` di `tauri.conf.json`.
  Costruisce anche `target\release\mango-animation.exe`: se quell'eseguibile è aperto, la costruzione non riesce.
- **Pubblicarlo.** Le uscite ufficiali si fanno solo con le GitHub Actions (`.github/workflows/release.yml`): una costruzione fatta su un computer porta nei file i percorsi di quel computer. Un tag `vX.Y.Z` (o `vX.Y.Z-rc.N`) fa partire
  il workflow, che fa in ordine (dal passo 2 dopo l'approvazione dell'environment `release`, dove stanno i segreti della firma):
  1. le prove che non vogliono scheda video né rete esterna, in un lavoro a parte senza segreti (`.github/workflows/prove.yml`, che si lancia anche a mano su un ramo, prima del tag): `cargo test`, `bun test` di `app/` (`prove` e `installer`), `studio` (le prove e `bun run lint`, le regole degli hook di React), `animazioni` e `server`, e gli avvisi di terzi. Quelle del server fanno video veri: prima il workflow scarica ffmpeg, lo stesso dell'app, dall'indirizzo e con l'impronta di `manifesto.json`. Non girano le prove di `motore/` e di `strumenti/` (vogliono pacchetti da gigabyte) né le `#[ignore]` di `app/` (finestra, motore e rete veri): si lanciano a mano prima del tag (`CONTRIBUTING.md`);
  2. `installer/verifica-versione.ts --tag <tag>`: la versione è la stessa in `tauri.conf.json`, `Cargo.toml`, `motore/__init__.py` e nel tag, e `installer/note/<tag>.md` esiste e ha l'elenco «**Changed since …**» (lanciabile anche a mano dalla radice, senza `--tag`);
  3. la costruzione, `costruisci.ts --senza-firma`, senza segreti;
  4. la firma, `costruisci.ts --solo-firma`: è il solo passo che riceve i segreti, e se mancano il workflow si ferma qui, perché un'uscita senza firma non si pubblica;
  5. la verifica della firma con la chiave pubblica di `tauri.conf.json` (`installer/verifica-firma-tauri.mjs`);
  6. `latest.json` (`installer/pubblica.ts --versione <v> --indirizzo <dove sarà scaricabile l'installatore> --note-file <note>`: versione, firma, indirizzo, e come note l'elenco «Changed since …» in testo semplice; nell'indirizzo il nome del file è quello che GitHub gli dà, coi punti al posto degli spazi);
  7. l'uscita **in bozza** con installatore, `.sig` e `latest.json`; solo se i tre file risultano caricati, della dimensione che hanno in locale, la bozza si pubblica (una `-rc.N` come pre-release, senza diventare «l'ultima»). Chi ha l'app non vede mai un'uscita a metà; se il controllo non torna la bozza resta in GitHub e il passo fallisce.

  `https://github.com/Federico-Anastasi/mango-animation/releases/latest/download/latest.json` è l'indirizzo che l'app interroga: `plugins.updater.endpoints` in `tauri.conf.json`. Il commit pubblico che porta il tag si prepara con `installer/albero-pubblico.mjs`
  (l'uso è nella sua intestazione): costruisce l'albero di un commit senza i file `export-ignore` di `.gitattributes`, lo controlla e si ferma prima di ogni commit.
- **Chi fa un fork** ottiene un installatore con `bun run installer/costruisci.ts`, anche senza chiave (esce senza gli aggiornamenti). Per aggiornare chi lo installa serve una chiave propria:
  `cargo tauri signer generate --ci -p <password> -w %USERPROFILE%\.tauri\mango-animation.key` (scrive anche `mango-animation.key.pub`). Poi in `app/tauri.conf.json` si mettono la chiave pubblica (`plugins.updater.pubkey`: il contenuto
  del file `.pub`) e l'indirizzo degli aggiornamenti del proprio repo (`plugins.updater.endpoints`: `https://github.com/<utente>/<repo>/releases/latest/download/latest.json`). Per le uscite dalle Actions, nell'environment `release`
  del proprio repo vanno i segreti `TAURI_SIGNING_PRIVATE_KEY` (il contenuto di `mango-animation.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Chi ha già installato l'app originale non riceve gli aggiornamenti del fork: la chiave pubblica è un'altra.
  Le segnalazioni di un fork non devono arrivare al progetto Sentry originale: si costruisce con `MANGO_ANIMATION_SENTRY_DSN=off` (o col DSN di un suo progetto), e in `segnalazione/mod.rs` `NUOVA_ISSUE` punta al proprio repo.
- **Gli aggiornamenti** sono automatici ma con il sì del creator: all'avvio, solo nell'app installata (il suo codice sta in `codice\`: l'eseguibile di chi sviluppa non si aggiorna mai), prima di accendere il server, l'app chiede
  l'indirizzo degli aggiornamenti. Se c'è una versione più nuova la pagina d'attesa dice quale e le sue note e chiede «Aggiorna ora» o «Più tardi»; col sì scarica e installa: l'app scrive l'installatore nella cartella temporanea e lo avvia
  (`/P /UPDATE /R`: passivo, come aggiornamento, riapre l'app) fuori dal suo Job Object (`CREATE_BREAKAWAY_FROM_JOB`: dentro il Job `KILL_ON_JOB_CLOSE` lo ucciderebbe appena l'app si chiude), poi esce; all'avvio dopo, l'app toglie dalla cartella temporanea gli installatori lasciati (quello ancora in uso resta fino all'avvio successivo). Se l'indirizzo non risponde entro 5 s (niente rete, nessuna uscita ancora) l'avvio prosegue in silenzio e il motivo si scrive in `aggiornamento.log` (`%LOCALAPPDATA%\dev.mango.animation\logs\`).
  **Dopo il sì**, invece, un errore (lo scarico non finisce o la firma non torna, l'installatore non parte, l'app resta aperta) si dice: la pagina «L'aggiornamento non è andato» scrive il motivo in parole semplici e offre
  «Riprova» (cerca di nuovo la versione e rifà il giro) e «Continua con la versione che hai» (lo studio parte con quella installata). Il motivo tecnico dell'updater sta in `aggiornamento.log`.
  Il giro è `aggiornamento::dopo_il_si`, con le parti iniettabili per le prove.
- **I file della versione.** L'installatore sovrascrive e non toglie: un file che la versione nuova non ha più resterebbe in `codice\`, e per le skill e le regole di `.claude\` vorrebbe dire che una skill tolta resta attiva. Per questo `prepara.ts`
  scrive in `codice\` l'elenco della versione (`.mango-elenco.json`: le cartelle e i file di primo livello del prodotto, tutti i file portati, e cosa non è del prodotto), e all'avvio dell'app installata, prima di cercare aggiornamenti
  (`app/src/codice.rs`), si toglie ciò che nelle cartelle del prodotto l'elenco non nomina, con le cartelle rimaste vuote. Non si tocca: `node_modules` e `__pycache__` a qualunque profondità, ciò che l'installatore non porta (le prove,
  `animazioni/foto`), la pagina delle animazioni che il server ricostruisce (`animazioni/dist` e i suoi blocchi), i collegamenti, e tutto ciò che sta fuori dalle cartelle dell'elenco (`.claude/settings.local.json`, la memoria di Claude Code).
  L'impronta dell'elenco applicato sta in `%LOCALAPPDATA%\dev.mango.animation\codice-in-ordine`: con lo stesso elenco non si guarda più; un file che non si riesce a togliere (aperto da un programma) si dice in `codice.log`, gli altri
  si tolgono lo stesso e si riprova al prossimo avvio. Resta fuori solo un file
  o una cartella di primo livello tolti dalla lista `DA_PORTARE`, che l'elenco non nomina più.
- **La firma** è quella dell'updater di Tauri, non un certificato a pagamento: l'app controlla il pacchetto con la chiave pubblica scritta in `tauri.conf.json` (`plugins.updater.pubkey`) e rifiuta ciò che non è firmato
  con la chiave privata corrispondente. La chiave privata si tiene fuori dal repo (di base in `%USERPROFILE%\.tauri\mango-animation.key`), protetta da una password: chi la perde non può più aggiornare chi ha già installato, e chi la
  ruba firma aggiornamenti per tutti. La password può stare accanto, in `mango-animation.password`, cifrata da Windows per l'utente che l'ha scritta (DPAPI: con un altro utente o su un altro computer non si apre); `costruisci.ts` la apre da sé con PowerShell.
  Una copia della chiave e della password va tenuta anche fuori dal computer che costruisce (un gestore di password). Se la si rifà, si riscrive la `pubkey` prima di pubblicare.
- **Le prove degli aggiornamenti** (`cargo test --test aggiornamento`, `tests/aggiornamento.rs`) non installano niente: un server di aggiornamenti finto serve `latest.json` e il pacchetto (in `prove/aggiornamento/`, firmato con una chiave di prova che non è nel repo), e l'updater vero chiede, confronta e scarica; provano versione più nuova, uguale e più vecchia, manifesto senza questo sistema, indirizzo che non risponde, pacchetto alterato, firmato con un'altra chiave o senza firma (rifiutato) e la configurazione (chiave pubblica valida, solo https, installatore per utente). Il resto ha le sue prove accanto al codice (`src/aggiornamento.rs`, `src/codice.rs`, `prove/pagina.test.ts`, `installer/*.test.ts`, `src/computer/`).
- **Cosa si prova solo installando**, su un computer che non sta lavorando (l'installatore chiude ogni `mango-animation.exe`): che l'installatore metta i file, che l'app installata proponga la versione nuova e che l'installatore avviato fuori dal Job sopravviva all'app che si chiude e la riapra (sotto `cargo test` no: cargo tiene le prove in un suo Job). Si costruiscono due installatori (0.1.0 e 0.1.1, con identificatore e nome di prova e la chiave di prova), un `latest.json` servito da `http://127.0.0.1:<porta>/` (`installer/pubblica.ts`) e si apre la 0.1.0 con `MANGO_ANIMATION_UPDATE_URL=http://127.0.0.1:<porta>/latest.json` (accettato solo su `127.0.0.1` o `localhost`, e http solo in una costruzione col config di prova; un altro indirizzo è un errore in `aggiornamento.log`). L'elenco dei file di un installatore si legge in `target\release\nsis\x64\installer.nsi`.

## Come si prova

Le prove `cargo test` non aprono finestre. La finestra vera non si guida con tastiera e mouse simulati a livello di Windows (finirebbero nella finestra che l'utente ha in primo piano): si usa il debug remoto di WebView2 (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<porta libera>` all'avvio dell'eseguibile, poi `chromium.connectOverCDP` di `playwright-core`, già in `studio/`), che arriva solo alla pagina dell'app anche in sottofondo. La finestra intera si fotografa come fa la segnalazione (`app/src/segnalazione/schermata.rs`) e si chiude chiedendolo a quella finestra, mai per nome di processo: solo per il PID di ciò che si è avviato.

## Dove sta cosa

| | |
|---|---|
| `app/src/lib.rs` | la finestra, l'avvio, la navigazione verso lo studio |
| `app/src/istanza.rs` | il registro dell'app in esecuzione (`app.json`) e la variabile col suo pid per il server |
| `app/src/radice.rs`, `server.rs` | dove sta il codice; il server già acceso o da accendere, e il comando che lo accende |
| `app/src/lavoro.rs` | la cartella di lavoro: la variabile, la scelta ricordata (e lo spostamento chiesto), la cartella predefinita in Documenti, il dialogo di sistema |
| `app/src/dati.rs` | la cartella dei dati vista dallo studio: leggerla e chiedere di spostarla (un comando del ponte, come la dettatura) |
| `app/src/cartella.rs` | dove stanno i video: lo spazio dei dischi, la cartella proposta, le scelte rapide e il riconoscimento di OneDrive |
| `app/src/sposta.rs` | lo spostamento della cartella dei dati: copia con avanzamento, verifica, originali tolti, o tutto com'era |
| `app/src/supervisor.rs` | i processi avviati, il Job Object, i log |
| `app/src/lingua.rs` | la lingua delle pagine dell'app: come si sceglie, la scelta ricordata, `t(it, en)`, il ponte con cui lo studio dice la sua (un comando del ponte) |
| `app/src/titolo.rs` | il colore della barra del titolo (un comando del ponte: lo studio è una pagina remota) |
| `app/src/claude.rs` | il Claude Code del creator: dove sta, versione e account, l'accesso e l'installazione |
| `app/src/codice.rs` | `codice\` dopo un aggiornamento: toglie i file che la versione nuova non ha più (l'elenco di `prepara.ts`) |
| `app/src/preparazione.rs` | i passi dell'avvio che aspettano il creator, e le sue risposte dalla pagina d'attesa |
| `app/src/computer/` | il computer pronto: cosa c'è (`hw.rs`), il manifesto di ciò che si scarica, il piano (`piano.rs`), lo scarico con verifica (`scarica.rs`), gli installatori (`installa.rs`), il profilo (`profilo.rs`), il ponte per lo studio (`ponte.rs`) |
| `app/src/segnalazione/` | «Segnala un problema» e `ui.log`: l'evento per Sentry, l'anonimizzazione, la schermata, il ponte per le pagine (comandi del ponte) |
| `app/src/aggiornamento.rs` | cercare, scaricare e installare una versione nuova, e l'errore dopo il sì |
| `app/installer/`, `app/tests/aggiornamento.rs` | costruire e pubblicare l'installatore (`costruisci.ts`, `prepara.ts`, `pubblica.ts`) e provare gli aggiornamenti con l'updater vero e un server finto |
| `app/src/zoom.rs` | lo zoom della finestra (Ctrl+ / Ctrl- / Ctrl+0), ricordato fra un avvio e l'altro |
| `app/src/appunti.rs` | i file copiati in Esplora risorse, per la chat (un comando del ponte, come la dettatura) |
| `app/src/trascinamento.rs` | i file lasciati sulla finestra, con il loro percorso (eventi, niente comandi) |
| `app/src/voce/` | la dettatura: il microfono, il motore locale (`locale.rs`), il ponte verso la pagina (`ponte.js`) e le sue prove (`prove.rs`) |
| `app/ui/`, `app/prove/pagina.test.ts` | la pagina d'attesa e d'errore, locale all'app, e le sue prove |
| `app/tests/linguaggio.rs` | le prove sui sorgenti: ogni frase della pagina e del Rust ha italiano e inglese |

I log (`server.log`, `aggiornamento.log`, `codice.log`) stanno in `%LOCALAPPDATA%\dev.mango.animation\logs\`.
