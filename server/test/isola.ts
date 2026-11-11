// Caricato prima di ogni prova (`bunfig.toml`): un server o un motore lanciati dalle prove ereditano questo ambiente, e senza una
// cartella di Mango Code finta troverebbero quello vero sul computer e gli prenderebbero le schede.
// Il tempo massimo di una prova (30 s invece dei 5 di Bun) è una guardia contro le prove che si piantano, non una misura: a computer
// carico un avvio del server che dura mezzo secondo ne impiega dieci.
import { setDefaultTimeout } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env["MANGO_DATA"] = join(mkdtempSync(join(tmpdir(), "mango-code-finto-")), "dati")
setDefaultTimeout(30_000)
