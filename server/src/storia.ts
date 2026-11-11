// Le versioni di prima del piano, per annullare e rifare: `storia/<n>.json` più `storia/cursore.json`
// quando si è tornati indietro. In testa (nessun cursore) il piano in uso è `piano.json` e non ha un
// file suo; tornando indietro la testa diventa l'ultimo file, così si può rifare.
import { join } from "node:path"
import { elenca, jsonDaTesto, leggiTesto, rimuovi, scrivi, statistica, testoJson } from "./disco"
import type { PosizioneStoria } from "./indice"

const VERSIONI_TENUTE = 200

const file = (cartella: string, n: number): string => join(cartella, `${n}.json`)

export async function leggiPosizione(cartella: string): Promise<PosizioneStoria> {
  const numeri = (await elenca(cartella)).flatMap((voce) => {
    const n = /^(\d+)\.json$/.exec(voce.name)?.[1]
    return n === undefined ? [] : [Number(n)]
  })
  const primo = numeri.length > 0 ? Math.min(...numeri) : 1
  const ultimo = numeri.length > 0 ? Math.max(...numeri) : 0
  const testo = await leggiTesto(join(cartella, "cursore.json"))
  const posizione = Number((jsonDaTesto(testo ?? "")?.valore as { posizione?: unknown } | undefined)?.posizione)
  return { primo, ultimo, posizione: Number.isInteger(posizione) && posizione >= primo && posizione <= ultimo ? posizione : ultimo + 1 }
}

async function fissa(cartella: string, stato: PosizioneStoria): Promise<void> {
  if (stato.posizione === stato.ultimo + 1) await rimuovi(join(cartella, "cursore.json"))
  else await scrivi(join(cartella, "cursore.json"), testoJson({ posizione: stato.posizione }))
}

/** Prima di sostituire il piano: `precedente` (il testo che c'era) entra nella storia, e le versioni «da rifare» cadono. */
export async function registraNuovaVersione(cartella: string, stato: PosizioneStoria, precedente: string): Promise<void> {
  if (stato.posizione <= stato.ultimo) {
    await Promise.all(Array.from({ length: stato.ultimo - stato.posizione }, (_, i) => rimuovi(file(cartella, stato.posizione + 1 + i))))
    stato.ultimo = stato.posizione
  } else {
    stato.ultimo++
    await scrivi(file(cartella, stato.ultimo), precedente)
  }
  stato.posizione = stato.ultimo + 1
  if (stato.ultimo - stato.primo + 1 > VERSIONI_TENUTE) {
    await rimuovi(file(cartella, stato.primo))
    stato.primo++
  }
  await fissa(cartella, stato)
}

/** Sposta la posizione di un passo e dà il testo del piano che ora va in uso; `null` se non si può. */
export async function muovi(cartella: string, stato: PosizioneStoria, indietro: boolean, inUso: string): Promise<string | null> {
  if (indietro && stato.posizione === stato.ultimo + 1 && stato.ultimo >= stato.primo) {
    stato.ultimo++
    await scrivi(file(cartella, stato.ultimo), inUso)
    stato.posizione = stato.ultimo - 1
  } else {
    const prossima = stato.posizione + (indietro ? -1 : 1)
    const ammessa = indietro ? stato.posizione <= stato.ultimo && prossima >= stato.primo : prossima <= stato.ultimo
    if (!ammessa) return null
    stato.posizione = prossima
  }
  await fissa(cartella, stato)
  return leggiTesto(file(cartella, stato.posizione))
}

/** Una versione di `storia/` com'è sul disco: il piano di allora e quando il suo file è stato scritto, cioè quando un'altra versione l'ha sostituita. */
export interface VersioneSalvata {
  n: number
  testo: string
  fino: number
}

export async function leggiVersioni(cartella: string, stato: PosizioneStoria): Promise<VersioneSalvata[]> {
  const lette = await Promise.all(
    Array.from({ length: Math.max(0, stato.ultimo - stato.primo + 1) }, async (_, i) => {
      const n = stato.primo + i
      const [testo, info] = await Promise.all([leggiTesto(file(cartella, n)), statistica(file(cartella, n))])
      return testo === null || info === null ? [] : [{ n, testo, fino: info.mtimeMs }]
    }),
  )
  return lette.flat()
}

export const leggiVersione = (cartella: string, n: number): Promise<string | null> => leggiTesto(file(cartella, n))

/** Quante scene e quanti pezzi scrive un piano, o `null` se il testo non è un piano che si legge. */
export function contaPiano(testo: string): { scene: number; pezzi: number } | null {
  const scene = (jsonDaTesto(testo)?.valore as { scene?: unknown } | undefined)?.scene
  if (!Array.isArray(scene)) return null
  return { scene: scene.length, pezzi: scene.reduce((somma: number, s: { pezzi?: unknown } | null) => somma + (Array.isArray(s?.pezzi) ? s.pezzi.length : 0), 0) }
}

/** Il piano di adesso diventa una versione di storia e il piano `n` prende il suo posto; `null` se `n` non c'è. Le versioni «da rifare» restano: non si perde niente. */
export async function ripristina(cartella: string, stato: PosizioneStoria, n: number, inUso: string): Promise<string | null> {
  const testo = n >= stato.primo && n <= stato.ultimo ? await leggiVersione(cartella, n) : null
  if (testo === null) return null
  stato.posizione = stato.ultimo + 1
  await registraNuovaVersione(cartella, stato, inUso)
  return testo
}

/** Una riga dell'elenco delle versioni: `n` è il numero in `storia/` (`null` per il piano di adesso quando non ha un file suo); `da` e `fino` dicono quando è stata in uso. */
export interface VersioneDelPiano {
  n: number | null
  da: string | null
  fino: string | null
  scene: number | null
  pezzi: number | null
  in_uso: boolean
}

/**
 * Le versioni dalla più recente. Un file di `storia/` è stato scritto quando un'altra versione l'ha sostituito, quindi `fino` è la sua data e `da` quella del file di prima
 * (la più vecchia, o una di cui il file è già caduto, non ha `da`). La versione in uso dice da quando (la data di `piano.json`) e non ha `fino`.
 */
export function descriviVersioni(salvate: VersioneSalvata[], stato: PosizioneStoria, inUso: { testo: string; mtime: number }): VersioneDelPiano[] {
  const quando = (ms: number | undefined): string | null => (ms === undefined ? null : new Date(ms).toISOString())
  const fino = new Map(salvate.map((v) => [v.n, v.fino]))
  const righe = salvate
    .map((v): VersioneDelPiano => ({ n: v.n, da: quando(fino.get(v.n - 1)), fino: quando(v.fino), ...(contaPiano(v.testo) ?? { scene: null, pezzi: null }), in_uso: v.n === stato.posizione }))
    .reverse()
  const adesso = { da: quando(inUso.mtime), fino: null }
  if (stato.posizione > stato.ultimo) return [{ n: null, ...adesso, ...(contaPiano(inUso.testo) ?? { scene: null, pezzi: null }), in_uso: true }, ...righe]
  return righe.map((r) => (r.in_uso ? { ...r, ...adesso } : r))
}
