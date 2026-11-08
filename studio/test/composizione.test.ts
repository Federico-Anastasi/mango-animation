import { describe, expect, it } from "vitest"
import * as c from "../src/montaggio/composizione"
import { risoltoDiProva, stileDiProva } from "./fixture"
import type { Strato } from "../src/tipi"

const palco = { larghezza: 1080, altezza: 1920 }

describe("tempo della scena animata", () => {
  it("senza ancore scorre al passo del video", () => {
    expect(c.tempoDiScena([], 3.2)).toBe(3.2)
  })

  it("prima della prima ancora scorre e poi aspetta", () => {
    const ancore: Array<[number, number]> = [[4, 1.5]]
    expect(c.tempoDiScena(ancore, 1)).toBe(1)
    expect(c.tempoDiScena(ancore, 3)).toBe(1.5)
  })

  it("fra due ancore scorre e aspetta, dopo l'ultima prosegue", () => {
    const ancore: Array<[number, number]> = [
      [2, 1],
      [6, 3],
    ]
    expect(c.tempoDiScena(ancore, 2)).toBe(1)
    expect(c.tempoDiScena(ancore, 2.5)).toBe(1.5)
    expect(c.tempoDiScena(ancore, 5)).toBe(3)
    expect(c.tempoDiScena(ancore, 9)).toBe(6)
  })
})

describe("zoom e finestra del girato", () => {
  const sorgente = { larghezza: 1920, altezza: 1080 }
  const area = { x: 0, y: 170, w: 1080, h: 810 }

  it("senza vista riempie l'area attorno al centro", () => {
    const f = c.finestraGirato({ sorgente, vista: null, area, centro: [0.5, 0.5], zoom: null, avanzamento: 0, contieni: false })
    expect(f.h).toBe(1080)
    expect(f.w).toBeCloseTo(1440)
    expect(f.x).toBeCloseTo(240)
  })

  it("la vista è il taglio da cui si parte", () => {
    const f = c.finestraGirato({ sorgente, vista: [720, 280, 960, 720], area, centro: [0.5, 0.5], zoom: null, avanzamento: 0, contieni: false })
    expect(f).toEqual({ x: 720, y: 280, w: 960, h: 720 })
  })

  it("lo zoom stringe la finestra attorno al suo centro, senza uscire dalla vista", () => {
    const f = c.finestraGirato({ sorgente, vista: [720, 280, 960, 720], area, centro: [0.5, 0.5], zoom: { scala: 2, centro: [0.99, 0.1] }, avanzamento: 0, contieni: false })
    expect(f.w).toBe(480)
    expect(f.x).toBe(720 + 960 - 480)
    expect(f.y).toBe(280)
  })

  it("lo zoom che cresce segue l'avanzamento", () => {
    expect(c.scalaDelloZoom({ da: 1, a: 2 }, 0.5)).toBe(1.5)
    expect(c.scalaDelloZoom({ scala: 1.3 }, 0.9)).toBe(1.3)
    expect(c.scalaDelloZoom(null, 0.9)).toBe(1)
  })

  it("`contieni` tiene tutto il fotogramma e lo centra nell'area", () => {
    const f = c.finestraGirato({ sorgente, vista: null, area: { x: 0, y: 250, w: 1080, h: 1160 }, centro: [0.5, 0.5], zoom: null, avanzamento: 0, contieni: true })
    expect(f).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
    const posa = c.posaNellArea({ x: 0, y: 250, w: 1080, h: 1160 }, f, true)
    expect(posa.destinazione.w).toBe(1080)
    expect(posa.destinazione.h).toBeCloseTo(607.5)
    expect(posa.destinazione.y).toBeCloseTo(250 + (1160 - 607.5) / 2)
  })

  it("l'avanzamento del pezzo conta i tratti del pezzo", () => {
    const risolto = risoltoDiProva()
    expect(c.avanzamentoDelPezzo(risolto, 0, 0)).toBe(0)
    expect(c.avanzamentoDelPezzo(risolto, 1, 2)).toBeCloseTo(2 / 7.5)
    expect(c.avanzamentoDelPezzo(risolto, 1, 7.5)).toBe(1)
    expect(c.avanzamentoDelPezzo(risolto, 99, 1)).toBe(0)
  })
})

