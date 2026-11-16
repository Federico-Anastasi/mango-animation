// Un cliente di Codex in memoria per le prove del motore: annota le richieste, risponde come dice la prova, e lascia mandare le
// notifiche e le richieste che Codex fa. Le notifiche dei giri vengono dalla registrazione di un Codex vero (`dati/codex-giri.jsonl`).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ErroreDiCodex, type ClienteCodex } from "../src/chat/codex/protocollo"
import type { Oggetto } from "../src/chat/traduzione"

type Risposta = (parametri: Oggetto) => unknown
type Gestore = Parameters<ClienteCodex["rispondi"]>[0]

interface Riga {
  verso: "codex" | "noi"
  id?: number
  method?: string
  params?: Oggetto
  result?: Oggetto
}

const RIGHE = readFileSync(join(import.meta.dir, "dati", "codex-giri.jsonl"), "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((r) => JSON.parse(r) as Riga)

/** Il thread della registrazione: le notifiche dei suoi giri portano questo identificativo. */
export const THREAD_REGISTRATO = "00000000-0000-7000-8000-000000000003"

export interface Notifica {
  metodo: string
  parametri: Oggetto
}

/** Le notifiche di un giro registrato (1: il comando e il file, 2: il comando fermato, 3: la skill), dal suo inizio alla sua fine. */
export function giroRegistrato(numero: 1 | 2 | 3): Notifica[] {
  const notifiche = RIGHE.flatMap((r): Notifica[] => (r.verso === "noi" && r.method !== undefined && r.params !== undefined ? [{ metodo: r.method, parametri: r.params }] : []))
  const inizi = notifiche.flatMap((n, i) => (n.metodo === "turn/started" ? [i] : []))
  const inizio = inizi[numero - 1]
  if (inizio === undefined) throw new Error(`Nella registrazione non c'è il giro ${numero}.`)
  const fine = notifiche.findIndex((n, i) => i > inizio && n.metodo === "turn/completed")
  return notifiche.slice(inizio, fine + 1)
}

/** L'identificativo del giro registrato. */
export const giroDi = (notifiche: Notifica[]): string => String(((notifiche[0]?.parametri["turn"] as Oggetto | undefined) ?? {})["id"])

/** La risposta registrata di una richiesta di Codex. */
export function rispostaRegistrata(metodo: string): Oggetto {
  const richiesta = RIGHE.find((r) => r.verso === "codex" && r.method === metodo)
  const risposta = RIGHE.find((r) => r.verso === "noi" && r.id === richiesta?.id)
  if (risposta?.result === undefined) throw new Error(`Nella registrazione non c'è la risposta a ${metodo}.`)
  return risposta.result
}

export const MODELLI: Oggetto[] = [
  {
    id: "gpt-5.6-luna",
    model: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    description: "Small and fast.",
    hidden: false,
    isDefault: true,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"].map((reasoningEffort) => ({ reasoningEffort, description: "" })),
  },
  {
    id: "gpt-5.6-terra",
    model: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    description: "Large.",
    hidden: false,
    isDefault: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "high", "ultra", "turbo"].map((reasoningEffort) => ({ reasoningEffort, description: "" })),
  },
  { id: "gpt-5.0-vecchio", model: "gpt-5.0-vecchio", displayName: "Vecchio", description: "Hidden.", hidden: true, isDefault: false, defaultReasoningEffort: "low", supportedReasoningEfforts: [] },
]

const identificativo = (n: number): string => `01a1d700-0000-7000-8000-${String(n).padStart(12, "0")}`

export class ClienteFintoDiCodex implements ClienteCodex {
  readonly richieste: { metodo: string; parametri: Oggetto }[] = []
  /** Come Codex risponde a ogni metodo; la prova ne cambia quanti vuole. */
  readonly risposte = new Map<string, Risposta>()
  /** Gli identificativi dei giri che `turn/start` dà, nell'ordine; finiti questi, ne inventa. */
  turni: string[] = []
  /** Gli identificativi dei thread che `thread/start` dà, nell'ordine; finiti questi, ne inventa. */
  thread: string[] = [THREAD_REGISTRATO]
  /** Dove il finto Codex dice di tenere le sue cose; la prova lo cambia. */
  casa: string | null = null
  private ascoltatori = new Set<(metodo: string, parametri: Oggetto) => void>()
  private gestore: Gestore | null = null
  private cadute = new Set<(errore: Error) => void>()
  private inventati = 0

