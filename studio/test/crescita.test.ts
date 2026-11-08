import { describe, expect, it } from "vitest"
import { interpola, inizioSettimana, percorso, perTipo, ritmoAlGiorno, settimana, ultimiGiorni } from "../src/crescita/calcoli"
import type { Crescita, PuntoAndamento, VideoDelCanale } from "../src/tipi"

const t = (quando: string) => new Date(quando).getTime()
const punto = (quando: string, follower: number | null): PuntoAndamento => ({ quando, follower, mi_piace: null, video: null })

const CRESCITA: Crescita = {
  quando: "2026-10-25",
  partenza: { data: "2026-11-02T00:00", follower: 600 },
  obiettivo: "atteso",
  scenari: [
    { nome: "prudente", tappe: [{ data: "2026-11-09T00:00", follower: 650 }] },
    { nome: "atteso", tappe: [{ data: "2026-11-09T00:00", follower: 740 }, { data: "2026-11-23T00:00", follower: 1160 }] },
  ],
  settimana: [
    { giorno: "lunedì", cosa: "piano" },
    { giorno: "mercoledì", cosa: "lettura", controllo: true },
  ],
  tipi: [
    { nome: "prove", spiega: "", video: ["a", "b"] },
    { nome: "altri", spiega: "", video: ["c"] },
  ],
  mix: [],
  consigli: [],
  novita: [],
  come: [],
}

describe("interpola", () => {
  const punti = [
    { t: t("2026-10-01T00:00"), follower: 100 },
    { t: t("2026-10-11T00:00"), follower: 200 },
  ]
  it("dentro la serie è sulla retta fra i due punti, fuori non c'è", () => {
    expect(interpola(punti, t("2026-10-06T00:00"))).toBe(150)
    expect(interpola(punti, t("2026-10-11T00:00"))).toBe(200)
    expect(interpola(punti, t("2026-09-30T00:00"))).toBeNull()
    expect(interpola(punti, t("2026-10-12T00:00"))).toBeNull()
  })
})

describe("percorso e ritmo di uno scenario", () => {
  it("parte dalla partenza e passa dalle tappe in ordine", () => {
    expect(percorso(CRESCITA, "atteso")).toEqual([
      { t: t("2026-11-02T00:00"), follower: 600 },
      { t: t("2026-11-09T00:00"), follower: 740 },
      { t: t("2026-11-23T00:00"), follower: 1160 },
    ])
    expect(percorso(CRESCITA, "sognato")).toEqual([])
  })

  it("il ritmo è la pendenza del tratto in cui cade il giorno; prima della partenza vale il primo tratto, dopo l'ultima tappa l'ultimo", () => {
    const p = percorso(CRESCITA, "atteso")
    expect(ritmoAlGiorno(p, t("2026-11-05T00:00"))).toBe(20)
    expect(ritmoAlGiorno(p, t("2026-11-15T00:00"))).toBe(30)
    expect(ritmoAlGiorno(p, t("2026-10-20T00:00"))).toBe(20)
    expect(ritmoAlGiorno(p, t("2026-12-10T00:00"))).toBe(30)
    expect(ritmoAlGiorno([], t("2026-12-01T00:00"))).toBeNull()
  })
})

describe("la settimana", () => {
  it("comincia il lunedì a mezzanotte", () => {
    expect(new Date(inizioSettimana(t("2026-10-25T09:38"))).toString()).toBe(new Date("2026-10-19T00:00").toString())
    expect(new Date(inizioSettimana(t("2026-10-26T00:00"))).toString()).toBe(new Date("2026-10-26T00:00").toString())
  })

  it("obiettivo dal ritmo dello scenario scelto, fatti dalle letture, e dove essere al giorno del controllo", () => {
    const andamento = [punto("2026-11-09T00:00:00", 600), punto("2026-11-11T00:00:00", 650)]
    const s = settimana(andamento, CRESCITA, t("2026-11-11T12:00"))
    expect(s.obiettivo).toBe(210)
    expect(s.fatti).toBe(50)
    expect(s.alControllo).toEqual({ giorno: "mercoledì", follower: 90 })
    expect(s.ultimaLettura).toBe(t("2026-11-11T00:00:00"))
  })

  it("se la settimana comincia prima della prima lettura i follower fatti non si sanno", () => {
    const s = settimana([punto("2026-11-11T00:00:00", 650)], CRESCITA, t("2026-11-11T12:00"))
    expect(s.fatti).toBeNull()
  })
})

describe("ultimiGiorni", () => {
  it("i follower guadagnati nei giorni prima dell'ultima lettura, se le letture li coprono", () => {
    const andamento = [punto("2026-10-10T00:00:00", 100), punto("2026-10-20T00:00:00", 300), punto("2026-10-21T00:00:00", null)]
    expect(ultimiGiorni(andamento, 5)).toBe(100)
    expect(ultimiGiorni(andamento, 20)).toBeNull()
  })
})

describe("perTipo", () => {
  const video = (slug: string, visualizzazioni: number, nuovi_follower?: number): VideoDelCanale => ({ id: slug, slug, visualizzazioni, nuovi_follower, commenti_letti: 0, variazione: null })
  it("per ogni tipo: quanti video, la mediana delle visualizzazioni, follower ogni mille visualizzazioni e la quota dei follower", () => {
    const righe = perTipo([video("a", 1000, 10), video("b", 3000, 10), video("c", 10000, 20), video("d", 500, 10)], CRESCITA.tipi)
    expect(righe).toEqual([
      { nome: "prove", spiega: "", video: 2, mediana: 2000, follower: 20, viste: 4000, perMille: 5, quota: 0.4 },
      { nome: "altri", spiega: "", video: 1, mediana: 10000, follower: 20, viste: 10000, perMille: 2, quota: 0.4 },
    ])
  })

  it("un video senza nuovi follower conta nella mediana ma non nei follower", () => {
    const righe = perTipo([video("a", 1000, 10), video("b", 9000)], CRESCITA.tipi)
    expect(righe[0]).toMatchObject({ video: 2, mediana: 5000, perMille: 10, quota: 1 })
    expect(righe[1]).toMatchObject({ video: 0, mediana: null, perMille: null, quota: null })
  })
})
