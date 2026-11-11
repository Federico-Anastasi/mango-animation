import { afterEach, describe, expect, it, vi } from "vitest"
import { MotorePiano, type DatiPiano, type Slot } from "../src/montaggio/motore"
import { creaTrasporto } from "../src/montaggio/trasporto"
import { scegliLingua } from "../src/lingua"
import { pianoDiProva, risoltoDiProva, stileDiProva } from "./fixture"

afterEach(() => vi.unstubAllGlobals())

const slot = (): Slot => ({ girato: document.createElement("video"), sagoma: document.createElement("video"), anim: document.createElement("video") })
const dati = (): DatiPiano => ({ risolto: risoltoDiProva(), piano: pianoDiProva(), stile: stileDiProva(), sorgenti: {}, teste: {}, urlAnimazione: () => "", versioneScene: "" })

function prova() {
  const cornici: FrameRequestCallback[] = []
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => cornici.push(f))
  vi.stubGlobal("cancelAnimationFrame", () => undefined)
  const ctx = new Proxy({}, { get: () => () => ({ width: 0 }), set: () => true })
  const tela = { getContext: () => ctx, width: 540, height: 960 } as unknown as HTMLCanvasElement
  const frasi: Array<string | null> = []
  const motore = new MotorePiano(tela, [slot(), slot()], creaTrasporto(10, 30), (f) => frasi.push(f))
  return { cornici, frasi, motore }
}

describe("il disegno dell'anteprima", () => {
  it("uno stile con un colore che non c'è ferma il ciclo e dice il perché, invece di lanciare a ogni fotogramma", () => {
    const { cornici, frasi, motore } = prova()
    const d = dati()
    delete d.stile.colori[d.stile.quadri[d.risolto.scene[0]!.quadro]!.fondo]
    motore.imposta(d)
    motore.avvia()
    cornici.shift()!(0)
    expect(frasi).toHaveLength(1)
    expect(frasi[0]).toMatch(/^Il colore «.+» non è nello stile\.$/)
    expect(cornici).toHaveLength(1) // quello armato prima del disegno: non se ne arma un altro
  })

  it("la frase segue la lingua", () => {
    scegliLingua("en")
    const { cornici, frasi, motore } = prova()
    const d = dati()
    delete d.stile.colori[d.stile.quadri[d.risolto.scene[0]!.quadro]!.fondo]
    motore.imposta(d)
    motore.avvia()
    cornici.shift()!(0)
    expect(frasi[0]).toMatch(/^The color «.+» is not in the style\.$/)
  })

  it("con lo stile corretto il disegno riparte e la frase si toglie", () => {
    const { cornici, frasi, motore } = prova()
    const rotto = dati()
    delete rotto.stile.colori[rotto.stile.quadri[rotto.risolto.scene[0]!.quadro]!.fondo]
    motore.imposta(rotto)
    motore.avvia()
    cornici.shift()!(0)
    cornici.length = 0
    vi.stubGlobal("FontFace", class { load = () => new Promise<void>(() => undefined) })
    motore.imposta(dati())
    expect(frasi.at(-1)).toBeNull()
    expect(cornici).toHaveLength(1)
    cornici.shift()!(16)
    expect(frasi.at(-1)).toBeNull()
  })
})
