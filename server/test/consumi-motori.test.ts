import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { Codex } from "../src/chat/codex/codex"
import { CodexTroppoVecchio } from "../src/chat/codex/protocollo"
import type { Oggetto } from "../src/chat/traduzione"
import { opzioniDaAmbiente } from "../src/configurazione"
import { Consumi, type OpzioniConsumi } from "../src/consumi/consumi"
import { aspetta, avviaAmbiente, type Ambiente } from "./aiuti"
import { ClienteFintoDiCodex, rispostaRegistrata, THREAD_REGISTRATO } from "./cliente-finto-codex"

const LAVORO = "C:\\lavoro"
const SESSIONE = "11111111-1111-4111-8111-111111111111"
const SENZA_TOKEN = { scritti: 0, riletti: 0, nuovi: 0 }

let cartelle: string[] = []
let ambiente: Ambiente | null = null
let aperti: Consumi[] = []
afterEach(async () => {
  await Promise.all(aperti.map((c) => c.chiudi()))
  aperti = []
  await ambiente?.ferma()
  ambiente = null
  await Promise.all(cartelle.map((c) => rm(c, { recursive: true, force: true })))
  cartelle = []
})

async function cartella(): Promise<string> {
  const c = await mkdtemp(join(tmpdir(), "consumi-motori-"))
  cartelle.push(c)
  return c
}

let n = 0
const id = (): string => `voce-${++n}`

const utente = (testo: string): Oggetto => ({ type: "userMessage", id: id(), content: [{ type: "text", text: testo, text_elements: [] }] })
const risposta = (testo = "fatto"): Oggetto => ({ type: "agentMessage", id: id(), text: testo, phase: "final_answer" })
const comando = (scritto: string): Oggetto => ({
  type: "commandExecution",
  id: id(),
  command: `"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command '${scritto}'`,
  commandActions: [{ type: "unknown", command: scritto }],
  status: "completed",
})
const modifica = (percorso: string): Oggetto => ({ type: "fileChange", id: id(), changes: [{ path: percorso, kind: { type: "add" }, diff: "ciao\n" }], status: "completed" })
const strumento = (server: string, nome: string, argomenti: Oggetto): Oggetto => ({ type: "mcpToolCall", id: id(), server, tool: nome, arguments: argomenti, status: "completed" })

const CONTESTO = (slug: string): string => `[Context: the creator is looking at the video «Un titolo» (${slug}), tab «Montaggio».]\n\nmonta`

/** Un giro di Codex: `inizio` in secondi del 1970, `durata` in millisecondi. */
const giro = (inizio: number, durata: number, voci: Oggetto[], stato = "completed"): Oggetto => ({
  id: id(),
  items: voci,
  status: stato,
  startedAt: inizio,
  completedAt: stato === "inProgress" ? null : inizio + Math.round(durata / 1000),
  durationMs: stato === "inProgress" ? null : durata,
})

const T0 = Date.UTC(2026, 10, 13, 10, 0, 0) / 1000

interface Thread {
  id: string
  aggiornato: number
  giri: Oggetto[]
  parente?: string
}

/** Un finto Codex con questi thread: l'elenco li dà senza giri, la lettura coi giri. */
function codexCon(thread: Thread[]): { cliente: ClienteFintoDiCodex; imposta: (nuovi: Thread[]) => void } {
  const cliente = new ClienteFintoDiCodex()
  let correnti = thread
  const sintesi = (t: Thread): Oggetto => ({ id: t.id, updatedAt: t.aggiornato, cwd: LAVORO, parentThreadId: t.parente ?? null, turns: [] })
  cliente.risposte.set("thread/list", () => ({ data: correnti.map(sintesi), nextCursor: null }))
  cliente.risposte.set("thread/read", (p) => {
    const trovato = correnti.find((t) => t.id === p["threadId"])
    if (!trovato) throw new Error("thread sconosciuto")
    return { thread: { ...sintesi(trovato), turns: trovato.giri } }
  })
  return {
    cliente,
    imposta: (nuovi) => {
      correnti = nuovi
    },
  }
}

/** L'archivio di una prova: accanto alla cartella delle conversazioni di Claude, e tolto con lei. */
function archivioDi(c: string): string {
  const archivio = join(tmpdir(), `${basename(c)}-archivio`)
  cartelle.push(archivio)
  return archivio
}

