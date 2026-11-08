// La chat con Mango Code al posto di Claude Code, contro un Mango Code finto: un server con le rotte e gli eventi del contratto
// di Mango Code (https://github.com/Federico-Anastasi/mango-code/blob/master/docs/INTEGRATION.md), che registra ciò che riceve e manda gli eventi che la prova gli dà.
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MangoCode, nomeDelloStrumento, risposteDi, righeDi } from "../src/chat/mangocode"
import type { FunzioneQuery, Sessioni } from "../src/chat/tipi"
import { VociSpente } from "../src/chat/vociSpente"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"

const cartelle: string[] = []
const serverFinti: { stop: (subito?: boolean) => void }[] = []
afterEach(async () => {
  await fermaTutti()
  serverFinti.splice(0).forEach((s) => s.stop(true))
  await Promise.all(cartelle.splice(0).map((c) => rm(c, { recursive: true, force: true })))
})

const SESSIONE = "ses_finta1"

class FintoMangoCode {
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

const SENZA_CLAUDE: FunzioneQuery = () => {
  throw new Error("in questa prova Claude Code non c'è")
}

/** Un Claude Code che dà solo l'elenco dei suoi modelli. */
const SOLO_I_MODELLI_DI_CLAUDE: FunzioneQuery = () =>
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
const SENZA_SESSIONI: Sessioni = { elenca: async () => [], leggi: async () => null, osserva: async () => ({ chiudi: () => undefined }) }

async function prepara(acceso = true, claude: FunzioneQuery = SENZA_CLAUDE): Promise<{ a: Ambiente; mc: FintoMangoCode; archivio: string; codice: string; dati: string }> {
  const radice = await mkdtemp(join(tmpdir(), "mango-code-prova-"))
  cartelle.push(radice)
  const dati = join(radice, "dati")
  const archivio = join(radice, "archivio-chat")
  const mc = new FintoMangoCode()
  if (acceso) await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, agent: mc.url, engine: mc.url, window: false }))
  const mangoCode = new MangoCode({ dati, archivio, adesso: () => new Date() })
  const a = await avviaAmbiente({ chat: { query: claude, sessioni: SENZA_SESSIONI, mangoCode } })
  const codice = a.codice
  await Bun.write(join(codice, "CLAUDE.md"), "# Il metodo\nLa parola del metodo è MANDARINO.\n")
  await Bun.write(join(codice, ".claude", "rules", "montaggio.md"), "regole")
  await Bun.write(join(codice, ".claude", "skills", "monta", "SKILL.md"), "---\nname: monta\ndescription: Edits a video.\n---\n")
  return { a, mc, archivio, codice, dati }
}

type Dettaglio = { stato: string; modello: string | null; messaggi: { ruolo: string; parti: Record<string, unknown>[] }[]; in_attesa: Record<string, unknown>[]; contesto_usato: { usati: number; totale: number | null } | null }
const dettaglio = (a: Ambiente, id: string) => chiama<Dettaglio>(a, "GET", `/api/chat/${id}`)

