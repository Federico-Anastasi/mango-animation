// I controlli comuni alle app Mango: i bottoni, l'interruttore, i segmenti, più e meno, l'etichetta di stato, la card di righe.
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Bottone } from "../src/comuni/Bottone"
import { CardDiRighe, Riga } from "../src/comuni/CardDiRighe"
import { EtichettaDiStato } from "../src/comuni/EtichettaDiStato"
import { Interruttore } from "../src/comuni/Interruttore"
import { PiuMeno } from "../src/comuni/PiuMeno"
import { Segmenti } from "../src/comuni/Segmenti"

describe("il bottone", () => {
  it("è normale se non si dice altro; principale, minore e quello che distrugge si chiedono", () => {
    const niente = () => {}
    render(
      <>
        <Bottone onClick={niente}>Apri</Bottone>
        <Bottone variante="principale" onClick={niente}>Salva</Bottone>
        <Bottone variante="minore" onClick={niente}>Annulla</Bottone>
        <Bottone variante="distrugge" onClick={niente}>Togli</Bottone>
      </>,
    )
    const variante = (nome: string) => screen.getByRole("button", { name: nome }).getAttribute("data-variante")
    expect([variante("Apri"), variante("Salva"), variante("Annulla"), variante("Togli")]).toEqual(["normale", "principale", "minore", "distrugge"])
  })

  it("spento non risponde", () => {
    const premuto = vi.fn()
    render(<Bottone onClick={premuto} disabled>Apri</Bottone>)
    fireEvent.click(screen.getByRole("button", { name: "Apri" }))
    expect(premuto).not.toHaveBeenCalled()
  })
})

describe("l'interruttore", () => {
  it("dice se è acceso e a ogni tocco chiede il contrario", () => {
    const cambia = vi.fn()
    const { rerender } = render(<Interruttore etichetta="Dettatura" acceso={false} onCambia={cambia} />)
    const interruttore = screen.getByRole("switch", { name: "Dettatura" })
    expect(interruttore).toHaveAttribute("aria-checked", "false")
    fireEvent.click(interruttore)
    expect(cambia).toHaveBeenLastCalledWith(true)
    rerender(<Interruttore etichetta="Dettatura" acceso onCambia={cambia} />)
    expect(interruttore).toHaveAttribute("aria-checked", "true")
    fireEvent.click(interruttore)
    expect(cambia).toHaveBeenLastCalledWith(false)
  })

  it("spento non si tocca", () => {
    const cambia = vi.fn()
    render(<Interruttore etichetta="Dettatura" acceso={false} disabled onCambia={cambia} />)
    fireEvent.click(screen.getByRole("switch", { name: "Dettatura" }))
    expect(cambia).not.toHaveBeenCalled()
  })
})

describe("i segmenti", () => {
  const TEMI = [
    { id: "sistema", nome: "Del sistema" },
    { id: "chiaro", nome: "Chiaro" },
    { id: "scuro", nome: "Scuro" },
  ] as const

  it("una scelta fra poche: quella scelta è segnata, e toccarne un'altra la chiede", () => {
    const scegli = vi.fn()
    render(<Segmenti etichetta="Tema" valori={TEMI} scelta="chiaro" onScegli={scegli} />)
    const gruppo = screen.getByRole("radiogroup", { name: "Tema" })
    expect(within(gruppo).getAllByRole("radio").map((r) => [r.closest("label")?.textContent, (r as HTMLInputElement).checked])).toEqual([["Del sistema", false], ["Chiaro", true], ["Scuro", false]])
    fireEvent.click(within(gruppo).getByRole("radio", { name: "Scuro" }))
    expect(scegli).toHaveBeenCalledWith("scuro")
  })

  it("due gruppi nella stessa pagina non si rubano la scelta", () => {
    render(
      <>
        <Segmenti etichetta="Tema" valori={TEMI} scelta="chiaro" onScegli={() => {}} />
        <Segmenti etichetta="Tema del telefono" valori={TEMI} scelta="scuro" onScegli={() => {}} />
      </>,
    )
    expect(within(screen.getByRole("radiogroup", { name: "Tema" })).getByRole("radio", { name: "Chiaro" })).toBeChecked()
    expect(within(screen.getByRole("radiogroup", { name: "Tema del telefono" })).getByRole("radio", { name: "Scuro" })).toBeChecked()
  })
})

describe("più e meno", () => {
  it("va a passi, mostra il valore come gli si dice, e al minimo e al massimo il bottone è spento", () => {
    const cambia = vi.fn()
    const { rerender } = render(<PiuMeno etichetta="Grandezza" valore={100} minimo={80} massimo={120} passo={10} mostra={(v) => `${v}%`} onCambia={cambia} />)
    const gruppo = screen.getByRole("group", { name: "Grandezza" })
    expect(within(gruppo).getByRole("status")).toHaveTextContent("100%")
    fireEvent.click(within(gruppo).getByRole("button", { name: "Più" }))
    expect(cambia).toHaveBeenLastCalledWith(110)
    fireEvent.click(within(gruppo).getByRole("button", { name: "Meno" }))
    expect(cambia).toHaveBeenLastCalledWith(90)
    rerender(<PiuMeno etichetta="Grandezza" valore={120} minimo={80} massimo={120} passo={10} onCambia={cambia} />)
    expect(within(gruppo).getByRole("button", { name: "Più" })).toBeDisabled()
    expect(within(gruppo).getByRole("button", { name: "Meno" })).toBeEnabled()
    rerender(<PiuMeno etichetta="Grandezza" valore={80} minimo={80} massimo={120} passo={10} onCambia={cambia} />)
    expect(within(gruppo).getByRole("button", { name: "Meno" })).toBeDisabled()
  })
})

describe("l'etichetta di stato", () => {
  it("porta lo stato che le dà il colore; senza stato è neutra", () => {
    render(
      <>
        <EtichettaDiStato stato="pronto">Collegato</EtichettaDiStato>
        <EtichettaDiStato stato="in-corso">Sta scaricando</EtichettaDiStato>
        <EtichettaDiStato stato="errore">Non parte</EtichettaDiStato>
        <EtichettaDiStato>Spento</EtichettaDiStato>
      </>,
    )
    const stato = (testo: string) => screen.getByText(testo).getAttribute("data-stato")
    expect([stato("Collegato"), stato("Sta scaricando"), stato("Non parte"), stato("Spento")]).toEqual(["pronto", "in-corso", "errore", null])
  })
})

describe("la card di righe", () => {
  it("dice cosa contiene, e ogni riga ha il nome, la spiegazione e il suo controllo", () => {
    render(
      <CardDiRighe nome="Aspetto">
        <Riga nome="Tema" spiegazione="Chiaro, scuro o come il computer.">
          <Bottone onClick={() => {}}>Cambia</Bottone>
        </Riga>
        <Riga nome="Lingua">
          <Bottone onClick={() => {}}>Italiano</Bottone>
        </Riga>
      </CardDiRighe>,
    )
    const card = screen.getByRole("group", { name: "Aspetto" })
    const righe = within(card).getAllByRole("listitem")
    expect(righe).toHaveLength(2)
    expect(within(righe[0]!).getByText("Tema")).toBeInTheDocument()
    expect(within(righe[0]!).getByText("Chiaro, scuro o come il computer.")).toBeInTheDocument()
    expect(within(righe[0]!).getByRole("button", { name: "Cambia" })).toBeInTheDocument()
    expect(within(righe[1]!).getByRole("button", { name: "Italiano" })).toBeInTheDocument()
  })
})