const FILE_DEI_TOKEN = (archivio: string): string => join(archivio, ".chat", "codex-consumi.json")

function consumiCon(c: string, cliente: ClienteFintoDiCodex, extra: Partial<NonNullable<OpzioniConsumi["codex"]>> = {}): Consumi {
  const consumi = new Consumi(c, { quietoMs: 30, codex: { cliente, lavoro: LAVORO, archivio: archivioDi(c), attesaMs: 2000, ...extra } }, () => undefined)
  aperti.push(consumi)
  return consumi
}

const turniRegistrati = (): Oggetto[] => {
  const thread = rispostaRegistrata("thread/read")["thread"] as Oggetto
  return thread["turns"] as Oggetto[]
}

test("la risposta registrata di un thread di Codex: quanti giri, quanto tempo, il giro del file prova.txt sta fra quelli senza video", async () => {
  const c = await cartella()
  const registrato = rispostaRegistrata("thread/read")["thread"] as Oggetto
  const { cliente } = codexCon([{ id: THREAD_REGISTRATO, aggiornato: registrato["updatedAt"] as number, giri: turniRegistrati() }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  const vista = consumi.vista()
  expect(vista.video).toEqual({})
  // 21677 + 7838 + 1336 + 80123 millisecondi, quattro giri (anche quello interrotto: Codex aveva già risposto)
  expect(vista.senza_video).toEqual({ tempo: 111, giri: 4, token: SENZA_TOKEN, motori: { codex: { tempo: 111, giri: 4, giri_con_token: 0, token: null } } })
  expect(cliente.di("thread/list")).toEqual([{ cwd: LAVORO, limit: 100 }])
  expect(cliente.di("thread/read")).toEqual([{ threadId: THREAD_REGISTRATO, includeTurns: true }])
})

test("un thread che tocca un video e uno che non ne tocca: il video si riconosce dal comando, dai file scritti e dagli argomenti degli strumenti", async () => {
  const c = await cartella()
  const { cliente } = codexCon([
    {
      id: "t-uno",
      aggiornato: T0 + 600,
      giri: [
        // il comando del motore nomina il video, il file scritto sta nella sua cartella, lo strumento «video» lo nomina per slug
        giro(T0, 40_000, [utente("monta"), comando("python -m motore monta orto-balcone"), modifica("C:\\lavoro\\archivio\\video\\orto-balcone\\piano.json"), strumento("video", "video_leggi", { slug: "orto-balcone" }), risposta()]),
        // la riga di contesto indica il video quando gli strumenti non ne toccano nessuno
        giro(T0 + 100, 20_000, [utente(CONTESTO("stampa-3d")), comando("ls"), risposta()]),
        // senza risposta di Codex il giro non conta
        giro(T0 + 200, 5000, [utente("ancora")]),
      ],
    },
    { id: "t-due", aggiornato: T0 + 900, giri: [giro(T0 + 300, 12_000, [utente("ciao"), risposta("ciao")])] },
  ])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  const vista = consumi.vista()
  expect(vista.video["orto-balcone"]).toEqual({
    tempo: 40,
    giri: 1,
    token: SENZA_TOKEN,
    dal: new Date(T0 * 1000).toISOString(),
    al: new Date(T0 * 1000 + 40_000).toISOString(),
    motori: { codex: { tempo: 40, giri: 1, giri_con_token: 0, token: null } },
  })
  expect(vista.video["stampa-3d"]).toMatchObject({ tempo: 20, giri: 1, motori: { codex: { tempo: 20, giri: 1, token: null } } })
  expect(vista.senza_video).toEqual({ tempo: 12, giri: 1, token: SENZA_TOKEN, motori: { codex: { tempo: 12, giri: 1, giri_con_token: 0, token: null } } })
})

test("un thread aperto da un altro thread non si conta", async () => {
  const c = await cartella()
  const { cliente } = codexCon([
    { id: "t-padre", aggiornato: T0, giri: [giro(T0, 10_000, [utente("x"), risposta()])] },
    { id: "t-figlio", aggiornato: T0, parente: "t-padre", giri: [giro(T0, 99_000, [utente("y"), risposta()])] },
  ])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().senza_video).toMatchObject({ tempo: 10, giri: 1 })
  expect(cliente.di("thread/read").map((p) => p["threadId"])).toEqual(["t-padre"])
})

test("due motori sullo stesso video: tempo e giri si sommano, i token sono solo quelli di Claude, ognuno ha la sua parte", async () => {
  const c = await cartella()
  const riga = (secondi: number, testo: object): string => JSON.stringify({ isSidechain: false, uuid: `u${secondi}`, timestamp: new Date(Date.UTC(2026, 10, 13, 9, 0, secondi)).toISOString(), ...testo })
  await writeFile(
    join(c, `${SESSIONE}.jsonl`),
    `${[
      riga(0, { type: "user", message: { role: "user", content: CONTESTO("orto-balcone") } }),
      riga(30, { type: "assistant", requestId: "r1", message: { id: "m1", role: "assistant", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 50 } } }),
    ].join("\n")}\n`,
  )
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().video["orto-balcone"]).toEqual({
    tempo: 50,
    giri: 2,
    token: { scritti: 100, riletti: 5000, nuovi: 51 },
    dal: "2026-11-13T09:00:00.000Z",
    al: new Date(T0 * 1000 + 20_000).toISOString(),
    motori: {
      "claude-code": { tempo: 30, giri: 1, giri_con_token: 1, token: { scritti: 100, riletti: 5000, nuovi: 51 } },
      codex: { tempo: 20, giri: 1, giri_con_token: 0, token: null },
    },
  })
  expect(consumi.vista().contati).toEqual(["claude-code", "codex"])
})

