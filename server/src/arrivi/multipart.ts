// Il corpo `multipart/form-data` letto a pezzi, mai intero in memoria: un video pesa gigabyte. Ferma
// il primo campo che porta un nome di file e lo passa a chi scrive; gli altri campi si saltano.
import { frase } from "../lingua"
import { ErroreArrivo } from "./errore"

const MODULO_ILLEGGIBILE = frase("Il modulo mandato non si legge.", "The form that was sent cannot be read.")

export interface ParteFile {
  nome: string
  tipo: string | null
}

export interface Scrittore {
  scrivi(pezzo: Uint8Array): Promise<void>
}

const MAX_INTESTAZIONI = 16 * 1024

export function delimitatoreDi(contentType: string): string | null {
  return /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.slice(1).find(Boolean) ?? null
}

function nomeFileDi(intestazioni: string): string | null {
  const esteso = /filename\*\s*=\s*UTF-8''([^;\r\n]+)/i.exec(intestazioni)?.[1]
  if (esteso) {
    try {
      return decodeURIComponent(esteso)
    } catch {
      return esteso
    }
  }
  const semplice = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\r\n]+))/i.exec(intestazioni)
  const valore = semplice?.[1] ?? semplice?.[2]
  return valore === undefined ? null : valore.replace(/\\(.)/g, "$1")
}

/** `apri` si chiama una volta, alla prima parte con un nome di file, e può rifiutarla lanciando.
 * Torna se il corpo si è chiuso come deve (col delimitatore finale) e se un file c'era. */
export async function leggiMultipart(
  corpo: ReadableStream<Uint8Array>,
  delimitatore: string,
  apri: (parte: ParteFile) => Promise<Scrittore>,
): Promise<{ chiuso: boolean; file: boolean }> {
  const fine = Buffer.from(`\r\n--${delimitatore}`)
  let buf: Buffer = Buffer.from("\r\n")
  let fase = "inizio" as "inizio" | "dopo" | "intestazioni" | "file" | "salta" | "fine"
  let scrittore: Scrittore | null = null
  let fileFatto = false

  const consuma = async (): Promise<void> => {
    for (;;) {
      if (fase === "fine") {
        buf = Buffer.alloc(0)
        return
      }
      if (fase === "inizio") {
        const i = buf.indexOf(fine)
        if (i < 0) {
          buf = buf.subarray(Math.max(0, buf.length - (fine.length - 1)))
          return
        }
        buf = buf.subarray(i + fine.length)
        fase = "dopo"
      } else if (fase === "dopo") {
        if (buf.length < 2) return
        if (buf[0] === 0x2d && buf[1] === 0x2d) {
          fase = "fine"
          continue
        }
        const a = buf.indexOf("\r\n")
        if (a < 0) {
          if (buf.length > 1024) throw new ErroreArrivo(400, MODULO_ILLEGGIBILE)
          return
        }
        buf = buf.subarray(a + 2)
        fase = "intestazioni"
      } else if (fase === "intestazioni") {
        const i = buf.indexOf("\r\n\r\n")
        if (i < 0) {
          if (buf.length > MAX_INTESTAZIONI) throw new ErroreArrivo(400, MODULO_ILLEGGIBILE)
          return
        }
        const intestazioni = buf.subarray(0, i).toString("utf8")
        buf = buf.subarray(i + 4)
        const nome = nomeFileDi(intestazioni)
        if (nome !== null && !fileFatto) {
          const tipo = /^content-type:\s*([^\r\n]+)/im.exec(intestazioni)?.[1]?.trim() ?? null
          scrittore = await apri({ nome, tipo })
          fase = "file"
        } else fase = "salta"
      } else {
        const i = buf.indexOf(fine)
        const utile = i >= 0 ? i : buf.length - (fine.length - 1)
        if (utile > 0 && fase === "file") await scrittore!.scrivi(buf.subarray(0, utile))
        if (i < 0) {
          buf = buf.subarray(Math.max(0, utile))
          return
        }
        buf = buf.subarray(i + fine.length)
        if (fase === "file") {
          fileFatto = true
          scrittore = null
        }
        fase = "dopo"
      }
    }
  }

  const lettore = corpo.getReader()
  try {
    for (;;) {
      const { done, value } = await lettore.read()
      if (done) break
      buf = buf.length === 0 ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.concat([buf, value])
      await consuma()
    }
  } finally {
    lettore.releaseLock()
  }
  return { chiuso: fase === "fine", file: fileFatto }
}
