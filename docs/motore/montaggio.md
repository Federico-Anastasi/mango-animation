# Il motore: il montaggio

I comandi che portano il piano al video, e i file che il montaggio tiene. Come si lanciano i comandi, i moduli e lo stile: `docs/motore/struttura.md`.

| comando | cosa fa | scrive |
|---|---|---|
| `python -m motore valida <slug>` | schema e riferimenti del piano (sorgenti, quadri, formati, viste, viso, animazioni — le sigle si chiedono a `bun run elenco` e, se una non c'è, la frase dice quali ci sono —, parole di `dice`) | niente |
| `python -m motore risolvi <slug>` | il piano in tempi veri | `lavoro/risolto.json` |
| `python -m motore monta <slug>` | risolve, rende le animazioni, scontorna i soli tratti in sagoma (in un passaggio, ognuno allargato di `sagoma.margine`; un tratto già portato da un pezzo di sagoma non si rifà), misura la testa nei soli tratti di una vista che segue la persona, monta; se il piano dichiara `copertina`, la compone e la mette come primo fotogramma della stessa codifica | `uscite/finale.mp4`, `finale.srt` (sempre, anche con `modo: "nessuno"`), `capitoli.txt` (se le scene hanno `capitolo`); con `copertina` nel piano anche `copertina.png` e `con-copertina.mp4`, che è lo stesso file di `finale.mp4` |
| `python -m motore anteprima <slug> --scena <nome>` (o `--da <s> --a <s>`) | solo un pezzo del video, per guardare una correzione: rende le scene e compone i tratti che toccano il pezzo (gli stessi file di `lavoro/` che poi usa `monta`, che non li rifà), con sottotitoli, titolo e suoni, codificato veloce (`uscita.anteprima`); il pezzo si allarga ai tratti interi. La sagoma si fa come in `monta`: dei tratti che ancora non l'hanno | `uscite/anteprima.mp4`, `anteprima.json` (`{ "da", "a" }`: i secondi del video che copre, scritto dopo il video) |
| `python -m motore anteprima <slug> --foto <secondo>` | un solo fotogramma composto del video a quel secondo (secondi del video): il quadro del suo tratto con la sagoma, i sottotitoli e il titolo, e della scena solo il suo fotogramma (`registra --foto`, un'immagine: niente scena intera, niente tratto scritto). Per un posto, un colore, una posizione. La sagoma deve esserci già (un `monta` o un'`anteprima` la fa); una scena trasparente no (vuole la sua maschera: l'anteprima della scena) | `lavoro/foto/composta-<secondo>.jpg` |
| `python -m motore leggero <slug>` | la copia piccola del video completo, con la copertina, solo quando il creator la chiede (guarda dal telefono o la manda); senza una copertina più nuova del montato si ferma | `uscite/leggero.mp4` |

## Cosa si tiene

`archivio/preparati/<giorno>/<file>/` (`docs/ARCHIVIO.md`) tiene anche `allineate.json`: i confini veri delle
parole dei pezzi a parole, con l'impronta delle parole da cui vengono (se cambiano, si rifanno). In
`lavoro/`: `tratti/<impronta>.mkv` (ogni tratto già composto, con l'impronta di tutto ciò da cui dipende: il suo quadro senza `sottotitoli` e `titolo`, che si mettono sul video intero, e il file del pezzo di sagoma che legge),
`scene/` (le scene animate, ognuna con accanto `<sigla>.mp4.impronta`: i tempi e i sorgenti per cui è stata resa), `misure.json` (volume di ogni sorgente),
`teste.json` (per sorgente: gli intervalli di cui si è guardata la testa e la riga più alta vista; si guardano solo gli intervalli nuovi).

`montaggio.json` (i tempi delle fasi e i tratti degli ultimi due montaggi; `monta` ricomincia le fasi, `controlla`
aggiunge le sue se il piano è lo stesso):

    {
      "impronta": "<quella del risolto>", "quando": "2026-03-14T18:20:11",
      "fasi": [ { "nome": "animazioni", "secondi": 12.4, "fatti": 1, "saltati": 5 } ],
      "tratti": ["<impronta>.mkv"], "tratti_prima": ["<impronta>.mkv"],
      "uscite": { "finale": "<impronta del risolto da cui è montato finale.mp4>" }
    }

Le fasi, nell'ordine: `animazioni` (scene), `sagoma` (sorgenti), `tratti` (tratti), `uscita` (il video intero: sempre
fatti 1), poi `ascolto`, `parole` (parole cercate), `trascrizione`, `fotogrammi` (di `controlla`). «Fatti» sono gli elementi rifatti in quel giro, «saltati» quelli già buoni. Se i tratti si compongono
mentre si codifica, `tratti` conta solo il suono e il resto del tempo sta in `uscita`. Ogni fase stampa anche una riga:
`fase <nome>: <secondi> s, fatti <n>, saltati <n>`. Un tratto con la stessa impronta di un altro si compone una volta sola
e conta una volta in «fatti» e «saltati».

`tratti` sono i file di `lavoro/tratti/` del montaggio appena finito, `tratti_prima` quelli del montaggio con un altro
piano che lo precedeva (rimontare lo stesso piano non li cambia). Quando `finale.mp4` è scritto, `monta` toglie da
`lavoro/tratti/` ogni altro file (anche `.parziale` e `.campione.mkv` rimasti) e da `lavoro/scene/` le scene, col loro
`.impronta`, di sigle che il piano non chiede più. Non sa se un altro lavoro sta usando lo stesso video: la coda del server
ne fa uno alla volta; lanciato a mano insieme a un altro, `monta` può togliere ciò che l'altro sta leggendo. La riga
finale è `finale.mp4: <secondi> s, lavoro/ <n> MB`.

## La voce pulita

Con `voce.pulizia.attiva`, la voce di un montaggio (e di un'anteprima) si pulisce dal rumore di fondo dopo i tagli e prima dei
suoni e del limitatore (un video fatto solo di pezzi senza voce non ha niente da pulire, e la pulizia si salta): la voce di tutti i tratti in un wav solo, passata a DeepFilterNet3 (`-D`, allineata) e riportata alla
stessa lunghezza. Tagli, allineamento, livello della voce e `controlla` lavorano sull'audio vero; la voce pulita ha gli stessi
istanti. Si tiene in `lavoro/voce/finale/` (e `voce/anteprima/`) col nome dell'impronta dei tratti e della `pulizia`: rimontare gli
stessi tratti non la rifà.

## Il piano che cambia mentre monta

Prima di ogni fase (`animazioni`, `sagoma`, `tratti`, `uscita`) e dopo la codifica finale, prima che `finale.mp4` prenda il suo
posto, `monta` rilegge dal disco il piano (con la sua `base`) e `stile.json` e ne ricalcola l'impronta, la stessa di
`risolto.impronta` (`impronta_su_disco` in `risolvi.py`: due letture e un hash, senza risolvere). L'impronta è dell'intero piano e delle sole sezioni dello stile che cambiano il montato: quelle di altri lavori (`prova`, `anteprima`, `carosello`, `controllo`, `preparati`, `dettatura`, `ascolta`, `pagina`, `oggetti`, `scarico`; `SEZIONI_FUORI_DAL_MONTATO`) non la toccano, quindi aggiungere o ritoccare una chiave lì non rimonta nessun video. Una sezione nuova conta finché non è classificata, e la prova `test_risolvi.py` fallisce finché qualcuno non lo fa. Se non è più quella da cui è
partito stampa «il piano è cambiato mentre montavo: riparto con quello nuovo» e riparte da `risolvi`; ciò che è già fatto resta.
Al terzo cambio di fila esce con errore. Un `finale.mp4` di un piano superato non prende mai il posto di quello buono, e
`finale.srt` e `capitoli.txt` si scrivono solo con un montaggio che regge. Un piano che nel frattempo non si legge più (JSON a
metà, schema rotto) conta come cambiato: se resta rotto lo dice `risolvi` alla ripartenza.

## Il formato e lo spazio

Un video ha un formato solo, quello dei quadri delle sue scene (`verticale` 1080×1920, `orizzontale` 1920×1080); `valida` e `risolvi` rifiutano scene di formati diversi. Il risolto lo porta in `formato` (`largo`, `alto`, `fps`, `nome`). La copia leggera è 720×1280 in verticale, 1280×720 in orizzontale.

`monta` compone ogni tratto in un file (`lavoro/tratti/<impronta>.mkv`), più tratti insieme (uno ogni `parallelismo.processori_per_lavoro` processori), e li legge uno dopo l'altro: niente copia unita. Un tratto si scrive a parte e prende il suo nome solo a lavoro finito: un montaggio interrotto non lascia tratti a metà che sembrano buoni. Prima codifica i primi secondi di tre tratti sparsi nel video e ne ricava lo spazio che tutti i tratti prenderebbero; se supera `uscita.tratti_massimo_mb` (3 GB) non li scrive: prepara solo il suono di ogni tratto (`.wav`, 0,19 MB al secondo) e compone i fotogrammi mentre li codifica, con lo stesso risultato. Così una diretta di 72 minuti non riempie il disco.

`finale.mp4`, `finale.srt`, `capitoli.txt`, `leggero.mp4` e `copertina.png`/`con-copertina.mp4` si scrivono in un file nascosto accanto e si rinominano alla fine. Così ogni JSON che il motore scrive (`risolto.json`, `livelli.json`, `parole.json`, …): chi lo legge non lo trova mai a metà.
