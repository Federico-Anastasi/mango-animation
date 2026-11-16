// I finti della chat usati da più prove: un Claude Code finto (la stessa `query` e gli stessi messaggi dell'SDK, emessi dalla prova),
// le sessioni dei suoi file e un Mango Code finto (un server con le rotte e gli eventi del contratto di Mango Code, che registra ciò che riceve).
import type { ModelInfo, Options, PermissionResult, SDKMessage, SDKUserMessage, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import type { FunzioneQuery, MisuraDelContesto, MessaggioSessione, QueryChat, Sessioni } from "../src/chat/claude/query"
import type { VoceSessione } from "../src/chat/tipi"

const messaggio = (m: object): SDKMessage => m as unknown as SDKMessage

const LIVELLI = ["low", "medium", "high", "xhigh", "max"] as const
const MODELLI_FINTI: ModelInfo[] = [
  { value: "default", resolvedModel: "claude-sonnet-5-5", displayName: "Default (recommended)", description: "Sonnet 5.5 · efficient", supportsEffort: true, supportedEffortLevels: [...LIVELLI] },
  { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "Best for everyday, complex tasks", supportsEffort: true, supportedEffortLevels: [...LIVELLI] },
  { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet 5.5", description: "Efficient for routine tasks", supportsEffort: true, supportedEffortLevels: [...LIVELLI] },
  { value: "claude-opus-4-6", resolvedModel: "claude-opus-4-6", displayName: "Opus 4.6", description: "Older", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "max"] },
  { value: "claude-haiku-4-5-20251001", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", description: "Fastest" },
]

const COMANDI_FINTI: SlashCommand[] = [
  { name: "context", description: "Show current context usage", argumentHint: "", builtin: true },
  { name: "usage", description: "Show plan usage limits", argumentHint: "", aliases: ["cost", "stats"], builtin: true },
  { name: "model", description: "Set the AI model", argumentHint: "[model]", builtin: true },
  { name: "monta", description: "Edits a video.", argumentHint: "<slug>" },
]

export class FintaQuery implements QueryChat {
  readonly ricevuti: SDKUserMessage[] = []
  interrotta = 0
  chiusa = false
  /** Se è scritto, `supportedModels` e `supportedCommands` falliscono con questa frase. */
  rifiutaLaLettura: string | null = null
  /** Finché c'è, il flusso di messaggi non finisce dopo `close`: la chiusura del processo è lenta. */
  chiusuraLenta: Promise<void> | null = null
  /** Le chiamate di cambio che l'SDK riceve, nell'ordine. */
  readonly cambi: unknown[][] = []
  /** Se è scritto, il prossimo cambio fallisce con questa frase. */
  rifiutaIlCambio: string | null = null
  private readonly pronti: SDKMessage[] = []
  private attende: ((risultato: IteratorResult<SDKMessage>) => void) | null = null
  private fallisce: ((errore: Error) => void) | null = null
  private errorePronto: Error | null = null

  constructor(
    readonly opzioni: Options,
    prompt: AsyncIterable<SDKUserMessage>,
  ) {
    void (async () => {
      for await (const m of prompt) this.ricevuti.push(m)
    })()
  }

  /** Tutti i messaggi emessi sono stati presi da chi legge, che ora aspetta il successivo (o il flusso è finito). */
  get consumati(): boolean {
    return this.pronti.length === 0 && (this.attende !== null || this.chiusa || this.errorePronto !== null)
  }

  emetti(...messaggi: object[]): void {
    messaggi.forEach((m) => {
      if (this.attende) {
        const consegna = this.attende
        this.attende = null
        this.fallisce = null
        consegna({ value: messaggio(m), done: false })
      } else {
        this.pronti.push(messaggio(m))
      }
    })
  }

  rompi(errore: Error): void {
    if (this.fallisce) this.fallisce(errore)
    else this.errorePronto = errore
  }

  interrupt = (): Promise<unknown> => {
    this.interrotta++
    return Promise.resolve()
  }

  private cambia(...cambio: unknown[]): Promise<void> {
    if (this.rifiutaIlCambio !== null) return Promise.reject(new Error(this.rifiutaIlCambio))
    this.cambi.push(cambio)
    return Promise.resolve()
  }
  setModel = (modello?: string): Promise<void> => this.cambia("modello", modello)
  applyFlagSettings = (impostazioni: { effortLevel?: string | null }): Promise<void> => this.cambia("effort", impostazioni.effortLevel)
  supportedModels = (): Promise<ModelInfo[]> => (this.rifiutaLaLettura !== null ? Promise.reject(new Error(this.rifiutaLaLettura)) : Promise.resolve(MODELLI_FINTI))
  supportedCommands = (): Promise<SlashCommand[]> => (this.rifiutaLaLettura !== null ? Promise.reject(new Error(this.rifiutaLaLettura)) : Promise.resolve(COMANDI_FINTI))
  readonly lavoriFermati: string[] = []
  /** Se è scritto, il prossimo `stopTask` fallisce con questa frase. */
  rifiutaLoStop: string | null = null
  stopTask = (idLavoro: string): Promise<void> => {
    if (this.rifiutaLoStop !== null) return Promise.reject(new Error(this.rifiutaLoStop))
    this.lavoriFermati.push(idLavoro)
    return Promise.resolve()
  }
  readonly inBackground: (string | undefined)[] = []
  backgroundTasks = (idStrumento?: string): Promise<boolean> => {
    this.inBackground.push(idStrumento)
    return Promise.resolve(true)
  }
  misura: MisuraDelContesto = { totalTokens: 0, rawMaxTokens: 0 }
  /** Se è scritto, la misura del contesto fallisce con questa frase. */
  rifiutaLaMisura: string | null = null
  readonly misureChieste: unknown[] = []
  getContextUsage = (opzioni: { detail: "summary" }): Promise<MisuraDelContesto> => {
    this.misureChieste.push(opzioni)
    return this.rifiutaLaMisura !== null ? Promise.reject(new Error(this.rifiutaLaMisura)) : Promise.resolve(this.misura)
  }

  /** Le richieste di collegamento all'app di Claude (`enableRemoteControl`, che l'SDK ha ma non dichiara nei tipi). */
  readonly collegamenti: unknown[][] = []
  /** Se è scritto, il collegamento fallisce con questa frase. */
  rifiutaIlCollegamento: string | null = null
  enableRemoteControl = (acceso: boolean, nome?: string): Promise<unknown> => {
    this.collegamenti.push([acceso, nome])
    if (this.rifiutaIlCollegamento !== null) return Promise.reject(new Error(this.rifiutaIlCollegamento))
    return Promise.resolve({ session_url: "https://claude.ai/code/SESSIONE-SEGRETA", bridge_session_id: "SESSIONE-SEGRETA", bridge_epoch: 1 })
  }

  close = (): void => {
    this.chiusa = true
    const fine = this.attende
    if (!fine) return
    if (this.chiusuraLenta) void this.chiusuraLenta.then(() => fine({ value: undefined, done: true }))
    else fine({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    return {
      next: () => {
        const primo = this.pronti.shift()
        if (primo) return Promise.resolve({ value: primo, done: false })
        if (this.errorePronto) return Promise.reject(this.errorePronto)
        if (this.chiusa) return (this.chiusuraLenta ?? Promise.resolve()).then(() => ({ value: undefined, done: true as const }))
        return new Promise((risolvi, rifiuta) => {
          this.attende = risolvi
          this.fallisce = rifiuta
        })
      },
    }
  }

  /** Un permesso chiesto come fa l'SDK: la risposta arriva quando il creator ha scelto. */
  async chiediPermesso(strumento: string, ingresso: Record<string, unknown>, id: string, segnale = new AbortController().signal): Promise<PermissionResult> {
    const risposta = await this.opzioni.canUseTool!(strumento, ingresso, { signal: segnale, toolUseID: id, requestId: id })
    if (risposta === null) throw new Error("canUseTool ha risposto null")
    return risposta
  }
}

export class Finto {
  readonly queries: FintaQuery[] = []
  rifiutaLaLettura: string | null = null
  chiusuraLenta: Promise<void> | null = null
  readonly query: FunzioneQuery = ({ prompt, options }) => {
    const q = new FintaQuery(options, prompt)
    q.rifiutaLaLettura = this.rifiutaLaLettura
    q.chiusuraLenta = this.chiusuraLenta
    this.queries.push(q)
    return q
  }
}

export class FinteSessioni implements Sessioni {
  voci: VoceSessione[] = []
  readonly file = new Map<string, MessaggioSessione[]>()
  /** Finché c'è, la lettura di un file aspetta: la conversazione si sta aprendo. */
  blocca: Promise<void> | null = null
  elenchi = 0
  private readonly osservatori: ((id: string) => void)[] = []
  elenca = async (): Promise<VoceSessione[]> => {
    this.elenchi++
    return [...this.voci]
  }
  leggi = async (id: string): Promise<MessaggioSessione[] | null> => {
    await this.blocca
    return this.file.get(id) ?? null
  }
  osserva = async (alCambio: (id: string) => void) => {
    this.osservatori.push(alCambio)
    return { chiudi: () => void this.osservatori.splice(0) }
  }
  cambia(id: string): void {
    this.osservatori.forEach((o) => o(id))
  }
}

export const init = { type: "system", subtype: "init", session_id: "x" }
export const risultato = (extra: object = {}) => ({ type: "result", subtype: "success", is_error: false, duration_ms: 1200, total_cost_usd: 0.05, result: "", queued_turn_count: 0, ...extra })

/** Un testo che arriva a pezzi, come con `includePartialMessages`. */
export const testoAPezzi = (id: string, pezzi: string[]): object[] => [
  { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id } } },
  { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
  ...pezzi.map((testo) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: testo } } })),
  { type: "assistant", parent_tool_use_id: null, message: { id, content: [{ type: "text", text: pezzi.join("") }] } },
  { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } },
]

