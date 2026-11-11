// I motori del profilo (`docs/MOTORI.md`, §4): la sezione `motori` di `profilo.json`, che lo studio legge e scrive per intero.
import { join } from "node:path"
import { eOggetto, scrivi, testoJson } from "./disco"
import { frase, nellaLinguaDi } from "./lingua"
import { ErroreProfilo } from "./profilo"
import type { Schemi } from "./schemi"

/** La sezione `motori` del profilo che il server tiene; `{}` se il profilo non la dice. */
export function motoriDelProfilo(profilo: Record<string, unknown>): Record<string, unknown> {
  const motori = profilo["motori"]
  return eOggetto(motori) ? motori : {}
}

/** La sezione `macchina` del profilo (`scheda_video`, `scheda_registrazione`, …): lo studio la guarda accanto a ciò che l'app dice del computer. `{}` se il profilo non la dice. */
export function macchinaDelProfilo(profilo: Record<string, unknown>): Record<string, unknown> {
  const macchina = profilo["macchina"]
  return eOggetto(macchina) ? macchina : {}
}

/** Scrive `motori` nel profilo al posto di quella di prima, dopo averlo fatto passare dallo schema: il resto del profilo resta com'è. */
export async function salvaMotori(motori: unknown, profilo: { testo: string | null; valore: Record<string, unknown> }, schemi: Schemi, lavoro: string): Promise<void> {
  if (!eOggetto(motori)) throw new ErroreProfilo(400, frase("I motori devono essere un oggetto JSON: una voce per funzione.", "The engines must be a JSON object: one entry per function."))
  const nuovo = { ...(profilo.testo === null ? { versione: 1 } : profilo.valore), motori }
  const problemi = schemi.profilo(nuovo)
  if (problemi.length > 0) throw new ErroreProfilo(400, frase(`I motori non sono validi: ${problemi.map((p) => nellaLinguaDi(p, "it")).join(" · ")}`, `The engines are not valid: ${problemi.map((p) => nellaLinguaDi(p, "en")).join(" · ")}`), problemi)
  await scrivi(join(lavoro, "profilo.json"), testoJson(nuovo))
}
