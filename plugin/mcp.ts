// Il server MCP «video» come lo accende il plugin: trova la cartella di lavoro, poi è lo stesso server di `bun run --cwd server mcp`.
import { resolve } from "node:path"
import { trovaLavoro, VARIABILE_LAVORO } from "./lavoro"

const radice = resolve(import.meta.dir, "..")
const lavoro = trovaLavoro(process.env, process.cwd(), radice)
if (lavoro === null) {
  console.error(`Mango Animation: apri Claude Code nella cartella di lavoro (quella con archivio/ dentro) o indicala con ${VARIABILE_LAVORO}.`)
  process.exit(1)
}
process.env[VARIABILE_LAVORO] = lavoro
await import("../server/src/mcp/avvia")
