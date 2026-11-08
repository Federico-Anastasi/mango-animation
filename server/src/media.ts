// I file: l'archivio (`/media/…`) con `Range` per i video che si scorrono, i caratteri (`/font/…`) e
// l'interfaccia costruita. Nessun percorso esce dalla cartella da cui si serve.
import type { Stats } from "node:fs"
import { open } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { linguaDellaPagina } from "./accesso"
import { statistica } from "./disco"
import { frase, linguaDi, nellaLinguaDi, type Lingua, type Testo } from "./lingua"

const nonTrovato = (req: Request, testo: Testo): Response => Response.json({ errore: nellaLinguaDi(testo, linguaDi(req)) }, { status: 404 })
const FILE_MANCANTE = frase("Il file non c'è.", "The file is not there.")

/** Il percorso assoluto di `relativo` dentro `radice`, o `null` se è assoluto, ha `..` o esce in qualunque altro modo. */
export function percorsoSicuro(radice: string, relativo: string): string | null {
  if (relativo.includes("\0") || relativo.includes("\\") || relativo.startsWith("/") || relativo.includes(":")) return null
  const parti = relativo.split("/").filter((p) => p.length > 0)
  if (parti.some((p) => p === ".." || p === ".")) return null
  const base = resolve(radice)
  const percorso = resolve(base, ...parti)
  return percorso === base || percorso.startsWith(base + sep) ? percorso : null
}

/**
 * I file dell'archivio che `/media/` non serve: chiavi, sessioni e registri degli arrivi e dello studio sulla rete, le cartelle nascoste
 * (lo stato della chat, git), tranne gli allegati della chat che lo studio mostra. Le maiuscole non contano: il disco non le distingue.
 */
export function nonSiServe(relativo: string): boolean {
  const parti = relativo.toLowerCase().split("/").filter((p) => p.length > 0)
  if (parti[0] === "arrivi") return true
  const allegato = parti[0] === ".chat" && parti[1] === "allegati"
  return !allegato && parti.some((p) => p.startsWith("."))
}

export function decodifica(parte: string): string | null {
  try {
    return decodeURIComponent(parte)
  } catch {
    return null
  }
}

function intervallo(intestazione: string, dimensione: number): { inizio: number; fine: number } | "fuori" | null {
  const trovato = /^bytes=(\d*)-(\d*)$/.exec(intestazione.trim())
  if (!trovato || (trovato[1] === "" && trovato[2] === "")) return null
  const [, da = "", a = ""] = trovato
  if (da === "") {
    const ultimi = Number(a)
    return ultimi === 0 || dimensione === 0 ? "fuori" : { inizio: Math.max(0, dimensione - ultimi), fine: dimensione - 1 }
  }
  const inizio = Number(da)
  const fine = a === "" ? dimensione - 1 : Math.min(Number(a), dimensione - 1)
  return inizio >= dimensione || fine < inizio ? "fuori" : { inizio, fine }
}

// Su Windows un file aperto non si sostituisce, e il lettore dello studio tiene la richiesta aperta anche a video fermo: un montaggio
// non riusciva a scrivere il `finale.mp4` nuovo. Il file si tiene aperto solo il tempo di leggere un pezzo, mai mentre si spedisce.
const PEZZO = 4 * 1024 * 1024

async function leggi(percorso: string, inizio: number, fine: number, stato: Stats): Promise<Uint8Array> {
  const file = await open(percorso, "r")
  try {
    const ora = await file.stat()
    if (ora.size !== stato.size || ora.mtimeMs !== stato.mtimeMs) throw new Error("il file è cambiato mentre si leggeva")
    const pezzo = new Uint8Array(fine + 1 - inizio)
    const { bytesRead } = await file.read(pezzo, 0, pezzo.length, inizio)
    if (bytesRead < pezzo.length) throw new Error("il file è finito prima del previsto")
    return pezzo
  } finally {
    await file.close()
  }
}

/** Un file intero più grande di un pezzo, un pezzo alla volta; se intanto cambia (un montaggio nuovo), il flusso si interrompe
 * invece di mescolare due versioni. Bun lo manda a blocchi, senza lunghezza. */
