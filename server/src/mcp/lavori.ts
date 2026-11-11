// A che punto è un lavoro della coda del server, e l'attesa della sua fine senza chiedere a intervalli:
// si ascoltano gli eventi e si rilegge la coda solo quando il server dice che è cambiata.
import { apriEventi, chiamaApi, ErroreStrumento, type Api } from "./api"

const RIGHE_DA_DARE = 20

interface InfoLavoro {
  id: string
  slug: string | null
  comando: string
  righe?: string[]
}

interface Lavori {
  in_corso: (InfoLavoro & { stima: number | null; trascorsi: number; fine_prevista: string | null }) | null
  in_coda: (InfoLavoro & { stima: number | null })[]
  finiti: (InfoLavoro & { esito: "riuscito" | "fallito" | "fermato" | "interrotto"; errore: string | null; risultato?: unknown })[]
}

export interface StatoLavoro {
  id: string
  comando: string
  slug: string | null
  stato: "in coda" | "in corso" | "finito"
  /** In coda e in corso: i secondi che ci vorranno, `null` se non c'è storia per stimarli. */
  stima?: number | null
  /** In corso: i secondi da quando è partito, e l'ora del computer a cui dovrebbe finire («15:42»). */
  trascorsi?: number
  fine_prevista?: string | null
  esito?: "riuscito" | "fallito" | "fermato" | "interrotto"
  errore?: string | null
  /** Di un lavoro finito che dà qualcosa a chi l'aspettava (`scene-foto`). */
  risultato?: unknown
  righe: string[]
}

const oraLocale = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export async function statoDelLavoro(api: Api, id: string): Promise<StatoLavoro> {
  const lavori = await chiamaApi<Lavori>(api, "GET", "/api/lavori")
  const base = (l: InfoLavoro): Pick<StatoLavoro, "id" | "comando" | "slug"> => ({ id: l.id, comando: l.comando, slug: l.slug })
  const inCorso = lavori.in_corso
  if (inCorso?.id === id) {
    const { stima, trascorsi, fine_prevista } = inCorso
    return { ...base(inCorso), stato: "in corso", stima, trascorsi, fine_prevista: fine_prevista === null ? null : oraLocale(fine_prevista), righe: (inCorso.righe ?? []).slice(-RIGHE_DA_DARE) }
  }
  const inCoda = lavori.in_coda.find((l) => l.id === id)
  if (inCoda) return { ...base(inCoda), stato: "in coda", stima: inCoda.stima, righe: [] }
  const finito = lavori.finiti.find((l) => l.id === id)
  if (finito) return { ...base(finito), stato: "finito", esito: finito.esito, errore: finito.errore, ...(finito.risultato === undefined ? {} : { risultato: finito.risultato }), righe: (finito.righe ?? []).slice(-RIGHE_DA_DARE) }
  throw new ErroreStrumento(`Non trovo il lavoro «${id}»: non è in corso né in coda, e non è fra gli ultimi 20 finiti. Controlla l'id che ti ha dato lo strumento «lavoro».`)
}

/** Aspetta la fine del lavoro per al massimo `secondi`; allo scadere dà lo stato di quel momento. */
export async function aspettaFine(api: Api, id: string, secondi: number): Promise<StatoLavoro> {
  const fermo = new AbortController()
  const timer = setTimeout(() => fermo.abort(), secondi * 1000)
  try {
    // Gli eventi si aprono prima di leggere lo stato: una fine che arriva nel frattempo non si perde.
    const eventi = await apriEventi(api, fermo.signal)
    const prima = await statoDelLavoro(api, id)
    if (prima.stato === "finito") return prima
    try {
      for await (const messaggio of eventi) {
        if (messaggio.tipo !== "lavori") continue
        const stato = await statoDelLavoro(api, id)
        if (stato.stato === "finito") return stato
      }
    } catch (errore) {
      if (fermo.signal.aborted) return await statoDelLavoro(api, id)
      throw errore
    }
    throw new ErroreStrumento("Il server si è fermato mentre aspettavo il lavoro: riaccendilo con `bun run --cwd server avvia`, poi chiedi `lavoro_stato` con lo stesso id (un lavoro interrotto dalla chiusura del server risulta finito con esito «interrotto»).")
  } finally {
    clearTimeout(timer)
    fermo.abort()
  }
}