/** Una conversazione nuova su Mango Code, col primo messaggio già arrivato. */
async function nuova(a: Ambiente, mc: FintoMangoCode, testo = "Che parola dice il metodo?"): Promise<string> {
  const r = await chiama<{ id: string }>(a, "POST", "/api/chat", { testo, modello: "mango-code/toq" })
  expect(r.stato).toBe(201)
  await aspetta(() => mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
  return r.corpo.id
}

describe("Mango Code nella chat", () => {
  test("quando Mango Code si accende o si spegne, gli eventi lo dicono: l'elenco dei modelli è da rileggere", async () => {
    const { a, dati } = await prepara()
    const ascolto = await ascolta(a)
    const acceso = await Bun.file(join(dati, "service.json")).text()
    await rm(join(dati, "service.json"))
    await aspetta(() => ascolto.messaggi.filter((m) => (m as { tipo: string }).tipo === "modelli").length === 1)
    await Bun.write(join(dati, "service.json"), acceso)
    await aspetta(() => ascolto.messaggi.filter((m) => (m as { tipo: string }).tipo === "modelli").length === 2)
    ascolto.chiudi()
  })

  test("i suoi modelli si offrono accanto a quelli di Claude Code, solo se è acceso", async () => {
    const { a } = await prepara()
    const r = await chiama<{ id: string; nome: string; effort: string[] }[]>(a, "GET", "/api/chat/modelli")
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual([{ id: "mango-code/toq", nome: "Mango Code · TOQ-v1", descrizione: "Mango Code, sul computer · 64k di contesto · non vede le immagini", effort: [], reale: "mango-code/toq" }] as never)
    const spento = await prepara(false)
    const nonSiLegge = await chiama<{ errore: string }>(spento.a, "GET", "/api/chat/modelli")
    expect(nonSiLegge.stato).toBe(502)
    expect(nonSiLegge.corpo.errore).toBe("Claude Code ha dato un errore: in questa prova Claude Code non c'è")
  })

  test("una conversazione apre la sua sessione, passa lo strumento «video» e il metodo, e mostra testo e strumenti mentre arrivano", async () => {
    const { a, mc, codice } = await prepara()
    const id = await nuova(a, mc)
    const mcp = mc.di("/mcp").find((r) => r.metodo === "POST")
    expect(mcp?.corpo).toMatchObject({ name: "video", config: { type: "local", enabled: true, command: [process.execPath, "run", "--cwd", join(codice, "server"), "mcp"] } })
    expect(mcp?.directory).toBe(a.radice)
    const prompt = mc.di(`/session/${SESSIONE}/prompt_async`)[0]?.corpo as { parts: unknown[]; system: string; model: unknown }
    expect(prompt.parts).toEqual([{ type: "text", text: "Che parola dice il metodo?" }])
    expect(prompt.model).toEqual({ providerID: "mango", modelID: "toq" })
    // Il metodo arriva come cartella in più, dichiarata prima del primo messaggio: Mango Code ne legge CLAUDE.md, regole e skill.
    const cartelle = mc.di("/mango/extra-folders")
    expect(cartelle.map((r) => [r.metodo, r.directory, r.corpo])).toEqual([["PUT", a.radice, { folders: [codice] }]])
    expect(mc.richieste.indexOf(cartelle[0]!)).toBeLessThan(mc.richieste.findIndex((r) => r.percorso.endsWith("/prompt_async")))
    expect(mc.richieste.every((r) => r.agente === "Mango Animation")).toBe(true)
    expect(prompt.system).not.toContain("MANDARINO")
    expect(prompt.system).toContain("creator.lingua")
    expect(prompt.system).toContain(`You work in ${a.radice}`)
    expect(prompt.system).toContain(`${codice}: read it, never write there`)

    mc.evento("message.updated", { info: { id: "msg_a", sessionID: SESSIONE, role: "assistant" } })
    mc.evento("message.part.updated", { part: { id: "prt_1", messageID: "msg_a", sessionID: SESSIONE, type: "text", text: "" } })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "text", delta: "Guardo " })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "text", delta: "il video." })
    mc.evento("message.part.updated", { part: { id: "prt_2", messageID: "msg_a", sessionID: SESSIONE, type: "tool", callID: "call_1", tool: "video_foto", state: { status: "pending", input: {} } } })
    mc.evento("message.part.updated", { part: { id: "prt_2", messageID: "msg_a", sessionID: SESSIONE, type: "tool", callID: "call_1", tool: "video_foto", state: { status: "running", input: { slug: "prova" } } } })
    mc.evento("message.part.updated", { part: { id: "prt_2", messageID: "msg_a", sessionID: SESSIONE, type: "tool", callID: "call_1", tool: "video_foto", state: { status: "completed", input: { slug: "prova" }, output: "tre foto" } } })
    mc.evento("message.part.updated", { part: { id: "prt_3", messageID: "msg_a", sessionID: SESSIONE, type: "text", text: "MANDARINO", time: { start: 1, end: 2 } } })
    mc.evento("message.part.updated", { part: { id: "prt_9", messageID: "msg_altra", sessionID: "ses_altra", type: "text", text: "di un'altra", time: { end: 2 } } })
    mc.evento("session.idle", { sessionID: SESSIONE })
    // Mango Code dice «inattivo» anche più volte: il giro si chiude una volta sola.
    mc.evento("session.idle", { sessionID: SESSIONE })

    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
    await Bun.sleep(100)
    const d = (await dettaglio(a, id)).corpo
    expect(d.modello).toBe("mango-code/toq")
    expect(d.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude"])
    const parti = d.messaggi[1]?.parti ?? []
    expect(parti.map((p) => p["tipo"])).toEqual(["testo", "strumento", "testo", "fine"])
    expect(parti[0]).toEqual({ tipo: "testo", testo: "Guardo il video." })
    expect(parti[1]).toMatchObject({ tipo: "strumento", id: "call_1", nome: "mcp__video__foto", ingresso: { slug: "prova" }, esito: "tre foto" })
    expect(parti[2]).toEqual({ tipo: "testo", testo: "MANDARINO" })
    expect(parti[3]).toMatchObject({ tipo: "fine" })
    expect(parti[3]?.["errore"]).toBeUndefined()
  })

  test("un errore del giro arriva come errore della chat", async () => {
    const { a, mc } = await prepara()
    const id = await nuova(a, mc)
    mc.evento("session.error", { sessionID: SESSIONE, error: { name: "APIError", data: { message: "il modello non risponde" } } })
    mc.evento("session.idle", { sessionID: SESSIONE })
    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
    const fine = (await dettaglio(a, id)).corpo.messaggi.at(-1)?.parti.at(-1)
    expect(fine).toMatchObject({ tipo: "fine", errore: "Mango Code si è fermato: il modello non risponde." })
  })

  test("un messaggio che Mango Code non prende dice di riprovare, e il dettaglio tecnico va nel registro", async () => {
    const { a, mc } = await prepara()
    mc.rifiutaIlMessaggio = true
    const registro = spyOn(console, "error").mockImplementation(() => undefined)
    try {
      const id = await nuova(a, mc)
      await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "errore")
      const fine = (await dettaglio(a, id)).corpo.messaggi.at(-1)?.parti.at(-1)
      expect(fine).toMatchObject({ tipo: "fine", errore: "Mango Code non ha preso il messaggio: riprova." })
      const scritto = registro.mock.calls.map((c) => c.join(" ")).join(" | ")
      expect(scritto).toContain("500")
      expect(scritto).toContain("POST /session/")
      expect(scritto).toContain("errore interno del gestore")
    } finally {
      registro.mockRestore()
    }
  })

  test("un Mango Code senza le cartelle in più è troppo vecchio; un altro errore sulle cartelle dice di riprovare", async () => {
    const { mc, dati, archivio, codice } = await prepara()
    const registro = spyOn(console, "error").mockImplementation(() => undefined)
    try {
      for (const [stato, frase] of [
        [404, "Questa versione di Mango Code è troppo vecchia: aggiornala."],
        [500, "Mango Code non ha preso il metodo del prodotto: riprova."],
      ] as const) {
        mc.statoCartelle = stato
        const prompt = (async function* () {
          yield { type: "user" as const, message: { role: "user" as const, content: "ciao" }, parent_tool_use_id: null }
        })()
        const query = new MangoCode({ dati, archivio, adesso: () => new Date() }).query({ prompt, options: { cwd: archivio, additionalDirectories: [codice], sessionId: "00000000-0000-4000-8000-000000000002" } })
        await expect((async () => { for await (const _ of query) void _ })()).rejects.toThrow(new Error(frase))
        query.close()
      }
    } finally {
      registro.mockRestore()
    }
  })

  test("a Mango Code spento il messaggio dice di aprirlo, senza ripetere il collegamento né il comando", async () => {
    const { dati, archivio } = await prepara(false)
    const mangoCode = new MangoCode({ dati, archivio, adesso: () => new Date() })
    const prompt = (async function* () {
      yield { type: "user" as const, message: { role: "user" as const, content: "ciao" }, parent_tool_use_id: null }
    })()
    const query = mangoCode.query({ prompt, options: { cwd: archivio, sessionId: "00000000-0000-4000-8000-000000000001" } })
    await expect((async () => { for await (const _ of query) void _ })()).rejects.toThrow(new Error("Mango Code è spento: aprilo dalla sua icona e riscrivi il messaggio."))
    query.close()
  })

  test("un permesso di Mango Code nomina Mango Code, senza JSON grezzo", async () => {
    const { a, mc } = await prepara()
    const id = await nuova(a, mc)
    mc.evento("permission.asked", { id: "per_1", sessionID: SESSIONE, permission: "bash", patterns: ["ls *"] })
    await aspetta(async () => (await dettaglio(a, id)).corpo.in_attesa.length === 1)
    expect((await dettaglio(a, id)).corpo.in_attesa[0]).toMatchObject({ tipo: "permesso", strumento: "Bash", frase: "Mango Code vuole usare Bash" })
  })

  test("una domanda di Mango Code diventa i bottoni della chat, e la risposta torna a Mango Code", async () => {
    const { a, mc } = await prepara()
    const id = await nuova(a, mc)
    mc.evento("question.asked", { id: "que_1", sessionID: SESSIONE, questions: [{ question: "Rosso o blu?", header: "Colore", options: [{ label: "Rosso" }, { label: "Blu" }] }] })
    await aspetta(async () => (await dettaglio(a, id)).corpo.in_attesa.length === 1)
    expect((await dettaglio(a, id)).corpo.in_attesa[0]).toMatchObject({ id: "que_1", tipo: "domanda", domande: [{ domanda: "Rosso o blu?", intestazione: "Colore", opzioni: [{ etichetta: "Rosso" }, { etichetta: "Blu" }] }] })
    expect((await chiama(a, "POST", `/api/chat/${id}/risposte/que_1`, { scelta: { risposte: { "Rosso o blu?": "Blu" } } })).stato).toBe(200)
    await aspetta(() => mc.di("/question/que_1/reply").length === 1)
    expect(mc.di("/question/que_1/reply")[0]?.corpo).toEqual({ answers: [["Blu"]] })
  })

  test("«Ferma» ferma il giro di Mango Code; l'effort non c'è e il modello non passa a Claude a conversazione aperta", async () => {
    const { a, mc } = await prepara(true, SOLO_I_MODELLI_DI_CLAUDE)
    const id = await nuova(a, mc)
    expect((await chiama(a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    expect(mc.di(`/session/${SESSIONE}/abort`)).toHaveLength(1)
    const effort = await chiama<{ errore: string }>(a, "POST", `/api/chat/${id}/impostazioni`, { effort: "high" })
    expect(effort.stato).toBe(400)
    expect(effort.corpo.errore).toContain("non ha livelli di effort")
    const claude = await chiama<{ errore: string }>(a, "POST", `/api/chat/${id}/impostazioni`, { modello: "opus" })
    expect(claude.stato).toBe(400)
    expect(claude.corpo.errore).toBe("Questa conversazione è di Mango Code: per un modello di Claude aprine una nuova.")
  })

  test("«Chiudi» ferma il giro di Mango Code e chiude la conversazione, che resta nell'elenco", async () => {
    const { a, mc } = await prepara(true, SOLO_I_MODELLI_DI_CLAUDE)
    const id = await nuova(a, mc)
    const ascolto = await ascolta(a)
    const r = await chiama(a, "POST", `/api/chat/${id}/chiudi`)
    expect(r.stato).toBe(200)
    expect(mc.di(`/session/${SESSIONE}/abort`)).toHaveLength(1)
    await aspetta(() => ascolto.messaggi.some((m) => (m as { evento?: string }).evento === "chiusa"))
    const elenco = await chiama<{ id: string; attiva: boolean }[]>(a, "GET", "/api/chat")
    expect(elenco.corpo.find((v) => v.id === id)?.attiva).toBe(false)
    expect((await chiama(a, "POST", `/api/chat/${id}/chiudi`)).stato).toBe(200)
    ascolto.chiudi()
  })

  test("i messaggi con la barra non si rifiutano per Mango Code: arrivano com'è scritto", async () => {
    const { a, mc } = await prepara(true, SOLO_I_MODELLI_DI_CLAUDE)
    const r = await chiama<{ id: string }>(a, "POST", "/api/chat", { testo: "/model sonnet", modello: "mango-code/toq" })
    expect(r.stato).toBe(201)
    await aspetta(() => mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    expect((mc.di(`/session/${SESSIONE}/prompt_async`)[0]?.corpo as { parts: unknown[] }).parts).toEqual([{ type: "text", text: "/model sonnet" }])
    expect((await chiama(a, "POST", `/api/chat/${r.corpo.id}/messaggi`, { testo: "/clear" })).stato).toBe(202)
  })

  test("il contesto usato è il totale dell'ultimo passo finito, ragionamento compreso; un passo a zero e gli eventi ripetuti non lo cambiano", async () => {
    const { a, mc } = await prepara()
    const id = await nuova(a, mc)
    const ascolto = await ascolta(a)
    const annunci = () => (ascolto.messaggi as { tipo: string; id?: string; evento?: string; contesto_usato?: unknown }[]).filter((m) => m.tipo === "chat" && m.id === id && m.evento === "contesto_usato").map((m) => m.contesto_usato)
    // Il passo nasce a zero e finisce con i token (due volte identico): 12480 + 600 + 47 + 55358 + 0.
    mc.passo("msg_a", { input: 12_480, output: 600, reasoning: 47, read: 55_358, write: 0 })
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato?.usati === 68_485)
    expect((await dettaglio(a, id)).corpo.contesto_usato).toEqual({ usati: 68_485, totale: null })
    expect(annunci()).toEqual([{ usati: 68_485, totale: null }])
    // Il passo dopo di una chiamata di strumento ha il suo totale; uno fermato a metà resta a zero, con l'errore, e non svuota il contesto.
    mc.passo("msg_b", { input: 100, output: 900, reasoning: 0, read: 68_300, write: 0 })
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato?.usati === 69_300)
    mc.evento("message.updated", { info: { id: "msg_c", sessionID: SESSIONE, role: "assistant", error: { name: "MessageAbortedError" }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 0 } } })
    // Il messaggio del creator non ha una risposta da contare, e il passo senza `finish` nemmeno se porta numeri.
    mc.evento("message.updated", { info: { id: "msg_u", sessionID: SESSIONE, role: "user" } })
    mc.evento("message.updated", { info: { id: "msg_d", sessionID: SESSIONE, role: "assistant", tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 5, write: 0 }, total: 15 } } })
    mc.idle()
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato?.totale === 65_536)
    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
    expect((await dettaglio(a, id)).corpo.contesto_usato).toEqual({ usati: 69_300, totale: 65_536 })
    expect(annunci()).toEqual([{ usati: 68_485, totale: null }, { usati: 69_300, totale: null }, { usati: 69_300, totale: 65_536 }])
    ascolto.chiudi()
  })

  test("dopo il riassunto della conversazione il contesto non si sa finché non finisce il passo che riprende; il riassunto stesso non conta", async () => {
    const { a, mc } = await prepara()
    const id = await nuova(a, mc)
    const ascolto = await ascolta(a)
    mc.passo("msg_a", { input: 1_000, output: 500, reasoning: 0, read: 61_000, write: 0 })
    mc.idle()
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato?.totale === 65_536)
    // I token del riassunto sono quelli della richiesta che lo scrive: più grandi del contesto, e non lo cambiano.
    mc.riassunto("msg_s", 64_900)
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato === null)
    // Il passo che riprende dà il contesto nuovo, e la finestra del modello già misurata resta.
    mc.passo("msg_b", { input: 7_000, output: 300, reasoning: 20, read: 0, write: 1_680 }, "stop")
    await aspetta(async () => (await dettaglio(a, id)).corpo.contesto_usato?.usati === 9_000)
    expect((await dettaglio(a, id)).corpo.contesto_usato).toEqual({ usati: 9_000, totale: 65_536 })
    mc.idle()
    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
    expect((await dettaglio(a, id)).corpo.contesto_usato).toEqual({ usati: 9_000, totale: 65_536 })
    const annunci = (ascolto.messaggi as { tipo: string; id?: string; evento?: string; contesto_usato?: unknown }[]).filter((m) => m.tipo === "chat" && m.id === id && m.evento === "contesto_usato").map((m) => m.contesto_usato)
    expect(annunci).toEqual([{ usati: 62_500, totale: null }, { usati: 62_500, totale: 65_536 }, null, { usati: 9_000, totale: 65_536 }])
    // Il testo del riassunto è per il modello, non una risposta: come in Claude Code, in chat non compare.
    expect(JSON.stringify((await dettaglio(a, id)).corpo.messaggi)).not.toContain("RIASSUNTO")
    ascolto.chiudi()
  })

  test("dopo un riavvio la conversazione è nell'elenco, si rilegge da Mango Code e un messaggio nuovo continua la stessa sessione", async () => {
    const { a, mc, archivio, dati } = await prepara()
    const id = await nuova(a, mc, "Primo messaggio")
    mc.evento("session.idle", { sessionID: SESSIONE })
    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
    await a.ferma()

    const dopo = await avviaAmbiente({ chat: { query: SENZA_CLAUDE, sessioni: SENZA_SESSIONI, mangoCode: new MangoCode({ dati, archivio, adesso: () => new Date() }) } })
    const elenco = await chiama<{ id: string; titolo: string; attiva: boolean }[]>(dopo, "GET", "/api/chat")
    expect(elenco.corpo).toEqual([expect.objectContaining({ id, titolo: "Primo messaggio", attiva: false })])
    mc.messaggi = [
      { info: { id: "msg_u", role: "user", time: { created: 1 } }, parts: [{ type: "text", text: "Primo messaggio" }, { type: "text", text: "istruzioni", synthetic: true }] },
      { info: { id: "msg_a", role: "assistant", finish: "stop", time: { created: 2 }, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 3_000, write: 5 } } }, parts: [{ type: "text", text: "Ecco." }, { type: "tool", callID: "call_1", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "a.txt" } }] },
      // Un passo in corso o fermato è a zero e senza `finish`: non è un contesto vuoto.
      { info: { id: "msg_b", role: "assistant", time: { created: 3 }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [] },
    ]
    const d = (await dettaglio(dopo, id)).corpo
    expect(d.messaggi.map((m) => [m.ruolo, m.parti.map((p) => p["tipo"])])).toEqual([
      ["utente", ["testo"]],
      ["claude", ["testo", "strumento"]],
    ])
    expect(d.messaggi[1]?.parti[1]).toMatchObject({ nome: "Bash", ingresso: { command: "ls" }, esito: "a.txt" })
    expect(d.modello).toBe("mango-code/toq")
    expect(d.contesto_usato).toEqual({ usati: 3_130, totale: 65_536 })

    const prima = mc.di(`/session/${SESSIONE}/prompt_async`).length
    expect((await chiama(dopo, "POST", `/api/chat/${id}/messaggi`, { testo: "Secondo" })).stato).toBe(202)
    await aspetta(() => mc.di(`/session/${SESSIONE}/prompt_async`).length === prima + 1)
    expect(mc.di(`/session/${SESSIONE}/prompt_async`).at(-1)?.corpo).toMatchObject({ model: { providerID: "mango", modelID: "toq" } })
    expect(mc.di("/session").filter((r) => r.metodo === "POST")).toHaveLength(1)
    // Lo strumento «video» già collegato non si registra di nuovo: Mango Code lo romperebbe.
    expect(mc.di("/mcp").filter((r) => r.metodo === "POST")).toHaveLength(1)
  })

  test("a Mango Code spento una conversazione nuova coi suoi modelli non nasce", async () => {
    const { a, dati } = await prepara()
    await rm(join(dati, "service.json"))
    const r = await chiama<{ errore: string }>(a, "POST", "/api/chat", { testo: "Ciao", modello: "mango-code/toq" })
    expect(r.stato).toBe(502)
  })

  test("a Mango Code spento una sua conversazione dice di accenderlo", async () => {
    const { a, mc, archivio, dati } = await prepara()
    const id = await nuova(a, mc)
    await a.ferma()
    await rm(join(dati, "service.json"))
    const dopo = await avviaAmbiente({ chat: { query: SENZA_CLAUDE, sessioni: SENZA_SESSIONI, mangoCode: new MangoCode({ dati, archivio, adesso: () => new Date() }) } })
    const r = await chiama<{ errore: string }>(dopo, "GET", `/api/chat/${id}`)
    expect(r.stato).toBe(502)
    expect(r.corpo.errore).toBe("Questa conversazione è di Mango Code, che è spento: apri Mango Code per rileggerla.")
  })
})

