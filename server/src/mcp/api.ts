// Il server di Mango Animation visto dagli strumenti: JSON in e out, gli errori in italiano, e gli eventi.

/** Un errore che il modello deve leggere così com'è: la frase dice cosa è andato storto e cosa fare. */
export class ErroreStrumento extends Error {}

/** Dove sta il server e con quale chiave gli si parla: la chiave si rilegge a ogni richiesta, così un server acceso dopo lo strumento la trova. */
export interface Api {
  indirizzo: string
  intestazioni: () => Promise<Record<string, string>>
}

const SERVER_SPENTO = "Il server di Mango Animation non è acceso: accendilo con `bun run --cwd server avvia` e riprova."

async function fetchDelServer(api: Api, percorso: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(api.indirizzo + percorso, { ...init, headers: { ...(await api.intestazioni()), ...init.headers } })
  } catch (errore) {
    if (init?.signal?.aborted) throw errore
    throw new ErroreStrumento(SERVER_SPENTO)
  }
}

export async function chiamaApi<T>(api: Api, metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const risposta = await fetchDelServer(api, percorso, {
    method: metodo,
    headers: corpo === undefined ? {} : { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const testo = await risposta.text()
  const letto = testo ? (JSON.parse(testo) as unknown) : null
  if (risposta.ok) return letto as T
  const { errore, problemi } = (letto ?? {}) as { errore?: string; problemi?: unknown }
  const motivi = Array.isArray(problemi) ? problemi.map(String).filter((p) => !(errore ?? "").includes(p)) : []
  throw new ErroreStrumento([errore ?? `Il server ha risposto ${risposta.status} a ${metodo} ${percorso}.`, ...motivi].join("\n"))
}

/** Apre `GET /api/eventi` e dà i messaggi uno a uno finché `segnale` non scatta o il server chiude. */
export async function apriEventi(api: Api, segnale: AbortSignal): Promise<AsyncGenerator<{ tipo: string }>> {
  const risposta = await fetchDelServer(api, "/api/eventi", { signal: segnale })
  const flusso = risposta.body!
  return (async function* () {
    const decodifica = new TextDecoder()
    let resto = ""
    for await (const pezzo of flusso) {
      const blocchi = (resto + decodifica.decode(pezzo, { stream: true })).split("\n\n")
      resto = blocchi.pop() ?? ""
      for (const blocco of blocchi) if (blocco.startsWith("data: ")) yield JSON.parse(blocco.slice(6)) as { tipo: string }
    }
  })()
}
