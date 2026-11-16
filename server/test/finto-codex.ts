// Un `codex app-server` finto per le prove: JSON-RPC su stdio, una riga per messaggio. Si accende con
// `Bun.spawn([process.execPath, "run", "<percorso>/finto-codex.ts"])`.
//
// L'ambiente decide (tutto facoltativo):
//   FINTO_CODEX_VERSIONE  la versione dichiarata in `initialize` (di base 0.167.0)
//   FINTO_CODEX_ACCOUNT   «scollegato»: `account/read` risponde senza account
//   FINTO_CODEX_REGISTRO  un file in cui scrive, una riga JSON per messaggio, tutto ciò che riceve
//   FINTO_CODEX_CARTELLA  una cartella in cui tiene i thread: sopravvivono al processo e si possono riprendere
//   FINTO_CODEX_HOME      la cartella di Codex (`codexHome`): ogni thread vi tiene il suo file sotto `sessions/`, che cambia quando il thread cambia
//
// Il giro lo sceglie il testo del messaggio di `turn/start` (vince la prima parola dell'elenco che vi compare, scritta in maiuscolo
// come parola intera). Senza parole: testo semplice a pezzi; un messaggio con una skill allegata e nessuna parola: il giro della skill.
//   CADUTA           scrive una riga sul canale degli errori e cade a metà giro (anche un `turn/steer` con questa parola, prima di rispondere)
//   RUMORE           una riga che non è JSON in mezzo ai messaggi, poi testo semplice
//   COMANDO_FERMATO  [registrato] un comando che non finisce: il giro finisce solo con `turn/interrupt`; il comando resta vivo
//   COMANDO          [registrato] un comando, un file scritto, un secondo comando; aspetta un attimo un `turn/steer` a comando avviato
//   STRUMENTO_LENTO  [registrato] uno strumento MCP che risponde dopo un po'
//   SKILL            [registrato] la skill «saluta»
//   PENSIERO         pensiero a pezzi (`item/reasoning/summaryTextDelta`), poi testo
//   IMMAGINE         uno strumento MCP con un'immagine nel risultato
//   PIANO            un piano che si aggiorna (`turn/plan/updated`)
//   RIASSUNTO        il contesto riassunto (`thread/compacted`)
//   LIMITE           il limite raggiunto: `account/rateLimits/updated` al 100% e `turn/completed` fallito (`usageLimitExceeded`)
//   DOMANDA          una domanda a noi (`item/tool/requestUserInput`): il testo finale riporta la risposta
//   PERMESSO         un permesso chiesto (`item/commandExecution/requestApproval`)
//   LUNGO            un giro che finisce solo con `turn/interrupt` e lascia un comando vivo fino a
//                    `thread/backgroundTerminals/terminate`
//   AIUTANTE         un aiutante lanciato (`collabAgentToolCall`, `subAgentActivity`, un thread figlio con le sue notifiche),
//                    al lavoro e finito, poi la risposta
//   SFONDO           un giro che finisce da sé lasciando un comando acceso: si elenca (`thread/backgroundTerminals/list`) e si
//                    chiude con `thread/backgroundTerminals/terminate`
// `review/start` fa un giro di revisione (`enteredReviewMode`, `exitedReviewMode` col testo). Il metodo `finto/terminale` apre un
// thread come farebbe il terminale: ha già un giro finito, e il suo file compare sotto `sessions/`.
// Il metodo `finto/pid` risponde col PID del processo.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { eOggetto } from "../src/disco"
import type { Oggetto } from "../src/chat/traduzione"

const VERSIONE = process.env["FINTO_CODEX_VERSIONE"] ?? "0.167.0"
const SCOLLEGATO = process.env["FINTO_CODEX_ACCOUNT"] === "scollegato"
const REGISTRO = process.env["FINTO_CODEX_REGISTRO"]
const CARTELLA = process.env["FINTO_CODEX_CARTELLA"]
const CASA = process.env["FINTO_CODEX_HOME"]
const CASA_DICHIARATA = CASA ?? "/home/creator/.codex"
const FINESTRA_DEL_CONTESTO = 258_400
const PAUSA = 4
const ATTESA = 400
const PNG_ROSSO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

const testoDi = (o: Oggetto, chiave: string): string | null => {
  const v = o[chiave]
  return typeof v === "string" ? v : null
}
const oggettoDi = (o: Oggetto, chiave: string): Oggetto => {
  const v = o[chiave]
  return eOggetto(v) ? v : {}
}
const listaDi = (o: Oggetto, chiave: string): Oggetto[] => {
  const v = o[chiave]
  return Array.isArray(v) ? v.filter(eOggetto) : []
}
const adesso = (): number => Math.floor(Date.now() / 1000)
const nuovoId = (prefisso: string): string => `${prefisso}${crypto.randomUUID()}`

const manda = (messaggio: Oggetto): void => void process.stdout.write(`${JSON.stringify(messaggio)}\n`)
const notifica = (method: string, params: Oggetto): void => manda({ method, params })

class ErroreRpc extends Error {
  constructor(
    messaggio: string,
    readonly codice: number,
  ) {
    super(messaggio)
  }
}
class GiroFermato extends Error {}
class GiroFallito extends Error {
  constructor(
    messaggio: string,
    readonly info: string,
  ) {
    super(messaggio)
  }
}

interface Turno {
  id: string
  items: Oggetto[]
  status: "inProgress" | "completed" | "interrupted" | "failed"
  error: Oggetto | null
  startedAt: number
  completedAt: number | null
  durationMs: number | null
}

interface Terminale {
  voce: Oggetto
  turnId: string
}

