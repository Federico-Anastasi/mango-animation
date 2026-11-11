// Ciò che hanno in comune i file che entrano nel girato da fuori, dal telefono (`ricevitore.ts`) e dal computer (`aggiungi.ts`):
// i generi accettati, il margine di spazio sul disco e la scrittura a pezzi su un temporaneo, mai intera in memoria.
import { statfs } from "node:fs/promises"
import { frase } from "../lingua"
import { ErroreArrivo, grandezza } from "./errore"
import type { Scrittore } from "./multipart"
import type { TipoArrivo } from "./nomi"

export const ACCETTATI: TipoArrivo[] = ["video", "audio", "immagine"]
export const MARGINE_DISCO = 512 * 1024 ** 2
const CONTROLLO_DISCO_OGNI = 256 * 1024 ** 2

export async function spazioDelDisco(cartella: string): Promise<number> {
  const s = await statfs(cartella)
  return Number(s.bavail) * Number(s.bsize)
}

export type SpazioLibero = (cartella: string) => number | Promise<number>

/** Un file che arriva a pezzi su `parziale`: tiene il conto dei byte, ferma chi supera il massimo o riempie il disco. */
export class Scrittura {
  scritti = 0
  private readonly file
  private ultimoControllo = 0
  private readonly spazioFinito = new ErroreArrivo(507, frase("Lo spazio sul computer è finito mentre il file arrivava. Libera spazio e riprova.", "The computer ran out of space while the file was arriving. Free some space and try again."))

  constructor(
    parziale: string,
    private readonly limiteByte: number,
    private readonly spazioLibero: SpazioLibero,
    /** La cartella di cui si misura lo spazio libero. */
    private readonly cartella: string,
  ) {
    this.file = Bun.file(parziale).writer({ highWaterMark: 4 * 1024 ** 2 })
  }

  readonly scrittore: Scrittore = {
    scrivi: async (pezzo) => {
      this.scritti += pezzo.byteLength
      if (this.scritti > this.limiteByte) throw new ErroreArrivo(413, frase(`Il file supera il massimo di ${grandezza(this.limiteByte)}.`, `The file is over the ${grandezza(this.limiteByte, "en")} limit.`))
      if (this.scritti - this.ultimoControllo >= CONTROLLO_DISCO_OGNI) {
        this.ultimoControllo = this.scritti
        if ((await this.spazioLibero(this.cartella)) < MARGINE_DISCO / 2) throw this.spazioFinito
      }
      try {
        this.file.write(pezzo)
        await this.file.flush()
      } catch (errore) {
        if ((errore as NodeJS.ErrnoException).code === "ENOSPC") throw this.spazioFinito
        throw errore
      }
    },
  }

  /** Il corpo intero di una richiesta. */
  async daFlusso(corpo: ReadableStream<Uint8Array>): Promise<void> {
    const lettore = corpo.getReader()
    for (;;) {
      const { done, value } = await lettore.read()
      if (done) break
      await this.scrittore.scrivi(value)
    }
  }

  /** Chiude il file: se il disco si riempie proprio qui, è lo stesso errore. */
  async chiudi(): Promise<void> {
    try {
      await this.file.end()
    } catch (errore) {
      if ((errore as NodeJS.ErrnoException).code === "ENOSPC") throw this.spazioFinito
      throw errore
    }
  }
}
