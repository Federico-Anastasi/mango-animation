# I dati del canale

I file che le letture dei canali (TikTok, per ora) scrivono in `archivio/canali/<canale>/`, dove stanno nell'archivio (`docs/ARCHIVIO.md`) e come li serve il server (`docs/api/canale.md`).

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
un video dell'archivio: è quello la cui `pubblicazioni[].url` coincide; `null` se in archivio non c'è. Il server lega anche i video
che la lettura lascia a `null` ma la cui scheda ha, in `pubblicazioni`, l'indirizzo del video.
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
