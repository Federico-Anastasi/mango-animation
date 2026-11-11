// «Copia»: lo studio dal telefono si apre da un indirizzo `http://` della rete di casa, dove il browser non offre gli appunti moderni.
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BottoneCopia } from "../src/comuni/BottoneCopia"

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, "execCommand")
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
})

describe("il bottone Copia", () => {
  it("con gli appunti moderni scrive il testo e dice «Copiato»", async () => {
    const scrivi = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: scrivi }, configurable: true })
    render(<BottoneCopia testo="un testo" />)
    fireEvent.click(screen.getByRole("button", { name: "Copia" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Copiato" })).toBeInTheDocument())
    expect(scrivi).toHaveBeenCalledWith("un testo")
  })

  it("dove il browser non ha gli appunti moderni (una pagina http dal telefono) copia da un campo nascosto", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
    let copiato = ""
    Object.defineProperty(document, "execCommand", {
      value: vi.fn((comando: string) => {
        copiato = document.querySelector("textarea")!.value
        return comando === "copy"
      }),
      configurable: true,
    })
    render(<BottoneCopia testo="la didascalia" />)
    fireEvent.click(screen.getByRole("button", { name: "Copia" }))
    expect(await screen.findByRole("button", { name: "Copiato" })).toBeInTheDocument()
    expect(copiato).toBe("la didascalia")
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("se il browser non lascia copiare, lo dice invece di restare muto", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
    Object.defineProperty(document, "execCommand", { value: vi.fn(() => false), configurable: true })
    render(<BottoneCopia testo="un testo" />)
    fireEvent.click(screen.getByRole("button", { name: "Copia" }))
    expect(await screen.findByRole("button", { name: "Non copiato" })).toBeInTheDocument()
  })
})