test("Codex non risponde: i conti di Claude arrivano lo stesso, pronti, e una riga va nel registro", async () => {
  const c = await cartella()
  const riga = (secondi: number, testo: object): string => JSON.stringify({ isSidechain: false, uuid: `u${secondi}`, timestamp: new Date(Date.UTC(2026, 10, 13, 9, 0, secondi)).toISOString(), ...testo })
  await writeFile(
    join(c, `${SESSIONE}.jsonl`),
    `${[riga(0, { type: "user", message: { role: "user", content: CONTESTO("orto-balcone") } }), riga(10, { type: "assistant", requestId: "r1", message: { id: "m1", role: "assistant", content: [], usage: { output_tokens: 7 } } })].join("\n")}\n`,
  )
  const { cliente } = codexCon([])
  cliente.risposte.set("thread/list", () => Promise.reject(new CodexTroppoVecchio("0.150.0", "0.167.0")))
  const registro = spyOn(console, "error").mockImplementation(() => undefined)
  try {
    const consumi = consumiCon(c, cliente)
    await consumi.avvia()
    await aspetta(() => consumi.vista().pronto)
    expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 10, giri: 1, motori: { "claude-code": { tempo: 10, giri: 1 } } })
    expect(Object.keys(consumi.vista().video["orto-balcone"]!.motori)).toEqual(["claude-code"])
    expect(registro.mock.calls.some(([riga]) => String(riga).includes("Codex 0.150.0 è più vecchio della 0.167.0"))).toBe(true)
  } finally {
    registro.mockRestore()
  }
})

test("Codex che non risponde mai: pronto non lo aspetta oltre l'attesa, e i conti arrivano se poi risponde", async () => {
  const c = await cartella()
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [giro(T0, 10_000, [utente("x"), risposta()])] }])
  const lista = cliente.risposte.get("thread/list")!
  const sblocca = Promise.withResolvers<void>()
  cliente.risposte.set("thread/list", async (p) => {
    await sblocca.promise
    return lista(p)
  })
  const registro = spyOn(console, "error").mockImplementation(() => undefined)
  try {
    const consumi = consumiCon(c, cliente, { attesaMs: 80 })
    const inizio = Date.now()
    await consumi.avvia()
    await aspetta(() => consumi.vista().pronto)
    expect(Date.now() - inizio).toBeLessThan(1500)
    expect(consumi.vista().senza_video.giri).toBe(0)
    expect(registro.mock.calls.length).toBeGreaterThan(0)
    sblocca.resolve()
    await aspetta(() => consumi.vista().senza_video.giri === 1)
  } finally {
    registro.mockRestore()
  }
})

