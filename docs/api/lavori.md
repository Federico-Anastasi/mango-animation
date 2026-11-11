# I lavori del motore

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua). La coda dei lavori e ciò che il server mette in coda da sé.

| rotta | cosa fa |
|---|---|
| `GET /api/lavori` | `{ in_corso, in_coda, finiti }` (sotto) |
| `DELETE /api/lavori/:id` | toglie dalla coda o ferma quello in corso → `{ ok, esito: "tolto" \| "fermato" }`; 404 se l'id non c'è più |

**I lavori.** Uno solo alla volta. Ogni lavoro è `{ id, slug, comando, file, secondi_video }` (`slug` è `null` e `file` è
`giorno/nome` per `prepara-file`). `in_corso` aggiunge `iniziato`, `righe` (le ultime 200 righe di stdout e
stderr), `stima`, `trascorsi` (secondi da quando è partito) e `fine_prevista` (`iniziato` più la stima, ISO; `null` senza
stima); `in_coda` aggiunge `accodato` e `stima`; `finiti` (gli ultimi 20, dal più recente, anche dopo un riavvio:
stanno in `archivio/lavori.jsonl`) hanno `iniziato`, `finito`, `esito` (`"riuscito"`, `"fallito"`,
`"fermato"` o `"interrotto"`), `errore` (l'ultima riga di stderr, `null` se è andato bene; se il processo esce con errore senza scrivere niente, una frase che manda alle righe, e l'ultima riga è «Uscito con codice N.») e le ultime 30 `righe`; un lavoro che dà qualcosa a chi lo aspettava (`scene-foto`) ha anche il suo `risultato`. Un lavoro **interrotto** è uno che il server stava eseguendo quando si è fermato (chiuso, o morto): quando un lavoro parte il server scrive la sua riga in `lavori.jsonl`, e al riavvio quelle senza la fine passano fra i finiti con `esito: "interrotto"`, una frase che dice di rilanciarlo (nella lingua di chi l'aveva chiesto) in `errore` e nessuna riga. Non si rimette in coda da solo. Chi lo aspettava (`lavoro_aspetta`) lo ritrova con `lavoro_stato`.

`secondi_video` sono i secondi di video su cui il lavoro lavora, dall'indice in memoria: per `prepara` e `prepara-file` la
durata del girato non ancora trascritto (0 se è tutto preparato), per `anteprima` la scena o il pezzo `da`–`a`, per gli
altri comandi la durata del risolto; `null` se non si sa (un video senza risolto, un file senza durata nella scheda).
`stima` sono i secondi che il lavoro dovrebbe durare, presi dagli ultimi 10 lavori **riusciti** con lo stesso comando:
la mediana dei secondi impiegati per secondo di video, per `secondi_video`; se `secondi_video` è `null`, la mediana delle
durate dei lavori che non lo sapevano. Con meno di 3 lavori così, o con `secondi_video` a 0 (un file già preparato), è `null`: non c'è storia per stimarlo. Si fissa quando il
lavoro parte (in coda si calcola con ciò che si sa in quel momento). Il motore non dice quanto ha fatto del lavoro intero
(le righe come «tratto 3/40» sono di una fase sola), quindi l'avanzamento è `trascorsi` contro `stima`. Quando
`lavori.jsonl` supera le 100 righe si accorcia agli ultimi 20 finiti più i lavori da cui vengono le stime (le righe di partenza non servono più).
`risolvi` passa avanti agli altri lavori in coda; un lavoro identico a uno già in coda si fonde con quello
e dà lo stesso `id`. Un lavoro passa fra i `finiti` (e lo annuncia l'evento `lavori`) solo dopo che il server ha riletto ciò
che può aver scritto (risolto, controllo e uscite del suo video, i preparati dei file del piano o del file preparato), senza
aspettare l'osservatore: appena è finito, le letture mostrano già i suoi file. Fermare un lavoro ferma il suo processo e quelli che ha lanciato.

**`risolvi` si mette in coda da solo** quando cambia un `piano.json` (per quel video e per quelli che lo
hanno come `base`) o `stile.json` (per tutti i video con un piano), senza doppioni in coda. All'avvio, finita la lettura dell'archivio, si
mette in coda per ogni video con una scheda e un piano validi il cui `risolto.json` manca o è più vecchio del piano (o di quello di una sua base): il server può essere stato spento
mentre il piano cambiava. Lo stile no: uno stile più nuovo del risolto non rifà l'archivio a ogni avvio, e il video resta con `risolto_aggiornato` falso finché non si chiede un `risolvi`.
