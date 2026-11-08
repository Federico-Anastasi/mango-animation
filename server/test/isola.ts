// Caricato prima di ogni prova (`bunfig.toml`): un server o un motore lanciati dalle prove ereditano questo ambiente, e senza una
// cartella di Mango Code finta troverebbero quello vero sul computer e gli prenderebbero le schede.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env["MANGO_DATA"] = join(mkdtempSync(join(tmpdir(), "mango-code-finto-")), "dati")
