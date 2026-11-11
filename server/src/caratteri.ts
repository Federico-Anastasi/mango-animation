// I caratteri del creator: un file .ttf, .otf o .woff2 scelto dal computer finisce in `font/` della cartella di lavoro,
// accanto a quelli del prodotto. Lo stile li nomina con il percorso (`caratteri` in `stile.json`, `docs/ARCHITETTURA.md`, «Lo stile»);
// motore, animazioni e studio cercano il file prima nella cartella del creator e poi in quella del prodotto.
import { basename, extname, join } from "node:path"
import { brotliDecompressSync } from "node:zlib"
import { elenca, scrivi } from "./disco"

export const ESTENSIONI = [".ttf", ".otf", ".woff2"]
/** Un carattere vero pesa decine o centinaia di KB; oltre questo è un file sbagliato o un carattere con migliaia di simboli. */
export const MASSIMO_BYTE = 5 * 1024 ** 2

export interface Carattere {
  /** Il percorso come lo scrive lo stile: `font/<file>`. */
  file: string
  nome: string
  /** `true`: lo ha aggiunto il creator. */
  mio: boolean
}

const lettura = (byte: Uint8Array) => new DataView(byte.buffer, byte.byteOffset, byte.byteLength)

/** Le voci `family` e `subfamily` della tavola `name` di un carattere, in testo (Windows e Unicode in UTF-16, Macintosh in Latin-1). */
function nomiDellaTavola(tavola: Uint8Array): { famiglia: string; stile: string } | null {
  const v = lettura(tavola)
  const quanti = v.getUint16(2)
  const dati = v.getUint16(4)
  const voci: Array<{ id: number; piattaforma: number; testo: string }> = []
  for (let i = 0; i < quanti; i++) {
    const r = 6 + i * 12
    const [piattaforma, id, lunghezza, inizio] = [v.getUint16(r), v.getUint16(r + 6), v.getUint16(r + 8), v.getUint16(r + 10)]
    const grezzo = tavola.subarray(dati + inizio, dati + inizio + lunghezza)
    voci.push({ id, piattaforma, testo: new TextDecoder(piattaforma === 1 ? "latin1" : "utf-16be").decode(grezzo) })
  }
  const cerca = (...ids: number[]) => ids.map((id) => voci.find((x) => x.id === id && x.piattaforma !== 1) ?? voci.find((x) => x.id === id)).find((x) => x !== undefined)?.testo
  const famiglia = cerca(16, 1)
  return famiglia ? { famiglia, stile: cerca(17, 2) ?? "" } : null
}

/** Le tavole di un carattere .ttf/.otf, per nome. */
function tavoleSfnt(byte: Uint8Array): Map<string, Uint8Array> {
  const v = lettura(byte)
  const tavole = new Map<string, Uint8Array>()
  for (let i = 0; i < v.getUint16(4); i++) {
    const r = 12 + i * 16
    tavole.set(new TextDecoder().decode(byte.subarray(r, r + 4)), byte.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12)))
  }
  return tavole
}

/** La tavola `name` di un .woff2: la sua directory, poi il flusso compresso con tutte le tavole una dopo l'altra (`name` non si trasforma mai). */
function tavolaNomiWoff2(byte: Uint8Array): Uint8Array | null {
  const v = lettura(byte)
  const base128 = (da: number): [number, number] => {
    let valore = 0
    for (let i = 0; i < 5; i++) {
      valore = valore * 128 + (v.getUint8(da + i) & 0x7f)
      if (!(v.getUint8(da + i) & 0x80)) return [valore, da + i + 1]
    }
    throw new Error("UIntBase128 troppo lungo")
  }
  const IL_NOME = 5
  const GLYF_E_LOCA = [10, 11]
  let posto = 48
  let fra = 0
  let cercata: { da: number; lunghezza: number } | null = null
  for (let i = 0; i < v.getUint16(12); i++) {
    const flags = v.getUint8(posto++)
    const indice = flags & 0x3f
    const trasformata = GLYF_E_LOCA.includes(indice) ? flags >> 6 === 0 : flags >> 6 !== 0
    if (indice === 63) posto += 4
    const [originale, dopo] = base128(posto)
    const [trasformata_, fine] = trasformata ? base128(dopo) : [originale, dopo]
    posto = fine
    if (indice === IL_NOME) cercata = { da: fra, lunghezza: originale }
    fra += trasformata_
  }
  if (!cercata) return null
  const compresso = byte.subarray(posto, posto + v.getUint32(20))
  const tutte = brotliDecompressSync(compresso, { maxOutputLength: 4 * MASSIMO_BYTE })
  return tutte.subarray(cercata.da, cercata.da + cercata.lunghezza)
}

