// I comandi con la barra della chat (`docs/chat/comandi.md`): l'elenco di un motore e i messaggi che sono comandi.
import type { Motore } from "./motore"
import { manca } from "./motore"

/** Un comando con la barra di un motore (`GET /api/chat/comandi`). */
export interface ComandoChat {
  nome: string
  descrizione: string
  /** Il suggerimento degli argomenti; vuoto se non ne vuole. */
  argomenti: string
  alias: string[]
}

/** I comandi di un motore. */
export class ElencoComandi {
  /** L'ultimo elenco che una conversazione ha mandato: vale al posto di quello letto all'avvio. */
  private sostituito: ComandoChat[] | null = null

  constructor(
    private readonly motore: Motore,
    private readonly lavoro: string,
  ) {}

  async elenca(): Promise<ComandoChat[]> {
    if (!this.motore.capacita.comandi) throw manca(this.motore.nomi, "comandi")
    return this.sostituito ?? this.motore.comandi(this.lavoro)
  }

  /** `true` se l'elenco è cambiato rispetto all'ultimo che una conversazione ha mandato. */
  sostituisci(nuovo: ComandoChat[]): boolean {
    if (this.sostituito !== null && JSON.stringify(this.sostituito) === JSON.stringify(nuovo)) return false
    this.sostituito = nuovo
    return true
  }
}

/** Un messaggio che comincia con la barra è un comando: arriva al motore com'è scritto. */
export const eComando = (testo: string): boolean => testo.startsWith("/")
