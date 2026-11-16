// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.grandezza`): la grandezza di tutto ciò che si vede.
// Nel browser non c'è, e la riga non compare.

export interface PonteGrandezza {
  /** 1 è il 100%. */
  leggi: () => Promise<number>
  /** La cambia subito e la ricorda. */
  imposta: (zoom: number) => Promise<void>
}

export const ponteGrandezza = (): PonteGrandezza | null => window.__MANGO_ANIMATION__?.grandezza ?? null

export const GRANDEZZA_MINIMA = 50
export const GRANDEZZA_MASSIMA = 200
export const GRANDEZZA_PASSO = 10

/** Lo zoom dell'app in percentuale, portato dentro i limiti. */
export const percentualeDi = (zoom: number): number => Math.min(GRANDEZZA_MASSIMA, Math.max(GRANDEZZA_MINIMA, Math.round(zoom * 100)))
