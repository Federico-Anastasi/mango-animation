import type { Contesto, Esito } from "./ritocchi"

/** Ciò che serve a un pannello per ritoccare il montaggio: il contesto, come mandare il piano nuovo e se si può. */
export interface Azione {
  ctx: Contesto
  esegui: (esito: Esito) => void
  /** Il montaggio si sta ricalcolando, o un ritocco è in viaggio: nessun altro gesto sui tratti. */
  bloccato: boolean
}
