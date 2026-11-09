import { jsonDaTesto, NON_SI_LEGGE } from "./disco"
import type { Profilo } from "./indice"
import type { Testo } from "./lingua"
import type { Schemi } from "./schemi"

const èOggetto = (valore: unknown): valore is Record<string, unknown> => typeof valore === "object" && valore !== null && !Array.isArray(valore)

/** Il creator ha già un nome nel profilo: il primo giro (`.claude/skills/welcome`) è fatto. */
export const haUnCreator = (profilo: Record<string, unknown>): boolean => èOggetto(profilo["creator"]) && typeof profilo["creator"]["nome"] === "string"

/** I canali del profilo come li vede lo studio: la piattaforma e, se c'è, il nome. */
export function canaliDelProfilo(profilo: Record<string, unknown>): Array<{ piattaforma: string; nome?: string }> {
  const canali = profilo["canali"]
  if (!Array.isArray(canali)) return []
  return canali.filter(èOggetto).flatMap((c) => (typeof c["piattaforma"] === "string" ? [{ piattaforma: c["piattaforma"], ...(typeof c["nome"] === "string" ? { nome: c["nome"] } : {}) }] : []))
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
