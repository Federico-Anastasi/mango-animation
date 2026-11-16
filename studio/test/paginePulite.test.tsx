// L'aspetto delle pagine: etichette di stato accanto ai nomi, interruttori e segmenti al posto di caselle e pallini, al più un bottone principale.
import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Gruppo } from "../src/comuni/Gruppo"
import { Girato } from "../src/girato/Girato"
import { scegliLingua } from "../src/lingua"
import type { FileGrezzo, VoceElenco } from "../src/tipi"
import { ElencoVideo } from "../src/video/ElencoVideo"
import { ControlloVideo } from "../src/video/ControlloVideo"
import { SchedaDelVideo } from "../src/video/SchedaDelVideo"
import { dettaglioDiProva } from "./fixture"
import { installaEventi, installaRete } from "./rete"

const voce = (slug: string, stato: VoceElenco["scheda"]["stato"], extra: Partial<VoceElenco> = {}): VoceElenco => ({
  slug,
  scheda: { titolo: `Video ${slug}`, stato, creato: "2026-10-06" },
  durata: null,
  miniatura: null,
  anteprima: null,
  ha_piano: false,
  quadri: [],
  ha_finale: false,
  fase: null,
  ultimo_cambio: "2026-10-09T10:00:00",
  ...extra,
})

const file = (nome: string, usato: string[] = []): FileGrezzo => ({
  file: `2026-10-06/${nome}`,
  nome,
  byte: 3_000_000,
  scheda: { tipo: "ripresa", origine: "telefono", durata: 12 },
  scheda_problemi: [],
  preparato: { parole: null, sagoma: null, leggero: null, onda: null, miniatura: null, trascrizione: null },
  usato_in: usato,
})

const rotte = {
  "GET /api/arrivi": { in_ascolto: false, indirizzo: null, qr: null, errore: null, ultimi: [], pronto: false, motivo: null },
  "GET /api/accesso-studio": { acceso: false, in_ascolto: true, casa: null, fuori: null, pronto: true, motivo: null },
}

const principali = (radice: HTMLElement) => radice.querySelectorAll('[data-variante="principale"]').length
const caselleEPallini = (radice: HTMLElement) => [...radice.querySelectorAll('input[type="checkbox"], input[type="radio"]')].filter((i) => i.closest('[role="radiogroup"]') === null).length

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  scegliLingua("it")
})
afterEach(() => vi.unstubAllGlobals())

describe("le pagine", () => {
  it("l'elenco dei video dice il passo accanto al titolo con un'etichetta: ambra se lavora, neutra altrimenti", async () => {
    installaRete({
      ...rotte,
      "GET /api/video": [voce("uno", "in lavorazione", { fase: { passo: 6, azione: "guarda" } }), voce("due", "proposta", { fase: { passo: 2, azione: "copione" } })],
    })
    const { container } = render(<ElencoVideo />)
    const montaggio = await screen.findByText("Passo 6 di 8 · Montaggio")
    const copione = screen.getByText("Passo 2 di 8 · Copione")
    expect(montaggio).toHaveAttribute("data-stato", "in-corso")
    expect(copione).not.toHaveAttribute("data-stato")
    expect(principali(container)).toBe(0)
  })

  it("il girato filtra con i segmenti, dice «mai usato» con un'etichetta e ha un solo bottone principale", async () => {
    installaRete({ ...rotte, "GET /api/grezzo": [{ giorno: "2026-10-06", file: [file("a.mp4"), file("b.mp4", ["uno"])] }], "GET /api/video": [voce("uno", "in lavorazione")] })
    const { container } = render(<Girato file={undefined} />)
    expect(await screen.findByText("mai usato")).not.toHaveAttribute("data-stato")
    const filtro = screen.getByRole("radiogroup", { name: "Quali file mostrare" })
    expect(within(filtro).getAllByRole("radio")).toHaveLength(2)
    expect(caselleEPallini(container)).toBe(0)
    expect(principali(container)).toBe(1)
  })

  it("la scheda e il controllo non hanno caselle: i canali e le cose da verificare sono interruttori", async () => {
    installaRete(rotte)
    const video = dettaglioDiProva()
    video.scheda = { ...video.scheda, canali: ["tiktok"], da_verificare: [{ cosa: "Il numero detto a voce", stato: "aperto" }] }
    const scheda = render(<SchedaDelVideo video={video} salvaScheda={vi.fn().mockResolvedValue(undefined)} />)
    expect(within(screen.getByRole("group", { name: "Dove deve uscire" })).getAllByRole("switch")).toHaveLength(4)
    expect(caselleEPallini(scheda.container)).toBe(0)
    scheda.unmount()
    const controllo = render(<ControlloVideo video={video} salvaScheda={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByRole("switch", { name: "Il numero detto a voce" })).not.toBeChecked()
    expect(caselleEPallini(controllo.container)).toBe(0)
  })

  it("un gruppo ha il nome sopra e la card sotto", () => {
    render(
      <Gruppo id="g" titolo="Il gruppo">
        <p>Dentro</p>
      </Gruppo>,
    )
    const gruppo = screen.getByRole("region", { name: "Il gruppo" })
    expect(within(gruppo).getByRole("heading", { level: 2, name: "Il gruppo" })).toBeInTheDocument()
    expect(within(gruppo).getByText("Dentro").parentElement).not.toBe(gruppo)
  })
})