describe("l'aspetto del cartello dei sottotitoli", () => {
  it("con un fondo lo colora; con fondo null non c'è riquadro", () => {
    const stile = stileDiProva()
    expect(c.aspettoDelCartello(stile, 1).background).toBe("#F1F0EB")
    stile.sottotitoli.fondo = null
    expect(c.aspettoDelCartello(stile, 1).background).toBe("transparent")
  })

  it("il contorno è un filo attorno alle lettere, nel suo colore e in scala; senza contorno non c'è", () => {
    const stile = stileDiProva()
    expect(c.aspettoDelCartello(stile, 1).WebkitTextStroke).toBeUndefined()
    stile.sottotitoli.contorno = 6
    stile.sottotitoli.colore_contorno = "nero"
    expect(c.aspettoDelCartello(stile, 0.5).WebkitTextStroke).toBe("6px #000000")
  })
})

describe("posa degli strati", () => {
  it("la sagoma sta sul fondo, alta scala_minima, spostata di x", () => {
    const strato = stileDiProva().quadri["sagoma-su-animazione"]!.strati[1] as Extract<Strato, { tipo: "sagoma" }>
    const posa = c.posaSagoma(strato, { larghezza: 1080, altezza: 1920 }, palco)
    expect(posa.destinazione.h).toBeCloseTo(1152)
    expect(posa.destinazione.y).toBeCloseTo(768)
    expect(posa.destinazione.x).toBe(-70)
    expect(posa.destinazione.w).toBeCloseTo(648)
  })

  it("con x «testa» la sagoma sta al centro del palco", () => {
    const strato = { ...(stileDiProva().quadri["sagoma-su-animazione"]!.strati[1] as Extract<Strato, { tipo: "sagoma" }>), x: "testa" as const }
    const posa = c.posaSagoma(strato, { larghezza: 1080, altezza: 1920 }, palco)
    expect(posa.destinazione.x + posa.destinazione.w / 2).toBeCloseTo(540)
  })

  describe("la sagoma misurata, come la compone il motore", () => {
    const base = stileDiProva().quadri["sagoma-su-animazione"]!.strati[1] as Extract<Strato, { tipo: "sagoma" }>
    const strato = { ...base, x: "testa" as const, scala_minima: 1, scala_margine: 0.005 }

    it("la scala è la più piccola per cui il girato arriva al fondo, e con la testa al centro copre ancora la larghezza", () => {
      expect(c.scalaDellaSagoma({ ...base, x: -70 }, palco, [{ cima: 300, centro: 540 }])).toBeCloseTo(1015 / 1620)
      expect(c.scalaDellaSagoma({ ...base, x: -70 }, palco, [])).toBe(0.6)
      expect(c.scalaDellaSagoma(strato, palco, [{ cima: 300, centro: 540 }])).toBeCloseTo(1.005)
      expect(c.scalaDellaSagoma(strato, palco, [{ cima: 300, centro: 540 }, { cima: 300, centro: 400 }])).toBeCloseTo(1.355)
    })

    it("la ripresa con la testa più in basso decide la scala di tutte", () => {
      const sola = (cima: number) => c.scalaDellaSagoma({ ...base, x: -70, scala_minima: 0.1 }, palco, [{ cima, centro: 540 }])
      expect(sola(600)).toBeGreaterThan(sola(100))
      expect(c.scalaDellaSagoma({ ...base, x: -70, scala_minima: 0.1 }, palco, [{ cima: 600, centro: 540 }, { cima: 100, centro: 540 }])).toBe(sola(600))
    })

    it("si taglia da aria sopra la testa, la cima va a testa dal fondo e il centro della testa al centro del palco", () => {
      const posa = c.posaSagomaMisurata(strato, 1.005, { cima: 300, centro: 540 }, palco)
      expect(posa.origine).toEqual({ x: 0, y: 230, w: 1080, h: 1082 })
      expect(posa.destinazione).toEqual({ x: -3, y: 835, w: 1086, h: 1088 })
      expect(posa.sfuma).toBe(8)
      const decentrata = c.posaSagomaMisurata(strato, 1.355, { cima: 300, centro: 400 }, palco)
      expect(decentrata.destinazione.x + 400 * 1.355).toBeCloseTo(540, 0)
    })

    it("senza testa al centro la sagoma sta dove dice x, e non esce dal fondo del fotogramma", () => {
      const posa = c.posaSagomaMisurata({ ...base, x: -70 }, 0.6, { cima: 20, centro: 540 }, palco)
      expect(posa.destinazione.x).toBe(-70)
      expect(posa.origine.y).toBe(0)
      expect(posa.origine.h).toBeLessThanOrEqual(1920)
    })
  })

  it("la sagoma di un tratto si legge dalla sua ripresa, o dall'altra che il pezzo dichiara, allo stesso passo", () => {
    const tratto = risoltoDiProva().tratti[1]!
    expect(c.secondoDellaSagoma(tratto, 4)).toBe(4)
    expect(c.secondoDellaSagoma({ ...tratto, da: 3.5, sagoma: { sorgente: "b", da: 20 } }, 4)).toBe(20.5)
  })

  it("il riquadro è ingrandito, centrato in orizzontale, con il bordo alto a y", () => {
    const strato = stileDiProva().quadri["schermo-e-viso"]!.strati[2] as Extract<Strato, { tipo: "riquadro" }>
    const posa = c.posaRiquadro(strato, [1244, 26, 432, 246], palco)
    expect(posa.destinazione).toEqual({ x: 108, y: 1170, w: 864, h: 492 })
    expect(posa.origine).toEqual({ x: 1244, y: 26, w: 432, h: 246 })
  })

  it("l'inserto sta a bordo dall'angolo dell'area del girato", () => {
    const strato = stileDiProva().quadri["schermo-e-viso"]!.strati[1] as Extract<Strato, { tipo: "inserto" }>
    const posa = c.posaInserto(strato, { x: 0, y: 170, w: 1080, h: 810 }, [10, 105, 482, 250])
    expect(posa.destinazione).toEqual({ x: 16, y: 186, w: 482, h: 250 })
  })

  it("lo strato di un tipo si trova nel quadro", () => {
    const quadro = stileDiProva().quadri["schermo-e-viso"]!
    expect(c.stratoDi(quadro, "riquadro")?.nome).toBe("webcam")
    expect(c.stratoDi(quadro, "sagoma")).toBeUndefined()
  })

  it("un colore che non è in stile è un errore", () => {
    expect(c.colore(stileDiProva(), "carta")).toBe("#F1F0EB")
    expect(() => c.colore(stileDiProva(), "viola")).toThrow(/viola/)
  })
})