interface Thread {
  id: string
  cwd: string
  model: string
  effort: string
  name: string | null
  creato: number
  aggiornato: number
  turni: Turno[]
  token: number
  giro?: Giro | undefined
  terminali: Map<string, Terminale>
  /** Il thread è caricato in memoria da `thread/start` o `thread/resume`, finché `thread/unsubscribe` non lo lascia. */
  caricato?: boolean
}

const thread = new Map<string, Thread>()
const radiciDelleSkill: string[] = []
let inizializzato = false
let usoPercentuale = 12
let prossimoId = 1
const inAttesaDalClient = new Map<number, (esito: Oggetto) => void>()

const fileDelThread = (t: Thread): string => join(CASA_DICHIARATA, "sessions", "2026", "11", "13", `rollout-2026-11-13T10-00-00-${t.id}.jsonl`)

function salva(t: Thread): void {
  if (CASA) {
    mkdirSync(dirname(fileDelThread(t)), { recursive: true })
    appendFileSync(fileDelThread(t), "{}\n")
  }
  if (!CARTELLA) return
  const { giro: _giro, terminali: _terminali, caricato: _caricato, ...resto } = t
  writeFileSync(join(CARTELLA, `${t.id}.json`), JSON.stringify(resto))
}

function carica(): void {
  if (!CARTELLA) return
  mkdirSync(CARTELLA, { recursive: true })
  for (const file of readdirSync(CARTELLA).filter((f) => f.endsWith(".json"))) {
    const t = JSON.parse(readFileSync(join(CARTELLA, file), "utf8")) as Omit<Thread, "terminali">
    for (const turno of t.turni) if (turno.status === "inProgress") turno.status = "interrupted"
    thread.set(t.id, { ...t, terminali: new Map() })
  }
}

const vistaTurno = (t: Turno, items: Oggetto[], itemsView: string): Oggetto => ({
  id: t.id,
  rootTurnId: t.id,
  items,
  itemsView,
  status: t.status,
  error: t.error,
  startedAt: t.startedAt,
  completedAt: t.completedAt,
  durationMs: t.durationMs,
})

function anteprimaDi(t: Thread): string {
  const messaggio = t.turni.flatMap((turno) => turno.items).find((v) => v["type"] === "userMessage")
  const testo = messaggio ? listaDi(messaggio, "content").find((c) => c["type"] === "text") : undefined
  return testo ? (testoDi(testo, "text") ?? "") : ""
}

function vistaThread(t: Thread, conTurni: boolean): Oggetto {
  return {
    id: t.id,
    environments: [{ environmentId: "local", cwd: t.cwd, runtimeWorkspaceRoots: [t.cwd] }],
    extra: null,
    sessionId: t.id,
    forkedFromId: null,
    parentThreadId: null,
    preview: anteprimaDi(t),
    ephemeral: false,
    section: null,
    sectionEnteredAt: null,
    projectId: null,
    historyMode: "paginated",
    modelProvider: "openai",
    model: t.model,
    reasoningEffort: t.effort,
    createdAt: t.creato,
    updatedAt: t.aggiornato,
    recencyAt: t.aggiornato,
    status: t.giro ? { type: "active", activeFlags: [] } : { type: "idle" },
    path: fileDelThread(t),
    cwd: t.cwd,
    cliVersion: VERSIONE,
    originator: "mango-animation",
    source: "vscode",
    canAcceptDirectInput: true,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    name: t.name,
    daybreakEnabled: null,
    turns: conTurni ? t.turni.map((turno) => vistaTurno(turno, turno.items, "full")) : [],
  }
}

const impostazioni = (t: Thread): Oggetto => ({
  disabledPluginIds: [],
  cwd: t.cwd,
  approvalPolicy: "never",
  approvalsReviewer: "user",
  sandboxPolicy: { type: "dangerFullAccess" },
  activePermissionProfile: null,
  model: t.model,
  modelProvider: "openai",
  serviceTier: null,
  effort: t.effort,
  summary: null,
  collaborationMode: { mode: "default", settings: { model: t.model, reasoning_effort: t.effort, developer_instructions: null } },
  multiAgentMode: "explicitRequestOnly",
  personality: null,
})

const limiti = (): Oggetto => ({
  limitId: "codex",
  limitName: null,
  normalModelSlug: null,
  primary: { usedPercent: usoPercentuale, windowDurationMins: 43_200, resetsAt: adesso() + 86_400 },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: null },
  individualLimit: null,
  spendControlReached: usoPercentuale >= 100,
  planType: "plus",
  rateLimitReachedType: usoPercentuale >= 100 ? "rate_limit_reached" : null,
})

class Giro {
  interrotto = false
  readonly fermato = Promise.withResolvers<void>()
  private readonly steerArrivato = Promise.withResolvers<void>()

  constructor(
    readonly thread: Thread,
    readonly turno: Turno,
    readonly input: Oggetto[],
  ) {}

  /** Una notifica del giro, col thread e il giro. */
  emetti(method: string, resto: Oggetto): void {
    notifica(method, { threadId: this.thread.id, turnId: this.turno.id, ...resto })
  }

  ferma(): void {
    this.interrotto = true
    this.fermato.resolve()
  }

  async pausa(ms: number): Promise<void> {
    const scaduta = Promise.withResolvers<void>()
    const timer = setTimeout(scaduta.resolve, ms)
    await Promise.race([scaduta.promise, this.fermato.promise])
    clearTimeout(timer)
    if (this.interrotto) throw new GiroFermato()
  }

  async aspettaSteer(ms: number): Promise<void> {
    const scaduta = Promise.withResolvers<void>()
    const timer = setTimeout(scaduta.resolve, ms)
    await Promise.race([scaduta.promise, this.steerArrivato.promise, this.fermato.promise])
    clearTimeout(timer)
    if (this.interrotto) throw new GiroFermato()
  }

