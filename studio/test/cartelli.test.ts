import { describe, expect, it } from "vitest"
import { arrotonda } from "../src/montaggio/composizione"
import { cartelliDelTitolo, disponi, fotogrammaA, misureVisibili, postoDelCartello, schedaCartello, sottotitoloAl, titoloAl } from "../src/montaggio/cartelli"
import { risoltoDiProva, stileDiProva } from "./fixture"

// Ogni lettera larga mezzo corpo: i conti si fanno a mano.
const misura = (testo: string, corpo: number) => testo.length * corpo * 0.5

describe("l'arrotondamento è quello di Python", () => {
  it("a metà va al pari", () => {
    expect([arrotonda(2.5), arrotonda(3.5), arrotonda(68.44), arrotonda(-2.5), arrotonda(0.4)]).toEqual([2, 4, 68, -2, 0])
  })
})

describe("la disposizione di un cartello", () => {
  const stile = stileDiProva()
  const sott = schedaCartello(stile, "sottotitoli", { x: 520, y: 1235, largo: 440 })

  it("una riga che sta nella colonna resta una riga, col corpo di partenza", () => {
    const d = disponi("ciao mondo", sott, misura)
    expect(d).toMatchObject({ corpo: 58, passo: 68, righe: 1, largo: 290 + 44, alto: 68 + 30 })
    expect(d.parole.map((p) => [p.testo, p.x, p.riga])).toEqual([
      ["ciao", 22, 0],
      ["mondo", 22 + 5 * 29, 0],
    ])
  })

  it("va a capo quando la colonna finisce, e le parole successive ripartono dal margine", () => {
    const d = disponi("abcdefghijkl mnopqrst", sott, misura)
    expect(d.righe).toBe(2)
    expect(d.parole.map((p) => p.riga)).toEqual([0, 1])
    expect(d.parole[1]!.x).toBe(22)
    expect(d).toMatchObject({ largo: 348 + 44, alto: 68 * 2 + 30 })
  })

  it("una parola che non sta scende di corpo fino al minimo", () => {
    expect(disponi("abcdefghijklmnopqrst", sott, misura).corpo).toBe(38)
    expect(disponi("abcdefghijklmnopqrstuvwxyz", sott, misura).corpo).toBe(38)
  })

  it("l'asterisco segna la correzione e non si scrive", () => {
    const d = disponi("*Agata dice", sott, misura)
    expect(d.parole.map((p) => [p.testo, p.correzione])).toEqual([
      ["Agata", true],
      ["dice", false],
    ])
  })

  it("un cartello centrato centra ogni riga sulla più lunga", () => {
    const titolo = schedaCartello(stile, "titolo", { x: 540, y: 90, largo: 440 })
    const d = disponi("abcdefghijkl mnopqrst", titolo, misura)
    const [prima, seconda] = [d.parole[0]!, d.parole[1]!]
    expect(prima.x).toBe(22)
    expect(seconda.x).toBe(22 + (12 * 32 - 8 * 32) / 2)
  })

  it("il riquadro visibile cresce con le parole dette, ma il posto resta quello del testo intero", () => {
    const d = disponi("ciao mondo", sott, misura)
    expect(misureVisibili(d, sott, 1)).toMatchObject({ largo: 22 + 4 * 29 + 22, alto: 68 + 30 })
    expect(misureVisibili(d, sott, null)?.largo).toBe(d.largo)
    expect(misureVisibili(d, sott, 0)).toBeNull()
    expect(postoDelCartello({ x: 540, y: 805, ancora: "centro" }, d.largo, d.alto)).toEqual({ x: Math.floor((1080 - d.largo) / 2), y: 805 - 49 })
    expect(postoDelCartello({ x: 520, y: 1235, ancora: "sinistra" }, d.largo, d.alto).x).toBe(520)
  })

  it("lo stile del quadro vince su quello di serie: corpo, fondo, colore, filo", () => {
    const scheda = schedaCartello(stile, "sottotitoli", { x: 0, y: 0, largo: 900, corpo: 64, fondo: null, colore: "verde", contorno: 6, colore_contorno: "nero" })
    expect(scheda).toMatchObject({ corpo: 64, largo: 900, fondo: null, colore: "#00FF18", contorno: 6, colore_contorno: "#000000" })
    expect(schedaCartello(stile, "sottotitoli", { x: 0, y: 0, largo: 900 }).fondo).toBe("#F1F0EB")
  })
})

