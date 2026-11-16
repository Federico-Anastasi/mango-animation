// Il cliente di `codex app-server`: un programma solo, acceso alla prima richiesta, che parla JSON-RPC su stdio (una riga per messaggio).
import { eOggetto } from "../../disco"
import type { Oggetto } from "../traduzione"
import { CodexTroppoVecchio, ErroreDiCodex, type ClienteCodex } from "./protocollo"

export interface OpzioniCodex {
  programma: string
  argomenti?: string[]
  /** Si aggiunge all'ambiente del server; un valore `undefined` toglie la variabile. */
  ambiente: Record<string, string | undefined>
  versioneMinima: string
}

type Gestore = Parameters<ClienteCodex["rispondi"]>[0]
type Processo = Bun.Subprocess<"pipe", "pipe", "pipe">

const CLIENTE = { name: "mango-animation", title: null, version: "1.0.0" }
const RIGHE_DI_ERRORE = 10
/** Quanto aspettare, dopo che Codex è uscito, che i suoi canali si svuotino: un figlio può tenerli aperti. */
const SVUOTAMENTO_MS = 250
const METODO_ASSENTE = -32601
const ERRORE_INTERNO = -32603

interface Intorno {
  notifica: (metodo: string, parametri: Oggetto) => void
  gestore: () => Gestore | null
  finito: (collegamento: Collegamento, errore: Error | null) => void
}

type Numeri = [number, number, number]

const versioneDi = (userAgent: unknown): string | null => (typeof userAgent === "string" ? (/^[^/\s]+\/(\S+)/.exec(userAgent)?.[1] ?? null) : null)

function numeriDi(versione: string): Numeri | null {
  const trovati = /^(\d+)\.(\d+)\.(\d+)/.exec(versione)
  return trovati ? [Number(trovati[1]), Number(trovati[2]), Number(trovati[3])] : null
}

/** Solo i tre numeri contano: una versione di prova (`0.167.0-alpha.4`) ha il protocollo della sua. */
function piuVecchia(versione: string, minima: string): boolean {
  const [a, b] = [numeriDi(versione), numeriDi(minima)]
  if (!a || !b) return false
  const differenza = a.findIndex((n, i) => n !== b[i])
  return differenza >= 0 && (a[differenza] ?? 0) < (b[differenza] ?? 0)
}

async function leggiRighe(flusso: ReadableStream<Uint8Array>, perRiga: (riga: string) => void): Promise<void> {
  const decodifica = new TextDecoder()
  let resto = ""
  for await (const pezzo of flusso) {
    resto += decodifica.decode(pezzo, { stream: true })
    const righe = resto.split("\n")
    resto = righe.pop() ?? ""
    for (const riga of righe) perRiga(riga.replace(/\r$/, ""))
  }
  resto += decodifica.decode()
  if (resto) perRiga(resto)
}

const messaggioDi = (causa: unknown): string => (causa instanceof Error ? causa.message : String(causa))

class Collegamento {
  readonly pronto: Promise<void>
  private readonly attese = new Map<number, { risolvi: (valore: unknown) => void; rifiuta: (errore: Error) => void }>()
  private readonly aperte = new Map<string | number, AbortController>()
  private readonly ultimeRighe: string[] = []
  private readonly finito: Promise<void>
  private prossimo = 1
  private spento = false
  private errore: Error | null = null
  /** Dove Codex tiene le sue cose, come l'ha detto a `initialize`. */
  casa: string | null = null

  constructor(
    private readonly processo: Processo,
    private readonly versioneMinima: string,
    private readonly intorno: Intorno,
  ) {
    const canali = Promise.all([
      leggiRighe(processo.stdout, (riga) => this.ricevi(riga)),
      leggiRighe(processo.stderr, (riga) => {
        this.ultimeRighe.push(riga)
        if (this.ultimeRighe.length > RIGHE_DI_ERRORE) this.ultimeRighe.shift()
      }),
    ])
    this.finito = processo.exited.then(async (codice) => {
      await Promise.race([canali, Bun.sleep(SVUOTAMENTO_MS)])
      this.cadi(codice)
    })
    this.pronto = this.inizializza().catch((errore: unknown) => {
      void this.spegni()
      throw errore
    })
  }