describe("Mango Code acceso ma non pronto", () => {
  /**
   * Una conversazione di Mango Code già fatta, e il server che riparte con Mango Code acceso ma non pronto (il file c'è con `reason` al
   * posto di `agent` e `engine`).
   */
  async function riapri() {
    const { a, mc, archivio, dati } = await prepara()
    const id = await nuova(a, mc)
    await a.ferma()
    const acceso = await Bun.file(join(dati, "service.json")).text()
    const dopo = await avviaAmbiente({ chat: { query: SOLO_I_MODELLI_DI_CLAUDE, sessioni: SENZA_SESSIONI, mangoCode: new MangoCode({ dati, archivio, adesso: () => new Date() }) } })
    await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, reason: "Il modello non è ancora stato scelto.", window: true }))
    return { dopo, id, mc, ripristina: () => Bun.write(join(dati, "service.json"), acceso) }
  }

  test("un messaggio che parte dice di guardare la finestra di Mango Code, senza dirlo spento né toccarlo", async () => {
    const { mc, dati, archivio } = await prepara()
    await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, reason: "Il modello non è ancora stato scelto.", window: true }))
    const prompt = (async function* () {
      yield { type: "user" as const, message: { role: "user" as const, content: "ciao" }, parent_tool_use_id: null }
    })()
    const query = new MangoCode({ dati, archivio, adesso: () => new Date() }).query({ prompt, options: { cwd: archivio, sessionId: "00000000-0000-4000-8000-000000000003" } })
    await expect((async () => { for await (const _ of query) void _ })()).rejects.toThrow(new Error("Mango Code si sta preparando o non è pronto: guarda la sua finestra e riscrivi il messaggio."))
    query.close()
    expect(mc.richieste).toEqual([])
  })

  test("i suoi modelli non si offrono; rileggere una sua conversazione dice che non è pronto, e quando lo diventa si rilegge", async () => {
    const { dopo, id, ripristina } = await riapri()
    const modelli = await chiama<{ id: string }[]>(dopo, "GET", "/api/chat/modelli")
    expect(modelli.corpo.map((m) => m.id)).toEqual(["opus"])
    const r = await chiama<{ errore: string }>(dopo, "GET", `/api/chat/${id}`)
    expect(r.stato).toBe(502)
    expect(r.corpo.errore).toBe("Questa conversazione è di Mango Code, che non è ancora pronto: guarda la sua finestra e riprova.")
    await ripristina()
    expect((await chiama(dopo, "GET", `/api/chat/${id}`)).stato).toBe(200)
  })
})