export const esitoDi = (id: string, content: unknown, is_error = false): object => ({
  type: "user",
  parent_tool_use_id: null,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error }] },
})

export const SENZA_CLAUDE: FunzioneQuery = () => {
  throw new Error("in questa prova Claude Code non c'è")
}

/** Un Claude Code che dà solo l'elenco dei suoi modelli. */
export const SOLO_I_MODELLI_DI_CLAUDE: FunzioneQuery = () =>
  ({
    [Symbol.asyncIterator]: () => ({ next: async () => ({ value: undefined, done: true }) }),
    interrupt: async () => undefined,
    close: () => undefined,
    setModel: async () => undefined,
    applyFlagSettings: async () => undefined,
    supportedModels: async () => [{ value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["high"] }],
    supportedCommands: async () => [],
    stopTask: async () => undefined,
    backgroundTasks: async () => false,
    getContextUsage: async () => ({ totalTokens: 0, rawMaxTokens: 0 }),
  }) as never

export const SENZA_SESSIONI: Sessioni = { elenca: async () => [], leggi: async () => null, osserva: async () => ({ chiudi: () => undefined }) }

export const SESSIONE = "ses_finta1"

const serverFinti: { stop: (subito?: boolean) => void }[] = []

/** Spegne i server dei Mango Code finti avviati finora. */
export function fermaIServerFinti(): void {
  serverFinti.splice(0).forEach((s) => s.stop(true))
}

