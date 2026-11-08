// Le frasi che il server dice a chi lo usa, nella lingua dello studio (`docs/API.md`, «La lingua delle frasi»). Chi scrive una frase la scrive
// nelle due lingue nel punto in cui nasce, come lo studio con `t("italiano", "inglese")`; la lingua la dice ogni richiesta (`X-Lingua`) e la frase
// diventa il testo giusto quando la risposta viene scritta. Senza intestazione, o con una lingua che non c'è: italiano, come lo leggono Claude e il terminale.
import { AsyncLocalStorage } from "node:async_hooks"

export type Lingua = "it" | "en"

export const INTESTAZIONE_LINGUA = "x-lingua"

const richiesta = new AsyncLocalStorage<Lingua>()

/** La lingua della richiesta in corso; `undefined` fuori da una richiesta. */
export const linguaDellaRichiesta = (): Lingua | undefined => richiesta.getStore()

/** La lingua della richiesta in corso, italiano fuori da una richiesta. */
export const linguaInUso = (): Lingua => linguaDellaRichiesta() ?? "it"

/** Fa girare `lavoro` (e tutto ciò che avvia) con la lingua della richiesta: le frasi scritte in JSON lì dentro escono in quella lingua. */
export const nellaLingua = <T>(lingua: Lingua, lavoro: () => T): T => richiesta.run(lingua, lavoro)

export const haLingua = (req: Request): boolean => req.headers.has(INTESTAZIONE_LINGUA)

export const linguaDi = (req: Request): Lingua => (req.headers.get(INTESTAZIONE_LINGUA)?.trim().toLowerCase() === "en" ? "en" : "it")

export class Frase {
  constructor(
    readonly it: string,
    readonly en: string,
  ) {}

  in(lingua: Lingua): string {
    return lingua === "en" ? this.en : this.it
  }

  /** L'italiano: per i log del terminale e per chi la mette in un testo. */
  toString(): string {
    return this.it
  }

  toJSON(): string {
    return this.in(linguaInUso())
  }
}

/** Una frase nelle due lingue: `frase("Manca il titolo.", "The title is missing.")`. */
export const frase = (it: string, en: string): Frase => new Frase(it, en)

/** Una frase già scritta (non tradotta) o nelle due lingue. */
export type Testo = string | Frase

export const italiano = (testo: Testo): string => (typeof testo === "string" ? testo : testo.it)

export const nellaLinguaDi = (testo: Testo, lingua: Lingua): string => (typeof testo === "string" ? testo : testo.in(lingua))

/** Un errore la cui frase può essere nelle due lingue; `message` è l'italiano. */
export class ErroreConFrase extends Error {
  readonly testo: Testo
  constructor(testo: Testo) {
    super(italiano(testo))
    this.testo = testo
  }
}
