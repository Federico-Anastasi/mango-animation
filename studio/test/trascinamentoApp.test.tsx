// I file lasciati sulla chat nell'app: la finestra li riceve da Tauri con il loro percorso (`app/src/trascinamento.rs`) e li dà alla
// pagina come eventi, così un video grande si collega invece di essere copiato.
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { chiudiChat } from "../src/chat/pannello"
import { negozio } from "../src/chat/negozio"
import { PannelloChat } from "../src/chat/PannelloChat"
import { installaEventi, installaRete, type Chiamata } from "./rete"

interface EventoTrascinamento {
  tipo: "entra" | "sopra" | "lascia" | "esce"
  x: number
  y: number
  percorsi?: string[]
}

let chiamate: Chiamata[]
let manda: (e: EventoTrascinamento) => void
let smesso: boolean

/** La finestra dell'app: `su(f)` registra chi ascolta, e la prova manda gli eventi come li manderebbe l'app. */
function installaFinestraDellApp() {
  smesso = false
  let ascoltatore: ((e: EventoTrascinamento) => void) | null = null
  window.__MANGO_ANIMATION__ = {
    trascinamento: {
      su: (f: (e: EventoTrascinamento) => void) => {
        ascoltatore = f
        return () => {
          smesso = true
          ascoltatore = null
        }
      },
    },
  } as unknown as typeof window.__MANGO_ANIMATION__
  manda = (e) => act(() => ascoltatore?.(e))
}

const sopraLaChat = () => {
  const r = screen.getByRole("complementary", { name: "Chat" }).getBoundingClientRect()
  return { x: r.left + 5, y: r.top + 5 }
}

beforeEach(() => {
  installaEventi()
  window.location.hash = ""
  localStorage.clear()
  sessionStorage.clear()
  negozio.apri(null)
  chiudiChat()
  chiamate = installaRete({
    "GET /api/video": [],
    "GET /api/chat": [],
    "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
    "GET /api/chat/modelli": [],
    "POST /api/chat/allegati/locale": (c: Chiamata) => ({ percorso: `.chat/allegati/${String((c.corpo as { percorso: string }).percorso).split("\\").pop()}` }),
  }).chiamate
  installaFinestraDellApp()
  // jsdom non ha un layout: la chat sta nell'angolo in alto a sinistra e tutto il resto è fuori.
  document.elementFromPoint = (x: number, y: number) => (x < 100 && y < 100 ? screen.getByRole("complementary", { name: "Chat" }) : document.body)
})
afterEach(() => {
  delete window.__MANGO_ANIMATION__
  vi.unstubAllGlobals()
})

describe("file lasciati sulla chat nell'app", () => {
  it("un file lasciato sulla chat si allega per percorso: il server lo collega se è grande, senza che la pagina lo legga", async () => {
    render(<PannelloChat />)
    const { x, y } = sopraLaChat()
    manda({ tipo: "lascia", x, y, percorsi: ["D:\\video\\ripresa lunga.mov"] })
    expect(await screen.findByText("ripresa lunga.mov")).toBeInTheDocument()
    expect(chiamate.filter((c) => c.percorso === "/api/chat/allegati/locale").map((c) => c.corpo)).toEqual([{ percorso: "D:\\video\\ripresa lunga.mov" }])
    expect(chiamate.some((c) => c.percorso === "/api/chat/allegati")).toBe(false)
    await waitFor(() => expect(screen.getByRole("button", { name: "Togli l'allegato ripresa lunga.mov" })).toBeInTheDocument())
  })

  it("più file lasciati insieme entrano tutti", async () => {
    render(<PannelloChat />)
    const { x, y } = sopraLaChat()
    manda({ tipo: "lascia", x, y, percorsi: ["C:\\a\\uno.mov", "C:\\a\\due.png"] })
    expect(await screen.findByText("uno.mov")).toBeInTheDocument()
    expect(await screen.findByText("due.png")).toBeInTheDocument()
  })

  it("un file lasciato fuori dalla chat non entra", async () => {
    render(<PannelloChat />)
    manda({ tipo: "lascia", x: 900, y: 500, percorsi: ["C:\\a\\uno.mov"] })
    await act(() => new Promise<void>((ok) => setTimeout(ok, 20)))
    expect(screen.queryByText("uno.mov")).toBeNull()
    expect(chiamate.some((c) => c.percorso === "/api/chat/allegati/locale")).toBe(false)
  })

  it("mentre passa sopra la chat la chat lo dice, e smette quando esce o quando passa fuori", async () => {
    render(<PannelloChat />)
    const { x, y } = sopraLaChat()
    manda({ tipo: "entra", x, y, percorsi: ["C:\\a\\uno.mov"] })
    expect(await screen.findByText("Rilascia i file per allegarli")).toBeInTheDocument()
    manda({ tipo: "sopra", x: 900, y: 500 })
    expect(screen.queryByText("Rilascia i file per allegarli")).toBeNull()
    manda({ tipo: "sopra", x, y })
    expect(await screen.findByText("Rilascia i file per allegarli")).toBeInTheDocument()
    manda({ tipo: "esce", x: 0, y: 0 })
    expect(screen.queryByText("Rilascia i file per allegarli")).toBeNull()
  })

  it("una cartella lasciata sulla chat lo dice sull'allegato, come ogni file che il server non può prendere", async () => {
    chiamate = installaRete({
      "GET /api/video": [],
      "GET /api/chat": [],
      "GET /api/lavori": { in_corso: null, in_coda: [], finiti: [] },
      "GET /api/chat/modelli": [],
      "POST /api/chat/allegati/locale": () => new Response(JSON.stringify({ errore: "Il file «C:\\a\\Cartella» non c'è, o è una cartella." }), { status: 400 }),
    }).chiamate
    render(<PannelloChat />)
    const { x, y } = sopraLaChat()
    manda({ tipo: "lascia", x, y, percorsi: ["C:\\a\\Cartella"] })
    expect(await screen.findByText(/Non caricato: Il file «C:\\a\\Cartella» non c'è, o è una cartella\./)).toBeInTheDocument()
  })

  it("chiusa la chat, la pagina smette di ascoltare", () => {
    const { unmount } = render(<PannelloChat />)
    expect(smesso).toBe(false)
    unmount()
    expect(smesso).toBe(true)
  })

  it("nel browser, senza l'app, il trascinamento di prima non cambia", async () => {
    delete window.__MANGO_ANIMATION__
    render(<PannelloChat />)
    await act(() => new Promise<void>((ok) => setTimeout(ok, 20)))
    expect(screen.getByRole("complementary", { name: "Chat" })).toBeInTheDocument()
  })
})
