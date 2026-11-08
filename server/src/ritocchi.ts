// I ritocchi di un piano: cambiare un campo per percorso (`/scene/3/pezzi/0/dice`) invece di riscrivere il piano intero.
// Le operazioni sono quelle di JSON Patch che servono: replace, add, remove.
import { ErroreConFrase, frase } from "./lingua"

export class ErroreRitocco extends ErroreConFrase {}

type Contenitore = Record<string, unknown> | unknown[]

const OPERAZIONI = ["replace", "add", "remove"] as const

const contenitore = (v: unknown): v is Contenitore => typeof v === "object" && v !== null

function parti(percorso: unknown, n: number): string[] {
  if (percorso === "") throw new ErroreRitocco(frase(`ritocco ${n}: il percorso vuoto è il piano intero; per sostituirlo usa piano_scrivi (PUT del piano).`, `tweak ${n}: the empty path is the whole plan; to replace it use piano_scrivi (PUT of the plan).`))
  if (typeof percorso !== "string" || !percorso.startsWith("/")) throw new ErroreRitocco(frase(`ritocco ${n}: il percorso comincia con «/», come «/scene/0/pezzi/1/dice».`, `tweak ${n}: the path starts with «/», like «/scene/0/pezzi/1/dice».`))
  return percorso
    .slice(1)
    .split("/")
    .map((p) => p.replaceAll("~1", "/").replaceAll("~0", "~"))
}

function indice(lista: unknown[], parte: string, fino: number, n: number, percorso: string): number {
  const k = /^(0|[1-9]\d*)$/.test(parte) ? Number(parte) : -1
  if (k < 0 || k > fino) throw new ErroreRitocco(frase(`ritocco ${n}: in «${percorso}» l'indice «${parte}» non c'è: la lista ha ${lista.length} elementi (da 0).`, `tweak ${n}: in «${percorso}» the index «${parte}» does not exist: the list has ${lista.length} items (from 0).`))
  return k
}

/** Il piano coi ritocchi applicati in ordine, senza toccare quello dato; un ritocco che non si può fare è un errore che dice quale. */
export function applicaRitocchi(documento: unknown, ritocchi: unknown): unknown {
  if (!Array.isArray(ritocchi) || ritocchi.length === 0) throw new ErroreRitocco(frase("I ritocchi sono una lista non vuota di { op, path, value }.", "The tweaks are a non-empty list of { op, path, value }."))
  const radice = { piano: structuredClone(documento) }
  ritocchi.forEach((ritocco: unknown, i) => {
    const n = i + 1
    if (!contenitore(ritocco) || Array.isArray(ritocco)) throw new ErroreRitocco(frase(`ritocco ${n}: è un oggetto { op, path, value }.`, `tweak ${n}: it is an object { op, path, value }.`))
    const { op, path, value } = ritocco as { op?: unknown; path?: unknown; value?: unknown }
    if (!OPERAZIONI.includes(op as (typeof OPERAZIONI)[number])) throw new ErroreRitocco(frase(`ritocco ${n}: «op» è uno fra ${OPERAZIONI.join(", ")}.`, `tweak ${n}: «op» is one of ${OPERAZIONI.join(", ")}.`))
    if (op !== "remove" && !("value" in ritocco)) throw new ErroreRitocco(frase(`ritocco ${n}: «${String(op)}» vuole «value».`, `tweak ${n}: «${String(op)}» needs «value».`))
    const passi = ["piano", ...parti(path, n)]
    const ultimo = passi.pop()!
    let qui: unknown = radice
    for (const [i, passo] of passi.entries()) {
      const dentro = Array.isArray(qui) ? qui[indice(qui, passo, qui.length - 1, n, String(path))] : contenitore(qui) && passo in qui ? (qui as Record<string, unknown>)[passo] : undefined
      if (dentro === undefined) {
        // Un modello che non sa creare il campo riscrive il piano intero: gli si dice il ritocco che lo crea.
        const campo = String(path).split("/").slice(0, i + 1).join("/")
        throw new ErroreRitocco(
          frase(
            `ritocco ${n}: «${String(path)}» non c'è nel piano: manca «${passo}». Per crearlo: { op: "add", path: "${campo}", value: <il valore intero> }.`,
            `tweak ${n}: «${String(path)}» is not in the plan: «${passo}» is missing. To create it: { op: "add", path: "${campo}", value: <the whole value> }.`,
          ),
        )
      }
      if (!contenitore(dentro)) throw new ErroreRitocco(frase(`ritocco ${n}: «${String(path)}» non c'è nel piano: «${passo}» non contiene altro.`, `tweak ${n}: «${String(path)}» is not in the plan: «${passo}» holds nothing else.`))
      qui = dentro
    }
    const padre = qui as Contenitore
    if (Array.isArray(padre)) {
      if (op === "add") {
        padre.splice(ultimo === "-" ? padre.length : indice(padre, ultimo, padre.length, n, String(path)), 0, value)
        return
      }
      const k = indice(padre, ultimo, padre.length - 1, n, String(path))
      if (op === "replace") padre[k] = value
      else padre.splice(k, 1)
      return
    }
    if (op !== "add" && !(ultimo in padre)) throw new ErroreRitocco(frase(`ritocco ${n}: «${String(path)}» non c'è nel piano (manca «${ultimo}»).`, `tweak ${n}: «${String(path)}» is not in the plan («${ultimo}» is missing).`))
    if (op === "remove") delete padre[ultimo]
    else padre[ultimo] = value
  })
  return radice.piano
}
