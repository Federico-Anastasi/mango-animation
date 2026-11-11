# Il risolto

Dal piano (`docs/PIANO.md`) a `lavoro/risolto.json`.

`python -m motore risolvi <slug>` scrive `lavoro/risolto.json`: il piano trasformato in tempi veri. È ciò
che l'interfaccia mostra e ciò che `monta` esegue. Non si scrive a mano.

    {
      "impronta": "…",                       del piano e delle sezioni dello stile che cambiano il montato (`docs/MOTORE.md`, «Il piano che cambia mentre monta»)
      "formato": { "largo": 1080, "alto": 1920, "fps": 30, "nome": "verticale" },
      "capitoli": [ { "titolo": "La partenza", "da": 0 } ],
      "durata": 60.2,
      "scene":  [ { "nome", "quadro", "inizio", "durata", "animazione", "ancore": [[t video, t scena]],
                    "tempi": { nome: secondo di scena } } ],
      "tratti": [ { "scena": 0, "pezzo": 0, "sorgente": "ripresa", "da": 0.43, "durata": 7.2, "esce": 0.0,
                    "vista": null, "zoom": null, "evidenzia": null, "legato": [null, null],
                    "immagine": null | { "da": 0.43, "passo": 1.12 },           da dove e a che passo corre l'immagine, se non segue la voce
                    "sagoma": null | { "sorgente": "muta", "da": 4.1 },         da quale ripresa e da quale secondo viene la sagoma, se non dalla voce
                    "girato": null | { "sorgente": "talk", "fermo": 40.5 }          il fotogramma fermo che fa da girato, se non è quello della voce,
                              | { "sorgente": "muto", "da": 12.3, "passo": 1.0 } } ],  o da dove e a che passo corre l'altra ripresa
      "parole": [ { "p": "ciao", "da": 0.10, "a": 0.32, "tratto": 0, "nella_sorgente": 0.53, "voto": 0.91 } ],
      "battute": [ { "da": 0.1, "a": 1.4, "testo": "ciao a tutti", "istanti": [0.1, 0.4, 0.7] } ],
      "titolo": { "testo": "…", "parte": null, "da": 0, "a": 1 } | null,
      "copertina": { "disegno": "materiali/x.png", "istante": 0 } | null,           com'è nel piano: il montato ha un fotogramma in più davanti
      "suoni": [ { "file": "…", "esce": 12.3, "guadagno": -4.1 } ],
      "avvisi": [ { "tratto": 3, "cosa": "il taglio all'inizio cade nella voce (-31 dB)", "cosa_en": "the cut at the start falls in the voice (-31 dB)" } ]
    }

`da`, `a`, `esce`, `istanti` di tratti, parole e battute sono secondi **del video**, tranne `da` e
`durata` di un tratto, che sono secondi **della sorgente**. `legato` dice se un bordo del tratto cade
dentro il parlato (i dB) invece che nel silenzio (`null`): sono i tagli da guardare. `avvisi` li ripete a parole
(«il taglio all'inizio / alla fine cade nella voce»), elenca le parole poco sicure per l'allineamento con la sicurezza in percentuale e dice anche dove una `rifila` taglia la voce: a che livello e quanta voce resta oltre il
taglio, coi secondi della sorgente, e dove un tratto riprende l'audio del tratto prima (stessa sorgente, i due si accavallano: si sentirebbe due volte). `cosa` è in italiano e `cosa_en` è la stessa frase in inglese.

- `ancore` di una scena: `[secondo del video dall'inizio della scena, secondo dell'animazione]`; `tempi`:
  secondi dall'inizio della scena. È ciò che arriva ad `animazioni/` (`docs/MOTORE.md`).
- `voto` di una parola è quello dell'allineamento, solo per i pezzi a parole; per i pezzi a tempo la parola
  ha i tempi della trascrizione e `voto` è `null`.
- `testo` di una battuta tiene gli asterischi delle correzioni (il `.srt` li toglie).
- Il tratto di un pezzo senza voce ha `sorgente` `null` e `da` 0: niente parole, il suo audio è silenzio. Col suo `girato`,
  `girato` è `{ "sorgente", "da", "passo" }` (o col `fermo`), come nei pezzi con la voce.
- `suoni[].file` è come sta nel piano; `guadagno` porta il suo picco a quello chiesto.
