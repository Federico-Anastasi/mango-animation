import type { Scheda } from "../tipi"

export const CANALI = [
  { id: "tiktok", nome: "TikTok" },
  { id: "youtube", nome: "YouTube" },
  { id: "x", nome: "X" },
] as const

type Lista = "canali" | "hashtag" | "scaletta" | "pubblicazioni"

/** La scheda con la lista cambiata; una lista vuota toglie la chiave (per `canali` lo schema vuole almeno un elemento). */
export function conLista<K extends Lista>(scheda: Scheda, chiave: K, lista: NonNullable<Scheda[K]>): Scheda {
  const nuova: Scheda = { ...scheda }
  if (lista.length === 0) delete nuova[chiave]
  else nuova[chiave] = lista
  return nuova
}

/** Quello che una scheda salva, senza che chi chiama debba gestire l'errore: la pagina lo mostra già. */
export const nonFallire = (promessa: Promise<void>): void => void promessa.catch(() => undefined)
