// A che passo del metodo è un video (`.claude/rules/processo.md`), ricavato dai file che già ci sono: nessun dato nuovo, nessuno che lo scriva.
// È l'unico posto che lo decide; lo studio mostra soltanto ciò che esce da qui.

/** Cosa fare o chiedere adesso: la frase la scrive lo studio, nelle due lingue. */
export type AzioneDelPasso = "idea" | "copione" | "prova" | "riprese" | "testo" | "animazioni" | "monta" | "guarda" | "correzioni" | "pubblica" | "fatto"

/** `passo` da 1 a 8: idea, copione, prova, riprese e testo registrato, animazioni, montaggio, correzioni, uscita. */
export interface Fase {
  passo: number
  azione: AzioneDelPasso
}

/** Ciò che serve per decidere: la scheda, le uscite e un po' di segni dei file (`VoceVideo` li ha tutti; lo dichiara qui perché il finto server dello studio usa la stessa regola). */
export interface SegniDelVideo {
  slug: string
  scheda: { stato: string; formato?: string; proposta?: unknown } | null
  uscite: Array<{ file: string }>
  anteprima: object | null
  testoRegistrato: boolean
  pianoTesto: string | null
  pianoConBase: { scene?: Array<{ animazione?: string }> } | null
}

const nonVuoto = (x: unknown): boolean => (typeof x === "string" ? x.trim() !== "" : Array.isArray(x) && x.length > 0)

/**
 * Il passo di un video, o `null` se gli otto passi non lo riguardano (un carosello, un video scartato). Si va dal fondo: vale l'ultimo passo di cui c'è un segno.
 * `pianoPiuNuovoDelMontato`: il piano è stato salvato dopo `finale.mp4`.
 */
export function faseDelVideo(voce: SegniDelVideo, pianoPiuNuovoDelMontato: boolean): Fase | null {
  const scheda = voce.scheda
  if (scheda === null || scheda.formato === "carosello" || scheda.stato === "scartato") return null
  if (scheda.stato === "pubblicato") return { passo: 8, azione: "fatto" }
  if (scheda.stato === "pronto") return { passo: 8, azione: "pubblica" }
  const ha = (nome: string): boolean => voce.uscite.some((u) => u.file === `video/${voce.slug}/uscite/${nome}`)
  if (ha("finale.mp4")) return pianoPiuNuovoDelMontato ? { passo: 7, azione: "correzioni" } : { passo: 6, azione: "guarda" }
  const haPiano = voce.pianoTesto !== null
  if (haPiano && voce.pianoConBase?.scene?.some((s) => s.animazione !== undefined)) return { passo: 6, azione: "monta" }
  if (voce.testoRegistrato) return { passo: 5, azione: "animazioni" }
  if (haPiano) return { passo: 4, azione: "testo" }
  if (ha("prova.mp4")) return { passo: 4, azione: "riprese" }
  const proposta = scheda.proposta as { aggancio?: unknown; spezzoni?: unknown } | undefined
  if (nonVuoto(proposta?.aggancio) || nonVuoto(proposta?.spezzoni)) return { passo: 3, azione: "prova" }
  return voce.anteprima !== null ? { passo: 2, azione: "copione" } : { passo: 1, azione: "idea" }
}
