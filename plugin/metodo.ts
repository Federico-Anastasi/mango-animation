// Le regole di ogni passo del metodo, come testo per Claude Code (`docs/ARCHITETTURA.md`, «Il plugin»).
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

/** Dove stanno i file del metodo e la cartella di lavoro: i percorsi del metodo scritti nelle regole e nelle skill sono relativi alla prima. */
const testa = (radice: string, lavoro: string, n: number, di: number): string =>
  `Mango Animation method, part ${n} of ${di}. Its files are in ${radice} (read-only): the paths \`.claude/metodo/…\`, \`docs/…\`, \`animazioni/…\`, \`stile.json\` in the rules and skills are relative to that folder. The working folder is ${lavoro}.\n\n`

/** Una riga sola che introduce (un titolo, l'indicazione del file) resta con ciò che introduce: un pezzo non finisce su un titolo. */
function conLeTeste(paragrafi: string[]): string[] {
  const uniti: string[] = []
  let sospeso = ""
  for (const paragrafo of paragrafi) {
    const unita = sospeso === "" ? paragrafo : `${sospeso}\n\n${paragrafo}`
    if (/^(#|Contents of )[^\n]*$/.test(paragrafo)) sospeso = unita
    else {
      uniti.push(unita)
      sospeso = ""
    }
  }
  return sospeso === "" ? uniti : [...uniti, sospeso]
}

/** I pezzi di testo di un hook: i file del metodo, spezzati solo fra due paragrafi, ciascuno con la sua testa entro il limite. */
export function pezziDelMetodo(radice: string, lavoro: string): string[] {
  const spazio = LIMITE_DI_UN_HOOK - testa(radice, lavoro, 99, 99).length
  const paragrafi = fileDelMetodo(radice).flatMap((file) => conLeTeste([`Contents of ${file}:`, ...leggi(join(radice, file)).split(/\n{2,}/)]))
  const corpi: string[] = []
  let corrente = ""
  for (const paragrafo of paragrafi) {
    if (paragrafo.length > spazio) throw new Error(`Un paragrafo del metodo è lungo ${paragrafo.length} caratteri: non entra in un hook (${paragrafo.slice(0, 40)}…).`)
    if (corrente !== "" && corrente.length + paragrafo.length + 2 > spazio) {
      corpi.push(corrente)
      corrente = ""
    }
    corrente = corrente === "" ? paragrafo : `${corrente}\n\n${paragrafo}`
  }
  const tutti = corrente === "" ? corpi : [...corpi, corrente]
  return tutti.map((corpo, i) => testa(radice, lavoro, i + 1, tutti.length) + corpo)
}
