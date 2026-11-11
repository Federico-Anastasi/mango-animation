# Il telefono e lo studio sulla rete

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua). Un ascoltatore solo, porta `47420`, serve i telefoni e, se il creator lo accende, lo studio.

| rotta | cosa fa |
|---|---|
| `GET /api/arrivi` | lo stato del ricevitore (sotto, «Gli arrivi») |
| `PUT /api/arrivi` | `{ acceso: true \| false }` collega o scollega i telefoni (la ricezione è spenta di base) e dà lo stato nuovo. Solo dal computer: dalla rete, `403` |
| `POST /api/arrivi/controlla` | rifà il controllo del firewall di Windows e dà lo stato aggiornato (come `GET /api/arrivi`) |
| `GET /api/accesso-studio`, `PUT /api/accesso-studio`, `POST /api/accesso-studio/chiave` | lo studio dalla rete (sotto, «Lo studio sulla rete»): lo stato; `{ acceso: true \| false }` lo accende o lo spegne; la chiave nuova. Solo dal computer: dalla rete, `403` |

**Gli arrivi.** `GET /api/arrivi` dà `{ acceso, in_ascolto, indirizzo, qr, errore, ultimi, firewall, pronto, motivo }`:

- `acceso` è la scelta di chi usa il computer: **di base la ricezione dal telefono è spenta**, e finché non collega un telefono (Impostazioni › Telefono, «Collega un telefono», che fa `PUT /api/arrivi`) il computer non ascolta la rete
  per gli arrivi. Spenta, `in_ascolto` è falso, `indirizzo`, `qr`, `guarda` e `carica` sono `null`, `pronto` è falso e `motivo` lo dice; le rotte del telefono rispondono `404`. La scelta sta in
  `archivio/arrivi/ricezione.json` e resta dopo un riavvio.
- `indirizzo` è `ip:porta` del computer sulla rete di casa (`null` senza rete o se non è in ascolto), `qr` è un
  SVG con il codice che apre la guida sull'iPhone (`null` se non è in ascolto). Se la porta è occupata il
  server funziona lo stesso: `in_ascolto` è falso e `errore` dice perché.