test("un giro di Codex che finisce nella chat fa rileggere il suo thread, anche se l'elenco di Codex non dice ancora che è cambiato, e solo quello", async () => {
  const c = await cartella()
  const uno: Thread = { id: "t-uno", aggiornato: T0, giri: [giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])] }
  const due: Thread = { id: "t-due", aggiornato: T0, giri: [giro(T0, 30_000, [utente(CONTESTO("stampa-3d")), risposta()])] }
  const { cliente, imposta } = codexCon([uno, due])
  let avvisi = 0
  const consumi = new Consumi(c, { quietoMs: 30, codex: { cliente, lavoro: LAVORO, archivio: archivioDi(c), attesaMs: 2000 } }, () => avvisi++)
  aperti.push(consumi)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(cliente.di("thread/read").length).toBe(2)
  const prima = avvisi

  // riletto e trovato uguale: i conti non cambiano e nessuno è avvisato
  cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: "x", status: "completed" } })
  await aspetta(() => cliente.di("thread/read").length === 3)
  await Bun.sleep(50)
  expect(avvisi).toBe(prima)

  // il giro nuovo c'è, ma l'elenco di Codex porta ancora la data di prima
  imposta([{ ...uno, giri: [...uno.giri, giro(T0 + 400, 25_000, [utente(CONTESTO("orto-balcone")), risposta()])] }, due])
  cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: "y", status: "completed" } })
  await aspetta(() => consumi.vista().video["orto-balcone"]?.giri === 2)
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 35, motori: { codex: { tempo: 35, giri: 2, token: null } } })
  expect(cliente.di("thread/read").map((p) => p["threadId"])).toEqual(["t-uno", "t-due", "t-uno", "t-uno"])
  expect(avvisi).toBeGreaterThan(prima)

  // un thread cambiato fuori dalla chat (dal terminale) si rilegge quando l'elenco dice che è cambiato
  imposta([{ ...uno, giri: [...uno.giri, giro(T0 + 400, 25_000, [utente(CONTESTO("orto-balcone")), risposta()])] }, { ...due, aggiornato: T0 + 900, giri: [...due.giri, giro(T0 + 800, 5_000, [utente(CONTESTO("stampa-3d")), risposta()])] }])
  cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: "z", status: "completed" } })
  await aspetta(() => consumi.vista().video["stampa-3d"]?.giri === 2)
})

test("un Codex che dopo non risponde più lascia i suoi conti com'erano e scrive nel registro", async () => {
  const c = await cartella()
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  const registro = spyOn(console, "error").mockImplementation(() => undefined)
  try {
    cliente.risposte.set("thread/list", () => Promise.reject(new Error("il programma si è fermato")))
    cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: "x", status: "completed" } })
    await aspetta(() => registro.mock.calls.length > 0)
    expect(String(registro.mock.calls[0]?.[0])).toContain("il programma si è fermato")
    expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 10, giri: 1 })
  } finally {
    registro.mockRestore()
  }
})

test("senza Codex i conti sono quelli di Claude e nessuna parte è di Codex", async () => {
  const c = await cartella()
  const consumi = new Consumi(c, { quietoMs: 30 }, () => undefined)
  aperti.push(consumi)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista()).toEqual({ pronto: true, contati: ["claude-code"], video: {}, senza_video: { tempo: 0, giri: 0, token: SENZA_TOKEN, motori: {} } })
})

test("GET /api/consumi dà la parte di Claude e quella di Codex", async () => {
  const c = await cartella()
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])] }])
  ambiente = await avviaAmbiente({ consumi: { cartella: c, quietoMs: 30, codex: { cliente, lavoro: LAVORO, archivio: archivioDi(c), attesaMs: 2000 } } })
  const leggi = async () => (await (await fetch(`${ambiente!.url}/api/consumi`, { headers: ambiente!.accesso })).json()) as { pronto: boolean; video: Record<string, unknown> }
  const corpo = await aspetta(async () => ((await leggi()).pronto ? await leggi() : null))
  expect(corpo.video["orto-balcone"]).toMatchObject({ tempo: 20, giri: 1, motori: { codex: { tempo: 20, giri: 1, token: null } } })
})

