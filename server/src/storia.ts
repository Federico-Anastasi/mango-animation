// Le versioni di prima del piano, per annullare e rifare: `storia/<n>.json` più `storia/cursore.json`
// quando si è tornati indietro. In testa (nessun cursore) il piano in uso è `piano.json` e non ha un
// file suo; tornando indietro la testa diventa l'ultimo file, così si può rifare.
import { join } from "node:path"
import { elenca, jsonDaTesto, leggiTesto, rimuovi, scrivi, testoJson } from "./disco"
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
