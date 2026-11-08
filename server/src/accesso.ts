// Chi può usare le API del server (`docs/API.md`, «La chiave delle API»): chi porta la chiave di `arrivi/chiave-api.json`, che sta nella
// cartella di lavoro e la legge chi può leggere quella cartella. Il server ascolta solo su 127.0.0.1, ma dal computer ci arriva qualunque
// programma, e la chat esegue comandi: senza chiave non si va oltre la porta. L'app, lo strumento «video» e Claude la leggono dal file;
// una pagina del browser la riceve una volta sola da `/entra`, che la mette in un cookie.
import { chiaveGiusta } from "./arrivi/chiave"
import { esc, STILE_BASE } from "./arrivi/pagine"
import { frase, INTESTAZIONE_LINGUA, linguaDi, nellaLinguaDi, type Lingua } from "./lingua"

export const INTESTAZIONE_CHIAVE = "x-chiave-api"
const UN_ANNO_S = 365 * 86400
const FRASE_ENTRATA = frase(
  "Mango Animation si apre dall'app. Da terminale, il server scrive all'avvio il link che apre lo studio con la chiave.",
  "Mango Animation opens from the app. From a terminal, the server prints at startup the link that opens the studio with the key.",
)
const METODO_NON_AMMESSO = frase("Metodo non ammesso qui.", "This method is not allowed here.")
const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }

/** Il cookie ha un nome per porta: due server sullo stesso computer (un altro archivio, una prova) non si pestano le chiavi. */
const nomeDelCookie = (url: URL): string => `mango_api_${url.port || "80"}`

function cookieDi(req: Request, nome: string): string | null {
  for (const voce of (req.headers.get("cookie") ?? "").split(";")) {
    const [chiave, ...valore] = voce.trim().split("=")
    if (chiave === nome) return valore.join("=")
  }
  return null
}

/** La chiave che la richiesta porta: nell'intestazione, come Bearer, o nel cookie dello studio. */
export function chiaveDellaRichiesta(req: Request, url: URL): string | null {
  const autorizzazione = req.headers.get("authorization")
  return req.headers.get(INTESTAZIONE_CHIAVE) ?? (autorizzazione?.startsWith("Bearer ") ? autorizzazione.slice(7).trim() : null) ?? cookieDi(req, nomeDelCookie(url))
}

export const haLaChiave = (chiave: string, req: Request, url: URL): boolean => chiaveGiusta(chiave, chiaveDellaRichiesta(req, url))

/** La lingua di una pagina aperta dal browser, che non porta `X-Lingua`: quella del sistema che il browser dichiara, come fa lo studio senza una scelta; senza dichiarazione, italiano. */
export function linguaDellaPagina(req: Request): Lingua {
  if (req.headers.has(INTESTAZIONE_LINGUA)) return linguaDi(req)
  const dichiarata = req.headers.get("accept-language")?.trim().toLowerCase()
  return dichiarata && !dichiarata.startsWith("it") ? "en" : "it"
}

/** 401: una frase in HTML per chi apre una pagina dal browser, JSON per il resto. */
export function senzaChiave(req: Request): Response {
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    const lingua = linguaDellaPagina(req)
    return new Response(
      `<!doctype html>\n<html lang="${lingua}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mango Animation</title><style>${STILE_BASE}</style></head><body><h1>Mango Animation</h1><p>${esc(nellaLinguaDi(FRASE_ENTRATA, lingua))}</p></body></html>`,
      { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } },
    )
  }
  const errore = frase(
    `La richiesta non porta la chiave del server: mettila nell'intestazione X-Chiave-Api (la chiave sta in archivio/arrivi/chiave-api.json). ${FRASE_ENTRATA.it}`,
    `The request does not carry the server key: put it in the X-Chiave-Api header (the key is in archivio/arrivi/chiave-api.json). ${FRASE_ENTRATA.en}`,
  )
  return Response.json({ errore: nellaLinguaDi(errore, linguaDi(req)) }, { status: 401, headers: NO_STORE })
}

/** Il posto dove rimandare dopo l'ingresso: solo un percorso di questo sito, mai un altro indirizzo. */
const doveRimandare = (dopo: string | null): string => (dopo !== null && /^\/(?![/\\])/.test(dopo) ? dopo : "/")

/** `/entra?chiave=…&dopo=/percorso`: con la chiave giusta mette il cookie e rimanda a `dopo` (di base lo studio). */
export function entra(req: Request, url: URL, chiave: string): Response {
  if (req.method !== "GET") return Response.json({ errore: nellaLinguaDi(METODO_NON_AMMESSO, linguaDi(req)) }, { status: 405, headers: NO_STORE })
  if (!chiaveGiusta(chiave, url.searchParams.get("chiave"))) return senzaChiave(req)
  return new Response(null, {
    status: 303,
    headers: { Location: doveRimandare(url.searchParams.get("dopo")), "Set-Cookie": `${nomeDelCookie(url)}=${chiave}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${UN_ANNO_S}`, ...NO_STORE },
  })
}
