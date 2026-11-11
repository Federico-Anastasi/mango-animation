import { useState } from "react"

/**
 * Il testo di un campo che si scrive e si salva uscendo dal campo: `testo` è la bozza, o il valore salvato se non c'è;
 * se `onSalva` rifiuta, la bozza resta com'è scritta e `errore` dice perché.
 */
export function useBozza(valore: string, onSalva: (nuovo: string) => Promise<void>) {
  const [bozza, scrivi] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  const salva = () => {
    if (bozza === null || bozza === valore) {
      scrivi(null)
      return
    }
    setErrore(null)
    onSalva(bozza).then(
      () => scrivi(null),
      (e: Error) => setErrore(e.message),
    )
  }
  return { testo: bozza ?? valore, scrivi, errore, salva }
}
