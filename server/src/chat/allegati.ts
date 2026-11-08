// Gli allegati di un messaggio e il testo che arriva a Claude: il contesto davanti, i percorsi degli allegati dietro.
// Le stesse righe si riconoscono quando la conversazione si rilegge dal suo file.
import { link, mkdir, symlink } from "node:fs/promises"
import { basename, isAbsolute, join, parse, relative } from "node:path"
import { scrivi, statistica } from "../disco"
import { percorsoSicuro } from "../media"
import { eComando } from "./comandi"
import { eOggetto } from "./traduzione"
import { ErroreChat, type Parte } from "./tipi"

export const CARTELLA_ALLEGATI = ".chat/allegati"
type TipoImmagine = "image/png" | "image/jpeg" | "image/gif" | "image/webp"
const TIPI_IMMAGINE: Record<string, TipoImmagine> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" }
/** Oltre questa grandezza l'API rifiuta l'immagine: arriva a Claude solo come percorso. */
const LIMITE_IMMAGINE_BYTE = 5 * 1024 ** 2

export interface Contesto {
  video?: string
  vista?: string
}

export interface Allegato {
  /** Relativo all'archivio, con `/`. */
  percorso: string
  assoluto: string
  tipoImmagine: TipoImmagine | null
  byte: number
}

export type BloccoDiIngresso = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: TipoImmagine; data: string } }

const tipoImmagineDi = (percorso: string): TipoImmagine | null => TIPI_IMMAGINE[parse(percorso).ext.toLowerCase()] ?? null

