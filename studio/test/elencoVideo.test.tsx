import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Scheda, VoceElenco } from "../src/tipi"
import { ElencoVideo } from "../src/video/ElencoVideo"
import { installaEventi, installaRete } from "./rete"

const voce = (slug: string, scheda: Partial<Scheda>, ultimo_cambio = "2026-10-09T10:00:00"): VoceElenco => ({
  slug,
  scheda: { titolo: `Video ${slug}`, stato: "proposta", creato: "2026-10-01", ...scheda },
  durata: null,
  miniatura: null,
  anteprima: null,
  ha_piano: false,
  quadri: [],
  ha_finale: false,
  fase: null,
  ultimo_cambio,
})

// L'elenco è una copia condivisa: finché non ha riletto mostra quello di prima, quindi si aspetta l'ordine atteso.
const inOrdine = (attesi: string[]): Promise<void> => waitFor(() => expect(screen.queryAllByText(/^Video /).map((e) => e.textContent)).toEqual(attesi))

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  sessionStorage.clear()
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe("l'elenco dei video è in ordine di data", () => {
  it("i pubblicati dal più recente per giorno di uscita, non per giorno di nascita né per ultimo cambio", async () => {
    installaRete({
      "GET /api/video": [
        voce("uscito a settembre", { stato: "pubblicato", creato: "2026-09-20", pubblicazioni: [{ canale: "tiktok", data: "2026-09-25" }] }, "2026-10-30T10:00:00"),
        voce("uscito a novembre", { stato: "pubblicato", creato: "2026-08-01", pubblicazioni: [{ canale: "tiktok", data: "2026-11-02" }] }, "2026-10-01T10:00:00"),
        voce("uscito a ottobre", { stato: "pubblicato", creato: "2026-10-05", pubblicazioni: [{ canale: "tiktok", data: "2026-10-10" }] }),
      ],
    })
    render(<ElencoVideo />)
    await inOrdine(["Video uscito a novembre", "Video uscito a ottobre", "Video uscito a settembre"])
  })

  it("un pubblicato uscito su più canali conta dalla prima uscita, quella che la sua carta dice", async () => {
    installaRete({
      "GET /api/video": [
        voce("prima a ottobre poi a dicembre", { stato: "pubblicato", pubblicazioni: [{ canale: "youtube", data: "2026-12-01" }, { canale: "tiktok", data: "2026-10-10" }] }),
        voce("solo a novembre", { stato: "pubblicato", pubblicazioni: [{ canale: "tiktok", data: "2026-11-02" }] }),
      ],
    })
    render(<ElencoVideo />)
    await inOrdine(["Video solo a novembre", "Video prima a ottobre poi a dicembre"])
  })

  it("in lavorazione e proposte dal più recente per giorno di nascita, non per ultimo cambio", async () => {
    installaRete({
      "GET /api/video": [
        voce("proposta di settembre", { creato: "2026-09-03" }, "2026-10-30T10:00:00"),
        voce("proposta di novembre", { creato: "2026-11-04" }, "2026-10-01T10:00:00"),
        voce("lavoro di ottobre", { stato: "in lavorazione", creato: "2026-10-02" }, "2026-11-10T10:00:00"),
        voce("lavoro di novembre", { stato: "in lavorazione", creato: "2026-11-01" }, "2026-11-01T10:00:00"),
      ],
    })
    render(<ElencoVideo />)
    await inOrdine(["Video lavoro di novembre", "Video lavoro di ottobre", "Video proposta di novembre", "Video proposta di settembre"])
  })

  it("nati lo stesso giorno: prima quello cambiato per ultimo", async () => {
    installaRete({
      "GET /api/video": [voce("cambiato prima", { creato: "2026-10-06" }, "2026-10-07T10:00:00"), voce("cambiato dopo", { creato: "2026-10-06" }, "2026-10-09T10:00:00")],
    })
    render(<ElencoVideo />)
    await inOrdine(["Video cambiato dopo", "Video cambiato prima"])
  })

  it("la priorità scelta dal creator mette in fila i video da fare prima della data, e non tocca i pubblicati", async () => {
    installaRete({
      "GET /api/video": [
        voce("recente senza priorità", { creato: "2026-11-04" }),
        voce("vecchia con priorità 2", { creato: "2026-09-01", priorita: 2 }),
        voce("vecchia con priorità 1", { creato: "2026-08-01", priorita: 1 }),
        voce("uscito prima con priorità", { stato: "pubblicato", priorita: 1, pubblicazioni: [{ canale: "tiktok", data: "2026-09-25" }] }),
        voce("uscito dopo", { stato: "pubblicato", pubblicazioni: [{ canale: "tiktok", data: "2026-11-02" }] }),
      ],
    })
    render(<ElencoVideo />)
    await inOrdine(["Video vecchia con priorità 1", "Video vecchia con priorità 2", "Video recente senza priorità", "Video uscito dopo", "Video uscito prima con priorità"])
  })
})