test("il cliente di Codex si crea una volta e va sia al motore della chat sia ai consumi; senza il programma di Codex i consumi sono solo di Claude", async () => {
  const lavoro = await cartella()
  const con = opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro, MANGO_ANIMATION_CODEX: join(lavoro, "codex.exe") }, false)
  const motore = con.chat.motori.find((m): m is Codex => m instanceof Codex)
  expect(motore).toBeDefined()
  expect(con.consumi.codex?.cliente).toBe(motore!.cliente)
  expect(con.consumi.codex?.lavoro).toBe(lavoro)
  expect(opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro }, false).consumi.codex).toBeUndefined()
})

const conteggio = (nuovo: number, riletto: number, scritto: number): Oggetto => ({
  totalTokens: nuovo + riletto + scritto,
  inputTokens: nuovo + riletto,
  cachedInputTokens: riletto,
  cacheWriteInputTokens: 0,
  outputTokens: scritto,
  reasoningOutputTokens: Math.floor(scritto / 2),
})

/** La notifica con cui Codex dice quanto ha usato il thread (`total`) e l'ultima richiesta (`last`), ogni conto come `[nuovi, riletti, scritti]`. */
const uso = (thread: string, turno: unknown, totale: [number, number, number], ultimo: [number, number, number]): Oggetto => ({
  threadId: thread,
  turnId: turno,
  tokenUsage: { total: conteggio(...totale), last: conteggio(...ultimo), modelContextWindow: 258_400 },
})

const NOTIFICA_DEI_TOKEN = "thread/tokenUsage/updated"
const partiti = new WeakMap<ClienteFintoDiCodex, Set<unknown>>()

/** Codex dice che il giro è partito (la prima volta) e poi quanto il thread ha usato. */
function conta(cliente: ClienteFintoDiCodex, thread: string, turno: unknown, totale: [number, number, number], ultimo: [number, number, number]): void {
  const visti = partiti.get(cliente) ?? new Set<unknown>()
  partiti.set(cliente, visti)
  if (!visti.has(turno)) cliente.notifica("turn/started", { threadId: thread, turn: { id: turno, status: "inProgress" } })
  visti.add(turno)
  cliente.notifica(NOTIFICA_DEI_TOKEN, uso(thread, turno, totale, ultimo))
}
const idDi = (g: Oggetto): string => g["id"] as string
const tokenDelloCodex = (consumi: Consumi, slug: string): unknown => consumi.vista().video[slug]?.motori["codex"]?.token

test("i token di un giro sono il totale dell'ultima notifica meno ciò che c'era prima del giro, e una notifica ripetuta non conta due volte", async () => {
  const c = await cartella()
  const g = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(tokenDelloCodex(consumi, "orto-balcone")).toBeNull()

  // prima del giro il thread aveva già usato 700 nuovi, 600 riletti, 30 scritti
  conta(cliente, "t-uno", idDi(g), [1000, 800, 50], [300, 200, 20])
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
  expect(tokenDelloCodex(consumi, "orto-balcone")).toEqual({ scritti: 20, riletti: 200, nuovi: 300 })

  conta(cliente, "t-uno", idDi(g), [1800, 1400, 90], [500, 300, 40])
  conta(cliente, "t-uno", idDi(g), [1800, 1400, 90], [500, 300, 40])
  await aspetta(() => (tokenDelloCodex(consumi, "orto-balcone") as { scritti: number }).scritti === 60)
  expect(tokenDelloCodex(consumi, "orto-balcone")).toEqual({ scritti: 60, riletti: 800, nuovi: 1100 })
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({
    tempo: 20,
    giri: 1,
    token: { scritti: 60, riletti: 800, nuovi: 1100 },
    motori: { codex: { tempo: 20, giri: 1, giri_con_token: 1, token: { scritti: 60, riletti: 800, nuovi: 1100 } } },
  })
})

