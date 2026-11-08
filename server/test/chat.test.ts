// La chat contro un Claude Code finto: la stessa `query` e gli stessi messaggi dell'SDK, emessi dalla prova.
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import type { ModelInfo, Options, PermissionResult, SDKMessage, SDKUserMessage, SlashCommand } from "@anthropic-ai/claude-agent-sdk"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { delimiter, join } from "node:path"
import { tmpdir } from "node:os"
import { testoVisibile } from "../src/chat/allegati"
import { MangoCode } from "../src/chat/mangocode"
import type { EventoChat, FunzioneQuery, MessaggioSessione, MisuraDelContesto, QueryChat, Sessioni, VoceSessione } from "../src/chat/tipi"
import { aspetta, ascolta, avviaAmbiente, chiama, fermaTutti, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

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

class FintaQuery implements QueryChat {
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

class Finto {
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

class FinteSessioni implements Sessioni {
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

const init = { type: "system", subtype: "init", session_id: "x" }
const risultato = (extra: object = {}) => ({ type: "result", subtype: "success", is_error: false, duration_ms: 1200, total_cost_usd: 0.05, result: "", queued_turn_count: 0, ...extra })

/** Un testo che arriva a pezzi, come con `includePartialMessages`. */
const testoAPezzi = (id: string, pezzi: string[]): object[] => [
  { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id } } },
  { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
  ...pezzi.map((testo) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: testo } } })),
  { type: "assistant", parent_tool_use_id: null, message: { id, content: [{ type: "text", text: pezzi.join("") }] } },
  { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: 0 } },
]

const esitoDi = (id: string, content: unknown, is_error = false): object => ({
  type: "user",
  parent_tool_use_id: null,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error }] },
})

interface Avvio {
  a: Ambiente
  finto: Finto
  sessioni: FinteSessioni
}

async function avvia(semina?: Parameters<typeof avviaAmbiente>[1]): Promise<Avvio> {
  const finto = new Finto()
  const sessioni = new FinteSessioni()
  const senzaMangoCode = new MangoCode({ dati: join(tmpdir(), "mango-code-che-non-c-e"), archivio: join(tmpdir(), "mango-code-che-non-c-e"), adesso: () => new Date() })
  const a = await avviaAmbiente({ chat: { query: finto.query, sessioni, mangoCode: senzaMangoCode } }, semina)
  return { a, finto, sessioni }
}

async function nuova(c: Avvio, testo = "Ciao", extra: object = {}): Promise<{ id: string; q: FintaQuery }> {
  const r = await chiama<{ id: string }>(c.a, "POST", "/api/chat", { testo, ...extra })
  expect(r.stato).toBe(201)
  const q = await aspetta(() => c.finto.queries.at(-1))
  await aspetta(() => q.ricevuti.length >= 1)
  return { id: r.corpo.id, q }
}

const dettaglio = (c: Avvio, id: string) => chiama<{ id: string; lavora_da?: string | null; lavoro: { ms: number; da: string | null }; titolo: string; attiva: boolean; stato: string; modello: string | null; effort: string | null; messaggi: { id: string; ruolo: string; quando: string; parti: Record<string, unknown>[] }[]; in_attesa: Record<string, unknown>[]; task: unknown[]; contesto_usato: { usati: number; totale: number | null } | null }>(c.a, "GET", `/api/chat/${id}`)

const eventiChat = (ascolto: { messaggi: unknown[] }, id: string): EventoChat[] => (ascolto.messaggi as EventoChat[]).filter((m) => m.tipo === "chat" && m.id === id)

const ID_FINTO = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const ISTANTI = { iniziato: expect.any(String), finito: expect.any(String) }

describe("una conversazione nuova", () => {
  test("parte con il messaggio del creator, il testo arriva a pezzi e il giro finisce con la sua Parte", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c, "Rispondi solo: pronto")

    expect(q.opzioni.cwd).toBe(c.a.radice)
    expect(q.opzioni.additionalDirectories).toEqual([c.a.codice])
    expect(q.opzioni.env).toMatchObject({ CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1", MANGO_ANIMATION_LAVORO: c.a.radice })
    expect(q.opzioni.env?.["PYTHONPATH"]?.split(delimiter)[0]).toBe(c.a.codice)
    expect(q.opzioni.settingSources).toEqual(["user", "project", "local"])
    expect(q.opzioni.includePartialMessages).toBe(true)
    expect(q.opzioni.permissionMode).toBe("bypassPermissions")
    expect(q.opzioni.extraArgs).toEqual({ chrome: null })
    expect(q.opzioni.systemPrompt).toMatchObject({ preset: "claude_code", append: expect.stringContaining("creator.lingua") })
    expect(q.opzioni.model).toBeUndefined()
    expect(q.opzioni.effort).toBeUndefined()
    expect(q.opzioni.sessionId).toBe(id)
    expect(q.opzioni.resume).toBeUndefined()
    expect(q.ricevuti[0]?.message.content).toBe("Rispondi solo: pronto")

    let d = await dettaglio(c, id)
    expect(d.corpo).toMatchObject({ id, titolo: "Rispondi solo: pronto", attiva: true, stato: "lavora", in_attesa: [] })
    expect(d.corpo.messaggi.map((m) => [m.ruolo, m.parti])).toEqual([["utente", [{ tipo: "testo", testo: "Rispondi solo: pronto" }]]])

    q.emetti(init, ...testoAPezzi("msg_1", ["pro", "nto"]), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")

    d = await dettaglio(c, id)
    expect(d.corpo.messaggi).toHaveLength(2)
    expect(d.corpo.messaggi[1]?.ruolo).toBe("claude")
    expect(d.corpo.messaggi[1]?.parti).toEqual([
      { tipo: "testo", testo: "pronto" },
      { tipo: "fine", costo: 0.05, durata_ms: 1200, lavoro_ms: expect.any(Number) },
    ])

    const eventi = eventiChat(ascolto, id)
    await aspetta(() => eventiChat(ascolto, id).some((e) => e.evento === "stato" && e.stato === "pronta"))
    const idDiClaude = eventi.flatMap((e) => (e.evento === "messaggio" && e.messaggio.ruolo === "claude" ? [e.messaggio.id] : []))[0]
    const parti = eventi.flatMap((e) => (e.evento === "parte" && e.messaggio === idDiClaude && e.indice === 0 ? [e.parte] : []))
    expect(parti).toEqual([
      { tipo: "testo", testo: "pro" },
      { tipo: "testo", testo: "pronto" },
    ])
    expect(eventi.filter((e) => e.evento === "messaggio").map((e) => (e.evento === "messaggio" ? e.messaggio.ruolo : ""))).toEqual(["utente", "claude"])
    expect(eventi.filter((e) => e.evento === "stato").map((e) => (e.evento === "stato" ? e.stato : ""))).toEqual(["lavora", "pronta"])
    ascolto.chiudi()
  })

  test("un secondo messaggio mentre Claude lavora si accoda, e il giro con altri in coda non è finito", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, ...testoAPezzi("msg_1", ["uno"]))
    const r = await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Anzi, fai un'altra cosa" })
    expect(r.stato).toBe(202)
    await aspetta(() => q.ricevuti.length === 2)
    expect(c.finto.queries).toHaveLength(1)

    q.emetti(risultato({ queued_turn_count: 1 }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi.some((m) => m.parti.some((p) => p["tipo"] === "fine")))
    expect((await dettaglio(c, id)).corpo.stato).toBe("lavora")

    q.emetti(...testoAPezzi("msg_2", ["due"]), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    // I messaggi stanno nell'ordine in cui sono avvenuti: ciò che Claude ha scritto dopo il secondo messaggio del creator sta sotto di lui.
    expect((await dettaglio(c, id)).corpo.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude", "utente", "claude"])
  })

  test("senza testo e senza allegati il messaggio è vuoto", async () => {
    const c = await avvia()
    const r = await chiama<{ errore: string }>(c.a, "POST", "/api/chat", { testo: "   " })
    expect(r.stato).toBe(400)
    expect(r.corpo.errore).toContain("vuoto")
  })
})

describe("gli strumenti", () => {
  test("uno strumento col suo esito testuale, l'ingresso che arriva a pezzi, un errore e uno con un'immagine", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "Quanti video ci sono?")
    const strumento = (indice: number, idStrumento: string, nome: string, json: string[]) => [
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_start", index: indice, content_block: { type: "tool_use", id: idStrumento, name: nome, input: {} } } },
      ...json.map((pezzo) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", index: indice, delta: { type: "input_json_delta", partial_json: pezzo } } })),
      { type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_stop", index: indice } },
    ]
    q.emetti(
      init,
      { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start", message: { id: "msg_1" } } },
      ...strumento(0, "toolu_1", "mcp__video__video_elenco", []),
      ...strumento(1, "toolu_2", "Bash", ['{"command":', '"ls /x"}']),
      ...strumento(2, "toolu_3", "mcp__video__foto", ['{"slug":"a","secondi":[3]}']),
      // il messaggio completo arriva dopo i pezzi e non li raddoppia
      { type: "assistant", parent_tool_use_id: null, message: { id: "msg_1", content: [{ type: "tool_use", id: "toolu_1", name: "mcp__video__video_elenco", input: {} }] } },
      esitoDi("toolu_1", [{ type: "text", text: '[{"slug":"a"}]' }]),
      esitoDi("toolu_2", "ls: cannot access '/x'", true),
      esitoDi("toolu_3", [
        { type: "text", text: "Secondo 3" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
      ]),
    )
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi[1]?.parti.length === 3 && (await dettaglio(c, id)).corpo.messaggi[1]?.parti.every((p) => p["esito"] !== undefined || p["errore"] !== undefined))

    const parti = (await dettaglio(c, id)).corpo.messaggi[1]?.parti
    expect(parti).toEqual([
      { tipo: "strumento", id: "toolu_1", nome: "mcp__video__video_elenco", ingresso: {}, esito: '[{"slug":"a"}]', ...ISTANTI },
      { tipo: "strumento", id: "toolu_2", nome: "Bash", ingresso: { command: "ls /x" }, errore: "ls: cannot access '/x'", ...ISTANTI },
      { tipo: "strumento", id: "toolu_3", nome: "mcp__video__foto", ingresso: { slug: "a", secondi: [3] }, esito: "Secondo 3", immagini: [{ media_type: "image/jpeg", data: "AAAA" }], ...ISTANTI },
    ])
  })

  test("un messaggio completo senza pezzi si traduce lo stesso, e un sottoagente non entra nella chat", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(
      init,
      { type: "assistant", parent_tool_use_id: "toolu_agente", message: { id: "sub_1", content: [{ type: "text", text: "dentro il sottoagente" }] } },
      { type: "assistant", parent_tool_use_id: null, message: { id: "msg_9", content: [{ type: "thinking", thinking: "" }, { type: "thinking", thinking: "ragiono" }, { type: "text", text: "Ecco" }, { type: "tool_use", id: "toolu_9", name: "Read", input: { file_path: "a" } }] } },
    )
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi[1]?.parti.length === 3)
    expect((await dettaglio(c, id)).corpo.messaggi[1]?.parti.map((p) => p["tipo"])).toEqual(["pensiero", "testo", "strumento"])
  })

  test("l'esito enorme di uno strumento si accorcia", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, { type: "assistant", parent_tool_use_id: null, message: { id: "m", content: [{ type: "tool_use", id: "t", name: "Bash", input: {} }] } }, esitoDi("t", "x".repeat(50_000)))
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi[1]?.parti[0]?.["esito"])
    const esito = String((await dettaglio(c, id)).corpo.messaggi[1]?.parti[0]?.["esito"])
    expect(esito.length).toBeLessThan(21_000)
    expect(esito).toContain("altri 30000 caratteri non mostrati")
  })
})

