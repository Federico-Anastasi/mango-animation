// Con la chat aperta la barra in alto va da bordo a bordo: si allinea alla pagina con la misura del posto in cui la pagina si centra.
import { render } from "@testing-library/react"
import { useRef } from "react"
import { describe, expect, it } from "vitest"
import { useLarghezzaPagina } from "../src/cornice/larghezzaPagina"

function Prova() {
  const radice = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLElement>(null)
  useLarghezzaPagina(radice, corpo)
  return (
    <div ref={radice} data-testid="radice">
      <main ref={corpo} data-testid="corpo" style={{ paddingLeft: "24px", paddingRight: "24px" }} />
    </div>
  )
}

describe("la larghezza del posto della pagina", () => {
  it("è la larghezza dell'area senza la barra di scorrimento e senza i margini", () => {
    const larghezza = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1600 })
    try {
      const { getByTestId } = render(<Prova />)
      expect(getByTestId("radice").style.getPropertyValue("--larghezza-pagina")).toBe("1552px")
    } finally {
      if (larghezza) Object.defineProperty(HTMLElement.prototype, "clientWidth", larghezza)
      else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
    }
  })
})
