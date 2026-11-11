import { join } from "node:path"
import { eOggetto, jsonDaTesto, NON_SI_LEGGE, scrivi, testoJson } from "./disco"
import type { Profilo } from "./indice"
import { ErroreConFrase, frase, nellaLinguaDi, type Testo } from "./lingua"
import type { Schemi } from "./schemi"

export class ErroreProfilo extends ErroreConFrase {
  constructor(
    readonly stato: number,
    testo: Testo,
    readonly problemi: Testo[] = [],
  ) {
    super(testo)
  }
}

/** Le sezioni di `profilo.json` che lo studio mostra e corregge nella pagina del profilo (`motori` e `macchina` hanno la loro pagina). */
const SEZIONI_DEL_CREATOR = ["creator", "pubblico", "canali", "non_si_dice"] as const

/** Le sezioni del creator come sono nel profilo valido che il server tiene; quelle che il profilo non dice mancano. */
export const sezioniDelCreator = (profilo: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(SEZIONI_DEL_CREATOR.flatMap((nome) => (profilo[nome] === undefined ? [] : [[nome, profilo[nome]]])))

/**
 * Scrive in `profilo.json` le sezioni date al posto di quelle di prima (`null` toglie una sezione), dopo averlo fatto passare dallo schema:
 * il resto del profilo resta com'è, e senza profilo lo crea.
 */
export async function salvaSezioniDelCreator(sezioni: unknown, profilo: { testo: string | null; valore: Record<string, unknown> }, schemi: Schemi, lavoro: string): Promise<void> {
  if (!eOggetto(sezioni)) throw new ErroreProfilo(400, frase("Il profilo deve essere un oggetto JSON: una voce per sezione.", "The profile must be a JSON object: one entry per section."))
  const estranee = Object.keys(sezioni).filter((nome) => !(SEZIONI_DEL_CREATOR as readonly string[]).includes(nome))
  if (estranee.length > 0) {
    throw new ErroreProfilo(400, frase(`Da qui si cambiano solo ${SEZIONI_DEL_CREATOR.join(", ")}: «${estranee.join(", ")}» non si può.`, `Only ${SEZIONI_DEL_CREATOR.join(", ")} can be changed from here: "${estranee.join(", ")}" cannot.`))
  }
  const nuovo: Record<string, unknown> = { ...(profilo.testo === null ? { versione: 1 } : profilo.valore), ...sezioni }
  for (const nome of SEZIONI_DEL_CREATOR) if (nuovo[nome] === null) delete nuovo[nome]
  const problemi = schemi.profilo(nuovo)
  if (problemi.length > 0) throw new ErroreProfilo(400, frase(`Il profilo non è valido: ${problemi.map((p) => nellaLinguaDi(p, "it")).join(" · ")}`, `The profile is not valid: ${problemi.map((p) => nellaLinguaDi(p, "en")).join(" · ")}`), problemi)
  await scrivi(join(lavoro, "profilo.json"), testoJson(nuovo))
}

/** Il creator ha già un nome nel profilo: il primo giro (`.claude/skills/welcome`) è fatto. */
export const haUnCreator = (profilo: Record<string, unknown>): boolean => eOggetto(profilo["creator"]) && typeof profilo["creator"]["nome"] === "string"

/** I canali del profilo come li vede lo studio: la piattaforma e, se c'è, il nome. */
export function canaliDelProfilo(profilo: Record<string, unknown>): Array<{ piattaforma: string; nome?: string }> {
  const canali = profilo["canali"]
  if (!Array.isArray(canali)) return []
  return canali.filter(eOggetto).flatMap((c) => (typeof c["piattaforma"] === "string" ? [{ piattaforma: c["piattaforma"], ...(typeof c["nome"] === "string" ? { nome: c["nome"] } : {}) }] : []))
}

/** Il profilo scritto in `testo` (`null`: il file non c'è, e il profilo è vuoto), oppure i problemi che lo rendono inutilizzabile. */
export function giudicaProfilo(testo: string | null, schemi: Schemi): { profilo: Profilo } | { problemi: Testo[] } {
  if (testo === null) return { profilo: { testo, valore: {} } }
  const letto = jsonDaTesto(testo)
  if (!letto) return { problemi: [NON_SI_LEGGE] }
  const problemi = schemi.profilo(letto.valore)
  if (problemi.length > 0) return { problemi }
  return { profilo: { testo, valore: letto.valore as Record<string, unknown> } }
}