  async aspettaInterruzione(): Promise<never> {
    await this.fermato.promise
    throw new GiroFermato()
  }

  messaggioDelCreator(input: Oggetto[]): void {
    const id = nuovoId("")
    const base = { type: "userMessage", id, clientId: null, content: input, startedAtMs: Date.now() }
    this.ricorda({ ...base, completedAtMs: null })
    this.emetti("item/started", { item: { ...base, completedAtMs: null }, startedAtMs: base.startedAtMs })
    const finita = { ...base, completedAtMs: Date.now() }
    this.ricorda(finita)
    this.emetti("item/completed", { item: finita, completedAtMs: finita.completedAtMs })
  }

  steer(input: Oggetto[]): void {
    this.messaggioDelCreator(input)
    this.steerArrivato.resolve()
  }

  /** Tiene la voce nella storia del thread e, se è un comando vivo, fra i terminali. */
  ricorda(voce: Oggetto): void {
    const id = testoDi(voce, "id")
    if (id === null) return
    const trovata = this.turno.items.findIndex((v) => v["id"] === id)
    if (trovata >= 0) this.turno.items[trovata] = voce
    else this.turno.items.push(voce)
    salva(this.thread)
    const processo = testoDi(voce, "processId")
    if (voce["type"] !== "commandExecution" || processo === null) return
    if (voce["status"] === "inProgress") this.thread.terminali.set(processo, { voce, turnId: this.turno.id })
    else this.thread.terminali.delete(processo)
  }

  inizia(voce: Oggetto): void {
    const item = { ...voce, startedAtMs: Date.now(), completedAtMs: null }
    this.ricorda(item)
    this.emetti("item/started", { item, startedAtMs: item.startedAtMs })
  }

  finisci(voce: Oggetto): void {
    const item = { ...voce, completedAtMs: Date.now() }
    this.ricorda(item)
    this.emetti("item/completed", { item, completedAtMs: item.completedAtMs })
  }

  async testo(testo: string, fase: "final_answer" | "commentary" = "final_answer"): Promise<void> {
    const base = { type: "agentMessage", id: nuovoId("msg_"), phase: fase, memoryCitation: null, delivery: null, questions: null }
    this.inizia({ ...base, text: "" })
    for (const pezzo of testo.split(/(?<=\s)/)) {
      this.emetti("item/agentMessage/delta", { itemId: base.id, delta: pezzo })
      await this.pausa(PAUSA)
    }
    this.finisci({ ...base, text: testo })
  }

  async chiedi(method: string, params: Oggetto): Promise<Oggetto> {
    const id = prossimoId++
    const risposta = Promise.withResolvers<Oggetto>()
    inAttesaDalClient.set(id, risposta.resolve)
    manda({ id, method, params })
    const esito = await Promise.race([risposta.promise, this.fermato.promise.then(() => null)])
    inAttesaDalClient.delete(id)
    notifica("serverRequest/resolved", { threadId: this.thread.id, requestId: id })
    if (esito === null) throw new GiroFermato()
    return esito
  }

  uso(): void {
    const ultimo = 1200 + Math.floor(Math.random() * 100)
    this.thread.token += ultimo
    this.emetti("thread/tokenUsage/updated", { tokenUsage: usoDei(this.thread.token, ultimo) })
    notifica("account/rateLimits/updated", { rateLimits: limiti() })
  }
}

const conteggio = (totale: number): Oggetto => ({ totalTokens: totale, inputTokens: totale - 40, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 40, reasoningOutputTokens: 0 })
const usoDei = (totale: number, ultimo: number): Oggetto => ({ total: conteggio(totale), last: conteggio(ultimo), modelContextWindow: FINESTRA_DEL_CONTESTO })

type Copione = (g: Giro) => Promise<void>

const TESTO_FINALE = "Questa è la risposta di prova."
const conUso =
  (copione: Copione): Copione =>
  async (g) => {
    await copione(g)
    g.uso()
  }

const comandoVivo = (g: Giro, comando: string, processo: string | null): Oggetto => ({
  type: "commandExecution",
  id: nuovoId("exec-"),
  pluginId: null,
  scriptPath: null,
  command: comando,
  cwd: g.thread.cwd,
  processId: processo,
  source: "unifiedExecStartup",
  status: "inProgress",
  commandActions: [{ type: "unknown", command: comando }],
  aggregatedOutput: null,
  exitCode: null,
  durationMs: null,
})

const strumentoMcp = (strumento: string, argomenti: Oggetto): Oggetto => ({
  type: "mcpToolCall",
  id: nuovoId("exec-"),
  server: "prova",
  tool: strumento,
  status: "inProgress",
  arguments: argomenti,
  appContext: null,
  mcpAppUi: null,
  pluginId: null,
  readOnlyHint: null,
  result: null,
  error: null,
  durationMs: null,
})

const testoSemplice: Copione = conUso((g) => g.testo(TESTO_FINALE))

const TESTO_DELLA_REVISIONE = "Il piano ha due scene uguali."

const revisione: Copione = conUso(async (g) => {
  const entrata = { type: "enteredReviewMode", id: nuovoId("rv_"), review: "custom review" }
  g.inizia(entrata)
  g.finisci(entrata)
  await g.pausa(PAUSA)
  g.finisci({ type: "exitedReviewMode", id: nuovoId("rv_"), review: TESTO_DELLA_REVISIONE })
})

const cadutaGiro: Copione = async (g) => {
  const id = nuovoId("msg_")
  g.inizia({ type: "agentMessage", id, text: "", phase: "final_answer", memoryCitation: null, delivery: null, questions: null })
  g.emetti("item/agentMessage/delta", { itemId: id, delta: "Questa " })
  await cadi()
}

