// L'immagine di un file del girato appena entra, senza aspettare che venga preparato: lo stesso file, nello stesso
// posto e con le stesse misure di `motore/prepara.py`, che trovandolo non lo rifà. Un fotogramma solo, in un lavoro di sfondo.
// Una HEIC no: ffmpeg ne legge un riquadro, la sua miniatura la fa il motore. Un audio no: non ha niente da vedere.
// Lo stesso per la prova di un video (`uscite/prova.mp4`), che ha la sua immagine accanto (`uscite/prova.jpg`).
import { mkdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { Percorsi } from "./configurazione"
import { rimuovi, rinomina, statistica } from "./disco"
import { ESTENSIONI } from "./arrivi/nomi"
import { eHeic, leggiFile } from "./sonda"

export interface MisureMiniatura {
  /** Il lato lungo, in pixel. */
  lato: number
  /** A che punto della durata si prende il fotogramma, fra 0 e 1. */
  al: number
}

/** Il fotogramma d'inizio di un tratto si tiene al decimo di secondo: un'immagine per file e istante. */
export const decimiDi = (secondi: number): number => Math.max(0, Math.round(secondi * 10))
export const fotogrammaDi = (file: string, secondi: number): string => `preparati/${file}/fotogrammi/${decimiDi(secondi)}.jpg`

const eConEstensione = (tipo: keyof typeof ESTENSIONI, file: string): boolean => ESTENSIONI[tipo].includes(file.slice(file.lastIndexOf(".") + 1).toLowerCase())
const eAudio = (file: string): boolean => eConEstensione("audio", file)
/** Una foto ha un solo fotogramma: con `-ss` ffmpeg lo scarta e non scrive niente. */
const eFoto = (file: string): boolean => eConEstensione("immagine", file)
/** Da questi file l'immagine non si ricava dal server. */
const senzaImmagine = (file: string): boolean => eHeic(file) || eAudio(file)

export class Miniature {
  private readonly tentati = new Set<string>()
  private fila: Promise<void> = Promise.resolve()
  private fermate = false

  constructor(
    private readonly ffmpeg: string | null,
    private readonly ffprobe: string | null,
    private readonly percorsi: Percorsi,
    private readonly misure: () => MisureMiniatura | null,
    private readonly dopoScrittura: (percorsiRelativi: string[]) => Promise<void>,
  ) {}

  /** Una volta sola per file e per avvio: un file da cui non esce un fotogramma resta senza immagine. */
  programma(file: string, durata: number): void {
    if (this.ffmpeg === null || senzaImmagine(file) || this.tentati.has(file)) return
    this.tentati.add(file)
    this.fila = this.fila.then(() => this.scrivi(file, durata)).catch((errore) => console.error(`miniatura di «${file}»: ${errore instanceof Error ? errore.message : String(errore)}`))
  }

  attendi(): Promise<void> {
    return this.fila
  }

  /** Ciò che è in fila non parte più; il fotogramma in corso finisce. */
  ferma(): Promise<void> {
    this.fermate = true
    return this.fila
  }

  /** Il fotogramma d'inizio di ogni tratto, in fila dopo le altre immagini; quelli già fatti non si rifanno. */
  programmaFotogrammi(richieste: Array<{ file: string; da: number }>): void {
    if (this.ffmpeg === null) return
    for (const { file, da } of richieste) {
      const relativo = fotogrammaDi(file, da)
      if (senzaImmagine(file) || this.tentati.has(relativo)) continue
      this.tentati.add(relativo)
      this.fila = this.fila.then(() => this.scriviFotogramma(file, da, relativo)).catch((errore) => console.error(`fotogramma di «${file}» al secondo ${da}: ${errore instanceof Error ? errore.message : String(errore)}`))
    }
  }

  /** La prova di un video: `cambiata` è la sua data di modifica, e una prova rifatta è una prova nuova. */
  programmaProva(slug: string, cambiata: number): void {
    const chiave = `prova:${slug}:${cambiata}`
    if (this.ffmpeg === null || this.ffprobe === null || this.tentati.has(chiave)) return
    this.tentati.add(chiave)
    this.fila = this.fila.then(() => this.scriviProva(slug)).catch((errore) => console.error(`miniatura della prova di «${slug}»: ${errore instanceof Error ? errore.message : String(errore)}`))
  }

  private async scrivi(file: string, durata: number): Promise<void> {
    const misure = this.misure()
    const destinazione = join(this.percorsi.preparato(file), "miniatura.jpg")
    if (this.fermate || misure === null || (await statistica(destinazione)) !== null) return
    await this.fotogramma(this.percorsi.grezzo(file), destinazione, durata * misure.al, misure.lato)
    await this.dopoScrittura([`preparati/${file}/miniatura.jpg`])
  }

  private async scriviFotogramma(file: string, da: number, relativo: string): Promise<void> {
    const misure = this.misure()
    const destinazione = join(this.percorsi.archivio, relativo)
    if (this.fermate || misure === null || (await statistica(destinazione)) !== null) return
    await this.fotogramma(this.percorsi.grezzo(file), destinazione, decimiDi(da) / 10, misure.lato)
    await this.dopoScrittura([relativo])
  }

  private async scriviProva(slug: string): Promise<void> {
    const misure = this.misure()
    const prova = join(this.percorsi.uscite(slug), "prova.mp4")
    if (this.fermate || this.ffprobe === null || misure === null) return
    const durata = (await leggiFile(this.ffprobe, prova))?.misure.durata
    if (durata === undefined) throw new Error("ffprobe non ne ha letto la durata, il video resta senza immagine.")
    await this.fotogramma(prova, join(this.percorsi.uscite(slug), "prova.jpg"), durata * misure.al, misure.lato)
    await this.dopoScrittura([`video/${slug}/uscite/prova.jpg`])
  }

  /** Un fotogramma di `sorgente` al secondo `al`, messo a posto solo se intero. */
  private async fotogramma(sorgente: string, destinazione: string, al: number, lato: number): Promise<void> {
    if (this.ffmpeg === null) return
    await mkdir(dirname(destinazione), { recursive: true })
    // Si scrive accanto e si mette a posto alla fine: un file a metà non passa per fatto.
    const parziale = join(dirname(destinazione), `.${basename(destinazione, ".jpg")}.parziale.jpg`)
    const scala = `scale='if(gt(iw,ih),${lato},-2)':'if(gt(iw,ih),-2,${lato})':flags=lanczos`
    const istante = eFoto(sorgente) ? [] : ["-ss", al.toFixed(2)]
    const processo = Bun.spawn([this.ffmpeg, "-v", "error", "-nostdin", ...istante, "-i", sorgente, "-frames:v", "1", "-vf", scala, "-f", "image2", "-y", parziale], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    })
    if ((await processo.exited) !== 0 || (await statistica(parziale)) === null) {
      await rimuovi(parziale)
      throw new Error("ffmpeg non ne ha ricavato un fotogramma, il file resta senza immagine.")
    }
    // L'immagine di prima può essere aperta da chi la legge (lo studio che la mostra): Windows allora rifiuta di sostituirla.
    await rinomina(parziale, destinazione).catch(async (errore: unknown) => {
      await rimuovi(parziale)
      throw errore
    })
  }
}
