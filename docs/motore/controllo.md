# Il motore: il controllo

I comandi che riascoltano e riguardano il montato e il girato, e il file che `controlla` scrive.

| comando | cosa fa | scrive |
|---|---|---|
| `python -m motore controlla <slug>` | riascolta il montato | `lavoro/controllo.json` |
| `python -m motore parole <slug>` | stampa ogni tratto con le sue parole e i loro istanti, nella sorgente e nel video | niente |
| `python -m motore foto <slug> <secondo> [...] [--anteprima \| --prova]` | fotogrammi del montato a quei secondi, per guardarli; con `--anteprima` dall'anteprima, ma sempre coi secondi del video montato (tradotti con `anteprima.json`): un secondo fuori dal pezzo che copre, o un `anteprima.json` che manca o è più vecchio del video, è un errore; con `--prova` dalla prova, coi suoi secondi | `lavoro/foto/<secondo>.jpg`, `anteprima-<secondo>.jpg`, `prova-<secondo>.jpg` |
| `python -m motore foto-girato <file> <secondo> [...]` | fotogrammi di un file del girato a quei suoi secondi | `archivio/preparati/<file>/foto/<secondo>.jpg` |
| `python -m motore ascolta <da> <a> (--file <file> \| --video <slug>)` | il suono di un pezzo di un file del girato (secondi del file) o del montato (secondi del video): una riga JSON col livello della voce ogni centesimo (`livello`, dB, da `da`), i tratti sopra `voce.silenzio_db` (`voce`) e il percorso dello spettrogramma (0-8 kHz, `ascolta.largo` × `ascolta.alto`; il suo asse del tempo parte da 0, cioè da `da`) | `archivio/preparati/<file>/ascolta/…png`, `lavoro/foto/ascolta-…png` |

## Il controllo

`lavoro/controllo.json`, scritto da `controlla`:

    {
      "quando": "2026-03-09T18:20:11", "del_finale": "<mtime del finale controllato>",
      "durata": 60.2,
      "silenzi": [ { "a": 12.3, "dura": 0.41 } ],                      oltre la pausa dello stile
      "esitazioni": [ { "a": 31.9, "dura": 1.1, "fra": ["oggi", "tenta"], "numero": false } ],   vuoti fra due parole oltre la pausa, anche pieni di suono;
                                                                       `numero`: una delle due è un numero o una sigla, che l'allineamento non sa
                                                                       quanto dura detta a voce: si riascolta prima di tagliare
      "senza_parole": [ { "a": 58.4, "dura": 1.8 } ],                  girato prima della prima parola e dopo l'ultima: zero
      "colpi": [ { "tratto": 20, "a": 55.3, "dopo": "7%" } ],          colpi di tasto dopo l'ultima parola di un tratto: zero
      "parole_fuori_posto": [ { "parola", "attesa": [da, a], "trovata": [da, a], "voto": 0.4 } ],   ogni parola ritrovata sul suono: non si ritrova (voto sotto `controllo.voto_minimo`) o, nei pezzi a parole, sta oltre `tolleranza` dal suo posto
      "sentito": "ciò che la trascrizione sente nel montato",
      "differenze": [ { "a": 31.2, "voluto": "…", "sentito": "…" } ],
      "doppioni": [ { "a": 12.0, "parole": "poi poi" } ],              ripetizioni di fila che il voluto non ha: zero
      "parole_lunghe": [ { "a": 9.3, "parola": "migliorare", "dura": 4.58, "sentito": "…" } ],   parole oltre `preparati.parola_lunga`: zero
      "sottotitoli": [ { "a": 40.2, "voluto": "?", "scritto": "" } ],   contro il testo fissato: zero; null senza testo fissato
      "tagli_nel_parlato": [ { "a": 8.1, "db": -31 } ],
      "lampi": [ { "a": 69.27, "salto": 89.7 } ],                      fotogrammi isolati: devono essere zero
      "bordi": [ { "tratto": 12, "lato": "coda", "a": 31.2, "cosa": "muto", "dura": 0.62 },
                 { "tratto": 14, "lato": "testa", "a": 40.1, "cosa": "rumore", "dura": 0.4 },
                 { "tratto": 20, "lato": "coda", "a": 55.0, "cosa": "voce", "db": -18.0 } ],  devono essere zero
      "zona_alta": [ { "a": 90.2, "dura": 5.8, "cosa": "ferma" }, { "a": 6.9, "dura": 6.7, "cosa": "vuota" } ],   zero
      "copertina": [ { "cosa": "manca" } ],                            `manca`: il piano non la dichiara; o "vecchia", o { "cosa": "vuota", "occupata": 0.1 }: vuoto
      "spente": ["allineamento", "trascrizione"]                       funzioni spente nel profilo: i controlli che ne vivono (parole fuori posto; sentito, differenze,
                                                                       doppioni, parole lunghe) non sono stati fatti e restano vuoti
    }