/** Solo il nome del file, senza cartelle né caratteri che Windows non ammette. */
function nomeSicuro(nome: string): string {
  const pulito = (nome.split(/[\\/]/).pop() ?? "").replace(/[\0-\x1f<>:"|?*]/g, "_").replace(/^\.+/, "").trim()
  return pulito === "" ? "allegato" : pulito.slice(0, 120)
}

/** `archivio/.chat/`, che git ignora da sé. */
export async function cartellaDellaChat(archivio: string): Promise<string> {
  const cartella = join(archivio, ".chat")
  if ((await statistica(join(cartella, ".gitignore"))) === null) await scrivi(join(cartella, ".gitignore"), "*\n")
  return cartella
}

/** Salva un file arrivato dalla chat col nome dato (uno già preso non si sovrascrive: una conversazione vecchia lo cita). */
export async function salvaAllegato(archivio: string, nome: string, contenuto: Uint8Array): Promise<string> {
  const cartella = join(archivio, CARTELLA_ALLEGATI)
  const { name, ext } = parse(nomeSicuro(nome))
  await cartellaDellaChat(archivio)
  let candidato = `${name}${ext}`
  for (let n = 2; (await statistica(join(cartella, candidato))) !== null; n++) candidato = `${name}-${n}${ext}`
  await scrivi(join(cartella, candidato), contenuto)
  return `${CARTELLA_ALLEGATI}/${candidato}`
}

/**
 * Mette fra gli allegati un file del computer senza copiarlo: un hard link, o un collegamento simbolico se sta su un altro disco
 * (come i video spostati dell'archivio). Un file grande non si copia mai: se non si collega, è un errore.
 */
export async function collegaAllegato(archivio: string, originale: string): Promise<string> {
  const cartella = join(archivio, CARTELLA_ALLEGATI)
  const { name, ext } = parse(nomeSicuro(basename(originale)))
  await mkdir(cartella, { recursive: true })
  await cartellaDellaChat(archivio)
  let candidato = `${name}${ext}`
  for (let n = 2; (await statistica(join(cartella, candidato))) !== null; n++) candidato = `${name}-${n}${ext}`
  const dove = join(cartella, candidato)
  try {
    await link(originale, dove)
  } catch (errore) {
    if (!(eOggetto(errore) && errore["code"] === "EXDEV")) throw new ErroreChat(500, `Non riesco a collegare il file fra gli allegati: ${errore instanceof Error ? errore.message : String(errore)}`)
    await symlink(originale, dove, "file").catch((e: unknown) => {
      throw new ErroreChat(500, `Il file sta su un altro disco e non riesco a collegarlo: ${e instanceof Error ? e.message : String(e)}`)
    })
  }
  return `${CARTELLA_ALLEGATI}/${candidato}`
}

/** Controlla gli `allegati` di una richiesta: percorsi relativi all'archivio, file che esistono. */
export async function risolviAllegati(archivio: string, valore: unknown): Promise<Allegato[]> {
  if (valore === undefined) return []
  if (!Array.isArray(valore)) throw new ErroreChat(400, "«allegati» deve essere un elenco di file, ciascuno come { percorso }.")
  const allegati: Allegato[] = []
  for (const voce of valore) {
    const percorso = eOggetto(voce) ? voce["percorso"] : undefined
    if (typeof percorso !== "string") throw new ErroreChat(400, "Ogni allegato è un oggetto con il suo «percorso», quello che ha dato il caricamento.")
    const assoluto = percorsoSicuro(archivio, percorso)
    const stato = assoluto === null ? null : await statistica(assoluto)
    if (assoluto === null || !stato?.isFile()) throw new ErroreChat(400, `L'allegato «${percorso}» non c'è: caricalo di nuovo e riprova.`)
    allegati.push({ percorso, assoluto, tipoImmagine: tipoImmagineDi(percorso), byte: stato.size })
  }
  return allegati
}

/** Controlla il `contesto` di una richiesta. */
export function leggiContesto(valore: unknown): Contesto | undefined {
  if (valore === undefined) return undefined
  if (!eOggetto(valore)) throw new ErroreChat(400, "«contesto» deve essere un oggetto: { video?, vista? }.")
  for (const campo of Object.keys(valore)) {
    if (campo !== "video" && campo !== "vista") throw new ErroreChat(400, `«${campo}» non è un campo del contesto: ci sono «video» e «vista».`)
  }
  const { video, vista } = valore
  if (video !== undefined && (typeof video !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(video))) throw new ErroreChat(400, "Il «video» del contesto è il nome della sua cartella: lettere minuscole, numeri e trattini.")
  if (vista !== undefined && typeof vista !== "string") throw new ErroreChat(400, "La «vista» del contesto è un testo.")
  return { ...(video === undefined ? {} : { video }), ...(vista === undefined ? {} : { vista }) }
}

const senzaParentesi = (testo: string): string => testo.replaceAll("[", "(").replaceAll("]", ")").replace(/\s+/g, " ")

/** La riga che Claude legge davanti al messaggio, e che il creator non vede. */
export function rigaDiContesto(contesto: Contesto | undefined, titoloDelVideo: (slug: string) => string | undefined): string | null {
  if (!contesto?.video && !contesto?.vista) return null
  const video = contesto.video ? `the video «${senzaParentesi(titoloDelVideo(contesto.video) ?? contesto.video)}» (${contesto.video})` : null
  const vista = contesto.vista ? `${video ? ", " : ""}${video ? "tab" : "the page"} «${senzaParentesi(contesto.vista)}»` : ""
  return `[Context: the creator is looking at ${video ?? ""}${vista}.]`
}

/**
 * Ciò che Claude riceve: il contesto, il testo, i percorsi degli allegati; le immagini piccole anche come immagini.
 * Un comando con la barra arriva com'è scritto, perché Claude Code lo riconosce solo all'inizio: senza contesto davanti né immagini.
 */
export async function ingressoPerClaude(testo: string, riga: string | null, allegati: Allegato[]): Promise<string | BloccoDiIngresso[]> {
  const comando = eComando(testo)
  const completo = [comando ? null : riga, testo, ...allegati.map((a) => `[Allegato: ${a.assoluto}]`)].filter((p): p is string => p !== null && p !== "").join("\n\n")
  if (comando) return completo
  const immagini = allegati.flatMap((a) => (a.tipoImmagine !== null && a.byte <= LIMITE_IMMAGINE_BYTE ? [{ assoluto: a.assoluto, tipo: a.tipoImmagine }] : []))
  if (immagini.length === 0) return completo
  const blocchi = await Promise.all(
    immagini.map(async ({ assoluto, tipo }): Promise<BloccoDiIngresso> => ({ type: "image", source: { type: "base64", media_type: tipo, data: Buffer.from(await Bun.file(assoluto).arrayBuffer()).toString("base64") } })),
  )
  return [...blocchi, { type: "text", text: completo }]
}

/** Le Parti con cui la chat mostra il messaggio del creator: gli allegati, poi il testo. */
export const partiDelCreator = (testo: string, allegati: Allegato[]): Parte[] => [
  ...allegati.map((a): Parte => ({ tipo: "allegato", percorso: a.percorso, immagine: a.tipoImmagine !== null })),
  ...(testo === "" ? [] : [{ tipo: "testo" as const, testo }]),
]

// «Contesto» è la riga com'era scritta nelle conversazioni già salvate.
const CONTESTO = /^\[(?:Context|Contesto): [^\]]*\]\s*/
const ALLEGATO = /\s*\[Allegato: ([^\]\n]+)\]/g

/** Il contrario di `ingressoPerClaude`, per un messaggio del creator letto dal file di una conversazione. */
export function daTestoDelCreator(testo: string, archivio: string): Parte[] {
  const senzaContesto = testo.replace(CONTESTO, "")
  const percorsi = [...senzaContesto.matchAll(ALLEGATO)].map((m) => m[1] ?? "")
  const senzaAllegati = senzaContesto.replace(ALLEGATO, "").trim()
  const allegati = percorsi.map((assoluto): Parte => {
    const dalLArchivio = relative(archivio, assoluto)
    const dentro = dalLArchivio !== "" && !dalLArchivio.startsWith("..") && !isAbsolute(dalLArchivio)
    return { tipo: "allegato", percorso: dentro ? dalLArchivio.replaceAll("\\", "/") : assoluto, immagine: tipoImmagineDi(assoluto) !== null }
  })
  return [...allegati, ...(senzaAllegati === "" ? [] : [{ tipo: "testo" as const, testo: senzaAllegati }])]
}

/** Il titolo di una conversazione dal testo del primo messaggio del creator (com'è nel file). */
export function testoVisibile(testo: string): string {
  return testo.replace(CONTESTO, "").replace(ALLEGATO, "").trim()
}
