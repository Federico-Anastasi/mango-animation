# Lo studio: la cornice e le regole

Una pagina nel browser su `http://127.0.0.1:47431`. Qui si guarda e si ritocca, e a destra c'è la chat
(`docs/studio/chat.md`). Ogni schermata risponde a una domanda sola. I colori stanno in `suite/tokens.css`, comuni alle app
Mango (`--mango-…`, nel tema chiaro e in quello scuro; il tema si fissa con `data-mango-theme` sulla radice, altrimenti segue il
sistema): fondo, superfici, bordi e testo sono neutri, e tre colori hanno un significato solo. L'ambra è ciò che si preme, ciò
che è acceso o scelto e ciò che è in corso; il verde è pronto o riuscito; il rosso è un errore o una registrazione. I dati di un
grafico e i segni del banco di montaggio sono neutri, con l'ambra dove una cosa va distinta dalle altre. I caratteri stanno accanto, in `suite/fonts/`, interi: Archivo per i
titoli, Instrument Sans per il testo, JetBrains Mono per numeri, tempi e codice, senza legature. `src/theme.css` importa
`suite/tokens.css`; niente ombre morbide né bagliori.

Lo studio serve a guardare e a decidere; i lavori (preparare, calcolare e montare, controllare, rendere le slide) e i video nuovi si
chiedono nella chat. Dove servirebbe uno di questi, la pagina dice a che punto è e, una volta per vista, in una riga di testo secondario,
cosa si può chiedere nella chat; l'unico bottone che scrive nella chat, e senza mandare, è quello della riga dei passi di un video (`docs/studio/video.md`).
A mano restano i ritocchi del montaggio, lo stile, le parole della scheda e i gesti che la chat non fa (fermare un lavoro, registrare,
togliere una proposta).

## La cornice

Barra in alto, in quest'ordine: la scritta (il mango, «mango» nel colore del testo e «animation» nel colore del prodotto, `--mango-product`; sotto i 640 px resta solo il mango); le pagine **Video**, **Girato**, **Canale** (solo quando c'è un canale letto) e **Produzione**, con la voce attiva su fondo `--mango-raised`; gli stati, **solo quando servono**, ognuno col suo punto (verde pronto, ambra in corso, grigio spento, rosso solo la registrazione): «Telefono pronto» (quando il telefono può mandare i file; porta al Girato), **Chat** (`Ctrl+J` da qualunque vista; il punto ambra dice che il motore della chat lavora o aspetta una risposta), **Registra** (cosa registrare, con quale microfono e quale webcam; i file finiscono nel girato di oggi) e lo stato dei lavori; per ultimo l'ingranaggio, un'icona col nome «Impostazioni» per chi non la vede, che porta a `#/impostazioni`. Sotto i 1000 px le pagine vanno da sole sulla seconda riga e gli stati salgono accanto alla scritta; sotto i 640 px gli stati perdono il nome (resta «Chat»), restano l'icona e il punto, e ciò che si tocca è alto almeno 44 px (`src/cornice/Cornice.tsx`).

Lo stato dei lavori sparisce quando non c'è più niente, ma se il pannello è aperto resta finché lo si chiude. Se il piano del video in montaggio cambia dopo la partenza, la barra e il pannello lo dicono: quel montaggio ripartirà da solo (`docs/MOTORE.md`, «Il piano che cambia mentre monta»), e per non aspettare lo si ferma e si chiede nella chat di rimontarlo.

**Lingua.** L'interfaccia è in italiano e in inglese. Si sceglie in Impostazioni › Generale; senza scelta vale la lingua del sistema (italiano per chi parla italiano, inglese per tutti gli altri); la scelta si ricorda nel browser e cambiandola la pagina si ridisegna da capo. Numeri, tempi e date seguono la lingua (`src/testo.ts`). Le frasi che scrivono il server e il motore (un rifiuto, un errore, un avviso) escono nella lingua dello studio (`docs/API.md`, «La lingua delle frasi»), e così quelle dell'app e del suo motore di dettatura (`docs/APP.md`, «La dettatura»). I nomi dei quadri e dei colori dello stile di serie (il menu «Quadro del video», i campioni di Stile) hanno un nome in parole in tutte e due le lingue (`nomeQuadro`, `nomeColore`, `src/testo.ts`); un quadro aggiunto dal creator si chiama come l'ha chiamato lui. Restano in italiano i testi dei file di dati (il piano di crescita, le note), quelli scritti dal motore della chat e le eccezioni che `docs/API.md` elenca.

