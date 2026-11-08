import { useEffect, useState } from "react"

const ascoltatori = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function iscrivi(ascolta: () => void): () => void {
  ascoltatori.add(ascolta)
  timer ??= setInterval(() => ascoltatori.forEach((a) => a()), 1000)
  return () => {
    ascoltatori.delete(ascolta)
    if (ascoltatori.size > 0 || timer === null) return
    clearInterval(timer)
    timer = null
  }
}

/** L'ora di adesso, aggiornata ogni secondo finché `attivo`: è un orologio della pagina, un solo timer per tutti, e non chiede niente al server. */
export function useAdesso(attivo: boolean): number {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    if (!attivo) return
    setAdesso(Date.now())
    return iscrivi(() => setAdesso(Date.now()))
  }, [attivo])
  return adesso
}