describe("il contesto usato", () => {
  const risposta = (id: string, usage: object, extra: object = {}) => ({ type: "assistant", parent_tool_use_id: null, message: { id, content: [{ type: "text", text: "ok" }], usage }, ...extra })
  const delta = (usage: object) => ({ type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage } })

  test("ogni risposta dice quanto contesto occupa; a fine giro Claude Code dà la misura con la finestra", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toBeNull()
    q.misura = { totalTokens: 52_000, rawMaxTokens: 200_000 }
    q.emetti(init, risposta("msg_1", { input_tokens: 10, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 990, output_tokens: 100 }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.usati === 41_100)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 41_100, totale: null })
    // Un sottoagente ha un contesto suo: non conta.
    q.emetti(risposta("msg_s", { input_tokens: 900_000, output_tokens: 1 }, { parent_tool_use_id: "toolu_x" }), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.totale === 200_000)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 52_000, totale: 200_000 })
    expect(q.misureChieste).toEqual([{ detail: "summary" }])
    // Dopo la misura, una risposta nuova cambia i token e tiene la finestra.
    q.emetti(risposta("msg_2", { input_tokens: 60_000, output_tokens: 500 }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.usati === 60_500)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 60_500, totale: 200_000 })
    const annunci = eventiChat(ascolto, id).flatMap((e) => (e.evento === "contesto_usato" ? [e.contesto_usato] : []))
    expect(annunci).toEqual([
      { usati: 41_100, totale: null },
      { usati: 52_000, totale: 200_000 },
      { usati: 60_500, totale: 200_000 },
    ])
    ascolto.chiudi()
  })

  test("anche i pezzi in arrivo portano il contesto; un conto senza i token letti no; se la misura non arriva resta l'ultimo conto", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.rifiutaLaMisura = "non risponde"
    q.emetti(init, delta({ input_tokens: 3_000, output_tokens: 20 }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.usati === 3_020)
    q.emetti(delta({ output_tokens: 50 }), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    await aspetta(() => q.misureChieste.length === 1)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 3_020, totale: null })
  })
})

describe("il contesto usato, dopo il riassunto della conversazione", () => {
  test("il valore vecchio non vale più finché non arriva quello della risposta dopo, e la finestra misurata resta", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    q.misura = { totalTokens: 190_000, rawMaxTokens: 200_000 }
    q.emetti(init, { type: "assistant", parent_tool_use_id: null, message: { id: "msg_1", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 189_000, output_tokens: 1_000 } } }, risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.totale === 200_000)
    q.emetti({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 190_000 } })
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato === null)
    q.emetti({ type: "assistant", parent_tool_use_id: null, message: { id: "msg_2", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 8_000, output_tokens: 400 } } })
    await aspetta(async () => (await dettaglio(c, id)).corpo.contesto_usato?.usati === 8_400)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 8_400, totale: 200_000 })
    expect(eventiChat(ascolto, id).flatMap((e) => (e.evento === "contesto_usato" ? [e.contesto_usato] : []))).toEqual([{ usati: 190_000, totale: null }, { usati: 190_000, totale: 200_000 }, null, { usati: 8_400, totale: 200_000 }])
    ascolto.chiudi()
  })
})

describe("il contesto usato, quando la misura non dice niente", () => {
  test("una misura a zero non cancella l'ultimo conto e non dà una finestra", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, { type: "stream_event", parent_tool_use_id: null, event: { type: "message_delta", usage: { input_tokens: 3_000, output_tokens: 20 } } }, risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    await aspetta(() => q.misureChieste.length === 1)
    await Bun.sleep(50)
    expect((await dettaglio(c, id)).corpo.contesto_usato).toEqual({ usati: 3_020, totale: null })
  })
})