async function cadi(): Promise<never> {
  process.stderr.write("finto-codex: caduto come richiesto\n")
  await Bun.sleep(50)
  process.exit(3)
}

const rumore: Copione = conUso(async (g) => {
  process.stdout.write("questa riga non è JSON\n")
  await g.testo(TESTO_FINALE)
})

const pensiero: Copione = conUso(async (g) => {
  const id = nuovoId("rs_")
  g.inizia({ type: "reasoning", id, summary: [], content: [] })
  g.emetti("item/reasoning/summaryPartAdded", { itemId: id, summaryIndex: 0 })
  for (const pezzo of ["Valuto ", "la richiesta ", "e preparo ", "la risposta."]) {
    g.emetti("item/reasoning/summaryTextDelta", { itemId: id, delta: pezzo, summaryIndex: 0 })
    await g.pausa(PAUSA)
  }
  g.finisci({ type: "reasoning", id, summary: ["Valuto la richiesta e preparo la risposta."], content: [] })
  await g.testo(TESTO_FINALE)
})

const immagine: Copione = conUso(async (g) => {
  const chiamata = strumentoMcp("foto", { scena: "titolo" })
  g.inizia(chiamata)
  await g.pausa(PAUSA)
  g.finisci({ ...chiamata, status: "completed", result: { content: [{ type: "image", data: PNG_ROSSO, mimeType: "image/png" }], structuredContent: null, _meta: null }, durationMs: 40 })
  await g.testo("L'immagine è rossa.")
})

const piano: Copione = conUso(async (g) => {
  const passi = ["Leggere il copione", "Scrivere le scene", "Controllare il montaggio"]
  const aggiorna = (fatti: number): void =>
    g.emetti("turn/plan/updated", { explanation: null, plan: passi.map((step, i) => ({ step, status: i < fatti ? "completed" : i === fatti ? "inProgress" : "pending" })) })
  for (let fatti = 0; fatti <= passi.length; fatti++) {
    aggiorna(fatti)
    await g.pausa(PAUSA)
  }
  await g.testo(TESTO_FINALE)
})

const compatta = async (g: Giro): Promise<void> => {
  const voce = { type: "contextCompaction", id: nuovoId("cc_") }
  g.inizia(voce)
  await g.pausa(PAUSA)
  g.finisci(voce)
  g.emetti("thread/compacted", {})
}

const riassunto: Copione = conUso(async (g) => {
  await compatta(g)
  await g.testo(TESTO_FINALE)
})

const limite: Copione = async (g) => {
  usoPercentuale = 100
  notifica("account/rateLimits/updated", { rateLimits: limiti() })
  await g.pausa(PAUSA)
  throw new GiroFallito("You've hit your usage limit. Try again later.", "usageLimitExceeded")
}

const domanda: Copione = conUso(async (g) => {
  const esito = await g.chiedi("item/tool/requestUserInput", {
    threadId: g.thread.id,
    turnId: g.turno.id,
    itemId: nuovoId("q_"),
    questions: [{ id: "colore", header: "Colore", question: "Che colore vuoi?", isOther: true, isSecret: false, options: [{ label: "Azzurro", description: "Il colore del cielo" }, { label: "Rosso", description: "Il colore delle ciliegie" }] }],
    isBlocking: true,
    autoResolutionMs: null,
  })
  const errore = oggettoDi(esito, "error")
  if (Object.keys(errore).length > 0) return g.testo(`La domanda non ha avuto risposta: ${testoDi(errore, "message") ?? "errore"}.`)
  const risposte = Object.values(oggettoDi(oggettoDi(esito, "result"), "answers")).flatMap((r) => (eOggetto(r) && Array.isArray(r["answers"]) ? r["answers"] : []))
  return g.testo(`Hai risposto: ${risposte.join(", ")}.`)
})

const permesso: Copione = conUso(async (g) => {
  const comando = "git push origin main"
  const voce = comandoVivo(g, comando, null)
  g.inizia(voce)
  const esito = await g.chiedi("item/commandExecution/requestApproval", {
    kind: "command",
    threadId: g.thread.id,
    turnId: g.turno.id,
    itemId: voce["id"],
    startedAtMs: Date.now(),
    environmentId: "local",
    reason: "Il comando scrive fuori dalla cartella di lavoro.",
    command: comando,
    cwd: g.thread.cwd,
    commandActions: [{ type: "unknown", command: comando }],
    availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
  })
  const decisione = testoDi(oggettoDi(esito, "result"), "decision")
  if (decisione === "cancel") throw new GiroFermato()
  const concesso = decisione === "accept" || decisione === "acceptForSession"
  g.finisci({ ...voce, status: concesso ? "completed" : "declined", aggregatedOutput: concesso ? "ok\r\n" : null, exitCode: concesso ? 0 : null, durationMs: concesso ? 30 : null })
  await g.testo(concesso ? "Comando eseguito." : "Comando rifiutato.")
})

let prossimoProcesso = 40_000
const lungo: Copione = async (g) => {
  await g.testo("Avvio un comando lungo.", "commentary")
  g.inizia(comandoVivo(g, "ping -n 600 127.0.0.1", String(prossimoProcesso++)))
  await g.aspettaInterruzione()
}

const sfondo: Copione = conUso(async (g) => {
  await g.testo("Avvio un comando e lo lascio acceso.", "commentary")
  g.inizia(comandoVivo(g, "ping -n 600 127.0.0.1", String(prossimoProcesso++)))
  await g.pausa(PAUSA)
  await g.testo("Il comando è acceso.")
})

