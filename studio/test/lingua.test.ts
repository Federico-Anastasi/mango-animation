import { afterEach, describe, expect, it, vi } from "vitest"
import { lingua, localeInUso, prossimaScelta, scegliLingua, t } from "../src/lingua"
import * as testo from "../src/testo"
import { DIVIETI, testiTradotti } from "./linguaggio"

afterEach(() => vi.restoreAllMocks())

describe("la lingua dell'interfaccia", () => {
  it("un testo si legge nella lingua in uso, e i segnaposto si riempiono", () => {
    expect(t("Annulla", "Undo")).toBe("Annulla")
    scegliLingua("en")
    expect(t("Annulla", "Undo")).toBe("Undo")
    expect(t("{n} file", "{n} files", { n: 3 })).toBe("3 files")
    expect(t("{n} file", "{n} files", { altro: 3 })).toBe("{n} files")
    expect(lingua()).toBe("en")
    expect(document.documentElement.lang).toBe("en")
  })

  it("senza scelta vale la lingua del sistema: italiano per chi parla italiano, inglese per tutti gli altri", () => {
    const sistema = vi.spyOn(navigator, "language", "get")
    sistema.mockReturnValue("it-IT")
    scegliLingua("sistema")
    expect(lingua()).toBe("it")
    sistema.mockReturnValue("fr-FR")
    scegliLingua("sistema")
    expect(lingua()).toBe("en")
    sistema.mockReturnValue("en-US")
    scegliLingua("it")
    expect(lingua()).toBe("it")
  })

  it("la scelta si ricorda nel browser e il pulsante passa dal sistema all'italiano all'inglese", () => {
    scegliLingua("en")
    expect(localStorage.getItem("mango-animation.lingua")).toBe("en")
    scegliLingua("sistema")
    expect(localStorage.getItem("mango-animation.lingua")).toBeNull()
    expect(["sistema", "it", "en"].map((s) => prossimaScelta(s as "sistema"))).toEqual(["it", "en", "sistema"])
  })
})

describe("numeri, tempi e date nelle due lingue", () => {
  it("in italiano virgola e punto all'italiana, in inglese al contrario", () => {
    expect([testo.numero(12345.6, 2), testo.durata(1.5), testo.tempoLeggibile(12.4), testo.peso(1536)]).toEqual(["12.345,60", "1,5 s", "0:12,4", "2 KB"])
    scegliLingua("en")
    expect([testo.numero(12345.6, 2), testo.durata(1.5), testo.tempoLeggibile(12.4), testo.peso(1536)]).toEqual(["12,345.60", "1.5 s", "0:12.4", "2 KB"])
    expect(localeInUso()).toBe("en-GB")
  })

  it("i conteggi grossi e le durate stimate a parole", () => {
    expect([testo.quantitaGrossa(234_000), testo.quantitaGrossa(1_200_000), testo.durataCirca(240), testo.durataCirca(10)]).toEqual(["234 mila", "1,2 milioni", "circa 4 min", "meno di un minuto"])
    scegliLingua("en")
    expect([testo.quantitaGrossa(234_000), testo.quantitaGrossa(1_200_000), testo.durataCirca(240), testo.durataCirca(10)]).toEqual(["234 thousand", "1.2 million", "about 4 min", "less than a minute"])
  })

  it("le date seguono la lingua; una che non si legge lo dice", () => {
    expect(testo.data("2026-10-07T13:15:00")).toMatch(/^7 ott 2026$/)
    expect(testo.giorno("2026-06-23")).toBe("23 giu 2026")
    scegliLingua("en")
    expect(testo.data("2026-10-07T13:15:00")).toBe("7 Oct 2026")
    expect(testo.giorno("2026-06-23")).toBe("23 Jun 2026")
    expect(testo.dataOra("boh")).toBe("invalid date")
  })
})

describe("i testi tradotti del sorgente", () => {
  const { tradotti, malformati } = testiTradotti()
  const segnaposto = (testo: string) => [...testo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()
  const CATEGORIE = DIVIETI.filter((d) => !/inglese|gergo/.test(d.nome))

  it("ogni chiamata a t() ha due testi fra virgolette doppie, scritti per esteso", () => {
    expect(malformati).toEqual([])
  })

  it("i due testi hanno gli stessi segnaposto", () => {
    expect(tradotti.filter((x) => segnaposto(x.italiano).join() !== segnaposto(x.inglese).join()).map((x) => `${x.file}: «${x.italiano}» / «${x.inglese}»`)).toEqual([])
  })

  it("il testo inglese non ha lettere accentate all'italiana, e non è lasciato in italiano", () => {
    const accentati = tradotti.filter((x) => /[àèéìòù]/i.test(x.inglese)).map((x) => `${x.file}: «${x.inglese}»`)
    expect(accentati).toEqual([])
    const lasciati = tradotti.filter((x) => x.italiano === x.inglese && /\b(?:il|lo|la|di|che|non|per|una|con|nel|sono)\b/i.test(x.inglese)).map((x) => `${x.file}: «${x.inglese}»`)
    expect(lasciati).toEqual([])
  })

  for (const categoria of CATEGORIE) {
    it(`nessun testo inglese a schermo contiene ${categoria.nome}`, () => {
      expect(tradotti.filter((x) => categoria.regola.test(x.inglese)).map((x) => `${x.file}: «${x.inglese}»`)).toEqual([])
    })
  }
})