`controlla` si ferma se il montato non è del risolto di adesso (`uscite.finale` di `montaggio.json`; se `montaggio.json` non c'è,
una durata diversa da quella del risolto oltre `controllo.scarto_montato` secondi): confrontato
con un risolto più nuovo darebbe quasi ogni parola fuori posto. Si rimonta, poi si controlla.
Lo stesso confronto lo fa il server per l'avviso «piano cambiato dopo il montato» dello studio (`piano_dopo_montato`, `docs/API.md`): l'impronta di `uscite.finale` contro quella del `risolto.json` di adesso.

L'allineamento del montato si fa a finestre di `controllo.finestra` secondi: un video di qualche minuto non
sta intero nella scheda video. `esitazioni` conta i vuoti che il taglio non ha tolto: dentro un pezzo a
parole un vuoto oltre `taglio.a_parole.pausa` fra due parole trovate bene (voto da `voto_esitazione` in su)
si taglia anche se suona, perché la trascrizione non scrive gli «ehm». `lampi` sono i fotogrammi diversi sia
da quello prima sia da quello dopo (oltre `controllo.lampo.salto`, su 255) mentre quei due si somigliano: un
tratto che parte o finisce senza lo schermo o il viso. `bordi` sono i lati dei tratti che non vanno (`controllo.bordi`):
`muto`, silenzio dal bordo verso l'interno oltre `muto` secondi (il silenzio in fondo al video lo decide `coda` del piano e non
conta); `rumore`, suono oltre `rumore` secondi fra il bordo e la parola sicura più vicina (voto da `taglio.a_parole.voto_bordo`,
non cifre né sigle; i pezzi a tempo non hanno parole sicure); `voce`, un taglio che `risolvi` ha fatto dentro la voce a un
livello da `voce_db` in su. Un bordo con una parola incerta lo cerca `risolvi` sul suono: `taglio.a_parole.voto_bordo`, `cerca_incerta`
(quanto lontano dall'allineamento cercare la voce), `silenzio_bordo` (il vuoto che chiude la voce), `rumore_db` (quanto più
piano del resto è un fruscio staccato), `voce_tagliata` (quanta voce oltre una `rifila` fa dare l'avviso).

`senza_parole` è il girato tenuto senza nessuna parola in testa al video (prima della prima) e in coda (dopo l'ultima, anche se il piano
chiede una `coda`), oltre la pausa di `silenzi`; i vuoti fra due parole, anche quando sono un tratto intero, li conta `esitazioni`.
`colpi` cerca, da dove comincia l'ultima parola di ogni tratto fino al bordo, un attacco secco (`controllo.colpi`, sul livello a passi di
`passo` secondi): sopra il silenzio dei `prima` secondi prima di almeno `salto_db`, non più piano della voce del video di oltre
`sotto_voce_db`, e tornato sotto di altrettanto da `durata` a `durata` + `prima` secondi dopo, tutto dentro il tratto. Lo scoppio di una
consonante dentro la parola («otto») è seguito dalla voce e non conta; quello finale di una parola che chiude su una consonante («bit»)
sì, e si riascolta. `sentito` è il montato riascoltato con la trascrizione, a tratti di fila della stessa lingua: ogni tratto nella lingua
del suo girato (`lingua` nella scheda del file nel grezzo, se no quella dello stile), così un keynote in inglese non sembra perso;
`differenze` confronta, dentro ogni lingua, le parole del risolto con quelle sentite. `doppioni` sono le parole o le coppie di parole
ripetute di fila in `sentito` che le parole del risolto non ripetono. `parole_lunghe` sono le parole del risolto più lunghe di
`preparati.parola_lunga` secondi, con ciò che la trascrizione sente nella loro sola finestra: di solito una falsa partenza fusa con la
frase ridetta, che il montato riascoltato intero fonde di nuovo e che né `differenze` né `doppioni` vedono.
`sottotitoli` confronta le battute del risolto con la colonna «battuta» di `materiali/testo-registrato.md` (le righe che cominciano con un
numero; le maiuscole e le cuciture `|` non contano): parole diverse, mancanti o in più, e i «?» o «!» persi. Il resto della punteggiatura
non si confronta: i sottotitoli in minuscolo la tolgono. `a` è il secondo del cartello.

`zona_alta` guarda il montato largo `controllo.zona_alta.lato` pixel, in grigio, un fotogramma alla volta, nelle scene coi quadri di
`zona_alta.quadri`: la zona è la `fascia_animazione` del quadro o, se non ne ha, il suo `girato` (lo schermo sopra la sagoma). `ferma`:
fra un fotogramma e quello `distanza` secondi prima meno di `mosso` dei pixel cambia di oltre `soglia` (su 255), per più di `secondi`, anche
fra due scene. `vuota`: la zona divisa in una `griglia` (colonne, righe) ha meno di `occupata` delle celle con qualcosa sopra (più di `piena`
dei pixel lontani di oltre `soglia` dal colore di fondo), per più di `secondi`: un colore solo, o una scritta piccola in mezzo; un disegno a
tratto sottile che attraversa la zona la occupa. `copertina`: `uscite/con-copertina.mp4` che manca, più vecchio di `finale.mp4`, o col
primo fotogramma vuoto nello stesso senso (nella zona del quadro della prima scena, o tutto il fotogramma se quel quadro non ha zona).
