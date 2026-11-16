// I conti della produzione: quali video sono fatti, quanto lavoro in chat è costato ognuno e cosa ha reso. Ogni cifra passa di qui:
// il conto sta in un posto solo e si può provare.
import { GIORNO, istante } from "../testo"
import type { ConsumoDelMotore, ConsumoDiUnVideo, VideoDelCanale, VoceElenco } from "../tipi"

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
  /** I video su cui si è fatta la media: quelli di cui c'è un conto. */
  video: number
  senzaConti: number
  tempo: number
  /** La parte di ogni motore che ha lavorato: sommate danno `tempo`. */
  motori: Record<string, number>
  /** La media dei token sui video di cui qualche motore dice i token; `null` se nessuno li dice. */
  scritti: number | null
  riletti: number | null
  nuovi: number | null
}

const conToken = (c: ConsumoDiUnVideo): boolean => Object.values(c.motori).some((parte) => parte.token !== null)

const mediaDi = <T>(elementi: T[], prendi: (e: T) => number): number => elementi.reduce((tot, e) => tot + prendi(e), 0) / elementi.length

/** La media per video; `null` se nessuno dei video ha un conto. */
export function medie(fatti: VideoFatto[], conti: Record<string, ConsumoDiUnVideo>): Medie | null {
  const con = fatti.flatMap((f) => conti[f.slug] ?? [])
  if (con.length === 0) return null
  const dicono = con.filter(conToken)
  const token = (prendi: (c: ConsumoDiUnVideo) => number): number | null => (dicono.length === 0 ? null : mediaDi(dicono, prendi))
  const motori = [...new Set(con.flatMap((c) => Object.keys(c.motori)))]
  return {
    video: con.length,
    senzaConti: fatti.length - con.length,
    tempo: mediaDi(con, (c) => c.tempo),
    motori: Object.fromEntries(motori.map((id) => [id, mediaDi(con, (c) => c.motori[id]?.tempo ?? 0)])),
    scritti: token((c) => c.token.scritti),
    riletti: token((c) => c.token.riletti),
    nuovi: token((c) => c.token.nuovi),
  }
}

const partiDelMotore = (conti: ConsumoDiUnVideo[]): Map<string, ConsumoDelMotore[]> => {
  const parti = new Map<string, ConsumoDelMotore[]>()
  for (const [id, parte] of conti.flatMap((c) => Object.entries(c.motori))) parti.set(id, [...(parti.get(id) ?? []), parte])
  return parti
}

const motoriDove = (conti: ConsumoDiUnVideo[], prova: (parti: ConsumoDelMotore[]) => boolean): string[] => [...partiDelMotore(conti)].flatMap(([id, parti]) => (prova(parti) ? id : []))

/** I motori di cui nessun conto dice i token. */
export const motoriSenzaToken = (conti: ConsumoDiUnVideo[]): string[] => motoriDove(conti, (parti) => parti.every((p) => p.token === null))

/** I motori di cui i token mancano per qualche giro: dentro una voce, o in alcune voci e non in altre. */
export const motoriConTokenInParte = (conti: ConsumoDiUnVideo[]): string[] =>
  motoriDove(conti, (parti) => parti.some((p) => p.giri_con_token > 0 && p.giri_con_token < p.giri) || (parti.some((p) => p.giri_con_token > 0) && parti.some((p) => p.giri_con_token === 0)))

export interface RigaProduzione {
  slug: string
  titolo: string
  miniatura: string | null
  tempo: number
  /** La parte di ogni motore che ha lavorato. */
  motori: Record<string, number>
  scritti: number
  riletti: number
  nuovi: number
  visualizzazioni: number | null
  mi_piace: number | null
  nuovi_follower: number | null
  /** Minuti di lavoro in chat ogni mille visualizzazioni; `null` se il canale non ha le visualizzazioni. */
  minutiOgniMille: number | null
}

const numeroOppure = (valore: number | undefined): number | null => (valore === undefined ? null : valore)

/** Una riga per ogni video fatto di cui c'è un conto, con i numeri che il canale ha dato allo stesso video. */
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
      motori: Object.fromEntries(Object.entries(conto.motori).map(([id, parte]) => [id, parte.tempo])),
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