test("un giro ancora in corso porta i suoi token quando finisce, e il totale di prima del giro non entra", async () => {
  const c = await cartella()
  const inCorso = giro(T0, 0, [utente(CONTESTO("orto-balcone"))], "inProgress")
  const { cliente, imposta } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [inCorso] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().video).toEqual({})

  conta(cliente, "t-uno", idDi(inCorso), [5000, 4000, 100], [100, 50, 10])
  conta(cliente, "t-uno", idDi(inCorso), [5200, 4300, 130], [200, 300, 30])
  const finito = { ...giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()]), id: idDi(inCorso) }
  imposta([{ id: "t-uno", aggiornato: T0 + 60, giri: [finito] }])
  cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: idDi(inCorso), status: "completed" } })
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
  expect(tokenDelloCodex(consumi, "orto-balcone")).toEqual({ scritti: 40, riletti: 350, nuovi: 300 })
})

test("due giri dello stesso thread hanno ciascuno i suoi token, e il video li somma", async () => {
  const c = await cartella()
  const primo = giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const secondo = giro(T0 + 100, 30_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0 + 200, giri: [primo, secondo] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)

  conta(cliente, "t-uno", idDi(primo), [100, 0, 10], [100, 0, 10])
  conta(cliente, "t-uno", idDi(primo), [150, 400, 25], [50, 400, 15])
  // il secondo giro parte da dove il primo è arrivato
  conta(cliente, "t-uno", idDi(secondo), [170, 900, 45], [20, 500, 20])
  conta(cliente, "t-uno", idDi(secondo), [180, 1500, 70], [10, 600, 25])
  await aspetta(() => (tokenDelloCodex(consumi, "orto-balcone") as { scritti: number } | null)?.scritti === 70)
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ giri: 2, token: { scritti: 70, riletti: 1500, nuovi: 180 } })
})