describe("i tempi", () => {
  const strumentoAperto = (id: string, nome = "Bash") => ({ type: "assistant", parent_tool_use_id: null, message: { id: `m_${id}`, content: [{ type: "tool_use", id, name: nome, input: { command: "bun test" } }] } })
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

  test("uno strumento porta l'istante in cui è partito e quello in cui ha finito; finché lavora ha solo il primo", async () => {
    const c = await avvia()
    const prima = Date.now()
    const { id, q } = await nuova(c)
    q.emetti(init, strumentoAperto("t1"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi[1]?.parti.length === 1)
    let parte = (await dettaglio(c, id)).corpo.messaggi[1]?.parti[0]
    expect(String(parte?.["iniziato"])).toMatch(iso)
    expect(Date.parse(String(parte?.["iniziato"]))).toBeGreaterThanOrEqual(prima)
    expect(parte?.["finito"]).toBeUndefined()

    q.emetti(esitoDi("t1", "ok"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi[1]?.parti[0]?.["esito"] === "ok")
    parte = (await dettaglio(c, id)).corpo.messaggi[1]?.parti[0]
    expect(Date.parse(String(parte?.["finito"]))).toBeGreaterThanOrEqual(Date.parse(String(parte?.["iniziato"])))
  })

  test("lo stato «lavora» dice da quando: lo dà l'evento e la lettura, resta lo stesso fino alla fine del giro e poi sparisce", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const prima = Date.now()
    const { id, q } = await nuova(c)
    let d = await dettaglio(c, id)
    expect(String(d.corpo["lavora_da"])).toMatch(iso)
    expect(Date.parse(String(d.corpo["lavora_da"]))).toBeGreaterThanOrEqual(prima)
    const da = d.corpo["lavora_da"]

    q.emetti(init, strumentoAperto("t1"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.messaggi.length === 2)
    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Anzi" })
    d = await dettaglio(c, id)
    expect(d.corpo["lavora_da"]).toBe(da)

    q.emetti(esitoDi("t1", "ok"), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo["lavora_da"]).toBeNull()

    const stati = eventiChat(ascolto, id).flatMap((e) => (e.evento === "stato" ? [e] : []))
    expect(stati[0]).toMatchObject({ stato: "lavora", da })
    expect(stati.at(-1)).toEqual({ tipo: "chat", id, evento: "stato", stato: "pronta", lavoro: { ms: expect.any(Number), da: null } })
    ascolto.chiudi()
  })
})

describe("i permessi e le domande", () => {
  test("un permesso senza un campo che si riconosce dice solo cosa vuole usare, senza l'ingresso grezzo", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init)
    void q.chiediPermesso("Strano", { qualcosa: { di: "annidato" }, altro: 3 }, "toolu_s1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    const richiesta = (await dettaglio(c, id)).corpo.in_attesa[0]
    expect(richiesta?.["frase"]).toBe("Vuole usare Strano")
    expect(richiesta?.["ingresso"]).toEqual({ qualcosa: { di: "annidato" }, altro: 3 })
  })

  test("Consenti, Consenti sempre e No con il motivo", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    q.emetti(init)

    const primo = q.chiediPermesso("Bash", { command: "rm prova.txt" }, "toolu_p1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    let d = await dettaglio(c, id)
    expect(d.corpo.stato).toBe("aspetta")
    expect(d.corpo.in_attesa).toEqual([{ id: "toolu_p1", tipo: "permesso", strumento: "Bash", ingresso: { command: "rm prova.txt" }, frase: "Vuole usare Bash: rm prova.txt" }])
    expect(eventiChat(ascolto, id).some((e) => e.evento === "richiesta" && e.richiesta.id === "toolu_p1")).toBe(true)

    expect((await chiama(c.a, "POST", `/api/chat/${id}/risposte/toolu_p1`, { scelta: "consenti" })).stato).toBe(200)
    expect(await primo).toEqual({ behavior: "allow", updatedInput: { command: "rm prova.txt" } })
    d = await dettaglio(c, id)
    expect(d.corpo.in_attesa).toEqual([])
    expect(d.corpo.stato).toBe("lavora")
    await aspetta(() => eventiChat(ascolto, id).some((e) => e.evento === "risposta" && e.richiesta === "toolu_p1"))

    // «Sempre» vale per lo strumento, non per gli altri
    const secondo = q.chiediPermesso("Bash", { command: "ls" }, "toolu_p2")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    await chiama(c.a, "POST", `/api/chat/${id}/risposte/toolu_p2`, { scelta: "sempre" })
    expect(await secondo).toMatchObject({ behavior: "allow" })
    expect(await q.chiediPermesso("Bash", { command: "pwd" }, "toolu_p3")).toEqual({ behavior: "allow", updatedInput: { command: "pwd" } })
    expect((await dettaglio(c, id)).corpo.in_attesa).toEqual([])
    const altro = q.chiediPermesso("Write", { file_path: "a.txt" }, "toolu_p4")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    expect((await dettaglio(c, id)).corpo.in_attesa[0]?.["frase"]).toBe("Vuole usare Write: a.txt")

    // «No» dice a Claude di no, e perché
    await chiama(c.a, "POST", `/api/chat/${id}/risposte/toolu_p4`, { scelta: "no", motivo: "meglio di no" })
    const negato = await altro
    expect(negato.behavior).toBe("deny")
    expect(negato.behavior === "deny" && negato.message).toBe("Il permesso di usare Write non è stato dato: meglio di no")
    ascolto.chiudi()
  })

  test("le risposte sbagliate non toccano la richiesta, che resta in attesa", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    const attesa = q.chiediPermesso("Bash", { command: "ls" }, "toolu_p1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    const provale = (corpo: unknown) => chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/risposte/toolu_p1`, corpo)

    expect((await provale({ scelta: "forse" })).corpo.errore).toContain("«consenti», «sempre» o «no»")
    expect((await provale({ scelta: "consenti", motivo: "x" })).corpo.errore).toContain("vale solo per «no»")
    expect((await provale({ scelta: "no", altro: 1 })).stato).toBe(400)
    expect((await provale({})).stato).toBe(400)
    expect((await dettaglio(c, id)).corpo.in_attesa).toHaveLength(1)

    await provale({ scelta: "no" })
    const negato = await attesa
    expect(negato.behavior === "deny" && negato.message).toBe("Il permesso di usare Bash non è stato dato.")
    const ancora = await provale({ scelta: "consenti" })
    expect(ancora.stato).toBe(404)
    expect(ancora.corpo.errore).toContain("non c'è più")
  })

  test("AskUserQuestion diventa una domanda con i bottoni, e la risposta torna a Claude", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    const ingresso = {
      questions: [
        { question: "Rosso o blu?", header: "Colore", multiSelect: false, options: [{ label: "Rosso", description: "il rosso" }, { label: "Blu", description: "il blu" }] },
        { question: "Quali bordi?", header: "Bordi", multiSelect: true, options: [{ label: "Sopra", description: "" }, { label: "Sotto", description: "" }] },
      ],
    }
    const attesa = q.chiediPermesso("AskUserQuestion", ingresso, "toolu_q1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    const richiesta = (await dettaglio(c, id)).corpo.in_attesa[0]
    expect(richiesta).toEqual({
      id: "toolu_q1",
      tipo: "domanda",
      domande: [
        { domanda: "Rosso o blu?", intestazione: "Colore", multipla: false, opzioni: [{ etichetta: "Rosso", descrizione: "il rosso" }, { etichetta: "Blu", descrizione: "il blu" }] },
        { domanda: "Quali bordi?", intestazione: "Bordi", multipla: true, opzioni: [{ etichetta: "Sopra", descrizione: "" }, { etichetta: "Sotto", descrizione: "" }] },
      ],
    })
    expect(eventiChat(ascolto, id).some((e) => e.evento === "richiesta" && e.richiesta.tipo === "domanda")).toBe(true)

    const provale = (risposte: unknown) => chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/risposte/toolu_q1`, { scelta: { risposte } })
    expect((await provale({ "Rosso o blu?": "Blu" })).corpo.errore).toBe("Manca la risposta alla domanda «Quali bordi?».")
    expect((await provale({ "Rosso o blu?": "Blu", "Quali bordi?": "Sopra", "Un'altra?": "sì" })).corpo.errore).toContain("non è una delle domande")
    expect((await chiama(c.a, "POST", `/api/chat/${id}/risposte/toolu_q1`, { scelta: "Blu" })).stato).toBe(400)

    expect((await provale({ "Rosso o blu?": "Verde, in realtà", "Quali bordi?": ["Sopra", "Sotto"] })).stato).toBe(200)
    expect(await attesa).toEqual({ behavior: "allow", updatedInput: { ...ingresso, answers: { "Rosso o blu?": "Verde, in realtà", "Quali bordi?": "Sopra, Sotto" } } })
    ascolto.chiudi()
  })

  test("una domanda scritta male non arriva al creator e Claude lo sa", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    const risposta = await q.chiediPermesso("AskUserQuestion", { questions: [] }, "toolu_q2")
    expect(risposta.behavior).toBe("deny")
    expect((await dettaglio(c, id)).corpo.in_attesa).toEqual([])
  })

  test("se il lavoro viene fermato la richiesta cade da sola", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    const fermo = new AbortController()
    const attesa = q.chiediPermesso("Bash", { command: "ls" }, "toolu_p1", fermo.signal)
    await aspetta(async () => (await dettaglio(c, id)).corpo.in_attesa.length === 1)
    fermo.abort()
    expect(await attesa).toMatchObject({ behavior: "deny", interrupt: true })
    expect((await dettaglio(c, id)).corpo.in_attesa).toEqual([])
  })
})

describe("ferma", () => {
  test("interrompe Claude, nega le richieste in attesa e il giro fermato non è un errore", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, ...testoAPezzi("msg_1", ["comincio"]))
    const attesa = q.chiediPermesso("Bash", { command: "sleep 100" }, "toolu_p1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "aspetta")

    const r = await chiama(c.a, "POST", `/api/chat/${id}/ferma`)
    expect(r.stato).toBe(200)
    expect(q.interrotta).toBe(1)
    expect(await attesa).toMatchObject({ behavior: "deny", interrupt: true })
    expect((await dettaglio(c, id)).corpo.in_attesa).toEqual([])

    q.emetti(risultato({ subtype: "error_during_execution", is_error: true, errors: ["interrupted"] }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    const parti = (await dettaglio(c, id)).corpo.messaggi[1]?.parti
    expect(parti?.at(-1)).toEqual({ tipo: "fine", costo: 0.05, durata_ms: 1200, lavoro_ms: expect.any(Number) })
  })

  test("una conversazione chiusa non ha niente da fermare, una che non c'è non si trova", async () => {
    const c = await avvia()
    c.sessioni.voci = [{ id: ID_FINTO, titolo: "vecchia", aggiornata: 1 }]
    const chiusa = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${ID_FINTO}/ferma`)
    expect(chiusa.stato).toBe(409)
    expect(chiusa.corpo.errore).toContain("chiusa")
    const manca = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ferma`)
    expect(manca.stato).toBe(404)
    expect(manca.corpo.errore).toContain("Non c'è una conversazione")
  })
})

describe("i lavori in background", () => {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
  const partito = (id: string, extra: object = {}) => ({ type: "system", subtype: "task_started", task_id: id, tool_use_id: `toolu_${id}`, description: `Lavoro ${id}`, task_type: "local_bash", is_backgrounded: false, ...extra })
  const livello = (...tasks: { task_id: string; task_type?: string; description?: string }[]) => ({ type: "system", subtype: "background_tasks_changed", tasks: tasks.map((t) => ({ task_type: "local_bash", description: `Lavoro ${t.task_id}`, ...t })) })
  const finito = (id: string, status = "completed") => ({ type: "system", subtype: "task_notification", task_id: id, status, output_file: "", summary: "" })
  const compiti = async (c: Avvio, id: string) => (await dettaglio(c, id)).corpo.task
  const comeDaFare = (id: string, tipo: "comando" | "agente" | "altro", background: boolean) => ({ id, tipo, descrizione: `Lavoro ${id}`, iniziato: expect.stringMatching(iso), background })

  test("un lavoro parte in primo piano, passa in background e finisce: la lettura e gli eventi lo dicono", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    expect(await compiti(c, id)).toEqual([])

    q.emetti(init, partito("b1"))
    await aspetta(async () => (await compiti(c, id)).length === 1)
    expect(await compiti(c, id)).toEqual([comeDaFare("b1", "comando", false)])

    q.emetti({ type: "system", subtype: "task_updated", task_id: "b1", patch: { is_backgrounded: true } })
    await aspetta(async () => ((await compiti(c, id)) as { background: boolean }[])[0]?.background === true)

    q.emetti(finito("b1"))
    await aspetta(async () => (await compiti(c, id)).length === 0)

    const eventi = eventiChat(ascolto, id).flatMap((e) => (e.evento === "task" ? [e.task] : []))
    expect(eventi).toEqual([[comeDaFare("b1", "comando", false)], [comeDaFare("b1", "comando", true)], []])
    ascolto.chiudi()
  })

  test("un sottoagente è un «agente»; i lavori di servizio e quelli di un sottoagente non si mostrano", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, partito("a1", { task_type: "local_agent", is_backgrounded: true }), partito("s1", { ambient: true }), partito("n1", { parent_task_id: "a1" }), partito("w1", { task_type: "monitor", is_backgrounded: true }))
    await aspetta(async () => (await compiti(c, id)).length === 2)
    expect(await compiti(c, id)).toEqual([comeDaFare("a1", "agente", true), comeDaFare("w1", "altro", true)])
  })

  test("l'elenco che l'SDK manda a ogni cambio rimette a posto ciò che si è perso", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, partito("b1", { is_backgrounded: true }), partito("f1"), livello({ task_id: "b2" }, { task_id: "b1" }))
    await aspetta(async () => (await compiti(c, id)).length === 3)
    expect((await compiti(c, id)) as { id: string; background: boolean }[]).toMatchObject([
      { id: "b1", background: true },
      { id: "f1", background: false },
      { id: "b2", background: true },
    ])

    q.emetti(livello({ task_id: "b2" }))
    await aspetta(async () => (await compiti(c, id)).length === 2)
    expect(((await compiti(c, id)) as { id: string }[]).map((t) => t.id)).toEqual(["f1", "b2"])
  })

  test("un lavoro in background sopravvive al giro (ogni giro riemette l'init) ma non al processo di Claude Code", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    // Un lavoro in primo piano di cui la fine non è arrivata non resta dopo il giro: «Manda in background» non resta acceso.
    q.emetti(init, partito("b1", { is_backgrounded: true }), partito("f1"), risultato(), init)
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect(((await compiti(c, id)) as { id: string }[]).map((t) => t.id)).toEqual(["b1"])

    q.rompi(new Error("caduto"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "errore")
    expect(await compiti(c, id)).toEqual([])
    expect(eventiChat(ascolto, id).flatMap((e) => (e.evento === "task" ? [e.task.length] : []))).toEqual([1, 2, 1, 0])
    ascolto.chiudi()
  })

  test("«Manda in background» sposta il lavoro in primo piano e si rifiuta se non ce n'è uno", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    const nessuno = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/background`)
    expect(nessuno.stato).toBe(409)
    expect(nessuno.corpo.errore).toBe("Non c'è un lavoro in corso da mandare in background.")
    expect(q.inBackground).toEqual([])

    q.emetti(init, partito("f1"))
    await aspetta(async () => (await compiti(c, id)).length === 1)
    const r = await chiama(c.a, "POST", `/api/chat/${id}/background`)
    expect(r.stato).toBe(200)
    expect(q.inBackground).toEqual([undefined])

    c.sessioni.voci = [{ id: ID_FINTO, titolo: "vecchia", aggiornata: 1 }]
    c.sessioni.cambia(ID_FINTO)
    const chiusa = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${ID_FINTO}/background`)
    expect(chiusa.stato).toBe(409)
    expect(chiusa.corpo.errore).toContain("chiusa")
  })

  test("«Ferma» su un lavoro lo ferma; uno che non c'è non si trova, e se Claude Code non lo ferma il creator lo sa", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, partito("b1", { is_backgrounded: true }))
    await aspetta(async () => (await compiti(c, id)).length === 1)

    const r = await chiama(c.a, "POST", `/api/chat/${id}/task/b1/ferma`)
    expect(r.stato).toBe(200)
    expect(q.lavoriFermati).toEqual(["b1"])

    const manca = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/task/b9/ferma`)
    expect(manca.stato).toBe(404)
    expect(manca.corpo.errore).toContain("non c'è più")

    q.rifiutaLoStop = "il lavoro è già finito"
    const rifiutato = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/task/b1/ferma`)
    expect(rifiutato.stato).toBe(502)
    expect(rifiutato.corpo.errore).toContain("il lavoro è già finito")
  })
})

describe("il tempo di lavoro", () => {
  test("si somma sulle risposte, non conta l'attesa di una domanda e si ferma quando Claude ha finito", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    q.emetti(init)
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "lavora")
    const lavorando = (await dettaglio(c, id)).corpo.lavoro
    expect(lavorando.da).toEqual(expect.any(String))

    await Bun.sleep(150)
    const domanda = { questions: [{ question: "Rosso o blu?", header: "Colore", multiSelect: false, options: [{ label: "Rosso", description: "" }, { label: "Blu", description: "" }] }] }
    void q.chiediPermesso("AskUserQuestion", domanda, "toolu_q1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "aspetta")
    expect((await dettaglio(c, id)).corpo.lavoro.da).toBeNull()
    await Bun.sleep(800)
    await chiama(c.a, "POST", `/api/chat/${id}/risposte/toolu_q1`, { scelta: { risposte: { "Rosso o blu?": "Blu" } } })
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "lavora")
    await Bun.sleep(150)
    q.emetti(...testoAPezzi("msg_1", ["fatto"]), risultato({ duration_ms: 1200 }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")

    const d = (await dettaglio(c, id)).corpo
    const fine = d.messaggi.flatMap((m) => m.parti).find((p) => p["tipo"] === "fine")
    const primo = fine?.["lavoro_ms"] as number
    expect(primo).toBeGreaterThanOrEqual(280)
    expect(primo).toBeLessThan(800)
    expect(d.lavoro).toEqual({ ms: primo, da: null })
    expect(eventiChat(ascolto, id).filter((e) => e.evento === "stato").at(-1)).toMatchObject({ stato: "pronta", lavoro: { ms: primo, da: null } })

    // La risposta dopo parte da dove era arrivata la prima.
    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ancora" })
    await aspetta(async () => (await dettaglio(c, id)).corpo.lavoro.da !== null)
    expect((await dettaglio(c, id)).corpo.lavoro.ms).toBe(primo)
    q.emetti(...testoAPezzi("msg_2", ["ok"]), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    const parti = (await dettaglio(c, id)).corpo.messaggi.flatMap((m) => m.parti).filter((p) => p["tipo"] === "fine")
    expect((await dettaglio(c, id)).corpo.lavoro.ms).toBe(primo + (parti[1]?.["lavoro_ms"] as number))
    ascolto.chiudi()
  })
})

describe("le conversazioni vecchie", () => {
  const riga = (type: string, uuid: string, message: unknown, extra: object = {}): MessaggioSessione => ({ type, uuid, message, timestamp: "2026-10-30T10:00:00.000Z", ...extra })

  function vecchia(c: Avvio, archivio: string): string {
    const id = "11111111-1111-4111-8111-111111111111"
    c.sessioni.voci = [{ id, titolo: "[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
    c.sessioni.file.set(
      id,
      [
        riga("user", "u0", { role: "user", content: "<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>" }),
        riga("user", "u1", { role: "user", content: [{ type: "text", text: `[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto\n\n[Allegato: ${join(archivio, ".chat", "allegati", "foto.png")}]` }] }, { origin: { kind: "human" } }),
        riga("assistant", "a1", { content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Guardo." }] }),
        riga("assistant", "a2", { content: [{ type: "tool_use", id: "toolu_a", name: "mcp__video__video_leggi", input: { slug: "orto" } }] }, { timestamp: "2026-10-30T10:00:01.000Z" }),
        riga("user", "u2", { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_a", content: [{ type: "text", text: "{}" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "QQ==" } }] }] }, { timestamp: "2026-10-30T10:02:31.000Z" }),
        riga("user", "u3", { role: "user", content: "<system-reminder>niente</system-reminder>" }, { origin: { kind: "system" } }),
        riga("assistant", "a3", { content: [{ type: "text", text: "Tutto a posto." }], usage: { input_tokens: 5, cache_read_input_tokens: 12_000, output_tokens: 40 } }),
      ],
    )
    return id
  }

  test("si leggono dal loro file: il contesto non si vede, gli allegati e gli esiti sì", async () => {
    const c = await avvia()
    const id = vecchia(c, c.a.archivio)
    const d = await dettaglio(c, id)
    expect(d.stato).toBe(200)
    expect(d.corpo).toMatchObject({ id, titolo: "Controlla l'orto", attiva: false, stato: "pronta", in_attesa: [], contesto_usato: { usati: 12_045, totale: null } })
    expect(d.corpo.messaggi.map((m) => [m.id, m.ruolo, m.quando])).toEqual([
      ["u1", "utente", "2026-10-30T10:00:00.000Z"],
      ["a1", "claude", "2026-10-30T10:00:00.000Z"],
    ])
    expect(d.corpo.messaggi[0]?.parti).toEqual([
      { tipo: "allegato", percorso: ".chat/allegati/foto.png", immagine: true },
      { tipo: "testo", testo: "Controlla l'orto" },
    ])
    expect(d.corpo.messaggi[1]?.parti).toEqual([
      { tipo: "testo", testo: "Guardo." },
      { tipo: "strumento", id: "toolu_a", nome: "mcp__video__video_leggi", ingresso: { slug: "orto" }, esito: "{}", immagini: [{ media_type: "image/png", data: "QQ==" }], iniziato: "2026-10-30T10:00:01.000Z", finito: "2026-10-30T10:02:31.000Z" },
      { tipo: "testo", testo: "Tutto a posto." },
    ])
  })

  test("il tempo di lavoro di una conversazione vecchia si stima dagli orari: dal messaggio del creator all'ultima cosa di Claude", async () => {
    const c = await avvia()
    const id = vecchia(c, c.a.archivio)
    expect((await dettaglio(c, id)).corpo.lavoro).toEqual({ ms: 151_000, da: null })
  })

  test("un messaggio la riapre con resume, e la storia resta", async () => {
    const c = await avvia()
    const id = vecchia(c, c.a.archivio)
    const r = await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "E la copertina?" })
    expect(r.stato).toBe(202)
    const q = await aspetta(() => c.finto.queries[0])
    expect(q.opzioni.resume).toBe(id)
    expect(q.opzioni.sessionId).toBeUndefined()
    await aspetta(() => q.ricevuti.length === 1)

    const d = await dettaglio(c, id)
    expect(d.corpo).toMatchObject({ attiva: true, stato: "lavora", contesto_usato: { usati: 12_045, totale: null } })
    expect(d.corpo.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude", "utente"])
    q.emetti(init, ...testoAPezzi("msg_1", ["Ecco."]), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude", "utente", "claude"])
  })

  test("due messaggi insieme a una conversazione chiusa la riaprono una volta sola", async () => {
    const c = await avvia()
    const id = vecchia(c, c.a.archivio)
    await Promise.all([chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "uno" }), chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "due" })])
    await aspetta(() => c.finto.queries[0]?.ricevuti.length === 2)
    expect(c.finto.queries).toHaveLength(1)
  })
})

describe("l'elenco", () => {
  test("le conversazioni dalla più recente, col titolo accorciato, e quella aperta qui è attiva", async () => {
    const c = await avvia()
    const lungo = "Questo è il primo messaggio di una conversazione davvero molto lunga che non entra in una riga"
    c.sessioni.voci = [
      { id: "11111111-1111-4111-8111-111111111111", titolo: "[Context: the creator is looking at the video «Orto» (orto).]\n\nVecchia", aggiornata: Date.parse("2026-10-01T10:00:00Z") },
      { id: "22222222-2222-4222-8222-222222222222", titolo: lungo, aggiornata: Date.parse("2026-10-20T10:00:00Z") },
    ]
    const prima = await chiama<{ id: string; titolo: string; aggiornata: string; attiva: boolean }[]>(c.a, "GET", "/api/chat")
    expect(prima.corpo).toEqual([
      { id: "22222222-2222-4222-8222-222222222222", titolo: `${lungo.slice(0, 59).trimEnd()}…`, aggiornata: "2026-10-20T10:00:00.000Z", attiva: false },
      { id: "11111111-1111-4111-8111-111111111111", titolo: "Vecchia", aggiornata: "2026-10-01T10:00:00.000Z", attiva: false },
    ])

    const { id } = await nuova(c, "Una cosa nuova")
    const dopo = await chiama<{ id: string; titolo: string; attiva: boolean }[]>(c.a, "GET", "/api/chat")
    expect(dopo.corpo.map((v) => [v.titolo, v.attiva])).toEqual([
      ["Una cosa nuova", true],
      [`${lungo.slice(0, 59).trimEnd()}…`, false],
      ["Vecchia", false],
    ])
    expect(dopo.corpo[0]?.id).toBe(id)
  })

  test("l'elenco si rilegge dal disco solo quando è cambiato, e il cambio si annuncia", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    await chiama(c.a, "GET", "/api/chat")
    await chiama(c.a, "GET", "/api/chat")
    expect(c.sessioni.elenchi).toBe(1)

    c.sessioni.cambia("33333333-3333-4333-8333-333333333333")
    await aspetta(() => eventiChat(ascolto, "33333333-3333-4333-8333-333333333333").some((e) => e.evento === "elenco"))
    await chiama(c.a, "GET", "/api/chat")
    expect(c.sessioni.elenchi).toBe(2)
    ascolto.chiudi()
  })
})

describe("gli allegati e il contesto", () => {
  const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"))

  const carica = (c: Avvio, nome: string | null, corpo: Uint8Array | string) =>
    fetch(`${c.a.url}/api/chat/allegati`, { method: "POST", headers: nome === null ? c.a.accesso : { ...c.a.accesso, "X-Nome": encodeURIComponent(nome), "Content-Type": "application/octet-stream" }, body: corpo })

  test("un file caricato sta in archivio/.chat/allegati col suo nome; uno già preso non si sovrascrive", async () => {
    const c = await avvia()
    const r1 = await carica(c, "foto bella.png", PNG)
    expect(r1.status).toBe(201)
    expect(await r1.json()).toEqual({ percorso: ".chat/allegati/foto bella.png" })
    expect(Buffer.from(await readFile(join(c.a.archivio, ".chat", "allegati", "foto bella.png")))).toEqual(Buffer.from(PNG))
    expect(await readFile(join(c.a.archivio, ".chat", ".gitignore"), "utf-8")).toBe("*\n")

    expect(await (await carica(c, "foto bella.png", PNG)).json()).toEqual({ percorso: ".chat/allegati/foto bella-2.png" })
    expect(await (await carica(c, "..\\..\\fuori.txt", "x")).json()).toEqual({ percorso: ".chat/allegati/fuori.txt" })
    await expect(stat(join(c.a.radice, "fuori.txt"))).rejects.toThrow()

    const senzaNome = await carica(c, null, "x")
    expect(senzaNome.status).toBe(400)
    expect(((await senzaNome.json()) as { errore: string }).errore).toContain("X-Nome")
    const vuoto = await carica(c, "a.txt", "")
    expect(vuoto.status).toBe(400)
    expect(((await vuoto.json()) as { errore: string }).errore).toContain("vuoto")
  })

  test("un'immagine arriva a Claude come immagine, ogni file come percorso, e il contesto è una riga davanti", async () => {
    const c = await avvia(async (cartelle) => scriviVideo(cartelle, "orto", { titolo: "L'orto [prova]", stato: "proposta", creato: "2026-10-06" }))
    const { percorso: png } = (await (await carica(c, "foto.png", PNG)).json()) as { percorso: string }
    const { percorso: nota } = (await (await carica(c, "nota.txt", "ciao")).json()) as { percorso: string }

    const { id, q } = await nuova(c, "Guarda qui", { allegati: [{ percorso: png }, { percorso: nota }], contesto: { video: "orto", vista: "Slide" } })
    const contenuto = q.ricevuti[0]?.message.content
    expect(Array.isArray(contenuto)).toBe(true)
    const blocchi = contenuto as { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[]
    expect(blocchi[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(PNG).toString("base64") } })
    expect(blocchi[1]?.text).toBe(
      `[Context: the creator is looking at the video «L'orto (prova)» (orto), tab «Slide».]\n\nGuarda qui\n\n[Allegato: ${join(c.a.archivio, ".chat", "allegati", "foto.png")}]\n\n[Allegato: ${join(c.a.archivio, ".chat", "allegati", "nota.txt")}]`,
    )

    // Il creator vede i suoi allegati e il suo testo, non il contesto
    expect((await dettaglio(c, id)).corpo.messaggi[0]?.parti).toEqual([
      { tipo: "allegato", percorso: png, immagine: true },
      { tipo: "allegato", percorso: nota, immagine: false },
      { tipo: "testo", testo: "Guarda qui" },
    ])
  })

  test("solo un file che non è un'immagine: il messaggio resta un testo; il contesto di una pagina senza video", async () => {
    const c = await avvia()
    const { percorso } = (await (await carica(c, "nota.txt", "ciao")).json()) as { percorso: string }
    const { q } = await nuova(c, "", { allegati: [{ percorso }], contesto: { vista: "Girato" } })
    expect(q.ricevuti[0]?.message.content).toBe(`[Context: the creator is looking at the page «Girato».]\n\n[Allegato: ${join(c.a.archivio, ".chat", "allegati", "nota.txt")}]`)
    const elenco = await chiama<{ titolo: string }[]>(c.a, "GET", "/api/chat")
    expect(elenco.corpo[0]?.titolo).toBe("Allegato: nota.txt")
  })

  test("un allegato che non c'è o che esce dall'archivio non passa", async () => {
    const c = await avvia()
    for (const percorso of [".chat/allegati/non-c-e.png", "../fuori.txt", "C:/Windows/win.ini"]) {
      const r = await chiama<{ errore: string }>(c.a, "POST", "/api/chat", { testo: "ciao", allegati: [{ percorso }] })
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toContain("non c'è")
    }
    expect(c.finto.queries).toHaveLength(0)
  })

  test("lo strumento «video» parte dal codice e lavora nella cartella di lavoro, anche se un'impostazione locale lo spegne", async () => {
    const c = await avvia()
    const { q } = await nuova(c)
    expect(q.opzioni.mcpServers).toEqual({
      video: { type: "stdio", command: process.execPath, args: ["run", "--cwd", join(c.a.codice, "server"), "mcp"], env: { MANGO_ANIMATION_LAVORO: c.a.radice } },
    })
  })
})

