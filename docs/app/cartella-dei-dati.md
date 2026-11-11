# Dove stanno i video

Parte di `docs/APP.md`. La cartella di lavoro com'è fatta: `docs/ARCHITETTURA.md`, «La cartella di lavoro».

Al primo avvio (nessuna cartella ricordata e nessuna `MANGO_ANIMATION_LAVORO`), dopo Claude Code, l'app chiede dove tenere i video; il codice è in `app/src/cartella.rs` (cosa dire di una cartella),
`app/src/lavoro.rs` (la scelta ricordata) e `app/src/preparazione.rs` (il giro della pagina). Chi ha già una cartella ricordata non vede niente di nuovo.

- **La pagina** «Dove tengo i tuoi video?»: la cartella proposta (`Mango Animation` dentro Documenti, quella vera di Windows) con lo spazio libero del suo disco; «Usa questa cartella» la prepara (con `archivio/`) e la ricorda;
  «Scegli un'altra cartella» apre il dialogo di sistema (se non si apre, perché un criterio del computer lo vieta, la pagina lo dice e il creator sceglie fra le cartelle proposte). Sotto, «Altre cartelle»: i dischi fissi con più spazio libero di quello della cartella in discussione (non quelli rimovibili o di rete), ognuno con `Mango Animation` dentro
  e il suo spazio libero, che si prendono con un clic. Senza Documenti non c'è proposta: il creator ne sceglie una. Finché non dice «Usa questa cartella» l'app non crea niente.
- **OneDrive**: una cartella dentro una cartella che OneDrive sincronizza porta l'avviso «i video verrebbero copiati online, e pesano molto». Le cartelle sincronizzate sono quelle delle variabili di Windows (`OneDrive`,
  `OneDriveConsumer`, `OneDriveCommercial`) e le cartelle `OneDrive` o `OneDrive - <nome>` dentro la cartella dell'utente (un secondo account di lavoro non ha una variabile); il confronto è per cartelle intere e senza distinguere
  maiuscole e minuscole, così `OneDriveVecchio` o `D:\OneDrive` non danno falsi allarmi. Se Documenti è su OneDrive, la cartella proposta (quella del pulsante grande) è `Mango Animation`
  nella cartella dell'utente, fuori da OneDrive; l'avviso resta per chi sceglie a mano una cartella sincronizzata.
- **Il motore della dettatura** riceve la cartella scelta appena è scelta (`Voce::usa_lavoro`): il primo avvio non ha bisogno di riaprire l'app.

### Spostare la cartella dei dati

«Sposta la cartella dei dati…» dello studio (`window.__MANGO_ANIMATION__.cartellaDati.sposta()`, `app/src/dati.rs`) apre il dialogo e ricorda la scelta in `lavoro.json` come `sposta_a`; la cartella in uso non cambia
(`leggi()` la dà come `prossima`). I file li sposta l'app **al prossimo avvio, prima di accendere il server**, quando nessun file è in uso (`app/src/sposta.rs`, la pagina «Sposto i tuoi video»):

- la destinazione deve essere vuota o nuova, e non dentro la cartella attuale (né l'attuale dentro di lei); il dialogo rifiuta con la frase altrimenti. Scegliere la cartella in uso annulla uno spostamento chiesto. Con
  `MANGO_ANIMATION_LAVORO` non si sposta: la variabile vince;
- si guarda prima che nel disco di destinazione ci sia lo spazio (quanto pesa tutto); poi si copia a pezzi di 8 MB, con avanzamento (MB, file) e «Annulla lo spostamento», conservando la data di ogni file; i collegamenti
  simbolici (i video su un altro disco, `docs/ARCHIVIO.md`) si rifanno uguali, non si seguono;
- ogni file copiato è scritto sul disco, non lasciato alla memoria di Windows; si verifica che nella destinazione ci sia tutto: stesse voci, stesse misure di ogni file e stessi collegamenti. Solo allora la nuova cartella
  diventa quella ricordata (`lavoro.json` si scrive per intero o per niente) e solo dopo si tolgono gli originali, i contenuti prima delle cartelle. Se l'app si ferma (o il PC si spegne) mentre li toglie, la cartella ricordata è già la nuova, con tutto, e la
  vecchia resta come una copia da togliere a mano;
- se qualcosa non va (un file non si legge, il disco si riempie, la verifica non torna) o il creator annulla, gli originali restano dove erano, ciò che era stato copiato si toglie e la pagina lo dice con «Riprova» e «Continua con la
  cartella di prima» (che cancella lo spostamento chiesto). Una copia interrotta perché l'app è stata chiusa lascia nella destinazione un segno (`.mango-spostamento`): al tentativo dopo si svuota e si rifà da capo, mentre una
  cartella con dei file senza il segno non si tocca;
- se la copia è verificata ma qualche originale non si toglie (un altro programma lo tiene aperto) la nuova cartella vale lo stesso e la pagina elenca i file rimasti, da togliere a mano. Con un server già acceso (anche
  per un'altra app) lo spostamento aspetta il prossimo avvio vero.
