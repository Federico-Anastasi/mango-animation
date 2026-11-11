// I tre stili di partenza (`stili-di-partenza.json`, nella cartella del prodotto): un file solo, che legge la skill `welcome`
// e che lo studio mostra come cartoline di prova in Impostazioni › Stile.
import { unisciStile } from "../../strumenti/stile.mjs"
import { eOggetto } from "./disco"

/** Le sezioni dello stile che fanno l'aspetto: ciò che una cartolina cambia e ciò che lo studio disegna. */
const ASPETTO = ["colori", "caratteri", "sottotitoli", "titolo"] as const

interface Testi {
  it: string
  en: string
}

export interface StileDiPartenza {
  id: string
  nome: Testi
  descrizione: Testi
  /** Le sezioni dell'aspetto per intero: quelle del file sopra quelle dello stile di serie. */
  stile: Record<string, unknown>
}

/** Gli stili del file (`null`: il file non è un oggetto di stili) con le sezioni dell'aspetto fuse con lo stile di serie. */
export function stiliDiPartenza(file: unknown, serie: unknown): StileDiPartenza[] | null {
  if (!eOggetto(file) || !eOggetto(serie)) return null
  return Object.entries(file).map(([id, voce]) => {
    const { nome, descrizione, stile } = voce as { nome: Testi; descrizione: Testi; stile: Record<string, unknown> }
    return { id, nome, descrizione, stile: Object.fromEntries(ASPETTO.map((sezione) => [sezione, unisciStile(serie[sezione], stile[sezione] ?? {})])) }
  })
}
