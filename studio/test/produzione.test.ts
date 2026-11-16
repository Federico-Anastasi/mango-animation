import { describe, expect, it } from "vitest"
import { medie, motoriConTokenInParte, motoriSenzaToken, negliUltimiGiorni, piuLunghiERapidi, righeDellaProduzione, videoFatti } from "../src/produzione/calcoli"
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
  quadri: [],
  ha_finale: true,
  fase: null,
  ultimo_cambio: ultimoCambio,
})

const conti = (tempo: number, scritti: number, riletti = scritti * 100, nuovi = scritti * 4): ConsumoDiUnVideo => ({
  tempo,
  giri: 3,
  token: { scritti, riletti, nuovi },
  dal: fa(5),
  al: fa(1),
  motori: { "claude-code": { tempo, giri: 3, giri_con_token: 3, token: { scritti, riletti, nuovi } } },
})

/** Un conto con la parte di Claude e quella di Codex, che non dice i token. */
const contiInDue = (tempoDiClaude: number, tempoDiCodex: number, scritti: number): ConsumoDiUnVideo => ({
  tempo: tempoDiClaude + tempoDiCodex,
  giri: 5,
  token: { scritti, riletti: scritti * 100, nuovi: scritti * 4 },
  dal: fa(5),
  al: fa(1),
  motori: {
    "claude-code": { tempo: tempoDiClaude, giri: 3, giri_con_token: 3, token: { scritti, riletti: scritti * 100, nuovi: scritti * 4 } },
    codex: { tempo: tempoDiCodex, giri: 2, giri_con_token: 0, token: null },
  },
})

/** Un conto con la parte di Claude e quella di Codex, che dice i token dei suoi giri. */
const contiInDueConToken = (tempoDiClaude: number, tempoDiCodex: number, scritti: number, scrittiDiCodex: number): ConsumoDiUnVideo => {
  const di = (s: number) => ({ scritti: s, riletti: s * 100, nuovi: s * 4 })
  return {
    tempo: tempoDiClaude + tempoDiCodex,
    giri: 5,
    token: di(scritti + scrittiDiCodex),
    dal: fa(5),
    al: fa(1),
    motori: { "claude-code": { tempo: tempoDiClaude, giri: 3, giri_con_token: 3, token: di(scritti) }, codex: { tempo: tempoDiCodex, giri: 2, giri_con_token: 2, token: di(scrittiDiCodex) } },
  }
}

/** Un conto fatto solo da Codex. */
const contiDiCodex = (tempo: number): ConsumoDiUnVideo => ({ tempo, giri: 2, token: { scritti: 0, riletti: 0, nuovi: 0 }, dal: fa(5), al: fa(1), motori: { codex: { tempo, giri: 2, giri_con_token: 0, token: null } } })

/** Un conto con i giri di Codex misti: uno dal terminale, senza token, e uno con l'app accesa. */
const contiConGiriMisti = (tempo: number, scritti: number): ConsumoDiUnVideo => ({
  tempo,
  giri: 2,
  token: { scritti, riletti: scritti * 100, nuovi: scritti * 4 },
  dal: fa(5),
  al: fa(1),
  motori: { codex: { tempo, giri: 2, giri_con_token: 1, token: { scritti, riletti: scritti * 100, nuovi: scritti * 4 } } },
})

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
    expect(m).toEqual({ video: 2, senzaConti: 1, tempo: 2700, motori: { "claude-code": 2700 }, scritti: 75_000, riletti: 7_500_000, nuovi: 300_000 })
  })

  it("con due motori dicono la parte di ognuno; i token sono la media dei video di cui qualche motore li dice, mai contando come zero chi non li dice", () => {
    const m = medie(fatti, { a: contiInDue(3600, 1200, 100_000), b: contiDiCodex(600), c: contiInDue(1800, 0, 50_000) })
    expect(m).toMatchObject({ video: 3, tempo: (4800 + 600 + 1800) / 3, scritti: 75_000, riletti: 7_500_000, nuovi: 300_000 })
    expect(m?.motori).toEqual({ "claude-code": (3600 + 1800) / 3, codex: (1200 + 600) / 3 })
  })

  it("se nessun motore dice i token, i token non hanno media", () => {
    expect(medie(fatti, { a: contiDiCodex(600) })).toMatchObject({ tempo: 600, scritti: null, riletti: null, nuovi: null })
  })

  it("dicono quali motori non danno i token", () => {
    expect(motoriSenzaToken([conti(60, 1), contiInDue(60, 60, 1), contiDiCodex(60)])).toEqual(["codex"])
    expect(motoriSenzaToken([conti(60, 1)])).toEqual([])
  })

  it("i token di Codex, dove ci sono, entrano nella media insieme a quelli di Claude", () => {
    const m = medie(fatti, { a: contiInDueConToken(3600, 1200, 100_000, 20_000), b: contiInDue(1800, 600, 50_000) })
    expect(m).toMatchObject({ video: 2, scritti: (120_000 + 50_000) / 2, riletti: (12_000_000 + 5_000_000) / 2, nuovi: (480_000 + 200_000) / 2 })
  })

  it("dicono quali motori danno i token solo per alcuni conti", () => {
    expect(motoriConTokenInParte([conti(60, 1), contiInDueConToken(60, 60, 1, 1), contiInDue(60, 60, 1)])).toEqual(["codex"])
    expect(motoriConTokenInParte([contiInDueConToken(60, 60, 1, 1), contiInDueConToken(60, 60, 1, 1)])).toEqual([])
    expect(motoriConTokenInParte([contiInDue(60, 60, 1), contiDiCodex(60)])).toEqual([])
    expect(motoriSenzaToken([contiInDueConToken(60, 60, 1, 1), contiInDue(60, 60, 1)])).toEqual([])
  })

  it("un solo video con i giri di un motore in parte con i token e in parte senza basta per dirlo", () => {
    expect(motoriConTokenInParte([contiConGiriMisti(60, 1)])).toEqual(["codex"])
    expect(motoriConTokenInParte([contiConGiriMisti(60, 1), contiInDueConToken(60, 60, 1, 1)])).toEqual(["codex"])
    expect(motoriSenzaToken([contiConGiriMisti(60, 1)])).toEqual([])
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

  it("ogni riga tiene la parte di ogni motore", () => {
    const due = righeDellaProduzione(videoFatti([voce("x", {})]), { x: contiInDue(3600, 1200, 10) }, [])
    expect(due[0]).toMatchObject({ tempo: 4800, motori: { "claude-code": 3600, codex: 1200 } })
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