const aiutante: Copione = conUso(async (g) => {
  const figlio = crypto.randomUUID()
  const sulFiglio = (method: string, resto: Oggetto): void => notifica(method, { threadId: figlio, turnId: `${figlio}-giro`, ...resto })
  const chiamata = (tool: string, stato: string, ricevitori: string[], agenti: Oggetto): Oggetto => ({
    type: "collabAgentToolCall",
    id: nuovoId("collab-"),
    tool,
    status: stato,
    senderThreadId: g.thread.id,
    receiverThreadIds: ricevitori,
    prompt: tool === "spawnAgent" ? "Conta le scene del video" : null,
    model: null,
    reasoningEffort: null,
    agentsStates: agenti,
  })
  const attivita = (kind: string): Oggetto => ({ type: "subAgentActivity", id: nuovoId("sub-"), kind, agentThreadId: figlio, agentPath: "/root/conta", model: null, reasoningEffort: null })

  await g.testo("Chiamo un aiutante.", "commentary")
  notifica("thread/started", { thread: { id: figlio, sessionId: g.thread.id, parentThreadId: g.thread.id, preview: "", ephemeral: false, model: g.thread.model, status: { type: "idle" } } })
  const lancio = chiamata("spawnAgent", "inProgress", [], {})
  g.inizia(lancio)
  await g.pausa(PAUSA)
  g.finisci({ ...lancio, status: "completed", receiverThreadIds: [figlio], agentsStates: { [figlio]: { status: "pendingInit", message: null } } })
  const nato = attivita("started")
  g.inizia(nato)
  g.finisci(nato)

  sulFiglio("turn/started", { turn: vistaTurno({ id: `${figlio}-giro`, items: [], status: "inProgress", error: null, startedAt: adesso(), completedAt: null, durationMs: null }, [], "notLoaded") })
  const comando = comandoVivo(g, "dir", "7")
  sulFiglio("item/started", { item: { ...comando, id: nuovoId("exec-") } })
  sulFiglio("item/agentMessage/delta", { itemId: nuovoId("msg_"), delta: "Le scene sono dodici." })
  await g.pausa(PAUSA)
  sulFiglio("thread/tokenUsage/updated", { tokenUsage: usoDei(54_000, 9_000) })
  await g.pausa(PAUSA)

  const attesa = chiamata("wait", "inProgress", [figlio], { [figlio]: { status: "running", message: null } })
  g.inizia(attesa)
  await g.pausa(PAUSA)
  sulFiglio("turn/completed", { turn: vistaTurno({ id: `${figlio}-giro`, items: [], status: "completed", error: null, startedAt: adesso(), completedAt: adesso(), durationMs: 10 }, [], "notLoaded") })
  g.finisci({ ...attesa, status: "completed", agentsStates: { [figlio]: { status: "completed", message: "Le scene sono dodici." } } })
  const finito = attivita("completed")
  g.inizia(finito)
  g.finisci(finito)
  await g.testo("L'aiutante ha contato dodici scene.")
})

type Evento = { method: string; params: Oggetto } | { punto: "steer" | "interrompi" }

interface Registrato {
  eventi: Evento[]
  idThread: string
  idGiro: string
  idVoci: string[]
}

const REGISTRATI = { comando: 0, comandoFermato: 1, skill: 2, strumentoLento: 3 }
const SALTATI = new Set(["thread/settings/updated", "thread/status/changed", "turn/started"])
let giriRegistrati: Registrato[] | null = null
let cwdRegistrato = ""

function leggiRegistrati(): Registrato[] {
  if (giriRegistrati) return giriRegistrati
  const righe = readFileSync(join(import.meta.dir, "dati", "codex-giri.jsonl"), "utf8").split("\n").filter(Boolean).map((r) => JSON.parse(r) as Oggetto)
  const giri: Registrato[] = []
  let corrente: Registrato | null = null
  for (const riga of righe) {
    const metodo = testoDi(riga, "method")
    const params = oggettoDi(riga, "params")
    if (riga["verso"] === "codex") {
      if (metodo === "thread/start") cwdRegistrato = testoDi(params, "cwd") ?? ""
      if (metodo === "turn/start") {
        corrente = { eventi: [], idThread: testoDi(params, "threadId") ?? "", idGiro: "", idVoci: [] }
        giri.push(corrente)
      }
      if (corrente && metodo === "turn/steer") corrente.eventi.push({ punto: "steer" })
      if (corrente && metodo === "turn/interrupt") corrente.eventi.push({ punto: "interrompi" })
      continue
    }
    if (!corrente || metodo === null) continue
    if (metodo === "turn/started") corrente.idGiro = testoDi(oggettoDi(params, "turn"), "id") ?? ""
    if (metodo === "turn/completed") corrente = null
    if (corrente === null || SALTATI.has(metodo)) continue
    if (oggettoDi(params, "item")["type"] === "userMessage") continue
    corrente.eventi.push({ method: metodo, params })
  }
  for (const giro of giri) {
    const idDi = (e: Evento): string | null => ("punto" in e ? null : testoDi(oggettoDi(e.params, "item"), "id"))
    const iniziati = new Set(giro.eventi.flatMap((e) => (!("punto" in e) && e.method === "item/started" ? [idDi(e)] : [])))
    giro.eventi = giro.eventi.filter((e) => "punto" in e || e.method !== "item/completed" || iniziati.has(idDi(e)))
    giro.idVoci = [...iniziati].filter((id): id is string => id !== null)
  }
  giriRegistrati = giri
  return giri
}

const codifica = (testo: string): string => JSON.stringify(testo).slice(1, -1)

