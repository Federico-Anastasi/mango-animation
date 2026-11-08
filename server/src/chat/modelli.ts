// I modelli che Claude Code offre e le scelte di modello ed effort di una conversazione (`docs/CHAT.md`, «Modello ed effort»).
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk"
import { frase } from "../lingua"
import type { LetturaDiClaudeCode } from "./lettura"
import type { Oggetto } from "./traduzione"
import { ErroreChat, LIVELLI_EFFORT, MODELLO_PREDEFINITO, type ImpostazioniChat, type LivelloEffort, type ModelloChat } from "./tipi"

const ELENCO_LIVELLI = LIVELLI_EFFORT.join(", ")

/** Le righe dell'SDK come le vede il creator: il predefinito dice quale modello è. */
export function traduciModelli(info: ModelInfo[]): ModelloChat[] {
  return info.map((m) => {
    const reale = m.resolvedModel ?? m.value
    const quale = m.value === MODELLO_PREDEFINITO ? info.find((altro) => altro.value !== MODELLO_PREDEFINITO && altro.resolvedModel === reale)?.displayName : undefined
    return {
      id: m.value,
      nome: m.value === MODELLO_PREDEFINITO ? (quale ? frase(`Predefinito (${quale})`, `Default (${quale})`) : frase("Predefinito", "Default")) : m.displayName,
      descrizione: m.description,
      effort: m.supportedEffortLevels ?? [],
      reale,
    }
  })
}

/** Ciò che una richiesta cambia: solo i campi presenti. */
export interface Cambi {
  modello?: string
  effort?: LivelloEffort | null
}

const eLivello = (valore: unknown): valore is LivelloEffort => LIVELLI_EFFORT.some((l) => l === valore)

export class ElencoModelli {
  constructor(
    private readonly lettura: LetturaDiClaudeCode,
    /** I modelli di Mango Code: si leggono a ogni richiesta, perché Mango Code si accende e si spegne per conto suo. */
    private readonly diMangoCode: () => Promise<ModelloChat[]>,
  ) {}

  /** Quelli di Claude Code e, se è acceso, quelli di Mango Code. Se Claude Code non risponde bastano quelli di Mango Code. */
  async elenca(): Promise<ModelloChat[]> {
    const [claude, mango] = await Promise.allSettled([this.diClaudeCode(), this.diMangoCode()])
    const diMango = mango.status === "fulfilled" ? mango.value : []
    if (claude.status === "rejected" && diMango.length === 0) throw claude.reason
    return [...(claude.status === "fulfilled" ? claude.value : []), ...diMango]
  }

  private async diClaudeCode(): Promise<ModelloChat[]> {
    return traduciModelli((await this.lettura.leggi()).modelli)
  }

  private static trova(elenco: ModelloChat[], nome: string | null): ModelloChat | undefined {
    return elenco.find((m) => m.id === (nome ?? MODELLO_PREDEFINITO)) ?? elenco.find((m) => m.reale === nome)
  }

  /**
   * Controlla una scelta del creator contro l'elenco: i campi che non esistono, i valori che Claude Code non offre, un effort che il
   * modello non ha. Cambiando modello l'effort che il nuovo non ha torna al predefinito.
   */
  async verifica(corpo: Oggetto, corrente: ImpostazioniChat): Promise<Cambi> {
    for (const campo of Object.keys(corpo)) {
      if (campo !== "modello" && campo !== "effort") throw new ErroreChat(400, `«${campo}» non è un'impostazione: ci sono «modello» e «effort».`)
    }
    const { modello, effort } = corpo
    if (modello === undefined && effort === undefined) throw new ErroreChat(400, "Manca cosa cambiare: scrivi «modello» o «effort».")
    if (modello !== undefined && typeof modello !== "string") throw new ErroreChat(400, "Il «modello» è il nome di uno dei modelli dell'elenco (GET /api/chat/modelli).")
    if (effort !== undefined && effort !== null && !eLivello(effort)) {
      throw new ErroreChat(400, typeof effort === "string" ? `L'effort «${effort}» non esiste. I livelli sono: ${ELENCO_LIVELLI}.` : `L'«effort» è uno dei livelli (${ELENCO_LIVELLI}) oppure null per quello predefinito.`)
    }

    const elenco = await this.elenca()
    if (modello !== undefined && !elenco.some((m) => m.id === modello)) {
      throw new ErroreChat(400, `«${modello}» non è un modello che la chat offre. Quelli che ci sono: ${elenco.map((m) => m.nome).join(", ")}.`)
    }
    const cambi: Cambi = {}
    if (modello !== undefined) cambi.modello = modello
    if (effort !== undefined) cambi.effort = effort

    const scelto = ElencoModelli.trova(elenco, modello ?? corrente.modello)
    if (!scelto) return cambi
    if (effort !== undefined && effort !== null && !scelto.effort.includes(effort)) {
      throw new ErroreChat(400, scelto.effort.length === 0 ? `${scelto.nome} non ha livelli di effort.` : `${scelto.nome} non ha l'effort «${effort}». I suoi livelli sono: ${scelto.effort.join(", ")}.`)
    }
    if (effort === undefined && modello !== undefined && corrente.effort !== null && !scelto.effort.includes(corrente.effort)) cambi.effort = null
    return cambi
  }
}
