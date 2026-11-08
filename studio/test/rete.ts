// Un `fetch` finto per le prove: ogni rotta è una risposta scritta nella prova, e tutto ciò che non è dichiarato
// fa fallire la prova invece di rispondere a caso.
import { vi } from "vitest"

export interface Chiamata {
  metodo: string
  percorso: string
  corpo: unknown
  intestazioni: Record<string, string>
}

type Risposta = unknown | ((chiamata: Chiamata) => unknown)

export function installaRete(rotte: Record<string, Risposta>): { chiamate: Chiamata[]; imposta: (chiave: string, risposta: Risposta) => void } {
  const chiamate: Chiamata[] = []
  const tutte = { ...rotte }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (indirizzo: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(indirizzo), "http://prova.test")
      const metodo = init?.method ?? "GET"
      const chiamata: Chiamata = { metodo, percorso: `${url.pathname}${url.search}`, corpo: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body, intestazioni: (init?.headers ?? {}) as Record<string, string> }
      chiamate.push(chiamata)
      const chiave = `${metodo} ${chiamata.percorso}`
      const risposta = tutte[chiave] ?? tutte[`${metodo} ${url.pathname}`]
      if (risposta === undefined) throw new Error(`Rotta non dichiarata nella prova: ${chiave}`)
      const valore = typeof risposta === "function" ? (risposta as (c: Chiamata) => unknown)(chiamata) : risposta
      if (valore instanceof Response) return valore
      return new Response(JSON.stringify(valore ?? {}), { status: 200, headers: { "Content-Type": "application/json" } })
    }),
  )
  return { chiamate, imposta: (chiave, risposta) => void (tutte[chiave] = risposta) }
}

export const errore = (stato: number, frase: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ errore: frase, ...extra }), { status: stato })

/** Un `EventSource` che si comanda dalla prova. */
export class FinteEventi {
  static istanze: FinteEventi[] = []
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  chiuso = false
  constructor(readonly url: string) {
    FinteEventi.istanze.push(this)
  }
  close() {
    this.chiuso = true
  }
  manda(evento: unknown) {
    this.onmessage?.({ data: JSON.stringify(evento) })
  }
  apri() {
    this.onopen?.()
  }
  cadi() {
    this.onerror?.()
  }
}

export function installaEventi(): typeof FinteEventi {
  FinteEventi.istanze = []
  vi.stubGlobal("EventSource", FinteEventi)
  return FinteEventi
}
