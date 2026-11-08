import { describe, expect, it } from "vitest"
import { misureDelleTeste } from "../src/montaggio/teste"

const sorgenti = { a: { file: "2026-10-06/a.mp4" }, b: { file: "2026-10-08/b.mp4" } }

describe("le misure della testa lette da teste.json", () => {
  it("per nome di sorgente: la cima e il centro (la mediana dei centri misurati)", () => {
    const letto = { "2026-10-06/a.mp4": { sagoma: {}, intervalli: [[0, 4]], cima: 312, centri: [500, 520, 560] }, "2026-10-08/b.mp4": { cima: 200, centri: [400, 500, 600, 700] } }
    expect(misureDelleTeste(letto, sorgenti)).toEqual({ a: { cima: 312, centro: 520 }, b: { cima: 200, centro: 550 } })
  })

  it("una ripresa senza misure, o con misure incomplete, non compare", () => {
    const letto = { "2026-10-06/a.mp4": { cima: null, centri: [] }, "2026-10-08/b.mp4": { cima: 200 } }
    expect(misureDelleTeste(letto, sorgenti)).toEqual({})
  })

  it("un file che non c'è o non è quello atteso non dà misure", () => {
    expect(misureDelleTeste(null, sorgenti)).toEqual({})
    expect(misureDelleTeste([], sorgenti)).toEqual({})
    expect(misureDelleTeste({ "2026-10-06/a.mp4": 3 }, sorgenti)).toEqual({})
  })
})