describe("il modello e l'effort", () => {
  interface Modello {
    id: string
    nome: string
    descrizione: string
    effort: string[]
    reale: string
  }
  const impostazioni = (c: Avvio, id: string, corpo: unknown) => chiama<{ modello: string | null; effort: string | null; errore?: string }>(c.a, "POST", `/api/chat/${id}/impostazioni`, corpo)

  test("l'elenco dei modelli ha nomi leggibili, la descrizione e i livelli di effort; il predefinito dice quale modello è", async () => {
    const c = await avvia()
    const r = await chiama<Modello[]>(c.a, "GET", "/api/chat/modelli")
    expect(r.stato).toBe(200)
    expect(r.corpo.map((m) => m.id)).toEqual(["default", "opus", "sonnet", "claude-opus-4-6", "claude-haiku-4-5-20251001"])
    expect(r.corpo[0]).toEqual({ id: "default", nome: "Predefinito (Sonnet 5.5)", descrizione: "Sonnet 5.5 · efficient", effort: [...LIVELLI], reale: "claude-sonnet-5-5" })
    expect(r.corpo[1]).toMatchObject({ id: "opus", nome: "Opus 5.5", reale: "claude-opus-5-5" })
    expect((await chiama<Modello[]>(c.a, "GET", "/api/chat/modelli", undefined, "en")).corpo[0]?.nome).toBe("Default (Sonnet 5.5)")
    expect(r.corpo[3]?.effort).toEqual(["low", "medium", "high", "max"])
    expect(r.corpo[4]?.effort).toEqual([])
    // Si legge una volta sola per tutta la vita del server, e la query di servizio si chiude.
    await chiama(c.a, "GET", "/api/chat/modelli")
    expect(c.finto.queries).toHaveLength(1)
    expect(c.finto.queries[0]?.chiusa).toBe(true)
  })

  test("una conversazione nuova parte col modello e l'effort scelti; senza scelta, quelli di Claude Code", async () => {
    const c = await avvia()
    const scelta = await nuova(c, "Ciao", { modello: "opus", effort: "high" })
    expect(scelta.q.opzioni.model).toBe("opus")
    expect(scelta.q.opzioni.effort).toBe("high")
    expect((await dettaglio(c, scelta.id)).corpo).toMatchObject({ modello: "opus", effort: "high" })

    const predefinito = await nuova(c, "Ciao", { modello: "default" })
    expect(predefinito.q.opzioni.model).toBeUndefined()
    expect((await dettaglio(c, predefinito.id)).corpo).toMatchObject({ modello: "default", effort: null })

    const nessuna = await nuova(c, "Ciao")
    expect((await dettaglio(c, nessuna.id)).corpo).toMatchObject({ modello: null, effort: null })
  })

  test("lo stato dice il modello vero che Claude Code ha acceso, e un evento lo annuncia", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    q.emetti({ ...init, model: "claude-sonnet-5-5", effort: "medium" })
    await aspetta(async () => (await dettaglio(c, id)).corpo.modello === "claude-sonnet-5-5")
    expect((await dettaglio(c, id)).corpo).toMatchObject({ modello: "claude-sonnet-5-5", effort: "medium" })
    await aspetta(() => eventiChat(ascolto, id).some((e) => e.evento === "impostazioni" && e.modello === "claude-sonnet-5-5" && e.effort === "medium"))
    ascolto.chiudi()
  })

  test("si cambia a conversazione aperta: il modello con setModel, l'effort con le impostazioni, e la scelta vince sull'init", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { id, q } = await nuova(c)
    q.emetti({ ...init, model: "claude-sonnet-5-5" })

    let r = await impostazioni(c, id, { modello: "opus" })
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual({ modello: "opus", effort: null })
    r = await impostazioni(c, id, { effort: "max" })
    expect(r.corpo).toEqual({ modello: "opus", effort: "max" })
    r = await impostazioni(c, id, { effort: null })
    expect(r.corpo).toEqual({ modello: "opus", effort: null })
    r = await impostazioni(c, id, { modello: "default", effort: "low" })
    expect(r.corpo).toEqual({ modello: "default", effort: "low" })
    expect(q.cambi).toEqual([["modello", "opus"], ["effort", "max"], ["effort", null], ["modello", undefined], ["effort", "low"]])
    expect(q.chiusa).toBe(false)
    expect(c.finto.queries.filter((x) => !x.chiusa)).toEqual([q])

    // Un init che arriva dopo non cancella ciò che il creator ha scelto.
    q.emetti({ ...init, model: "claude-opus-5-5" }, ...testoAPezzi("msg_1", ["ok"]), risultato())
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo).toMatchObject({ modello: "default", effort: "low" })
    expect(eventiChat(ascolto, id).filter((e) => e.evento === "impostazioni").at(-1)).toMatchObject({ modello: "default", effort: "low" })
    ascolto.chiudi()
  })

  test("cambiando modello l'effort che il nuovo non ha torna al predefinito", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "Ciao", { modello: "opus", effort: "xhigh" })
    const r = await impostazioni(c, id, { modello: "claude-opus-4-6" })
    expect(r.corpo).toEqual({ modello: "claude-opus-4-6", effort: null })
    expect(q.cambi).toEqual([["modello", "claude-opus-4-6"], ["effort", null]])
  })

  test("una conversazione chiusa ricorda la scelta e riparte con quella", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init)
    await impostazioni(c, id, { modello: "opus", effort: "high" })
    q.rompi(new Error("caduto"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "errore")
    expect((await impostazioni(c, id, { modello: "sonnet" })).corpo).toEqual({ modello: "sonnet", effort: "high" })
    expect(q.cambi).toHaveLength(2)

    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "riprova" })
    const q2 = await aspetta(() => c.finto.queries.find((x) => x !== q && !x.chiusa && x.opzioni.resume === id))
    expect(q2.opzioni.model).toBe("sonnet")
    expect(q2.opzioni.effort).toBe("high")
  })

  test("una conversazione vecchia, ancora solo nel suo file, si imposta prima di riaprirla", async () => {
    const c = await avvia()
    const id = "22222222-2222-4222-8222-222222222222"
    c.sessioni.voci = [{ id, titolo: "Ciao", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
    c.sessioni.file.set(id, [{ type: "user", uuid: "u1", message: { role: "user", content: "Ciao" }, timestamp: "2026-10-30T10:00:00.000Z", origin: { kind: "human" } }])
    expect((await dettaglio(c, id)).corpo).toMatchObject({ modello: null, effort: null })
    expect((await impostazioni(c, id, { modello: "opus" })).corpo).toEqual({ modello: "opus", effort: null })
    expect((await dettaglio(c, id)).corpo).toMatchObject({ attiva: false, modello: "opus" })
    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "e adesso?" })
    const q = await aspetta(() => c.finto.queries.find((x) => !x.chiusa))
    expect(q.opzioni.resume).toBe(id)
    expect(q.opzioni.model).toBe("opus")
  })

  test("il titolo di una conversazione è quello di Claude Code, nell'elenco e aperta, chiusa o riaperta", async () => {
    const c = await avvia()
    const id = "33333333-3333-4333-8333-333333333333"
    c.sessioni.voci = [{ id, titolo: "Pulizia del disco", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
    c.sessioni.file.set(id, [{ type: "user", uuid: "u1", message: { role: "user", content: "/model" }, timestamp: "2026-10-30T10:00:00.000Z", origin: { kind: "human" } }])
    expect((await chiama<{ id: string; titolo: string }[]>(c.a, "GET", "/api/chat")).corpo.find((v) => v.id === id)?.titolo).toBe("Pulizia del disco")
    expect((await dettaglio(c, id)).corpo.titolo).toBe("Pulizia del disco")
    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "e adesso?" })
    await aspetta(() => c.finto.queries.find((x) => !x.chiusa))
    expect((await dettaglio(c, id)).corpo.titolo).toBe("Pulizia del disco")
  })

  test("le scelte che non esistono sono rifiutate con una frase che dice cosa c'è", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "Ciao", { modello: "opus" })
    const prova = async (corpo: unknown) => {
      const r = await impostazioni(c, id, corpo)
      return [r.stato, r.corpo.errore] as const
    }
    expect(await prova({ modello: "gpt-9" })).toEqual([400, "«gpt-9» non è un modello che la chat offre. Quelli che ci sono: Predefinito (Sonnet 5.5), Opus 5.5, Sonnet 5.5, Opus 4.6, Haiku 4.5."])
    expect(await prova({ modello: 5 })).toEqual([400, "Il «modello» è il nome di uno dei modelli dell'elenco (GET /api/chat/modelli)."])
    expect(await prova({ effort: "enorme" })).toEqual([400, "L'effort «enorme» non esiste. I livelli sono: low, medium, high, xhigh, max."])
    expect(await prova({ effort: 3 })).toEqual([400, "L'«effort» è uno dei livelli (low, medium, high, xhigh, max) oppure null per quello predefinito."])
    expect(await prova({ modello: "claude-opus-4-6", effort: "xhigh" })).toEqual([400, "Opus 4.6 non ha l'effort «xhigh». I suoi livelli sono: low, medium, high, max."])
    expect(await prova({ modello: "claude-haiku-4-5-20251001", effort: "low" })).toEqual([400, "Haiku 4.5 non ha livelli di effort."])
    expect(await prova({})).toEqual([400, "Manca cosa cambiare: scrivi «modello» o «effort»."])
    expect((await prova({ modello: "opus", colore: "rosso" }))[1]).toBe("«colore» non è un'impostazione: ci sono «modello» e «effort».")
    expect((await impostazioni(c, ID_FINTO, { modello: "opus" })).stato).toBe(404)
    expect(q.cambi).toEqual([])

    const queryPrima = c.finto.queries.length
    const nuovaSbagliata = await chiama<{ errore: string }>(c.a, "POST", "/api/chat", { testo: "Ciao", modello: "gpt-9" })
    expect(nuovaSbagliata.stato).toBe(400)
    expect(nuovaSbagliata.corpo.errore).toContain("«gpt-9» non è un modello")
    const nuovaConEffortSbagliato = await chiama<{ errore: string }>(c.a, "POST", "/api/chat", { testo: "Ciao", modello: "claude-opus-4-6", effort: "xhigh" })
    expect(nuovaConEffortSbagliato.stato).toBe(400)
    const messaggioConModello = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ciao", modello: "opus" })
    expect(messaggioConModello.corpo.errore).toContain("«modello» non è un campo del messaggio")
    // Nessuna conversazione nuova è nata dalle richieste sbagliate (resta solo la query di servizio dei modelli).
    expect(c.finto.queries.slice(queryPrima).filter((x) => x.ricevuti.length > 0 || !x.chiusa)).toHaveLength(0)
  })

  test("se Claude Code non accetta il cambio, la scelta non cambia e il creator lo sa", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "Ciao", { modello: "opus" })
    q.rifiutaIlCambio = "modello non disponibile per il tuo abbonamento"
    const r = await impostazioni(c, id, { modello: "sonnet" })
    expect(r.stato).toBe(502)
    expect(r.corpo.errore).toBe("Claude Code non ha accettato il cambio: modello non disponibile per il tuo abbonamento")
    expect((await dettaglio(c, id)).corpo).toMatchObject({ modello: "opus" })
  })
})

