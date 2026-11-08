// Chi può usare lo studio dalla rete: una chiave a parte da quella degli arrivi e le sessioni dei browser che sono entrati col suo link.
// Spento di base. Il file `arrivi/studio-remoto.json` ricorda acceso, chiave e sessioni (di ogni sessione solo l'impronta, mai il valore del cookie).
import { createHash, randomBytes } from "node:crypto"
import { join } from "node:path"
import { jsonDaTesto, leggiTesto, scrivi, testoJson } from "../disco"
import { chiaveGiusta } from "./chiave"

export const DURATA_SESSIONE_S = 90 * 86400
const SESSIONI_RICORDATE = 20

interface Sessione {
  impronta: string
  scade: number
}

interface Dati {
  acceso: boolean
  chiave: string
  sessioni: Sessione[]
}

const impronta = (token: string): string => createHash("sha256").update(token).digest("hex")
const nuovaChiave = (): string => randomBytes(24).toString("base64url")

function daTesto(testo: string, adesso: number): Dati | null {
  const letto = jsonDaTesto(testo)?.valore as Partial<Dati> | undefined
  if (!letto || typeof letto.acceso !== "boolean" || typeof letto.chiave !== "string" || letto.chiave.length < 32 || !Array.isArray(letto.sessioni)) return null
  const sessioni = letto.sessioni.filter((s): s is Sessione => typeof s?.impronta === "string" && typeof s.scade === "number" && s.scade > adesso)
  return { acceso: letto.acceso, chiave: letto.chiave, sessioni }
}

export class AccessoStudio {
  private coda: Promise<void> = Promise.resolve()

  private constructor(
    private readonly file: string,
    private dati: Dati,
    private readonly adesso: () => number,
  ) {}

  /** Il file si scrive al primo cambio: finché nessuno accende lo studio, l'archivio non si tocca. */
  static async carica(cartella: string, adesso: () => number = Date.now): Promise<AccessoStudio> {
    const file = join(cartella, "studio-remoto.json")
    const testo = await leggiTesto(file)
    const letti = testo === null ? null : daTesto(testo, adesso())
    if (testo !== null && letti === null) console.error("arrivi: studio-remoto.json non si legge: l'accesso allo studio dalla rete riparte spento, con una chiave nuova.")
    return new AccessoStudio(file, letti ?? { acceso: false, chiave: nuovaChiave(), sessioni: [] }, adesso)
  }

  get acceso(): boolean {
    return this.dati.acceso
  }

  get chiave(): string {
    return this.dati.chiave
  }

  /** Spegnere cambia anche la chiave: un link visto prima non riapre l'accesso quando si riaccende. */
  async imposta(acceso: boolean): Promise<void> {
    if (acceso === this.dati.acceso) return
    this.dati = { ...this.dati, acceso, sessioni: [], ...(acceso ? {} : { chiave: nuovaChiave() }) }
    this.chiudiIFlussi()
    await this.salva()
  }

  async rifaiChiave(): Promise<void> {
    this.dati = { ...this.dati, chiave: nuovaChiave(), sessioni: [] }
    this.chiudiIFlussi()
    await this.salva()
  }

  /** I flussi lunghi aperti dalla rete (gli eventi, che portano anche la chat): si chiudono quando l'accesso si toglie. */
  private readonly flussi = new Set<AbortController>()

  /** Tiene un flusso aperto; la funzione che torna lo lascia quando finisce da sé. */
  tieni(flusso: AbortController): () => void {
    this.flussi.add(flusso)
    return () => this.flussi.delete(flusso)
  }

  private chiudiIFlussi(): void {
    this.flussi.forEach((f) => f.abort())
    this.flussi.clear()
  }

  /** Il valore del cookie di una sessione nuova, se lo studio è acceso e la chiave è giusta. */
  async entra(candidata: string | null): Promise<string | null> {
    if (!this.dati.acceso || !chiaveGiusta(this.dati.chiave, candidata)) return null
    const token = randomBytes(32).toString("base64url")
    const ora = this.adesso()
    const vive = this.dati.sessioni.filter((s) => s.scade > ora)
    this.dati = { ...this.dati, sessioni: [...vive, { impronta: impronta(token), scade: ora + DURATA_SESSIONE_S * 1000 }].slice(-SESSIONI_RICORDATE) }
    await this.salva()
    return token
  }

  valida(token: string | null): boolean {
    if (!this.dati.acceso || !token) return false
    const cercata = impronta(token)
    const ora = this.adesso()
    return this.dati.sessioni.some((s) => s.impronta === cercata && s.scade > ora)
  }

  private salva(): Promise<void> {
    const scrittura = this.coda.catch(() => {}).then(() => scrivi(this.file, testoJson(this.dati)))
    this.coda = scrittura
    return scrittura
  }
}
