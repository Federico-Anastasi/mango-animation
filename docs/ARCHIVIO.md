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
          allineate.json                          i confini veri delle parole dei pezzi a parole, con l'impronta delle parole da cui vengono
          livelli.json                            il livello della voce a istanti esatti, per tagliare al fotogramma giusto
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
          foto/<secondo>.jpg                      i fotogrammi del file che `foto-girato` ha preso per guardarli
          ascolta/ascolta-<da>-<a>.png            lo spettrogramma di un pezzo del file, da `ascolta`
      video/<slug>/
          scheda.json                             a che punto è, cosa se ne sa (`docs/SCHEDE.md`)
          piano.json                              il montaggio (docs/PIANO.md)
          storia/<n>.json                         le versioni precedenti del piano, per annullare
          storia/cursore.json                     dove si è tornati con «annulla» (assente: in testa)
          materiali/                              disegni, immagini e suoni di questo video
          materiali/anteprima.png                 l'anteprima di una proposta (anche .jpg, .jpeg, .webp): ciò che l'elenco dei video mostra finché non c'è di meglio
          lavoro/                                 si rigenera, cancellarlo non perde niente (cosa tiene: `docs/MOTORE.md`, «Cosa si tiene»)
              risolto.json                        il piano in tempi veri (`docs/RISOLTO.md`)
              controllo.json                      l'esito di `controlla`
              montaggio.json                      i tempi delle fasi, i tratti degli ultimi due montaggi, il risolto da cui viene ogni uscita
              tratti/, tratti.txt, anteprima.txt  i tratti già composti, uno per file col nome dell'impronta, e gli elenchi con cui si uniscono
              scene/, tempi.json, tempi-anteprima.json   le scene animate rese e i tempi chiesti ad `animazioni/`
              voce/                               la voce pulita di `finale/` e di `anteprima/`
              maschere/                           gli angoli arrotondati e le sfumature dei riquadri
              misure.json, teste.json, alfa.png   il volume di ogni sorgente e dove sta la testa nelle riprese
              prova/                              i pezzi e i tempi della prova prima di registrare
              foto/                               i fotogrammi che `foto`, `anteprima --foto`, `scene-foto` e `ascolta` fanno per guardare
          uscite/
              finale.mp4, finale.srt              il montato
              capitoli.txt                        i capitoli per la descrizione di YouTube, se il piano ne ha
              leggero.mp4                         720×1280 (1280×720 in orizzontale): c'è solo se il creator l'ha chiesta
              copertina.png, con-copertina.mp4
              anteprima.mp4, anteprima.json       un pezzo del montato per guardare una correzione; il .json dice quale tratto copre (da, a)
              prova.mp4, copione.html             il video per registrare, prima del girato: le scene animate e sotto la battuta da dire; il copione è la stessa battuta come pagina da leggere sul telefono
              prova.jpg                           un fotogramma della prova, per l'immagine nell'elenco (lo fa il server)
              slide-<n>.png                       le immagini di un carosello, dalla 1, in ordine di numero
              pubblicato.mp4                      il file com'è uscito, se non è più rimontabile uguale
      sticker/<nome>.png, <nome>.json             il creator ritagliato col bordo bianco, da riusare (caroselli, copertine); il json dice da quale ripresa e a che secondo
      arrivi/chiave.json, chiave-api.json, chiave-app.json, studio-remoto.json, ricezione.json, registro.jsonl, .in-corso/   le chiavi degli arrivi, delle API e dell'app, lo stato dello studio dalla rete e della ricezione, le richieste, i file in arrivo o in attesa di misura
      .chat/                                       gli allegati e le conversazioni di Mango Code (`docs/CHAT.md`); fuori da git
      arrivi/.scarichi/                            dove yt-dlp lavora mentre scarica dal web: si svuota da sola
      lavori.jsonl                                 gli ultimi lavori del motore finiti, con l'esito (lo tiene il server)
      eliminati.jsonl                              ciò che è stato cancellato su richiesta del creator: percorso, peso, motivo (lo scrive Claude, skill `controlla`)
      canali/<canale>/letture/<AAAA-MM-GG-HHMM>/  una lettura del canale, con giorno e ora (`docs/CANALE.md`)
      canali/<canale>/ultima.json                 l'ultima lettura riuscita: { "lettura", "quando" }
      canali/tiktok/preferiti.json                i video che il creator ha salvato (`docs/CANALE.md`)
      canali/<canale>/note/<AAAA-MM-GG>.md        ciò che se ne ricava quel giorno
      canali/<canale>/classifica.json             i profili con cui ci si confronta (`docs/CANALE.md`)
      canali/<canale>/crescita.json               dove portare il canale e come (`docs/CANALE.md`)

Il giorno di un file grezzo: per un arrivo dal telefono quello di arrivo, lo stesso scritto in testa al suo
nome; per una registrazione quello in cui è fatta; per un file aggiunto dal computer da Girato («Aggiungi video»)
quello in cui lo si aggiunge, scritto in testa al nome come per il telefono; per un file portato dentro dalla skill `archivia` quello in cui è stato girato.
Lo `slug` di un video è minuscolo, con trattini, senza accenti: `pasta-fresca`, `cinque-errori-di-montaggio`.

## La scheda di un file grezzo

`grezzo/<AAAA-MM-GG>/<file>.scheda.json`: tipo, origine, durata e misure, lingua parlata, da dove è stato scaricato: `docs/SCHEDE.md`.

## La scheda di un video

`video/<slug>/scheda.json`: lo stato, la proposta con il copione e le scene per la prova, la scaletta, le pubblicazioni, i numeri; e `materiali/testo-registrato.md`: `docs/SCHEDE.md`.

- **L'anteprima.** L'immagine di una proposta nell'elenco dei video: `docs/SCHEDE.md`.

## Una lettura del canale

I file di una lettura del canale (profilo, video, commenti, messaggi, esito): `docs/CANALE.md`.

## I Preferiti di TikTok

`canali/tiktok/preferiti.json`: `docs/CANALE.md`.

## La classifica dei profili

`canali/tiktok/classifica.json`: `docs/CANALE.md`.

## La crescita del canale

`canali/tiktok/crescita.json`: `docs/CANALE.md`.