test("un giro senza notifiche non ha token: la voce somma i giri di cui si sanno, e dice null solo se di nessuno", async () => {
  const c = await cartella()
  const saputo = giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const ignoto = giro(T0 + 100, 30_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const altro = giro(T0 + 200, 5_000, [utente(CONTESTO("stampa-3d")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0 + 300, giri: [saputo, ignoto, altro] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  conta(cliente, "t-uno", idDi(saputo), [100, 400, 10], [100, 400, 10])
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 40, giri: 2, motori: { codex: { tempo: 40, giri: 2, giri_con_token: 1, token: { scritti: 10, riletti: 400, nuovi: 100 } } } })
  expect(consumi.vista().video["stampa-3d"]).toMatchObject({ token: SENZA_TOKEN, motori: { codex: { giri: 1, giri_con_token: 0, token: null } } })
})

test("di ogni parte si dice quanti giri hanno i token: un giro sì e uno no fanno due giri e uno coi token, per Claude Code sono tutti", async () => {
  const c = await cartella()
  const riga = (secondi: number, testo: object): string => JSON.stringify({ isSidechain: false, uuid: `u${secondi}`, timestamp: new Date(Date.UTC(2026, 10, 13, 9, 0, secondi)).toISOString(), ...testo })
  await writeFile(
    join(c, `${SESSIONE}.jsonl`),
    `${[
      riga(0, { type: "user", message: { role: "user", content: CONTESTO("orto-balcone") } }),
      riga(30, { type: "assistant", requestId: "r1", message: { id: "m1", role: "assistant", content: [{ type: "text", text: "ok" }], usage: { output_tokens: 100 } } }),
    ].join("\n")}\n`,
  )
  const saputo = giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const ignoto = giro(T0 + 100, 30_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0 + 300, giri: [saputo, ignoto] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  conta(cliente, "t-uno", idDi(saputo), [100, 400, 10], [100, 400, 10])
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
  const parti = consumi.vista().video["orto-balcone"]!.motori
  expect(parti["codex"]).toMatchObject({ giri: 2, giri_con_token: 1 })
  expect(parti["claude-code"]).toMatchObject({ giri: 1, giri_con_token: 1 })
})

test("i token di un giro che il server non ha visto partire non entrano: Codex ripete l'ultimo uso di un thread che si riprende", async () => {
  const c = await cartella()
  const g = giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  cliente.notifica(NOTIFICA_DEI_TOKEN, uso("t-uno", idDi(g), [1000, 800, 50], [300, 200, 20]))
  await Bun.sleep(80)
  expect(tokenDelloCodex(consumi, "orto-balcone")).toBeNull()
})

test("una notifica senza i conti, senza giro o senza thread non fa nulla", async () => {
  const c = await cartella()
  const g = giro(T0, 10_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  cliente.notifica("turn/started", { threadId: "t-uno", turn: { id: idDi(g), status: "inProgress" } })
  cliente.notifica(NOTIFICA_DEI_TOKEN, { threadId: "t-uno", turnId: idDi(g), tokenUsage: { modelContextWindow: 1 } })
  cliente.notifica(NOTIFICA_DEI_TOKEN, { threadId: "t-uno", tokenUsage: { total: conteggio(1, 1, 1), last: conteggio(1, 1, 1) } })
  cliente.notifica(NOTIFICA_DEI_TOKEN, { turnId: idDi(g), tokenUsage: { total: conteggio(1, 1, 1), last: conteggio(1, 1, 1) } })
  await Bun.sleep(80)
  expect(tokenDelloCodex(consumi, "orto-balcone")).toBeNull()
})

test("i token dei giri si ritrovano al riavvio del server, dal file accanto al registro delle conversazioni", async () => {
  const c = await cartella()
  const g = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const prima = consumiCon(c, cliente)
  await prima.avvia()
  await aspetta(() => prima.vista().pronto)
  conta(cliente, "t-uno", idDi(g), [1000, 800, 50], [300, 200, 20])
  conta(cliente, "t-uno", idDi(g), [1800, 1400, 90], [500, 300, 40])
  await aspetta(() => (tokenDelloCodex(prima, "orto-balcone") as { scritti: number } | null)?.scritti === 60)
  await prima.chiudi()

  const salvato = JSON.parse(await readFile(FILE_DEI_TOKEN(archivioDi(c)), "utf-8")) as Record<string, Record<string, unknown>>
  expect(Object.keys(salvato)).toEqual(["t-uno"])
  expect(Object.keys(salvato["t-uno"]!)).toEqual([idDi(g)])

  const dopo = consumiCon(c, cliente)
  await dopo.avvia()
  await aspetta(() => dopo.vista().pronto)
  expect(tokenDelloCodex(dopo, "orto-balcone")).toEqual({ scritti: 60, riletti: 800, nuovi: 1100 })
})

test("un file dei token che non si legge vale «nessun token saputo» e una riga nel registro del server", async () => {
  const c = await cartella()
  const archivio = archivioDi(c)
  await mkdir(join(archivio, ".chat"), { recursive: true })
  await writeFile(FILE_DEI_TOKEN(archivio), "{ non è json")
  const g = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const registro = spyOn(console, "error").mockImplementation(() => undefined)
  try {
    const consumi = consumiCon(c, cliente)
    await consumi.avvia()
    await aspetta(() => consumi.vista().pronto)
    expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 20, giri: 1, motori: { codex: { tempo: 20, giri: 1, token: null } } })
    expect(registro.mock.calls.some(([riga]) => String(riga).includes("codex-consumi.json"))).toBe(true)

    // i giri nuovi si contano lo stesso
    conta(cliente, "t-uno", idDi(g), [100, 50, 10], [100, 50, 10])
    await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
    expect(tokenDelloCodex(consumi, "orto-balcone")).toEqual({ scritti: 10, riletti: 50, nuovi: 100 })
  } finally {
    registro.mockRestore()
  }
})

test("un file dei token con una forma sbagliata non si legge nemmeno a metà", async () => {
  const c = await cartella()
  const archivio = archivioDi(c)
  const g = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  await mkdir(join(archivio, ".chat"), { recursive: true })
  await writeFile(FILE_DEI_TOKEN(archivio), JSON.stringify({ "t-uno": { [idDi(g)]: { prima: { scritti: 0, riletti: 0, nuovi: 0 }, ultimo: { scritti: "tanti", riletti: 1, nuovi: 1 } } } }))
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  const registro = spyOn(console, "error").mockImplementation(() => undefined)
  try {
    const consumi = consumiCon(c, cliente)
    await consumi.avvia()
    await aspetta(() => consumi.vista().pronto)
    expect(tokenDelloCodex(consumi, "orto-balcone")).toBeNull()
    expect(registro.mock.calls.some(([riga]) => String(riga).includes("codex-consumi.json"))).toBe(true)
  } finally {
    registro.mockRestore()
  }
})

test("i token di un thread che Codex non ha più si tolgono, anche dal file", async () => {
  const c = await cartella()
  const archivio = archivioDi(c)
  const uno = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const due = giro(T0 + 100, 10_000, [utente(CONTESTO("stampa-3d")), risposta()])
  const { cliente, imposta } = codexCon([
    { id: "t-uno", aggiornato: T0, giri: [uno] },
    { id: "t-due", aggiornato: T0, giri: [due] },
  ])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  conta(cliente, "t-uno", idDi(uno), [100, 50, 10], [100, 50, 10])
  conta(cliente, "t-due", idDi(due), [200, 0, 20], [200, 0, 20])
  cliente.notifica("turn/completed", { threadId: "t-uno", turn: { id: idDi(uno), status: "completed" } })
  await aspetta(() => cliente.di("thread/list").length === 2)
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone") && tokenDelloCodex(consumi, "stampa-3d"))

  // t-uno sparisce: la notifica di un giro finito fa rileggere l'elenco, che non lo porta più
  imposta([{ id: "t-due", aggiornato: T0, giri: [due] }])
  cliente.notifica("turn/completed", { threadId: "t-due", turn: { id: idDi(due), status: "completed" } })
  await aspetta(() => consumi.vista().video["orto-balcone"] === undefined)
  expect(tokenDelloCodex(consumi, "stampa-3d")).toEqual({ scritti: 20, riletti: 0, nuovi: 200 })
  await consumi.chiudi()
  const salvato = JSON.parse(await readFile(FILE_DEI_TOKEN(archivio), "utf-8")) as Record<string, unknown>
  expect(Object.keys(salvato)).toEqual(["t-due"])
})

test("i token di un thread che Codex non ha ancora elencato non si perdono", async () => {
  const c = await cartella()
  const nuovo = giro(T0, 0, [utente(CONTESTO("orto-balcone"))], "inProgress")
  const { cliente, imposta } = codexCon([])
  const consumi = consumiCon(c, cliente)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  conta(cliente, "t-nuovo", idDi(nuovo), [100, 50, 10], [100, 50, 10])
  // l'elenco non lo porta ancora, e si rilegge perché un altro thread ha finito un giro
  cliente.notifica("turn/completed", { threadId: "t-altro", turn: { id: "x", status: "completed" } })
  await Bun.sleep(80)
  imposta([{ id: "t-nuovo", aggiornato: T0, giri: [{ ...giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()]), id: idDi(nuovo) }] }])
  cliente.notifica("turn/completed", { threadId: "t-nuovo", turn: { id: idDi(nuovo), status: "completed" } })
  await aspetta(() => tokenDelloCodex(consumi, "orto-balcone"))
  expect(tokenDelloCodex(consumi, "orto-balcone")).toEqual({ scritti: 10, riletti: 50, nuovi: 100 })
})

