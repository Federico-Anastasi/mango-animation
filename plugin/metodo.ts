// Le regole sempre attive del metodo, come testo per Claude Code (`docs/ARCHITETTURA.md`, «Come il metodo arriva a Claude»).
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** Un hook non dà a Claude più di 10.000 caratteri: ciò che passa il limite non lo vede. */
export const LIMITE_DI_UN_HOOK = 10_000

const leggi = (percorso: string): string => readFileSync(percorso, "utf8").replaceAll("\r\n", "\n").trimEnd()

/** Il `CLAUDE.md` del metodo e le regole sempre caricate; quelle con `paths:` sono di chi sviluppa il codice, che le ha già. */
export function fileDelMetodo(radice: string): string[] {
  const regole = readdirSync(join(radice, ".claude", "rules"))
    .filter((f) => f.endsWith(".md") && !/^paths:/m.test(/^---\n([\s\S]*?)\n---/.exec(leggi(join(radice, ".claude", "rules", f)))?.[1] ?? ""))
    .sort()
    .map((f) => `.claude/rules/${f}`)
  return ["CLAUDE.md", ...regole]
}

/**
 * Il testo che l'hook dà a Claude: i file del metodo, con in testa dove stanno (i percorsi `.claude/metodo/…`, `docs/…`, `animazioni/…`,
 * `stile.json` delle regole e delle skill sono relativi a quella cartella) e qual è la cartella di lavoro.
 * Se non entra in un hook è un errore: un testo tagliato in silenzio lascerebbe Claude senza regole.
 */
export function testoDelMetodo(radice: string, lavoro: string): string {
  const testa = `Mango Animation method. Its files are in ${radice} (read-only): the paths \`.claude/metodo/…\`, \`docs/…\`, \`animazioni/…\`, \`stile.json\` in the rules and skills are relative to that folder. The working folder is ${lavoro}.\n\n`
  const testo = testa + fileDelMetodo(radice).map((file) => `Contents of ${file}:\n\n${leggi(join(radice, file))}`).join("\n\n")
  if (testo.length >= LIMITE_DI_UN_HOOK)
    throw new Error(`Le regole sempre attive del metodo sono lunghe ${testo.length} caratteri e un hook ne porta meno di ${LIMITE_DI_UN_HOOK}: sposta una regola in .claude/metodo/ (la leggono le skill) o accorciala.`)
  return testo
}
