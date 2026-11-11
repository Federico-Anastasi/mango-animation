// La prima volta che si apre il Girato i dati arrivano dopo, e la pagina compare solo allora: il rilascio dei file deve agganciarsi alla pagina quando c'è.
// In un file a parte perché la copia dei dati del girato resta in memoria fra una prova e l'altra.
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Girato } from "../src/girato/Girato"
import { installaEventi, installaRete } from "./rete"

beforeEach(() => {
  installaEventi()
})

describe("il Girato appena aperto", () => {
  it("la zona di rilascio funziona anche se i dati sono arrivati dopo la prima comparsa", async () => {
    installaRete({ "GET /api/grezzo": [], "GET /api/video": [], "GET /api/arrivi": { acceso: false, ultimi: [] }, "GET /api/accesso-studio": { acceso: false, in_ascolto: false, casa: null, fuori: null, pronto: false, motivo: null } })
    const { container } = render(<Girato file={undefined} />)
    expect(container.querySelector("[data-caricamento]")).not.toBeNull()
    await screen.findByText(/Nel girato non c'è ancora niente/)
    fireEvent.dragEnter(container.firstElementChild as HTMLElement, { dataTransfer: { types: ["Files"], files: [] } })
    expect(screen.getByText("Rilascia qui i video per aggiungerli al girato")).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
