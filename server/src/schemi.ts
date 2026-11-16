import Ajv2020 from "ajv/dist/2020"
import { join } from "node:path"
import { problemiDiSchema, type NomiDelloSchema } from "./frasiSchema"
import { frase, type Testo } from "./lingua"

export const NOMI_SCHEMI = ["piano", "scheda", "grezzo", "profilo"] as const
export type NomeSchema = (typeof NOMI_SCHEMI)[number]

type Controllo = (dato: unknown) => Testo[]

const PROBLEMI_MOSTRATI = 6

/** I problemi di uno schema sono scritti con i nomi delle sue voci (`x-nomi`, per chi usa l'app): uno schema che non li ha non si compila. */
function compila(schema: object): Controllo {
  const valida = new Ajv2020({ allErrors: true }).addKeyword("x-nomi").compile(schema)
  const nomi = (schema as { "x-nomi"?: NomiDelloSchema })["x-nomi"]
  if (nomi === undefined) throw new Error("the schema has no x-nomi, the names of its entries that the sentences about its problems use")
  return (dato) => {
    if (valida(dato)) return []
    const frasi = [...new Map(problemiDiSchema(valida.errors ?? [], nomi).map((f) => [f.it, f])).values()]
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
