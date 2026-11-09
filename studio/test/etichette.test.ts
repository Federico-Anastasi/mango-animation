import { describe, expect, it } from "vitest"
import { disponiEtichette, type Etichetta } from "../src/stile/etichette"

const CORPO = 68
const QUADRO = { largo: 1080, alto: 1920 }
const altezza = CORPO * 1.1

const e = (testo: string, y: number, sopra = 0, sotto = QUADRO.alto): Etichetta => ({ x: 540, y, testo, sopra, sotto })
const di = (poste: Etichetta[], i: number): Etichetta => {
  const e = poste[i]
  if (!e) throw new Error(`manca l'etichetta ${i}`)
  return e
}
const siSovrappongono = (a: Etichetta, b: Etichetta) => Math.abs(a.y - b.y) < altezza && Math.abs(a.x - b.x) < ((a.testo.length + b.testo.length) / 2) * CORPO * 0.6

describe("le etichette dei quadri non si coprono", () => {
  it("un'etichetta che non ne tocca altre resta dov'è", () => {
    const poste = disponiEtichette([e("animazione", 400), e("persona", 900)], CORPO, QUADRO)
    expect(poste.map((p) => p.y)).toEqual([400, 900])
  })

  it("due etichette nello stesso punto si separano, e la prima resta ferma", () => {
    const poste = disponiEtichette([e("animazione", 900), e("persona", 900)], CORPO, QUADRO)
    expect(di(poste, 0).y).toBe(900)
    expect(siSovrappongono(di(poste, 0), di(poste, 1))).toBe(false)
  })

  it("tre etichette impilate non si toccano a due a due", () => {
    const poste = disponiEtichette([e("girato", 900), e("titolo", 900), e("sottotitoli", 900)], CORPO, QUADRO)
    for (const [i, a] of poste.entries()) for (const b of poste.slice(i + 1)) expect(siSovrappongono(a, b)).toBe(false)
  })

  it("l'etichetta spostata resta nell'area a cui appartiene, se c'è posto", () => {
    const poste = disponiEtichette([e("titolo", 500), e("girato", 500, 200, 800)], CORPO, QUADRO)
    expect(di(poste, 1).y).not.toBe(500)
    expect(di(poste, 1).y - CORPO / 2).toBeGreaterThanOrEqual(200)
    expect(di(poste, 1).y + CORPO / 2).toBeLessThanOrEqual(800)
  })

  it("se l'area è troppo piccola per spostarla, esce dall'area ma resta nel quadro", () => {
    const poste = disponiEtichette([e("titolo", 500), e("girato", 500, 480, 520)], CORPO, QUADRO)
    expect(siSovrappongono(di(poste, 0), di(poste, 1))).toBe(false)
    expect(di(poste, 1).y - CORPO / 2).toBeGreaterThanOrEqual(0)
    expect(di(poste, 1).y + CORPO / 2).toBeLessThanOrEqual(QUADRO.alto)
  })

  it("etichette lontane in orizzontale non si spostano, anche alla stessa altezza", () => {
    const poste = disponiEtichette([{ ...e("a", 900), x: 100 }, { ...e("b", 900), x: 900 }], CORPO, QUADRO)
    expect(poste.map((p) => p.y)).toEqual([900, 900])
  })

  it("etichette alle due estremità del quadro non escono dal quadro", () => {
    const poste = disponiEtichette([e("in alto", 10), e("in alto 2", 10)], CORPO, QUADRO)
    for (const p of poste) expect(p.y - CORPO / 2).toBeGreaterThanOrEqual(0)
  })
})