describe("cosa entra nel prompt di Mango Code", () => {
  const file = (a: Ambiente) => join(a.radice, ".mango", "settings.json")
  const letto = async (a: Ambiente) => JSON.parse(await Bun.file(file(a)).text()) as unknown
  /** Chiude il giro della conversazione: la prova non finisce mentre il server scrive ancora il suo registro. */
  const finisci = async (a: Ambiente, mc: FintoMangoCode, id: string) => {
    mc.idle()
    await aspetta(async () => (await dettaglio(a, id)).corpo.stato === "pronta")
  }

  test("all'avvio di una conversazione spegne il browser e i documenti per la cartella di lavoro, prima del primo messaggio; la ricerca web resta", async () => {
    const { a, mc, archivio } = await prepara()
    await finisci(a, mc, await nuova(a, mc))
    expect(await letto(a)).toEqual({ prompt: { mcp: { "chrome-devtools": false, documenti: false } } })
    expect(await Bun.file(join(archivio, ".chat", "mango-code-voci-spente.json")).json()).toEqual(["chrome-devtools", "documenti"])
    // Non passa dalla rotta delle impostazioni, che alle app dà 403.
    expect(mc.richieste.some((r) => r.percorso === "/mango/settings")).toBe(false)
  })

  test("le altre voci del file restano com'erano; una voce già scritta, vera o falsa, è del creator", async () => {
    const { a, mc } = await prepara()
    await Bun.write(file(a), JSON.stringify({ altro: 1, prompt: { tools: { webfetch: false }, mcp: { documenti: true, "web-search": false }, skills: { monta: false } } }))
    await finisci(a, mc, await nuova(a, mc))
    expect(await letto(a)).toEqual({ altro: 1, prompt: { tools: { webfetch: false }, mcp: { documenti: true, "web-search": false, "chrome-devtools": false }, skills: { monta: false } } })
  })

  test("se il creator riaccende una voce dalla pagina di Mango Code (che la toglie dal file) le conversazioni dopo non la rispengono", async () => {
    const { a, mc } = await prepara()
    await finisci(a, mc, await nuova(a, mc))
    // «Solo questa cartella» su una voce accesa per la pagina vuol dire togliere la voce dal file.
    await Bun.write(file(a), JSON.stringify({ prompt: { mcp: { "chrome-devtools": false } } }))
    const r = await chiama<{ id: string }>(a, "POST", "/api/chat", { testo: "Un'altra", modello: "mango-code/toq" })
    expect(r.stato).toBe(201)
    await aspetta(() => mc.di(`/session/${SESSIONE}/prompt_async`).length >= 2)
    await finisci(a, mc, r.corpo.id)
    expect(await letto(a)).toEqual({ prompt: { mcp: { "chrome-devtools": false } } })
  })

  test("un file che non si legge non si riscrive: la conversazione dice di correggerlo", async () => {
    const { a, mc } = await prepara()
    await Bun.write(file(a), "{ non è JSON")
    const r = await chiama<{ id: string }>(a, "POST", "/api/chat", { testo: "Ciao", modello: "mango-code/toq" })
    await aspetta(async () => (await dettaglio(a, r.corpo.id)).corpo.stato === "errore")
    const fine = (await dettaglio(a, r.corpo.id)).corpo.messaggi.at(-1)?.parti.at(-1)
    expect(fine).toMatchObject({ tipo: "fine", errore: "Il file .mango/settings.json della cartella di lavoro non si legge: correggilo o toglilo, poi riscrivi il messaggio." })
    expect(await Bun.file(file(a)).text()).toBe("{ non è JSON")
    expect(mc.di(`/session/${SESSIONE}/prompt_async`)).toHaveLength(0)
  })

  test("più avvii insieme scrivono il file una volta alla volta, senza perdere voci", async () => {
    const radice = await mkdtemp(join(tmpdir(), "voci-spente-"))
    cartelle.push(radice)
    const voci = new VociSpente(join(radice, "archivio"))
    await Promise.all([1, 2, 3].map(() => voci.spegni(radice)))
    expect(await Bun.file(join(radice, ".mango", "settings.json")).json()).toEqual({ prompt: { mcp: { "chrome-devtools": false, documenti: false } } })
  })
})