  constructor() {
    const registro = this.risposte
    registro.set("account/read", () => ({ account: { type: "chatgpt", email: null, planType: "plus", workspaceName: null }, requiresOpenaiAuth: true, workspaceRouting: null }))
    registro.set("skills/extraRoots/set", () => ({}))
    registro.set("skills/list", () => ({ data: [{ cwd: "", errors: [], skills: [] }] }))
    registro.set("model/list", () => ({ data: MODELLI, nextCursor: null }))
    registro.set("thread/start", (p) => ({ thread: { id: this.thread.shift() ?? identificativo(++this.inventati), name: null, preview: "" }, model: p["model"] ?? "gpt-5.6-luna", reasoningEffort: "medium" }))
    registro.set("thread/resume", (p) => ({ thread: { id: p["threadId"], name: null, preview: "" }, model: p["model"] ?? "gpt-5.6-luna", reasoningEffort: "medium" }))
    registro.set("turn/start", () => ({ turn: { id: this.turni.shift() ?? `turno-${++this.inventati}` } }))
    for (const metodo of ["turn/steer", "turn/interrupt", "thread/compact/start", "thread/backgroundTerminals/terminate", "thread/name/set"]) registro.set(metodo, () => ({}))
    registro.set("thread/unsubscribe", () => ({ status: "unsubscribed" }))
    registro.set("review/start", (p) => ({ turn: { id: this.turni.shift() ?? `turno-${++this.inventati}` }, reviewThreadId: p["threadId"] }))
    registro.set("thread/backgroundTerminals/list", () => ({ data: [], nextCursor: null }))
    registro.set("thread/list", () => ({ data: [], nextCursor: null }))
  }

  chiedi = async <T = Oggetto>(metodo: string, parametri?: unknown): Promise<T> => {
    const p = (parametri ?? {}) as Oggetto
    this.richieste.push({ metodo, parametri: p })
    const risposta = this.risposte.get(metodo)
    if (!risposta) throw new ErroreDiCodex(`Il finto Codex non conosce ${metodo}`, -32601)
    return (await risposta(p)) as T
  }

  ascolta = (alla: (metodo: string, parametri: Oggetto) => void): (() => void) => {
    this.ascoltatori.add(alla)
    return () => void this.ascoltatori.delete(alla)
  }

  rispondi = (gestore: Gestore): void => {
    this.gestore = gestore
  }

  allaCaduta = (alla: (errore: Error) => void): (() => void) => {
    this.cadute.add(alla)
    return () => void this.cadute.delete(alla)
  }

  codexHome = async (): Promise<string | null> => this.casa

  /** Il processo che il finto Codex dice di essere. */
  processo: number | null = 4000
  pid = (): number | null => this.processo

  chiudi = async (): Promise<void> => undefined

  /** Le richieste fatte a un metodo. */
  di(metodo: string): Oggetto[] {
    return this.richieste.filter((r) => r.metodo === metodo).map((r) => r.parametri)
  }

  /** Codex manda una notifica. */
  notifica(metodo: string, parametri: Oggetto): void {
    this.ascoltatori.forEach((a) => a(metodo, parametri))
  }

  notificheDi(notifiche: Notifica[]): void {
    notifiche.forEach((n) => this.notifica(n.metodo, n.parametri))
  }

  /** Codex fa una richiesta a noi: ciò che torna è la risposta della chat; `ritira` è Codex che la chiude da sé. */
  richiesta(metodo: string, parametri: Oggetto): { risposta: Promise<unknown>; ritira: () => void } {
    if (!this.gestore) throw new Error("Nessuno risponde alle richieste di Codex.")
    const ritirata = new AbortController()
    return { risposta: this.gestore(metodo, parametri, ritirata.signal), ritira: () => ritirata.abort() }
  }

  /** Il programma cade. */
  cadi(errore = new Error("il programma si è fermato")): void {
    this.cadute.forEach((c) => c(errore))
  }
}
