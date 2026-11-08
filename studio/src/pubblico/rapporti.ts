// I rapporti per 1000 visualizzazioni e i totali di un gruppo di video del canale. Ogni cifra passa di qui:
// il conto sta in un posto solo e si può provare.
import type { VideoDelCanale } from "../tipi"

/** Quante volte `valore` ogni 1000 visualizzazioni; `null` se manca il valore o le visualizzazioni. */
export function perMille(valore: number | undefined, visualizzazioni: number | undefined): number | null {
  if (valore === undefined || visualizzazioni === undefined || visualizzazioni <= 0) return null
  return (valore * 1000) / visualizzazioni
}

export interface Rapporti {
  mi_piace: number | null
  commenti: number | null
  condivisioni: number | null
  salvati: number | null
  nuovi_follower: number | null
}

export function rapporti(video: VideoDelCanale): Rapporti {
  return {
    mi_piace: perMille(video.mi_piace, video.visualizzazioni),
    commenti: perMille(video.commenti, video.visualizzazioni),
    condivisioni: perMille(video.condivisioni, video.visualizzazioni),
    salvati: perMille(video.salvati, video.visualizzazioni),
    nuovi_follower: perMille(video.nuovi_follower, video.visualizzazioni),
  }
}

function somma(video: VideoDelCanale[], prendi: (v: VideoDelCanale) => number | undefined): number {
  return video.reduce((tot, v) => tot + (prendi(v) ?? 0), 0)
}

/** Su cosa si ordina la tabella: le visualizzazioni, o uno dei rapporti. */
export type CampoOrdine = "visualizzazioni" | keyof Rapporti

/** Il valore su cui si ordina; `null` quando TikTok non l'ha dato. */
export function valoreDi(video: VideoDelCanale, campo: CampoOrdine): number | null {
  return campo === "visualizzazioni" ? (video.visualizzazioni ?? null) : rapporti(video)[campo]
}

/** I video in ordine: dal più alto, o dal più basso con `rovescio`. Chi non ha il numero va sempre in fondo. */
export function ordina(video: VideoDelCanale[], campo: CampoOrdine, rovescio: boolean): VideoDelCanale[] {
  return [...video].sort((a, b) => {
    const x = valoreDi(a, campo)
    const y = valoreDi(b, campo)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return rovescio ? x - y : y - x
  })
}

export interface Totali {
  /** Quanti video hanno i numeri: gli altri non si contano. */
  video: number
  visualizzazioni: number
  mi_piace: number
  commenti: number
  condivisioni: number
  salvati: number
  nuovi_follower: number
  rapporti: Rapporti
  ore: number
  /** I secondi di visione divisi per le visualizzazioni: pesa il pubblico che ogni video ha portato. */
  secondi_per_visualizzazione: number | null
}

/** I totali dei video che hanno le visualizzazioni: somme, rapporti delle somme, ore viste e tempo medio pesato. */
export function totali(tutti: VideoDelCanale[]): Totali {
  const video = tutti.filter((v) => v.visualizzazioni !== undefined)
  const conTempo = video.filter((v) => v.tempo_riproduzione_s !== undefined)
  const secondi = somma(conTempo, (v) => v.tempo_riproduzione_s)
  const visti = somma(conTempo, (v) => v.visualizzazioni)
  const visualizzazioni = somma(video, (v) => v.visualizzazioni)
  const mi_piace = somma(video, (v) => v.mi_piace)
  const commenti = somma(video, (v) => v.commenti)
  const condivisioni = somma(video, (v) => v.condivisioni)
  const salvati = somma(video, (v) => v.salvati)
  const nuovi_follower = somma(video, (v) => v.nuovi_follower)
  return {
    video: video.length,
    visualizzazioni,
    mi_piace,
    commenti,
    condivisioni,
    salvati,
    nuovi_follower,
    rapporti: {
      mi_piace: perMille(mi_piace, visualizzazioni),
      commenti: perMille(commenti, visualizzazioni),
      condivisioni: perMille(condivisioni, visualizzazioni),
      salvati: perMille(salvati, visualizzazioni),
      nuovi_follower: perMille(nuovi_follower, visualizzazioni),
    },
    ore: secondi / 3600,
    secondi_per_visualizzazione: visti > 0 ? secondi / visti : null,
  }
}