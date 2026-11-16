// La prova di confronto della chat: fissa ciò che la chat fa oggi, guidandola solo da fuori (`Chat`, `MangoCode` e i tipi).
// Per ogni scenario si guardano gli eventi che la chat emette, nell'ordine, e ciò che `leggi` ed `elenco` rispondono; il tutto
// in un'istantanea. L'orologio avanza solo quando la prova lo dice, così le istantanee non dipendono da quante volte il codice lo legge.
import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Chat } from "../src/chat/chat"
import { ClaudeCode } from "../src/chat/claude/claude"
import type { FunzioneQuery, MessaggioSessione, Sessioni } from "../src/chat/claude/query"
import { MangoCode } from "../src/chat/mangocode"
import { ErroreChat, type EventoChat } from "../src/chat/tipi"
import { Eventi, type Messaggio } from "../src/eventi"
import { Frase, type Lingua } from "../src/lingua"
import { esitoDi, FintaQuery, Finto, FinteSessioni, FintoMangoCode, fermaIServerFinti, init, risultato, SENZA_SESSIONI, SESSIONE, SOLO_I_MODELLI_DI_CLAUDE, testoAPezzi } from "./aiuti-chat"

type Oggetto = Record<string, unknown>

const INIZIO = Date.parse("2026-10-30T10:00:00.000Z")
const ALTRO_FILE = "/esterno/nota.txt"
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"))
const TESTO_LUNGO = "0123456789".repeat(2500)

class Orologio {
  private ms = INIZIO

  constructor() {
    setSystemTime(new Date(INIZIO))
  }

  readonly adesso = (): Date => new Date(this.ms)

  avanza(ms: number): void {
    this.ms += ms
    setSystemTime(new Date(this.ms))
  }
}

class EventiRegistrati extends Eventi {
  readonly messaggi: Messaggio[] = []

  constructor() {
    super(1000)
  }

  override emetti(messaggio: Messaggio): void {
    this.messaggi.push(structuredClone(messaggio))
  }
}

async function aspettaChe(condizione: () => boolean, cosa: string): Promise<void> {
  for (let giro = 0; giro < 1500; giro++) {
    if (condizione()) return
    await Bun.sleep(2)
  }
  throw new Error(`Non è successo: ${cosa}`)
}

/** Tutto ciò che la query ha emesso è stato preso e lavorato, comprese le promesse che ne sono nate. */
async function assesta(q: FintaQuery): Promise<void> {
  for (let giro = 0; giro < 1500; giro++) {
    if (q.consumati) {
      await Bun.sleep(1)
      if (q.consumati) return
    } else {
      await Bun.sleep(2)
    }
  }
  throw new Error("La query non ha preso i messaggi emessi")
}

function normalizza(valore: unknown, nomi: Map<string, string>): unknown {
  if (typeof valore === "string") {
    const testo = [...nomi].reduce((corrente, [da, a]) => corrente.replaceAll(da, a), valore).replace(/(alle|at) dd:dd/g, "$1 HH:MM")
    return testo.length <= 300 ? testo : `<${testo.length} caratteri, sha256 ${createHash("sha256").update(testo).digest("hex")}>…${testo.slice(-60)}`
  }
  if (valore instanceof Frase) return { it: normalizza(valore.it, nomi), en: normalizza(valore.en, nomi) }
  if (Array.isArray(valore)) return valore.map((v) => normalizza(v, nomi))
  if (typeof valore === "object" && valore !== null) return Object.fromEntries(Object.entries(valore).map(([chiave, v]) => [chiave, normalizza(v, nomi)]))
  return valore
}

interface OpzioniBanco {
  /** Con Mango Code acceso (un Mango Code finto) invece di spento. */
  mango?: boolean
}

const banchi: Banco[] = []

class Banco {
  readonly orologio = new Orologio()
  readonly eventi = new EventiRegistrati()
  readonly finto = new Finto()
  readonly sessioni = new FinteSessioni()
  readonly mc: FintoMangoCode | null
  readonly note: { etichetta: string; valore: unknown }[] = []
  lingua: Lingua = "it"
  chat!: Chat
  private readonly nomi = new Map<string, string>()

  private constructor(
    readonly radice: string,
    readonly codice: string,
    readonly archivio: string,
    mango: boolean,
  ) {
    this.mc = mango ? new FintoMangoCode() : null
  }

