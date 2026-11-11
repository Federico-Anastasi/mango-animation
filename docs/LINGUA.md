# La lingua delle frasi

Tutto ciò che il prodotto dice a chi lo usa (testi dello studio, errori, avvisi, pagine dell'app) esce in italiano o in inglese. Ogni parte la sceglie a modo suo, e ogni frase si scrive nelle due lingue dove nasce, mai tradotta dopo:

- **Lo studio**: `t("italiano", "inglese")` (`studio/src/lingua.ts`). Vale la lingua scelta dal pulsante in alto o, senza scelta, quella del sistema; cambiandola la pagina si ridisegna da capo. La manda al server in ogni richiesta (`X-Lingua`).
- **Il server**: le frasi delle risposte, sotto.
- **Il motore, gli strumenti e le animazioni**: `Errore(it, en)` e `dice(it, en)`, nella lingua di chi ha chiesto il lavoro (`MANGO_ANIMATION_LINGUA`, che mette il server; senza, italiano).
- **L'app**: le sue pagine, sotto.
- **Il profilo non valido**: le frasi che dicono cosa correggere sono in `docs/PROFILO.md`, «Un profilo che lo schema non ammette».

Non è la lingua del video: quella è `lingua` del piano (`docs/PIANO.md`), e la lingua parlata di un file del girato sta nella sua scheda (`docs/SCHEDE.md`).

## Le frasi del server

Le frasi che il server dice a chi lo usa (`errore`, `problemi`, `motivo` e gli `errore` degli stati, l'`errore` di un lavoro finito) escono in italiano, o in inglese se la richiesta porta
l'intestazione `X-Lingua: en` (`it` o niente: italiano; una lingua che non c'è: italiano). Lo studio la manda in ogni richiesta, con la lingua scelta dal pulsante in alto; Claude, gli strumenti e gli script
non la mandano e leggono l'italiano. Il server scrive ogni frase nelle due lingue dove nasce (`server/src/lingua.ts`, `frase(italiano, inglese)`) e sceglie quando scrive la risposta; i log del terminale restano in italiano.
Tre eccezioni di forma, perché una frase nasce prima della richiesta che la leggerà o senza che la richiesta dica la lingua:

- **I lavori del motore** partono nella lingua di chi li ha chiesti (`POST …/lavori` con `X-Lingua`): il server passa al motore `MANGO_ANIMATION_LINGUA=it|en`, e l'`errore` del lavoro (e quello salvato in `lavori.json`) è in quella lingua.
  Un lavoro che parte da solo (il `risolvi` dopo una modifica del piano, `prepara-file` di un file che arriva) parla la lingua che lo studio ha dichiarato per ultima (l'ultima richiesta con `X-Lingua`; una richiesta senza l'intestazione, come quelle di Claude, non la cambia), italiano finché lo studio non ha scritto. Le righe di avanzamento (`righe`) sono nella stessa lingua, quelle del motore, quelle del render delle animazioni (`animazioni:` in italiano, `animations:` in inglese) e quelle scritte dal server per lo scarico dal web e per la scheda video prestata a Mango Code. Quando un lavoro fallisce, l'`errore` è una frase nella lingua del lavoro; se riporta l'ultima riga di yt-dlp (lo scarico) quella riga resta come l'ha scritto il programma, e la frase che la introduce («Lo scarico non è riuscito: …», «The download did not work: …») è nelle due lingue.
  Una pagina aperta dal browser (l'interfaccia non costruita, il 401 senza chiave o senza sessione) non porta `X-Lingua`: segue `Accept-Language` (italiano se parla italiano o se manca, inglese altrimenti), come lo studio senza una scelta.
- **Le pagine e le risposte del ricevitore del telefono** (`docs/api/rete.md`, «Il ricevitore degli arrivi») nascono quando il telefono bussa, senza `X-Lingua`: seguono `Accept-Language` del telefono, come ogni pagina aperta dal browser (italiano se parla italiano o se manca, inglese altrimenti), `lang` della pagina compreso. Il registro `registro.jsonl` resta in italiano.
- **I file che il motore scrive per tutti** portano le due lingue: ogni avviso di `risolto.json` è `{ tratto, cosa, cosa_en }` (`cosa` italiano, `cosa_en` inglese; `cosa_en` può mancare, e lo studio mostra allora `cosa`).

## Le pagine dell'app

Le pagine dell'app (attesa, errori, scelte dell'avvio, dialogo della cartella, e le frasi che il Rust ci manda) escono in italiano o in inglese, deciso da una funzione sola
(`scegli` in `app/src/lingua.rs`). Vale la lingua che lo studio ha scelto, se l'app la conosce: lo studio la dice a ogni apertura e a ogni cambio, e l'app la ricorda in
`%APPDATA%\dev.mango.animation\lingua.json`; al primo avvio, e se non la conosce, vale quella dell'interfaccia di Windows (italiano se è in italiano, inglese altrimenti). Ogni
stato che l'app manda alla pagina porta `lingua` (`it` o `en`) già nelle sue frasi; le frasi fisse sono in `app/ui/app.js` (`t("italiano", "inglese")`, niente testo nell'HTML), quelle
del Rust sono `t(it, en)` di `lingua.rs`. `app/tests/linguaggio.rs` fa fallire una frase che resta in una lingua sola.
