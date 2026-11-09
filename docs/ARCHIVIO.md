# L'archivio

Sta in `archivio/` dentro la cartella di lavoro (`docs/ARCHITETTURA.md`, «La cartella di lavoro»). I dati sono del creator e non stanno nel repo del codice. Tutti i percorsi scritti nei file
sono relativi all'archivio, con `/`.

I file pesanti dei video pubblicati (montati, `lavoro/`, il girato e i preparati che usano solo loro) stanno
su un altro disco (per esempio `D:\video\`), allo stesso percorso: nell'archivio resta un collegamento simbolico,
che server e motore trattano come il file. Un rimontaggio scrive il file nuovo al posto del collegamento, sul disco principale.

    archivio/
      grezzo/<AAAA-MM-GG>/<file>                  il girato originale, mai modificato
      grezzo/<AAAA-MM-GG>/<file>.scheda.json      cosa si sa di quel file
      preparati/<AAAA-MM-GG>/<file>/              ciò che il motore ricava da un file, una volta sola
          parole.json   [{p, da, a}]              le parole coi tempi della trascrizione
          sagoma/<primo>-<ultimo>.webm            la persona senza sfondo (VP9 con alfa) di un tratto di ripresa continua dei soli tratti montati in sagoma: un file per intervallo, col primo fotogramma a 0 (nomi in fotogrammi)
          sagoma.json   {pezzi: [{da, a, file, inizio}]}   i secondi della ripresa che ogni pezzo copre, il suo file e il secondo della ripresa a cui il file comincia
          sagoma.webm                             la persona senza sfondo in un file solo, con ogni fotogramma al suo istante (`inizio` 0); senza `sagoma.json` copre tutta la ripresa, con `{intervalli}` solo quelli
          persona.json  {misure_al_secondo, misurati, x}   dove sta la testa, in frazioni della larghezza (`null` dove non misurata o non si vede nessuno), e gli intervalli misurati: solo i tratti di una vista che segue
          leggero.mp4                             copia a 720 px di lato lungo, per l'anteprima
          onda.bin                                il livello della voce, un byte ogni centesimo di secondo
          miniatura.jpg                           l'immagine del file, a `preparati.lato_miniatura` di lato lungo
          fotogrammi/<decimi>.jpg                 il fotogramma d'inizio di un tratto del montaggio, al decimo di secondo (`50.jpg` è il secondo 5), lato lungo `preparati.lato_miniatura`; lo fa il server, una volta, e li tiene
          foto.jpg                                solo per le foto (HEIC, JPEG, PNG…): la foto intera e dritta secondo l'EXIF, lato lungo al più `preparati.lato_foto`; è quella che il browser mostra e i caroselli usano
          trascrizione.txt                        il parlato col minuto, per i file lunghi
      video/<slug>/
          scheda.json                             a che punto è, cosa se ne sa (sotto)
          piano.json                              il montaggio (docs/PIANO.md)
          storia/<n>.json                         le versioni precedenti del piano, per annullare
          storia/cursore.json                     dove si è tornati con «annulla» (assente: in testa)
          materiali/                              disegni, immagini e suoni di questo video
          materiali/anteprima.png                 l'anteprima di una proposta (anche .jpg, .jpeg, .webp): ciò che l'elenco dei video mostra finché non c'è di meglio
          lavoro/                                 si rigenera: risolto.json, controllo.json, tratti/, scene/…
          uscite/
              finale.mp4, finale.srt              il montato
              capitoli.txt                        i capitoli per la descrizione di YouTube, se il piano ne ha
              leggero.mp4                         720×1280 (1280×720 in orizzontale): c'è solo se il creator l'ha chiesta
              veloce.mp4                          il montato accelerato: c'è solo se il creator l'ha chiesto, è una copia a parte
              copertina.png, con-copertina.mp4
              anteprima.mp4, anteprima.json       un pezzo del montato per guardare una correzione; il .json dice quale tratto copre (da, a)
              prova.mp4                           il video per registrare, prima del girato: le scene animate e sotto la battuta da dire
              prova.jpg                           un fotogramma della prova, per l'immagine nell'elenco (lo fa il server)
              slide-<n>.png                       le immagini di un carosello, dalla 1, in ordine di numero
              pubblicato.mp4                      il file com'è uscito, se non è più rimontabile uguale
              miniatura.jpg, misure.json          immagine e durata del file uscito, per i video senza piano (`python -m strumenti.miniature`)
      sticker/<nome>.png, <nome>.json             il creator ritagliato col bordo bianco, da riusare (caroselli, copertine); il json dice da quale ripresa e a che secondo
      arrivi/chiave.json, registro.jsonl, .in-corso/   la chiave, le richieste, i file in arrivo o in attesa di misura
      arrivi/.scarichi/                            dove yt-dlp lavora mentre scarica dal web: si svuota da sola
      lavori.jsonl                                 gli ultimi lavori del motore finiti, con l'esito (lo tiene il server)
      spostamenti.jsonl                            da dove viene ogni file portato in archivio: serve a rimetterlo dov'era
      eliminati.jsonl                              ciò che è stato cancellato su richiesta del creator: percorso, peso, motivo
      ingressi.json                                per ogni file entrato col popolamento, il suo percorso d'origine
      canali/<canale>/letture/<AAAA-MM-GG-HHMM>/  una lettura del canale, con giorno e ora (sotto)
      canali/<canale>/ultima.json                 l'ultima lettura riuscita: { "lettura", "quando" }
      canali/tiktok/preferiti.json                i video che il creator ha salvato (sotto)
      canali/<canale>/note/<AAAA-MM-GG>.md        ciò che se ne ricava quel giorno
      canali/<canale>/classifica.json             i profili con cui ci si confronta (sotto)
      canali/<canale>/crescita.json               dove portare il canale e come (sotto)

Il giorno di un file grezzo: per un arrivo dal telefono quello di arrivo, lo stesso scritto in testa al suo
nome; per una registrazione quello in cui è fatta; per un file portato dentro dal computer (skill `archivia`)
quello in cui è stato girato.
Lo `slug` di un video è minuscolo, con trattini, senza accenti: `pasta-fresca`, `cinque-errori-di-montaggio`.

## La scheda di un file grezzo

    {
      "tipo": "ripresa" | "diretta" | "schermo" | "altro",
      "origine": "telefono" | "registrazione" | "scaricato" | "altro",
      "arrivato": "2026-03-06T22:28:01",
      "durata": 12.4, "largo": 2160, "alto": 3840, "fps": 30,
      "lingua": "en",                              facoltativo: la lingua parlata, se non è quella dello stile
      "note": "",
      "url": "https://…",                          solo se scaricato: l'indirizzo
      "tratto": { "da": 90, "a": 100 },            solo se scaricato in parte: i secondi del video originale (`a` manca se fino alla fine)
      "titolo": "…", "canale": "…"                 solo se scaricato: come li dà il sito
    }

In quali video è usato un file non si scrive: lo ricava il server dai piani.

## La scheda di un video

    {
      "titolo": "Cinque errori di montaggio",
      "stato": "proposta" | "in lavorazione" | "pronto" | "pubblicato" | "scartato",
      "creato": "2026-03-06",
      "serie": "errori",                            facoltativo: video nati dalla stessa fonte
      "priorita": 1,                              facoltativo: l'ordine in cui farli, 1 il primo
      "formato": "carosello",                     facoltativo: "video" (se manca) o "carosello"
      "canali": ["tiktok", "youtube"],            dove esce: "tiktok", "instagram", "youtube", "x"
      "proposta": { "aggancio": "", "centro": "", "chiusa": "", "note": "",
                    "quadro": "sagoma-al-centro",                 facoltativi: per la prova prima di registrare
                    "scene": [ { "animazione": "a1", "dalla": "La notizia" } ],
                    "spezzoni": [ { "file": "2026-03-21/conferenza.mp4", "minuto": "00:59", "dice": "today I want",
                                    "testo": "", "prima": "Lei è la relatrice" } ] },
      "scaletta": [ { "apri": "", "fai": "", "spiega": "" } ],     facoltativo: i passi di una registrazione
      "didascalia": "", "hashtag": ["AI", "LLM"],
      "pubblicazioni": [ { "canale": "tiktok", "data": "2026-03-07T13:15", "url": "" } ],
      "numeri": [ { "data": "2026-03-07", "canale": "tiktok", "visualizzazioni": 0, "mi_piace": 0,
                    "commenti": 0, "condivisioni": 0, "salvati": 0 } ],
      "da_verificare": [ { "cosa": "", "perche": "", "stato": "aperto" | "a posto" } ],
      "note": ""
    }

- **proposta**: c'è l'idea (aggancio, centro, chiusa), può esserci un piano, non c'è un montato approvato.
- **in lavorazione**: si sta montando o si aspettano le correzioni del creator.
- **pronto**: approvato dal creator, non ancora uscito.
- **pubblicato**: ha almeno una voce in `pubblicazioni`.
- **scartato**: resta in archivio, non si propone più.

Un video che esce in più parti ha una cartella per parte (`<slug>-parte-1`, `-parte-2`…), con la stessa
`serie`, la sua scheda e il suo stato: ogni parte esce per conto suo. Il montato intero da cui vengono resta
un video a sé, la sorgente delle parti.

`formato` dice cosa esce: un video, o un **carosello**, cioè immagini a scorrimento. Un carosello non ha piano né
montato: le sue immagini sono `uscite/slide-<n>.png`, 1080×1920, e il loro sorgente è `materiali/carosello.html`
(`python -m motore carosello <slug>`, `docs/MOTORE.md`).

**L'anteprima.** Ogni proposta ha la sua: un file `materiali/anteprima.png` (o `.jpg`, `.jpeg`, `.webp`; se ce n'è più d'uno vale il più recente),
grande quanto basta per una miniatura (l'elenco la mostra in 9:16, ritagliata). Può essere una carta col titolo e una riga di
ciò di cui parla (`python -m motore anteprima-proposta <slug> --riga "…"`, nello stile: `anteprima` di `stile.json`), una foto o un disegno.
L'elenco dei video usa nell'ordine la copertina, la miniatura dell'uscita, la prima slide, l'anteprima, l'immagine del primo girato, un
fotogramma della prova: ciò che è uscito vince sull'anteprima, perché è il video vero; l'anteprima vince sulle immagini prese da sé,
perché è scelta apposta e dice di cosa parla il video, mentre un fotogramma preso a caso del girato o della prova no. Una
proposta senza anteprima lo dice nell'elenco («senza anteprima»).

`priorita` mette in fila i video da fare: nell'elenco, dentro ogni stato, vengono prima i numeri più bassi, poi gli
altri dal più recente. La decide il creator.

`canali` dice dove il video deve uscire, uno o più; `pubblicazioni` dice dove è uscito davvero. Manca finché il creator
non l'ha deciso. Un video intero per YouTube e le sue parti per TikTok hanno ognuno i propri canali.

`proposta` è il copione di un video da registrare: `aggancio` la prima frase, `centro` una frase per riga, `chiusa`.
`quadro` e `scene` servono a `python -m motore prova` (`docs/MOTORE.md`): ogni scena comincia alla frase del copione che
inizia con le parole `dalla` e dura fino alla scena dopo; `animazione` è la sigla della scena animata, `null` per il creator a
tutto fotogramma; `parole` (facoltativo, `{ nome: parole del copione }`) lega una scena alle parole: la scena riceve, come `tempi` nel montaggio, il secondo stimato (dall'inizio della scena) in cui il copione dice quelle parole. `spezzoni` sono i pezzi di un girato d'altri che il creator commenta (un talk, un keynote): `file` nel grezzo; le parole che
dice, come un pezzo del piano (`minuto` e `dice`: i bordi sulla voce, le pause in mezzo tolte, il file preparato), oppure `da` e `a`
in secondi del file; `testo` la traduzione da leggere sotto, `prima` le prime parole della frase del creator che viene
subito dopo; se il copione apre con uno spezzone, l'aggancio è lui e `aggancio` può mancare. Dopo la registrazione la proposta
tiene il testo montato; la tabella battuta per battuta, con la ripresa e l'animazione di ognuna, sta in `materiali/testo-registrato.md` (skill `testo`).

`scaletta` serve ai video che si registrano a braccio (lo schermo, una diretta): un passo per ogni cosa
da aprire, con ciò che si fa e ciò che si spiega. Non è un copione: le parole sono del creator.

`da_verificare` lo riempie il controllo a video montato (skill `controlla`): le cose dette o mostrate
che sembrano sbagliate. È un avviso per il creator, non blocca niente.

Gli schemi: `motore/schemi/scheda.schema.json`, `motore/schemi/grezzo.schema.json`.

## Una lettura del canale

La scrive la skill `scarica-tiktok`, ogni volta in una cartella nuova: le letture precedenti restano, sono
la serie nel tempo. Ogni file porta `quando` (giorno e ora della lettura, ora locale).

    letture/2026-03-09-1830/
      profilo.json     { "quando", "nome", "follower", "seguiti", "mi_piace", "video" }
      video.json       { "quando", "video": [ { "id", "url", "slug" | null, "pubblicato", "didascalia",
                         "durata", "visualizzazioni", "mi_piace", "commenti", "condivisioni", "salvati",
                         "tempo_medio", "visti_fino_in_fondo", "nuovi_follower" } ] }
      commenti/<id del video>.json
                       { "quando", "video", "commenti": [ { "id", "autore", "testo", "quando_scritto",
                         "mi_piace", "risposta_a" | null, "del_creator": bool } ] }
      messaggi.json    { "quando", "conversazioni": [ { "con", "messaggi": [ { "da": "lui" | "creator",
                         "testo", "quando_scritto" } ] } ] }
      esito.json       { "quando", "completa": bool, "mancano": [ "cosa non si è potuto leggere e perché" ] }

Quando il canale li mostra, in più: nel profilo `ultimi_7_giorni` (i totali della settimana e le ricerche); in
ogni video `da_per_te` (percentuale), `tempo_riproduzione_s` e `ricerche` (`[{ termine, quota }]`). Ogni
conversazione porta anche `anteprima` e `ultimo_giorno` (AAAA-MM-GG) come li mostra l'elenco dei messaggi: si riapre solo
quella che li ha diversi dalla lettura precedente, le altre si riportano; `non_aperta: true` se dei messaggi c'è solo l'anteprima.
I numeri dei video sono quelli esatti della loro pagina pubblica; un carosello di foto ha `durata` 0.

Un campo che il canale non mostra non si scrive (non si mette zero). `slug` lega un video del canale a
un video dell'archivio: è quello la cui `pubblicazioni[].url` coincide; `null` se in archivio non c'è.
Dopo ogni lettura la skill aggiunge una voce in `numeri` della scheda di ogni video legato.

## I Preferiti di TikTok

`canali/tiktok/preferiti.json`: i video che il creator ha salvato su TikTok, dal più recente. Non fa parte di una lettura del canale
(non sono numeri del canale): è lo stato di quando è stato letto e si riscrive intero ogni volta, con `python -m strumenti.leggi_tiktok
--solo-preferiti` o dentro un giro intero. Se la lettura non ne trova nessuno il file resta com'è.

    { "quando": "2026-11-05T20:00",
      "preferiti": [ { "posizione": 1, "id", "autore", "url", "didascalia", "durata", "pubblicato",
                       "larghezza", "altezza", "visualizzazioni" } ],
      "mancano": [ "cosa non si è letto e perché" ] }

`posizione` 1 è l'ultimo salvato. `autore` è l'account di chi ha pubblicato il video (non il creator), `pubblicato` è quando l'ha
pubblicato lui, ora locale. Un campo che la pagina del video non porta non si scrive; `mancano` c'è solo se qualcosa non si è letto.

## La classifica dei profili

`canali/tiktok/classifica.json`: i profili con cui il creator si confronta, coi numeri letti un giorno
solo. Non si rilegge a ogni giro: si rifà quando il creator lo chiede, riscrivendo il file intero.

    { "quando": "2026-03-08",          il giorno in cui sono stati letti i profili
      "io": "il_tuo_profilo",           il profilo del creator fra quelli elencati
      "quanti": 100,                   quanti ne tiene la classifica, dal primo
      "video_della_mediana": 13,       su quanti video recenti del creator si calcola la sua mediana
      "come": [ "da dove vengono i profili e come si leggono i numeri" ],
      "profili": [ { "nome", "follower", "mi_piace", "visualizzazioni", "cosa_fa" } ] }

`visualizzazioni` è la mediana degli ultimi video del profilo. Il punteggio non si scrive: è la somma delle tre
posizioni (per follower, per mi piace, per visualizzazioni) fra tutti i profili del file, anche quelli oltre
`quanti`; a parità di numero viene prima chi è scritto prima, a parità di punteggio chi ha più follower. I
numeri di `io` nel file sono quelli del giorno `quando`: a schermo valgono quelli dell'ultima lettura del canale
(follower e mi piace del profilo, mediana delle visualizzazioni dei `video_della_mediana` video più recenti che
hanno il numero).

## La crescita del canale

`canali/tiktok/crescita.json`: dove portare il canale fra tre mesi, sei mesi e un anno, e come. Lo scrive Claude
quando il creator chiede il piano; si riscrive intero ogni mese, o prima se l'andamento si stacca dallo scenario scelto.

    { "quando": "2026-03-25",                          il giorno in cui è scritto il piano
      "partenza": { "data", "follower" },              da dove partono gli scenari
      "obiettivo": "atteso",                           lo scenario su cui si misurano le settimane
      "scenari": [ { "nome", "tappe": [ { "data", "follower" } ] } ],
      "settimana": [ { "giorno", "cosa", "controllo": true } ],   il giorno con `controllo` è quello a metà settimana
      "tipi": [ { "nome", "spiega", "video": [ slug ] } ],         a che tipo appartiene ogni video del canale
      "mix": [ "frase" ],
      "consigli": [ { "titolo", "testo" } ],
      "novita": [ { "nome", "cosa", "per_te", "giudizio": "sì" | "più avanti" | "no", "fonte" } ],
      "come": [ "da dove vengono i numeri e quando si riscrive" ] }

I numeri veri non si scrivono qui: la pagina li prende dalle letture del canale. L'obiettivo di una settimana è
la pendenza dello scenario `obiettivo` in quella settimana; un video entra nel conto del suo tipo con i numeri
dell'ultima lettura.