  static async apri(opzioni: OpzioniBanco = {}): Promise<Banco> {
    const radice = await mkdtemp(join(tmpdir(), "mango-confronto-"))
    const codice = join(radice, "codice")
    const archivio = join(radice, "archivio")
    await mkdir(codice, { recursive: true })
    await mkdir(archivio, { recursive: true })
    const banco = new Banco(radice, codice, archivio, opzioni.mango === true)
    const dati = join(radice, "dati-di-mango-code")
    if (banco.mc) await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, agent: banco.mc.url, engine: banco.mc.url, window: false }))
    const query: FunzioneQuery = opzioni.mango === true ? SOLO_I_MODELLI_DI_CLAUDE : banco.finto.query
    const sessioni: Sessioni = opzioni.mango === true ? SENZA_SESSIONI : banco.sessioni
    banco.chat = new Chat({
      codice,
      lavoro: radice,
      archivio,
      eventi: banco.eventi,
      // Il registro di Mango Code lo scrive un lavoro in coda, a un istante che la prova non governa: il suo orologio resta fermo.
      opzioni: { motori: [new ClaudeCode(query, sessioni), new MangoCode({ dati, archivio, adesso: () => new Date(INIZIO) })] },
      titoloDelVideo: (slug) => (slug === "orto" ? "L'orto [prova]" : undefined),
      adesso: banco.orologio.adesso,
      lingua: () => banco.lingua,
    })
    banco.nomi.set(radice, "<radice>")
    banco.nomi.set(radice.replaceAll("\\", "/"), "<radice>")
    banchi.push(banco)
    return banco
  }

  passa(ms: number): void {
    this.orologio.avanza(ms)
  }

  nomina(id: string, nome: string): void {
    this.nomi.set(id, nome)
  }

  nota(etichetta: string, valore: unknown): void {
    this.note.push({ etichetta, valore })
  }

  /** Lo scenario tenta qualcosa che può essere rifiutato: l'esito o la frase dell'errore vanno nelle note. */
  async tenta<T>(etichetta: string, azione: () => Promise<T>): Promise<T | undefined> {
    try {
      const esito = await azione()
      this.nota(etichetta, esito === undefined ? "fatto" : esito)
      return esito
    } catch (errore) {
      this.nota(etichetta, errore instanceof ErroreChat ? { errore: { stato: errore.stato, it: errore.testo.it, en: errore.testo.en } } : { errore: errore instanceof Error ? errore.message : String(errore) })
      return undefined
    }
  }

  /** Una conversazione nuova di Claude Code, con la sua query. */
  async nuova(corpo: Oggetto, nome = "CONV"): Promise<{ id: string; q: FintaQuery }> {
    const id = await this.chat.crea(corpo)
    this.nomina(id, nome)
    const q = await this.conQuery(id)
    return { id, q }
  }

  async conQuery(id: string): Promise<FintaQuery> {
    await aspettaChe(() => this.finto.queries.some((q) => q.opzioni.sessionId === id || q.opzioni.resume === id), "la query della conversazione è partita")
    const q = this.finto.queries.findLast((corrente) => corrente.opzioni.sessionId === id || corrente.opzioni.resume === id)
    if (!q) throw new Error("query non trovata")
    return q
  }

  async manda(q: FintaQuery, ...messaggi: object[]): Promise<void> {
    q.emetti(...messaggi)
    await assesta(q)
  }

  /** Una conversazione nuova di Mango Code, quando il suo primo messaggio è arrivato a Mango Code. */
  async nuovaMango(testo: string): Promise<string> {
    const mc = this.mc
    if (!mc) throw new Error("Mango Code non è acceso in questo banco")
    const prima = mc.di(`/session/${SESSIONE}/prompt_async`).length
    const id = await this.chat.crea({ testo, modello: "mango-code/toq" })
    this.nomina(id, "CONV")
    await aspettaChe(() => mc.di(`/session/${SESSIONE}/prompt_async`).length === prima + 1, "il messaggio è arrivato a Mango Code")
    return id
  }

  eventiChat(): EventoChat[] {
    return this.eventi.messaggi.filter((m): m is EventoChat => m.tipo === "chat")
  }

  conta(evento: EventoChat["evento"], filtro: (e: EventoChat) => boolean = () => true): number {
    return this.eventiChat().filter((e) => e.evento === evento && filtro(e)).length
  }

  async attendi(evento: EventoChat["evento"], filtro: (e: EventoChat) => boolean = () => true, volte = 1): Promise<void> {
    await aspettaChe(() => this.conta(evento, filtro) >= volte, `l'evento «${evento}» è arrivato`)
  }

  async attendiStato(stato: string, volte = 1): Promise<void> {
    await this.attendi("stato", (e) => e.evento === "stato" && e.stato === stato, volte)
  }

  async foto(): Promise<unknown> {
    const eventi = this.eventi.messaggi
    const conversazioni: Record<string, unknown> = {}
    for (const [id, nome] of this.nomi) if (nome !== "<radice>") conversazioni[nome] = await this.chat.leggi(id)
    return normalizza({ eventi, note: this.note, conversazioni, elenco: await this.chat.elenco() }, this.nomi)
  }

  async chiudi(): Promise<void> {
    await this.chat.chiudi()
    await rm(this.radice, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

let registro: { mockRestore: () => void }

beforeEach(() => {
  registro = spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(async () => {
  registro.mockRestore()
  for (const banco of banchi.splice(0)) await banco.chiudi()
  fermaIServerFinti()
  setSystemTime()
})

// --- Pezzi di messaggi dell'SDK ---------------------------------------------------------------------

const flusso = (event: object): object => ({ type: "stream_event", parent_tool_use_id: null, event })
const inizioDel = (id: string): object => flusso({ type: "message_start", message: { id } })
const pezzoDi = (indice: number, delta: object): object => flusso({ type: "content_block_delta", index: indice, delta })
const pezzoDiTesto = (indice: number, testo: string): object => pezzoDi(indice, { type: "text_delta", text: testo })
const pezzoDiPensiero = (indice: number, testo: string): object => pezzoDi(indice, { type: "thinking_delta", thinking: testo })
const completo = (id: string, content: object[], extra: object = {}): object => ({ type: "assistant", parent_tool_use_id: null, message: { id, content }, ...extra })
const strumento = (indice: number, id: string, nome: string, pezzi: string[]): object[] => [
  flusso({ type: "content_block_start", index: indice, content_block: { type: "tool_use", id, name: nome, input: {} } }),
  ...pezzi.map((pezzo) => pezzoDi(indice, { type: "input_json_delta", partial_json: pezzo })),
  flusso({ type: "content_block_stop", index: indice }),
]
const sistema = (subtype: string, resto: object): object => ({ type: "system", subtype, ...resto })
const limite = (status: string, resetsAt?: number): object => ({ type: "rate_limit_event", rate_limit_info: { status, ...(resetsAt === undefined ? {} : { resetsAt }) }, uuid: "u", session_id: "s" })
const secondi = (iso: string): number => Date.parse(iso) / 1000
const domanda = (testo: string, opzioni: string[], multiSelect = false): object => ({ question: testo, header: "Scelta", multiSelect, options: opzioni.map((etichetta) => ({ label: etichetta, description: `${etichetta}, descritto` })) })

/** Un nuovo giro di una conversazione già aperta: il messaggio del creator e il tempo che passa. */
async function giro(b: Banco, id: string, testo: string): Promise<void> {
  await b.chat.scrivi(id, { testo })
  b.passa(1_000)
}

/** Come `giro`, ma il tempo passa solo quando il messaggio è arrivato a Mango Code: da lì ne conta la durata. */
async function giroMango(b: Banco, mc: FintoMangoCode, id: string, testo: string, numero: number): Promise<void> {
  await b.chat.scrivi(id, { testo })
  await aspettaChe(() => mc.di(`/session/${SESSIONE}/prompt_async`).length === numero, `il messaggio ${numero} è arrivato a Mango Code`)
  b.passa(1_000)
}

// --- Claude Code, in diretta ------------------------------------------------------------------------

describe("Claude Code, in diretta", () => {
  test("1 · il testo arriva a pezzi, il messaggio completo non lo raddoppia, il risultato porta costo e durata", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Rispondi solo: pronto" })
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["pro", "", "nto"]))
    b.passa(2_000)
    await b.manda(q, risultato({ duration_ms: 3_000, total_cost_usd: 0.0123 }))
    expect(await b.foto()).toMatchSnapshot()
  })

  test("2 · il ragionamento arriva a pezzi, poi il testo", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Pensa e rispondi" })
    b.passa(1_000)
    await b.manda(
      q,
      init,
      inizioDel("msg_1"),
      flusso({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
      pezzoDiPensiero(0, "Devo "),
      pezzoDiPensiero(0, ""),
      pezzoDiPensiero(0, "guardare."),
      flusso({ type: "content_block_stop", index: 0 }),
      flusso({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
      pezzoDiTesto(1, "Ecco "),
      pezzoDiTesto(1, "fatto."),
      completo("msg_1", [
        { type: "thinking", thinking: "Devo guardare." },
        { type: "text", text: "Ecco fatto." },
      ]),
      flusso({ type: "content_block_stop", index: 1 }),
    )
    b.passa(1_500)
    await b.manda(q, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("3 · gli strumenti: ingresso a pezzi, esito di testo, errore, immagine, ingresso troncato, esito oltre il limite", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Quanti video ci sono?" })
    b.passa(1_000)
    await b.manda(
      q,
      init,
      inizioDel("msg_1"),
      pezzoDiTesto(0, "Controllo."),
      ...strumento(1, "toolu_1", "mcp__video__video_elenco", []),
      ...strumento(2, "toolu_2", "Bash", ['{"command":', '"ls /x"}']),
      ...strumento(3, "toolu_3", "mcp__video__foto", ['{"slug":"a","secondi":[3]}']),
      ...strumento(4, "toolu_4", "Bash", ['{"command":"tr']),
      ...strumento(5, "toolu_5", "Read", ['{"file_path":"a"}']),
      completo("msg_1", [{ type: "tool_use", id: "toolu_1", name: "mcp__video__video_elenco", input: {} }]),
    )
    b.passa(2_000)
    await b.manda(q, esitoDi("toolu_1", [{ type: "text", text: '[{"slug":"a"}]' }]))
    b.passa(1_000)
    await b.manda(
      q,
      esitoDi("toolu_2", "ls: cannot access '/x'", true),
      esitoDi("toolu_3", [
        { type: "text", text: "Secondo 3" },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
        { type: "image", source: { type: "url", url: "https://esempio.test/a.png" } },
      ]),
      esitoDi("toolu_4", "", true),
      esitoDi("toolu_sconosciuto", "di nessuno"),
    )
    b.passa(1_000)
    await b.manda(
      q,
      inizioDel("msg_2"),
      ...strumento(0, "toolu_6", "Bash", ['{"command":"cat grande"}']),
      esitoDi("toolu_6", TESTO_LUNGO),
      esitoDi("toolu_5", [
        { type: "text", text: "uno" },
        { type: "text", text: "due" },
      ]),
    )
    b.passa(500)
    await b.manda(q, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("4 · un messaggio completo che non è mai arrivato a pezzi aggiunge i suoi blocchi", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Leggi il file" })
    b.passa(1_000)
    await b.manda(
      q,
      init,
      completo("msg_9", [
        { type: "thinking", thinking: "" },
        { type: "thinking", thinking: "ragiono" },
        { type: "text", text: "" },
        { type: "text", text: "Ecco" },
        { type: "redacted_thinking", data: "x" },
        { type: "tool_use", name: "SenzaId", input: {} },
        { type: "tool_use", id: "toolu_9", name: "Read", input: { file_path: "a" } },
        { type: "tool_use", id: "toolu_10", name: "Glob" },
      ]),
      { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "senza id" }] } },
    )
    b.passa(1_000)
    await b.manda(q, esitoDi("toolu_9", "contenuto"), risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("5 · i messaggi dei sottoagenti non entrano nella chat", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Fai fare a un sottoagente" })
    b.passa(1_000)
    await b.manda(
      q,
      init,
      { type: "stream_event", parent_tool_use_id: "toolu_agente", event: { type: "message_start", message: { id: "sub_1" } } },
      { type: "stream_event", parent_tool_use_id: "toolu_agente", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "dentro" } } },
      completo("sub_1", [{ type: "text", text: "dentro il sottoagente" }], { parent_tool_use_id: "toolu_agente" }),
      { type: "assistant", parent_tool_use_id: "toolu_agente", message: { id: "sub_2", content: [{ type: "text", text: "altro" }], usage: { input_tokens: 900_000, output_tokens: 1 } } },
      { type: "user", parent_tool_use_id: "toolu_agente", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_x", content: "esito del sottoagente" }] } },
      ...testoAPezzi("msg_1", ["Il sottoagente ha finito."]),
    )
    b.passa(1_000)
    await b.manda(q, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("6 · l'uscita di un comando locale è un messaggio di Claude; l'errore pure, un'uscita vuota niente", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "/compact" })
    b.passa(1_000)
    await b.manda(
      q,
      init,
      sistema("status", { status: "compacting" }),
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" } },
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "  <local-command-stderr>Errore: troppo corta</local-command-stderr>\n" } },
      { type: "user", parent_tool_use_id: null, isReplay: true, message: { role: "user", content: "<local-command-stdout></local-command-stdout>" } },
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: "Il riassunto che Claude Code scrive per sé" } },
      { type: "user", parent_tool_use_id: null, message: { role: "user", content: [{ type: "text", text: "<local-command-stdout>in un blocco</local-command-stdout>" }] } },
      risultato({ num_turns: 0 }),
    )
    b.passa(1_000)
    await giro(b, id, "/context")
    await b.manda(q, { type: "user", parent_tool_use_id: null, message: { role: "user", content: "<local-command-stdout>Contesto: 12%</local-command-stdout>" } }, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("7a · i risultati: troppi passaggi, errori, limite di spesa, esito vuoto, sottotipo sconosciuto, nessun costo né durata", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Primo giro" })
    b.passa(1_000)
    const casi: object[] = [
      risultato({ subtype: "error_max_turns", is_error: true }),
      risultato({ subtype: "error_during_execution", is_error: true, errors: ["manca la rete", "riprova più tardi."] }),
      risultato({ subtype: "error_during_execution", is_error: true, result: "  Boom...  " }),
      risultato({ subtype: "error_during_execution", is_error: true }),
      risultato({ is_error: true, result: "Credit balance is too low" }),
      risultato({ is_error: true, result: "" }),
      risultato({ subtype: "error_max_budget_usd", is_error: true }),
      risultato({ subtype: "error_max_structured_output_retries", is_error: true }),
      { type: "result", subtype: "success", is_error: false, result: "" },
    ]
    await b.manda(q, init, ...testoAPezzi("msg_0", ["Comincio."]), casi[0] ?? {})
    for (const [numero, caso] of casi.slice(1).entries()) {
      await giro(b, id, `Giro ${numero + 2}`)
      await b.manda(q, ...testoAPezzi(`msg_${numero + 1}`, [`Risposta ${numero + 2}`]), caso)
      b.passa(500)
    }
    expect(await b.foto()).toMatchSnapshot()
  })

  test("7b · i codici d'errore di Claude e il limite dell'abbonamento, con e senza l'ora in cui si libera", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Giro 1" })
    b.passa(1_000)
    const conErrore = (codice: string, numero: number): object[] => [completo(`m_${numero}`, [{ type: "text", text: "x" }], { error: codice }), risultato({ is_error: true, result: "x" })]
    const codici = ["authentication_failed", "overloaded", "billing_error", "account_on_hold", "oauth_org_not_allowed", "verification_required", "max_output_tokens", "codice_mai_visto"]
    await b.manda(q, init, ...conErrore("rate_limit", 0))
    for (const [numero, codice] of codici.entries()) {
      await giro(b, id, `Giro ${numero + 2}`)
      await b.manda(q, ...conErrore(codice, numero + 1))
    }
    const limiti: [string, object[]][] = [
      ["oggi", [limite("rejected", secondi("2026-10-30T10:40:00Z"))]],
      ["un altro giorno", [limite("rejected", secondi("2026-11-01T11:00:00Z"))]],
      ["già passato", [limite("rejected", secondi("2026-10-30T08:00:00Z"))]],
      ["senza ora", [limite("rejected")]],
      ["solo un avviso", [limite("allowed_warning", secondi("2026-10-30T10:40:00Z"))]],
    ]
    for (const [numero, [, avvisi]] of limiti.entries()) {
      await giro(b, id, `Limite ${numero + 1}`)
      await b.manda(q, ...avvisi, ...conErrore("rate_limit", 20 + numero))
    }
    b.lingua = "en"
    await giro(b, id, "Limit in English")
    await b.manda(q, limite("rejected", secondi("2026-11-01T11:00:00Z")), ...conErrore("rate_limit", 30))
    await giro(b, id, "Auth in English")
    await b.manda(q, ...conErrore("authentication_failed", 31))
    await giro(b, id, "Error in English")
    await b.manda(q, risultato({ subtype: "error_during_execution", is_error: true, errors: ["no network"] }))
    expect(await b.foto()).toMatchSnapshot()
  })

  test("7c · un giro fermato dal creator non è un errore; i messaggi in coda tengono il giro aperto", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Lavora a lungo" })
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["Comincio."]))
    b.passa(2_000)
    await b.tenta("ferma con la query in corso", () => b.chat.ferma(id))
    await b.manda(q, risultato({ subtype: "error_during_execution", is_error: true, errors: ["interrupted"] }))
    b.nota("interruzioni", q.interrotta)
    await b.tenta("ferma a conversazione pronta", () => b.chat.ferma(id))
    b.nota("interruzioni dopo", q.interrotta)

    await giro(b, id, "Secondo")
    await b.tenta("messaggio mentre Claude lavora", () => b.chat.scrivi(id, { testo: "Anzi, fai un'altra cosa" }))
    await b.manda(q, ...testoAPezzi("msg_2", ["Uno."]))
    b.passa(1_000)
    await b.manda(q, risultato({ queued_turn_count: 1, duration_ms: 800 }))
    b.passa(1_000)
    await b.manda(q, ...testoAPezzi("msg_3", ["Due."]))
    b.passa(1_000)
    await b.manda(q, risultato({ queued_turn_count: 0, duration_ms: 900 }))
    expect(await b.foto()).toMatchSnapshot()
  })

  test("8 · il contesto: usage di una risposta e dei pezzi, misura a fine giro, riassunto, sottoagenti, misure che non dicono niente", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Quanto contesto?" })
    const risposta = (id: string, usage: object, extra: object = {}): object => completo(id, [{ type: "text", text: "ok" }], { ...extra, message: { id, content: [{ type: "text", text: "ok" }], usage } })
    const delta = (usage: object): object => flusso({ type: "message_delta", usage })
    q.misura = { totalTokens: 52_000, rawMaxTokens: 200_000 }
    b.passa(1_000)
    await b.manda(q, init, delta({ input_tokens: 3_000, output_tokens: 20 }), delta({ output_tokens: 50 }), risposta("msg_1", { input_tokens: 10, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 990, output_tokens: 100 }))
    await b.manda(q, risposta("msg_s", { input_tokens: 900_000, output_tokens: 1 }, { parent_tool_use_id: "toolu_x" }), risultato())
    await b.attendi("contesto_usato", (e) => e.evento === "contesto_usato" && e.contesto_usato?.totale === 200_000)
    b.passa(1_000)
    await b.manda(q, risposta("msg_2", { input_tokens: 60_000, output_tokens: 500 }))
    // Il conto dei token arriva anche a giro finito e non lo riapre.
    await b.manda(q, delta({ input_tokens: 61_000, output_tokens: 80 }))

    await giro(b, id, "Misura a zero")
    q.misura = { totalTokens: 0, rawMaxTokens: 0 }
    await b.manda(q, risultato())
    await giro(b, id, "Misura che fallisce")
    q.rifiutaLaMisura = "non risponde"
    await b.manda(q, risultato())
    q.rifiutaLaMisura = null
    b.nota("misure chieste", q.misureChieste)

    await giro(b, id, "Riassunto")
    await b.manda(q, sistema("compact_boundary", { compact_metadata: { trigger: "auto", pre_tokens: 190_000 } }))
    await b.manda(q, risposta("msg_3", { input_tokens: 8_000, output_tokens: 400 }), risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("9 · i lavori in corso: primo piano, background, avanzamento, aggiornamenti, notifiche, elenco dell'SDK, giro e processo che finiscono", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Lancia dei lavori" })
    const partito = (task: string, extra: object = {}): object => sistema("task_started", { task_id: task, tool_use_id: `toolu_${task}`, description: `Lavoro ${task}`, task_type: "local_bash", is_backgrounded: false, ...extra })
    const avanza = (task: string, token: number, strumenti: number): object => sistema("task_progress", { task_id: task, description: `Lavoro ${task}`, usage: { total_tokens: token, tool_uses: strumenti, duration_ms: 1_000 } })
    const livello = (...tasks: { task_id: string; task_type?: string; ambient?: boolean; parent_task_id?: string }[]): object => sistema("background_tasks_changed", { tasks: tasks.map((t) => ({ task_type: "local_bash", description: `Lavoro ${t.task_id}`, ...t })) })
    b.passa(1_000)
    await b.tenta("in background senza lavori", () => b.chat.inBackground(id))
    await b.manda(q, init, partito("b1"))
    b.passa(1_000)
    await b.tenta("in background con un lavoro in primo piano", () => b.chat.inBackground(id))
    b.nota("in background chiesti", q.inBackground)
    await b.manda(q, sistema("task_updated", { task_id: "b1", patch: { is_backgrounded: true, description: "Lavoro b1, rinominato" } }))
    await b.manda(q, partito("a1", { task_type: "local_agent", is_backgrounded: true }), partito("m1", { task_type: "monitor", is_backgrounded: true }), partito("d1", { is_backgrounded: undefined }), partito("f1"))
    await b.manda(q, partito("s1", { ambient: true }), partito("t1", { skip_transcript: true }), partito("n1", { parent_task_id: "a1" }))
    b.passa(1_000)
    await b.manda(q, avanza("a1", 1_200, 3), avanza("f1", 800, 1), avanza("a1", 12_400, 18), avanza("s1", 100, 1), avanza("sconosciuto", 100, 1))
    await b.manda(q, sistema("task_updated", { task_id: "f1", patch: { status: "running" } }), sistema("task_updated", { task_id: "sconosciuto", patch: { is_backgrounded: true } }))
    await b.manda(q, partito("a1", { task_type: "local_agent", is_backgrounded: true }), livello({ task_id: "a1", task_type: "local_agent" }, { task_id: "b2" }, { task_id: "s2", ambient: true }, { task_id: "n2", parent_task_id: "a1" }))
    await b.tenta("ferma un lavoro", () => b.chat.fermaTask(id, "b2"))
    await b.tenta("ferma un lavoro che non c'è", () => b.chat.fermaTask(id, "b9"))
    q.rifiutaLoStop = "il lavoro è già finito"
    await b.tenta("ferma un lavoro che Claude Code non ferma", () => b.chat.fermaTask(id, "b2"))
    q.rifiutaLoStop = null
    b.nota("lavori fermati", q.lavoriFermati)
    await b.manda(q, sistema("task_updated", { task_id: "m1", patch: { status: "completed" } }), sistema("task_notification", { task_id: "d1", status: "completed", output_file: "", summary: "" }), avanza("d1", 9_000, 9))
    b.passa(1_000)
    await b.manda(q, ...testoAPezzi("msg_1", ["Lavori avviati."]), risultato())
    // Un lavoro in primo piano di cui la fine non è arrivata non resta dopo il giro.
    await giro(b, id, "Ancora")
    await b.manda(q, init, partito("f2"), risultato())
    await giro(b, id, "E il processo?")
    await b.manda(q, partito("f3"))
    q.rompi(new Error("caduto"))
    await b.attendiStato("errore")
    expect(await b.foto()).toMatchSnapshot()
  })

  test("10 · l'avvio dichiara modello ed effort, i comandi cambiano, il titolo cambia, il reset non si segue", async () => {
    const b = await Banco.apri()
    b.nota("modelli", await b.chat.modelli())
    b.nota("comandi all'avvio", await b.chat.comandi())
    const { id, q } = await b.nuova({ testo: "/rename Pulizia", modello: "opus", effort: "high" }, "SCELTA")
    b.passa(1_000)
    await b.manda(q, { ...init, model: "claude-opus-5-5", effort: "high" }, { ...init, model: "claude-opus-5-5", effort: "high" })
    await b.manda(q, { ...init, model: "claude-opus-5-5", effort: "medium" })
    await b.manda(q, sistema("commands_changed", { commands: [{ name: "nuovo", description: "Brand new", argumentHint: "", aliases: ["n"] }], uuid: "u1", session_id: "x" }))
    await b.manda(q, sistema("commands_changed", { commands: [{ name: "nuovo", description: "Brand new", argumentHint: "", aliases: ["n"] }], uuid: "u2", session_id: "x" }))
    b.nota("comandi dopo il cambio", await b.chat.comandi())
    b.sessioni.voci = [{ id, titolo: "/rename Pulizia", aggiornata: INIZIO }]
    await b.manda(q, sistema("session_title_changed", { title: "Pulizia del disco" }), sistema("session_title_changed", { title: "Pulizia del disco" }), sistema("session_title_changed", { title: "" }))
    await b.manda(q, sistema("session_title_changed", { title: "Un titolo che non finisce più, scritto apposta molto più lungo di sessanta caratteri" }))
    await b.manda(q, { type: "conversation_reset", new_conversation_id: "22222222-2222-4222-8222-222222222222", trigger: "plan_mode_exit", uuid: "u1", session_id: "x" })
    await b.manda(q, sistema("informazione_mai_vista", { dato: 1 }), sistema("status", { status: "compacting" }))
    await b.tenta("cambia modello", () => b.chat.impostazioni(id, { modello: "sonnet" }))
    await b.tenta("cambia effort", () => b.chat.impostazioni(id, { effort: "low" }))
    await b.tenta("effort al predefinito", () => b.chat.impostazioni(id, { effort: null }))
    await b.tenta("modello predefinito", () => b.chat.impostazioni(id, { modello: "default" }))
    await b.tenta("modello che non c'è", () => b.chat.impostazioni(id, { modello: "gpt-9" }))
    await b.tenta("effort che il modello non ha", () => b.chat.impostazioni(id, { modello: "claude-opus-4-6", effort: "xhigh" }))
    await b.tenta("modello di Mango Code", () => b.chat.impostazioni(id, { modello: "mango-code/toq" }))
    await b.tenta("senza niente da cambiare", () => b.chat.impostazioni(id, {}))
    b.nota("cambi arrivati alla query", q.cambi)
    q.rifiutaIlCambio = "modello non disponibile per il tuo abbonamento"
    await b.tenta("cambio rifiutato da Claude Code", () => b.chat.impostazioni(id, { modello: "opus" }))
    await b.manda(q, risultato())
    const predefinito = await b.nuova({ testo: "Con il predefinito", modello: "default" }, "PREDEFINITO")
    b.passa(1_000)
    await b.manda(predefinito.q, { ...init, model: "claude-sonnet-5-5" }, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("11a · una domanda con i bottoni, risposta con un'opzione e con un testo libero; risposte sbagliate che non toccano la richiesta", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Chiedimi qualcosa" })
    b.passa(1_000)
    await b.manda(q, init)
    const ingresso = { questions: [domanda("Rosso o blu?", ["Rosso", "Blu"]), domanda("Quali bordi?", ["Sopra", "Sotto"], true)] }
    const prima = q.chiediPermesso("AskUserQuestion", ingresso, "toolu_q1").then((r) => b.nota("la query riceve (opzione)", r))
    b.passa(2_000)
    await b.tenta("risposta senza scelta", () => b.chat.rispondi(id, "toolu_q1", {}))
    await b.tenta("risposta con una domanda in meno", () => b.chat.rispondi(id, "toolu_q1", { scelta: { risposte: { "Rosso o blu?": "Blu" } } }))
    await b.tenta("risposta a una domanda estranea", () => b.chat.rispondi(id, "toolu_q1", { scelta: { risposte: { "Rosso o blu?": "Blu", "Quali bordi?": "Sopra", "Un'altra?": "sì" } } }))
    await b.tenta("scelta di un tipo sbagliato", () => b.chat.rispondi(id, "toolu_q1", { scelta: "Blu" }))
    await b.tenta("campo che non c'è", () => b.chat.rispondi(id, "toolu_q1", { scelta: { risposte: {} }, altro: 1 }))
    await b.tenta("risposta vuota in una lista", () => b.chat.rispondi(id, "toolu_q1", { scelta: { risposte: { "Rosso o blu?": "Blu", "Quali bordi?": ["", "  "] } } }))
    await b.tenta("risposta con un'opzione", () => b.chat.rispondi(id, "toolu_q1", { scelta: { risposte: { "Rosso o blu?": " Blu ", "Quali bordi?": ["Sopra", "Sotto"] } } }))
    await prima
    b.passa(1_000)
    const seconda = q.chiediPermesso("AskUserQuestion", { questions: [domanda("Che colore preferisci?", ["Rosso", "Blu"])] }, "toolu_q2").then((r) => b.nota("la query riceve (testo libero)", r))
    await b.tenta("risposta con testo libero", () => b.chat.rispondi(id, "toolu_q2", { scelta: { risposte: { "Che colore preferisci?": "Verde, in realtà" } } }))
    await seconda
    await b.tenta("risposta a una richiesta già chiusa", () => b.chat.rispondi(id, "toolu_q2", { scelta: { risposte: { "Che colore preferisci?": "Blu" } } }))
    await b.tenta("risposta a una richiesta che non c'è", () => b.chat.rispondi(id, "toolu_mai_vista", { scelta: "consenti" }))
    await b.manda(q, ...testoAPezzi("msg_1", ["Grazie."]), risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("11b · un permesso: consenti, consenti sempre, no con e senza motivo, ingresso senza campi noti, frase troppo lunga, richieste insieme, in inglese", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Esegui" })
    b.passa(1_000)
    await b.manda(q, init)
    const alla = (etichetta: string) => (r: unknown) => b.nota(etichetta, r)
    const uno = q.chiediPermesso("Bash", { command: "rm prova.txt" }, "toolu_p1").then(alla("la query riceve (consenti)"))
    b.passa(1_000)
    await b.tenta("scelta che non esiste", () => b.chat.rispondi(id, "toolu_p1", { scelta: "forse" }))
    await b.tenta("motivo con consenti", () => b.chat.rispondi(id, "toolu_p1", { scelta: "consenti", motivo: "x" }))
    await b.tenta("campo che non c'è", () => b.chat.rispondi(id, "toolu_p1", { scelta: "no", altro: 1 }))
    await b.tenta("consenti", () => b.chat.rispondi(id, "toolu_p1", { scelta: "consenti" }))
    await uno
    const due = q.chiediPermesso("Bash", { command: "ls" }, "toolu_p2").then(alla("la query riceve (sempre)"))
    await b.tenta("consenti sempre", () => b.chat.rispondi(id, "toolu_p2", { scelta: "sempre" }))
    await due
    b.nota("la query riceve (già permesso)", await q.chiediPermesso("Bash", { command: "pwd" }, "toolu_p3"))
    const tre = q.chiediPermesso("Write", { file_path: "a.txt" }, "toolu_p4").then(alla("la query riceve (no con motivo)"))
    await b.tenta("no con motivo", () => b.chat.rispondi(id, "toolu_p4", { scelta: "no", motivo: "meglio di no" }))
    await tre
    const quattro = q.chiediPermesso("Edit", { description: "Cambia il titolo" }, "toolu_p5").then(alla("la query riceve (no senza motivo)"))
    await b.tenta("no senza motivo", () => b.chat.rispondi(id, "toolu_p5", { scelta: "no", motivo: "   " }))
    await quattro
    void q.chiediPermesso("Strano", { qualcosa: { di: "annidato" }, altro: 3 }, "toolu_p6")
    void q.chiediPermesso("WebFetch", { url: "https://esempio.test/pagina", prompt: "riassumi" }, "toolu_p7")
    void q.chiediPermesso("Bash", { command: `echo ${"x".repeat(400)}` }, "toolu_p8")
    b.passa(2_000)
    await b.tenta("no al primo di tre", () => b.chat.rispondi(id, "toolu_p6", { scelta: "no" }))
    b.passa(1_000)
    await b.tenta("consenti al secondo di tre", () => b.chat.rispondi(id, "toolu_p7", { scelta: "consenti" }))
    b.lingua = "en"
    const ultimo = q.chiediPermesso("Grep", { pattern: "titolo" }, "toolu_p9").then(alla("la query riceve (no in inglese)"))
    await b.tenta("no in inglese", () => b.chat.rispondi(id, "toolu_p9", { scelta: "no", motivo: "troppo" }))
    await ultimo
    const fermo = new AbortController()
    const interrotto = q.chiediPermesso("Glob", { pattern: "*.md" }, "toolu_p10", fermo.signal).then(alla("la query riceve (segnale di stop)"))
    fermo.abort()
    await interrotto
    await b.tenta("consenti al terzo di tre", () => b.chat.rispondi(id, "toolu_p8", { scelta: "consenti" }))
    await b.manda(q, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("11c · una domanda scritta male non arriva al creator e Claude lo sa", async () => {
    const b = await Banco.apri()
    const { q } = await b.nuova({ testo: "Chiedimi male" })
    b.passa(1_000)
    await b.manda(q, init)
    const male: [string, Oggetto][] = [
      ["senza domande", { questions: [] }],
      ["senza l'elenco", {}],
      ["domanda che non è un testo", { questions: [{ question: 5, options: [] }] }],
      ["opzioni che non sono un elenco", { questions: [{ question: "A?", options: "uno" }] }],
      ["una domanda buona e una storta", { questions: [domanda("A?", ["uno"]), "storta"] }],
    ]
    for (const [etichetta, ingresso] of male) b.nota(`la query riceve (${etichetta})`, await q.chiediPermesso("AskUserQuestion", ingresso, "toolu_q"))
    b.nota("la query riceve (opzioni senza etichetta)", await Promise.race([q.chiediPermesso("AskUserQuestion", { questions: [{ question: "B?", options: [{ description: "senza etichetta" }, { label: "uno" }] }] }, "toolu_q8"), Bun.sleep(50).then(() => "in attesa")]))
    await b.manda(q, risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("12a · la query si rompe a metà giro, e il messaggio dopo riapre la conversazione", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Lavora" })
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["Comincio"]))
    const attesa = q.chiediPermesso("Bash", { command: "ls" }, "toolu_p1").then((r) => b.nota("la query riceve (richiesta pendente alla rottura)", r))
    b.passa(1_500)
    q.rompi(new Error("il processo è uscito con codice 1"))
    await b.attendiStato("errore")
    await attesa
    b.sessioni.voci = [{ id, titolo: "Lavora", aggiornata: INIZIO }]
    b.sessioni.file.set(id, [])
    b.passa(1_000)
    await b.tenta("riscrive", () => b.chat.scrivi(id, { testo: "riprova" }))
    const q2 = await aspettaChe(() => b.finto.queries.length >= 2, "la query nuova è partita").then(() => b.finto.queries.at(-1))
    if (!q2) throw new Error("query nuova non trovata")
    b.nota("riapre con resume", q2.opzioni.resume === id)
    b.passa(1_000)
    await b.manda(q2, init, ...testoAPezzi("msg_2", ["Di nuovo"]), risultato())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("12b · la query finisce senza un risultato, e a giro finito chiudersi non è un errore; un errore con la sua frase si mostra com'è", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Lavora" })
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["Comincio"]))
    b.passa(1_500)
    q.close()
    await b.attendiStato("errore")
    b.sessioni.voci = [{ id, titolo: "Lavora", aggiornata: INIZIO }]
    b.sessioni.file.set(id, [])

    b.passa(1_000)
    await giro(b, id, "Secondo")
    const q2 = await b.conQuery(id)
    await b.manda(q2, init, ...testoAPezzi("msg_2", ["Fatto."]), risultato())
    b.passa(1_000)
    q2.close()
    await aspettaChe(() => b.conta("elenco") >= 4, "la conversazione ha annunciato la chiusura della query")
    b.nota("stato dopo che la query si chiude a giro finito", (await b.chat.leggi(id)).stato)

    b.lingua = "en"
    await giro(b, id, "Terzo")
    const q3 = await b.conQuery(id)
    await b.manda(q3, init)
    b.passa(500)
    q3.close()
    await aspettaChe(() => b.finto.queries.length === 3 && b.conta("stato", (e) => e.evento === "stato" && e.stato === "errore") >= 2, "il terzo giro si è chiuso")
    expect(await b.foto()).toMatchSnapshot()
  })

  test("13a · un messaggio scritto mentre Claude lavora, con allegati e contesto, e i messaggi rifiutati", async () => {
    const b = await Banco.apri()
    const cartella = join(b.archivio, ".chat", "allegati")
    await mkdir(cartella, { recursive: true })
    await writeFile(join(cartella, "foto.png"), PNG)
    await writeFile(join(cartella, "nota.txt"), "ciao")
    const allegati = [{ percorso: ".chat/allegati/foto.png" }, { percorso: ".chat/allegati/nota.txt" }]
    const { id, q } = await b.nuova({ testo: "Guarda qui", allegati, contesto: { video: "orto", vista: "Slide" } })
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["Guardo."]))
    b.passa(1_000)
    await b.tenta("secondo messaggio mentre lavora", () => b.chat.scrivi(id, { testo: "Anzi, fai un'altra cosa", contesto: { vista: "Girato" } }))
    b.passa(1_000)
    await b.tenta("solo un allegato", () => b.chat.scrivi(id, { testo: "", allegati: [{ percorso: ".chat/allegati/nota.txt" }] }))
    await b.tenta("un comando con la barra", () => b.chat.scrivi(id, { testo: "/compact", allegati: [{ percorso: ".chat/allegati/nota.txt" }], contesto: { video: "orto" } }))
    await b.manda(q, risultato({ queued_turn_count: 3 }))
    b.passa(1_000)
    await b.manda(q, ...testoAPezzi("msg_2", ["Fatto."]), risultato())
    await b.tenta("messaggio vuoto", () => b.chat.scrivi(id, { testo: "   " }))
    await b.tenta("campo che non c'è", () => b.chat.scrivi(id, { testo: "ciao", modello: "opus" }))
    await b.tenta("testo che non è un testo", () => b.chat.scrivi(id, { testo: 5 }))
    await b.tenta("allegato che non c'è", () => b.chat.scrivi(id, { testo: "ciao", allegati: [{ percorso: ".chat/allegati/non-c-e.png" }] }))
    await b.tenta("allegato fuori dall'archivio", () => b.chat.scrivi(id, { testo: "ciao", allegati: [{ percorso: "../fuori.txt" }] }))
    await b.tenta("contesto sbagliato", () => b.chat.scrivi(id, { testo: "ciao", contesto: { video: "Non Valido" } }))
    for (const testo of ["/clear", "/model sonnet", "/effort high", "/new"]) await b.tenta(`comando dello studio ${testo}`, () => b.chat.scrivi(id, { testo }))
    await b.tenta("conversazione che non c'è", () => b.chat.scrivi("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { testo: "ciao" }))
    await b.tenta("id non valido", () => b.chat.scrivi("non-un-id", { testo: "ciao" }))
    await b.tenta("conversazione nuova con un comando dello studio", () => b.chat.crea({ testo: "/clear" }))
    await b.tenta("conversazione nuova vuota", () => b.chat.crea({ testo: "" }))
    expect(await b.foto()).toMatchSnapshot()
  })

  test("13b · l'avvio del primo giro: nessun messaggio del creator, il titolo e la lingua dello studio", async () => {
    const b = await Banco.apri()
    const primo = await b.nuova({ avvio: "primo-giro" }, "PRIMO")
    b.passa(1_000)
    await b.manda(primo.q, init, ...testoAPezzi("msg_1", ["Ciao! Facciamo il primo giro."]), risultato())
    b.lingua = "en"
    const rifatto = await b.nuova({ avvio: "rifare-primo-giro" }, "RIFATTO")
    b.passa(1_000)
    await b.manda(rifatto.q, init, ...testoAPezzi("msg_2", ["Hello!"]), risultato())
    await b.tenta("avvio e testo insieme", () => b.chat.crea({ avvio: "primo-giro", testo: "Ciao" }))
    await b.tenta("avvio che non esiste", () => b.chat.crea({ avvio: "altro" }))
    await b.tenta("avvio dentro un messaggio", () => b.chat.scrivi(primo.id, { avvio: "primo-giro" }))
    b.nota("ricevuto dall'avvio", String(primo.q.ricevuti[0]?.message.content).startsWith("[Start: first round]"))
    expect(await b.foto()).toMatchSnapshot()
  })

  test("13c · chiudere una conversazione ferma il lavoro, nega le richieste e la lascia nel suo file; riaprirla riprende la storia", async () => {
    const b = await Banco.apri()
    const { id, q } = await b.nuova({ testo: "Lavora" })
    b.sessioni.voci = [{ id, titolo: "Lavora", aggiornata: INIZIO }]
    b.sessioni.file.set(id, [])
    b.passa(1_000)
    await b.manda(q, init, ...testoAPezzi("msg_1", ["Comincio"]))
    const attesa = q.chiediPermesso("Bash", { command: "sleep 100" }, "toolu_p1").then((r) => b.nota("la query riceve (richiesta alla chiusura)", r))
    b.passa(2_000)
    await b.tenta("chiude", () => b.chat.chiudiConversazione(id))
    await attesa
    b.nota("la query è stata interrotta e chiusa", [q.interrotta, q.chiusa])
    await b.tenta("chiude di nuovo", () => b.chat.chiudiConversazione(id))
    await b.tenta("ferma una conversazione chiusa", () => b.chat.ferma(id))
    await b.tenta("in background una conversazione chiusa", () => b.chat.inBackground(id))
    await b.tenta("risponde a una richiesta di una conversazione chiusa", () => b.chat.rispondi(id, "toolu_p1", { scelta: "consenti" }))
    await b.tenta("chiude una conversazione che non c'è", () => b.chat.chiudiConversazione("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
    b.passa(1_000)
    await b.tenta("riscrive", () => b.chat.scrivi(id, { testo: "Eccomi di nuovo" }))
    expect(await b.foto()).toMatchSnapshot()
  })
})

// --- Claude Code, riletto dal file della conversazione ----------------------------------------------------

describe("Claude Code, riletto dal file", () => {
  const riga = (type: string, uuid: string, message: unknown, extra: object = {}): MessaggioSessione => ({ type, uuid, message, timestamp: "2026-10-30T10:00:00.000Z", ...extra })
  const comando = (nome: string, args: string): unknown => ({ role: "user", content: `<command-name>/${nome}</command-name>\n            <command-message>${nome}</command-message>\n            <command-args>${args}</command-args>` })
  const locale = (uuid: string, uscita: string, tag = "stdout"): MessaggioSessione => riga("system", uuid, undefined, { subtype: "local_command", content: `<local-command-${tag}>${uscita}</local-command-${tag}>` })
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"
  const C = "33333333-3333-4333-8333-333333333333"
  const D = "44444444-4444-4444-8444-444444444444"
  const E = "55555555-5555-4555-8555-555555555555"
  const umano = { origin: { kind: "human" } }

  test("14a · testo con allegati e contesto, blocchi di Claude, esiti (testo, errore, immagine, oltre il limite), segnaposto interni e orari", async () => {
    const b = await Banco.apri()
    b.nomina(A, "CON_ALLEGATI")
    b.nomina(B, "SOLO_TITOLO")
    b.nomina(C, "SENZA_FILE")
    const allegato = join(b.archivio, ".chat", "allegati", "foto.png")
    b.sessioni.voci = [
      { id: A, titolo: "[Context: the creator is looking at the video «Orto» (orto).]\n\nControlla l'orto", aggiornata: Date.parse("2026-10-30T10:05:00Z") },
      { id: B, titolo: "Questo è il primo messaggio di una conversazione davvero molto lunga che non entra in una riga", aggiornata: Date.parse("2026-10-20T10:00:00Z") },
      { id: C, titolo: "", aggiornata: Date.parse("2026-10-01T10:00:00Z") },
    ]
    b.sessioni.file.set(A, [
      riga("user", "u0", { role: "user", content: "<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>" }),
      riga("user", "u1", { role: "user", content: [{ type: "text", text: `[Context: the creator is looking at the video «L'orto (prova)» (orto), tab «Slide».]\n\nControlla l'orto\n\n[Allegato: ${allegato}]\n\n[Allegato: ${ALTRO_FILE}]` }] }, umano),
      riga("assistant", "a1", { content: [{ type: "thinking", thinking: "" }, { type: "thinking", thinking: "Devo guardare." }, { type: "text", text: "Guardo." }, { type: "tool_use", id: "toolu_a", name: "mcp__video__video_leggi", input: { slug: "orto" } }] }),
      riga("user", "u2", { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_a", content: [{ type: "text", text: "{}" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "QQ==" } }] }] }, { timestamp: "2026-10-30T10:02:31.000Z" }),
      riga("assistant", "a2", { content: [{ type: "tool_use", id: "toolu_b", name: "Bash", input: { command: "ls" } }, { type: "tool_use", id: "toolu_c", name: "Read", input: { file_path: "a" } }, { type: "tool_use", id: "toolu_d", name: "Bash" }] }, { timestamp: "2026-10-30T10:03:00.000Z" }),
      riga(
        "user",
        "u3",
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "toolu_b", content: "ls: cannot access", is_error: true },
            { type: "tool_result", tool_use_id: "toolu_c", content: "", is_error: true },
            { type: "tool_result", tool_use_id: "toolu_d", content: TESTO_LUNGO },
            { type: "tool_result", tool_use_id: "toolu_orfano", content: "di nessuno" },
          ],
        },
        { timestamp: "2026-10-30T10:03:30.000Z" },
      ),
      riga("assistant", "a3", { content: [] }),
      riga("system", "s1", undefined, { subtype: "informational", content: "un avviso che la chat non mostra" }),
      riga("user", "u4", { role: "user", content: "<system-reminder>niente</system-reminder>" }, { origin: { kind: "system" } }),
      riga("user", "u5", { role: "user", content: "[Request interrupted by user]" }, umano),
      riga("user", "u6", { role: "user", content: "<task-notification>fatto</task-notification>" }),
      riga("user", "u7", { role: "user", content: "Scritto da un altro processo" }, { origin: { kind: "peer" } }),
      riga("user", "u8", { role: "user", content: "Il riassunto del contesto" }, { isCompactSummary: true }),
      riga("user", "u9", { role: "user", content: "[Contesto: sta guardando la pagina «Girato».]\n\nE la copertina?" }, umano),
      riga("user", "u10", { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "QQ==" } }] }, umano),
      riga("assistant", "a4", { content: [{ type: "text", text: "Tutto a posto." }], usage: { input_tokens: 5, cache_read_input_tokens: 12_000, output_tokens: 40 } }, { timestamp: "2026-10-30T10:04:00.000Z" }),
      riga("assistant", "a5", { content: [{ type: "text", text: "Senza orario." }] }, { timestamp: undefined }),
      riga("queue-operation", "q1", null),
    ])
    b.sessioni.file.set(B, [riga("user", "b1", { role: "user", content: "Solo una domanda" }, umano)])
    b.sessioni.file.set(C, [])
    expect(await b.foto()).toMatchSnapshot()
  })

  test("14b · i comandi con la barra: la riga del comando è del creator, la sua risposta di Claude (riga di sistema o dell'utente)", async () => {
    const b = await Banco.apri()
    b.nomina(A, "COMANDI")
    b.nomina(B, "COMPATTA")
    b.sessioni.voci = [
      { id: A, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:05:00Z") },
      { id: B, titolo: "Compatta", aggiornata: Date.parse("2026-10-30T10:06:00Z") },
    ]
    b.sessioni.file.set(A, [
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
      riga("user", "c5", { role: "user", content: "<command-name>  nuovo-senza-barra  </command-name>" }),
      riga("user", "u1", { role: "user", content: "Ciao" }, umano),
      riga("assistant", "a1", { content: [{ type: "text", text: "Eccomi." }] }),
      riga("system", "s6", undefined, { subtype: "local_command", content: "senza tag" }),
    ])
    b.sessioni.file.set(B, [
      riga("system", "s1", undefined, { subtype: "compact_boundary", content: "Conversation compacted" }),
      riga("user", "u1", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
      riga("user", "u2", { role: "user", content: "<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>" }),
      riga("user", "c1", comando("compact", "")),
      riga("user", "u3", { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" }),
      riga("user", "u4", { role: "user", content: [{ type: "text", text: "  <local-command-stderr>Errore in un blocco</local-command-stderr>" }] }),
    ])
    expect(await b.foto()).toMatchSnapshot()
  })

  test("14c · dopo un riassunto si vede solo ciò che segue; il contesto è quello dell'ultima risposta, o non si sa se il riassunto è l'ultimo", async () => {
    const b = await Banco.apri()
    b.nomina(A, "RIASSUNTO_IN_MEZZO")
    b.nomina(B, "RIASSUNTO_PER_ULTIMO")
    b.nomina(C, "SENZA_RIASSUNTO")
    b.sessioni.voci = [
      { id: A, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:05:00Z") },
      { id: B, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:04:00Z") },
      { id: C, titolo: "Prova", aggiornata: Date.parse("2026-10-30T10:03:00Z") },
    ]
    const usage = (letti: number) => ({ input_tokens: 3, cache_read_input_tokens: letti, cache_creation_input_tokens: 2, output_tokens: 10 })
    b.sessioni.file.set(A, [
      riga("user", "u0", { role: "user", content: "Prima" }, umano),
      riga("assistant", "a0", { content: [{ type: "text", text: "Risposta di prima." }], usage: usage(90_000) }),
      riga("system", "s1", undefined, { subtype: "compact_boundary" }),
      riga("user", "u1", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
      riga("user", "u2", { role: "user", content: "Dopo" }, umano),
      riga("assistant", "a1", { content: [{ type: "text", text: "Risposta di dopo." }], usage: usage(4_000) }),
      riga("system", "s2", undefined, { subtype: "compact_boundary" }),
      riga("user", "u3", { role: "user", content: "This session is being continued from a previous conversation." }, { isCompactSummary: true }),
      riga("user", "u4", { role: "user", content: "Ultimo" }, umano),
    ])
    b.sessioni.file.set(B, [riga("user", "u0", { role: "user", content: "Prima" }, umano), riga("assistant", "a0", { content: [{ type: "text", text: "Risposta." }], usage: usage(90_000) }), riga("system", "s1", undefined, { subtype: "compact_boundary" })])
    b.sessioni.file.set(C, [
      riga("user", "u0", { role: "user", content: "Prima" }, umano),
      riga("assistant", "a0", { content: [{ type: "text", text: "Risposta." }], usage: usage(1_000) }),
      riga("assistant", "a1", { content: [{ type: "text", text: "Senza conto." }], usage: { output_tokens: 7 } }),
    ])
    expect(await b.foto()).toMatchSnapshot()
  })

  test("14d · la riga di avvio del primo giro non è un messaggio del creator e dà il titolo; in inglese", async () => {
    const b = await Banco.apri()
    b.lingua = "en"
    b.nomina(D, "PRIMO_GIRO")
    b.nomina(E, "SOLO_AVVIO")
    const istruzione = "[Start: first round] The creator has just opened the app for the first time."
    b.sessioni.voci = [
      { id: D, titolo: istruzione, aggiornata: Date.parse("2026-10-30T10:05:00Z") },
      { id: E, titolo: `  ${istruzione}`, aggiornata: Date.parse("2026-10-30T10:04:00Z") },
    ]
    b.sessioni.file.set(D, [
      riga("user", "u1", { role: "user", content: istruzione }, umano),
      riga("assistant", "a1", { content: [{ type: "text", text: "Ciao! Facciamo il primo giro." }] }),
      riga("user", "u2", { role: "user", content: "Mi chiamo Anna" }, umano),
    ])
    b.sessioni.file.set(E, [riga("user", "u1", { role: "user", content: [{ type: "text", text: `  ${istruzione}` }] })])
    expect(await b.foto()).toMatchSnapshot()
  })
})

// --- Mango Code, in diretta e riletto -----------------------------------------------------------------------

describe("Mango Code", () => {
  const info = (id: string, role: string): object => ({ id, sessionID: SESSIONE, role })
  const parte = (id: string, messageID: string, resto: object): object => ({ id, messageID, sessionID: SESSIONE, ...resto })
  const strumentoMango = (stato: object): object => parte("prt_2", "msg_a", { type: "tool", callID: "call_1", tool: "video_foto", state: stato })

  async function mangoAcceso(testo = "Che parola dice il metodo?"): Promise<{ b: Banco; mc: FintoMangoCode; id: string }> {
    const b = await Banco.apri({ mango: true })
    const mc = b.mc
    if (!mc) throw new Error("Mango Code non è acceso")
    const id = await b.nuovaMango(testo)
    return { b, mc, id }
  }

  test("15a · un giro: testo a pezzi, ragionamento, uno strumento con il suo esito, il conto dei token, «inattivo» ripetuto", async () => {
    const { b, mc } = await mangoAcceso()
    b.passa(1_000)
    mc.evento("message.updated", { info: info("msg_u", "user") })
    mc.evento("message.part.updated", { part: parte("prt_u", "msg_u", { type: "text", text: "Che parola dice il metodo?", time: { end: 2 } }) })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_u", partID: "prt_u", field: "text", delta: "eco" })
    mc.evento("message.updated", { info: info("msg_a", "assistant") })
    mc.evento("message.part.updated", { part: parte("prt_r", "msg_a", { type: "reasoning", text: "" }) })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_r", field: "text", delta: "Devo " })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_r", field: "text", delta: "guardare." })
    mc.evento("message.part.updated", { part: parte("prt_r", "msg_a", { type: "reasoning", text: "Devo guardare.", time: { start: 1, end: 2 } }) })
    mc.evento("message.part.updated", { part: parte("prt_1", "msg_a", { type: "text", text: "" }) })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "text", delta: "Guardo " })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "text", delta: "il video." })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "altro", delta: "non è testo" })
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "testo" && e.parte.testo === "Guardo il video.")
    b.passa(1_000)
    mc.evento("message.part.updated", { part: strumentoMango({ status: "pending", input: {} }) })
    mc.evento("message.part.updated", { part: strumentoMango({ status: "running", input: { slug: "prova" } }) })
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "strumento")
    b.passa(2_000)
    mc.evento("message.part.updated", { part: strumentoMango({ status: "completed", input: { slug: "prova" }, output: "tre foto" }) })
    mc.evento("message.part.updated", { part: parte("prt_3", "msg_a", { type: "text", text: "MANDARINO", time: { start: 1, end: 2 } }) })
    mc.evento("message.part.updated", { part: { id: "prt_9", messageID: "msg_altra", sessionID: "ses_altra", type: "text", text: "di un'altra conversazione", time: { end: 2 } } })
    mc.evento("message.part.updated", { part: parte("prt_n", "msg_a", { type: "step-finish" }) })
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "testo" && e.parte.testo === "MANDARINO")
    b.passa(1_000)
    mc.passo("msg_a", { input: 12_480, output: 600, reasoning: 47, read: 55_358, write: 0 })
    await b.attendi("contesto_usato")
    b.passa(1_000)
    mc.idle()
    await b.attendiStato("pronta")
    await b.attendi("contesto_usato", (e) => e.evento === "contesto_usato" && e.contesto_usato?.totale === 65_536)
    expect(await b.foto()).toMatchSnapshot()
  })

  test("15b · una domanda: con un'opzione, con più opzioni, con un testo libero, e ritirata dal creator che ferma il lavoro", async () => {
    const { b, mc, id } = await mangoAcceso("Chiedimi qualcosa")
    b.passa(1_000)
    const dopoLaRisposta = (quante: number) => aspettaChe(() => mc.di("/question/que_1/reply").length + mc.di("/question/que_2/reply").length + mc.di("/question/que_3/reject").length >= quante, "la risposta è arrivata a Mango Code")
    mc.evento("question.asked", {
      id: "que_1",
      sessionID: SESSIONE,
      questions: [
        { question: "Rosso o blu?", header: "Colore", options: [{ label: "Rosso", description: "il rosso" }, { label: "Blu" }] },
        { question: "Quali bordi?", options: [{ label: "Sopra" }, { label: "Sotto" }], multiple: true },
      ],
    })
    await b.attendi("richiesta")
    b.passa(2_000)
    await b.tenta("risposta con un'opzione e più opzioni", () => b.chat.rispondi(id, "que_1", { scelta: { risposte: { "Rosso o blu?": "Blu", "Quali bordi?": ["Sopra", "Sotto"] } } }))
    await dopoLaRisposta(1)
    mc.evento("question.asked", { id: "que_2", sessionID: SESSIONE, questions: [{ question: "Che colore preferisci?", options: [{ label: "Rosso" }, { label: "Blu" }] }] })
    await b.attendi("richiesta", () => true, 2)
    await b.tenta("risposta con testo libero", () => b.chat.rispondi(id, "que_2", { scelta: { risposte: { "Che colore preferisci?": "Verde, in realtà" } } }))
    await dopoLaRisposta(2)
    mc.evento("question.asked", { id: "que_3", sessionID: SESSIONE, questions: [{ question: "Vuoi continuare?", options: [{ label: "Sì" }] }] })
    await b.attendi("richiesta", () => true, 3)
    b.passa(1_000)
    await b.tenta("ferma con una domanda in attesa", () => b.chat.ferma(id))
    await dopoLaRisposta(3)
    b.nota(
      "ciò che arriva a Mango Code",
      mc.richieste.filter((r) => /^\/question\//.test(r.percorso)).map((r) => ({ percorso: r.percorso, corpo: r.corpo })),
    )
    b.nota("abort", mc.di(`/session/${SESSIONE}/abort`).length)
    expect(await b.foto()).toMatchSnapshot()
  })

  test("15c · un permesso: consenti, consenti sempre (il successivo passa da solo), no con motivo, no senza motivo", async () => {
    const { b, mc, id } = await mangoAcceso("Esegui")
    b.passa(1_000)
    const risposte = () => mc.richieste.filter((r) => /^\/permission\//.test(r.percorso)).map((r) => ({ percorso: r.percorso, corpo: r.corpo }))
    mc.evento("permission.asked", { id: "per_1", sessionID: SESSIONE, permission: "bash", patterns: ["ls *"] })
    await b.attendi("richiesta")
    await b.tenta("consenti", () => b.chat.rispondi(id, "per_1", { scelta: "consenti" }))
    await aspettaChe(() => risposte().length === 1, "la prima risposta è arrivata")
    mc.evento("permission.asked", { id: "per_2", sessionID: SESSIONE, permission: "bash", patterns: ["pwd"] })
    await b.attendi("richiesta", () => true, 2)
    await b.tenta("consenti sempre", () => b.chat.rispondi(id, "per_2", { scelta: "sempre" }))
    await aspettaChe(() => risposte().length === 2, "la seconda risposta è arrivata")
    mc.evento("permission.asked", { id: "per_3", sessionID: SESSIONE, permission: "bash", patterns: ["cat *"] })
    await aspettaChe(() => risposte().length === 3, "il permesso già dato è passato da solo")
    mc.evento("permission.asked", { id: "per_4", sessionID: SESSIONE, permission: "edit", patterns: ["a.txt"] })
    await b.attendi("richiesta", () => true, 3)
    b.passa(1_000)
    await b.tenta("no con motivo", () => b.chat.rispondi(id, "per_4", { scelta: "no", motivo: "meglio di no" }))
    await aspettaChe(() => risposte().length === 4, "il no è arrivato")
    mc.evento("permission.asked", { id: "per_5", sessionID: SESSIONE, patterns: [] })
    await b.attendi("richiesta", () => true, 4)
    await b.tenta("no senza motivo", () => b.chat.rispondi(id, "per_5", { scelta: "no" }))
    await aspettaChe(() => risposte().length === 5, "l'ultimo no è arrivato")
    b.nota("ciò che arriva a Mango Code", risposte())
    expect(await b.foto()).toMatchSnapshot()
  })

  test("15d · «Ferma» ferma il giro di Mango Code e il giro fermato non è un errore; poi un giro finito male", async () => {
    const { b, mc, id } = await mangoAcceso("Lavora a lungo")
    b.passa(1_000)
    mc.evento("message.updated", { info: info("msg_a", "assistant") })
    mc.evento("message.part.updated", { part: parte("prt_1", "msg_a", { type: "text", text: "", time: { start: 1 } }) })
    mc.evento("message.part.delta", { sessionID: SESSIONE, messageID: "msg_a", partID: "prt_1", field: "text", delta: "Comincio" })
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "testo")
    b.passa(2_000)
    await b.tenta("ferma", () => b.chat.ferma(id))
    b.nota("abort chiesti a Mango Code", mc.di(`/session/${SESSIONE}/abort`).length)
    mc.evento("session.error", { sessionID: SESSIONE, error: { name: "MessageAbortedError", data: { message: "The operation was aborted." } } })
    mc.evento("session.idle", { sessionID: SESSIONE })
    await b.attendiStato("pronta")
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "fine")
    b.passa(1_000)
    await giroMango(b, mc, id, "Riprova", 2)
    mc.evento("session.error", { sessionID: SESSIONE, error: { name: "APIError", data: { message: "il modello non risponde" } } })
    b.passa(1_500)
    mc.evento("session.idle", { sessionID: SESSIONE })
    await b.attendiStato("pronta", 2)
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "fine", 2)
    await giroMango(b, mc, id, "Ancora", 3)
    mc.evento("session.error", { sessionID: SESSIONE, error: { name: "UnknownError" } })
    mc.evento("session.idle", { sessionID: SESSIONE })
    await b.attendiStato("pronta", 3)
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "fine", 3)
    await giroMango(b, mc, id, "Un'ultima volta", 4)
    mc.evento("session.error", { sessionID: SESSIONE, error: {} })
    mc.evento("session.idle", { sessionID: SESSIONE })
    await b.attendiStato("pronta", 4)
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "fine", 4)
    expect(await b.foto()).toMatchSnapshot()
  })

  test("15e · il riassunto: il contesto non si sa finché non finisce il passo che riprende, e il testo del riassunto non è una risposta", async () => {
    const { b, mc } = await mangoAcceso()
    b.passa(1_000)
    mc.passo("msg_a", { input: 1_000, output: 500, reasoning: 0, read: 61_000, write: 0 })
    mc.idle()
    await b.attendi("contesto_usato", (e) => e.evento === "contesto_usato" && e.contesto_usato?.totale === 65_536)
    b.passa(1_000)
    mc.riassunto("msg_s", 64_900)
    await b.attendi("contesto_usato", (e) => e.evento === "contesto_usato" && e.contesto_usato === null)
    b.passa(1_000)
    mc.passo("msg_b", { input: 7_000, output: 300, reasoning: 20, read: 0, write: 1_680 }, "stop")
    await b.attendi("contesto_usato", (e) => e.evento === "contesto_usato" && e.contesto_usato?.usati === 9_000)
    mc.evento("message.updated", { info: { ...info("msg_c", "assistant"), error: { name: "MessageAbortedError" }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 }, total: 0 } } })
    mc.evento("message.updated", { info: { ...info("msg_d", "assistant"), tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 5, write: 0 }, total: 15 } } })
    mc.evento("message.updated", { info: info("msg_u", "user") })
    mc.idle()
    await b.attendiStato("pronta")
    expect(await b.foto()).toMatchSnapshot()
  })

  test("16a · riletta dopo averla chiusa: testo, ragionamento, strumenti (esito, errore, in corso), un riassunto in mezzo, i token", async () => {
    const { b, mc, id } = await mangoAcceso("Primo messaggio")
    b.passa(1_000)
    mc.evento("message.updated", { info: info("msg_a", "assistant") })
    mc.evento("message.part.updated", { part: parte("prt_1", "msg_a", { type: "text", text: "Ecco.", time: { start: 1, end: 2 } }) })
    await b.attendi("parte", (e) => e.evento === "parte" && e.parte.tipo === "testo")
    b.passa(1_000)
    mc.idle()
    await b.attendiStato("pronta")
    await b.tenta("chiude", () => b.chat.chiudiConversazione(id))
    mc.messaggi = [
      { info: { id: "msg_u0", role: "user", time: { created: INIZIO } }, parts: [{ type: "text", text: "Messaggio prima del riassunto" }] },
      { info: { id: "msg_a0", role: "assistant", finish: "stop", time: { created: INIZIO + 1_000 }, tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 1_000, write: 0 } } }, parts: [{ type: "text", text: "Risposta prima del riassunto." }] },
      { info: { id: "msg_s", role: "assistant", mode: "compaction", summary: true, finish: "stop", time: { created: INIZIO + 2_000 }, tokens: { input: 60_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ type: "text", text: "Riassunto." }] },
      { info: { id: "msg_u", role: "user", time: { created: INIZIO + 3_000 } }, parts: [{ type: "text", text: "Primo messaggio" }, { type: "text", text: "istruzioni", synthetic: true }] },
      {
        info: { id: "msg_a", role: "assistant", finish: "stop", time: { created: INIZIO + 4_000 }, tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 3_000, write: 5 } } },
        parts: [
          { type: "reasoning", text: "Devo guardare." },
          { type: "text", text: "Ecco." },
          { type: "tool", callID: "call_1", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "a.txt" } },
          { type: "tool", callID: "call_2", tool: "video_foto", state: { status: "completed", input: { slug: "prova" }, output: { immagini: 3 } } },
          { type: "tool", callID: "call_3", tool: "read", state: { status: "error", input: {}, error: "manca" } },
          { type: "tool", callID: "call_4", tool: "grep", state: { status: "running", input: { pattern: "x" } } },
          { type: "tool", id: "prt_senza_chiamata", tool: "question", state: { status: "completed", input: {}, output: "" } },
          { type: "step-finish" },
        ],
      },
      { info: { id: "msg_b", role: "assistant", time: { created: INIZIO + 5_000 }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [] },
      { info: { id: "msg_c", role: "assistant", finish: "stop", time: { created: INIZIO + 6_000 }, tokens: { input: 900, output: 30, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ type: "text", text: "Ultima risposta." }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "senza id" }] },
    ]
    b.passa(1_000)
    expect(await b.foto()).toMatchSnapshot()
  })

  test("16b · riletta senza il passo che riprende dopo il riassunto, il contesto non si sa; e una conversazione senza messaggi", async () => {
    const { b, mc, id } = await mangoAcceso("Primo messaggio")
    b.passa(1_000)
    mc.idle()
    await b.attendiStato("pronta")
    await b.tenta("chiude", () => b.chat.chiudiConversazione(id))
    mc.messaggi = [
      { info: { id: "msg_a", role: "assistant", finish: "stop", time: { created: INIZIO }, tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 3_000, write: 0 } } }, parts: [{ type: "text", text: "Ecco." }] },
      { info: { id: "msg_s", role: "assistant", mode: "compaction", summary: true, finish: "stop", time: { created: INIZIO + 1_000 }, tokens: { input: 60_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [{ type: "text", text: "Riassunto." }] },
      { info: { id: "msg_s2", role: "assistant", mode: "compaction", summary: true, time: { created: INIZIO + 2_000 }, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [] },
    ]
    b.nota("senza il passo che riprende", (await b.chat.leggi(id)).contesto_usato)
    mc.messaggi = []
    expect(await b.foto()).toMatchSnapshot()
  })
})
