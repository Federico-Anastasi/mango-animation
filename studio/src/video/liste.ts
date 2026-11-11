import { nomeFile } from "../testo"
import type { DettaglioVideo, Scheda } from "../tipi"

export const CANALI = [
  { id: "tiktok", nome: "TikTok" },
  { id: "instagram", nome: "Instagram" },
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

/** L'uscita di un video che ha questo nome di file (`finale.mp4`), se c'è. */
export const uscitaDi = (video: DettaglioVideo, nome: string) => video.uscite.find((u) => nomeFile(u.file) === nome)

/** I file di `uscite/` che sono il video finito, dal più vero al meno: ciò che il creator ha caricato, poi con la copertina, poi il montato. */
export const FILE_FINITI = ["pubblicato.mp4", "con-copertina.mp4", "finale.mp4"]