export class FintoMangoCode {
  readonly richieste: { metodo: string; percorso: string; directory: string | null; corpo: unknown; agente: string | null }[] = []
  private readonly flussi: ReadableStreamDefaultController<Uint8Array>[] = []
  messaggi: unknown[] = []
  mcpGiaCollegati: Record<string, { status: string }> = {}
  /** Se è vero, Mango Code risponde 500 al messaggio. */
  rifiutaIlMessaggio = false
  /** Se è scritto, `PUT /mango/extra-folders` risponde con questo stato. */
  statoCartelle: number | null = null
  readonly url: string

  constructor() {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      idleTimeout: 0,
      fetch: async (req) => {
        const u = new URL(req.url)
        const corpo = req.method === "POST" || req.method === "PUT" ? await req.text().then((t) => (t ? (JSON.parse(t) as unknown) : null)) : null
        const corpoLetto = corpo
        this.richieste.push({ metodo: req.method, percorso: u.pathname, directory: u.searchParams.get("directory"), corpo: corpoLetto, agente: req.headers.get("user-agent") })
        if (u.pathname === "/global/health") return Response.json({ healthy: true })
        if (u.pathname === "/event") {
          // Come il server vero, il primo evento arriva subito: così le intestazioni partono.
          const flusso = new ReadableStream<Uint8Array>({
            start: (c) => {
              this.flussi.push(c)
              c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "server.connected", properties: {} })}\n\n`))
            },
          })
          return new Response(flusso, { headers: { "content-type": "text/event-stream" } })
        }
        if (u.pathname === "/session" && req.method === "POST") return Response.json({ id: SESSIONE })
        if (u.pathname === "/mcp" && req.method === "GET") return Response.json(this.mcpGiaCollegati)
        if (u.pathname === "/mango/extra-folders" && req.method === "PUT" && this.statoCartelle !== null) return new Response("no", { status: this.statoCartelle })
        if (u.pathname === "/mango/extra-folders" && req.method === "PUT") return Response.json({ ...(corpo as object), changed: true })
        if (u.pathname === "/mcp" && req.method === "POST" && typeof corpo === "object" && corpo !== null && "name" in corpo) this.mcpGiaCollegati[String(corpo.name)] = { status: "connected" }
        if (u.pathname === `/session/${SESSIONE}/message`) return Response.json(this.messaggi)
        if (u.pathname === "/config/providers")
          return Response.json({ providers: [{ id: "mango", models: { toq: { id: "toq", name: "TOQ-v1", limit: { context: 65536 }, capabilities: { input: { image: false } } } } }] })
        if (this.rifiutaIlMessaggio && u.pathname.endsWith("/prompt_async")) return new Response("errore interno del gestore: stack...", { status: 500 })
        if (req.method === "POST") return new Response(null, { status: 204 })
        return new Response("non c'è", { status: 404 })
      },
    })
    serverFinti.push(server)
    this.url = `http://127.0.0.1:${server.port}`
  }

  get collegati(): number {
    return this.flussi.length
  }

  evento(type: string, properties: object): void {
    const riga = new TextEncoder().encode(`data: ${JSON.stringify({ type, properties })}\n\n`)
    this.flussi.forEach((c) => c.enqueue(riga))
  }

  di(percorso: string) {
    return this.richieste.filter((r) => r.percorso === percorso)
  }

  /** Un passo come lo manda Mango Code: nasce a zero, e finito porta i token e `finish` nello stesso messaggio, che arriva due volte identico. */
  passo(id: string, tokens: { input: number; output: number; reasoning: number; read: number; write: number }, finish = "tool-calls", extra: object = {}): void {
    const info = (conTokens: boolean) => ({
      id,
      sessionID: SESSIONE,
      role: "assistant",
      ...extra,
      tokens: conTokens
        ? { input: tokens.input, output: tokens.output, reasoning: tokens.reasoning, cache: { read: tokens.read, write: tokens.write }, total: tokens.input + tokens.output + tokens.reasoning + tokens.read + tokens.write }
        : { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 0 },
      ...(conTokens ? { finish, time: { created: 1, completed: 2 } } : {}),
    })
    this.evento("message.updated", { info: info(false) })
    this.evento("message.updated", { info: info(true) })
    this.evento("message.updated", { info: info(true) })
  }

  /** L'ordine del riassunto del contratto: la parte `compaction`, il messaggio a zero, lo stesso finito coi token della richiesta che lo scrive, `session.compacted`. */
  riassunto(id: string, tokensDellaRichiesta: number): void {
    const info = (finito: boolean) => ({ id, sessionID: SESSIONE, role: "assistant", mode: "compaction", summary: true, tokens: { input: finito ? tokensDellaRichiesta : 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: finito ? tokensDellaRichiesta : 0 }, ...(finito ? { finish: "stop", time: { created: 1, completed: 2 } } : {}) })
    this.evento("message.part.updated", { part: { id: "prt_compaction", messageID: "msg_u", sessionID: SESSIONE, type: "compaction", auto: true } })
    this.evento("message.updated", { info: info(false) })
    this.evento("message.part.updated", { part: { id: `${id}_testo`, messageID: id, sessionID: SESSIONE, type: "text", text: "" } })
    this.evento("message.part.delta", { sessionID: SESSIONE, messageID: id, partID: `${id}_testo`, field: "text", delta: "RIASSUNTO della conversazione" })
    this.evento("message.part.updated", { part: { id: `${id}_testo`, messageID: id, sessionID: SESSIONE, type: "text", text: "RIASSUNTO della conversazione", time: { start: 1, end: 2 } } })
    this.evento("message.updated", { info: info(true) })
    this.evento("session.compacted", { sessionID: SESSIONE })
  }

  /** `session.idle` si ripete: più volte per lo stesso giro. */
  idle(): void {
    for (let n = 0; n < 3; n++) this.evento("session.idle", { sessionID: SESSIONE })
  }
}
