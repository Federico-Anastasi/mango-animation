// Ogni accesso al disco del server passa da qui: le letture sono contate, perché la prova di costo
// di una rotta di lettura è che il contatore non si muova.
import type { BigIntStats, Dirent, Stats } from "node:fs"
import { appendFile, copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { randomUUID } from "node:crypto"
import { frase } from "./lingua"

export const contatori = { letture: 0 }

const codice = (errore: unknown): string => (errore as NodeJS.ErrnoException).code ?? ""
const mancante = (errore: unknown): boolean => codice(errore) === "ENOENT" || codice(errore) === "ENOTDIR"

export async function leggiTesto(percorso: string): Promise<string | null> {
  contatori.letture++
  try {
    return await Bun.file(percorso).text()
  } catch (errore) {
    if (mancante(errore)) return null
    throw errore
  }
}

/** Perché un file che non è JSON non vale: la frase che lo studio mostra, senza gergo. */
export const NON_SI_LEGGE = frase("il file è scritto male e non si legge", "the file is badly written and cannot be read")

export const eOggetto = (valore: unknown): valore is Record<string, unknown> => typeof valore === "object" && valore !== null && !Array.isArray(valore)

export function jsonDaTesto(testo: string): { valore: unknown } | null {
  try {
    return { valore: JSON.parse(testo) }
  } catch {
    return null
  }
}

export interface Voce {
  name: string
  isFile: () => boolean
  isDirectory: () => boolean
}

const daDirent = (d: Dirent): Voce => ({ name: d.name, isFile: () => d.isFile(), isDirectory: () => d.isDirectory() })

// Un collegamento (un video spostato su un altro disco) vale per ciò a cui punta; se quel disco manca, non c'è.
async function seguiCollegamento(cartella: string, d: Dirent): Promise<Voce[]> {
  try {
    const stato = await stat(join(cartella, d.name))
    return [{ name: d.name, isFile: () => stato.isFile(), isDirectory: () => stato.isDirectory() }]
  } catch (errore) {
    if (mancante(errore)) return []
    throw errore
  }
}

export async function elenca(cartella: string): Promise<Voce[]> {
  contatori.letture++
  try {
    const voci = await readdir(cartella, { withFileTypes: true })
    return (await Promise.all(voci.map((d) => (d.isSymbolicLink() ? seguiCollegamento(cartella, d) : [daDirent(d)])))).flat()
  } catch (errore) {
    if (mancante(errore)) return []
    throw errore
  }
}

/** Tutti i file sotto `cartella`, a qualunque profondità, con il percorso relativo (`/`) e la grandezza. */
export async function elencaFile(cartella: string): Promise<{ relativo: string; byte: number }[]> {
  contatori.letture++
  try {
    const voci = (await readdir(cartella, { recursive: true, withFileTypes: true })).filter((d) => d.isFile())
    const lette = await Promise.all(voci.map(async (d) => ({ percorso: join(d.parentPath, d.name), stato: await stat(join(d.parentPath, d.name)) })))
    return lette.map(({ percorso, stato }) => ({ relativo: relative(cartella, percorso).replaceAll("\\", "/"), byte: stato.size })).sort((a, b) => a.relativo.localeCompare(b.relativo))
  } catch (errore) {
    if (mancante(errore)) return []
    throw errore
  }
}

export async function statistica(percorso: string): Promise<Stats | null> {
  contatori.letture++
  try {
    return await stat(percorso)
  } catch (errore) {
    if (mancante(errore)) return null
    throw errore
  }
}

/** Come `statistica`, con i numeri interi esatti: serve a chi confronta `dev` e `ino` di due file. */
export async function statisticaEsatta(percorso: string): Promise<BigIntStats | null> {
  contatori.letture++
  try {
    return await stat(percorso, { bigint: true })
  } catch (errore) {
    if (mancante(errore)) return null
    throw errore
  }
}

// Windows rifiuta la rinomina se un lettore ha il file aperto in quell'istante. Fra due dischi (una cartella che è un collegamento
// a un'altra unità) la rinomina non esiste: si copia accanto alla destinazione, si mette a posto e si toglie l'originale.
export async function rinomina(da: string, a: string): Promise<void> {
  for (let tentativo = 1; ; tentativo++) {
    try {
      return await rename(da, a)
    } catch (errore) {
      if (codice(errore) === "EXDEV") return spostaCopiando(da, a)
      if (tentativo >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(codice(errore))) throw errore
      await Bun.sleep(25 * tentativo)
    }
  }
}

async function spostaCopiando(da: string, a: string): Promise<void> {
  const temporaneo = `${a}.tmp-${randomUUID().slice(0, 8)}`
  try {
    await copyFile(da, temporaneo)
    await rinomina(temporaneo, a)
  } catch (errore) {
    await rm(temporaneo, { force: true })
    throw errore
  }
  await rm(da, { force: true })
}

export async function scrivi(percorso: string, contenuto: string | Uint8Array): Promise<void> {
  await mkdir(dirname(percorso), { recursive: true })
  const temporaneo = `${percorso}.tmp-${randomUUID().slice(0, 8)}`
  try {
    await Bun.write(temporaneo, contenuto)
    await rinomina(temporaneo, percorso)
  } catch (errore) {
    await rm(temporaneo, { force: true })
    throw errore
  }
}

export const testoJson = (valore: unknown): string => `${JSON.stringify(valore, null, 2)}\n`

export async function aggiungiRiga(percorso: string, riga: string): Promise<void> {
  await mkdir(dirname(percorso), { recursive: true })
  await appendFile(percorso, `${riga}\n`)
}

export const rimuovi = (percorso: string): Promise<void> => rm(percorso, { recursive: true, force: true })
