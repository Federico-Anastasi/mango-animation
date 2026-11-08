// Durata e misure di un file del girato, con ffprobe, in un lavoro di sfondo che scrive la scheda.
// Mai dentro una rotta di lettura: la rotta mostra ciò che la scheda dice.
import { basename } from "node:path"
import { jsonDaTesto, leggiTesto, scrivi, statistica, testoJson } from "./disco"
import type { Percorsi } from "./configurazione"
import { isoLocale } from "./tempo"

export interface Misure {
  durata?: number
  largo?: number
  alto?: number
  fps?: number
}

interface FlussoFfprobe {
  codec_type?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  r_frame_rate?: string
  tags?: Record<string, string>
  side_data_list?: { rotation?: number }[]
}

const arrotonda = (n: number): number => Math.round(n * 100) / 100

function frequenza(testo: string | undefined): number | undefined {
  const [su, giu] = (testo ?? "").split("/").map(Number)
  return su !== undefined && giu !== undefined && giu > 0 && su > 0 ? arrotonda(su / giu) : undefined
}

export interface Lettura {
  misure: Misure
}

/** Una HEIC o HEIF: per ffprobe è una griglia di riquadri, e durata e misure che ne dà sono quelle del riquadro. */
export const eHeic = (nome: string): boolean => /\.(heic|heif)$/i.test(nome)

/** `nome` è come si chiama il file per chi lo ha mandato, quando `percorso` è un nome provvisorio (un file che aspetta di essere collocato). */
export async function leggiFile(ffprobe: string, percorso: string, nome: string = percorso): Promise<Lettura | null> {
  if (eHeic(nome)) return { misure: {} }
  let testo: string
  try {
    const processo = Bun.spawn([ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", percorso], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [uscita, errori, codice] = await Promise.all([new Response(processo.stdout).text(), new Response(processo.stderr).text(), processo.exited])
    if (codice !== 0) {
      const motivo = errori.split(/\r?\n/).filter((r) => r.trim().length > 0).pop() ?? `uscito con codice ${codice}`
      console.error(`ffprobe non ha letto «${basename(nome)}»: ${motivo}`)
      return null
    }
    testo = uscita
  } catch (errore) {
    console.error(`ffprobe non parte (${errore instanceof Error ? errore.message : String(errore)}): controlla che ffmpeg sia installato.`)
    return null
  }
  const letto = jsonDaTesto(testo)?.valore as { format?: { duration?: string }; streams?: FlussoFfprobe[] } | undefined
  if (!letto) return null

  const durata = Number(letto.format?.duration)
  const video = letto.streams?.find((f) => f.codec_type === "video")
  // Un video girato in verticale con l'iPhone è memorizzato in orizzontale e ruotato: le misure vere sono quelle ruotate.
  const rotazione = Math.abs(video?.side_data_list?.find((d) => typeof d.rotation === "number")?.rotation ?? Number(video?.tags?.rotate ?? 0))
  const ruotato = rotazione === 90 || rotazione === 270
  const largo = ruotato ? video?.height : video?.width
  const alto = ruotato ? video?.width : video?.height
  const fps = frequenza(video?.avg_frame_rate) ?? frequenza(video?.r_frame_rate)
  return {
    misure: {
      ...(Number.isFinite(durata) && durata > 0 ? { durata: arrotonda(durata) } : {}),
      ...(largo ? { largo } : {}),
      ...(alto ? { alto } : {}),
      ...(fps ? { fps } : {}),
    },
  }
}

/** Aspetta che il file smetta di crescere: dimensione e data di modifica uguali a `fermoMs` di distanza. */
async function aspettaCheStiaFermo(percorso: string, fermoMs: number): Promise<boolean> {
  let prima = await statistica(percorso)
  while (prima) {
    await Bun.sleep(fermoMs)
    const dopo = await statistica(percorso)
    if (dopo && dopo.size === prima.size && dopo.mtimeMs === prima.mtimeMs) return true
    prima = dopo
  }
  return false
}

export class Sonda {
  private readonly tentati = new Set<string>()
  private fila: Promise<void> = Promise.resolve()

  constructor(
    private readonly ffprobe: string | null,
    private readonly percorsi: Percorsi,
    private readonly fermoMs: number,
    private readonly dopoScrittura: (percorsiRelativi: string[]) => Promise<void>,
  ) {}

  /** Una volta sola per file e per avvio: se la sonda non riesce, il file resta con la scheda minima e lo si corregge a mano. */
  programma(file: string): void {
    if (this.tentati.has(file)) return
    this.tentati.add(file)
    this.fila = this.fila.then(() => this.completa(file)).catch((errore) => console.error(`ffprobe su «${file}»: ${errore instanceof Error ? errore.message : String(errore)}`))
  }

  attendi(): Promise<void> {
    return this.fila
  }

  private async completa(file: string): Promise<void> {
    // Un file copiato a mano cresce per un po': misurato a metà darebbe una durata sbagliata.
    if (!(await aspettaCheStiaFermo(this.percorsi.grezzo(file), this.fermoMs))) return
    const lettura = this.ffprobe ? await leggiFile(this.ffprobe, this.percorsi.grezzo(file)) : null
    if (!lettura) console.error(this.ffprobe ? `«${file}» resta senza durata e misure.` : `ffprobe non è installato: «${file}» resta senza durata e misure. Installa ffmpeg e riavvia.`)

    // Una scheda che c'è già (scritta all'arrivo o da Claude) non si sovrascrive: le si aggiungono solo le misure che le mancano.
    const testo = await leggiTesto(this.percorsi.schedaGrezzo(file))
    if (testo !== null) {
      const scheda = jsonDaTesto(testo)?.valore
      if (!lettura || typeof scheda !== "object" || scheda === null || Array.isArray(scheda)) return
      const mancanti = Object.entries(lettura.misure).filter(([chiave]) => !(chiave in scheda))
      if (mancanti.length === 0) return
      await scrivi(this.percorsi.schedaGrezzo(file), testoJson({ ...scheda, ...Object.fromEntries(mancanti) }))
      await this.dopoScrittura([`grezzo/${file}.scheda.json`])
      return
    }
    const stato = await statistica(this.percorsi.grezzo(file))
    if (!stato) return
    await scrivi(this.percorsi.schedaGrezzo(file), testoJson({ tipo: "altro", origine: "altro", arrivato: isoLocale(stato.mtime), ...lettura?.misure }))
    await this.dopoScrittura([`grezzo/${file}.scheda.json`])
  }
}
