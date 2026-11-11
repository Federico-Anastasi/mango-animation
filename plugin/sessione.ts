// Gli hook di avvio del plugin: `ambiente` prepara la shell di Claude per il motore, `metodo` gli dà le regole sempre attive.
import { appendFileSync } from "node:fs"
import { delimiter, resolve } from "node:path"
import { trovaLavoro, VARIABILE_LAVORO } from "./lavoro"
import { testoDelMetodo } from "./metodo"

const [comando] = Bun.argv.slice(2)
if (comando !== "metodo" && comando !== "ambiente") {
  console.error(`Mango Animation: il comando «${comando ?? ""}» del plugin non esiste.`)
  process.exit(1)
}

const radice = resolve(import.meta.dir, "..")
const lavoro = trovaLavoro(process.env, process.cwd(), radice)
const inShell = (valore: string): string => `'${valore.replaceAll("\\", "/").replaceAll("'", "'\''")}'`

// Fuori da una cartella di lavoro il plugin non dice e non cambia niente.
if (lavoro !== null && comando === "metodo") {
  try {
    console.log(testoDelMetodo(radice, lavoro))
  } catch (errore) {
    console.error(`Mango Animation: ${errore instanceof Error ? errore.message : String(errore)}`)
    process.exit(1)
  }
}
if (lavoro !== null && comando === "ambiente" && process.env["CLAUDE_ENV_FILE"]) {
  const python = (process.env["PYTHONPATH"] ?? "").split(delimiter).filter(Boolean)
  const righe = [`export ${VARIABILE_LAVORO}=${inShell(lavoro)}`]
  if (!python.some((p) => resolve(p) === radice)) righe.push(`export PYTHONPATH=${inShell([radice, ...python].join(delimiter))}`)
  appendFileSync(process.env["CLAUDE_ENV_FILE"], righe.join("\n") + "\n")
}
