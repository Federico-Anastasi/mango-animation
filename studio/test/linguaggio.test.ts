import { describe, expect, it } from "vitest"
import { DIVIETI, testiTradotti, testiVisibili } from "./linguaggio"

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
    const dellaChat = (file: string) => file.startsWith("chat/") || file.startsWith("produzione/")
    const colpevoli = testi.filter((t) => !dellaChat(t.file) && /Claude/.test(t.testo)).map((t) => `${t.file}: «${t.testo}»`)
    expect(colpevoli).toEqual([])
  })

  it("una parola sola per ogni cosa: «Prova», «pezzo» (in inglese «clip»), «Visualizzazioni» e «Saves»", () => {
    const { tradotti } = testiTradotti()
    const italiani = [/\bProva per registrare\b/, /\btratt[oi]\b/i, /\bvisit[ae]\b/i]
    const inglesi = [/\bsegments?\b/i, /\bRehearsal for\b/i, /\bvisits?\b/i]
    const colpevoli = tradotti.flatMap((x) => [...italiani.filter((r) => r.test(x.italiano)).map(() => `${x.file}: «${x.italiano}»`), ...inglesi.filter((r) => r.test(x.inglese)).map(() => `${x.file}: «${x.inglese}»`)])
    expect(colpevoli).toEqual([])
    // «Salvati» sono i salvataggi di un video, non il messaggio «Salvato».
    expect(tradotti.filter((x) => /^Salvati$/i.test(x.italiano) && x.inglese !== "Saves").map((x) => `${x.file}: «${x.inglese}»`)).toEqual([])
  })

  it("i testi sono in italiano, con gli accenti dove servono", () => {
    const senzaAccento = testi.filter((t) => /\b(?:e'|puo'|perche'|gia'|piu'|cosi'|ne')\b/i.test(t.testo)).map((t) => t.testo)
    expect(senzaAccento).toEqual([])
  })
})