describe("le forme", () => {
  test("i nomi degli strumenti come li scrive Claude Code", () => {
    expect(nomeDelloStrumento("bash")).toBe("Bash")
    expect(nomeDelloStrumento("video_lavoro")).toBe("mcp__video__lavoro")
    expect(nomeDelloStrumento("chrome_navigate")).toBe("chrome_navigate")
  })

  test("le risposte della chat nella forma di Mango Code", () => {
    const domande = [
      { question: "A?", options: [{ label: "uno" }, { label: "due" }], multiple: true },
      { question: "B?", options: [{ label: "sì" }] },
    ]
    expect(risposteDi(domande, { "A?": "uno, due", "B?": "forse" })).toEqual([["uno", "due"], ["forse"]])
  })

  test("un messaggio di Mango Code come righe del file di Claude Code", () => {
    expect(righeDi({ info: { id: "m1", role: "user", time: { created: 0 } }, parts: [{ type: "text", text: "ciao" }] })).toEqual([{ type: "user", uuid: "m1", timestamp: "1970-01-01T00:00:00.000Z", message: { role: "user", content: "ciao" } }])
    const righe = righeDi({ info: { id: "m2", role: "assistant" }, parts: [{ type: "reasoning", text: "penso" }, { type: "tool", callID: "c1", tool: "read", state: { status: "error", input: {}, error: "manca" } }] })
    expect(righe.map((r) => r.type)).toEqual(["assistant", "user"])
    expect(righe[1]?.message).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "manca", is_error: true }] })
    const passo = (info: object) => righeDi({ info: { id: "m3", role: "assistant", tokens: { input: 1, output: 2, reasoning: 5, cache: { read: 3, write: 4 } }, ...info }, parts: [{ type: "text", text: "ok" }] })
    expect(passo({ finish: "stop" })[0]?.message).toEqual({ role: "assistant", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 7, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } })
    // Senza `finish` il passo non è finito; il riassunto ha i token della sua richiesta: nessuno dei due dice il contesto.
    expect(passo({})[0]?.message).toEqual({ role: "assistant", content: [{ type: "text", text: "ok" }] })
    const riassunto = passo({ finish: "stop", mode: "compaction", summary: true })
    expect(riassunto.map((r) => [r.type, r.subtype])).toEqual([["system", "compact_boundary"]])
  })

  test("rileggendo una conversazione appena riassunta il contesto non si sa; col passo dopo sì", async () => {
    const { a, mc, archivio, dati } = await prepara()
    const id = await nuova(a, mc)
    await a.ferma()
    const passo = { info: { id: "msg_a", role: "assistant", finish: "stop", time: { created: 2 }, tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 3_000, write: 0 } } }, parts: [{ type: "text", text: "Ecco." }] }
    const riassunto = { info: { id: "msg_s", role: "assistant", mode: "compaction", summary: true, finish: "stop", time: { created: 3 }, tokens: { input: 60_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ type: "text", text: "Riassunto." }] }
    const riprende = { info: { id: "msg_b", role: "assistant", finish: "stop", time: { created: 4 }, tokens: { input: 900, output: 30, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ type: "text", text: "Riprendo." }] }
    const riapri = () => avviaAmbiente({ chat: { query: SENZA_CLAUDE, sessioni: SENZA_SESSIONI, mangoCode: new MangoCode({ dati, archivio, adesso: () => new Date() }) } })
    mc.messaggi = [passo, riassunto]
    const prima = await riapri()
    expect((await dettaglio(prima, id)).corpo.contesto_usato).toBeNull()
    expect(JSON.stringify((await dettaglio(prima, id)).corpo.messaggi)).not.toContain("Riassunto.")
    await prima.ferma()
    mc.messaggi = [passo, riassunto, riprende]
    const dopo = await riapri()
    expect((await dettaglio(dopo, id)).corpo.contesto_usato).toEqual({ usati: 930, totale: 65_536 })
  })
})

