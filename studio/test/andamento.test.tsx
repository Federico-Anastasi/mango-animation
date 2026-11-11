// L'andamento delle visualizzazioni: le date sugli estremi dell'asse sono quelle dei numeri.
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Andamento } from "../src/video/Andamento"

describe("l'andamento di un video", () => {
  it("scrive sull'asse il primo e l'ultimo giorno dei numeri", () => {
    render(
      <Andamento
        numeri={[
          { data: "2026-10-07", canale: "tiktok", visualizzazioni: 312 },
          { data: "2026-10-09", canale: "tiktok", visualizzazioni: 1810 },
        ]}
      />,
    )
    const grafico = screen.getByRole("img", { name: "Andamento delle visualizzazioni nel tempo" })
    expect(grafico).toHaveTextContent("7 ott 2026")
    expect(grafico).toHaveTextContent("9 ott 2026")
  })
})
