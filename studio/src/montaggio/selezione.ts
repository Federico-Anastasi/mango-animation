// Ciò che è scelto nel montaggio. Un tratto si ritrova dopo che il montaggio è stato ricalcolato dal suo
// pezzo e dal posto che ha fra i tratti di quel pezzo: il numero fra tutti i tratti cambia a ogni ritocco.
import type { Risolto } from "../tipi"

export type Selezione =
  | { tipo: "tratto"; scena: number; pezzo: number; ordine: number }
  | { tipo: "scena"; scena: number }
  | { tipo: "parole"; da: number; a: number }

export function selezioneDelTratto(risolto: Risolto, indice: number): Selezione | null {
  const t = risolto.tratti[indice]
  if (!t) return null
  const ordine = risolto.tratti.slice(0, indice).filter((x) => x.scena === t.scena && x.pezzo === t.pezzo).length
  return { tipo: "tratto", scena: t.scena, pezzo: t.pezzo, ordine }
}

export function indiceDelTratto(risolto: Risolto, selezione: Selezione | null): number {
  if (selezione?.tipo !== "tratto") return -1
  const dei = risolto.tratti.flatMap((t, i) => (t.scena === selezione.scena && t.pezzo === selezione.pezzo ? [i] : []))
  return dei[selezione.ordine] ?? dei[dei.length - 1] ?? -1
}

/** La scelta com'è nel montaggio nuovo: un tratto o una scena che non esistono più la lasciano vuota. */
export function selezioneValida(risolto: Risolto, selezione: Selezione | null): Selezione | null {
  if (!selezione) return null
  if (selezione.tipo === "tratto") return indiceDelTratto(risolto, selezione) >= 0 ? selezione : null
  if (selezione.tipo === "scena") return risolto.scene[selezione.scena] ? selezione : null
  return risolto.parole[selezione.da] && risolto.parole[selezione.a] ? selezione : null
}