/** Rimette in scena un giro della registrazione, con i numeri del thread e del giro veri e i tempi accorciati. */
const riproduci =
  (quale: number): Copione =>
  async (g) => {
    const registrato = leggiRegistrati()[quale]
    if (!registrato) throw new Error(`Il giro registrato ${quale} non c'è`)
    const tutte: Array<[string, string]> = [
      [registrato.idThread, g.thread.id],
      [registrato.idGiro, g.turno.id],
      [codifica(cwdRegistrato), codifica(g.thread.cwd)],
      ...registrato.idVoci.map((id): [string, string] => [id, nuovoId(/^[a-z]+[_-]/.exec(id)?.[0] ?? "")]),
    ]
    const sostituzioni = tutte.filter(([da]) => da !== "")
    for (const evento of registrato.eventi) {
      if ("punto" in evento) {
        if (evento.punto === "steer") await g.aspettaSteer(ATTESA)
        else await g.aspettaInterruzione()
        continue
      }
      const testo = sostituzioni.reduce((t, [da, a]) => t.replaceAll(da, a), JSON.stringify(evento))
      const { method, params } = JSON.parse(testo) as { method: string; params: Oggetto }
      const voce = oggettoDi(params, "item")
      if (method === "item/started" || method === "item/completed") g.ricorda(voce)
      notifica(method, params)
      await g.pausa(PAUSA)
      if (method === "item/started" && voce["type"] === "mcpToolCall") await g.pausa(ATTESA)
    }
  }

const GIRI: Array<{ parola: string; copione: Copione }> = [
  { parola: "CADUTA", copione: cadutaGiro },
  { parola: "RUMORE", copione: rumore },
  { parola: "COMANDO_FERMATO", copione: riproduci(REGISTRATI.comandoFermato) },
  { parola: "COMANDO", copione: riproduci(REGISTRATI.comando) },
  { parola: "STRUMENTO_LENTO", copione: riproduci(REGISTRATI.strumentoLento) },
  { parola: "SKILL", copione: riproduci(REGISTRATI.skill) },
  { parola: "PENSIERO", copione: pensiero },
  { parola: "IMMAGINE", copione: immagine },
  { parola: "PIANO", copione: piano },
  { parola: "RIASSUNTO", copione: riassunto },
  { parola: "LIMITE", copione: limite },
  { parola: "DOMANDA", copione: domanda },
  { parola: "PERMESSO", copione: permesso },
  { parola: "LUNGO", copione: lungo },
  { parola: "AIUTANTE", copione: aiutante },
  { parola: "SFONDO", copione: sfondo },
]

function scegli(input: Oggetto[]): Copione {
  const testo = input.flatMap((i) => testoDi(i, "text") ?? []).join("\n")
  const trovato = GIRI.find((g) => new RegExp(`\\b${g.parola}\\b`).test(testo))
  if (trovato) return trovato.copione
  if (input.some((i) => i["type"] === "skill")) return riproduci(REGISTRATI.skill)
  return testoSemplice
}

async function eseguiGiro(g: Giro, copione: Copione): Promise<void> {
  const { thread: t, turno } = g
  notifica("thread/settings/updated", { threadId: t.id, threadSettings: impostazioni(t) })
  notifica("thread/status/changed", { threadId: t.id, status: { type: "active", activeFlags: [] } })
  notifica("turn/started", { threadId: t.id, turn: vistaTurno(turno, [], "notLoaded") })
  if (g.input.length > 0) g.messaggioDelCreator(g.input)
  try {
    await copione(g)
    turno.status = "completed"
  } catch (causa) {
    if (causa instanceof GiroFermato) turno.status = "interrupted"
    else if (causa instanceof GiroFallito) {
      turno.status = "failed"
      turno.error = { message: causa.message, codexErrorInfo: causa.info, additionalDetails: null, misalignment: null }
    } else throw causa
  }
  turno.completedAt = adesso()
  turno.durationMs = Date.now() - turno.startedAt * 1000
  t.giro = undefined
  t.aggiornato = adesso()
  salva(t)
  notifica("thread/status/changed", { threadId: t.id, status: { type: "idle" } })
  const risposta = turno.status === "completed" ? turno.items.filter((v) => v["type"] === "agentMessage" && v["phase"] === "final_answer").slice(-1) : []
  notifica("turn/completed", { threadId: t.id, turn: vistaTurno(turno, risposta, risposta.length > 0 ? "summary" : "notLoaded") })
}

function avviaGiro(t: Thread, input: Oggetto[], copione: Copione): Turno {
  const turno: Turno = { id: nuovoId(""), items: [], status: "inProgress", error: null, startedAt: adesso(), completedAt: null, durationMs: null }
  const giro = new Giro(t, turno, input)
  t.giro = giro
  t.turni.push(turno)
  salva(t)
  setTimeout(() => void eseguiGiro(giro, copione), 0)
  return turno
}

const trova = (params: Oggetto): Thread => {
  const id = testoDi(params, "threadId") ?? ""
  const t = thread.get(id)
  if (!t) throw new ErroreRpc(`thread not found: ${id}`, -32600)
  return t
}

const caricato = (params: Oggetto): Thread => {
  const t = trova(params)
  if (!t.caricato) throw new ErroreRpc(`thread not found: ${t.id}`, -32600)
  return t
}

