import Ajv2020 from "ajv/dist/2020"
import type { ErrorObject } from "ajv/dist/2020"
import { join } from "node:path"
import { problemiDelProfilo, type NomiDelProfilo } from "./frasiProfilo"
import { frase, type Frase, type Testo } from "./lingua"

export const NOMI_SCHEMI = ["piano", "scheda", "grezzo", "profilo"] as const
export type NomeSchema = (typeof NOMI_SCHEMI)[number]

type Controllo = (dato: unknown) => Testo[]

const NOMI_TIPO: Record<string, Frase> = {
  object: frase("un oggetto", "an object"),
  array: frase("un elenco", "a list"),
  string: frase("un testo", "text"),
  number: frase("un numero", "a number"),
  integer: frase("un numero intero", "a whole number"),
  boolean: frase("vero o falso", "true or false"),
}

const PROBLEMI_MOSTRATI = 6

function posto(puntatore: string): Frase {
  const parti = puntatore.split("/").slice(1)
  if (parti.length === 0) return frase("il documento", "the document")
  const percorso = parti.reduce((qui, parte) => (/^\d+$/.test(parte) ? `${qui}[${parte}]` : qui ? `${qui}.${parte}` : parte), "")
  return frase(percorso, percorso)
}

function cosa(e: ErrorObject): Frase {
  const p = e.params as Record<string, unknown>
  switch (e.keyword) {
    case "required":
      return frase(`manca «${String(p["missingProperty"])}»`, `«${String(p["missingProperty"])}» is missing`)
    case "additionalProperties":
      return frase(`«${String(p["additionalProperty"])}» non è una chiave ammessa`, `«${String(p["additionalProperty"])}» is not an allowed key`)
    case "type": {
      const tipo = NOMI_TIPO[String(p["type"])]
      return frase(`deve essere ${tipo?.it ?? String(p["type"])}`, `must be ${tipo?.en ?? String(p["type"])}`)
    }
    case "enum": {
      const ammessi = (p["allowedValues"] as unknown[]).join(", ")
      return frase(`deve essere uno fra: ${ammessi}`, `must be one of: ${ammessi}`)
    }
    case "const":
      return frase(`deve essere ${JSON.stringify(p["allowedValue"])}`, `must be ${JSON.stringify(p["allowedValue"])}`)
    case "minimum":
      return frase(`non può essere meno di ${String(p["limit"])}`, `cannot be less than ${String(p["limit"])}`)
    case "maximum":
      return frase(`non può essere più di ${String(p["limit"])}`, `cannot be more than ${String(p["limit"])}`)
    case "exclusiveMinimum":
      return frase(`deve essere più di ${String(p["limit"])}`, `must be more than ${String(p["limit"])}`)
    case "minLength":
      return frase("non può essere vuoto", "cannot be empty")
    case "pattern":
      return frase("non ha il formato giusto", "is not in the right format")
    case "propertyNames":
      return frase(`il nome «${String(p["propertyName"])}» non va bene`, `the name «${String(p["propertyName"])}» is not allowed`)
    case "minItems":
      return frase(`deve avere almeno ${String(p["limit"])} elementi`, `must have at least ${String(p["limit"])} items`)
    case "maxItems":
    case "items":
      return frase(`deve avere al più ${String(p["limit"])} elementi`, `must have at most ${String(p["limit"])} items`)
    case "uniqueItems":
      return frase("non può avere elementi ripetuti", "cannot have repeated items")
    case "minProperties":
      return frase(`deve avere almeno ${String(p["limit"])} voci`, `must have at least ${String(p["limit"])} entries`)
    case "maxProperties":
      return frase(`deve avere al più ${String(p["limit"])} voci`, `must have at most ${String(p["limit"])} entries`)
    case "dependentRequired":
      return frase(`con «${String(p["property"])}» serve anche «${String(p["missingProperty"])}»`, `with «${String(p["property"])}» you also need «${String(p["missingProperty"])}»`)
    case "oneOf":
    case "anyOf":
      return frase("non ha nessuna delle forme ammesse", "does not match any of the allowed forms")
    case "not":
      return frase("mette insieme chiavi che non vanno usate insieme", "combines keys that cannot be used together")
    default:
      return frase(`non è valido (${e.keyword})`, `is not valid (${e.keyword})`)
  }
}