- `ultimi`: gli ultimi 10 file messi al loro posto in `grezzo/`, `[{ file, quando, byte }]` (`file` è `giorno/nome`,
  `quando` è l'ora di arrivo in ISO).
- `firewall` è quello che Windows ha scritto per il programma: `"consentito"`, `"bloccato"`, `"in-attesa"`
  (non ha ancora chiesto il permesso), `"sconosciuto"` (non si riesce a leggere) o `"non-controllato"` (il
  controllo all'avvio non è ancora finito). Si controlla una volta all'avvio e con `POST /api/arrivi/controlla`,
  mai dentro la `GET`.
- `pronto` dice se un telefono può arrivare; `motivo` dice perché no e che strada fare (sbloccare il programma
  in «Sicurezza di Windows», o passare il Wi-Fi a «Rete privata»), oppure, se è pronto ma Windows non ha ancora
  chiesto il permesso e nessun telefono si è mai visto, di toccare «Consenti» nella sua finestra.

## Il ricevitore degli arrivi

Un ascoltatore a parte, su tutta la rete di casa, porta `47420` (`MANGO_ANIMATION_PORTA_ARRIVI`), **in ascolto solo se serve**: quando si collega
un telefono (`PUT /api/arrivi`) o si accende lo studio dalla rete (sotto, «Lo studio sulla rete»); spenti tutti e due, la porta è chiusa. Le sue
rotte vogliono tutte la chiave. `/arrivi/contenuti-video` e `/installa/contenuti-video` servono alla Scorciatoia «Manda a Mango Animation» dell'iPhone; `/carica` manda i video dal telefono senza la Scorciatoia; `/guarda…` serve a
guardare dal telefono i video montati, le prove e il copione da leggere:

- `POST /arrivi/contenuti-video?chiave=…` (o `Authorization: Bearer`, o `X-Chiave`): corpo grezzo (nome in
  `X-Nome-File`) o `multipart/form-data`. Scrive a pezzi in `archivio/arrivi/.in-corso/` e risponde `201`
  `{ ok, messaggio, file, byte }` (`file` è `<AAAAMMGG-HHMMSS di arrivo>-<nome ripulito>`) senza aspettare
  il resto. Poi, in un lavoro di sfondo, `ffprobe` lo misura: il file va in
  `archivio/grezzo/<giorno di arrivo>/` con quel nome, byte per byte uguale, preceduto dalla sua scheda
  (`tipo: "ripresa"`, `origine: "telefono"`, `arrivato`, durata e misure). Finché non è misurato il file resta in `.in-corso/` col suffisso
  `.attesa`; se il server si ferma prima, lo colloca al riavvio. Se la cartella del giorno in `grezzo/` sta su un altro disco (è un collegamento),
  il file vi si copia accanto e poi si toglie l'originale. Accetta video, audio e foto fino a 20 GB.
  Se `ffprobe` non legge il file il terminale dice quale file e perché (e all'avvio dice se `ffprobe` non c'è nel PATH): il file entra lo stesso, senza durata, e
  il server la completa da sé appena il file è fermo. Di una HEIC la scheda non porta misure: le dà il motore.
  La pagina e le frasi di ogni risposta (`messaggio`, `errore`) sono nella lingua del telefono. Risposte JSON: `201` ricevuto, `401` chiave, `413` troppo grande, `415` genere non accettato, `507` disco
  pieno, `400` file vuoto, a metà o illeggibile, `500` il computer non è riuscito a salvarlo. Un invio che il telefono interrompe (Wi-Fi lento, iPhone che sospende
  Comandi rapidi) è un `400` che dice che il collegamento si è interrotto; un errore imprevisto dice la causa (il codice, o «un altro programma tiene aperta la
  cartella» per i permessi di Windows). Ogni rifiuto è una riga di `registro.jsonl` con `motivo` e, per un errore imprevisto, `dettaglio`.
- `GET /installa/contenuti-video?chiave=…`: la guida per l'iPhone.
- `GET /carica?chiave=…`: una pagina da aprire in Safari: un bottone «Carica video» sceglie uno o più file dalla
  libreria, o da File (i memo vocali, che il selettore vuole per estensione: `.m4a` e gli altri audio di `nomi.ts`), e li manda uno dopo l'altro, com'è l'originale, con `POST /arrivi/contenuti-video` a corpo grezzo
  (`XMLHttpRequest`, il file passato senza leggerlo in memoria); per ogni file mostra barra, MB inviati, MB/s ed
  esito.
- `GET /guarda?chiave=…`: una pagina coi video montati, il più recente in cima, ognuno col link al suo file, e sotto, a parte, «Da registrare» (i video con una `uscite/copione.html`: le frasi da leggere mentre si registra) e «Le prove» (i video con una `uscite/prova.mp4`), anche se non sono montati.
- `GET /guarda/<slug>.mp4?chiave=…` (anche `HEAD`): il video completo, `con-copertina.mp4` se c'è, altrimenti
  `finale.mp4`, con `Range` come `/media/`; `404` se il video non è montato.
- `GET /guarda/prova/<slug>.mp4?chiave=…` (anche `HEAD`): la prova prima di registrare (`uscite/prova.mp4`), con `Range`; `404` se il video non ha una prova.
- `GET /guarda/copione/<slug>.html?chiave=…`: la pagina `uscite/copione.html`, da leggere sul telefono mentre si registra; `404` se il video non ce l'ha.

`GET /api/arrivi` dà anche `guarda` e `carica` (l'indirizzo delle due pagine, con la chiave) e `qr_guarda` e
`qr_carica` (i loro codici QR, in SVG).

La chiave sta in `archivio/arrivi/chiave.json`; ogni richiesta, e ogni file collocato, è una riga di
`archivio/arrivi/registro.jsonl` (oltre le 1000 righe il file tiene le ultime 500).

## Lo studio sulla rete

Lo stesso ricevitore (porta `47420`) serve anche lo studio intero (interfaccia, `/api/…`, `/media/…`), per usarlo dal telefono in casa e fuori casa con
Tailscale. **Spento di base**; si accende dallo studio (Impostazioni › Telefono, «Lo studio dal telefono»), e la porta si apre per lui anche se gli arrivi restano spenti. Il server interno resta su `127.0.0.1:47431` e per chi lo usa da lì non cambia niente.

- **La chiave dello studio** è un'altra da quella degli arrivi (che sta nelle Scorciatoie del telefono): 24 byte casuali, confrontata a tempo costante, in
  `archivio/arrivi/studio-remoto.json` insieme a `acceso` e alle sessioni (di ognuna solo l'impronta SHA-256 e la scadenza; al massimo 20).
- `GET /studio?chiave=…`: con la chiave giusta risponde `303` verso `/` e mette il cookie `mango_studio` (valore casuale di una sessione, mai la chiave), `HttpOnly; SameSite=Strict; Path=/`,
  valido 90 giorni; con quella sbagliata `401`. Ogni entrata e ogni rifiuto sono una riga di `registro.jsonl`. Il cookie non porta la chiave e non si rinnova: dopo 90 giorni si rientra col link.
- Ogni altra richiesta che non è una rotta degli arrivi (`/arrivi/…`, `/installa/…`, `/carica`, `/guarda…`, che restano con la chiave degli arrivi) e ha una sessione valida si gira al server interno, con lo stesso metodo, percorso
  e corpo, a flusso: gli eventi (`GET /api/eventi`) e i video a pezzi (`Range`) passano senza bufferizzare. L'indirizzo chiesto dev'essere numerico
  (`http://192.168.1.20:47420`, `http://100.x.y.z:47420`): un nome è quello di un altro sito che punta al computer (DNS rebinding), `403` anche
  per `/studio`. Se c'è `Origin`, deve essere `http://<l'indirizzo a cui è arrivata la richiesta>`, altrimenti `403`.
  Il ricevitore toglie `Host`, `Origin`, `Referer`, `Cookie` e `Authorization`, mette `X-Dalla-Rete: 1` e, dopo aver controllato la sessione, la chiave delle API del server interno: il server interno, vedendola, rifiuta (`403`) le rotte
  `/api/accesso-studio`, perché l'interfaccia del telefono non le offre. Non è un confine di sicurezza: chi ha una sessione comanda la chat,
  che esegue comandi sul computer, e da lì arriva a tutto. **Una sessione vale il computer**: la chiave e il link si danno solo ai propri telefoni.
  Senza sessione `401` (una frase in HTML per chi apre una pagina dal browser, JSON per il resto); metodi diversi da `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`: `405`; server interno che non risponde: `502`.
- **Spento**: tutto ciò che non è un arrivo risponde `404` come prima, anche con un cookie che prima valeva.
- Spegnere e **rifare la chiave** fanno cadere tutte le sessioni e chiudono i flussi degli eventi già aperti; spegnere cambia anche la chiave,
  così un link visto prima non riapre l'accesso quando si riaccende.
- **In casa il traffico passa in chiaro** sul Wi-Fi (HTTP: la chiave nel link d'ingresso, poi il cookie, che per questo non ha `Secure`); su
  Tailscale è cifrato.

`GET /api/accesso-studio` dà `{ acceso, in_ascolto, casa, fuori, pronto, motivo }`: `casa` e `fuori` sono `{ indirizzo, link, qr }` (il link con la chiave, e il suo codice QR in SVG) e sono `null`
se spento; `casa` anche senza rete; `fuori` se il computer non ha un indirizzo di Tailscale (IPv4 in `100.64.0.0/10`, su qualunque interfaccia), e in più ha `pronto` e `motivo`: `pronto` è falso se Windows
dà alla rete di Tailscale un tipo di rete che nessuna regola del programma copre (il controllo di `POST /api/arrivi/controlla` legge anche il tipo di rete dell'interfaccia «Tailscale»). `pronto` e `motivo` sono quelli degli arrivi, per il Wi-Fi di casa.
`PUT` e `POST …/chiave` danno lo stato nuovo e annunciano l'evento `accesso-studio`.