test("GET /api/consumi dà i token di Codex dei giri contati con l'app accesa", async () => {
  const c = await cartella()
  const g = giro(T0, 20_000, [utente(CONTESTO("orto-balcone")), risposta()])
  const { cliente } = codexCon([{ id: "t-uno", aggiornato: T0, giri: [g] }])
  ambiente = await avviaAmbiente({ consumi: { cartella: c, quietoMs: 30, codex: { cliente, lavoro: LAVORO, archivio: archivioDi(c), attesaMs: 2000 } } })
  const leggi = async () => (await (await fetch(`${ambiente!.url}/api/consumi`, { headers: ambiente!.accesso })).json()) as { pronto: boolean; video: Record<string, { token: unknown; motori: { codex?: { token: unknown } } }> }
  await aspetta(async () => (await leggi()).pronto)
  expect((await leggi()).video["orto-balcone"]?.motori.codex?.token).toBeNull()
  conta(cliente, "t-uno", idDi(g), [1000, 800, 50], [300, 200, 20])
  const corpo = await aspetta(async () => ((await leggi()).video["orto-balcone"]?.motori.codex?.token ? await leggi() : null))
  expect(corpo.video["orto-balcone"]).toMatchObject({ token: { scritti: 20, riletti: 200, nuovi: 300 }, motori: { codex: { token: { scritti: 20, riletti: 200, nuovi: 300 } } } })
})
