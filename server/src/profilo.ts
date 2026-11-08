import { jsonDaTesto, NON_SI_LEGGE } from "./disco"
import type { Profilo } from "./indice"
import type { Testo } from "./lingua"
import type { Schemi } from "./schemi"

/** Il profilo scritto in `testo` (`null`: il file non c'è, e il profilo è vuoto), oppure i problemi che lo rendono inutilizzabile. */
export function giudicaProfilo(testo: string | null, schemi: Schemi): { profilo: Profilo } | { problemi: Testo[] } {
  if (testo === null) return { profilo: { testo, valore: {} } }
  const letto = jsonDaTesto(testo)
  if (!letto) return { problemi: [NON_SI_LEGGE] }
  const problemi = schemi.profilo(letto.valore)
  if (problemi.length > 0) return { problemi }
  return { profilo: { testo, valore: letto.valore as Record<string, unknown> } }
}