/** Il nome di un carattere come lo scrive il file («Montserrat Bold»), o `null` se non è un .ttf, .otf o .woff2 che si legge. */
export function nomeDelCarattere(byte: Uint8Array): string | null {
  try {
    const v = lettura(byte)
    const firma = v.getUint32(0)
    const tavola = firma === 0x774f4632 ? tavolaNomiWoff2(byte) : [0x00010000, 0x4f54544f, 0x74727565].includes(firma) ? (tavoleSfnt(byte).get("name") ?? null) : null
    const nomi = tavola && nomiDellaTavola(tavola)
    return nomi ? `${nomi.famiglia}${nomi.stile && nomi.stile !== "Regular" ? ` ${nomi.stile}` : ""}` : null
  } catch {
    return null
  }
}

/** I caratteri di una cartella, col nome letto dal file (se non si legge, il nome del file). */
async function dellaCartella(cartella: string, mio: boolean): Promise<Carattere[]> {
  const voci = (await elenca(cartella)).filter((v) => v.isFile() && ESTENSIONI.includes(extname(v.name).toLowerCase()))
  return Promise.all(voci.map(async (v) => ({ file: `font/${v.name}`, nome: nomeDelCarattere(await Bun.file(join(cartella, v.name)).bytes()) ?? basename(v.name, extname(v.name)), mio })))
}

/** Quelli del prodotto e, dopo, quelli del creator. */
export async function elencaCaratteri(delProdotto: string, delCreator: string): Promise<Carattere[]> {
  return [...(await dellaCartella(delProdotto, false)), ...(await dellaCartella(delCreator, true))]
}

/** Un nome di file semplice: niente cartelle, e le lettere e i numeri restano, il resto diventa «_». */
export function nomeDelFile(scelto: string): string {
  const pezzi = scelto.split(/[\/]/)
  const nome = pezzi[pezzi.length - 1] ?? ""
  const estensione = extname(nome).toLowerCase()
  const radice = basename(nome, extname(nome)).replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^[_.]+|[_.]+$/g, "")
  return `${radice || "carattere"}${estensione}`
}

/**
 * Mette il carattere in `font/` del creator. Lo stesso file già presente (nel prodotto o nel creator) non si ripete; un file diverso con lo
 * stesso nome prende un numero, e un carattere del prodotto non si copre mai. Dà il percorso come lo scrive lo stile.
 */
export async function salvaCarattere(nome: string, byte: Uint8Array, delProdotto: string, delCreator: string): Promise<string> {
  const estensione = extname(nome)
  const radice = nome.slice(0, nome.length - estensione.length)
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? nome : `${radice}-${n}${estensione}`
    const presenti: Uint8Array[] = []
    for (const cartella of [delProdotto, delCreator]) {
      const file = Bun.file(join(cartella, candidato))
      if (await file.exists()) presenti.push(await file.bytes())
    }
    if (presenti.some((p) => Buffer.compare(p, byte) === 0)) return `font/${candidato}`
    if (presenti.length === 0) {
      await scrivi(join(delCreator, candidato), byte)
      return `font/${candidato}`
    }
  }
}