describe("gli errori", () => {
  test("id che non c'è, richiesta che non c'è, corpo sbagliato: frasi in italiano", async () => {
    const c = await avvia()
    const { id } = await nuova(c)
    const prova = async (metodo: string, percorso: string, corpo?: unknown) => {
      const r = await chiama<{ errore: string }>(c.a, metodo, percorso, corpo)
      return [r.stato, r.corpo.errore] as const
    }

    expect(await prova("GET", `/api/chat/${ID_FINTO}`)).toEqual([404, "Non c'è una conversazione con questo id: guarda l'elenco delle conversazioni."])
    expect((await prova("GET", "/api/chat/non-un-id"))[0]).toBe(404)
    expect((await prova("POST", `/api/chat/${ID_FINTO}/messaggi`, { testo: "ciao" }))[0]).toBe(404)
    expect((await prova("POST", `/api/chat/${ID_FINTO}/ferma`))[0]).toBe(404)
    expect((await prova("POST", `/api/chat/${ID_FINTO}/risposte/x`, { scelta: "consenti" }))[0]).toBe(404)
    expect(await prova("POST", `/api/chat/${id}/risposte/non-c-e`, { scelta: "consenti" })).toEqual([404, "Questa richiesta non c'è più: ha già avuto risposta, oppure è già stata ritirata."])

    expect(await prova("POST", `/api/chat/${id}/messaggi`, { testo: 5 })).toEqual([400, "Il «testo» del messaggio dev'essere un testo."])
    expect((await prova("POST", `/api/chat/${id}/messaggi`, { testo: "ciao", altro: 1 }))[1]).toContain("«altro» non è un campo del messaggio")
    expect((await prova("POST", `/api/chat/${id}/messaggi`, { testo: "ciao", contesto: "orto" }))[1]).toContain("«contesto» deve essere un oggetto")
    expect((await prova("POST", `/api/chat/${id}/messaggi`, { testo: "ciao", contesto: { video: "Non Valido" } }))[1]).toContain("nome della sua cartella")
    expect((await prova("POST", `/api/chat/${id}/messaggi`, { testo: "ciao", allegati: "a.png" }))[1]).toContain("«allegati» deve essere un elenco")

    const senzaTipo = await fetch(`${c.a.url}/api/chat/${id}/messaggi`, { method: "POST", headers: c.a.accesso, body: JSON.stringify({ testo: "ciao" }) })
    expect(senzaTipo.status).toBe(400)
    expect(((await senzaTipo.json()) as { errore: string }).errore).toContain("Content-Type: application/json")
    const rotto = await fetch(`${c.a.url}/api/chat/${id}/messaggi`, { method: "POST", headers: { ...c.a.accesso, "Content-Type": "application/json" }, body: "{" })
    expect(((await rotto.json()) as { errore: string }).errore).toBe("Il corpo non è un JSON valido.")
    expect((await prova("PUT", `/api/chat/${id}`))[0]).toBe(405)
  })
})

