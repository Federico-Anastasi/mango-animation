// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.cartellaDati`, `app/src/dati.rs`).
// Nel browser non c'è, e la voce non compare.

export interface DatiCartella {
  attuale: string
  /** La cartella scelta dopo l'avvio: vale dal prossimo. */
  prossima: string | null
  /** La indica la variabile d'ambiente: da qui non si cambia. */
  forzata: boolean
}

export interface PonteCartella {
  leggi: () => Promise<DatiCartella>
  /** Apre la scelta della cartella; `null` se non se ne sceglie nessuna. I file non si spostano. */
  sposta: () => Promise<DatiCartella | null>
}

export const ponteCartella = (): PonteCartella | null => window.__MANGO_ANIMATION__?.cartellaDati ?? null
