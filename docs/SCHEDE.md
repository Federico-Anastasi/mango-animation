# Le schede

Le schede dicono cosa si sa di un file del girato e di un video. Dove stanno nell'archivio: `docs/ARCHIVIO.md`.

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
tutto fotogramma; `parole` (facoltativo, `{ nome: parole del copione }`) lega una scena alle parole: la scena riceve, come `tempi` nel montaggio, il secondo stimato (dall'inizio della scena) in cui il copione dice quelle parole. Una scena senza animazione può avere `girato` (`{ file, da }`: un file del grezzo e il secondo da cui parte): sotto le sue frasi quel girato scorre muto, nel posto del girato del suo `quadro` (facoltativo, altrimenti quello della proposta), per un girato d'altri che il creator racconta con la sua voce. `spezzoni` sono i pezzi di un girato d'altri che il creator commenta (un talk, un keynote): `file` nel grezzo; le parole che
dice, come un pezzo del piano (`minuto` e `dice`: i bordi sulla voce, le pause in mezzo tolte, il file preparato), oppure `da` e `a`
in secondi del file; `testo` la traduzione da leggere sotto, `prima` le prime parole della frase del creator che viene
subito dopo; se il copione apre con uno spezzone, l'aggancio è lui e `aggancio` può mancare. Dopo la registrazione la proposta
tiene il testo montato; la tabella battuta per battuta, con la ripresa e l'animazione di ognuna, sta in `materiali/testo-registrato.md` (skill `testo`).

`scaletta` serve ai video che si registrano a braccio (lo schermo, una diretta): un passo per ogni cosa
da aprire, con ciò che si fa e ciò che si spiega. Non è un copione: le parole sono del creator.

`da_verificare` lo riempie il controllo a video montato (skill `controlla`): le cose dette o mostrate
che sembrano sbagliate. È un avviso per il creator, non blocca niente.

**Il testo registrato.** `materiali/testo-registrato.md` è il testo che il video dirà, battuta per battuta, approvato dal creator prima
di toccare un'animazione o un taglio (skill `testo`). In testa due righe: chi l'ha approvato e quando, e da quali riprese viene. Poi una tabella:

    | # | battuta | ripresa | animazione |
    |---|---|---|---|
    | 1 | L'aggancio, con le PAROLE su cui entrano le cose in maiuscolo… | 0001 1.8–13.3 | cosa mostra la scena… |

`ripresa` è il nome della sorgente del piano e i secondi nella ripresa; `|` separa due tentativi cuciti insieme. In maiuscolo, nella battuta,
le parole su cui entra ciò che la scena mostra; la colonna `animazione` la riempie la skill `scena`. `controlla` confronta la colonna
«battuta» coi sottotitoli del montato (`docs/MOTORE.md`, «Il controllo»).

Gli schemi: `motore/schemi/scheda.schema.json`, `motore/schemi/grezzo.schema.json`.
