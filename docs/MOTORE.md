# Il motore

Il motore (`python -m motore`) monta, controlla e compone. Come si lancia: `docs/motore/struttura.md`. Il documento è diviso per argomento in `docs/motore/`; ogni sezione qui sotto dice dove sta.

| comandi | dove |
|---|---|
| `prepara`, `prepara-file` | `docs/motore/materiali.md` |
| `prova`, `copertina`, `anteprima-proposta` | `docs/motore/materiali.md` |
| `valida`, `risolvi`, `monta`, `anteprima`, `leggero` | `docs/motore/montaggio.md` |
| `controlla`, `parole`, `foto`, `foto-girato`, `ascolta` | `docs/motore/controllo.md` |
| `pagina`, `carosello` | `docs/motore/pagine-e-carosello.md` |
| `detta` | `docs/motore/dettatura.md` |

## I moduli

I file di `motore/` e cosa fa ognuno. → `docs/motore/struttura.md`

## Cosa legge dallo stile

Le sezioni di `stile.json` che il motore usa. → `docs/motore/struttura.md`

## Cosa si tiene

I file di `lavoro/` e dei preparati, e `montaggio.json`. → `docs/motore/montaggio.md`

## La sagoma

Lo scontorno della persona, dove sta la testa, i pezzi di sagoma. → `docs/motore/sagoma.md`

## La voce pulita

La pulizia del rumore di fondo sulla voce montata. → `docs/motore/montaggio.md`

## Il piano che cambia mentre monta

L'impronta del piano riletta a ogni fase. → `docs/motore/montaggio.md`

## La copertina

La copertina composta nel primo fotogramma. → `docs/motore/materiali.md`

## Il formato e lo spazio

Verticale e orizzontale, i tratti su disco, le scritture a metà. → `docs/motore/montaggio.md`

## Il controllo

Il file `lavoro/controllo.json` e i controlli di `controlla`. → `docs/motore/controllo.md`

## Le animazioni

Il file di tempi e il comando con cui il motore chiede le scene ad `animazioni/`. → `docs/motore/materiali.md`

## Le pagine vere

La cattura delle pagine web e i ritagli per le scene. → `docs/motore/pagine-e-carosello.md`

## Il carosello

Le slide a mano, la base di partenza, la resa e i suoi avvisi. → `docs/motore/pagine-e-carosello.md`

## Gli errori

Un comando che non riesce scrive su stderr la riga `@errore` e, dopo, la frase dell'errore, anche su più righe (i problemi di un piano, uno per riga), ed esce con 1: dopo quella frase non scrive altro. Chi lancia il motore prende per errore tutte le righe che seguono l'ultima `@errore`, senza la riga stessa; se non c'è (il motore è caduto per un guasto suo, un programma lanciato dal motore) vale l'ultima riga di stderr. Le righe di avanzamento e gli avvisi stanno sullo stesso flusso, prima, e non fanno parte dell'errore. Il server lo fa in `server/src/coda.ts` (l'`errore` di un lavoro, `docs/api/lavori.md`) e in `server/src/mcp/processi.ts` (l'errore di uno strumento); il motore lo scrive in `main` di `motore/__main__.py`. Provato dai due lati: `motore/prove/test_comandi.py`, `server/test/coda.test.ts`, `server/test/mcp.test.ts`.

## La lingua delle frasi

Le frasi del motore nelle due lingue. → `docs/motore/struttura.md`

## La dettatura

Il processo `detta` dell'app: dove gira, il protocollo, le frasi. → `docs/motore/dettatura.md`
