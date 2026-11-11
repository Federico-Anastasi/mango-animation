# Il motore: la sagoma

## La sagoma

Lo scontorno (`scontorno.py`) segue la persona con SAM2.1 base+ (Apache-2.0) e ne rifà il bordo con ViTMatte-small (`vitmatte-small-composition-1k`, Apache-2.0 sulla sua scheda). Per ogni intervallo: RT-DETR (`persona.py`, Apache-2.0, 20 M di parametri) trova nel primo fotogramma la persona più grande, e il suo riquadro è
la prima indicazione a SAM2 (sopra il viso, trovato da YuNet, il riquadro non sale oltre `sopra_il_viso` altezze del viso: una lampada dietro la testa non diventa un cappello); SAM2 guarda un fotogramma ogni `passo_maschera` e in mezzo la sua maschera si sposta col flusso ottico (DIS,
OpenCV); dalla maschera si ricava la fascia incerta (`raggio_trimap`), e ViTMatte rifà l'alfa a scala ridotta (`scala_matting`) solo
sulle righe vicine a quella fascia; l'alfa si leviga coi fotogrammi vicini portati sul corrente dal flusso
(`peso_vicini`) e si riporta a piena misura; il colore è quello del girato. Lettura, flusso e SAM2 vanno in fili a parte; i fotogrammi già
usati da tutti si tolgono (`fotogrammi_in_memoria`). Le misure stanno in `sagoma.scontorno` dello stile; i modelli si scaricano da Hugging Face al primo uso.

**Sulla scheda NVIDIA** (`motori.sagoma.dove`, o la scheda di `macchina.scheda_video`) SAM2 e ViTMatte girano in mezza precisione, ViTMatte in un grafo CUDA per altezza e SAM2 su una
corsia a parte: su una ripresa 4K dell'iPhone circa 17 fotogrammi al secondo su una scheda NVIDIA di prova, con 1,2 GB di memoria. **Sul processore** gli stessi modelli girano in precisione piena e
senza grafi né corsie: lo stesso risultato, molto più lento. Un pezzo già scontornato non si rifà da sé: per rifarlo (un altro motore, un altro modello) si toglie la
cartella `sagoma` (e `sagoma.json`) dai preparati della sorgente.

**Dove sta la testa** (le viste con `"segui": true`): `monta` la misura nei soli tratti che stanno in una di quelle viste, ognuno allargato di tre volte `segui.morbido` secondi perché la
levigatura ai bordi non senta il vuoto accanto. YuNet (`persona.py`, MIT, 0,2 MB, su OpenCV, senza torch) dà il viso più grande di un fotogramma ogni `1 / segui.misure_al_secondo` secondi
(`segui.soglia_viso`); il suo centro, in frazioni della larghezza, è la misura. In `persona.json` (`docs/ARCHIVIO.md`) `x` ha una misura per passo dall'inizio della ripresa, `null` dove non
è stato misurato o non si vede nessun viso (la camera tiene il posto che aveva), e `misurati` elenca gli intervalli fatti: ciò che c'è già non si rifà. Un `persona.json` senza `misurati` si rifà.

`sagoma_dei_tratti` in `prepara.py` lavora per sorgente, sui soli tratti in sagoma. Ogni tratto vuole un *pezzo* che
parta almeno `sagoma.margine` secondi prima di lui (o dall'inizio della ripresa) e ne contenga la fine: così il modello arriva al
primo fotogramma col bordo già stabile. I tratti non ancora portati da un pezzo, allargati del margine e fusi dove si toccano, si
scontornano in un passaggio solo, coi modelli caricati una volta. Se al primo fotogramma di un intervallo il rilevatore non vede nessuno
(chi parla si sta ancora sedendo davanti al telefono), lo scontorno parte dal primo fotogramma del margine in cui la persona c'è, provato
ogni tre fotogrammi: il pezzo copre comunque il tratto, e il suo `inizio` dice dove comincia il file. Se nel margine non c'è mai nessuno,
l'errore resta. Ogni intervallo è un
file `sagoma/<primo>-<ultimo>.webm` (numeri di fotogramma) che comincia al suo primo fotogramma. Un pezzo già scritto non si tocca,
e con lui non cambiano i tratti che lo leggono: allargare un taglio scontorna solo ciò che manca, anche se si sovrappone a un pezzo
vecchio. Lo scontorno e la codifica VP9 vanno in due fili (`sagoma.codifica.in_coda`), così la velocità è quella del più lento dei due.
`sagoma.json` (`{"pezzi": [{da, a, file, inizio}]}`, `docs/ARCHIVIO.md`) si riscrive a ogni file finito. Chi legge la sagoma (`Compositore.pezzo_sagoma`,
la copertina, `strumenti/sticker.py`) chiede a `sagoma.py` il file e il secondo del file; una sagoma in un `sagoma.webm` intero è letta come un pezzo solo
e, quando serve altro, le si aggiungono pezzi accanto.