describe("quando si vede un sottotitolo", () => {
  const stile = stileDiProva()
  const risolto = () => {
    const r = risoltoDiProva()
    r.battute = [{ da: 0.2, a: 1.4, testo: "ciao mondo", istanti: [0.5, 1.0] }]
    return r
  }
  const a = (t: number, modo: "parola per parola" | "a battute" | "nessuno", r = risolto()) => sottotitoloAl(r, stile, modo, fotogrammaA(t, 30))

  it("a parole, niente prima della prima parola (la battuta comincia un poco prima) e poi una parola in più per volta", () => {
    expect(a(0.3, "parola per parola")).toBeNull()
    expect(a(0.5, "parola per parola")?.dette).toBe(1)
    expect(a(0.99, "parola per parola")?.dette).toBe(1)
    expect(a(1.0, "parola per parola")?.dette).toBe(2)
  })

  it("il cartello sparisce sul fotogramma in cui la battuta finisce", () => {
    expect(a(1.4 - 1 / 30, "parola per parola")?.dette).toBe(2)
    expect(a(1.4, "parola per parola")).toBeNull()
  })

  it("a battute la battuta intera sta dal suo inizio alla sua fine; nessuno non scrive", () => {
    expect(a(0.1, "a battute")).toBeNull()
    expect(a(0.2, "a battute")).toMatchObject({ dette: null, rilievo: false, sopra: 0 })
    expect(a(0.3, "nessuno")).toBeNull()
  })

  it("se due battute coprono lo stesso fotogramma vince l'ultima", () => {
    const r = risolto()
    r.battute.push({ da: 0.8, a: 2, testo: "dopo", istanti: [0.8] })
    expect(a(0.9, "parola per parola", r)?.battuta.testo).toBe("dopo")
    expect(a(0.6, "parola per parola", r)?.battuta.testo).toBe("ciao mondo")
  })

  it("il quadro è quello della scena in cui comincia la battuta", () => {
    const r = risolto()
    r.battute = [{ da: 7.4, a: 8.5, testo: "ponte", istanti: [7.4] }]
    expect(sottotitoloAl(r, stile, "a battute", fotogrammaA(8, 30))?.spec).toBe(stile.quadri["sagoma-su-animazione"]!.sottotitoli)
  })

  it("una parola in rilievo sta intera nel corpo e nel colore del rilievo, e salta: su, al massimo, poi si posa", () => {
    const r = risolto()
    r.battute = [{ da: 2, a: 3, testo: "superintelligenza", istanti: [2], rilievo: true }]
    const inizio = sottotitoloAl(r, stile, "parola per parola", fotogrammaA(2, 30))
    expect(inizio).toMatchObject({ dette: null, rilievo: true, sopra: 5 })
    expect(inizio?.spec).toMatchObject({ corpo: 84, colore: "rosso" })
    expect(sottotitoloAl(r, stile, "parola per parola", 60 + 5)?.sopra).toBe(36)
    expect(sottotitoloAl(r, stile, "parola per parola", 60 + 11)?.sopra).toBe(0)
    expect(sottotitoloAl(r, stile, "a battute", 89)?.sopra).toBe(0)
    expect(sottotitoloAl(r, stile, "a battute", 90)).toBeNull()
  })
})

describe("il titolo", () => {
  const stile = stileDiProva()

  it("sta dentro la scena in cui si vede, col quadro di quella scena", () => {
    const r = risoltoDiProva()
    expect(titoloAl(r, stile, 0)).toBe(stile.quadri["sagoma-su-animazione"])
    expect(titoloAl(r, stile, fotogrammaA(10, 30))).toBe(stile.quadri["schermo-e-viso"])
    expect(titoloAl(r, stile, fotogrammaA(10.5, 30))).toBeNull()
    r.titolo = { testo: "Un titolo", da: 0, a: 2 }
    expect(titoloAl(r, stile, fotogrammaA(1.9, 30))).not.toBeNull()
    expect(titoloAl(r, stile, fotogrammaA(2, 30))).toBeNull()
    r.titolo = null
    expect(titoloAl(r, stile, 0)).toBeNull()
  })

  it("è maiuscolo se lo stile lo vuole, e la parte sta sotto nel suo colore", () => {
    const s = stileDiProva()
    s.titolo.maiuscolo = true
    const quadro = s.quadri["schermo-e-viso"]!
    const [titolo, parte] = cartelliDelTitolo(s, quadro, { testo: "ciao", parte: "parte uno", da: 0, a: 2 }, misura)
    expect(titolo!.disposizione.parole.map((p) => p.testo)).toEqual(["CIAO"])
    expect(parte!.disposizione.parole.map((p) => p.testo)).toEqual(["PARTE", "UNO"])
    expect(parte!.scheda.colore).toBe("#1F4B99")
    expect(parte!.y).toBe(titolo!.y + titolo!.disposizione.alto + 18)
    expect(titolo!.y).toBe(90 - Math.floor((arrotonda(64 * 1.18) + 30) / 2))
    expect(cartelliDelTitolo(s, quadro, { testo: "ciao", da: 0, a: 2 }, misura)).toHaveLength(1)
  })
})
