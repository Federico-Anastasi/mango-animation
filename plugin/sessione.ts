// Gli hook di avvio del plugin: `ambiente` prepara la shell di Claude per il motore, `metodo <n>` dà a Claude il pezzo `n` delle regole.
import { appendFileSync } from "node:fs"
import { delimiter, resolve } from "node:path"
import { trovaLavoro, VARIABILE_LAVORO } from "./lavoro"
import { pezziDelMetodo } from "./metodo"

const [comando, numero] = Bun.argv.slice(2)
if (comando !== "metodo" && comando !== "ambiente") {
  console.error(`Mango Animation: il comando «${comando ?? ""}» del plugin non esiste.`)
  process.exit(1)
}

const radice = resolve(import.meta.dir, "..")
const lavoro = trovaLavoro(process.env, process.cwd(), radice)
const inShell = (valore: string): string => `'${valore.replaceAll("\\", "/").replaceAll("'", "'\''")}'`

// Fuori da una cartella di lavoro il plugin non dice e non cambia niente.
if (lavoro !== null && comando === "metodo") {
  const pezzo = pezziDelMetodo(radice, lavoro)[Number(numero) - 1]
  if (pezzo !== undefined) console.log(pezzo)
}
if (lavoro !== null && comando === "ambiente" && process.env["CLAUDE_ENV_FILE"]) {
  const python = (process.env["PYTHONPATH"] ?? "").split(delimiter).filter(Boolean)
  const righe = [`export ${VARIABILE_LAVORO}=${inShell(lavoro)}`]
  if (!python.some((p) => resolve(p) === radice)) righe.push(`export PYTHONPATH=${inShell([radice, ...python].join(delimiter))}`)
  appendFileSync(process.env["CLAUDE_ENV_FILE"], righe.join("\n") + "\n")
}
