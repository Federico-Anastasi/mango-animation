// Scarica dal web un video, o solo un suo tratto, nel girato: lo fa yt-dlp, in una cartella d'appoggio; il file e la sua
// scheda li mette al loro posto il server, come per un arrivo dal telefono (`archivio/grezzo/` non lo scrive il motore).
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { nomeDaTitolo, nomePulito } from "./arrivi/nomi"
import { nomeLibero } from "./arrivi/ricevitore"
import { jsonDaTesto, leggiTesto, rimuovi, rinomina, scrivi, statistica, testoJson } from "./disco"
import type { IoLavoro } from "./coda"
import { leggiFile } from "./sonda"
import { giornoLocale, isoLocale } from "./tempo"
import { ErroreConFrase, frase, nellaLinguaDi } from "./lingua"

export const COMANDO_SCARICA = "scarica"

/** Una richiesta che non va: la frase dice cosa correggere. */
export class ErroreScarico extends ErroreConFrase {}

export interface RichiestaScarico {
  url: string
  /** Secondi da cui scaricare; `null` se non si è detto. */
  da: number | null
  a: number | null
  nome: string | null
}

export interface MisureScarico {
  altezzaMassima: number
  codecVideo: string
  codecAudio: string
}

export interface ContestoScarico {
  ytdlp: string[]
  ffprobe: string | null
  misure: MisureScarico
  /** Dove yt-dlp lavora: una cartella per scarico, tolta alla fine. */
  cartellaScarichi: string
  cartellaGrezzo: string
  adesso: () => Date
  cambiati: (relativi: string[]) => Promise<void>
}

const CAMPI = ["url", "da", "a", "nome"]
const NOME_D_APPOGGIO = "scarico"
const ESTENSIONE_VIDEO = /\.(mp4|m4v|mov|mkv|webm|avi)$/i
const NON_E_UN_INDIRIZZO = frase("«url» non è un indirizzo web: deve cominciare per http:// o https://.", "«url» is not a web address: it must start with http:// or https://.")

/** Le misure dello scarico in `stile.json` (sezione `scarico`), o `null` se mancano o non sono numeri e testi. */
export function misureScarico(stile: unknown): MisureScarico | null {
  const scarico = (stile as { scarico?: Record<string, unknown> } | null)?.scarico
  const altezza = scarico?.["altezza_massima"]
  const video = scarico?.["codec_video"]
  const audio = scarico?.["codec_audio"]
  if (typeof altezza !== "number" || !(altezza > 0) || typeof video !== "string" || video === "" || typeof audio !== "string" || audio === "") return null
  return { altezzaMassima: altezza, codecVideo: video, codecAudio: audio }
}

