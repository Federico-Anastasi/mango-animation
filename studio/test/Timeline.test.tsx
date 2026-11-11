import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Timeline, type PropsTimeline } from "../src/montaggio/Timeline"
import { infoSorgenti } from "../src/montaggio/sorgenti"
import { creaTrasporto } from "../src/montaggio/trasporto"
import type { Piano } from "../src/tipi"
import { pianoDiProva, pianoSenzaVoce, risoltoDiProva, risoltoSenzaVoce } from "./fixture"

function proprieta(extra: Partial<PropsTimeline> = {}): PropsTimeline {
  const piano = pianoDiProva()
  const risolto = risoltoDiProva()
  return {
    risolto,
    piano,
    proprio: structuredClone(piano) as Piano,
    sorgenti: infoSorgenti(piano.sorgenti, [
      {
        giorno: "2026-10-06",
        file: [{ file: "2026-10-06/a.mp4", nome: "a.mp4", byte: 1, scheda: { tipo: "ripresa", origine: "telefono", durata: 12 }, scheda_problemi: [], preparato: { parole: "preparati/x/parole.json", sagoma: "preparati/x/sagoma.webm", leggero: "preparati/x/leggero.mp4", miniatura: "preparati/x/miniatura.jpg", onda: "preparati/x/onda.bin", trascrizione: null }, usato_in: [] }],
      },
    ]),
    trasporto: creaTrasporto(risolto.durata, 30),
    selezione: null,
    onSeleziona: vi.fn(),
    bloccata: false,
    paroleSorgente: () => [
      { p: "x", da: 2.04, a: 2.5 },
      { p: "y", da: 2.6, a: 2.9 },
    ],
    onde: () => null,
    fotogrammi: [],
    minimoTratto: 0.3,
    onBordo: vi.fn(),
    onSposta: vi.fn(),
    onPortaInScena: vi.fn(),
    onModificaParola: vi.fn(),
    ...extra,
  }
}

const maniglia = (lato: "inizio" | "fine", n: number) => screen.getAllByLabelText(lato === "inizio" ? "Accorcia o allunga l'inizio del pezzo" : "Accorcia o allunga la fine del pezzo")[n]!

function trascina(el: Element, da: number, a: number) {
  fireEvent.pointerDown(el, { clientX: da, button: 0, pointerId: 1 })
  fireEvent.pointerMove(el, { clientX: a, pointerId: 1 })
  fireEvent.pointerUp(el, { clientX: a, pointerId: 1 })
}