  richiesta<T>(metodo: string, parametri?: unknown): Promise<T> {
    if (this.errore) return Promise.reject(this.errore)
    const id = this.prossimo++
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    this.attese.set(id, { risolvi: (valore) => resolve(valore as T), rifiuta: reject })
    try {
      this.scrivi(parametri === undefined ? { id, method: metodo } : { id, method: metodo, params: parametri })
    } catch (causa) {
      this.attese.delete(id)
      reject(new ErroreDiCodex(`Non riesco a scrivere a Codex: ${messaggioDi(causa)}`, null))
    }
    return promise
  }

  get pid(): number {
    return this.processo.pid
  }

  async spegni(): Promise<void> {
    if (!this.errore) {
      this.spento = true
      if (process.platform === "win32") await Bun.spawn(["taskkill", "/PID", String(this.processo.pid), "/T", "/F"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).exited
      else this.processo.kill()
    }
    await this.finito
  }

  private async inizializza(): Promise<void> {
    const risposta = await this.richiesta<unknown>("initialize", { clientInfo: CLIENTE, capabilities: { experimentalApi: true } })
    const versione = versioneDi(eOggetto(risposta) ? risposta["userAgent"] : undefined)
    this.casa = eOggetto(risposta) && typeof risposta["codexHome"] === "string" ? risposta["codexHome"] : null
    if (versione !== null && piuVecchia(versione, this.versioneMinima)) throw new CodexTroppoVecchio(versione, this.versioneMinima)
    this.scrivi({ method: "initialized" })
  }

  private scrivi(messaggio: Oggetto): void {
    const ingresso = this.processo.stdin
    ingresso.write(`${JSON.stringify(messaggio)}\n`)
    // Un errore di scrittura che arriva più tardi vuol dire che il programma è caduto: ci pensa `cadi`.
    void Promise.resolve(ingresso.flush()).catch(() => undefined)
  }

  private cadi(codice: number | null): void {
    if (this.errore) return
    const righe = this.ultimeRighe.length > 0 ? `:\n${this.ultimeRighe.join("\n")}` : ""
    this.errore = new ErroreDiCodex(this.spento ? "Codex è stato spento" : `Codex si è fermato (codice ${codice})${righe}`, null)
    for (const attesa of this.attese.values()) attesa.rifiuta(this.errore)
    this.attese.clear()
    for (const ritirata of this.aperte.values()) ritirata.abort()
    this.aperte.clear()
    this.intorno.finito(this, this.spento ? null : this.errore)
  }

  private ricevi(riga: string): void {
    if (this.errore || !riga.trim()) return
    const messaggio = leggiMessaggio(riga)
    if (!messaggio) {
      console.error(`Codex ha scritto una riga che non è JSON: ${riga.slice(0, 200)}`)
      return
    }
    const metodo = messaggio["method"]
    const id = messaggio["id"]
    if (typeof metodo === "string") {
      const parametri = eOggetto(messaggio["params"]) ? messaggio["params"] : {}
      if (typeof id === "string" || typeof id === "number") void this.richiestaDiCodex(id, metodo, parametri)
      else this.notificaDiCodex(metodo, parametri)
    } else if (typeof id === "number") this.rispostaDiCodex(id, messaggio)
  }

  private notificaDiCodex(metodo: string, parametri: Oggetto): void {
    if (metodo === "serverRequest/resolved") {
      const richiesta = parametri["requestId"]
      if (typeof richiesta === "string" || typeof richiesta === "number") this.aperte.get(richiesta)?.abort()
    }
    this.intorno.notifica(metodo, parametri)
  }

  private rispostaDiCodex(id: number, messaggio: Oggetto): void {
    const attesa = this.attese.get(id)
    if (!attesa) return
    this.attese.delete(id)
    const errore = messaggio["error"]
    if (!eOggetto(errore)) return attesa.risolvi(messaggio["result"])
    const [messaggioDiCodex, codice] = [errore["message"], errore["code"]]
    attesa.rifiuta(new ErroreDiCodex(typeof messaggioDiCodex === "string" ? messaggioDiCodex : "Codex ha risposto con un errore senza messaggio", typeof codice === "number" ? codice : null))
  }

  private async richiestaDiCodex(id: string | number, metodo: string, parametri: Oggetto): Promise<void> {
    const gestore = this.intorno.gestore()
    if (!gestore) return this.rispondiACodex({ id, error: { code: METODO_ASSENTE, message: `Nessuno risponde a ${metodo}` } })
    const ritirata = new AbortController()
    this.aperte.set(id, ritirata)
    try {
      const risultato = await gestore(metodo, parametri, ritirata.signal)
      if (!ritirata.signal.aborted) this.rispondiACodex({ id, result: risultato ?? null })
    } catch (causa) {
      if (!ritirata.signal.aborted) this.rispondiACodex({ id, error: { code: ERRORE_INTERNO, message: messaggioDi(causa) } })
    } finally {
      this.aperte.delete(id)
    }
  }

  private rispondiACodex(messaggio: Oggetto): void {
    try {
      this.scrivi(messaggio)
    } catch {
      // Il programma è già caduto: la richiesta non esiste più e `cadi` ha avvisato chi doveva.
    }
  }
}

function leggiMessaggio(riga: string): Oggetto | null {
  try {
    const messaggio: unknown = JSON.parse(riga)
    return eOggetto(messaggio) ? messaggio : null
  } catch {
    return null
  }
}

function ambienteDi(sovrascritte: Record<string, string | undefined>): Record<string, string> {
  const ambiente: Record<string, string> = {}
  for (const [nome, valore] of Object.entries({ ...process.env, ...sovrascritte })) if (valore !== undefined) ambiente[nome] = valore
  return ambiente
}

export function avviaCodex(opzioni: OpzioniCodex): ClienteCodex {
  let corrente: Collegamento | null = null
  let gestore: Gestore | null = null
  const ascoltatori = new Set<(metodo: string, parametri: Oggetto) => void>()
  const alleCadute = new Set<(errore: Error) => void>()

  const intorno: Intorno = {
    notifica: (metodo, parametri) => {
      for (const alla of ascoltatori) {
        try {
          alla(metodo, parametri)
        } catch (causa) {
          console.error(`Chi ascolta Codex ha fallito su ${metodo}: ${messaggioDi(causa)}`)
        }
      }
    },
    gestore: () => gestore,
    finito: (collegamento, errore) => {
      if (corrente === collegamento) corrente = null
      if (!errore) return
      for (const alla of alleCadute) {
        try {
          alla(errore)
        } catch (causa) {
          console.error(`Chi ascolta la caduta di Codex ha fallito: ${messaggioDi(causa)}`)
        }
      }
    },
  }

  const accendi = (): Collegamento => {
    let processo: Processo
    try {
      processo = Bun.spawn([opzioni.programma, ...(opzioni.argomenti ?? ["app-server"])], { env: ambienteDi(opzioni.ambiente), stdin: "pipe", stdout: "pipe", stderr: "pipe", windowsHide: true })
    } catch (causa) {
      throw new ErroreDiCodex(`Non riesco ad accendere Codex: ${messaggioDi(causa)}`, null)
    }
    corrente = new Collegamento(processo, opzioni.versioneMinima, intorno)
    return corrente
  }

  return {
    chiedi: async <T = Oggetto>(metodo: string, parametri?: unknown): Promise<T> => {
      const collegamento = corrente ?? accendi()
      await collegamento.pronto
      return collegamento.richiesta<T>(metodo, parametri)
    },
    ascolta: (alla) => {
      ascoltatori.add(alla)
      return () => void ascoltatori.delete(alla)
    },
    rispondi: (nuovo) => {
      gestore = nuovo
    },
    allaCaduta: (alla) => {
      alleCadute.add(alla)
      return () => void alleCadute.delete(alla)
    },
    codexHome: async () => {
      const collegamento = corrente ?? accendi()
      await collegamento.pronto
      return collegamento.casa
    },
    pid: () => corrente?.pid ?? null,
    chiudi: async () => {
      const collegamento = corrente
      corrente = null
      await collegamento?.spegni()
    },
  }
}