function aPezzi(percorso: string, stato: Stats): ReadableStream<Uint8Array> {
  let posto = 0
  return new ReadableStream(
    {
      async pull(flusso) {
        const fine = Math.min(posto + PEZZO, stato.size) - 1
        flusso.enqueue(await leggi(percorso, posto, fine, stato))
        posto = fine + 1
        if (posto >= stato.size) flusso.close()
      },
    },
    { highWaterMark: 0 },
  )
}

export async function serviFile(req: Request, percorso: string, cache: string): Promise<Response> {
  const stato = await statistica(percorso)
  if (!stato?.isFile()) return nonTrovato(req, FILE_MANCANTE)
  const intestazioni: Record<string, string> = { "Content-Type": Bun.file(percorso).type, "Accept-Ranges": "bytes", "Cache-Control": cache, "Last-Modified": new Date(stato.mtimeMs).toUTCString() }
  const testa = req.method === "HEAD"

  const richiesto = req.headers.get("range")
  const parte = richiesto ? intervallo(richiesto, stato.size) : null
  if (parte === "fuori") return new Response(null, { status: 416, headers: { ...intestazioni, "Content-Range": `bytes */${stato.size}` } })
  if (!parte) {
    const corpo = testa || stato.size === 0 ? null : stato.size <= PEZZO ? await leggi(percorso, 0, stato.size - 1, stato) : aPezzi(percorso, stato)
    return new Response(corpo, { headers: { ...intestazioni, "Content-Length": String(stato.size) } })
  }
  // Un intervallo lungo si accorcia a un pezzo: è ammesso, e il lettore chiede il seguito quando gli serve.
  const fine = Math.min(parte.fine, parte.inizio + PEZZO - 1)
  return new Response(testa ? null : await leggi(percorso, parte.inizio, fine, stato), {
    status: 206,
    headers: { ...intestazioni, "Content-Range": `bytes ${parte.inizio}-${fine}/${stato.size}`, "Content-Length": String(fine - parte.inizio + 1) },
  })
}

const TESTO_DA_COSTRUIRE: Record<Lingua, string> = {
  it: "<h1>L'interfaccia non è ancora costruita</h1><p>Il server funziona, ma manca la cartella con l'interfaccia. Costruiscila con <code>bun run --cwd studio build</code> e ricarica questa pagina.</p>",
  en: "<h1>The interface is not built yet</h1><p>The server works, but the folder with the interface is missing. Build it with <code>bun run --cwd studio build</code> and reload this page.</p>",
}

const daCostruire = (lingua: Lingua): string => `<!doctype html>
<html lang="${lingua}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mango Animation</title>
<style>body{margin:0;background:#F1F0EB;color:#17171B;font:17px/1.5 system-ui,sans-serif;padding:48px 16px;max-width:560px;margin-inline:auto}code{background:#E4E2D9;padding:2px 6px}@media(prefers-color-scheme:dark){body{background:#17171B;color:#F1F0EB}code{background:#232328}}</style>
</head><body>${TESTO_DA_COSTRUIRE[lingua]}</body></html>`

/** L'interfaccia costruita: il file chiesto, oppure `index.html` per le rotte dell'interfaccia. */
export async function serviStudio(req: Request, cartella: string, pathname: string): Promise<Response> {
  const indice = join(cartella, "index.html")
  if (!(await statistica(indice))) return new Response(daCostruire(linguaDellaPagina(req)), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
  const relativo = decodifica(pathname.slice(1))
  const percorso = relativo === null ? null : relativo === "" ? indice : percorsoSicuro(cartella, relativo)
  if (percorso === null) return nonTrovato(req, frase("Questo indirizzo non esiste.", "This address does not exist."))
  if ((await statistica(percorso))?.isFile()) return serviFile(req, percorso, pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
  return /\.[a-z0-9]+$/i.test(pathname) ? nonTrovato(req, FILE_MANCANTE) : serviFile(req, indice, "no-cache")
}
