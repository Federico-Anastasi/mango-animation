// Le rotte `/api/chat` di `docs/CHAT.md`, nella stessa forma della tabella di `src/rotte.ts`.
import { isAbsolute } from "node:path"
import type { PercorsiScelti } from "../arrivi/percorsiScelti"
import { eOggetto, statistica } from "../disco"
import { frase } from "../lingua"
import { decodifica } from "../media"
import type { Chat } from "./chat"
import { type Oggetto } from "./traduzione"
import { ErroreChat } from "./tipi"

interface Chiamata {
  req: Request
  param: string[]
}

type Gestore = (chiamata: Chiamata) => Promise<Response> | Response
export type RottaDellaChat = [metodo: string, modello: RegExp, gestore: Gestore]

/** Quanto accetta il server in un corpo che non sia un file per il girato (`CORPO_MASSIMO_BYTE` in `rotte.ts`): lo stesso limite per un file che arriva per percorso. */
const LIMITE_ALLEGATO_BYTE = 16 * 1024 ** 2

const FILE_VUOTO = frase("Il file è vuoto.", "The file is empty.")

const risposta = (corpo: unknown, stato = 200): Response => Response.json(corpo, { status: stato, headers: { "Cache-Control": "no-store" } })

async function corpoJson(req: Request): Promise<Oggetto> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new ErroreChat(400, frase("Manda il corpo come JSON, con l'intestazione Content-Type: application/json.", "Send the body as JSON, with the header Content-Type: application/json."))
  }
  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    throw new ErroreChat(400, frase("Il corpo non è un JSON valido.", "The body is not valid JSON."))
  }
  if (!eOggetto(corpo)) throw new ErroreChat(400, frase("Il corpo deve essere un oggetto JSON.", "The body must be a JSON object."))
  return corpo
}

const parametro = (chiamata: Chiamata, posizione: number): string => decodifica(chiamata.param[posizione] ?? "") ?? ""

/** Gli errori della chat diventano risposte con la loro frase; ogni altro errore lo gestisce il server. */
function conErrori(gestore: Gestore): Gestore {
  return async (chiamata) => {
    try {
      return await gestore(chiamata)
    } catch (errore) {
      if (errore instanceof ErroreChat) return Response.json({ errore: errore.testo }, { status: errore.stato })
      throw errore
    }
  }
}

export function rotteDellaChat(chat: Chat, percorsiScelti: PercorsiScelti): RottaDellaChat[] {
  const caricaAllegato: Gestore = async ({ req }) => {
    const intestazione = req.headers.get("x-nome") ?? ""
    const nome = decodifica(intestazione) ?? intestazione
    if (nome.trim() === "") throw new ErroreChat(400, frase("Manca il nome del file: mandalo nell'intestazione X-Nome.", "The file name is missing: send it in the X-Nome header."))
    const contenuto = new Uint8Array(await req.arrayBuffer())
    if (contenuto.byteLength === 0) throw new ErroreChat(400, FILE_VUOTO)
    return risposta({ percorso: await chat.salvaAllegato(nome, contenuto) }, 201)
  }

  const copiaAllegato: Gestore = async ({ req }) => {
    const percorso = (await corpoJson(req))["percorso"]
    if (typeof percorso !== "string" || !isAbsolute(percorso)) throw new ErroreChat(400, frase("Manda il «percorso» completo del file.", "Send the full «percorso» of the file."))
    if (!percorsiScelti.prendi(percorso)) {
      throw new ErroreChat(
        403,
        frase(
          "Questo file non l'hai scelto tu dall'app: lascialo sulla finestra di Mango Animation, o copialo in Esplora risorse e incollalo qui.",
          "You did not pick this file in the app: drop it on the Mango Animation window, or copy it in File Explorer and paste it here.",
        ),
      )
    }
    const stato = await statistica(percorso)
    if (!stato?.isFile()) throw new ErroreChat(400, frase(`Il file «${percorso}» non c'è, o è una cartella.`, `The file «${percorso}» is missing, or it is a folder.`))
    if (stato.size === 0) throw new ErroreChat(400, FILE_VUOTO)
    // Un file grande (un video) si collega, non si copia: il disco è prezioso.
    if (stato.size > LIMITE_ALLEGATO_BYTE) return risposta({ percorso: await chat.collegaAllegato(percorso) }, 201)
    return risposta({ percorso: await chat.salvaAllegato(percorso, new Uint8Array(await Bun.file(percorso).arrayBuffer())) }, 201)
  }

  const rotte: RottaDellaChat[] = [
    ["GET", /^\/api\/chat$/, async () => risposta(await chat.elenco())],
    ["POST", /^\/api\/chat$/, async ({ req }) => risposta({ id: await chat.crea(await corpoJson(req)) }, 201)],
    ["POST", /^\/api\/chat\/allegati$/, caricaAllegato],
    ["POST", /^\/api\/chat\/allegati\/locale$/, copiaAllegato],
    ["GET", /^\/api\/chat\/modelli$/, async () => risposta(await chat.modelli())],
    ["GET", /^\/api\/chat\/comandi$/, async () => risposta(await chat.comandi())],
    ["GET", /^\/api\/chat\/([^/]+)$/, async (c) => risposta(await chat.leggi(parametro(c, 0)))],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/messaggi$/,
      async (c) => {
        await chat.scrivi(parametro(c, 0), await corpoJson(c.req))
        return risposta({ ok: true }, 202)
      },
    ],
    ["POST", /^\/api\/chat\/([^/]+)\/impostazioni$/, async (c) => risposta(await chat.impostazioni(parametro(c, 0), await corpoJson(c.req)))],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/ferma$/,
      async (c) => {
        await chat.ferma(parametro(c, 0))
        return risposta({ ok: true })
      },
    ],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/chiudi$/,
      async (c) => {
        await chat.chiudiConversazione(parametro(c, 0))
        return risposta({ ok: true })
      },
    ],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/background$/,
      async (c) => {
        await chat.inBackground(parametro(c, 0))
        return risposta({ ok: true })
      },
    ],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/task\/([^/]+)\/ferma$/,
      async (c) => {
        await chat.fermaTask(parametro(c, 0), parametro(c, 1))
        return risposta({ ok: true })
      },
    ],
    [
      "POST",
      /^\/api\/chat\/([^/]+)\/risposte\/([^/]+)$/,
      async (c) => {
        await chat.rispondi(parametro(c, 0), parametro(c, 1), await corpoJson(c.req))
        return risposta({ ok: true })
      },
    ],
  ]
  return rotte.map(([metodo, modello, gestore]) => [metodo, modello, conErrori(gestore)])
}
