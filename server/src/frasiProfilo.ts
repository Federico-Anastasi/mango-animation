// I problemi di un profilo che non passa lo schema, scritti per chi usa l'app: quale cosa del profilo non va e come deve essere, senza nomi di campi né tipi.
// I nomi delle voci vengono dal blocco `x-nomi` di `motore/schemi/profilo.schema.json`, lo stesso che legge il motore (`motore/profilo.py`).
import type { ErrorObject } from "ajv/dist/2020"
import { frase, type Frase } from "./lingua"

interface Parole {
  it: string
  en: string
}

export interface Nome extends Parole {
  /** L'italiano è femminile: serve agli aggettivi («vuota», «negativa»). */
  f?: boolean
  /** La voce con la preposizione, per dire cosa c'è in più dentro di lei. */
  dentro?: Parole
  /** Com'è fatto il valore, dove il tipo non basta. */
  forma?: Parole
}

export type NomiDelProfilo = Record<string, Nome>

const TIPI: Record<string, Parole> = {
  string: { it: "un testo", en: "text" },
  integer: { it: "un numero intero", en: "a whole number" },
  number: { it: "un numero", en: "a number" },
  boolean: { it: "sì o no", en: "yes or no" },
  array: { it: "un elenco", en: "a list" },
  object: { it: "un gruppo di voci", en: "a group of entries" },
}

const maiuscola = (testo: string): string => testo.charAt(0).toUpperCase() + testo.slice(1)

const eNumero = (parte: string): boolean => /^\d+$/.test(parte)

/** Il nome della voce che sta in `parti` (un percorso dentro il profilo), con i numeri d'ordine al posto di {1}, {2}. */
function nomeDi(nomi: NomiDelProfilo, parti: string[]): Nome {
  const chiave = parti.map((p) => (eNumero(p) ? "*" : p)).join("/")
  const numeri = parti.filter(eNumero).map((p) => String(Number(p) + 1))
  const nome = nomi[chiave]
  if (nome === undefined) return { it: `una voce del profilo (${chiave})`, en: `an entry of the profile (${chiave})`, f: true }
  const metti = (testo: string): string => testo.replace(/\{(\d)\}/g, (_, n: string) => numeri[Number(n) - 1] ?? "")
  return { ...nome, it: metti(nome.it), en: metti(nome.en) }
}

const elenco = (valori: string[], o: string): string => (valori.length < 2 ? (valori[0] ?? "") : `${valori.slice(0, -1).join(", ")} ${o} ${valori.at(-1)}`)

function comeDeveEssere(tipi: string[], nome: Nome): Frase {
  const noti = tipi.filter((t) => t !== "null").map((t) => TIPI[t] ?? { it: t, en: t })
  const vuoto = tipi.includes("null")
  const it = [noti.map((t) => t.it).join(" o "), ...(vuoto ? [`o ${nome.f ? "vuota" : "vuoto"}`] : [])].filter((x) => x !== "").join(", ")
  const en = [noti.map((t) => t.en).join(" or "), ...(vuoto ? ["or empty"] : [])].filter((x) => x !== "").join(", ")
  return frase(`deve essere ${it}`, `must be ${en}`)
}

function problema(e: ErrorObject, nomi: NomiDelProfilo): Frase {
  const p = e.params as Record<string, unknown>
  const parti = e.instancePath.split("/").slice(1)
  const nome = nomeDi(nomi, parti)
  const soggetto = (cosa: Frase): Frase => frase(`${maiuscola(nome.it)} ${cosa.it}.`, `${maiuscola(nome.en)} ${cosa.en}.`)
  switch (e.keyword) {
    case "required": {
      const mancante = nomeDi(nomi, [...parti, String(p["missingProperty"])])
      return frase(`Manca ${mancante.it}.`, `${maiuscola(mancante.en)} is missing.`)
    }
    case "additionalProperties": {
      const chiave = String(p["additionalProperty"])
      const dove = nome.dentro ?? { it: `in ${nome.it}`, en: `in ${nome.en}` }
      return frase(`${maiuscola(dove.it)} c'è «${chiave}», che non conosco: toglila.`, `${maiuscola(dove.en)} there is «${chiave}», which I do not know: remove it.`)
    }
    case "type":
      return soggetto(comeDeveEssere(String(p["type"]).split(","), nome))
    case "enum": {
      const valori = (p["allowedValues"] as unknown[]).map((v) => `«${String(v)}»`)
      return frase(`${maiuscola(nome.it)} non va bene: puoi scegliere ${elenco(valori, "o")}.`, `${maiuscola(nome.en)} is not valid: you can choose ${elenco(valori, "or")}.`)
    }
    case "const":
      return soggetto(frase(`deve essere ${JSON.stringify(p["allowedValue"])}`, `must be ${JSON.stringify(p["allowedValue"])}`))
    case "minimum":
      return soggetto(p["limit"] === 0 ? frase(`non può essere ${nome.f ? "negativa" : "negativo"}`, "cannot be negative") : frase(`non può essere meno di ${String(p["limit"])}`, `cannot be less than ${String(p["limit"])}`))
    case "minLength":
      return soggetto(frase(`non può essere ${nome.f ? "vuota" : "vuoto"}`, "cannot be empty"))
    case "pattern":
    case "anyOf":
      return soggetto(nome.forma ? frase(`deve essere ${nome.forma.it}`, `must be ${nome.forma.en}`) : frase("non è scritto nel modo giusto", "is not written the right way"))
    default:
      return soggetto(frase("non è valido", "is not valid"))
  }
}

/** I problemi di ajv sul profilo, uno per frase; le prove fallite dentro un `anyOf` si riassumono nella frase del `anyOf`. */
export function problemiDelProfilo(errori: ErrorObject[], nomi: NomiDelProfilo): Frase[] {
  const alternative = errori.filter((e) => e.keyword === "anyOf").map((e) => `${e.schemaPath}/`)
  return errori.filter((e) => !alternative.some((a) => e.schemaPath.startsWith(a))).map((e) => problema(e, nomi))
}
