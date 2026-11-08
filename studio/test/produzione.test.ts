import { describe, expect, it } from "vitest"
import { medie, negliUltimiGiorni, piuLunghiERapidi, righeDellaProduzione, videoFatti } from "../src/produzione/calcoli"
import type { ConsumoDiUnVideo, Scheda, VideoDelCanale, VoceElenco } from "../src/tipi"

const GIORNO = 86_400_000
const ADESSO = Date.parse("2026-11-04T12:00:00")
const fa = (giorni: number): string => new Date(ADESSO - giorni * GIORNO).toISOString()

const voce = (slug: string, scheda: Partial<Scheda>, ultimoCambio = fa(1)): VoceElenco => ({
  slug,
  scheda: { titolo: `Titolo ${slug}`, stato: "pubblicato", creato: "2026-10-01", ...scheda },
  durata: 20,
  miniatura: null,
  anteprima: null,
  ha_piano: true,
  ha_finale: true,
  ultimo_cambio: ultimoCambio,
})

const conti = (tempo: number, scritti: number, riletti = scritti * 100, nuovi = scritti * 4): ConsumoDiUnVideo => ({ tempo, giri: 3, token: { scritti, riletti, nuovi }, dal: fa(5), al: fa(1) })

describe("quali video sono fatti, e quando", () => {
  it("sono i pronti e i pubblicati; la data è la prima uscita, o l'ultimo cambio se non è ancora uscito", () => {
    const fatti = videoFatti([
      voce("a", { stato: "pubblicato", pubblicazioni: [{ canale: "youtube", data: fa(3) }, { canale: "tiktok", data: fa(5) }] }, fa(1)),
      voce("b", { stato: "pronto" }, fa(2)),
      voce("c", { stato: "in lavorazione" }),
      voce("d", { stato: "proposta" }),
      voce("e", { stato: "scartato" }),
    ])
    expect(fatti.map((f) => [f.slug, f.quando])).toEqual([
      ["a", Date.parse(fa(5))],
      ["b", Date.parse(fa(2))],
    ])
  })

  it("«negli ultimi N giorni» conta dalla data in cui sono stati fatti", () => {
    const fatti = videoFatti([voce("a", { pubblicazioni: [{ canale: "tiktok", data: fa(3) }] }), voce("b", { pubblicazioni: [{ canale: "tiktok", data: fa(10) }] }), voce("c", { pubblicazioni: [{ canale: "tiktok", data: fa(40) }] })])
    expect(negliUltimiGiorni(fatti, 7, ADESSO).map((f) => f.slug)).toEqual(["a"])
    expect(negliUltimiGiorni(fatti, 30, ADESSO).map((f) => f.slug)).toEqual(["a", "b"])
  })
})

describe("i conti medi", () => {
  const fatti = videoFatti([voce("a", {}), voce("b", {}), voce("c", {})])

  it("fanno la media sui video di cui Claude ha un conto, e dicono quanti ne mancano", () => {
    const m = medie(fatti, { a: conti(3600, 100_000), b: conti(1800, 50_000) })
    expect(m).toEqual({ video: 2, senzaConti: 1, tempo: 2700, scritti: 75_000, riletti: 7_500_000, nuovi: 300_000 })
  })

  it("senza nessun conto non c'è una media", () => {
    expect(medie(fatti, {})).toBeNull()
    expect(medie([], {})).toBeNull()
  })
})

describe("cosa rende ogni video", () => {
  const dalCanale = (slug: string | null, visualizzazioni?: number, extra: Partial<VideoDelCanale> = {}): VideoDelCanale => ({ id: `id-${slug}`, slug, visualizzazioni, commenti_letti: 0, variazione: null, ...extra })
  const fatti = videoFatti([voce("lento", {}), voce("rapido", {}), voce("senza-numeri", {}), voce("senza-conti", {})])
  const righe = righeDellaProduzione(
    fatti,
    { lento: conti(7200, 10), rapido: conti(600, 10), "senza-numeri": conti(1200, 10) },
    [dalCanale("lento", 2000, { mi_piace: 100, nuovi_follower: 5 }), dalCanale("rapido", 10_000), dalCanale(null, 999), dalCanale("senza-conti", 5000)],
  )

  it("unisce il conto di Claude ai numeri del canale per slug, e calcola i minuti di lavoro ogni mille visualizzazioni", () => {
    const lento = righe.find((r) => r.slug === "lento")!
    expect(lento).toMatchObject({ titolo: "Titolo lento", tempo: 7200, visualizzazioni: 2000, mi_piace: 100, nuovi_follower: 5, minutiOgniMille: 60 })
    expect(righe.find((r) => r.slug === "rapido")?.minutiOgniMille).toBe(1)
  })

  it("un video senza numeri del canale resta, senza rapporto; uno senza conti di Claude non c'è", () => {
    expect(righe.find((r) => r.slug === "senza-numeri")).toMatchObject({ visualizzazioni: null, minutiOgniMille: null })
    expect(righe.map((r) => r.slug)).not.toContain("senza-conti")
  })

  it("i più lunghi sono quelli con più tempo di lavoro, i più rapidi quelli con meno", () => {
    const { lunghi, rapidi } = piuLunghiERapidi(righe, 2)
    expect(lunghi.map((r) => r.slug)).toEqual(["lento", "senza-numeri"])
    expect(rapidi.map((r) => r.slug)).toEqual(["rapido", "senza-numeri"])
  })
})
