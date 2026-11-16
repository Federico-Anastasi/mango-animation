// I livelli di effort come li mostra la chat, uguali per ogni motore.
import type { LivelloDiEffort } from "./tipi"

const NOMI_DEI_LIVELLI: Record<string, LivelloDiEffort["nome"]> = {
  minimal: { it: "Minimo", en: "Minimal" },
  low: { it: "Basso", en: "Low" },
  medium: { it: "Medio", en: "Medium" },
  high: { it: "Alto", en: "High" },
  xhigh: { it: "Molto alto", en: "Extra high" },
  max: { it: "Massimo", en: "Max" },
  ultra: { it: "Ultra", en: "Ultra" },
}

/** Un livello che un motore offre; uno che il prodotto non conosce ancora si chiama col suo id. */
export const livelloDi = (id: string): LivelloDiEffort => ({ id, nome: NOMI_DEI_LIVELLI[id] ?? { it: id, en: id } })
