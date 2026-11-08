// I comandi con la barra della chat (`docs/CHAT.md`, «I comandi con la barra»): l'elenco di Claude Code e i messaggi che sono comandi.
import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import type { LetturaDiClaudeCode } from "./lettura"
import { ErroreChat } from "./tipi"

/** Un comando di Claude Code (`GET /api/chat/comandi`). */
export interface ComandoChat {
  nome: string
  descrizione: string
  /** Il suggerimento degli argomenti; vuoto se non ne vuole. */
  argomenti: string
  alias: string[]
}

const traduciComandi = (info: SlashCommand[]): ComandoChat[] => info.map((c) => ({ nome: c.name, descrizione: c.description, argomenti: c.argumentHint ?? "", alias: c.aliases ?? [] }))

export class ElencoComandi {
  /** L'ultimo elenco che una conversazione ha mandato: vale al posto di quello letto all'avvio. */
  private sostituito: ComandoChat[] | null = null

  constructor(private readonly lettura: LetturaDiClaudeCode) {}

  async elenca(): Promise<ComandoChat[]> {
    return this.sostituito ?? traduciComandi((await this.lettura.leggi()).comandi)
  }

  /** `true` se l'elenco è cambiato rispetto all'ultimo che una conversazione ha mandato. */
  sostituisci(info: SlashCommand[]): boolean {
    const nuovo = traduciComandi(info)
    if (this.sostituito !== null && JSON.stringify(this.sostituito) === JSON.stringify(nuovo)) return false
    this.sostituito = nuovo
    return true
  }
}

/** Un messaggio che comincia con la barra è un comando: arriva a Claude Code com'è scritto. */
export const eComando = (testo: string): boolean => testo.startsWith("/")

/** I comandi che nello studio hanno il loro posto e che, mandati a Claude Code, gli farebbero cambiare cosa la chat non sa. */
const DELLO_STUDIO = /^\/(clear|reset|new|model|effort)(?=\s|$)/

export function rifiutaIlComandoDelloStudio(testo: string): void {
  const nome = DELLO_STUDIO.exec(testo)?.[1]
  if (nome === undefined) return
  if (nome === "model") throw new ErroreChat(400, "Il modello non si cambia con «/model»: sceglilo dal menu del modello, così la chat lo sa.")
  if (nome === "effort") throw new ErroreChat(400, "L'effort non si cambia con «/effort»: sceglilo dal menu dell'effort, così la chat lo sa.")
  throw new ErroreChat(400, `«/${nome}» cambierebbe la conversazione sotto la chat: chiudi questa conversazione e aprine una nuova.`)
}
