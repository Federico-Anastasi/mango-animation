// L'errore con cui il motore (`python -m motore`) esce: scrive su stderr la riga `@errore` e, dopo, la sua frase, anche su più righe (`docs/MOTORE.md`, «Gli errori»).

/** La riga con cui il motore apre il suo errore finale (`MARCATORE_ERRORE` in `motore/__main__.py`). */
export const MARCATORE_ERRORE = "@errore"

/** Le righe dell'errore, dopo l'ultimo marcatore, unite; `null` se il marcatore non c'è o dopo non viene niente. */
export function erroreDopoIlMarcatore(righe: string[]): string | null {
  const i = righe.lastIndexOf(MARCATORE_ERRORE)
  const errore = i < 0 ? [] : righe.slice(i + 1)
  return errore.length > 0 ? errore.join("\n") : null
}