describe("quando Claude Code si rompe", () => {
  test("un giro andato male dice perché si è fermato, senza dare un nome a Claude", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, ...testoAPezzi("msg_1", ["comincio"]), risultato({ subtype: "error_during_execution", is_error: true, errors: ["manca la rete"] }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo.messaggi[1]?.parti.at(-1)).toMatchObject({ tipo: "fine", errore: "Si è fermato: manca la rete." })
  })

  test("il giro finisce con la sua frase e il messaggio dopo riapre la conversazione", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, ...testoAPezzi("msg_1", ["comincio"]))
    q.rompi(new Error("il processo è uscito con codice 1"))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "errore")
    let d = await dettaglio(c, id)
    expect(d.corpo.attiva).toBe(false)
    expect(d.corpo.messaggi[1]?.parti.at(-1)).toEqual({ tipo: "fine", durata_ms: 0, lavoro_ms: expect.any(Number), errore: "Il collegamento con Claude Code si è interrotto (il processo è uscito con codice 1): riscrivi il messaggio." })

    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "riprova" })
    const q2 = await aspetta(() => c.finto.queries[1])
    expect(q2.opzioni.resume).toBe(id)
    expect(q2.opzioni.sessionId).toBeUndefined()
    d = await dettaglio(c, id)
    expect(d.corpo).toMatchObject({ attiva: true, stato: "lavora" })
    expect(d.corpo.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude", "utente"])
  })

  test("un errore del giro (non autenticato) diventa una frase che dice cosa fare", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    q.emetti(init, { type: "assistant", parent_tool_use_id: null, error: "authentication_failed", message: { id: "m", content: [{ type: "text", text: "Not logged in" }] } }, risultato({ is_error: true, result: "Not logged in" }))
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo.messaggi[1]?.parti.at(-1)).toMatchObject({ tipo: "fine", errore: expect.stringContaining("/login") })
  })

  test("chiudere il server chiude le conversazioni aperte", async () => {
    const c = await avvia()
    const { q } = await nuova(c)
    await fermaTutti()
    expect(q.chiusa).toBe(true)
  })
})

