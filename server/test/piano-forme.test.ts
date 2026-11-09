import { describe, expect, test } from "bun:test"
import { trattiDelRisolto } from "../src/indice"
import { controllaRiferimenti, type Piano } from "../src/piano"

const QUADRI = new Set(["girato-pieno", "solo-animazione"])

describe("le forme della voce registrata a parte e del video senza girato", () => {
  test("un pezzo senza voce, un suono legato a una scena e un girato che scorre passano", () => {
    const piano: Piano = {
      quadro: "solo-animazione",
      sorgenti: { memo: { file: "2026-10-24/memo.m4a" }, ripresa: { file: "2026-10-23/IMG_1.MOV" } },
      scene: [
        { nome: "a", pezzi: [{ durata: 2 }] },
        { nome: "b", pezzi: [{ sorgente: "memo", girato: { sorgente: "ripresa", da: 1 } }] },
      ],
      suoni: [{ scena: "a" }, { sorgente: "memo" }],
    }
    expect(controllaRiferimenti(piano, QUADRI)).toEqual([])
  })

  test("una scena del suono e una sorgente del girato che non ci sono si dicono", () => {
    const piano: Piano = {
      quadro: "solo-animazione",
      sorgenti: { memo: { file: "2026-10-24/memo.m4a" } },
      scene: [{ nome: "a", pezzi: [{ sorgente: "memo", girato: { sorgente: "manca", da: 0 } }] }],
      suoni: [{ scena: "b" }],
    }
    expect(controllaRiferimenti(piano, QUADRI).map(String)).toEqual([
      "scene[0] («a»).pezzi[0].girato: la sorgente «manca» non è dichiarata in «sorgenti».",
      "suoni[0]: la scena «b» non c'è fra le scene del piano.",
    ])
  })

  test("un pezzo senza voce col suo girato muto: la vista è di quella ripresa, e il fotogramma del tratto viene da lì", () => {
    const piano: Piano = {
      quadro: "girato-pieno",
      sorgenti: { ripresa: { file: "2026-10-23/IMG_1.MOV", viste: { schermo: { taglio: [0, 0, 1080, 1080] } } } },
      scene: [{ nome: "a", pezzi: [{ durata: 4, girato: { sorgente: "ripresa", da: 110, a: 290 }, vista: "schermo" }, { durata: 2, girato: { sorgente: "ripresa", da: 0 }, vista: "manca" }] }],
    }
    expect(controllaRiferimenti(piano, QUADRI).map(String)).toEqual(["scene[0] («a»).pezzi[1]: la vista «manca» non è dichiarata in «sorgenti.ripresa.viste»."])
    const risolto = { tratti: [{ sorgente: null, da: 0, girato: { sorgente: "ripresa", da: 110, passo: 45 } }, { sorgente: null, da: 0, girato: { sorgente: "ripresa", fermo: 3 } }, { sorgente: null, da: 0, girato: null }] }
    expect(trattiDelRisolto(risolto)).toEqual([{ sorgente: "ripresa", da: 110 }, { sorgente: "ripresa", da: 3 }, { sorgente: null, da: null }])
  })
})
