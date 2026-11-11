# Strumenti

Comandi che non montano: la lettura del canale TikTok, gli sticker, le foto di oggetti. Si lanciano
dalla radice del codice, con `MANGO_ANIMATION_LAVORO` che indica la cartella di lavoro: l'`archivio/` di cui parlano è quello della cartella di lavoro. Per portare dentro video nuovi: skill `archivia`.

## leggi_tiktok

    python -m strumenti.leggi_tiktok [--da AAAA-MM-GG] [--profilo-chrome PERCORSO] [--uscita CARTELLA] [--grezzi CARTELLA] [--prova]
                                     [--preferiti N] [--solo-preferiti]

Il giro su TikTok della skill `scarica-tiktok`: scrive una lettura nuova in `archivio/canali/tiktok/letture/<AAAA-MM-GG-HHMM>/`
(`profilo.json`, `video.json`, `commenti/<id>.json`, `messaggi.json`, `esito.json`, nella forma di `docs/ARCHIVIO.md`), aggiornando
`ultima.json`. Legge il profilo, l'elenco dei contenuti, gli ultimi 7 giorni del canale e l'analisi dei video recenti da TikTok Studio;
i numeri esatti di ogni video dalla sua pagina pubblica (Studio li arrotonda); tutti i commenti con le risposte, con le richieste
della pagina di TikTok fatte dalla scheda col login (da fuori ne mancano alcuni), scritti man mano; le conversazioni, aprendo solo
quelle cambiate dalla lettura di prima (aprirne una la segna come letta) e riportando le altre. Il canale è la voce `tiktok` di
`canali` nel profilo del creator. Va a passo di persona, con una pausa diversa fra una pagina o una richiesta e l'altra. In sola lettura.

I Preferiti (i video salvati dal creator) li legge ogni giro, i primi `--preferiti` dal più recente (10; 0 li salta), e li scrive interi
in `archivio/canali/tiktok/preferiti.json` (`docs/ARCHIVIO.md`, «I Preferiti di TikTok»). `--solo-preferiti` fa solo questo, senza una lettura
precedente e senza toccare le letture; se non ne trova nessuno non riscrive il file ed esce con 1.

Serve il pacchetto Python `playwright` (l'app non lo installa; se manca, il comando dice come). Pilota il Chrome del creator via CDP (Playwright): Chrome dev'essere **aperto** col collegamento acceso
(`chrome://inspect/#remote-debugging`; `DevToolsActivePort` nel profilo), e a ogni giro chiede di consentirlo: il comando lo dice e aspetta
3 minuti che il creator prema «Consenti». Apre una scheda propria e non tocca quelle aperte. `--da` limita i video letti (predefinito: 30 giorni
fa); `--prova` non scrive niente; `--grezzi` salva anche il testo delle pagine, che serve a rimettere a posto le
espressioni quando TikTok cambia le sue pagine.

## pagina.mjs

    python -m motore pagina <slug> [nome …] [--solo-ritagli] [--visibile]

Le pagine vere da mettere a schermo, in formato telefono, e dove stanno le frasi che poi le scene cerchiano. Si lancia dal
comando del motore, che dopo la cattura fa i ritagli per le scene: l'elenco `materiali/pagine.json`, ciò che scrive e le misure
dello stile (`pagina`) sono in `docs/MOTORE.md`, «Le pagine vere». A mano: `node strumenti/pagina.mjs <pagine.json> [nome …]`, con
`PAGINA_VISIBILE=1` per il Chrome visibile. Serve `node`, Google Chrome e i pacchetti di `studio/` (`bun install` lì: Playwright viene da lì); se manca qualcosa il comando lo dice. Lo stesso vale per `carosello.mjs`.

## sticker

    python -m strumenti.sticker <giorno/file del girato> <istante> <nome>

Prende il fotogramma della sagoma di una ripresa a quell'istante e ne fa uno sticker: il busto, tagliato sul petto e
ai lati (dove entrano le mani), con un bordo bianco pieno; le misure sono la sezione `sticker` dello stile. Lo scrive in `archivio/sticker/<nome>.png`, con accanto
`<nome>.json` (ripresa e istante). Serve una ripresa già scontornata: la sagoma copre solo i tratti montati.

    python -m strumenti.sticker --provini [giorno]

Per scegliere l'espressione: di ogni ripresa scontornata (o solo di quelle del giorno dato) `sticker.per_ripresa` (otto di serie) sticker di prova presi a
distanze uguali nei tratti scontornati, numerati, in fogli da 24 `archivio/sticker/provini/provini-<n>.jpg`; `provini.json`
dice di ogni numero ripresa e istante, da passare al comando qui sopra. I fogli di prima si tolgono; la cartella non si versiona.

## oggetti

    python -m strumenti.oggetti cerca <slug> <nome> "<parole di ricerca>"
    python -m strumenti.oggetti prendi <slug> <nome> <numero> [--intero]

Foto vere di oggetti, senza sfondo, per i caroselli. `cerca` interroga Wikimedia Commons (solo foto con licenza libera:
CC0, pubblico dominio, CC BY, CC BY-SA) e scrive in `materiali/oggetti/` un foglio di provini numerati,
`provini-<nome>.jpg` (con la licenza sotto ogni foto), e `provini-<nome>.json` (file, pagina, autore, licenza); stampa il
percorso del foglio, da guardare. `prendi` scarica il provino scelto, lo scontorna (SAM2 e ViTMatte, gli stessi modelli della
sagoma, sulla scheda video) e scrive `<nome>.png`, ritagliato stretto; con `--intero` tiene la foto com'è, `<nome>.jpg`.
Aggiorna `fonti.json` (per nome: file, pagina, licenza, autore) senza perdere le altre voci: molte licenze chiedono il
credito. Un 429 o una rete che non risponde si aspettano e si ritentano, poi un errore. Le misure sono in `stile.json`, `oggetti`.
Uno scontorno che viene male (oggetti trasparenti, tinta come lo sfondo) si riprende con un'altra foto o con `--intero`.

## avvisi_terzi

    python -m strumenti.avvisi_terzi [--controlla]

Riscrive `AVVISI-DI-TERZI.md` alla radice dalle dipendenze di oggi: `bun.lock` e `node_modules/` di `server/`, `studio/`, `animazioni/` (serve `bun install`), `cargo metadata` su `app/Cargo.lock`, `app/src/computer/manifesto.json` (ciò che l'app scarica) e i pacchetti Python di `app/src/computer/piano.rs`. Il comando si ferma se un pacchetto Python non ha la sua riga in `PACCHETTI_PYTHON`, se una dipendenza non dichiara la licenza o se una licenza che pone limiti non ha la sua nota in `LIMITI`. `--controlla` non scrive ed esce con 1 se il file è vecchio: lo fa anche la prova `strumenti/prove/test_avvisi_terzi.py`. Si rilancia quando cambiano le dipendenze.
