# Lo studio: la scheda Montaggio

### Montaggio — «com'è montato, e cosa cambio?»

Due colonne ridimensionabili: a sinistra l'anteprima, a destra il pannello; sotto, a tutta larghezza, la timeline.

- **Anteprima**, in 9:16, con due modi; si apre su «Montato» se il video è montato, altrimenti su «Piano»:
  - **Piano**: mostra subito ciò che dice il risolto, componendo nel browser gli stessi strati del quadro
    (carta, animazione già resa, girato con la sua vista, sagoma, riquadro, inserto), i sottotitoli e il titolo,
    alle stesse misure di `stile.json`. Usa le copie leggere. Non ha la copertina. È la guida di chi corregge, non l'uscita.
    La sagoma sta dove la mette il montato (scala, posto della testa, bordo che sfuma) ricavandolo da `lavoro/teste.json`, che il montaggio scrive:
    prima del primo montaggio la posa è approssimata e l'anteprima lo dice. I testi sono disegnati sulla stessa tela, col carattere
    del motore, gli stessi a capo e gli stessi istanti (una parola in rilievo sta sola e salta; il titolo ha la sua parte); la
    larghezza delle parole può scostarsi di qualche pixel da quella del montato.
  - **Montato**: il video completo che dice il server (`montato` del dettaglio, `docs/API.md`): `uscite/con-copertina.mp4`, che è lo stesso file di `finale.mp4` col primo fotogramma
    della copertina, o `uscite/finale.mp4` se la copertina manca o è di un montaggio più vecchio. Se il piano è cambiato dopo l'ultimo montaggio lo dice, con la data del piano e la richiesta di rimontarlo nella chat (lo sa dal server, quindi anche dopo aver ricaricato la pagina).
- **Montaggio non aggiornato**: se il risolto è più vecchio del piano o dello stile, i ritocchi dei pezzi sono bloccati e una riga lo dice. Dice che il montaggio si sta ricalcolando solo se un `risolvi` di questo video gira o aspetta in coda; altrimenti dice che non segue ancora il piano o lo stile di adesso e di chiederlo nella chat (per esempio dopo un cambio di stile, che non rifà il risolto da solo all'avvio).
- I file di `uscite/` si chiedono con la data del file nell'indirizzo: un file rifatto si ricarica, non resta quello vecchio in memoria del browser.
- **Timeline** (`src/montaggio/Timeline.tsx`): righello, scene, pezzi, parole, battute dei sottotitoli, titolo e suoni. I bordi dei pezzi si trascinano e si agganciano ai confini delle parole come le conta il motore (i tempi della trascrizione con lo sfasamento del piano, e dove il montaggio ha le parole allineate, i loro); in rosso i bordi che cadono nel parlato. La pagina non scorre di lato: scorre la timeline. I tasti valgono in tutta la scheda tranne dentro un campo, e le frecce non sulle maniglie che le usano per allargare le colonne; li dice il suggerimento al passaggio sulla timeline.
- **Gesti sui pezzi.** In un pezzo scelto a parole anche il bordo fra due parole (dove una pausa è stata tolta) si trascina: il pezzo si divide lì in due
  e il bordo spostato si scrive nella `rifila` di quello affacciato. Un pezzo trascinato sopra i vicini della sua scena cambia posto; lasciato
  su un'altra scena ci passa, e il menu «Porta in un'altra scena» del pannello fa lo stesso (in testa alla scena che viene dopo, in fondo a quella che viene
  prima). Non si sposta l'unico pezzo di una scena, né un pezzo che ha un punto dell'animazione della sua scena (un'ancora); un pezzo senza voce va
  solo in una scena che mostra la sola animazione. Il pezzo tiene la vista che aveva.
- Un pezzo senza voce (`docs/PIANO.md`) non ha miniatura, onda, bordi da trascinare né parole: il suo pannello offre solo di toglierlo e spostarlo, e l'anteprima mostra la sola animazione della scena.
- **Pannello** del pezzo scelto, o, senza niente di scelto, del video (quadro, modo dei sottotitoli, titolo, coda, avvisi del risolto). **Parole**: il parlato del video come testo; selezionare delle parole e toglierle le toglie dal montaggio.
- **Annulla e rifai**, e mentre gira un montaggio «Sto montando…». Sotto, **le versioni** (`src/montaggio/Versioni.tsx`, solo se il piano ha versioni di prima): un elenco dal più recente con la data e l'ora e quante scene e quanti pezzi scriveva ogni versione. Ognuna di prima ha **«Guarda»** (mostra com'era, scena per scena, cosa mostra e cosa dice, in sola lettura: niente cambia e niente si rende; non è l'immagine, perché l'anteprima «Piano» si compone dal montaggio calcolato, che per un piano vecchio non c'è) e **«Torna a questa»**, con conferma: il piano torna com'era, quello di adesso resta fra le versioni e il montaggio si ricalcola; il video montato cambia solo quando lo si rimonta. Una versione che non passa più i controlli (un file del girato che non c'è più) non torna e dice perché. Si vede anche quando il piano ha un errore, per tornare a uno che andava (`docs/API.md`, «La storia»).
- **Ogni ritocco scrive il piano** e il risolto si aggiorna da sé: un gesto è un solo `PATCH` con i soli campi che ha cambiato (`docs/API.md`), così ciò che Claude ha scritto nel frattempo in altri punti resta, e se ha cambiato proprio quel punto la riga dice che il piano è cambiato nel frattempo, rilegge il piano e il gesto si rifà; se il risolto non c'è ancora, la scheda lo dice e dice di chiedere nella chat di calcolarlo. Un file del piano non ancora preparato è un avviso sotto l'anteprima, chiuso da una riga che dice di chiedere nella chat di prepararlo.
