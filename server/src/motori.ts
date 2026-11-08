// I motori del profilo (`docs/MOTORI.md`, §4): la sezione `motori` di `profilo.json`, che lo studio legge e scrive per intero.
import { join } from "node:path"
import { scrivi, testoJson } from "./disco"
import { ErroreConFrase, frase, nellaLinguaDi, type Testo } from "./lingua"
import type { Schemi } from "./schemi"

export class ErroreMotori extends ErroreConFrase {
  constructor(
    readonly stato: number,
    testo: Testo,
    readonly problemi: Testo[] = [],
  ) {
    super(testo)
  }
}

const èOggetto = (valore: unknown): valore is Record<string, unknown> => typeof valore === "object" && valore !== null && !Array.isArray(valore)

/** La sezione `motori` del profilo che il server tiene; `{}` se il profilo non la dice. */
export function motoriDelProfilo(profilo: Record<string, unknown>): Record<string, unknown> {
  const motori = profilo["motori"]
  return èOggetto(motori) ? motori : {}
}

/** La sezione `macchina` del profilo (`scheda_video`, `scheda_registrazione`, …): lo studio la guarda accanto a ciò che l'app dice del computer. `{}` se il profilo non la dice. */
export function macchinaDelProfilo(profilo: Record<string, unknown>): Record<string, unknown> {
  const macchina = profilo["macchina"]
  return èOggetto(macchina) ? macchina : {}
}

/** Scrive `motori` nel profilo al posto di quella di prima, dopo averlo fatto passare dallo schema: il resto del profilo resta com'è. */
export async function salvaMotori(motori: unknown, profilo: { testo: string | null; valore: Record<string, unknown> }, schemi: Schemi, lavoro: string): Promise<void> {
  if (!èOggetto(motori)) throw new ErroreMotori(400, frase("I motori devono essere un oggetto JSON: una voce per funzione.", "The engines must be a JSON object: one entry per function."))
  const nuovo = { ...(profilo.testo === null ? { versione: 1 } : profilo.valore), motori }
  const problemi = schemi.profilo(nuovo)
  if (problemi.length > 0) throw new ErroreMotori(400, frase(`I motori non sono validi: ${problemi.map((p) => nellaLinguaDi(p, "it")).join(" · ")}`, `The engines are not valid: ${problemi.map((p) => nellaLinguaDi(p, "en")).join(" · ")}`), problemi)
  await scrivi(join(lavoro, "profilo.json"), testoJson(nuovo))
}
