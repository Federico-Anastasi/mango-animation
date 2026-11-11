import type { EventoChat } from "./chat/tipi"

export type CosaDelVideo = "scheda" | "piano" | "risolto" | "controllo" | "uscite" | "materiali" | "fotogrammi" | "nuovo" | "tolto"

export type Messaggio =
  | { tipo: "video"; slug: string; cosa: CosaDelVideo }
  | { tipo: "grezzo" }
  | { tipo: "stile" }
  | { tipo: "animazioni" }
  | { tipo: "lavori" }
  | { tipo: "arrivi" }
  | { tipo: "accesso-studio" }
  | { tipo: "registrazione" }
  | { tipo: "canale"; canale: string }
  | { tipo: "consumi" }
  | { tipo: "modelli" }
  | { tipo: "comandi" }
  | { tipo: "profilo" }
  /** Porta la finestra dell'app sulla pagina di un video (`video`, con `scheda`) o sul file di un percorso dell'archivio (`video/…` o `grezzo/…`). */
  | { tipo: "vai"; video?: string; scheda?: string; percorso?: string }
  | EventoChat

type Controllore = ReadableStreamDefaultController<Uint8Array>

const codifica = new TextEncoder()

/** I messaggi di `GET /api/eventi`. Il battito è un commento SSE: tiene aperta la connessione e non è un messaggio. */
export class Eventi {
  private readonly flussi = new Set<Controllore>()
  private battito: ReturnType<typeof setInterval> | null = null

  constructor(private readonly battitoMs: number) {}

  emetti(messaggio: Messaggio): void {
    this.scrivi(`data: ${JSON.stringify(messaggio)}\n\n`)
  }

  /** Quante pagine dello studio sono collegate. */
  collegati(): number {
    return this.flussi.size
  }

  apri(): Response {
    const stato: { controllore: Controllore | null } = { controllore: null }
    const flusso = new ReadableStream<Uint8Array>({
      start: (controllore) => {
        stato.controllore = controllore
        this.flussi.add(controllore)
        controllore.enqueue(codifica.encode(": aperto\n\n"))
        // L'unico timer del server oltre al rimbalzo dell'osservatore: senza traffico, un proxy o il
        // browser chiuderebbero un flusso muto.
        this.battito ??= setInterval(() => this.scrivi(": battito\n\n"), this.battitoMs)
      },
      cancel: () => {
        if (stato.controllore) this.togli(stato.controllore)
      },
    })
    return new Response(flusso, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } })
  }

  chiudi(): void {
    this.flussi.forEach((c) => {
      try {
        c.close()
      } catch {
        // già chiuso dal browser
      }
    })
    this.flussi.clear()
    this.fermaBattito()
  }

  private scrivi(testo: string): void {
    const dati = codifica.encode(testo)
    this.flussi.forEach((c) => {
      try {
        c.enqueue(dati)
      } catch {
        this.togli(c)
      }
    })
  }

  private togli(controllore: Controllore): void {
    this.flussi.delete(controllore)
    if (this.flussi.size === 0) this.fermaBattito()
  }

  private fermaBattito(): void {
    if (this.battito) clearInterval(this.battito)
    this.battito = null
  }
}
