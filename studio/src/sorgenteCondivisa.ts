// Un solo `EventSource` per indirizzo, condiviso da chi ascolta e aperto finché qualcuno ascolta: il
// browser tiene sei connessioni verso il server, e un flusso per ogni vista le riempirebbe.
export interface Ascoltatore {
  messaggio?: (dati: string) => void
  aperta?: () => void
  errore?: () => void
}

interface Condivisa {
  sorgente: EventSource
  ascoltatori: Set<Ascoltatore>
  aperta: boolean
}

const condivise = new Map<string, Condivisa>()

export function ascoltaSorgente(url: string, ascoltatore: Ascoltatore): () => void {
  const esistente = condivise.get(url)
  const condivisa = esistente ?? { sorgente: new EventSource(url), ascoltatori: new Set<Ascoltatore>(), aperta: false }
  if (!esistente) {
    condivisa.sorgente.onopen = () => {
      condivisa.aperta = true
      for (const a of [...condivisa.ascoltatori]) a.aperta?.()
    }
    condivisa.sorgente.onerror = () => {
      condivisa.aperta = false
      for (const a of [...condivisa.ascoltatori]) a.errore?.()
    }
    condivisa.sorgente.onmessage = (evento) => {
      for (const a of [...condivisa.ascoltatori]) a.messaggio?.(String(evento.data))
    }
    condivise.set(url, condivisa)
  }
  condivisa.ascoltatori.add(ascoltatore)
  if (condivisa.aperta) ascoltatore.aperta?.()
  return () => {
    condivisa.ascoltatori.delete(ascoltatore)
    if (condivisa.ascoltatori.size > 0) return
    condivisa.sorgente.close()
    condivise.delete(url)
  }
}
