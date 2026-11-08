// I conti della produzione: quali video sono fatti, quanto lavoro di Claude è costato ognuno e cosa ha reso. Ogni cifra passa di qui:
// il conto sta in un posto solo e si può provare.
import { istante } from "../testo"
import type { ConsumoDiUnVideo, VideoDelCanale, VoceElenco } from "../tipi"

export const GIORNO = 86_400_000

export interface VideoFatto {
  slug: string
  titolo: string
  /** Quando è stato fatto, in millisecondi. */
  quando: number
  miniatura: string | null
}

/**
 * I video fatti sono quelli pronti o pubblicati. Il giorno in cui sono stati fatti è quello della prima uscita; se non è ancora uscito,
 * quello dell'ultima modifica.
 */
export function videoFatti(elenco: VoceElenco[]): VideoFatto[] {
  return elenco
    .filter((v) => v.scheda.stato === "pronto" || v.scheda.stato === "pubblicato")
    .map((v) => {
      const uscite = (v.scheda.pubblicazioni ?? []).flatMap((p) => istante(p.data) ?? [])
      return { slug: v.slug, titolo: v.scheda.titolo, quando: uscite.length > 0 ? Math.min(...uscite) : (istante(v.ultimo_cambio) ?? 0), miniatura: v.miniatura }
    })
}

export const negliUltimiGiorni = (fatti: VideoFatto[], giorni: number, adesso: number): VideoFatto[] => fatti.filter((f) => f.quando >= adesso - giorni * GIORNO)

export interface Medie {
  /** I video su cui si è fatta la media: quelli di cui Claude ha un conto. */
  video: number
  senzaConti: number
  tempo: number
  scritti: number
  riletti: number
  nuovi: number
}

/** La media per video; `null` se nessuno dei video ha un conto. */
export function medie(fatti: VideoFatto[], conti: Record<string, ConsumoDiUnVideo>): Medie | null {
  const con = fatti.flatMap((f) => conti[f.slug] ?? [])
  if (con.length === 0) return null
  const media = (prendi: (c: ConsumoDiUnVideo) => number): number => con.reduce((tot, c) => tot + prendi(c), 0) / con.length
  return {
    video: con.length,
    senzaConti: fatti.length - con.length,
    tempo: media((c) => c.tempo),
    scritti: media((c) => c.token.scritti),
    riletti: media((c) => c.token.riletti),
    nuovi: media((c) => c.token.nuovi),
  }
}

export interface RigaProduzione {
  slug: string
  titolo: string
  miniatura: string | null
  tempo: number
  scritti: number
  riletti: number
  nuovi: number
  visualizzazioni: number | null
  mi_piace: number | null
  nuovi_follower: number | null
  /** Minuti di lavoro di Claude ogni mille visualizzazioni; `null` se il canale non ha le visualizzazioni. */
  minutiOgniMille: number | null
}

const numeroOppure = (valore: number | undefined): number | null => (valore === undefined ? null : valore)

/** Una riga per ogni video fatto di cui Claude ha un conto, con i numeri che il canale ha dato allo stesso video. */
export function righeDellaProduzione(fatti: VideoFatto[], conti: Record<string, ConsumoDiUnVideo>, dalCanale: VideoDelCanale[]): RigaProduzione[] {
  return fatti.flatMap((f) => {
    const conto = conti[f.slug]
    if (!conto) return []
    const canale = dalCanale.find((v) => v.slug === f.slug)
    const visualizzazioni = numeroOppure(canale?.visualizzazioni)
    return {
      slug: f.slug,
      titolo: f.titolo,
      miniatura: f.miniatura,
      tempo: conto.tempo,
      scritti: conto.token.scritti,
      riletti: conto.token.riletti,
      nuovi: conto.token.nuovi,
      visualizzazioni,
      mi_piace: numeroOppure(canale?.mi_piace),
      nuovi_follower: numeroOppure(canale?.nuovi_follower),
      minutiOgniMille: visualizzazioni !== null && visualizzazioni > 0 ? conto.tempo / 60 / (visualizzazioni / 1000) : null,
    }
  })
}

export type CampoOrdine = "tempo" | "visualizzazioni" | "minutiOgniMille"

/** Le righe dalla più alta, o dalla più bassa con `rovescio`; chi non ha il numero sta sempre in fondo. */
export function ordinaRighe(righe: RigaProduzione[], campo: CampoOrdine, rovescio: boolean): RigaProduzione[] {
  return [...righe].sort((a, b) => {
    const x = a[campo]
    const y = b[campo]
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return rovescio ? x - y : y - x
  })
}

/** I `quanti` video con più tempo di lavoro e i `quanti` con meno. */
export function piuLunghiERapidi(righe: RigaProduzione[], quanti: number): { lunghi: RigaProduzione[]; rapidi: RigaProduzione[] } {
  const perTempo = [...righe].sort((a, b) => b.tempo - a.tempo)
  return { lunghi: perTempo.slice(0, quanti), rapidi: perTempo.slice(Math.max(perTempo.length - quanti, 0)).reverse() }
}