describe("formati e viso", () => {
  it("un quadro orizzontale ha il formato orizzontale, gli altri quello di base", () => {
    const stile = stileDiProva()
    expect(c.formatoDelQuadro(stile, stile.quadri["lungo-schermo"]!)).toEqual({ largo: 1920, alto: 1080, fps: 30 })
    expect(c.formatoDelQuadro(stile, stile.quadri["girato-pieno"]!)).toEqual({ largo: 1080, alto: 1920, fps: 30 })
    expect(() => c.formatoDelQuadro(stile, { ...stile.quadri["girato-pieno"]!, formato: "quadrato" })).toThrow(/quadrato/)
  })

  it("con una vista si tiene tutto dentro l'area, senza si riempie, a meno che il quadro lo dica", () => {
    const strato = { tipo: "girato" as const, area: [0, 0, 10, 10] as [number, number, number, number] }
    expect(c.contieniLaVista(strato, true)).toBe(true)
    expect(c.contieniLaVista(strato, false)).toBe(false)
    expect(c.contieniLaVista({ ...strato, adatta: "riempi" }, true)).toBe(false)
    expect(c.contieniLaVista({ ...strato, adatta: "contieni" }, false)).toBe(true)
  })

  it("il viso sta nell'angolo scelto, a margine dal bordo, largo quanto dice il quadro", () => {
    const strato = stileDiProva().quadri["lungo-schermo"]!.strati[1] as Extract<Strato, { tipo: "viso" }>
    const palco1920 = { larghezza: 1920, altezza: 1080 }
    const posa = c.posaViso(strato, [880, 24, 360, 200], palco1920)
    expect(posa.destinazione.w).toBe(420)
    expect(posa.destinazione.h).toBeCloseTo(233.33, 1)
    expect(posa.destinazione.x).toBe(1920 - 36 - 420)
    expect(posa.destinazione.y).toBeCloseTo(1080 - 36 - 233.33, 1)
    expect(c.posaViso({ ...strato, angolo: "alto-sinistra" }, [0, 0, 100, 100], palco1920).destinazione).toMatchObject({ x: 36, y: 36 })
  })
})