describe("la timeline", () => {
  it("mostra scene, tratti, parole, battute, titolo e il righello", () => {
    const { container } = render(<Timeline {...proprieta()} />)
    expect(screen.getByRole("button", { name: "c1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "gara" })).toBeInTheDocument()
    expect(container.querySelectorAll("[data-tratto]")).toHaveLength(4)
    expect(container.querySelectorAll("[data-parola]")).toHaveLength(8)
    expect(screen.getByText("ciao mondo")).toBeInTheDocument()
    expect(screen.getByText("Un titolo di prova")).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Scorri il video" })).toBeInTheDocument()
    expect(screen.getByText("0:10,5")).toBeInTheDocument()
  })

  it("ogni tratto mostra il suo fotogramma; senza, quello del file", () => {
    const { container } = render(<Timeline {...proprieta({ fotogrammi: ["preparati/2026-10-06/a.mp4/fotogrammi/10.jpg", null, "preparati/2026-10-06/a.mp4/fotogrammi/35.jpg", null] })} />)
    const miniatura = (i: number) => (container.querySelector(`[data-tratto="${i}"] > span[aria-hidden]`) as HTMLElement).style.backgroundImage
    expect(miniatura(0)).toContain("/media/preparati/2026-10-06/a.mp4/fotogrammi/10.jpg")
    expect(miniatura(2)).toContain("/media/preparati/2026-10-06/a.mp4/fotogrammi/35.jpg")
    expect(miniatura(1)).toContain("/media/preparati/x/miniatura.jpg")
    expect(miniatura(0)).not.toBe(miniatura(2))
  })

  it("se il tocco viene annullato a metà, il gesto finisce senza cambiare niente e il successivo parte pulito", () => {
    const p = proprieta({ paroleSorgente: () => null })
    const { container } = render(<Timeline {...p} />)
    const bordo = maniglia("inizio", 0)
    fireEvent.pointerDown(bordo, { clientX: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(bordo, { clientX: 140, pointerId: 1 })
    expect(container.querySelector("[class*=guida]")).not.toBeNull()
    fireEvent.pointerCancel(bordo, { pointerId: 1 })
    expect(container.querySelector("[class*=guida]")).toBeNull()
    fireEvent.pointerUp(bordo, { clientX: 140, pointerId: 1 })
    expect(p.onBordo).not.toHaveBeenCalled()
    trascina(maniglia("inizio", 0), 100, 120)
    expect(p.onBordo).toHaveBeenCalledWith(0, "inizio", 2)
  })

  it("se il tocco sul righello viene annullato, la testina smette di seguire il puntatore", () => {
    const p = proprieta()
    render(<Timeline {...p} />)
    const righello = screen.getByRole("slider", { name: "Scorri il video" })
    fireEvent.pointerDown(righello, { clientX: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(righello, { clientX: 200, pointerId: 1 })
    const dove = p.trasporto.t()
    fireEvent.pointerCancel(righello, { pointerId: 1 })
    fireEvent.pointerMove(righello, { clientX: 400, pointerId: 1 })
    expect(p.trasporto.t()).toBe(dove)
  })

  it("trascinare il bordo d'inizio chiama onBordo col secondo della sorgente, al centesimo", () => {
    const p = proprieta({ paroleSorgente: () => null })
    render(<Timeline {...p} />)
    trascina(maniglia("inizio", 0), 100, 120)
    expect(p.onBordo).toHaveBeenCalledWith(0, "inizio", 2)
  })

  it("trascinare il bordo di fine allunga il tratto", () => {
    const p = proprieta({ paroleSorgente: () => null })
    render(<Timeline {...p} />)
    trascina(maniglia("fine", 0), 100, 110)
    expect(p.onBordo).toHaveBeenCalledWith(0, "fine", 3.5)
  })

  it("il bordo si aggancia al confine di una parola vicina", () => {
    const p = proprieta()
    render(<Timeline {...p} />)
    trascina(maniglia("inizio", 0), 100, 120)
    expect(p.onBordo).toHaveBeenCalledWith(0, "inizio", 2.04)
  })

  it("il bordo si aggancia alle parole come le conta il motore: con lo sfasamento del piano, non ai tempi grezzi", () => {
    const base = proprieta()
    const sorgenti = { ...base.sorgenti, a: { ...base.sorgenti["a"]!, sfasamento: -0.05 } }
    const p = proprieta({ sorgenti })
    render(<Timeline {...p} />)
    trascina(maniglia("inizio", 0), 100, 120)
    expect(p.onBordo).toHaveBeenCalledWith(0, "inizio", 1.99)
  })

  it("non lascia un tratto più corto del minimo né più lungo del file", () => {
    const p = proprieta({ paroleSorgente: () => null })
    render(<Timeline {...p} />)
    trascina(maniglia("inizio", 0), 100, 600)
    expect(p.onBordo).toHaveBeenLastCalledWith(0, "inizio", 2.7)
    trascina(maniglia("fine", 1), 100, 5000)
    expect(p.onBordo).toHaveBeenLastCalledWith(1, "fine", 12)
  })

  it("un click sul tratto lo sceglie e porta la testina lì; non scrive niente", () => {
    const p = proprieta()
    const { container } = render(<Timeline {...p} />)
    const tratto = container.querySelector('[data-tratto="1"]')!
    fireEvent.pointerDown(tratto, { clientX: 70, button: 0, pointerId: 1 })
    fireEvent.pointerUp(tratto, { clientX: 70, pointerId: 1 })
    expect(p.onSeleziona).toHaveBeenCalledWith({ tipo: "tratto", scena: 0, pezzo: 0, ordine: 1 })
    expect(p.trasporto.t()).toBe(3.5)
    expect(p.onBordo).not.toHaveBeenCalled()
    expect(p.onSposta).not.toHaveBeenCalled()
  })

  it("trascinare un tratto oltre i vicini della sua scena lo sposta", () => {
    const base = proprieta()
    base.piano.scene[0]!.pezzi.push({ sorgente: "a", da: 20, a: 22 })
    base.risolto.tratti[1]!.pezzo = 1
    render(<Timeline {...base} />)
    const tratto0 = document.querySelector('[data-tratto="0"]')!
    trascina(tratto0, 10, 110)
    expect(base.onSposta).toHaveBeenCalledWith(0, 0, 1)
  })

  it("lasciare un tratto su un'altra scena lo porta lì, dopo i pezzi che hanno il centro prima", () => {
    const base = proprieta()
    render(<Timeline {...base} />)
    trascina(document.querySelector('[data-tratto="0"]')!, 10, 300)
    expect(base.onPortaInScena).toHaveBeenCalledWith(0, 0, 1, 1)
    expect(base.onSposta).not.toHaveBeenCalled()
  })

  it("lasciato sulla sua scena, un tratto non la lascia", () => {
    const base = proprieta()
    render(<Timeline {...base} />)
    trascina(document.querySelector('[data-tratto="0"]')!, 10, 40)
    expect(base.onPortaInScena).not.toHaveBeenCalled()
  })

  it("mentre il montaggio si ricalcola i gesti non scrivono niente, ma si può ancora scegliere", () => {
    const p = proprieta({ bloccata: true, paroleSorgente: () => null })
    const { container } = render(<Timeline {...p} />)
    trascina(maniglia("inizio", 0), 100, 120)
    expect(p.onBordo).not.toHaveBeenCalled()
    fireEvent.pointerDown(container.querySelector('[data-tratto="2"]')!, { clientX: 200, button: 0, pointerId: 1 })
    fireEvent.pointerUp(container.querySelector('[data-tratto="2"]')!, { clientX: 200, pointerId: 1 })
    expect(p.onSeleziona).toHaveBeenCalled()
  })

  it("una parola sceglie, con Maiusc estende, con doppio clic corregge", () => {
    const p = proprieta()
    const { container } = render(<Timeline {...p} />)
    const parola = (i: number) => container.querySelector(`[data-parola="${i}"]`)!
    fireEvent.click(parola(2))
    expect(p.onSeleziona).toHaveBeenLastCalledWith({ tipo: "parole", da: 2, a: 2 })
    expect(p.trasporto.t()).toBe(2.1)
    fireEvent.click(parola(4), { shiftKey: true })
    expect(p.onSeleziona).toHaveBeenLastCalledWith({ tipo: "parole", da: 4, a: 4 })
    fireEvent.doubleClick(parola(3))
    expect(p.onModificaParola).toHaveBeenCalledWith(3)
  })

  it("con una scelta di parole Maiusc la allarga dalla prima", () => {
    const p = proprieta({ selezione: { tipo: "parole", da: 1, a: 1 } })
    const { container } = render(<Timeline {...p} />)
    fireEvent.click(container.querySelector('[data-parola="4"]')!, { shiftKey: true })
    expect(p.onSeleziona).toHaveBeenLastCalledWith({ tipo: "parole", da: 1, a: 4 })
  })

  it("i tagli che cadono nel parlato si vedono, e una scena della base si riconosce", () => {
    const p = proprieta()
    p.risolto.tratti[1]!.legato = [-31, null]
    p.proprio = { base: "madre", scene: [p.piano.scene[1]!] }
    const { container } = render(<Timeline {...p} />)
    expect(screen.getByTitle(/taglio d'inizio cade dentro una parola/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "c1" })).toHaveAttribute("title", "c1: viene dal video di base")
    expect(container.querySelector('[data-tratto="0"]')!.className).toMatch(/ereditata/)
    expect(container.querySelector('[data-tratto="2"]')!.className).not.toMatch(/ereditata/)
  })

  it("scorrere dal righello porta la testina", () => {
    const p = proprieta()
    render(<Timeline {...p} />)
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Scorri il video" }), { clientX: 100, button: 0, pointerId: 1 })
    expect(p.trasporto.t()).toBe(5)
  })

  it("l'ingrandimento cambia la scala e «Tutto il video» la riporta", () => {
    render(<Timeline {...proprieta()} />)
    const tutto = screen.getByRole("button", { name: "Tutto il video" })
    expect(tutto).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Quanto è larga la linea del tempo"), { target: { value: String(Math.log(100)) } })
    expect(tutto).toBeEnabled()
    fireEvent.click(tutto)
    expect(tutto).toBeDisabled()
  })
})

describe("un pezzo senza voce sulla timeline", () => {
  const senzaVoce = () => {
    const piano = pianoSenzaVoce()
    return proprieta({ risolto: risoltoSenzaVoce(), piano, proprio: structuredClone(piano) as Piano, trasporto: creaTrasporto(11, 30) })
  }

  it("sta fra gli altri tratti col suo nome e la sua durata, senza onda né bordi da trascinare", () => {
    const { container } = render(<Timeline {...senzaVoce()} />)
    const tratti = container.querySelectorAll("[data-tratto]")
    expect(tratti).toHaveLength(4)
    const primo = tratti[0] as HTMLElement
    expect(within(primo).getByText("Senza voce")).toBeInTheDocument()
    expect(primo).toHaveAttribute("title", "Senza voce: 4,00 s")
    expect(within(primo).queryAllByRole("separator")).toHaveLength(0)
    expect(within(tratti[1] as HTMLElement).getAllByRole("separator")).toHaveLength(2)
  })

  it("si sceglie con un clic e si sposta come un altro pezzo", () => {
    const p = senzaVoce()
    const { container } = render(<Timeline {...p} />)
    const tratto = container.querySelector('[data-tratto="2"]')!
    fireEvent.pointerDown(tratto, { clientX: 150, button: 0, pointerId: 1 })
    fireEvent.pointerUp(tratto, { clientX: 150, pointerId: 1 })
    expect(p.onSeleziona).toHaveBeenCalledWith({ tipo: "tratto", scena: 2, pezzo: 0, ordine: 0 })
    trascina(tratto, 150, 260)
    expect(p.onSposta).toHaveBeenCalledWith(2, 0, 1)
  })
})
