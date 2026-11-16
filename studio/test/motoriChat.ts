// I motori della chat e i modelli come li dà il server, per le prove.
import type { LivelloDelModello, ModelloChat, MotoreChat } from "../src/chat/tipi"

const NOMI: Record<string, [string, string]> = {
  low: ["Basso", "Low"],
  medium: ["Medio", "Medium"],
  high: ["Alto", "High"],
  xhigh: ["Molto alto", "Very high"],
  max: ["Massimo", "Maximum"],
  ultra: ["Ultra", "Ultra"],
}

export const livelli = (...ids: string[]): LivelloDelModello[] => ids.map((id) => ({ id, nome: { it: NOMI[id]![0], en: NOMI[id]![1] } }))

export const CINQUE = livelli("low", "medium", "high", "xhigh", "max")

export const CAPACITA_NESSUNA = { effort: false, comandi: false, ferma_lavoro: false, in_background: false, immagini_negli_esiti: false, controllo_remoto: false, sottoagenti: false, browser: false }

export const CLAUDE: MotoreChat = {
  id: "claude-code",
  nome: "Claude",
  nelle_frasi: null,
  prefisso: null,
  pronto: true,
  modello_grande: null,
  capacita: { ...CAPACITA_NESSUNA, effort: true, comandi: true, ferma_lavoro: true, in_background: true, immagini_negli_esiti: true, controllo_remoto: true, sottoagenti: true, browser: true },
}

export const MANGO: MotoreChat = {
  id: "mango-code",
  nome: "Mango Code",
  nelle_frasi: "Mango Code",
  prefisso: "mango-code/",
  pronto: true,
  modello_grande: null,
  capacita: { ...CAPACITA_NESSUNA, comandi: true },
}

export const CODEX: MotoreChat = {
  id: "codex",
  nome: "Codex",
  nelle_frasi: "Codex",
  prefisso: "codex/",
  pronto: true,
  modello_grande: "codex/gpt-6-terra",
  capacita: { ...CAPACITA_NESSUNA, effort: true, comandi: true, ferma_lavoro: true, immagini_negli_esiti: true },
}

export const MOTORI: MotoreChat[] = [CLAUDE, MANGO]
export const MOTORI_CON_CODEX: MotoreChat[] = [CLAUDE, MANGO, CODEX]

/** Un modello come lo dà il server: `reale` è il nome vero, per i modelli di Claude Code. */
export const modello = (motore: MotoreChat, id: string, nome: string, effort: LivelloDelModello[] = [], reale: string = id): ModelloChat => ({ id, nome, descrizione: "", effort, reale, motore: motore.id })

export const MODELLO_MANGO: ModelloChat = modello(MANGO, "mango-code/toq", "Mango Code · TOQ")

export const MODELLI_CODEX: ModelloChat[] = [
  modello(CODEX, "codex/gpt-6-luna", "gpt-6-luna", livelli("low", "medium", "high")),
  modello(CODEX, "codex/gpt-6-terra", "gpt-6-terra", livelli("low", "medium", "high", "ultra")),
]