function problema(e: ErrorObject): Frase {
  const dove = posto(e.instancePath)
  const motivo = cosa(e)
  return frase(`${dove.it}: ${motivo.it}`, `${dove.en}: ${motivo.en}`)
}

/** Con `x-nomi` nello schema (i nomi delle voci per chi usa l'app) i problemi sono scritti con quei nomi, come per il profilo. */
function compila(schema: object): Controllo {
  const valida = new Ajv2020({ allErrors: true }).addKeyword("x-nomi").compile(schema)
  const nomi = (schema as { "x-nomi"?: NomiDelProfilo })["x-nomi"]
  return (dato) => {
    if (valida(dato)) return []
    const errori = valida.errors ?? []
    const frasi = [...new Map((nomi ? problemiDelProfilo(errori, nomi) : errori.map(problema)).map((f) => [f.it, f])).values()]
    if (frasi.length <= PROBLEMI_MOSTRATI) return frasi
    const altri = frasi.length - PROBLEMI_MOSTRATI
    return [...frasi.slice(0, PROBLEMI_MOSTRATI), frase(`e altri ${altri} problemi`, `and ${altri} more problems`)]
  }
}

export interface EsitoRicarica {
  /** Gli schemi il cui file è cambiato e si è compilato: chi li usa va rivalidato. */
  cambiati: NomeSchema[]
  /** Quelli il cui file non si legge o non compila: restano come erano, con la frase che dice perché. */
  rotti: string[]
}

/**
 * Gli schemi di `motore/schemi/`. Ognuno dei metodi dà la lista dei problemi, ognuno nelle due lingue; vuota se il dato è valido.
 * `ricarica` li rilegge dal disco: uno schema che non si legge o non compila lascia in uso l'ultimo buono.
 */
export class Schemi {
  private constructor(
    private readonly cartella: string,
    private readonly controlli: Record<NomeSchema, Controllo>,
    private readonly testi: Record<NomeSchema, string>,
  ) {}

  static async carica(cartella: string): Promise<Schemi> {
    const testi = Object.fromEntries(await Promise.all(NOMI_SCHEMI.map(async (nome) => [nome, await Bun.file(join(cartella, `${nome}.schema.json`)).text()]))) as Record<NomeSchema, string>
    const controlli = Object.fromEntries(NOMI_SCHEMI.map((nome) => [nome, compila(JSON.parse(testi[nome]) as object)])) as Record<NomeSchema, Controllo>
    return new Schemi(cartella, controlli, testi)
  }

  piano = (dato: unknown): Testo[] => this.controlli.piano(dato)
  scheda = (dato: unknown): Testo[] => this.controlli.scheda(dato)
  grezzo = (dato: unknown): Testo[] => this.controlli.grezzo(dato)
  profilo = (dato: unknown): Testo[] => this.controlli.profilo(dato)

  async ricarica(): Promise<EsitoRicarica> {
    const esito: EsitoRicarica = { cambiati: [], rotti: [] }
    for (const nome of NOMI_SCHEMI) {
      const file = join(this.cartella, `${nome}.schema.json`)
      try {
        const testo = await Bun.file(file).text()
        if (testo === this.testi[nome]) continue
        this.controlli[nome] = compila(JSON.parse(testo) as object)
        this.testi[nome] = testo
        esito.cambiati.push(nome)
      } catch (errore) {
        esito.rotti.push(`${nome}.schema.json: ${errore instanceof Error ? errore.message : String(errore)}`)
      }
    }
    return esito
  }
}