const MODELLO_DI_BASE = "gpt-6-luna"
const LIVELLI = ["low", "medium", "high", "xhigh", "max"]
const modello = (id: string, nome: string, descrizione: string, livelli: string[], predefinito: boolean): Oggetto => ({
  id,
  model: id,
  upgrade: null,
  upgradeInfo: null,
  availabilityNux: null,
  displayName: nome,
  description: descrizione,
  modelSpecialty: null,
  hidden: false,
  supportedReasoningEfforts: livelli.map((reasoningEffort) => ({ reasoningEffort, description: `Ragionamento ${reasoningEffort}` })),
  defaultReasoningEffort: "high",
  inputModalities: ["text", "image"],
  supportsPersonality: false,
  multiAgentVersion: null,
  additionalSpeedTiers: [],
  serviceTiers: [],
  defaultServiceTier: null,
  availableAccessPrograms: null,
  isDefault: predefinito,
})
const MODELLI = [
  modello(MODELLO_DI_BASE, "GPT-6 Luna", "Il modello di base per il lavoro di ogni giorno.", LIVELLI, true),
  modello("gpt-5.6-terra", "GPT-5.6 Terra", "Il modello per i lavori lunghi.", [...LIVELLI, "ultra"], false),
  modello("gpt-5.6-luna", "GPT-5.6 Luna", "Il modello della generazione precedente.", LIVELLI, false),
]

function leggiSkill(radice: string): Oggetto[] {
  if (!existsSync(radice)) return []
  return readdirSync(radice, { withFileTypes: true }).flatMap((voce) => {
    const file = join(radice, voce.name, "SKILL.md")
    if (!voce.isDirectory() || !existsSync(file)) return []
    const intestazione = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"))?.[1] ?? ""
    const campo = (nome: string): string => new RegExp(`^${nome}:\\s*(.+)$`, "m").exec(intestazione)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? ""
    return [{ name: campo("name") || voce.name, description: campo("description"), path: file, scope: "user", enabled: true, pluginId: null }]
  })
}

const impostazioniDiBase = {
  disabledPluginIds: [],
  serviceTier: null,
  modelProvider: "openai",
  instructionSources: [],
  approvalPolicy: "never",
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
  activePermissionProfile: null,
  multiAgentMode: "explicitRequestOnly",
}

const rispostaDelThread = (t: Thread, conTurni: boolean): Oggetto => ({ thread: vistaThread(t, conTurni), model: t.model, cwd: t.cwd, runtimeWorkspaceRoots: [t.cwd], reasoningEffort: t.effort, ...impostazioniDiBase })

const NESSUNA_RISPOSTA = Symbol("nessuna risposta")

const METODI: Record<string, (params: Oggetto) => unknown> = {
  "finto/pid": () => ({ pid: process.pid }),
  "account/read": () => ({
    account: SCOLLEGATO ? null : { type: "chatgpt", email: "creator@example.com", planType: "plus", workspaceName: null },
    requiresOpenaiAuth: true,
    workspaceRouting: null,
  }),
  "account/rateLimits/read": () => ({ rateLimits: limiti() }),
  "model/list": () => ({ data: MODELLI, nextCursor: null }),
  "skills/extraRoots/set": (params) => {
    radiciDelleSkill.splice(0, radiciDelleSkill.length, ...(Array.isArray(params["extraRoots"]) ? params["extraRoots"].filter((r): r is string => typeof r === "string") : []))
    return {}
  },
  "skills/list": (params) => {
    const cartelle = Array.isArray(params["cwds"]) ? params["cwds"].filter((c): c is string => typeof c === "string") : []
    return { data: (cartelle.length > 0 ? cartelle : [process.cwd()]).map((cwd) => ({ cwd, errors: [], skills: radiciDelleSkill.flatMap(leggiSkill) })) }
  },
  "thread/start": (params) => {
    const t: Thread = {
      id: crypto.randomUUID(),
      cwd: testoDi(params, "cwd") ?? process.cwd(),
      model: testoDi(params, "model") ?? MODELLO_DI_BASE,
      effort: "high",
      name: null,
      creato: adesso(),
      aggiornato: adesso(),
      turni: [],
      token: 0,
      terminali: new Map(),
    }
    t.caricato = true
    thread.set(t.id, t)
    salva(t)
    setTimeout(() => notifica("thread/started", { thread: vistaThread(t, false) }), 0)
    return rispostaDelThread(t, false)
  },
  "thread/resume": (params) => {
    const t = trova(params)
    t.caricato = true
    return rispostaDelThread(t, params["excludeTurns"] !== true)
  },
  "thread/unsubscribe": (params) => {
    const t = trova(params)
    const stato = t.caricato ? "unsubscribed" : "notLoaded"
    t.caricato = false
    return { status: stato }
  },
  "thread/read": (params) => ({ thread: vistaThread(trova(params), params["includeTurns"] === true) }),
  "thread/list": (params) => {
    const filtro = typeof params["cwd"] === "string" ? [params["cwd"]] : Array.isArray(params["cwd"]) ? params["cwd"] : null
    const massimo = typeof params["limit"] === "number" ? params["limit"] : Number.POSITIVE_INFINITY
    const trovati = [...thread.values()].filter((t) => filtro === null || filtro.includes(t.cwd)).sort((a, b) => b.creato - a.creato)
    return { data: trovati.slice(0, massimo).map((t) => vistaThread(t, false)), readStates: null, nextCursor: null, backwardsCursor: null }
  },
  "thread/name/set": (params) => {
    const t = trova(params)
    t.name = testoDi(params, "name")
    salva(t)
    setTimeout(() => notifica("thread/name/updated", { threadId: t.id, threadName: t.name }), 0)
    return {}
  },
  "turn/start": (params) => {
    const t = caricato(params)
    if (t.giro) throw new ErroreRpc("the thread already has a turn in progress", -32600)
    const input = listaDi(params, "input")
    t.model = testoDi(params, "model") ?? t.model
    t.effort = testoDi(params, "effort") ?? t.effort
    const turno = avviaGiro(t, input, scegli(input))
    return { turn: vistaTurno(turno, [], "notLoaded") }
  },
  "turn/steer": (params) => {
    const t = trova(params)
    if (!t.giro || t.giro.turno.id !== testoDi(params, "expectedTurnId")) throw new ErroreRpc("no active turn to steer", -32600)
    const input = listaDi(params, "input")
    if (input.some((i) => /\bCADUTA\b/.test(testoDi(i, "text") ?? ""))) {
      void cadi()
      return NESSUNA_RISPOSTA
    }
    t.giro.steer(input)
    return { turnId: t.giro.turno.id }
  },
  "turn/interrupt": (params) => {
    const giro = trova(params).giro
    if (giro && giro.turno.id === testoDi(params, "turnId")) setTimeout(() => giro.ferma(), 0)
    return {}
  },
  "thread/backgroundTerminals/list": (params) => ({
    data: [...trova(params).terminali.entries()].map(([processId, { voce }]) => ({ itemId: testoDi(voce, "id"), processId, command: testoDi(voce, "command"), cwd: testoDi(voce, "cwd"), osPid: null, cpuPercent: null, rssKb: null })),
    nextCursor: null,
  }),
  "thread/backgroundTerminals/terminate": (params) => {
    const t = trova(params)
    const processo = testoDi(params, "processId") ?? ""
    const terminale = t.terminali.get(processo)
    if (!terminale) return { terminated: false }
    t.terminali.delete(processo)
    const voce: Oggetto = { ...terminale.voce, status: "failed", completedAtMs: Date.now() }
    const turno = t.turni.find((x) => x.id === terminale.turnId)
    const posto = turno?.items.findIndex((v) => v["id"] === voce["id"]) ?? -1
    if (turno && posto >= 0) turno.items[posto] = voce
    salva(t)
    setTimeout(() => notifica("item/completed", { item: voce, threadId: t.id, turnId: terminale.turnId, completedAtMs: voce.completedAtMs }), 0)
    return { terminated: true }
  },
  "review/start": (params) => {
    const t = caricato(params)
    if (t.giro) throw new ErroreRpc("the thread already has a turn in progress", -32600)
    const obiettivo = oggettoDi(params, "target")
    if (!["uncommittedChanges", "baseBranch", "commit", "custom"].includes(testoDi(obiettivo, "type") ?? "")) throw new ErroreRpc("invalid review target", -32600)
    const turno = avviaGiro(t, [], revisione)
    return { turn: vistaTurno(turno, [], "notLoaded"), reviewThreadId: t.id }
  },
  "finto/terminale": (params) => {
    const t: Thread = {
      id: crypto.randomUUID(),
      cwd: testoDi(params, "cwd") ?? process.cwd(),
      model: MODELLO_DI_BASE,
      effort: "high",
      name: testoDi(params, "name"),
      creato: adesso(),
      aggiornato: adesso(),
      turni: [],
      token: 0,
      terminali: new Map(),
    }
    const turno: Turno = { id: nuovoId(""), items: [], status: "completed", error: null, startedAt: adesso(), completedAt: adesso(), durationMs: 10 }
    const messaggio = { type: "userMessage", id: nuovoId(""), clientId: null, content: [{ type: "text", text: testoDi(params, "testo") ?? "Ciao", text_elements: [] }], startedAtMs: Date.now(), completedAtMs: Date.now() }
    turno.items.push(messaggio)
    t.turni.push(turno)
    thread.set(t.id, t)
    salva(t)
    return { threadId: t.id }
  },
  "thread/compact/start": (params) => {
    avviaGiro(trova(params), [], async (g) => {
      await compatta(g)
      g.uso()
    })
    return {}
  },
}

