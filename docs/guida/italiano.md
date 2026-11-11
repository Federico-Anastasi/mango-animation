# Mango Animation: la guida

Mango Animation è un'app per Windows che ti aiuta a fare video brevi: tieni le tue riprese in un archivio, scrivi lo script, ti registri con una prova davanti, e l'app monta il video con la tua sagoma, le animazioni e la copertina. Il lavoro lo fa Claude, in una chat dentro l'app; lo **studio** (le pagine dell'app) ti fa vedere cosa c'è e ti lascia ritoccare.

English version: [english.md](english.md).

1. [Cosa serve e come si installa](#1-cosa-serve-e-come-si-installa)
2. [Il primo avvio](#2-il-primo-avvio)
3. [Il tuo profilo](#3-il-tuo-profilo)
4. [Un video, dall'idea all'uscita](#4-un-video-dallidea-alluscita)
5. [Il telefono, registrare, le lingue](#5-il-telefono-registrare-le-lingue)
6. [Quando qualcosa non va](#6-quando-qualcosa-non-va)

---

## 1. Cosa serve e come si installa

### Cosa serve

- **Windows 10 o 11, 64 bit.** L'app è solo per Windows (provata su Windows 11).
- **Claude Code**, con il tuo account Claude. L'app non lo porta con sé e non usa le tue credenziali: parla con il programma che hai già sul computer, e il lavoro della chat conta nei limiti del tuo abbonamento Claude, pensati per un uso ordinario e individuale: i lavori lunghi messi in fila (per esempio tanti rimontaggi di seguito) li consumano in fretta. Se non ce l'hai, l'app ti guida a installarlo al primo avvio (sotto).
- **Spazio sul disco.** Al primo avvio l'app scarica i programmi e i modelli che le servono: circa 12 GB con una scheda video NVIDIA, circa 8 GB senza. Tieni liberi almeno 20 GB (12 senza scheda), più lo spazio per le tue riprese. L'app ti mostra le cifre esatte prima di scaricare e non parte se lo spazio non basta.
- **Una scheda video NVIDIA è consigliata, non obbligatoria.** Con la scheda i lavori pesanti (trascrizione, sagoma, resa delle animazioni) sono molto più veloci. Senza, si fa tutto lo stesso, solo più lentamente. La sezione **Computer** delle **Impostazioni** dice cosa ha il tuo computer e dove gira ogni funzione. Due soglie da sapere: la sagoma sul processore è lenta sotto gli 8 thread, e con meno di 4 GB di memoria il modello grande per capire la voce non ci sta e resta quello piccolo, meno preciso.
- **Una connessione a internet**, per lo scarico del primo avvio e per Claude.
- **Facoltativi:** un microfono e una webcam (per registrare dallo studio e dettare alla chat), un telefono (per mandare le riprese al computer e guardare i video).

### Come si installa

1. Scarica `Mango.Animation_<versione>_x64-setup.exe` dall'ultima uscita: <https://github.com/Federico-Anastasi/mango-animation/releases/latest>.
2. Aprilo. Non servono i diritti di amministratore: l'app si installa solo per il tuo utente.
3. **Windows mostra «Windows ha protetto il PC».** Succede perché l'installatore non ha un certificato di firma del codice (costa ogni anno, e questa app non ce l'ha). Premi **«Ulteriori informazioni»** e poi **«Esegui comunque»**. Il codice dell'app è pubblico e gli aggiornamenti hanno una firma propria, che l'app controlla.
4. Apri Mango Animation.
5. Quando esce una versione nuova, all'avvio l'app lo dice e ne mostra le novità: **«Aggiorna ora»** scarica e installa (l'app si chiude e si riapre da sola), **«Più tardi»** ti lascia lavorare.

---

## 2. Il primo avvio

All'avvio l'app passa per alcuni controlli, uno dopo l'altro. Ognuno compare solo se c'è qualcosa da fare. Queste schermate seguono la lingua dello studio (la prima volta, quella di Windows).

### La cartella dei dati

La prima volta l'app ti chiede **«Dove tengo i tuoi video?»**. Ti propone la cartella **Mango Animation** dentro **Documenti**, con lo spazio libero del disco; se un altro disco ha più spazio lo trovi sotto «Altre cartelle». Premi **«Usa questa cartella»**, oppure **«Scegli un'altra cartella»**. Lì stanno le tue riprese, i tuoi video e il tuo profilo, e pesano molto: se la cartella è dentro **OneDrive** la pagina ti avvisa, perché OneDrive li copierebbe online. Per spostarla dopo, dentro lo studio premi il bottone con la cartella nella barra in alto («Cartella dei dati») e poi **«Sposta la cartella dei dati…»**, scegliendo una cartella vuota: alla prossima apertura l'app copia tutto, controlla che sia arrivato tutto e solo allora toglie i file di prima. Se qualcosa non va, i tuoi file restano dove erano.

Se la cartella sparisce (disco staccato, cartella spostata), l'app lo dice e offre **«Ricrea in Documenti»** o **«Scegli un'altra cartella»**.

### Il collegamento a Claude Code

Per usare l'app serve **un account Claude con un abbonamento** (Pro, Max, Ultra, Team o Enterprise: il piano gratuito non include Claude Code). La pagina ha il link ai piani.

- **«Per cominciare serve Claude Code»** o **«Claude Code non parte»**: premi **«Installa Claude Code»**. Si apre una finestra (è normale) che lo installa e si chiude da sola; poi l'app ricontrolla. Se non riesce lo dice, e puoi premere **«Riprova»**. Se preferisci, sotto trovi il comando di Anthropic da incollare in **PowerShell**, e il link alla loro guida. Se lo hai installato altrove, premi **«Ricontrolla»**.
- **«Collega Claude Code al tuo account»**: premi **«Accedi a Claude Code»**. Si apre una finestra nera (è normale) e poi il browser, dove entri con il tuo account Claude. Quando la finestra si chiude, l'app ricontrolla da sola. Se hai fatto l'accesso altrove, premi **«Ricontrolla»**.

Senza Claude Code installato e collegato l'app non va avanti. Se in più Mango Code è acceso, la pagina lo dice: lo troverai fra i motori della chat.

Se Claude Code è già installato e collegato, questo passo non compare.

### Il computer pronto

L'app guarda cosa c'è nel tuo computer (scheda video, processore, memoria, spazio libero) e propone cosa scaricare. Sotto **«Funzioni»** ci sono sei caselle; di base sono tutte accese:

| funzione | a cosa serve |
|---|---|
| Capire cosa dico | trascrive la tua voce: servono i sottotitoli parola per parola e i pezzi scelti a parole |
| Tagli precisi sulle parole | trova dove comincia e finisce ogni parola |
| La mia sagoma sopra le animazioni | ritaglia te dallo sfondo |
| Seguire la persona nelle riprese larghe | ti tiene al centro se riprendi da lontano |
| Voce pulita | toglie il rumore di fondo dalla voce |
| Dettare alla chat | il microfono nella chat |

Spegni ciò che non ti serve: l'elenco di sotto e lo spazio richiesto si ricalcolano. Ogni voce dell'elenco dice cos'è, quanto pesa, la sua **licenza** (con il link alla fonte) e a che punto è. I modelli **non sono dentro l'app**: si scaricano dalla loro fonte e ogni file è verificato prima dell'uso. Una voce, il modello che trova dove cade ogni parola, ha una licenza non commerciale: la sua riga lo dice.

**Se guadagni dai tuoi video.** «Tagli precisi sulle parole» usa il modello MMS (Meta), con licenza **CC-BY-NC-4.0: solo uso non commerciale**. Se i tuoi video ti fanno guadagnare (monetizzazione, sponsor, lavoro per clienti), la licenza potrebbe non permetterti di usarlo: nel dubbio, **spegni «Tagli precisi sulle parole»**, qui nel primo avvio (il modello non si scarica) o dopo nella pagina **Motori**. Senza, i pezzi scelti a parole restano, ma i bordi si cercano sul livello della voce e sono meno precisi. Di base la funzione è accesa: la scelta è tua.

- **«Scarica e comincia»** comincia lo scarico (resta spento se lo spazio non basta: libera spazio o spegni qualche funzione). Quanto ci mette dipende dalla tua connessione: sono diversi gigabyte, e ogni voce ha la sua barra.
- **Non chiudere l'app** mentre scarica. Se si interrompe, al prossimo avvio riparte da dove era arrivata. **«Ferma»** torna al piano.
- Se qualcosa non va, la pagina dice quale voce e perché; **«Riprova»** non riscarica ciò che è già arrivato.
- **«Non ora»** apre lo studio com'è. Le funzioni che mancano si fermeranno e diranno cosa manca.

Dopo, per accendere o spegnere una funzione, usa **Impostazioni › Computer**: ciò che accendi lo scarica l'app al prossimo avvio.

### Lo studio

Appena il computer è pronto, l'app mostra lo studio. In alto la barra con le pagine:

| pagina | cosa trovi |
|---|---|
| **Video** | i tuoi video, per stato |
| **Girato** | tutte le tue riprese |
| **Canale** | per chi pubblica su TikTok, in tre schede: **Pubblico** (numeri e commenti dei video usciti), **Classifica** (confronto con altri profili), **Crescita** (piano di crescita). Compare nella barra solo quando c'è un canale letto: la prima lettura la chiedi nella chat («aggiorna i dati di TikTok») o da **Impostazioni › Profilo**, con **«Leggi i dati di TikTok»** |
| **Produzione** | quanti video hai fatto e quanto lavoro di Claude sono costati |
| **Impostazioni** | cinque sezioni: **Profilo** (chi sei, a chi parli, dove pubblichi, cosa non dici), **Stile** (i tuoi standard: inquadrature, colori, sottotitoli, titolo; i valori si cambiano e si salvano con **«Salva»**), **Computer** (cosa ha il computer e quali funzioni pesanti sono accese), **Telefono** (collegarlo, e lo studio dal telefono), **Generali** (cartella dei dati, lingua, tema, guida) |

A destra nella barra: **Telefono pronto** (compare quando il telefono può mandare file), **Chat**, **Registra** e **Lavori** (compare quando c'è qualcosa in corso o in coda).

---

## 3. Il tuo profilo

Il metodo con cui l'app fa i video è lo stesso per tutti. Ciò che è tuo (come parli, a chi parli, dove pubblichi, cosa non dici, il tuo computer) sta nel tuo **profilo**, nella cartella dei dati. Claude lo legge prima di proporti, scriverti o montarti qualsiasi cosa, e **dove il profilo cambia una regola di serie, vince il profilo**.

### Cosa contiene

| voce | cosa dice |
|---|---|
| Chi sei | il tuo nome e la lingua in cui parli e scrivi: è la lingua dei tuoi video e delle risposte di Claude |
| Il pubblico | che livello ha (per esempio «non tecnico»: niente sigle né numeri tecnici a schermo), la sua lingua, le testate che conosce (le pagine di giornale nei video sono le sue) |
| I canali | dove pubblichi (TikTok, Instagram, YouTube, X), con che nome e in che formato (verticale o orizzontale). Le regole di una piattaforma valgono se sta fra i tuoi canali |
| Cosa non dici | frasi, argomenti, toni che nei tuoi video non ci sono: proposte, script, didascalie e risposte li rispettano |
| Le fonti delle idee | le cartelle dei tuoi lavori da cui nascono le proposte |
| Il tuo computer | quale scheda video usare se ne hai più d'una, e se il disco è quasi pieno (allora un video grande si collega invece di essere copiato) |
| Le tue regole | testo libero: come costruisci un video, come chiudi, come scrivi didascalie e hashtag, come chiami le inquadrature |

Il tuo **stile** (colori, titolo, sottotitoli, ritmo) sta in **Impostazioni › Stile**: quello che cambi si sovrappone a quello di serie, e il resto resta com'è. In cima ci sono tre stili di partenza da scegliere vedendoli (**«Usa questo»**), e col pulsante **«Aggiungi un carattere»** porti un tuo carattere (`.ttf`, `.otf` o `.woff2`) nei sottotitoli, nel titolo e nelle animazioni.

### Come lo scrivi

Dillo a Claude nella chat. Per esempio:

> Facciamo il mio profilo: fammi le domande che servono e scrivilo.

Claude ti chiede chi sei, a chi parli, dove pubblichi, cosa non dici, e lo scrive nella cartella dei dati. Puoi correggerlo quando vuoi: a parole («aggiungi YouTube fra i miei canali», «il mio pubblico non è tecnico», «non dico mai…») oppure da **Impostazioni › Profilo**, dove vedi i campi e li cambi con **«Salva»** (ciò che scrive la chat compare lì, e viceversa; se un campo non va, la pagina dice quale e perché). **Non modificare il file a mano**: un errore di scrittura lo rende inutilizzabile: l'app parte lo stesso, ma lavora con l'ultimo profilo che andava (o senza profilo, se non ce n'era uno) finché non lo sistemi. Chiedi a Claude.

Senza profilo l'app funziona con le regole di serie, ma Claude non sa niente di te né del tuo pubblico: conviene cominciare da qui.

Il computer (quali funzioni sono accese, dove girano) lo regoli anche da **Impostazioni › Computer**, senza passare dalla chat.

---

## 4. Un video, dall'idea all'uscita

Parli con Claude nella **chat** e guardi il risultato nello studio. Ogni video segue gli stessi otto passi, nello stesso ordine; un passo lo salti solo se lo dici tu. Prima di un lavoro lungo Claude ti dice cosa fa e quanto ci vorrà (per esempio «circa 4 min, finisce verso le 15:42») e aspetta il tuo via.

### La chat

- Il bottone **Chat** nella barra (o **Ctrl+J**) la apre e la chiude; un punto rosso dice che Claude sta lavorando o aspetta una tua risposta. Sopra la chat trovi il titolo, lo stato («Pronta», «Sta lavorando», «Aspetta una tua risposta»), **Modello** ed **Effort** (quanto ragiona Claude prima di rispondere) e due bottoni a icona: **«Le conversazioni»** (ne riprendi una vecchia, anche una aperta da terminale) e **«Nuova conversazione»**.
- Claude sa quale video e quale pagina stai guardando: puoi dire «questo video» o «questa scheda».
- **Scrivi** e premi Invio (Maiusc+Invio va a capo). Mentre Claude lavora puoi scrivere lo stesso: il messaggio va in coda. **«Ferma»** interrompe il lavoro; **«Manda in background»** (o Ctrl+B) lo sposta e ti lascia parlare.
- **Allega** immagini e file con la graffetta, incollandoli o trascinandoli sulla chat. Un video grande non viene copiato, viene collegato.
- Nell'app c'è anche il **microfono**: un clic (o **Ctrl+Spazio**) e detti, un altro clic e finisci. Il testo lo trascrive il tuo computer, l'audio non esce. Rileggi e mandi tu.
- Claude lavora in autonomia: esegue comandi e scrive file senza chiederti il permesso.
- Quando Claude ha una scelta da farti, ti mostra dei bottoni; **«Altro»** apre un campo dove scrivi tu.
- Le immagini che Claude ti mostra (foto dei video, fotogrammi delle scene) stanno nella conversazione e si aprono a tutto schermo con un clic.
- **Se preferisci Claude Code dal terminale**, con l'app aperta, entra nella cartella dei dati e avvialo così (in PowerShell): `claude --plugin-dir "$env:LOCALAPPDATA\Mango Animation\codice"`. Claude ha lo stesso metodo e gli stessi strumenti della chat.

### Dove stanno i tuoi video

La pagina **Video** li divide per stato: in lavorazione, proposte, pronti, pubblicati, scartati. Ogni video è una carta con la sua immagine e dice a che passo è («Passo 3 di 8 · Prova»). Per un video nuovo c'è la riga «Per un video nuovo, chiedilo nella chat». Aprendo un video trovi queste schede: **Prova** (quando c'è), **Montaggio**, **Scheda**, **Controllo**, **Copertina**, **File**. Il menu **Stato** in alto cambia lo stato (Proposta, In lavorazione, Pronto, Pubblicato, Scartato).

In testa alla pagina di un video una riga mostra gli otto passi qui sotto: quelli fatti segnati, quello di adesso in rilievo (a pagina stretta si accorcia in «Passo 3 di 8 · Prova»), e accanto cosa dire nella chat per andare avanti, per esempio «Dimmi in chat: “fammi la prova”». **«Scrivila nella chat»** mette quella frase nel campo della chat senza mandarla: la rileggi, la cambi se vuoi e la mandi tu. Il passo si ricava dai file del video, non va segnato a mano.

Il pannello **Lavori** nella barra dice cosa sta girando e cosa aspetta, con la stima di quanto dura e **«Ferma»** per interrompere. Il computer fa un lavoro pesante alla volta.

### I passi

| | passo | cosa dici nella chat | dove guardi |
|---|---|---|---|
| 1 | **L'idea** | «cosa facciamo adesso?» oppure «ho pensato a…», o porti delle riprese («ti ho dato i video») | **Video**, gruppo **Proposte**: la carta del nuovo video con la sua anteprima |
| 2 | **Lo script** | discuti il testo con Claude finché ti va bene | video, scheda **Scheda**, sezione **Il copione**: **Aggancio**, **Centro**, **Chiusa** (li puoi anche scrivere tu: si salva uscendo dal campo) |
| 3 | **La prova** | «fammi la prova» | scheda **Prova** (le animazioni con la battuta da dire, per registrare) |
| 4 | **Il testo registrato** | «ho registrato» | in chat, frase per frase, con la ripresa scelta; in **Girato**, aprendo il file, **Il parlato** con i tempi |
| 5 | **Testo e animazioni** | dici cosa funziona e cosa no | in chat prima a parole, poi un fotogramma per scena |
| 6 | **Il montaggio** | «monta» | scheda **Montaggio**, **Controllo**, **Copertina** |
| 7 | **Le correzioni** | le note del giro, tutte insieme | anteprime dei pezzi toccati, poi il montaggio intero una volta sola |
| 8 | **L'uscita** | «è approvato, dammi la didascalia», poi «l'ho pubblicato» | scheda **Scheda**: **Didascalia e hashtag**, **Dove è uscito** |

**1 e 2. Idea e script.** Puoi partire da riprese che hai già, da lavori già fatti nelle tue fonti, da cosa chiede il pubblico o da un'idea tua. Claude ti propone le proposte prima a parole (aggancio, centro, chiusa, durata), poi le mette in archivio. Ti dice anche con che inquadratura le vede; tu puoi chiederle con le tue parole:

| se dici… | l'inquadratura è |
|---|---|
| «con la mia sagoma e le animazioni» | tu in sagoma sopra animazioni; sopra le animazioni, i sottotitoli, sotto la tua testa |
| «estrai dalla diretta» | registrazione 16:9: schermo sopra, il tuo viso sotto, pezzi scelti a parole |
| «solo io che parlo», «video normale» | la ripresa a tutto schermo, sottotitoli sotto la testa, senza animazioni |
| «senza la mia faccia, tutte animazioni» | la tua voce sotto, l'animazione a tutto schermo |
| «inquadriamo lo schermo», «un documento» | lo schermo o il documento, senza il tuo viso |

**3. La prova.** È un video senza la tua voce: le animazioni con, sotto, ogni frase intera da leggere (la parola da dire ora in rosso, quelle già dette in nero, quelle da dire in grigio). Ti registri guardandolo. Non è il video finito. Il pannello **Lavori** la mostra come «Prova per registrare»; dal telefono la trovi nella pagina «Le prove» (sezione 5).

**4. Il testo registrato.** Le riprese arrivano dal computer (**Aggiungi video**, in **Girato**), dal telefono, da **Registra** o dalla chat (sezione 5). Appena ci sono, Claude le trascrive e ti propone il testo del video frase per frase, con la ripresa scelta, i secondi, e cosa resta fuori. Discuti finché lo fissi.

**5. Testo e animazioni.** Per ogni frase Claude descrive a parole cosa mostra la scena e su quale parola entra ogni cosa; tu dici cosa va e cosa no. Poi un **fotogramma fermo** per scena. La resa vera parte solo dopo il tuo sì. Le animazioni sono sempre in movimento, mai un elenco puntato animato.

**6. Il montaggio.** Claude scrive il piano del montaggio, ti dice quanto dura e aspetta il tuo via. Poi monta (i tagli cadono sempre sulle parole intere), **controlla** (riascolta il file, guarda i fotogrammi accanto alle parole, rilegge cosa dici e cosa mostri alla ricerca di errori) e fa la copertina. Nella scheda **Montaggio**:

- l'anteprima ha due modi: **Piano** (mostra subito il piano, per correggere) e **Montato** (il video completo, con la copertina in testa);
- sotto, la **timeline**: scene, pezzi, parole, sottotitoli, titolo e suoni; puoi trascinare i bordi dei pezzi e dividere con il tasto **S**;
- **Annulla** e **Rifai** sono in alto; sotto, **Versioni** elenca i piani di prima con data e ora e quante scene e pezzi avevano: **Guarda** mostra com'era (scene e pezzi, senza cambiare niente) e **Torna a questa** lo rimette, dopo una conferma. Quello di adesso resta fra le versioni: non si perde niente. Il video montato cambia solo quando lo rimonti.

Se ritocchi a mano e Claude sta già montando, la barra dice «Piano cambiato»: il montaggio ripartirà da solo, oppure lo fermi con **«Ferma»** nel pannello Lavori e chiedi a Claude di rimontare.

La scheda **Controllo** mostra l'esito: silenzi, esitazioni, parole fuori posto, tagli nel parlato, differenze fra ciò che volevi e ciò che si sente. Le cose da verificare nei contenuti Claude le segna per te. La scheda **Copertina** mostra la copertina e il video con la copertina in testa: entra nel video col montaggio.

**7. Le correzioni.** Guarda il video e raccogli tutte le note in un messaggio solo. Claude le applica in una volta, fa le **anteprime** dei pezzi toccati (un minuto o due) e solo quando sono giuste rifà il montaggio intero.

**8. L'uscita.** Claude ti propone due versioni della didascalia con gli hashtag, e ti dice quale file caricare. **Pubblichi sempre tu**: Claude non scrive sui tuoi canali. Quando hai pubblicato, dillo (con l'indirizzo se ce l'hai): Claude segna il video come pubblicato e registra la data. Nella scheda **Scheda** trovi didascalia (con **«Copia la didascalia»**), hashtag, dove è uscito e, quando il canale viene letto dopo l'uscita, i numeri.

Per aprire un file o un video, chiedi a Claude di mostrartelo: lo apre nel browser. Nella scheda **File** trovi i file che escono (**«Mostra nella cartella»**, **«Copia il percorso»**) e le riprese usate.

### Caroselli

Oltre ai video puoi fare **caroselli** (immagini che scorrono, per TikTok): chiedi «facciamo un carosello». Hanno tre schede: **Slide**, **Scheda**, **File**. Le slide si rendono e si rifanno chiedendolo nella chat.

### Leggere TikTok e scaricare dal web

Se lo chiedi, Claude può leggere i numeri, i commenti e i messaggi del tuo canale TikTok dal tuo browser, e scaricare nel girato un video del web (o un suo pezzo). Fallo **solo sui tuoi account e su contenuti che hai il diritto di usare**: i termini di TikTok, di YouTube e degli altri siti li devi rispettare tu, l'app non li controlla.

---

## 5. Il telefono, registrare, le lingue

### Cercare cosa hai detto

In **Girato**, sopra l'elenco, il campo **«Cerca nel parlato»** cerca nelle parole già trascritte di tutti i tuoi file, senza badare a maiuscole e accenti: scrivi una parola o più parole di fila («il segreto è la pazien»). I risultati dicono il file, il minuto e la frase intorno; un clic apre il file a quel punto. Cerca solo nei file già preparati.

### Mettere nel girato un video che hai già sul computer

Nella pagina **Girato** premi **«Aggiungi video»** e scegli i file (anche più insieme), oppure trascinali sulla pagina: mentre li trascini compare il riquadro dove rilasciarli. Vanno bene video, foto e registrazioni audio. Sotto la testata vedi a che punto è ogni file; un file che non entra dice perché (per esempio è già nel girato). I file entrano nel girato di oggi, con la loro scheda, come quelli che arrivano dal telefono.

### Mandare le riprese dal telefono al computer

In **Impostazioni › Telefono** c'è il riquadro **«Arrivi dal telefono»**. Di base è spento: il computer non ascolta la rete. Premi **«Collega un telefono»**: compaiono due codici da inquadrare col telefono, nello stesso Wi-Fi.

- **La Scorciatoia**: installa sull'iPhone un comando rapido che manda i video al computer.
- **Carica dalla pagina**: apre sul telefono una pagina con il bottone «Carica video», per scegliere dalla libreria. Non serve installare niente.

Le riprese entrano nel girato del giorno, con la loro scheda. Nella barra, **Telefono pronto** (puntino verde) dice che il telefono può mandare. La prima volta Windows può chiederti il permesso di far entrare il programma dalla rete: tocca **«Consenti»**. Se il telefono non è pronto, il riquadro dice perché e cosa fare, con **«Controlla di nuovo»**. **«Scollega i telefoni»** chiude di nuovo la porta.

### Guardare i video dal telefono

Quando un telefono è collegato, nella pagina **Video** e nella pagina di ogni video compare **«Dal telefono»**: mostra un codice da inquadrare, sempre nel Wi-Fi di casa. Si apre una pagina con i tuoi video montati (la versione completa, con la copertina) e le prove da guardare prima di registrare. Salvala nella schermata Home e la ritrovi lì. Le pagine del telefono sono scritte in italiano.

### Lo studio intero dal telefono

In **Impostazioni › Telefono**, sotto gli arrivi, **«Lo studio dal telefono»** (spento di base). **«Accendi»** mostra due strade, ognuna con il suo codice: **In casa (stesso Wi-Fi)** e **Fuori casa (Tailscale)**, che richiede Tailscale acceso sul computer e sul telefono. Col telefono usi lo studio intero: video, montaggio e chat. **Chi ha il link comanda il tuo computer** attraverso la chat: non darlo a nessuno. **«Spegni»** fa uscire tutti e cambia il link; **«Rifai la chiave»** dà un link nuovo, e i telefoni già entrati devono rientrare. Il riquadro si vede solo dal computer, non dal telefono.

### Registrare dallo studio

Il bottone **Registra** nella barra apre un pannello. Scegli cosa registrare:

- **Solo lo schermo** (senza audio);
- **Schermo e voce** (lo schermo con la voce dal microfono, in un file);
- **Schermo, voce e viso** (in più la webcam, in un secondo file).

Per le voci con il microfono e per il viso scegli anche quale microfono e quale webcam (se non li vedi, **«Cerca di nuovo i dispositivi»**). **«Avvia la registrazione»**: la barra mostra il tempo che passa. **«Ferma la registrazione»** dal pannello: i file compaiono nel girato di oggi. Si registra lo schermo intero. Per un video verticale conviene registrare con la finestra del programma stretta e alta, così lo schermo riempie il fotogramma.

### Le lingue

- **L'interfaccia** è in italiano e in inglese. Si sceglie in **Impostazioni › Generali**: la lingua del sistema, l'italiano o l'inglese. Le schermate dell'app e i suoi messaggi di errore seguono la stessa lingua.
- **La lingua dei tuoi video** è nel profilo: Claude ti scrive in quella lingua e prepara i testi dei video in quella lingua.
- **Una versione in un'altra lingua** di un video già fatto: chiedi «la versione inglese» (o un'altra lingua). Cambiano sottotitoli, titolo, copertina e scritte nelle animazioni; la tua voce resta quella originale. Il video tradotto è un video nuovo accanto all'originale. Se la copertina ha del testo disegnato, va rifatta tradotta.

---

## 6. Quando qualcosa non va

### Come riavviare

Chiudi la finestra dell'app e riaprila dal menu Start. Chiudendola, l'app ferma anche tutto ciò che aveva avviato. Se dopo averla chiusa un nuovo avvio non apre niente, apri Gestione attività (Ctrl+Maiusc+Esc), termina «Mango Animation» e riaprila.

### Dove guardare

| cosa vedi | cosa significa e cosa fare |
|---|---|
| **«Sto preparando tutto»** per più di un minuto | l'app sta accendendo lo studio (aspetta fino a 90 secondi) |
| **«Il server non parte»** | l'app mostra le ultime righe di ciò che è andato storto e dove sta il registro: **«Riprova»**; se non passa, chiudi e riapri, e se ancora no manda quelle righe a chi ti aiuta |
| **«La cartella dei dati non va»** o **«non c'è più»** | vedi «La cartella dei dati» nella sezione 2 |
| **«Per cominciare serve Claude Code»**, **«non parte»**, **«Collega Claude Code al tuo account»** | vedi «Il collegamento a Claude Code» nella sezione 2 |
| **«Qualcosa non è andato»** nello scarico | la pagina dice quale voce e perché: **«Riprova»** riprende senza riscaricare ciò che è arrivato |
| la chat dice perché una conversazione non si apre | **«Riprova»**; se è l'accesso a Claude Code, rifallo dalla pagina di avvio |
| un avviso rosso sulla scheda o sul piano di un video | un file non passa i controlli: chiedi nella chat di sistemarlo; il perché preciso si apre a richiesta |
| un lavoro **non riuscito** nel pannello **Lavori** | chiedi a Claude cosa è successo e di rifarlo |
| **«Più del previsto»** su un lavoro | sta impiegando più della stima; puoi aspettare o fermarlo con **«Ferma»** |
| il telefono non manda i file | in **Girato**, in cima, una riga lo dice; apri **Impostazioni › Telefono**: il riquadro dice perché (di solito Windows blocca il programma: sbloccalo in «Sicurezza di Windows» o metti il Wi-Fi su «Rete privata») e **«Controlla di nuovo»** |
| **Registra** dice che non è disponibile | il pannello scrive il motivo |
| **Impostazioni › Computer** dice che una scelta non va | per esempio una scheda che non c'è o è occupata: il lavoro si ferma e dice cosa correggere, non passa da solo al processore |
| lo spazio non basta | libera spazio, oppure spegni qualche funzione nella pagina di scarico del primo avvio (o in **Impostazioni › Computer**) |

Il piano di un video, le schede e i file che l'app scrive sono nella cartella dei dati. Se qualcosa si rompe dopo una modifica a mano, chiedi a Claude di sistemarlo: nella cartella c'è la versione di prima del piano.

---

*Mango Animation è un progetto indipendente, non è un prodotto di Anthropic né è approvato o sostenuto da Anthropic. «Claude» e «Claude Code» sono marchi di Anthropic e qui servono solo a nominare il programma che l'app usa.*
