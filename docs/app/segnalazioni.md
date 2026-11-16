# Le segnalazioni dei problemi

Parte di `docs/APP.md`.

Chi usa l'app può mandare a chi la sistema ciò che sta andando storto, con un clic e senza dati personali. Il codice è `app/src/segnalazione/`
(`mod.rs` i comandi e la pagina «nuova issue», `rapporto.rs` l'evento e il testo, `immagine.rs` l'immagine caricata, `registro.rs` `ui.log`, `anonimizza.rs`, `schermata.rs`, `ponte.js` lo script delle pagine).

- **Dove sta «Segnala un problema»**: nello studio, il bottone con la bandierina nella barra in alto (fra i segni di stato, raggiungibile da ogni vista), la riga «Segnala un problema» di Impostazioni › Aiuto e, nella vista d'errore comune, «Segnala il problema»
  (porta con sé il messaggio e il dettaglio dell'errore); nelle pagine dell'app (`app/ui/`), il bottone «Segnala un problema» nel piede di ogni pagina (a destra, con la versione dell'app a sinistra), d'attesa e d'errore comprese (nelle pagine d'errore porta il titolo e il messaggio). Nel browser,
  senza l'app, il ponte `window.__MANGO_ANIMATION__.segnalazione` non c'è e il bottone dello studio non compare.
- **Il dialogo**: «Cosa è successo?» (facoltativo); «Aggiungi un'immagine dell'errore» con la riga «Te lo consigliamo: con l'immagine ci è più semplice capire il problema e risolverlo.» e il bottone «Scegli un'immagine»
  (una sola immagine PNG, JPEG o WebP; scelta, ne mostra il nome e «Togli»); l'interruttore «Includi una schermata della finestra», spento di base ovunque (la finestra può mostrare i video e la chat), con la spiegazione che può mostrare contenuti del creator; una frase che dice che i registri allegati
  possono contenere i nomi dei suoi video e dei suoi file, che nome utente, nome del computer, email, indirizzi di rete e chiavi vengono tolti, e che trascrizioni, chat e file della cartella di lavoro non partono mai; «Invia» →
  «Inviato, grazie». Non parte niente senza il clic. Con la schermata, il dialogo si nasconde il tempo di riprendere la finestra, che altrimenti mostrerebbe il dialogo e non la pagina di cui si parla.
- **Dove va**: la segnalazione parte come un'unica busta HTTP (`ureq`, senza SDK) verso il progetto Sentry `mango-animation` dell'organizzazione `mango-o6` (dati in UE), il cui DSN sta in `segnalazione/mod.rs`
  (`SENTRY_DSN_DEL_PROGETTO`: un DSN permette solo di inviare). Una costruzione lo sostituisce con la variabile `MANGO_ANIMATION_SENTRY_DSN`, e vuota o `off` lo spegne: chi fa un fork la mette a `off` o al DSN di un suo
  progetto. Il comando `segnalazione_invio_attivo` dice alle pagine se l'invio è acceso: senza, né l'interruttore della schermata né il campo dell'immagine si mostrano. Senza indirizzo il testo resta in
  `segnalazione-<data>-<ora>.txt` nella cartella dei registri, si mostra in Esplora file e si apre la pagina «nuova issue» di `github.com/Federico-Anastasi/mango-animation`, con titolo e testo già scritti: la macchina e la
  richiesta di allegare il file, niente di personale; la schermata in quel caso non si prende.
- **Cosa contiene**: `level: "error"`; `message` (la nota del creator o la prima riga dell'errore); `release: mango-animation@<versione>`; `environment` (`production` l'app installata, `development` quella di chi sviluppa);
  `tags` `kind` (`user-report` o `error-page`), `gpu`, `vram_mib`, `ram_mib`, `lingua`, `app` (`installata` o `sviluppo`); `contexts` `os`, `device`, `gpu`; `extra` `note`, `error`, `page`, `gpus`; allegati `report.txt` (riepilogo, nota,
  errore, e la fine di 256 KB di ogni `*.log` della cartella dei registri dell'app), `screenshot.png` (`PrintWindow`, solo se l'interruttore è acceso) e `uploaded-image.png`, `.jpg` o `.webp` (solo se chi segnala ne ha scelta una). L'hardware lo legge `computer/hw.rs`. Non entra mai altro: né trascrizioni, né
  chat, né file della cartella di lavoro.
- **L'immagine caricata**: la pagina la legge e la passa al ponte in base64 (`segnalazione.invia({ …, immagine })`); l'app (`immagine.rs`) la riconosce dai primi byte, senza fidarsi del tipo dichiarato dalla pagina: solo PNG, JPEG o WebP fino a 10 MB (la pagina rifiuta
  subito ciò che pesa di più, l'app lo ripete), altrimenti rifiuta con una frase nelle due lingue prima di inviare qualunque cosa. Si allega com'è, con un nome fisso e l'estensione giusta: l'immagine la sceglie chi segnala, e non si anonimizza né porta avvisi in più. Senza l'invio a Sentry non parte.
- **Anonimizzazione** (`anonimizza.rs`, su ogni testo e allegato): il nome utente nei percorsi (anche con le barre doppie dei JSON, e nel nome corto di Windows come `ALICER~1`) → `<user>`, il nome del PC e del dominio Windows → `<pc>`, il nome dell'azienda in `OneDrive - <nome>` → `<org>`, email → `<email>`, IPv4 (tranne `127.x` e `0.0.0.0`) e IPv6 (completi o abbreviati con `::`) → `<ip>`,
  chiavi e token (`sk-…`, `hf_…`, `ghp_…`, `github_pat_…`, `Bearer …`, `?key=`, `chiave=`, `token=`, `password=`, l'intestazione `X-Chiave-Api`, i cookie `mango_api_<porta>` e `mango_studio`) → `<secret>`, e la chiave delle API
  di questa cartella di lavoro (`archivio/arrivi/chiave-api.json`, `docs/API.md`, «La chiave delle API») ovunque compaia. I nomi dei video non si toccano: il dialogo lo dice.
- **`ui.log`** (`%LOCALAPPDATA%\dev.mango.animation\logs\`): gli errori non gestiti delle pagine (quelle dell'app e lo studio dentro l'app), i `console.error` e le chiamate dei ponti all'app più lente di 1 s o senza risposta dopo 5 s
  (`ponte.js` le avvolge; la scelta di una cartella aspetta il creator e non conta). Al più 100 righe al minuto (quelle tolte si contano in una riga), oltre 2 MB passa in `ui.1.log`.
  Le chiamate delle pagine dell'app a se stessa (`stato_app`, `azione`, …) non sono misurate: ogni loro errore sì.
- **Prove**: `cargo test` da `app/` (anonimizzazione con dati realistici, forma dell'evento, busta con le lunghezze esatte e l'immagine caricata, riconoscimento dai byte e limite di 10 MB, invio contro un server locale, file e pagina di GitHub, tetto di `ui.log`; la schermata con una finestra vera:
  `cargo test una_finestra_vera -- --ignored`), `bun test prove installer` da `app/` (lo script delle pagine e il dialogo dell'app, con l'immagine), `bun run test` da `studio/` (il bottone, il dialogo con l'immagine, la vista d'errore). Nei test niente va a Sentry.