/** Un istante del video in secondi: un numero, «90», «1:30» o «1:02:03». `null` se manca. */
function istante(valore: unknown, campo: string): number | null {
  if (valore === undefined || valore === null) return null
  const sbagliato = new ErroreScarico(
    frase(
      `«${campo}» dev'essere un istante del video: secondi (90 o 12.5) oppure minuti e secondi (1:30).`,
      `«${campo}» must be a moment in the video: seconds (90 or 12.5) or minutes and seconds (1:30).`,
    ),
  )
  if (typeof valore === "number") {
    if (!Number.isFinite(valore) || valore < 0) throw sbagliato
    return valore
  }
  if (typeof valore !== "string") throw sbagliato
  const parti = valore.trim().split(":")
  if (parti.length > 3 || !parti.every((p, i) => (i === parti.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(p))) throw sbagliato
  const [secondi = 0, minuti = 0, ore = 0] = parti.map(Number).reverse()
  if ((parti.length > 1 && secondi >= 60) || (parti.length === 3 && minuti >= 60)) throw sbagliato
  return ore * 3600 + minuti * 60 + secondi
}

export function leggiRichiesta(corpo: Record<string, unknown>): RichiestaScarico {
  for (const campo of Object.keys(corpo)) {
    if (!CAMPI.includes(campo)) throw new ErroreScarico(frase(`«${campo}» non è un campo di questa richiesta: ci sono ${CAMPI.join(", ")}.`, `«${campo}» is not a field of this request: the fields are ${CAMPI.join(", ")}.`))
  }
  const { url, nome } = corpo
  if (typeof url !== "string" || url.trim() === "") throw new ErroreScarico(frase("Manca «url»: l'indirizzo del video da scaricare.", "«url» is missing: the address of the video to download."))
  let indirizzo: URL
  try {
    indirizzo = new URL(url.trim())
  } catch {
    throw new ErroreScarico(NON_E_UN_INDIRIZZO)
  }
  if (indirizzo.protocol !== "http:" && indirizzo.protocol !== "https:") throw new ErroreScarico(NON_E_UN_INDIRIZZO)
  const da = istante(corpo["da"], "da")
  const a = istante(corpo["a"], "a")
  if (a !== null && a <= (da ?? 0)) throw new ErroreScarico(frase("«a» deve venire dopo «da» (o dopo l'inizio del video, se «da» manca).", "«a» must come after «da» (or after the start of the video, if «da» is missing)."))
  if (nome !== undefined && nome !== null && typeof nome !== "string") throw new ErroreScarico(frase("«nome» dev'essere un testo: il nome del file, senza cartelle.", "«nome» must be text: the file name, without folders."))
  return { url: url.trim(), da, a, nome: typeof nome === "string" && nome.trim() !== "" ? nome.trim() : null }
}

/** Come si dice il tratto a yt-dlp: `*90-100.5`, o `*10-inf` fino alla fine. */
const sezione = ({ da, a }: RichiestaScarico): string => `*${da ?? 0}-${a ?? "inf"}`

export function argomentiYtdlp(richiesta: RichiestaScarico, misure: MisureScarico, modello: string): string[] {
  const { altezzaMassima: altezza, codecVideo: video, codecAudio: audio } = misure
  // «?» dopo l'operatore: un formato di cui il sito non dice altezza o codec resta ammesso (sennò un video senza quei dati non si scarica).
  const formato = [`bv*[vcodec^=?${video}][height<=?${altezza}]+ba[acodec^=?${audio}]`, `b[vcodec^=?${video}][height<=?${altezza}]`, `bv*[height<=?${altezza}]+ba`, `b[height<=?${altezza}]`].join("/")
  const tratto = richiesta.da !== null || richiesta.a !== null
  return [
    "--no-playlist",
    "--playlist-items",
    "1",
    "-f",
    formato,
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    ...(tratto ? ["--download-sections", sezione(richiesta), "--force-keyframes-at-cuts"] : []),
    "--write-info-json",
    "--newline",
    "-o",
    modello,
    "--",
    richiesta.url,
  ]
}

const testoDi = (valore: unknown): string | undefined => (typeof valore === "string" && valore.trim() !== "" ? valore.trim() : undefined)

export async function scarica(c: ContestoScarico, richiesta: RichiestaScarico, io: IoLavoro): Promise<void> {
  const cartella = join(c.cartellaScarichi, randomUUID().slice(0, 8))
  await mkdir(cartella, { recursive: true })
  try {
    const { codice, ultimoErrore } = await io.lancia([...c.ytdlp, ...argomentiYtdlp(richiesta, c.misure, join(cartella, `${NOME_D_APPOGGIO}.%(ext)s`))])
    if (io.fermato()) return
    if (codice !== 0) {
      if (ultimoErrore === null) io.riga(nellaLinguaDi(frase(`yt-dlp è uscito con codice ${codice}.`, `yt-dlp exited with code ${codice}.`), io.lingua))
      throw new ErroreConFrase(
        ultimoErrore === null
          ? frase("Lo scarico non è riuscito: guarda le ultime righe del lavoro.", "The download did not work: look at the last lines of the job.")
          : frase(`Lo scarico non è riuscito: ${ultimoErrore}`, `The download did not work: ${ultimoErrore}`),
      )
    }
    const video = join(cartella, `${NOME_D_APPOGGIO}.mp4`)
    if (!(await statistica(video))?.isFile()) throw new ErroreConFrase(frase("Lo scarico è finito ma il video non c'è: guarda le ultime righe del lavoro.", "The download finished but the video is not there: look at the last lines of the job."))

    const testoInfo = await leggiTesto(join(cartella, `${NOME_D_APPOGGIO}.info.json`))
    const letto = testoInfo === null ? undefined : jsonDaTesto(testoInfo)?.valore
    const info = typeof letto === "object" && letto !== null ? (letto as Record<string, unknown>) : {}
    const titolo = testoDi(info["title"])
    const canale = testoDi(info["channel"]) ?? testoDi(info["uploader"])
    const misure = c.ffprobe ? (await leggiFile(c.ffprobe, video))?.misure : undefined
    if (io.fermato()) return

    const quando = c.adesso()
    const giorno = giornoLocale(quando)
    const cartellaDelGiorno = join(c.cartellaGrezzo, giorno)
    await mkdir(cartellaDelGiorno, { recursive: true })
    const voluto = richiesta.nome === null ? null : nomePulito(richiesta.nome).replace(ESTENSIONE_VIDEO, "")
    const base = voluto ?? (titolo ? nomeDaTitolo(titolo) : null) ?? nomeDaTitolo(testoDi(info["id"]) ?? "") ?? "scaricato"
    const nome = await nomeLibero(cartellaDelGiorno, `${base}.mp4`)
    const tratto = richiesta.da !== null || richiesta.a !== null ? { da: richiesta.da ?? 0, ...(richiesta.a === null ? {} : { a: richiesta.a }) } : undefined
    // La scheda prima del file, come per un arrivo dal telefono: il file non compare mai senza.
    await scrivi(
      join(cartellaDelGiorno, `${nome}.scheda.json`),
      testoJson({ tipo: "altro", origine: "scaricato", arrivato: isoLocale(quando), note: "", ...misure, url: richiesta.url, ...(tratto && { tratto }), ...(titolo && { titolo }), ...(canale && { canale }) }),
    )
    await rinomina(video, join(cartellaDelGiorno, nome))
    await c.cambiati([`grezzo/${giorno}/${nome}.scheda.json`, `grezzo/${giorno}/${nome}`])
    io.riga(nellaLinguaDi(frase(`Scaricato: ${giorno}/${nome}`, `Downloaded: ${giorno}/${nome}`), io.lingua))
  } finally {
    await rimuovi(cartella)
  }
}