test("la riga di contesto non si vede nel titolo, anche com'era scritta nelle conversazioni già salvate", () => {
  const SEP = "\n\n"
  expect(testoVisibile(`[Context: the creator is looking at the page «Girato».]${SEP}Ciao`)).toBe("Ciao")
  expect(testoVisibile(`[Contesto: sta guardando la pagina «Girato».]${SEP}Ciao`)).toBe("Ciao")
})

describe("i permessi", () => {
  test("la chat salta sempre i permessi: Claude Code lavora senza chiedere, e non c'è una scelta da cambiare", async () => {
    const c = await avvia()
    const { q } = await nuova(c)
    expect(q.opzioni.permissionMode).toBe("bypassPermissions")
    expect(q.opzioni.allowDangerouslySkipPermissions).toBe(true)
    expect((await chiama(c.a, "GET", "/api/chat/permessi")).stato).toBe(404)
  })
})

describe("i comandi con la barra", () => {
  type Comando = { nome: string; descrizione: string; argomenti: string; alias: string[] }
  const comandi = (c: Avvio) => chiama<Comando[]>(c.a, "GET", "/api/chat/comandi")
  const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"))

  test("l'elenco è quello di Claude Code, si legge con la stessa query dei modelli e una volta sola", async () => {
    const c = await avvia()
    const r = await comandi(c)
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual([
      { nome: "context", descrizione: "Show current context usage", argomenti: "", alias: [] },
      { nome: "usage", descrizione: "Show plan usage limits", argomenti: "", alias: ["cost", "stats"] },
      { nome: "model", descrizione: "Set the AI model", argomenti: "[model]", alias: [] },
      { nome: "monta", descrizione: "Edits a video.", argomenti: "<slug>", alias: [] },
    ])
    await chiama(c.a, "GET", "/api/chat/modelli")
    await comandi(c)
    expect(c.finto.queries).toHaveLength(1)
    expect(c.finto.queries[0]?.chiusa).toBe(true)
  })

  test("se Claude Code non risponde è un 502, e la lettura si ripete alla richiesta dopo", async () => {
    const c = await avvia()
    c.finto.rifiutaLaLettura = "non parte"
    const r = await chiama<{ errore: string }>(c.a, "GET", "/api/chat/comandi")
    expect(r.stato).toBe(502)
    expect(r.corpo.errore).toBe("Claude Code ha dato un errore: non parte")
    c.finto.rifiutaLaLettura = null
    expect((await comandi(c)).stato).toBe(200)
  })

  test("quando una conversazione riceve commands_changed l'elenco si sostituisce e il server lo annuncia", async () => {
    const c = await avvia()
    const ascolto = await ascolta(c.a)
    const { q } = await nuova(c)
    q.emetti(init, { type: "system", subtype: "commands_changed", commands: [{ name: "nuovo", description: "Brand new", argumentHint: "", aliases: ["n"] }], uuid: "u1", session_id: "x" })
    await aspetta(() => ascolto.messaggi.some((m) => m.tipo === "comandi"))
    expect((await comandi(c)).corpo).toEqual([{ nome: "nuovo", descrizione: "Brand new", argomenti: "", alias: ["n"] }])
    // Non serve rileggere: la query della conversazione è l'unica.
    expect(c.finto.queries).toHaveLength(1)
    ascolto.chiudi()
  })

  test("un messaggio con la barra arriva com'è scritto: senza riga di contesto né immagini, con gli allegati dopo il testo", async () => {
    const c = await avvia()
    const cartella = join(c.a.archivio, ".chat", "allegati")
    await mkdir(cartella, { recursive: true })
    await writeFile(join(cartella, "foto.png"), PNG)
    await writeFile(join(cartella, "nota.txt"), "ciao")
    const allegati = [{ percorso: ".chat/allegati/foto.png" }, { percorso: ".chat/allegati/nota.txt" }]
    const righe = `[Allegato: ${join(cartella, "foto.png")}]\n\n[Allegato: ${join(cartella, "nota.txt")}]`

    const { id, q } = await nuova(c, "/context", { allegati, contesto: { video: "orto", vista: "Slide" } })
    expect(q.ricevuti[0]?.message.content).toBe(`/context\n\n${righe}`)

    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/usage", allegati, contesto: { vista: "Girato" } })
    await aspetta(() => q.ricevuti.length === 2)
    expect(q.ricevuti[1]?.message.content).toBe(`/usage\n\n${righe}`)

    await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "ciao", contesto: { vista: "Girato" } })
    await aspetta(() => q.ricevuti.length === 3)
    expect(q.ricevuti[2]?.message.content).toBe("[Context: the creator is looking at the page «Girato».]\n\nciao")
  })

  test("i comandi che nell'app hanno il loro posto si rifiutano con la frase che dice come si fa, e a Claude Code non arriva niente", async () => {
    const c = await avvia()
    const casi: [string, string][] = [
      ["/clear", "nuova"],
      ["/reset", "nuova"],
      ["/new", "nuova"],
      ["/clear tutto", "nuova"],
      ["/model sonnet", "menu del modello"],
      ["/model", "menu del modello"],
      ["/effort high", "menu dell'effort"],
      ["/effort", "menu dell'effort"],
    ]
    for (const [testo, cosa] of casi) {
      const nuovaConv = await chiama<{ errore: string }>(c.a, "POST", "/api/chat", { testo })
      expect([testo, nuovaConv.stato]).toEqual([testo, 400])
      expect(nuovaConv.corpo.errore).toContain(cosa)
      const conModello = await chiama(c.a, "POST", "/api/chat", { testo, modello: "opus" })
      expect([testo, conModello.stato]).toEqual([testo, 400])
    }
    expect(c.finto.queries.filter((q) => q.ricevuti.length > 0)).toHaveLength(0)

    const { id, q } = await nuova(c)
    for (const [testo, cosa] of casi) {
      const r = await chiama<{ errore: string }>(c.a, "POST", `/api/chat/${id}/messaggi`, { testo })
      expect([testo, r.stato]).toEqual([testo, 400])
      expect(r.corpo.errore).toContain(cosa)
    }
    expect(q.ricevuti).toHaveLength(1)
    expect((await dettaglio(c, id)).corpo.messaggi).toHaveLength(1)

    // Gli altri comandi, anche col nome che comincia allo stesso modo, passano.
    for (const testo of ["/compact", "/models", "/newsletter", "/clearly"]) {
      expect([testo, (await chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo })).stato]).toEqual([testo, 202])
    }
  })

  test("la risposta di un comando locale (`/compact`) è un messaggio di Claude; vale anche l'errore, e un'uscita vuota non mostra niente", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "/compact")
    q.emetti(
      init,
      { type: "system", subtype: "status", status: "compacting", uuid: "u1", session_id: "x" },
      { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 1000 }, uuid: "u2", session_id: "x" },
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: "Il riassunto che Claude Code scrive per sé" } },
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" } },
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "<local-command-stderr>Errore: troppo corta</local-command-stderr>" } },
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "<local-command-stdout></local-command-stdout>" } },
      risultato({ num_turns: 0 }),
    )
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    const d = (await dettaglio(c, id)).corpo
    expect(d.messaggi.map((m) => m.ruolo)).toEqual(["utente", "claude"])
    expect(d.messaggi[1]?.parti).toEqual([
      { tipo: "testo", testo: "Compacted" },
      { tipo: "testo", testo: "Errore: troppo corta" },
      { tipo: "fine", costo: 0.05, durata_ms: 1200, lavoro_ms: expect.any(Number) },
    ])
  })

  test("`/rename` cambia il titolo della conversazione: l'evento, l'elenco e la lettura lo dicono, anche prima che il file lo riporti", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c, "/rename Pulizia")
    c.sessioni.voci = [{ id, titolo: "/rename Pulizia", aggiornata: 1 }]
    const ascolto = await ascolta(c.a)
    q.emetti(init, { type: "system", subtype: "session_title_changed", title: "Pulizia del disco" }, ...testoAPezzi("msg_1", ["Fatto."]), risultato({ num_turns: 1 }))
    await aspetta(() => eventiChat(ascolto, id).some((e) => e.evento === "titolo"))
    expect(eventiChat(ascolto, id).filter((e) => e.evento === "titolo")).toEqual([{ tipo: "chat", id, evento: "titolo", titolo: "Pulizia del disco" }])
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "pronta")
    expect((await dettaglio(c, id)).corpo.titolo).toBe("Pulizia del disco")
    expect((await chiama<{ id: string; titolo: string }[]>(c.a, "GET", "/api/chat")).corpo.find((v) => v.id === id)?.titolo).toBe("Pulizia del disco")

    const lungo = "Un titolo che non finisce più, scritto apposta molto più lungo di sessanta caratteri"
    q.emetti({ type: "system", subtype: "session_title_changed", title: lungo })
    await aspetta(async () => (await dettaglio(c, id)).corpo.titolo !== "Pulizia del disco")
    expect((await dettaglio(c, id)).corpo.titolo).toBe("Un titolo che non finisce più, scritto apposta molto più lu…")
    ascolto.chiudi()
  })

  test("un conversation_reset che arriva comunque si scrive nel registro con il suo motivo, e nient'altro", async () => {
    const c = await avvia()
    const { id, q } = await nuova(c)
    const registro = spyOn(console, "error").mockImplementation(() => undefined)
    try {
      q.emetti(init, { type: "conversation_reset", new_conversation_id: "22222222-2222-4222-8222-222222222222", trigger: "plan_mode_exit", uuid: "u1", session_id: "x" })
      await aspetta(() => registro.mock.calls.length > 0)
      expect(registro.mock.calls.map((riga) => riga.join(" ")).join(" | ")).toContain("plan_mode_exit")
      expect(registro.mock.calls).toHaveLength(1)
    } finally {
      registro.mockRestore()
    }
    expect((await dettaglio(c, id)).corpo).toMatchObject({ id, stato: "lavora", attiva: true })
    expect((await dettaglio(c, id)).corpo.messaggi).toHaveLength(1)
  })

  describe("riletti dal file", () => {
    const riga = (type: string, uuid: string, message: unknown, extra: object = {}): MessaggioSessione => ({ type, uuid, message, timestamp: "2026-10-30T10:00:00.000Z", ...extra })
    const comando = (nome: string, args: string): unknown => ({ role: "user", content: `<command-name>/${nome}</command-name>\n            <command-message>${nome}</command-message>\n            <command-args>${args}</command-args>` })
    const locale = (uuid: string, uscita: string, tag = "stdout") => riga("system", uuid, undefined, { subtype: "local_command", content: `<local-command-${tag}>${uscita}</local-command-${tag}>` })

    test("un comando è un messaggio del creator e la sua risposta un messaggio di Claude", async () => {
      const c = await avvia()
      const id = "11111111-1111-4111-8111-111111111111"
      c.sessioni.voci = [{ id, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
      c.sessioni.file.set(id, [
        riga("user", "u0", { role: "user", content: "<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>" }),
        riga("user", "c1", comando("model", "sonnet")),
        locale("s1", "Set model to Sonnet 5.5"),
        riga("user", "c2", comando("context", "")),
        riga("system", "s2", undefined, { subtype: "informational", content: "un avviso che la chat non mostra" }),
        locale("s3", "Contesto: 12%"),
        riga("user", "c3", comando("rename", "Pulizia")),
        locale("s4", ""),
        riga("user", "c4", comando("compact", "")),
        locale("s5", "Errore: troppo corta", "stderr"),
        riga("user", "u1", { role: "user", content: "Ciao" }, { origin: { kind: "human" } }),
        riga("assistant", "a1", { content: [{ type: "text", text: "Eccomi." }] }),
      ])
      const d = await dettaglio(c, id)
      expect(d.stato).toBe(200)
      expect(d.corpo.messaggi.map((m) => [m.ruolo, m.parti])).toEqual([
        ["utente", [{ tipo: "testo", testo: "/model sonnet" }]],
        ["claude", [{ tipo: "testo", testo: "Set model to Sonnet 5.5" }]],
        ["utente", [{ tipo: "testo", testo: "/context" }]],
        ["claude", [{ tipo: "testo", testo: "Contesto: 12%" }]],
        ["utente", [{ tipo: "testo", testo: "/rename Pulizia" }]],
        ["utente", [{ tipo: "testo", testo: "/compact" }]],
        ["claude", [{ tipo: "testo", testo: "Errore: troppo corta" }]],
        ["utente", [{ tipo: "testo", testo: "Ciao" }]],
        ["claude", [{ tipo: "testo", testo: "Eccomi." }]],
      ])
    })

    test("dopo un riassunto si vede solo ciò che segue il riassunto, come nel terminale", async () => {
      const c = await avvia()
      const id = "33333333-3333-4333-8333-333333333333"
      c.sessioni.voci = [{ id, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
      c.sessioni.file.set(id, [
        riga("user", "u0", { role: "user", content: "Prima" }, { origin: { kind: "human" } }),
        riga("assistant", "a0", { content: [{ type: "text", text: "Risposta di prima." }] }),
        riga("system", "s1", undefined, { subtype: "compact_boundary" }),
        riga("user", "u1", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
        riga("user", "u2", { role: "user", content: "Dopo" }, { origin: { kind: "human" } }),
        riga("assistant", "a1", { content: [{ type: "text", text: "Risposta di dopo." }] }),
        riga("system", "s2", undefined, { subtype: "compact_boundary" }),
        riga("user", "u3", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
        riga("user", "u4", { role: "user", content: "Ultimo" }, { origin: { kind: "human" } }),
      ])
      expect((await dettaglio(c, id)).corpo.messaggi.map((m) => [m.ruolo, m.parti])).toEqual([["utente", [{ tipo: "testo", testo: "Ultimo" }]]])
    })

    test("la risposta di /compact, che il file scrive come riga dell'utente, è un messaggio di Claude", async () => {
      const c = await avvia()
      const id = "22222222-2222-4222-8222-222222222222"
      c.sessioni.voci = [{ id, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:05:00Z") }]
      // Com'è nel file di una sessione vera dopo /compact.
      c.sessioni.file.set(id, [
        riga("system", "s1", undefined, { subtype: "compact_boundary", content: "Conversation compacted" }),
        riga("user", "u1", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
        riga("user", "u2", { role: "user", content: "<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>" }),
        riga("user", "c1", comando("compact", "")),
        riga("user", "u3", { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" }),
      ])
      expect((await dettaglio(c, id)).corpo.messaggi.map((m) => [m.ruolo, m.parti])).toEqual([
        ["utente", [{ tipo: "testo", testo: "/compact" }]],
        ["claude", [{ tipo: "testo", testo: "Compacted" }]],
      ])
    })
  })
})

describe("chiudere una conversazione", () => {
  /** Una conversazione aperta qui che ha anche il suo file, come tutte quelle vere: dopo la chiusura si rilegge da lì. */
  async function conFile(c: Avvio, testo = "Ciao") {
    const aperta = await nuova(c, testo)
    c.sessioni.voci = [{ id: aperta.id, titolo: testo, aggiornata: 1 }]
    c.sessioni.file.set(aperta.id, [])
    return aperta
  }
  const chiudi = (c: Avvio, id: string) => chiama<{ ok?: boolean; errore?: string }>(c.a, "POST", `/api/chat/${id}/chiudi`)
  const attiva = async (c: Avvio, id: string) => (await chiama<{ id: string; attiva: boolean }[]>(c.a, "GET", "/api/chat")).corpo.find((v) => v.id === id)?.attiva

  test("ferma Claude, nega le richieste in attesa, spegne il processo e lo dice con gli eventi; senza lasciare un errore", async () => {
    const c = await avvia()
    const { id, q } = await conFile(c)
    const ascolto = await ascolta(c.a)
    q.emetti(init, ...testoAPezzi("msg_1", ["comincio"]))
    const attesa = q.chiediPermesso("Bash", { command: "sleep 100" }, "toolu_p1")
    await aspetta(async () => (await dettaglio(c, id)).corpo.stato === "aspetta")
    expect(await attiva(c, id)).toBe(true)

    const r = await chiudi(c, id)
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual({ ok: true })
    expect(q.interrotta).toBe(1)
    expect(q.chiusa).toBe(true)
    expect(await attesa).toMatchObject({ behavior: "deny" })

    await aspetta(() => eventiChat(ascolto, id).some((e) => e.evento === "chiusa"))
    const eventi = eventiChat(ascolto, id)
    expect(eventi.filter((e) => e.evento === "stato").at(-1)).toMatchObject({ stato: "pronta" })
    expect(eventi.some((e) => e.evento === "elenco")).toBe(true)
    expect(JSON.stringify(eventi)).not.toContain("chiuso prima")
    expect(eventi.some((e) => e.evento === "parte" && e.parte.tipo === "fine" && e.parte.errore !== undefined)).toBe(false)
    expect(await attiva(c, id)).toBe(false)
    expect((await dettaglio(c, id)).corpo).toMatchObject({ attiva: false, stato: "pronta" })
    ascolto.chiudi()
  })

  test("è 200 anche se la conversazione era già chiusa, e 404 se non c'è", async () => {
    const c = await avvia()
    const { id } = await conFile(c)
    const soloFile = "33333333-3333-4333-8333-333333333333"
    c.sessioni.voci.push({ id: soloFile, titolo: "vecchia", aggiornata: 1 })
    expect((await chiudi(c, id)).stato).toBe(200)
    expect((await chiudi(c, id)).stato).toBe(200)
    expect(c.finto.queries.filter((q) => !q.chiusa)).toHaveLength(0)

    expect((await chiudi(c, soloFile)).stato).toBe(200)
    expect(c.finto.queries).toHaveLength(1)

    const manca = await chiudi(c, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    expect(manca.stato).toBe(404)
    expect(manca.corpo.errore).toContain("Non c'è una conversazione")
    expect((await chiudi(c, "non-un-id")).stato).toBe(404)
  })

  test("un messaggio che arriva mentre si chiude aspetta la chiusura e riapre la conversazione con resume, una volta sola", async () => {
    const c = await avvia()
    const { id, q } = await conFile(c)
    let finisci = (): void => undefined
    q.chiusuraLenta = new Promise<void>((risolvi) => {
      finisci = risolvi
    })
    const chiusura = chiudi(c, id)
    await aspetta(() => q.chiusa)
    const messaggio = chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "ancora" })
    await Bun.sleep(150)
    expect(c.finto.queries).toHaveLength(1)

    finisci()
    expect((await chiusura).stato).toBe(200)
    expect((await messaggio).stato).toBe(202)
    const q2 = await aspetta(() => c.finto.queries[1])
    expect(q2.opzioni.resume).toBe(id)
    await aspetta(() => q2.ricevuti.length === 1)
    expect(q.ricevuti).toHaveLength(1)
    expect(c.finto.queries).toHaveLength(2)
    expect(await attiva(c, id)).toBe(true)
  })

  test("una conversazione che si sta aprendo si chiude con la sua apertura: nessun processo resta acceso", async () => {
    const c = await avvia()
    const id = "11111111-1111-4111-8111-111111111111"
    c.sessioni.voci = [{ id, titolo: "vecchia", aggiornata: 1 }]
    c.sessioni.file.set(id, [])
    let sblocca = (): void => undefined
    c.sessioni.blocca = new Promise<void>((risolvi) => {
      sblocca = risolvi
    })
    const messaggio = chiama(c.a, "POST", `/api/chat/${id}/messaggi`, { testo: "uno" })
    await Bun.sleep(100)
    const chiusura = chiudi(c, id)
    await Bun.sleep(100)
    sblocca()
    expect((await chiusura).stato).toBe(200)
    expect((await messaggio).stato).toBe(202)
    // Il messaggio era arrivato prima della chiusura: parte, e la chiusura lo spegne con il resto.
    expect(c.finto.queries.map((q) => [q.chiusa, q.ricevuti.length, q.opzioni.resume])).toEqual([[true, 1, id]])
    expect(await attiva(c, id)).toBe(false)
  })

  test("«Chiudi» due volte insieme chiude una volta sola", async () => {
    const c = await avvia()
    const { id, q } = await conFile(c)
    q.emetti(init, ...testoAPezzi("msg_1", ["comincio"]))
    const [uno, due] = await Promise.all([chiudi(c, id), chiudi(c, id)])
    expect([uno.stato, due.stato]).toEqual([200, 200])
    expect(q.interrotta).toBe(1)
  })
})
