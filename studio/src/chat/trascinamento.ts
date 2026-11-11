// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.trascinamento`, `app/src/trascinamento.rs`):
// i file lasciati sulla finestra arrivano col loro percorso. Nel browser non c'è e vale il `drop` della pagina.

export type EventoTrascinamento = { tipo: "esce" } | { tipo: "entra" | "sopra" | "lascia"; x: number; y: number; percorsi?: string[] }

export interface PonteTrascinamento {
  su: (ascolta: (evento: EventoTrascinamento) => void) => () => void
}

export const ponteTrascinamento = (): PonteTrascinamento | null => window.__MANGO_ANIMATION__?.trascinamento ?? null