**Segnala un problema** (solo nell'app, `docs/APP.md`, «Le segnalazioni dei problemi»): un bottone con la bandierina, fra i segni di stato, apre un pannello con un campo facoltativo, l'interruttore della schermata e «Invia»; lo stesso modulo si apre da Impostazioni › Aiuto; la vista d'errore comune offre lo stesso modulo («Segnala il problema») con il suo messaggio.

**Profilo da correggere**: se `profilo.json` non passa lo schema (`GET /api/profilo`, `valido: false`) sotto la barra compare un avviso rosso: lo studio lavora con l'ultimo profilo buono (o senza),
si può chiedere nella chat di correggerlo o correggere il file a mano, e sotto stanno le frasi di ciò che non va. Compare e sparisce da solo con l'evento `profilo`; cambiando lingua le frasi si rileggono nella lingua nuova.

## Regole

- Tre larghezze: 1400, 1000 e 390 px; sotto i 640 px ciò che si tocca (bottoni, campi, menu, segmenti) è alto almeno 44 px, tranne le parole del parlato e i pezzi della timeline. La pagina non scorre mai in orizzontale; ciò che deve scorrere
  per conto suo scorre lì, e un'ombra sul bordo dice dove c'è altro (le tabelle: `scorri-con-segno`, `src/theme.css`). Chi sta accanto alla chat (a 860 px la vista è larga la metà) si stringe in base alla sua larghezza e non a quella dello schermo: query su contenitore, sull'involucro interno della pagina e non su `<main>`.
- Una cornice sola: ogni pagina è larga al più `--cornice` (`src/theme.css`) e centrata, così il titolo e la fila delle schede stanno nello stesso punto
  passando da una pagina o da una scheda all'altra. Dentro, tabelle, grafici e griglie la riempiono; i moduli stanno a sinistra con il tetto `--moduli`, il testo con 70 caratteri.
  A chat chiusa il contenuto della barra in alto sta sugli stessi fili (marchio sul bordo sinistro della pagina, ultimo segno su quello destro, barra di scorrimento compresa); il filo sotto la barra va da bordo a bordo. Con la chat di fianco la pagina si stringe e la barra torna da bordo a bordo, col bottone della chat sopra il suo pannello.
- Un vuoto o un errore dice perché e cosa fare, nella lingua in uso. Niente slug, percorsi, nomi di comandi o di
  file JSON nei testi, tranne la cartella del video da copiare e i nomi dei file in «File» e «Girato».
- Testi, numeri e date nelle due lingue, da `src/lingua.ts` (`t("italiano", "inglese")`) e `src/testo.ts`.
- Niente polling: un solo `EventSource` su `/api/eventi`; una vista rilegge solo ciò che il messaggio
  dice cambiato.
- Colori solo dai token.
- I controlli sono quelli di `src/comuni/`, uguali in tutte le app Mango: `Bottone` (principale: al più uno per pagina, ciò che porta
  avanti, e nessuno se le azioni sono alla pari; normale; minore; quello che distrugge, per togliere e cancellare), `Interruttore` per un
  sì o un no, `Segmenti` per una fra due-quattro scelte brevi (mai i pallini), `Casella` dove se ne spunta più d'una fra molte (una domanda a
  risposta multipla, una lista di cose fatte; mai per un sì o un no), `PiuMeno` per un numero a passi,
  `EtichettaDiStato` per uno stato accanto a un nome (il passo di un video nella lista, «mai usato», l'esito di un lavoro),
  `CardDiRighe` con le sue `Riga` per un gruppo di cose dello stesso genere e `Gruppo` per una sezione di pagina con dentro altro
  (il nome del gruppo in maiuscolo sopra, una card sotto).
- Il testo è a 14 px nelle pagine, 13 nelle righe e nei controlli, 12 e 11 per ciò che è secondario, 23 per il titolo di pagina. Card
  con bordo e raggio 10, controlli col raggio 7, niente ombre.

## Verificare nel browser

Gli script di `studio/verifica/` guidano un browser vero (Playwright) e dicono in testa cosa provano. `bun run foto` in `studio/` fotografa ogni vista e scheda a 1400, 1000 e 390 px, nel tema chiaro e nello scuro, e fallisce se la pagina scorre in orizzontale, se un controllo esce dal bordo, se una vista resta su «carico…» o se la console ha errori. Quelli contro un server vero vogliono un server di prova su una porta libera (`MANGO_ANIMATION_PORTA`, mai quella in uso) con la stessa `MANGO_ANIMATION_LAVORO`; chiudono solo i processi che hanno avviato, per PID.
