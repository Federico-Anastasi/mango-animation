export type Stile = { [chiave: string]: unknown }

export function unisciStile(serie: unknown, creator: unknown): unknown
export function leggiStile(codice: string, lavoro: string | undefined): Stile
