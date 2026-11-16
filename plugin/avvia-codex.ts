// Codex dal terminale con il metodo di Mango Animation (`docs/METODO.md`): `bun run <codice>/plugin/avvia-codex.ts [argomenti di Codex]`, dalla cartella di lavoro.
import { resolve } from "node:path"
import { argomentiDiCodex, collegaLeSkill, trovaCodex } from "./codex"
import { trovaLavoro, VARIABILE_LAVORO } from "./lavoro"

const radice = resolve(import.meta.dir, "..")
try {
  const lavoro = trovaLavoro(process.env, process.cwd(), radice)
  if (lavoro === null) throw new Error(`apri il terminale nella cartella di lavoro (quella con archivio/ dentro) o indicala con ${VARIABILE_LAVORO}.`)
  const programma = trovaCodex(process.env)
  collegaLeSkill(radice, lavoro)
  const figlio = Bun.spawn([programma, ...argomentiDiCodex(radice, lavoro, process.env), ...Bun.argv.slice(2)], { cwd: lavoro, stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  process.exit(await figlio.exited)
} catch (errore) {
  console.error(`Mango Animation: ${errore instanceof Error ? errore.message : String(errore)}`)
  process.exit(1)
}