/** I metodi che il Codex vero accetta senza `params`: a tutti gli altri risponde con un errore se mancano. */
const SENZA_PARAMETRI = new Set(["account/rateLimits/read", "finto/pid"])

function rispondi(id: unknown, metodo: string, params: Oggetto, conParametri: boolean): void {
  try {
    if (!conParametri && !SENZA_PARAMETRI.has(metodo)) throw new ErroreRpc("Invalid request: missing field `params`", -32600)
    if (metodo !== "initialize" && !inizializzato) throw new ErroreRpc("Not initialized", -32002)
    if (metodo === "initialize" && inizializzato) throw new ErroreRpc("Already initialized", -32600)
    if (metodo === "initialize") {
      inizializzato = true
      const nome = testoDi(oggettoDi(params, "clientInfo"), "name") ?? "client"
      manda({ id, result: { userAgent: `${nome}/${VERSIONE} (Test 1.0; x86_64)`, codexHome: CASA_DICHIARATA, platformFamily: "unix", platformOs: "linux" } })
      return
    }
    const metodoNoto = METODI[metodo]
    if (!metodoNoto) throw new ErroreRpc(`Method not found: ${metodo}`, -32601)
    const risultato = metodoNoto(params)
    if (risultato !== NESSUNA_RISPOSTA) manda({ id, result: risultato })
  } catch (causa) {
    const errore = causa instanceof ErroreRpc ? causa : new ErroreRpc(causa instanceof Error ? causa.message : String(causa), -32603)
    manda({ id, error: { code: errore.codice, message: errore.message } })
  }
}

function ricevi(riga: string): void {
  let messaggio: unknown
  try {
    messaggio = JSON.parse(riga)
  } catch {
    messaggio = { nonJson: riga }
  }
  if (REGISTRO) appendFileSync(REGISTRO, `${JSON.stringify(messaggio)}\n`)
  if (!eOggetto(messaggio)) return
  const metodo = testoDi(messaggio, "method")
  const id = messaggio["id"]
  if (metodo !== null && id !== undefined) return rispondi(id, metodo, oggettoDi(messaggio, "params"), messaggio["params"] !== undefined)
  if (metodo === null && typeof id === "number") inAttesaDalClient.get(id)?.(messaggio)
}

carica()
for await (const riga of console) if (riga.trim()) ricevi(riga)
process.exit(0)
