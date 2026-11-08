import { describe, expect, it } from "vitest"
import { DIVIETI, testiVisibili } from "./linguaggio"

describe("linguaggio dei testi a schermo", () => {
  const testi = testiVisibili()

  it("il sorgente ha testi da controllare", () => {
    expect(testi.length).toBeGreaterThan(300)
  })

  for (const divieto of DIVIETI) {
    it(`nessun testo a schermo contiene ${divieto.nome}`, () => {
      const colpevoli = testi.filter((t) => divieto.regola.test(t.testo)).map((t) => `${t.file}: «${t.testo}»`)
      expect(colpevoli).toEqual([])
    })
  }

  it("lo scanner riconosce un testo vietato", () => {
    expect(DIVIETI.some((d) => d.regola.test("Apri piano.json con bun run test"))).toBe(true)
    expect(DIVIETI.some((d) => d.regola.test("Il montaggio si sta ricalcolando"))).toBe(false)
  })

  it("fuori dalla chat nessun testo nomina Claude: la chat può parlare con un altro programma (contano solo le sue conversazioni)", () => {
    const dellaChat = (file: string) => file.startsWith("chat/") || file.startsWith("produzione/") || file === "video/LavoroDiClaude.tsx"
    const colpevoli = testi.filter((t) => !dellaChat(t.file) && /Claude/.test(t.testo)).map((t) => `${t.file}: «${t.testo}»`)
    expect(colpevoli).toEqual([])
  })

  it("i testi sono in italiano, con gli accenti dove servono", () => {
    const senzaAccento = testi.filter((t) => /\b(?:e'|puo'|perche'|gia'|piu'|cosi'|ne')\b/i.test(t.testo)).map((t) => t.testo)
    expect(senzaAccento).toEqual([])
  })
})
