// Lo studio sulla rete. Il ricevitore controlla da solo l'accesso (cookie di sessione, e `Origin` quando c'è) e poi gira la richiesta al server
// dello studio, che ascolta solo su 127.0.0.1 e per lui è una richiesta come le altre. Il corpo e la risposta passano a flusso: gli eventi
// (SSE) e i video a pezzi (`Range`) non si bufferizzano.
import { cookieDi, INTESTAZIONE_CHIAVE, linguaDellaPagina } from "../accesso"
import { frase, linguaDi, nellaLinguaDi, type Testo } from "../lingua"
import { DURATA_SESSIONE_S, type AccessoStudio } from "./accessoStudio"
import { esc, STILE_BASE } from "./pagine"

export const COOKIE_STUDIO = "mango_studio"
/** Messa dal ricevitore su ogni richiesta che gira: il server dello studio la usa per tenere certe rotte solo al computer. */
export const INTESTAZIONE_DALLA_RETE = "x-dalla-rete"

const METODI = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
const NON_SI_GIRANO = ["host", "origin", "referer", "cookie", "authorization", "connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade", INTESTAZIONE_DALLA_RETE]
const NON_SI_RIDANNO = ["connection", "keep-alive", "transfer-encoding"]

const FRASE_ENTRATA = frase(
  "Per entrare nello studio apri il link che si trova sul computer, in Impostazioni › Telefono, nel riquadro «Lo studio dal telefono».",
  "To get into the studio, open the link on the computer, in Settings › Phone, in the box «The studio on your phone».",
)
const CHIAVE_SBAGLIATA = frase(`La chiave dello studio non è giusta. ${FRASE_ENTRATA.it}`, `The studio key is not right. ${FRASE_ENTRATA.en}`)
const SESSIONE_SCADUTA = frase(`La sessione non c'è o è scaduta. ${FRASE_ENTRATA.it}`, `There is no session, or it has expired. ${FRASE_ENTRATA.en}`)
const METODO_NON_AMMESSO = frase("Metodo non ammesso qui.", "This method is not allowed here.")
const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }

/** Il JSON `{ errore }` nella lingua dello studio che l'ha chiesto: il ricevitore non ha una richiesta in corso, la lingua la dice l'intestazione. */
const errore = (req: Request, stato: number, testo: Testo): Response => Response.json({ errore: nellaLinguaDi(testo, linguaDi(req)) }, { status: stato, headers: NO_STORE })

const rispondi = (req: Request, stato: number, testo: Testo): Response => {
  if (!(req.headers.get("accept") ?? "").includes("text/html")) return errore(req, stato, testo)
  const lingua = linguaDellaPagina(req)
  return new Response(
    `<!doctype html>\n<html lang="${lingua}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mango Animation</title><style>${STILE_BASE}</style></head><body><h1>Mango Animation</h1><p>${esc(nellaLinguaDi(testo, lingua))}</p></body></html>`,
    { status: stato, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } },
  )
}

/** `/studio?chiave=…`: con la chiave giusta mette il cookie di sessione e rimanda allo studio. */
export async function entraConLaChiave(accesso: AccessoStudio, req: Request, url: URL): Promise<{ risposta: Response; riuscito: boolean }> {
  if (req.method !== "GET") return { risposta: errore(req, 405, METODO_NON_AMMESSO), riuscito: false }
  const token = await accesso.entra(url.searchParams.get("chiave"))
  if (!token) return { risposta: rispondi(req, 401, CHIAVE_SBAGLIATA), riuscito: false }
  return {
    riuscito: true,
    risposta: new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": `${COOKIE_STUDIO}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURATA_SESSIONE_S}`, ...NO_STORE },
    }),
  }
}

/** Gira la richiesta al server dello studio, se la sessione vale e l'`Origin`, quando c'è, è l'indirizzo a cui è arrivata la richiesta. */
export async function giraAlloStudio(accesso: AccessoStudio, porta: number | null, chiaveApi: string, req: Request, url: URL, senzaScadenza: () => void): Promise<Response> {
  if (!accesso.valida(cookieDi(req, COOKIE_STUDIO))) return rispondi(req, 401, SESSIONE_SCADUTA)
  const origine = req.headers.get("origin")
  if (origine !== null) {
    const stessaPagina = (() => {
      try {
        const o = new URL(origine)
        return o.protocol === "http:" && o.host === url.host
      } catch {
        return false
      }
    })()
    if (!stessaPagina) return errore(req, 403, frase("Questa richiesta viene da un'altra pagina web e non la eseguo.", "This request comes from another web page and I will not carry it out."))
  }
  if (!METODI.has(req.method)) return errore(req, 405, METODO_NON_AMMESSO)
  if (porta === null) return errore(req, 503, frase("Lo studio sta ancora partendo: riprova fra un attimo.", "The studio is still starting: try again in a moment."))

  const intestazioni = new Headers(req.headers)
  for (const nome of [...NON_SI_GIRANO, ...[...intestazioni.keys()].filter((n) => n.startsWith("proxy-"))]) intestazioni.delete(nome)
  intestazioni.set("accept-encoding", "identity")
  intestazioni.set(INTESTAZIONE_DALLA_RETE, "1")
  intestazioni.set(INTESTAZIONE_CHIAVE, chiaveApi)
  const conCorpo = req.method !== "GET" && req.method !== "HEAD"
  // Chi toglie l'accesso chiude anche i flussi lunghi già aperti (`AccessoStudio.tieni`).
  const revoca = new AbortController()
  try {
    const su = await fetch(`http://127.0.0.1:${porta}${url.pathname}${url.search}`, {
      method: req.method,
      headers: intestazioni,
      body: conCorpo ? req.body : undefined,
      redirect: "manual",
      signal: AbortSignal.any([req.signal, revoca.signal]),
      ...(conCorpo ? { duplex: "half" } : {}),
    } as RequestInit)
    const risposta = new Headers(su.headers)
    for (const nome of NON_SI_RIDANNO) risposta.delete(nome)
    if (!su.headers.get("content-type")?.startsWith("text/event-stream") || !su.body) return new Response(su.body, { status: su.status, statusText: su.statusText, headers: risposta })
    senzaScadenza()
    const lascia = accesso.tieni(revoca)
    req.signal.addEventListener("abort", lascia, { once: true })
    const corpo = su.body.pipeThrough(new TransformStream({ flush: lascia }))
    return new Response(corpo, { status: su.status, statusText: su.statusText, headers: risposta })
  } catch (causa) {
    console.error(`studio dalla rete: ${req.method} ${url.pathname} non ha avuto risposta dal server interno: ${causa instanceof Error ? causa.message : String(causa)}`)
    return errore(req, 502, frase("Lo studio non risponde: controlla che Mango Animation sia acceso sul computer.", "The studio is not answering: check that Mango Animation is running on the computer."))
  }
}
