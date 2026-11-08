// Cosa è «testo visibile» nel sorgente: il testo dentro i tag JSX, gli attributi che si leggono (titolo, etichetta,
// suggerimento, segnaposto, descrizione), le frasi degli errori che arrivano a schermo e i nomi in italiano
// delle tabelle. Il resto (nomi di classi, di campi, di rotte) non è testo che una persona legge.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export interface TestoVisibile {
  file: string
  testo: string
}

const RADICE = join(import.meta.dirname, "..", "src")

function file(cartella: string): string[] {
  return readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome)
    if (statSync(percorso).isDirectory()) return file(percorso)
    return /\.(tsx?|ts)$/.test(nome) ? [percorso] : []
  })
}

const LETTERALE = String.raw`"((?:[^"\\\n]|\\.)*)"`
const CHIAMATA_T = new RegExp(String.raw`(?<![\w.$])t\(\s*${LETTERALE}\s*,\s*${LETTERALE}\s*[,)]`, "g")
const OGNI_T = /(?<![\w.$])t\((?!\))/g

export interface TestoTradotto {
  file: string
  italiano: string
  inglese: string
}

/** Le chiamate `t("italiano", "inglese")` del sorgente, e quelle `t(` che non hanno la forma ammessa (due testi fra virgolette doppie, scritti per esteso). */
export function testiTradotti(): { tradotti: TestoTradotto[]; malformati: string[] } {
  const tradotti: TestoTradotto[] = []
  const malformati: string[] = []
  for (const percorso of file(RADICE)) {
    const sorgente = readFileSync(percorso, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    const nome = relative(RADICE, percorso).replace(/\\/g, "/")
    const buone = [...sorgente.matchAll(CHIAMATA_T)]
    for (const m of buone) tradotti.push({ file: nome, italiano: m[1]!, inglese: m[2]! })
    const tutte = [...sorgente.matchAll(OGNI_T)].length
    if (tutte !== buone.length && nome !== "lingua.ts") malformati.push(`${nome}: ${tutte - buone.length} chiamate a t() senza due testi fra virgolette doppie`)
  }
  return { tradotti, malformati }
}

function pulito(testo: string): string {
  return testo.replace(/\$\{[^}]*\}/g, "…").replace(/\s+/g, " ").trim()
}

export function testiVisibili(): TestoVisibile[] {
  return file(RADICE).flatMap((percorso) => {
    const sorgente = readFileSync(percorso, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/=>/g, "=#")
    const nome = relative(RADICE, percorso).replace(/\\/g, "/")
    const trovati: string[] = []
    if (percorso.endsWith(".tsx")) {
      for (const m of sorgente.matchAll(/>([^<>{}=;]*[A-Za-zÀ-ú][^<>{}=;]*)</g)) if (!/(?:const|return|let|import|export)/.test(m[1]!)) trovati.push(m[1]!)
      for (const m of sorgente.matchAll(/\b(?:aria-label|title|placeholder|alt|etichetta|titolo|aiuto)=(?:"([^"]+)"|\{`([^`]+)`\})/g)) trovati.push(m[1] ?? m[2]!)
      for (const m of sorgente.matchAll(/\b(?:etichetta|titolo|testo): "([^"]+)"/g)) trovati.push(m[1]!)
    }
    for (const m of sorgente.matchAll(/\b(?:no|setErrore|comunica|setMessaggio)\(\s*[`"]([^`"]+)[`"]/g)) trovati.push(m[1]!)
    for (const m of sorgente.matchAll(/new (?:Error|ErroreApi)\(\s*[`"]([^`"]+)[`"]/g)) trovati.push(m[1]!)
    for (const m of sorgente.matchAll(/const MOTIVO_[A-Z_]+ = \([^)]*\) => `([^`]+)`/g)) trovati.push(m[1]!)
    for (const m of sorgente.matchAll(/(?:const|export const) (?:NOME_[A-Z]+|MODI)[^=]*=\s*[{[]([\s\S]*?)[}\]]\s*(?:as const|satisfies|\n)/g)) for (const v of m[1]!.matchAll(/(?:nome:\s*|:\s*)"([^"]+)"/g)) trovati.push(v[1]!)
    return trovati.map(pulito).filter(Boolean).map((testo) => ({ file: nome, testo }))
  }).concat(testiTradotti().tradotti.map((x) => ({ file: x.file, testo: pulito(x.italiano) })))
}

/** Ciò che in un testo a schermo non deve comparire: nomi di file di dati, percorsi, comandi, parole inglesi d'interfaccia,
 * nomi interni. Le descrizioni sono categorie, non l'elenco dei nomi. */
export const DIVIETI: Array<{ nome: string; regola: RegExp }> = [
  { nome: "un nome di file di dati", regola: /\b[\w-]+\.(?:json|jsonl|yaml|toml|md)\b/i },
  { nome: "un percorso", regola: /(?:[A-Za-z]:\\|\/(?:api|media|font)\/|\b\w+\/\w+\.\w+\b)/ },
  { nome: "un comando", regola: /\b(?:python|bun|npm|ffmpeg|node|git|pytest)\b/i },
  { nome: "uno slug con trattini", regola: /\b[a-z0-9]+-[a-z0-9]+-[a-z0-9]+\b/ },
  { nome: "una parola inglese d'interfaccia", regola: /\b(?:loading|error|submit|cancel|save|delete|undo|redo|click|button|reset|apply|close|search|filter|settings|dashboard|upload|download|timeline|preview|playhead|trim|split|clip|render)\b/i },
  { nome: "una sigla interna", regola: /\b(?:EDL|SSE|JSON|API|payload|endpoint|EventSource|stdout|stderr|slug)\b/ },
  { nome: "una parola del gergo del montaggio", regola: /testina/i },
  { nome: "il nome di un campo interno", regola: /\b(?:risolto|risolvi|nella_sorgente|legato|rifila|sfasamento|piano_risolto)\b/ },
]
