// Codex come motore della chat, dentro la chat intera: un cliente di Codex in memoria che risponde come dice la prova e a cui si fanno
// arrivare i giri registrati da un Codex vero (`dati/codex-giri.jsonl`), con Claude Code e Mango Code finti accanto.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Chat } from "../src/chat/chat"
import { ClaudeCode } from "../src/chat/claude/claude"
import { Codex } from "../src/chat/codex/codex"
import { CodexTroppoVecchio, ErroreDiCodex } from "../src/chat/codex/protocollo"
import { MangoCode } from "../src/chat/mangocode"
import type { EventoMotore } from "../src/chat/motore"
import { opzioniDaAmbiente } from "../src/configurazione"
import { Eventi } from "../src/eventi"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"
import { Finto, FinteSessioni, FintoMangoCode, fermaIServerFinti, SESSIONE } from "./aiuti-chat"
import { ClienteFintoDiCodex, giroDi, giroRegistrato, MODELLI, rispostaRegistrata, THREAD_REGISTRATO, type Notifica } from "./cliente-finto-codex"

const cartelle: string[] = []

afterEach(async () => {
  await fermaTutti()
  fermaIServerFinti()
  await Promise.all(cartelle.splice(0).map((c) => rm(c, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })))
})

interface Banco {
  a: Ambiente
  cliente: ClienteFintoDiCodex
  codex: Codex
  claude: Finto
  mc: FintoMangoCode
  radice: string
  codice: string
  lavoro: string
  archivio: string
  /** I processi del computer come li vede il motore: le tabelle che darà, una per lettura, e ciò che ha fermato. */
  sistema: { tabelle: Map<number, number>[]; fermati: number[][] }
}

/** Il codice del prodotto in piccolo: il metodo (una regola sempre attiva e una di chi sviluppa) e le sue skill. */
async function scriviIlCodice(codice: string): Promise<void> {
  await mkdir(join(codice, ".claude", "rules"), { recursive: true })
  await mkdir(join(codice, ".claude", "skills", "saluta"), { recursive: true })
  await writeFile(join(codice, "CLAUDE.md"), "# Metodo di prova\n")
  await writeFile(join(codice, ".claude", "rules", "sempre.md"), "Regola sempre attiva.\n")
  await writeFile(join(codice, ".claude", "rules", "sviluppo.md"), '---\npaths:\n  - "server/**"\n---\nSolo chi sviluppa.\n')
  await writeFile(join(codice, ".claude", "skills", "saluta", "SKILL.md"), "Saluta.\n")
}

async function avvia(): Promise<Banco> {
  const radice = await mkdtemp(join(tmpdir(), "mango-codex-"))
  cartelle.push(radice)
  const codice = join(radice, "codice")
  const lavoro = join(radice, "lavoro")
  const archivio = join(lavoro, "archivio")
  await scriviIlCodice(codice)
  await mkdir(join(lavoro, ".claude", "rules"), { recursive: true })
  await writeFile(join(lavoro, ".claude", "rules", "voce.md"), "Parla in modo diretto.\n")
  const dati = join(radice, "dati")
  const mc = new FintoMangoCode()
  await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, agent: mc.url, engine: mc.url, window: false }))
  const cliente = new ClienteFintoDiCodex()
  const sistema: Banco["sistema"] = { tabelle: [], fermati: [] }
  const codex = new Codex({
    cliente,
    archivio,
    codice,
    lavoro,
    adesso: () => new Date(),
    sistema: { processi: async () => sistema.tabelle.shift() ?? new Map(), ferma: async (pid) => void sistema.fermati.push(pid) },
  })
  const claude = new Finto()
  const a = await avviaAmbiente({ codice, lavoro, archivio, chat: { motori: [new ClaudeCode(claude.query, new FinteSessioni()), new MangoCode({ dati, archivio, adesso: () => new Date() }), codex] } })
  return { a, cliente, codex, claude, mc, radice, codice, lavoro, archivio, sistema }
}

type Parte = { tipo: string; nome?: string; testo?: string; errore?: string; ingresso?: Record<string, unknown>; esito?: string }
type Dettaglio = {
  motore: string
  modello: string | null
  effort: string | null
  stato: string
  attiva: boolean
  titolo: string
  primo_giro: boolean
  messaggi: { ruolo: string; parti: Parte[] }[]
  in_attesa: { id: string; tipo: string; strumento?: string; ingresso?: Record<string, unknown>; frase?: string; domande?: unknown[] }[]
  task: { id: string; tipo: string; descrizione: string; background: boolean; uso?: { token: number; strumenti: number } }[]
  contesto_usato: { usati: number; totale: number | null } | null
}
const dettaglio = (b: Banco, id: string) => chiama<Dettaglio>(b.a, "GET", `/api/chat/${id}`)
const statoDi = async (b: Banco, id: string) => (await dettaglio(b, id)).corpo.stato

async function crea(b: Banco, corpo: object = {}): Promise<string> {
  const r = await chiama<{ id: string }>(b.a, "POST", "/api/chat", { testo: "Ciao", ...corpo })
  expect(r.stato).toBe(201)
  return r.corpo.id
}

/** Una conversazione nuova su Codex, col primo messaggio già arrivato; il suo primo giro ha l'identificativo del giro registrato `giro`. */
async function creaSuCodex(b: Banco, corpo: object = {}, giro: 1 | 2 | 3 = 1): Promise<{ id: string; giro: Notifica[] }> {
  const notifiche = giroRegistrato(giro)
  b.cliente.turni.unshift(giroDi(notifiche))
  const id = await crea(b, { modello: "codex/gpt-5.6-luna", ...corpo })
  await aspetta(() => b.cliente.di("turn/start").length >= 1)
  await aspetta(() => b.codex.registro.eSua(id))
  return { id, giro: notifiche }
}

/** Un giro registrato intero, fino alla sua fine. */
async function finisciIlGiro(b: Banco, id: string, giro: Notifica[]): Promise<void> {
  b.cliente.notificheDi(giro)
  await aspetta(async () => (await statoDi(b, id)) === "pronta")
}

const doveParteIlComando = (giro: Notifica[]): number => giro.findIndex((n) => n.metodo === "item/started" && (n.parametri["item"] as { type: string }).type === "commandExecution")

const nomiDelleParti = (parti: Parte[]): string[] => parti.map((p) => (p.tipo === "strumento" ? (p.nome ?? "") : p.tipo))

/** Aspetta che il comando sia nel messaggio come strumento, ancora senza esito; un comando del giro non è fra i lavori. */
async function aspettaIlComando(b: Banco, id: string): Promise<void> {
  await aspetta(async () => (await dettaglio(b, id)).corpo.messaggi.some((m) => m.parti.some((p) => p.nome === "Bash" && p.esito === undefined)))
  expect((await dettaglio(b, id)).corpo.task).toEqual([])
}

const ultimoMessaggio = async (b: Banco, id: string) => (await dettaglio(b, id)).corpo.messaggi.at(-1)

describe("Codex fra i motori", () => {
  test("GET /api/chat/motori: Codex con il suo nome, il prefisso, le sue capacità e il modello che Codex indica per il primo giro", async () => {
    const b = await avvia()
    const r = await chiama<Record<string, unknown>[]>(b.a, "GET", "/api/chat/motori")
    expect(r.corpo.find((m) => m.id === "codex")).toEqual({
      id: "codex",
      nome: "Codex",
      nelle_frasi: "Codex",
      prefisso: "codex/",
      pronto: true,
      modello_grande: "codex/gpt-5.6-luna",
      capacita: { effort: true, comandi: true, ferma_lavoro: true, in_background: false, immagini_negli_esiti: true, controllo_remoto: false, sottoagenti: true, browser: true },
    })
  })

  test("senza un modello indicato da Codex, o con quello nascosto, il modello grande non c'è", async () => {
    const b = await avvia()
    const senza = MODELLI.map((m) => ({ ...m, isDefault: false }))
    b.cliente.risposte.set("model/list", () => ({ data: senza, nextCursor: null }))
    expect((await chiama<{ id: string; modello_grande: string | null }[]>(b.a, "GET", "/api/chat/motori")).corpo.find((m) => m.id === "codex")?.modello_grande).toBeNull()
    const nascosto = MODELLI.map((m) => ({ ...m, isDefault: m.hidden === true }))
    b.cliente.risposte.set("model/list", () => ({ data: nascosto, nextCursor: null }))
    expect((await chiama<{ id: string; modello_grande: string | null }[]>(b.a, "GET", "/api/chat/motori")).corpo.find((m) => m.id === "codex")?.modello_grande).toBeNull()
  })

  test("i modelli sono quelli che Codex mostra, senza i nascosti, col prefisso e i livelli che dichiarano, anche quelli che il prodotto non conosce", async () => {
    const b = await avvia()
    const r = await chiama<{ id: string; nome: string; motore: string; reale: string; effort: { id: string; nome: { it: string; en: string } }[] }[]>(b.a, "GET", "/api/chat/modelli")
    const codex = r.corpo.filter((m) => m.motore === "codex")
    expect(codex.map((m) => [m.id, m.nome, m.reale])).toEqual([
      ["codex/gpt-5.6-luna", "Codex · GPT-5.6 Luna", "codex/gpt-5.6-luna"],
      ["codex/gpt-5.6-terra", "Codex · GPT-5.6 Terra", "codex/gpt-5.6-terra"],
    ])
    expect(codex[0]?.effort.map((l) => l.id)).toEqual(["low", "medium", "high", "xhigh", "max"])
    expect(codex[1]?.effort).toEqual([
      { id: "low", nome: { it: "Basso", en: "Low" } },
      { id: "high", nome: { it: "Alto", en: "High" } },
      { id: "ultra", nome: { it: "Ultra", en: "Ultra" } },
      { id: "turbo", nome: { it: "turbo", en: "turbo" } },
    ])
    expect(b.cliente.di("model/list")[0]).toMatchObject({ includeHidden: false })
    expect(MODELLI).toHaveLength(3)
  })

  test("i comandi con la barra sono /compact, /review, /rename e le skill sotto le due cartelle del prodotto e del creator, col nome senza il prefisso", async () => {
    const b = await avvia()
    const skill = (nome: string, percorso: string) => ({ name: nome, description: `Descrizione di ${nome}.`, path: percorso, scope: "user", enabled: true, pluginId: null })
    b.cliente.risposte.set("skills/list", () => ({
      data: [
        {
          cwd: b.lavoro,
          errors: [],
          skills: [
            skill("mango-animation:saluta", join(b.codice, ".claude", "skills", "saluta", "SKILL.md")),
            skill("creator-skill", join(b.lavoro, ".claude", "skills", "mia", "SKILL.md")),
            skill("dell-utente", join(b.radice, "altrove", "SKILL.md")),
            { ...skill("spenta", join(b.codice, ".claude", "skills", "spenta", "SKILL.md")), enabled: false },
          ],
        },
      ],
    }))
    const r = await chiama<{ nome: string; descrizione: string }[]>(b.a, "GET", "/api/chat/comandi?motore=codex")
    expect(r.corpo.map((c) => c.nome)).toEqual(["compact", "review", "rename", "saluta", "creator-skill"])
    expect(r.corpo[3]?.descrizione).toBe("Descrizione di mango-animation:saluta.")
    expect(b.cliente.di("skills/extraRoots/set")[0]).toEqual({ extraRoots: [join(b.codice, ".claude", "skills"), join(b.lavoro, ".claude", "skills")] })
    expect(b.cliente.di("skills/list")[0]).toEqual({ cwds: [b.lavoro], forceReload: true })
  })

  test("il motore si registra solo se l'ambiente indica il programma di Codex", async () => {
    const lavoro = await mkdtemp(join(tmpdir(), "mango-codex-ambiente-"))
    cartelle.push(lavoro)
    const motori = (extra: Record<string, string>) => opzioniDaAmbiente({ MANGO_ANIMATION_LAVORO: lavoro, ...extra }, false).chat.motori.map((m) => m.id)
    expect(motori({})).toEqual(["claude-code", "mango-code"])
    expect(motori({ MANGO_ANIMATION_CODEX: join(lavoro, "codex.exe") })).toEqual(["claude-code", "mango-code", "codex"])
  })
})

describe("una conversazione nuova", () => {
  test("nasce con la cartella di lavoro, il metodo, lo strumento «video» e il CLAUDE.md del creator; il giro registrato del comando e del file arriva intero", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b, { effort: "low" })

    expect(b.cliente.richieste.map((r) => r.metodo).filter((m) => m !== "model/list").slice(0, 4)).toEqual(["skills/extraRoots/set", "account/read", "thread/start", "turn/start"])
    const avvio = b.cliente.di("thread/start")[0] as { developerInstructions: string; config: { mcp_servers: Record<string, { command: string; args: string[]; env: Record<string, string>; tool_timeout_sec: number }>; project_doc_fallback_filenames: string[] } }
    expect(avvio).toMatchObject({ model: "gpt-5.6-luna", cwd: b.lavoro, approvalPolicy: "never", sandbox: "danger-full-access" })
    expect(avvio.config.project_doc_fallback_filenames).toEqual(["CLAUDE.md"])
    const video = avvio.config.mcp_servers["video"]
    expect(video?.env).toMatchObject({ MANGO_ANIMATION_LAVORO: b.lavoro, MANGO_ANIMATION_CONVERSAZIONE: id, MANGO_ANIMATION_DOMANDE: "1" })
    expect(video?.tool_timeout_sec).toBeGreaterThanOrEqual(3600)
    expect(video?.args).toEqual(["run", "--cwd", join(b.codice, "server"), "mcp"])
    for (const frammento of ["# Metodo di prova", "Regola sempre attiva.", "Parla in modo diretto.", `PYTHONPATH=${b.codice}`, "use the domanda (video server) tool", "The creator sees in the chat the images"]) {
      expect(avvio.developerInstructions).toContain(frammento)
    }
    expect(avvio.developerInstructions).not.toContain("Solo chi sviluppa.")

    expect(b.cliente.di("turn/start")[0]).toEqual({ threadId: THREAD_REGISTRATO, input: [{ type: "text", text: "Ciao", text_elements: [] }], model: "gpt-5.6-luna", effort: "low", summary: "auto" })

    const ascolto = await ascolta(b.a)
    b.cliente.notificheDi(giro)
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    const d = (await dettaglio(b, id)).corpo
    expect(d).toMatchObject({ motore: "codex", modello: "codex/gpt-5.6-luna", attiva: true, task: [] })
    const parti = d.messaggi.at(-1)?.parti ?? []
    expect(nomiDelleParti(parti)).toEqual(["testo", "Bash", "Write", "Bash", "testo", "fine"])
    expect(parti[1]?.ingresso).toEqual({ command: "ping -n 10 127.0.0.1" })
    expect(parti[2]?.ingresso).toMatchObject({ content: "ciao\n" })
    expect(parti[4]?.testo).toContain("BANANA")
    expect(d.contesto_usato?.totale).toBe(258400)
    expect(ascolto.messaggi.some((m) => (m as { evento?: string }).evento === "task")).toBe(false)
    ascolto.chiudi()

    const registro = JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as Record<string, { sessione: string; modello: string; titolo: string }>
    expect(registro[id]).toMatchObject({ sessione: THREAD_REGISTRATO, modello: "gpt-5.6-luna", titolo: "Ciao" })
  })

  test("il titolo che Codex dà alla conversazione è quello della chat e quello del registro", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    b.cliente.notifica("thread/name/updated", { threadId: THREAD_REGISTRATO, threadName: "Il montaggio della caverna" })
    await aspetta(async () => (await dettaglio(b, id)).corpo.titolo === "Il montaggio della caverna")
    await aspetta(async () => (JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as Record<string, { titolo: string }>)[id]?.titolo === "Il montaggio della caverna")
  })

  test("un messaggio scritto a giro in corso arriva al giro, non ne apre un altro", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    const prima = doveParteIlComando(giro) + 1
    b.cliente.notificheDi(giro.slice(0, prima))
    await aspettaIlComando(b, id)

    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Un'altra cosa" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("turn/steer").length === 1)
    expect(b.cliente.di("turn/steer")[0]).toEqual({ threadId: THREAD_REGISTRATO, expectedTurnId: giroDi(giro), input: [{ type: "text", text: "Un'altra cosa", text_elements: [] }] })
    expect(b.cliente.di("turn/start")).toHaveLength(1)

    b.cliente.notificheDi(giro.slice(prima))
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
  })

  test("se il giro è finito proprio mentre si scriveva, il messaggio ne apre uno nuovo", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    b.cliente.notificheDi(giro.slice(0, 2))
    b.cliente.risposte.set("turn/steer", () => {
      throw new ErroreDiCodex("no active turn to steer", -32600)
    })
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ancora" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("turn/start")[1]).toMatchObject({ input: [{ type: "text", text: "Ancora", text_elements: [] }] })
  })

  test("«Ferma» interrompe il giro e chiude il comando ancora vivo", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b, {}, 2)
    const prima = doveParteIlComando(giro) + 1
    b.cliente.notificheDi(giro.slice(0, prima))
    await aspettaIlComando(b, id)

    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    expect(b.cliente.richieste.slice(-2)).toEqual([
      { metodo: "turn/interrupt", parametri: { threadId: THREAD_REGISTRATO, turnId: giroDi(giro) } },
      { metodo: "thread/backgroundTerminals/terminate", parametri: { threadId: THREAD_REGISTRATO, processId: "52240" } },
    ])
    expect((await dettaglio(b, id)).corpo.task).toEqual([])

    b.cliente.notificheDi(giro.slice(prima))
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toHaveLength(1)
    expect((await dettaglio(b, id)).corpo.task).toEqual([])
    expect(b.sistema.fermati).toEqual([])
  })

  test("Codex chiude la shell del comando e non ciò che la shell ha lanciato: quello che resta acceso si ferma dopo", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b, {}, 2)
    b.cliente.notificheDi(giro.slice(0, doveParteIlComando(giro) + 1))
    await aspettaIlComando(b, id)
    // 4000 è il programma di Codex: sotto ha la shell del comando (500) col suo programma (501) e lo strumento «video» (600, 601).
    const prima = new Map([[4000, 1], [500, 4000], [501, 500], [600, 4000], [601, 600], [77, 1]])
    b.sistema.tabelle.push(prima, new Map([...prima].filter(([pid]) => pid !== 500)))

    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    await aspetta(() => b.sistema.fermati.length === 1)
    expect(b.sistema.fermati).toEqual([[501]])
  })

  test("un comando del giro non ha scheda fra i lavori: fermarlo da lì dà la risposta di un lavoro che non c'è, e non chiude niente", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    b.cliente.notificheDi(giro.slice(0, doveParteIlComando(giro) + 1))
    await aspettaIlComando(b, id)
    const voce = (giro[doveParteIlComando(giro)]!.parametri["item"] as { id: string }).id
    const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/task/${voce}/ferma`)
    expect([r.stato, r.corpo.errore]).toEqual([404, "Questo lavoro non c'è più: è già finito, o qualcuno l'ha già fermato."])
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([])
    expect(b.cliente.di("turn/interrupt")).toEqual([])
    expect(await statoDi(b, id)).toBe("lavora")
  })

  test("mandare in background non c'è: 409 con la frase di Codex", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/background`)
    expect([r.stato, r.corpo.errore]).toEqual([409, "Codex non ha lavori da mandare in background."])
  })
})

describe("i sottoagenti", () => {
  const FIGLIO = "01a1d700-0000-7000-8000-00000000f001"
  const GIRO = "giro-padre"
  const lancio = (extra: Record<string, unknown> = {}) => ({
    type: "collabAgentToolCall",
    id: "collab-1",
    tool: "spawnAgent",
    status: "completed",
    senderThreadId: THREAD_REGISTRATO,
    receiverThreadIds: [FIGLIO],
    prompt: "Conta le scene del video",
    model: null,
    reasoningEffort: null,
    agentsStates: { [FIGLIO]: { status: "running", message: null } },
    ...extra,
  })
  const attivita = (kind: string) => ({ type: "subAgentActivity", id: `sub-${kind}`, kind, agentThreadId: FIGLIO, agentPath: "/root/conta", model: null, reasoningEffort: null })
  const delPadre = (b: Banco, metodo: string, resto: Record<string, unknown>) => b.cliente.notifica(metodo, { threadId: THREAD_REGISTRATO, turnId: GIRO, ...resto })
  const delFiglio = (b: Banco, metodo: string, resto: Record<string, unknown>) => b.cliente.notifica(metodo, { threadId: FIGLIO, turnId: "giro-figlio", ...resto })
  const lavori = async (b: Banco, id: string) => (await dettaglio(b, id)).corpo.task

  /** Il giro cominciato e l'aiutante lanciato, per il thread della registrazione. */
  function lanciaUnAiutante(b: Banco): void {
    delPadre(b, "turn/started", { turn: { id: GIRO, items: [], status: "inProgress" } })
    b.cliente.notifica("thread/started", { thread: { id: FIGLIO, parentThreadId: THREAD_REGISTRATO, preview: "" } })
    delPadre(b, "item/started", { item: lancio({ status: "inProgress", receiverThreadIds: [], agentsStates: {} }) })
    delPadre(b, "item/completed", { item: lancio() })
  }

  /** Una conversazione con l'aiutante lanciato. */
  async function conAiutante(b: Banco): Promise<string> {
    const { id } = await creaSuCodex(b)
    lanciaUnAiutante(b)
    await aspetta(async () => (await lavori(b, id)).length === 1)
    return id
  }

  test("un aiutante lanciato è, oltre allo strumento, un lavoro di genere agente; il suo thread dà l'uso e non entra nella conversazione", async () => {
    const b = await avvia()
    const id = await conAiutante(b)
    expect((await lavori(b, id))[0]).toMatchObject({ id: FIGLIO, tipo: "agente", descrizione: "Conta le scene del video", background: false })

    delFiglio(b, "turn/started", { turn: { id: "giro-figlio", items: [], status: "inProgress" } })
    delFiglio(b, "item/started", { item: { type: "commandExecution", id: "x", command: "dir", commandActions: [], processId: "9", status: "inProgress" } })
    delFiglio(b, "item/agentMessage/delta", { itemId: "m", delta: "Sono dodici." })
    const conto = (totale: number) => ({ totalTokens: totale, inputTokens: totale, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 })
    delFiglio(b, "thread/tokenUsage/updated", { tokenUsage: { total: conto(5400), last: conto(900), modelContextWindow: 100_000 } })
    await aspetta(async () => (await lavori(b, id))[0]?.uso !== undefined)

    const d = (await dettaglio(b, id)).corpo
    expect(d.task[0]?.uso).toEqual({ token: 5400, strumenti: 1 })
    expect(d.contesto_usato).toBeNull()
    const parti = d.messaggi.at(-1)?.parti ?? []
    expect(nomiDelleParti(parti)).toEqual(["Agent"])
    expect(JSON.stringify(d.messaggi)).not.toContain("Sono dodici.")
    expect(JSON.stringify(d.messaggi)).not.toContain('"Bash"')

    delPadre(b, "item/completed", { item: attivita("completed") })
    await aspetta(async () => (await lavori(b, id)).length === 0)
  })

  test("a fine giro l'aiutante ancora al lavoro resta fra i lavori, in background, finché Codex non dice che ha finito", async () => {
    const b = await avvia()
    const id = await conAiutante(b)
    delPadre(b, "turn/completed", { turn: { id: GIRO, items: [], status: "completed", durationMs: 10 } })
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect((await lavori(b, id))[0]).toMatchObject({ id: FIGLIO, tipo: "agente", background: true })

    delPadre(b, "item/completed", { item: attivita("completed") })
    await aspetta(async () => (await lavori(b, id)).length === 0)
    expect(await statoDi(b, id)).toBe("pronta")
  })

  test("«Ferma» sul lavoro interrompe il giro dell'aiutante, e il lavoro sparisce quando il suo thread dice che è interrotto", async () => {
    const b = await avvia()
    const id = await conAiutante(b)
    delFiglio(b, "turn/started", { turn: { id: "giro-figlio", items: [], status: "inProgress" } })
    await aspetta(async () => (await chiama(b.a, "POST", `/api/chat/${id}/task/${FIGLIO}/ferma`)).stato === 200)
    expect(b.cliente.di("turn/interrupt")).toEqual([{ threadId: FIGLIO, turnId: "giro-figlio" }])
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([])
    expect(await lavori(b, id)).toHaveLength(1)

    delFiglio(b, "turn/completed", { turn: { id: "giro-figlio", items: [], status: "interrupted", durationMs: 3 } })
    await aspetta(async () => (await lavori(b, id)).length === 0)
  })

  test("un aiutante di cui Codex non ha detto il giro non si ferma da solo, e la frase dice perché", async () => {
    const b = await avvia()
    const id = await conAiutante(b)
    const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/task/${FIGLIO}/ferma`)
    expect([r.stato, r.corpo.errore]).toEqual([502, "Codex non ha fermato il lavoro: Questo aiutante non si può fermare: Codex non ha detto a che giro sta lavorando."])
  })

  test("l'aiutante nato da una conversazione non tocca le altre", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const altra = await crea(b, { modello: "codex/gpt-5.6-luna" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    lanciaUnAiutante(b)
    await aspetta(async () => (await lavori(b, id)).length === 1)
    delFiglio(b, "thread/tokenUsage/updated", { tokenUsage: { total: { totalTokens: 5400 }, last: { totalTokens: 900 }, modelContextWindow: 100_000 } })
    await aspetta(async () => (await lavori(b, id))[0]?.uso !== undefined)
    expect(await lavori(b, altra)).toEqual([])
    expect((await dettaglio(b, altra)).corpo.contesto_usato).toBeNull()
  })
})

const comando = (extra: Record<string, unknown> = {}) => ({ type: "commandExecution", id: "cmd-1", command: "ping -n 600 127.0.0.1", commandActions: [], processId: "4242", status: "inProgress", aggregatedOutput: null, exitCode: null, ...extra })
const GIRO = "giro-1"
const delThread = (b: Banco, metodo: string, resto: Record<string, unknown>) => b.cliente.notifica(metodo, { threadId: THREAD_REGISTRATO, turnId: GIRO, ...resto })

/** Una conversazione il cui giro finisce con un comando ancora acceso: durante il giro è solo il suo strumento. */
async function conComandoAcceso(b: Banco): Promise<string> {
  const { id } = await creaSuCodex(b)
  delThread(b, "turn/started", { turn: { id: GIRO, items: [], status: "inProgress" } })
  delThread(b, "item/started", { item: comando() })
  await aspettaIlComando(b, id)
  delThread(b, "turn/completed", { turn: { id: GIRO, items: [], status: "completed", durationMs: 10 } })
  await aspetta(async () => (await statoDi(b, id)) === "pronta")
  return id
}

describe("i comandi lasciati accesi", () => {
  const elenchi = (ascolto: Awaited<ReturnType<typeof ascolta>>) =>
    ascolto.messaggi.flatMap((m) => {
      const e = m as { tipo?: string; evento?: string; task?: Dettaglio["task"] }
      return e.tipo === "chat" && e.evento === "task" && e.task ? [e.task] : []
    })

  test("resta fra i lavori in background dopo il giro, Codex dice che è vivo, «Ferma» sul lavoro lo chiude", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/backgroundTerminals/list", () => ({ data: [{ itemId: "cmd-1", processId: "4242", command: "ping", cwd: b.lavoro, osPid: null, cpuPercent: null, rssKb: null }], nextCursor: null }))
    const id = await conComandoAcceso(b)
    await aspetta(() => b.cliente.di("thread/backgroundTerminals/list").length === 1)
    expect(b.cliente.di("thread/backgroundTerminals/list")[0]).toEqual({ threadId: THREAD_REGISTRATO })
    const [lavoro] = (await dettaglio(b, id)).corpo.task
    expect(lavoro).toMatchObject({ id: "cmd-1", tipo: "comando", descrizione: "ping -n 600 127.0.0.1", background: true })
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([])

    expect((await chiama(b.a, "POST", `/api/chat/${id}/task/cmd-1/ferma`)).stato).toBe(200)
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([{ threadId: THREAD_REGISTRATO, processId: "4242" }])
    expect(b.cliente.di("turn/interrupt")).toEqual([])
    expect((await dettaglio(b, id)).corpo.task).toEqual([])
  })

  test("quando Codex non lo elenca più il lavoro sparisce, senza chiudere niente", async () => {
    const b = await avvia()
    const ascolto = await ascolta(b.a)
    const id = await conComandoAcceso(b)
    await aspetta(async () => (await dettaglio(b, id)).corpo.task.length === 0)
    expect(elenchi(ascolto).some((e) => e.some((l) => l.id === "cmd-1" && l.background))).toBe(true)
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([])
    ascolto.chiudi()
  })

  test("quando finisce da sé Codex lo dice e il lavoro sparisce, senza riaprire la conversazione", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/backgroundTerminals/list", () => ({ data: [{ itemId: "cmd-1", processId: "4242", command: "ping", cwd: b.lavoro, osPid: null, cpuPercent: null, rssKb: null }], nextCursor: null }))
    const id = await conComandoAcceso(b)
    delThread(b, "item/completed", { item: comando({ status: "completed", aggregatedOutput: "ok", exitCode: 0 }) })
    await aspetta(async () => (await dettaglio(b, id)).corpo.task.length === 0)
    expect(await statoDi(b, id)).toBe("pronta")
  })

  test("se la domanda sui terminali fallisce il lavoro resta, e l'errore va nel registro del server", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/backgroundTerminals/list", () => {
      throw new ErroreDiCodex("non so", -32603)
    })
    const id = await conComandoAcceso(b)
    await aspetta(() => b.cliente.di("thread/backgroundTerminals/list").length === 1)
    await Bun.sleep(50)
    expect((await dettaglio(b, id)).corpo.task).toHaveLength(1)
  })

  test("un giro fermato non lascia lavori: il comando non ne ha mai uno, e «Ferma» ne chiude il processo", async () => {
    const b = await avvia()
    const ascolto = await ascolta(b.a)
    const { id } = await creaSuCodex(b)
    delThread(b, "turn/started", { turn: { id: GIRO, items: [], status: "inProgress" } })
    delThread(b, "item/started", { item: comando() })
    await aspettaIlComando(b, id)

    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    expect(b.cliente.di("thread/backgroundTerminals/terminate")).toEqual([{ threadId: THREAD_REGISTRATO, processId: "4242" }])
    delThread(b, "turn/completed", { turn: { id: GIRO, items: [], status: "interrupted", durationMs: 10 } })
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect((await dettaglio(b, id)).corpo.task).toEqual([])
    expect(elenchi(ascolto).flat()).toEqual([])
    ascolto.chiudi()
  })
})

describe("le skill e i comandi con la barra", () => {
  const saluta = (b: Banco) => ({ name: "mango-animation:saluta", description: "Saluta.", path: join(b.codice, ".claude", "skills", "saluta", "SKILL.md"), scope: "user", enabled: true, pluginId: null })

  test("«/saluta» parte come ingresso skill, col testo $saluta e il percorso; il giro registrato risponde", async () => {
    const b = await avvia()
    b.cliente.risposte.set("skills/list", () => ({ data: [{ cwd: b.lavoro, errors: [], skills: [saluta(b)] }] }))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)

    const terzo = giroRegistrato(3)
    b.cliente.turni.push(giroDi(terzo))
    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/saluta a tutti" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("turn/start")[1]).toMatchObject({
      input: [
        { type: "text", text: "$saluta a tutti", text_elements: [] },
        { type: "skill", name: "saluta", path: join(b.codice, ".claude", "skills", "saluta", "SKILL.md") },
      ],
    })
    await finisciIlGiro(b, id, terzo)
    expect((await ultimoMessaggio(b, id))?.parti.find((p) => p.tipo === "testo")?.testo).toBe("GIRASOLE")
  })

  test("un messaggio con la barra che non è una skill va com'è scritto", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    b.cliente.turni.push("secondo")
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/boh qualcosa" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("turn/start")[1]).toMatchObject({ input: [{ type: "text", text: "/boh qualcosa", text_elements: [] }] })
  })

  test("«/compact» chiede a Codex di riassumere e il contesto resta da rimisurare", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    expect((await dettaglio(b, id)).corpo.contesto_usato?.usati).toBeGreaterThan(0)

    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/compact" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("thread/compact/start").length === 1)
    expect(b.cliente.di("thread/compact/start")[0]).toEqual({ threadId: THREAD_REGISTRATO })
    expect(b.cliente.di("turn/start")).toHaveLength(1)
    const turno = { id: "compattazione", items: [], status: "inProgress" }
    b.cliente.notifica("turn/started", { threadId: THREAD_REGISTRATO, turn: turno })
    b.cliente.notifica("item/started", { threadId: THREAD_REGISTRATO, turnId: turno.id, item: { type: "contextCompaction", id: "c1" } })
    b.cliente.notifica("item/completed", { threadId: THREAD_REGISTRATO, turnId: turno.id, item: { type: "contextCompaction", id: "c1" } })
    b.cliente.notifica("thread/compacted", { threadId: THREAD_REGISTRATO, turnId: turno.id })
    b.cliente.notifica("turn/completed", { threadId: THREAD_REGISTRATO, turn: { ...turno, status: "completed", durationMs: 10 } })
    await aspetta(async () => (await statoDi(b, id)) === "pronta" && (await dettaglio(b, id)).corpo.contesto_usato === null)
  })
})

describe("modello ed effort", () => {
  test("cambiati a conversazione aperta valgono dal messaggio dopo; null torna all'effort predefinito del modello", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b, { effort: "low" })
    await finisciIlGiro(b, id, giro)
    const imposta = async (corpo: object) => {
      const r = await chiama<{ modello?: string; effort?: string | null; errore?: string }>(b.a, "POST", `/api/chat/${id}/impostazioni`, corpo)
      return [r.stato, r.corpo.errore ?? [r.corpo.modello, r.corpo.effort]] as const
    }
    const dopo = async (testo: string, giro: Notifica[]) => {
      b.cliente.turni.push(giroDi(giro))
      const prima = b.cliente.di("turn/start").length
      await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo })
      await aspetta(() => b.cliente.di("turn/start").length === prima + 1)
      await finisciIlGiro(b, id, giro)
      return b.cliente.di("turn/start").at(-1)
    }

    const aCodex = () => b.cliente.richieste.filter((r) => r.metodo !== "model/list").length
    const prima = aCodex()
    expect(await imposta({ modello: "codex/gpt-5.6-terra", effort: "ultra" })).toEqual([200, ["codex/gpt-5.6-terra", "ultra"]])
    expect(aCodex()).toBe(prima)
    expect(await dopo("Uno", giroRegistrato(3))).toMatchObject({ model: "gpt-5.6-terra", effort: "ultra", summary: "auto" })

    expect(await imposta({ effort: null })).toEqual([200, ["codex/gpt-5.6-terra", null]])
    expect(await dopo("Due", giroRegistrato(2))).toMatchObject({ model: "gpt-5.6-terra", effort: "high" })

    expect(await imposta({ effort: "enorme" })).toEqual([400, "L'effort «enorme» non esiste. I livelli sono: low, medium, high, xhigh, max, ultra, turbo."])
    expect(await imposta({ modello: "opus" })).toEqual([400, "Questa conversazione è di Codex: per un modello di Claude aprine una nuova."])
  })

  test("un effort che il modello non ha si rifiuta con i livelli che ha", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/impostazioni`, { effort: "ultra" })
    expect([r.stato, r.corpo.errore]).toEqual([400, "Codex · GPT-5.6 Luna non ha l'effort «ultra». I suoi livelli sono: low, medium, high, xhigh, max."])
  })
})

describe("le richieste di Codex al creator", () => {
  const domanda = { id: "q1", header: "Colore", question: "Rosso o blu?", isOther: true, isSecret: false, options: [{ label: "Rosso", description: "caldo" }, { label: "Blu", description: "freddo" }] }
  const attesa = async (b: Banco, id: string) => aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa[0])

  test("una domanda apre i bottoni; la risposta del creator torna a Codex per identificativo", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const { risposta } = b.cliente.richiesta("item/tool/requestUserInput", { threadId: THREAD_REGISTRATO, turnId: "t", itemId: "i1", questions: [domanda], isBlocking: true, autoResolutionMs: null })
    const aperta = await attesa(b, id)
    expect(aperta).toMatchObject({ tipo: "domanda", domande: [{ domanda: "Rosso o blu?", intestazione: "Colore", opzioni: [{ etichetta: "Rosso", descrizione: "caldo" }, { etichetta: "Blu", descrizione: "freddo" }], multipla: false }] })
    await aspetta(async () => (await statoDi(b, id)) === "aspetta")
    expect((await chiama(b.a, "POST", `/api/chat/${id}/risposte/${aperta.id}`, { scelta: { risposte: { "Rosso o blu?": "Blu" } } })).stato).toBe(200)
    expect(await risposta).toEqual({ answers: { q1: { answers: ["Blu"] } } })
  })

  test("«Ferma» rifiuta la domanda: Codex riceve un errore con la frase del rifiuto", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const { risposta } = b.cliente.richiesta("item/tool/requestUserInput", { threadId: THREAD_REGISTRATO, turnId: "t", itemId: "i1", questions: [domanda], isBlocking: true, autoResolutionMs: null })
    await attesa(b, id)
    const rifiutata = risposta.then(
      () => null,
      (errore: Error) => errore.message,
    )
    await chiama(b.a, "POST", `/api/chat/${id}/ferma`)
    expect(await rifiutata).toBe("Il lavoro è stato fermato.")
  })

  test("un permesso per un comando, uno per i file e uno ritirato da Codex", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const base = { threadId: THREAD_REGISTRATO, turnId: "t", startedAtMs: 1, environmentId: null }

    const comando = b.cliente.richiesta("item/commandExecution/requestApproval", { ...base, kind: "command", itemId: "c1", command: "rm -rf prova", commandActions: [{ type: "unknown", command: "rm -rf prova" }] })
    const primo = await attesa(b, id)
    expect(primo).toMatchObject({ tipo: "permesso", strumento: "Bash", ingresso: { command: "rm -rf prova" }, frase: "Codex vuole usare Bash: rm -rf prova" })
    await chiama(b.a, "POST", `/api/chat/${id}/risposte/${primo.id}`, { scelta: "consenti" })
    expect(await comando.risposta).toEqual({ decision: "accept" })

    const file = b.cliente.richiesta("item/fileChange/requestApproval", { ...base, itemId: "f1", reason: "serve scrivere", grantRoot: null })
    const secondo = await attesa(b, id)
    expect(secondo).toMatchObject({ tipo: "permesso", strumento: "Edit", ingresso: { description: "serve scrivere" } })
    await chiama(b.a, "POST", `/api/chat/${id}/risposte/${secondo.id}`, { scelta: "no", motivo: "meglio di no" })
    expect(await file.risposta).toEqual({ decision: "decline" })

    const ritirato = b.cliente.richiesta("item/commandExecution/requestApproval", { ...base, kind: "command", itemId: "c2", command: "ls" })
    await attesa(b, id)
    ritirato.ritira()
    await aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa.length === 0)
  })

  test("una richiesta per una conversazione che non è aperta, o che la chat non sa, riceve un errore", async () => {
    const b = await avvia()
    await creaSuCodex(b)
    await expect(b.cliente.richiesta("item/tool/requestUserInput", { threadId: "altro", itemId: "i", questions: [] }).risposta).rejects.toThrow("not open")
    await expect(b.cliente.richiesta("item/tool/call", { threadId: THREAD_REGISTRATO }).risposta).rejects.toThrow("does not answer")
  })
})

describe("chiudere e riaprire", () => {
  test("chiusa, si rilegge da Codex e un messaggio la riprende sullo stesso thread", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)).stato).toBe(200)

    const chiusa = (await dettaglio(b, id)).corpo
    expect(chiusa).toMatchObject({ motore: "codex", attiva: false, stato: "pronta", modello: "codex/gpt-5.6-luna", primo_giro: false })
    expect(b.cliente.di("thread/read")).toEqual([{ threadId: THREAD_REGISTRATO, includeTurns: true }])
    expect(chiusa.messaggi[0]).toMatchObject({ ruolo: "utente", parti: [{ tipo: "testo", testo: expect.stringContaining("First run this exact shell command") }] })
    expect(nomiDelleParti(chiusa.messaggi[3]?.parti ?? [])).toEqual(["Bash", "Write", "Bash", "testo"])
    expect(chiusa.messaggi[3]?.parti[0]?.esito).toContain("Pacchetti: Trasmessi = 10")

    b.cliente.turni.push("dopo")
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendiamo" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("thread/start")).toHaveLength(1)
    expect(b.cliente.di("thread/resume")).toEqual([expect.objectContaining({ threadId: THREAD_REGISTRATO, model: "gpt-5.6-luna", cwd: b.lavoro, approvalPolicy: "never", sandbox: "danger-full-access" })])
    expect(b.cliente.di("turn/start")[1]).toMatchObject({ threadId: THREAD_REGISTRATO, model: "gpt-5.6-luna", input: [{ type: "text", text: "Riprendiamo", text_elements: [] }] })
  })

  test("chiusa, la conversazione smette di essere seguita presso Codex una volta sola, e riaperta riprende dopo che Codex ha risposto", async () => {
    const b = await avvia()
    const risposta = Promise.withResolvers<void>()
    b.cliente.risposte.set("thread/unsubscribe", async () => {
      await risposta.promise
      return { status: "unsubscribed" }
    })
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)).stato).toBe(200)
    expect(b.cliente.di("thread/unsubscribe")).toEqual([{ threadId: THREAD_REGISTRATO }])

    b.cliente.turni.push("dopo")
    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendiamo" })).stato).toBe(202)
    await Bun.sleep(100)
    expect(b.cliente.di("thread/resume")).toEqual([])
    risposta.resolve()
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("thread/resume")).toHaveLength(1)
    expect(b.cliente.di("thread/unsubscribe")).toHaveLength(1)
  })

  test("se Codex non risponde alla disiscrizione l'errore va nel registro del server e la conversazione si riprende lo stesso", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/unsubscribe", () => {
      throw new ErroreDiCodex("non c'è", -32600)
    })
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    const righe: string[] = []
    const originale = console.error
    console.error = (...x: unknown[]) => void righe.push(x.map(String).join(" "))
    try {
      await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
      await aspetta(() => righe.some((r) => r.includes("non riesco a chiudere la conversazione")))
    } finally {
      console.error = originale
    }
    b.cliente.turni.push("dopo")
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendiamo" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
  })

  test("se il programma è caduto non si chiede niente a Codex per chiudere la conversazione", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    b.cliente.cadi()
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    expect(b.cliente.di("thread/unsubscribe")).toEqual([])
  })

  test("il primo giro si riconosce dai testi del creator nel thread", async () => {
    const b = await avvia()
    const avvio = "[Start: first round] The creator has just opened the app for the first time."
    const letto = rispostaRegistrata("thread/read") as { thread: { turns: { items: { type: string; content?: unknown }[] }[] } }
    b.cliente.risposte.set("thread/read", () => ({ ...letto, thread: { ...letto.thread, turns: [{ ...letto.thread.turns[0], items: [{ type: "userMessage", id: "u0", content: [{ type: "text", text: avvio, text_elements: [] }] }, ...(letto.thread.turns[0]?.items ?? [])] }] } }))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const d = (await dettaglio(b, id)).corpo
    expect(d.primo_giro).toBe(true)
    expect(d.messaggi.find((m) => m.ruolo === "utente")?.parti[0]?.testo).not.toContain("Start: first round")
  })
})

describe("le conversazioni aperte dal terminale", () => {
  test("compaiono nell'elenco col loro identificativo, si rileggono e un messaggio le continua", async () => {
    const b = await avvia()
    const elencoRegistrato = rispostaRegistrata("thread/list") as { data: { id: string; name: string | null; preview: string; parentThreadId: string | null }[] }
    b.cliente.risposte.set("thread/list", () => elencoRegistrato)
    b.cliente.risposte.set("thread/read", (p) => ({ thread: { ...(rispostaRegistrata("thread/read")["thread"] as object), id: p["threadId"] } }))
    const { id } = await creaSuCodex(b)
    const dalTerminale = elencoRegistrato.data.filter((t) => t.id !== THREAD_REGISTRATO && t.parentThreadId === null)
    expect(dalTerminale.length).toBeGreaterThan(0)

    const elenco = await chiama<{ id: string; motore: string; titolo: string }[]>(b.a, "GET", "/api/chat")
    expect(b.cliente.di("thread/list")[0]).toEqual({ cwd: b.lavoro, limit: 100 })
    expect(elenco.corpo.filter((v) => v.motore === "codex").map((v) => v.id).sort()).toEqual([id, ...dalTerminale.map((t) => t.id)].sort())
    expect(elenco.corpo.find((v) => v.id === id)?.titolo).toBe("Ciao")
    const uno = dalTerminale[0]!
    expect(elenco.corpo.find((v) => v.id === uno.id)?.titolo).toBe(uno.name ?? uno.preview)

    const letto = (await dettaglio(b, uno.id)).corpo
    expect(letto).toMatchObject({ motore: "codex", attiva: false, modello: "codex/gpt-5.6-luna" })
    expect(letto.messaggi[0]?.ruolo).toBe("utente")
    expect(b.cliente.di("thread/read").at(-1)).toEqual({ threadId: uno.id, includeTurns: true })

    b.cliente.turni.push("dal-terminale")
    expect((await chiama(b.a, "POST", `/api/chat/${uno.id}/messaggi`, { testo: "Continuiamo" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("thread/resume")).toEqual([expect.objectContaining({ threadId: uno.id, model: "gpt-5.6-luna" })])
    expect(b.cliente.di("turn/start")[1]).toMatchObject({ threadId: uno.id })

    const registro = JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as Record<string, { sessione: string }>
    await aspetta(async () => Object.keys(JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as object).length === 2)
    expect(registro[id]?.sessione).toBe(THREAD_REGISTRATO)
    const dopo = await chiama<{ id: string }[]>(b.a, "GET", "/api/chat")
    expect(dopo.corpo.filter((v) => v.id === uno.id)).toHaveLength(1)
  })

  test("se Codex non dà l'elenco, restano le conversazioni del registro e l'errore va nel registro del server", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    b.cliente.risposte.set("thread/list", () => {
      throw new ErroreDiCodex("non c'è", null)
    })
    const elenco = await chiama<{ id: string; motore: string }[]>(b.a, "GET", "/api/chat")
    expect(elenco.stato).toBe(200)
    expect(elenco.corpo.filter((v) => v.motore === "codex").map((v) => v.id)).toEqual([id])
  })
})

describe("l'elenco che si aggiorna da sé", () => {
  const TERMINALE = "00000000-0000-7000-8000-0000000000aa"
  const file = (casa: string, thread: string) => join(casa, "sessions", "2026", "11", "13", `rollout-2026-11-13T10-00-00-${thread}.jsonl`)
  const eventiElenco = (ascolto: Awaited<ReturnType<typeof ascolta>>, id: string) =>
    ascolto.messaggi.filter((m) => {
      const e = m as { tipo?: string; id?: string; evento?: string }
      return e.tipo === "chat" && e.id === id && e.evento === "elenco"
    })
  const delTerminale = { id: TERMINALE, name: null, preview: "Aperta dal terminale", parentThreadId: null, updatedAt: 1_700_000_000, model: "gpt-5.6-luna" }

  async function conCasa(b: Banco): Promise<string> {
    const casa = join(b.radice, "casa-di-codex")
    await mkdir(join(casa, "sessions", "2026", "11", "13"), { recursive: true })
    b.cliente.casa = casa
    return casa
  }

  test("una conversazione aperta dal terminale compare nell'elenco senza che nessuno lo rilegga", async () => {
    const b = await avvia()
    const casa = await conCasa(b)
    expect((await chiama<{ id: string }[]>(b.a, "GET", "/api/chat")).corpo).toEqual([])
    const ascolto = await ascolta(b.a)

    b.cliente.risposte.set("thread/list", () => ({ data: [delTerminale], nextCursor: null }))
    await writeFile(file(casa, TERMINALE), "{}\n")
    await aspetta(() => eventiElenco(ascolto, TERMINALE).length > 0)

    const elenco = (await chiama<{ id: string; motore: string; titolo: string }[]>(b.a, "GET", "/api/chat")).corpo
    expect(elenco.map((v) => [v.id, v.motore, v.titolo])).toEqual([[TERMINALE, "codex", "Aperta dal terminale"]])
    expect(b.cliente.di("thread/list").length).toBeGreaterThan(1)
    ascolto.chiudi()
  })

  test("i file di una conversazione accesa dalla chat non fanno rileggere l'elenco; chiusa, il suo cambio porta l'identificativo della chat", async () => {
    const b = await avvia()
    const casa = await conCasa(b)
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    await chiama(b.a, "GET", "/api/chat")
    const ascolto = await ascolta(b.a)
    const prima = b.cliente.di("thread/list").length

    await writeFile(file(casa, THREAD_REGISTRATO), "{}\n")
    await Bun.sleep(700)
    expect(eventiElenco(ascolto, THREAD_REGISTRATO)).toEqual([])
    expect(b.cliente.di("thread/list")).toHaveLength(prima)

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const dopoLaChiusura = eventiElenco(ascolto, id).length
    await writeFile(file(casa, THREAD_REGISTRATO), "{}\n{}\n")
    await aspetta(() => eventiElenco(ascolto, id).length > dopoLaChiusura)
    expect(eventiElenco(ascolto, THREAD_REGISTRATO)).toEqual([])
    ascolto.chiudi()
  })

  test("se la cartella dei thread non c'è, o Codex non dice dov'è, l'elenco resta com'era e una riga va nel registro del server", async () => {
    const senzaCartella = await avvia()
    senzaCartella.cliente.casa = join(senzaCartella.radice, "casa-che-non-c-e")
    const senzaCasa = await avvia()
    const righe: string[] = []
    const originale = console.error
    console.error = (...x: unknown[]) => void righe.push(x.map(String).join(" "))
    try {
      expect((await chiama(senzaCartella.a, "GET", "/api/chat")).stato).toBe(200)
      expect((await chiama(senzaCasa.a, "GET", "/api/chat")).stato).toBe(200)
    } finally {
      console.error = originale
    }
    expect(righe.some((r) => r.includes("non riesco a seguire le sue conversazioni") && r.includes("casa-che-non-c-e"))).toBe(true)
    expect(righe.some((r) => r.includes("Codex non ha detto dove tiene le sue conversazioni"))).toBe(true)
    senzaCartella.cliente.risposte.set("thread/list", () => ({ data: [delTerminale], nextCursor: null }))
    expect((await chiama<{ id: string }[]>(senzaCartella.a, "GET", "/api/chat")).corpo).toEqual([])
    expect(senzaCartella.cliente.di("thread/list")).toHaveLength(1)
  })
})

describe("i comandi /review e /rename", () => {
  const rivista = (turno: string, revisione: string) => {
    const base = { threadId: THREAD_REGISTRATO, turnId: turno }
    return [
      { metodo: "turn/started", parametri: { threadId: THREAD_REGISTRATO, turn: { id: turno, items: [], status: "inProgress" } } },
      { metodo: "item/started", parametri: { ...base, item: { type: "enteredReviewMode", id: "r1", review: "il piano" } } },
      { metodo: "item/completed", parametri: { ...base, item: { type: "exitedReviewMode", id: "r2", review: revisione } } },
      { metodo: "turn/completed", parametri: { threadId: THREAD_REGISTRATO, turn: { id: turno, items: [], status: "completed", durationMs: 10 } } },
    ] satisfies Notifica[]
  }

  async function pronta(b: Banco): Promise<string> {
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    return id
  }

  test("«/review cosa» avvia la revisione di Codex su ciò che il creator dice, e il testo che Codex ne ricava è la risposta", async () => {
    const b = await avvia()
    const id = await pronta(b)
    b.cliente.turni.push("revisione")
    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/review il piano del video" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("review/start").length === 1)
    expect(b.cliente.di("review/start")[0]).toEqual({ threadId: THREAD_REGISTRATO, target: { type: "custom", instructions: "il piano del video" } })
    expect(b.cliente.di("turn/start")).toHaveLength(1)

    b.cliente.notificheDi(rivista("revisione", "Il piano ha due scene uguali."))
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect(nomiDelleParti((await ultimoMessaggio(b, id))?.parti ?? [])).toEqual(["testo", "fine"])
    expect((await ultimoMessaggio(b, id))?.parti[0]?.testo).toBe("Il piano ha due scene uguali.")
  })

  test("«/review» da solo rivede il lavoro fatto nella conversazione", async () => {
    const b = await avvia()
    const id = await pronta(b)
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/review" })
    await aspetta(() => b.cliente.di("review/start").length === 1)
    expect((b.cliente.di("review/start")[0] as { target: { type: string; instructions: string } }).target).toMatchObject({ type: "custom", instructions: expect.stringContaining("Review the work done in this conversation") })
  })

  test("«/review» mentre Codex lavora non parte: la risposta lo dice e il giro in corso resta", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/review" })
    await aspetta(async () => JSON.stringify((await dettaglio(b, id)).corpo.messaggi).includes("Una revisione parte quando il lavoro in corso è finito"))
    expect(b.cliente.di("review/start")).toEqual([])
    expect(await statoDi(b, id)).toBe("lavora")
  })

  test("«/rename nome» dà il nome al thread, cambia il titolo della conversazione e la lascia pronta", async () => {
    const b = await avvia()
    const id = await pronta(b)
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/rename Il video del mare" })
    await aspetta(() => b.cliente.di("thread/name/set").length === 1)
    expect(b.cliente.di("thread/name/set")[0]).toEqual({ threadId: THREAD_REGISTRATO, name: "Il video del mare" })
    await aspetta(async () => (await dettaglio(b, id)).corpo.titolo === "Il video del mare")
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect(nomiDelleParti((await ultimoMessaggio(b, id))?.parti ?? [])).toEqual(["testo", "fine"])
    expect((await ultimoMessaggio(b, id))?.parti[0]?.testo).toBe("Conversazione rinominata: «Il video del mare».")
    const registro = JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as Record<string, { titolo: string }>
    expect(registro[id]?.titolo).toBe("Il video del mare")
  })

  test("«/rename» senza nome dice cosa scrivere e non cambia niente", async () => {
    const b = await avvia()
    const id = await pronta(b)
    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/rename" })
    await aspetta(async () => (await ultimoMessaggio(b, id))?.parti[0]?.testo === "Scrivi il nome dopo «/rename».")
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect(b.cliente.di("thread/name/set")).toEqual([])
  })

  test("una skill che si chiama come un comando del motore non lo copre", async () => {
    const b = await avvia()
    b.cliente.risposte.set("skills/list", () => ({
      data: [{ cwd: b.lavoro, errors: [], skills: [{ name: "review", description: "Una skill.", path: join(b.codice, ".claude", "skills", "review", "SKILL.md"), scope: "user", enabled: true, pluginId: null }] }],
    }))
    const r = await chiama<{ nome: string }[]>(b.a, "GET", "/api/chat/comandi?motore=codex")
    expect(r.corpo.map((c) => c.nome)).toEqual(["compact", "review", "rename"])
  })
})

describe("il contesto di una conversazione riletta", () => {
  test("chiusa dice quanto contesto occupava all'ultima risposta, con la finestra; dopo un riassunto non lo sa; un valore che non si legge vale come non saputo", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    const diretta = (await dettaglio(b, id)).corpo.contesto_usato
    expect(diretta?.usati).toBeGreaterThan(0)
    expect(diretta?.totale).toBe(258400)
    await aspetta(async () => (await b.codex.registro.di(id))?.contesto?.usati === diretta?.usati)

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    expect((await dettaglio(b, id)).corpo.contesto_usato).toEqual(diretta)
    const registro = JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as Record<string, { contesto?: unknown }>
    expect(registro[id]?.contesto).toEqual(diretta)

    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/compact" })
    await aspetta(() => b.cliente.di("thread/compact/start").length === 1)
    const turno = { id: "compattazione", items: [], status: "inProgress" }
    b.cliente.notifica("turn/started", { threadId: THREAD_REGISTRATO, turn: turno })
    b.cliente.notifica("thread/compacted", { threadId: THREAD_REGISTRATO, turnId: turno.id })
    b.cliente.notifica("turn/completed", { threadId: THREAD_REGISTRATO, turn: { ...turno, status: "completed", durationMs: 10 } })
    await aspetta(async () => (await statoDi(b, id)) === "pronta" && (await dettaglio(b, id)).corpo.contesto_usato === null)
    await aspetta(async () => (await b.codex.registro.di(id))?.contesto === null)
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    expect((await dettaglio(b, id)).corpo.contesto_usato).toBeNull()

    const percorso = join(b.archivio, ".chat", "codex.json")
    const guasto = JSON.parse(await readFile(percorso, "utf-8")) as Record<string, object>
    await writeFile(percorso, JSON.stringify({ ...guasto, [id]: { ...guasto[id], contesto: "boh" } }))
    expect((await dettaglio(b, id)).corpo.contesto_usato).toBeNull()
  })
})

describe("quando le cose vanno male", () => {
  const ultimaParte = async (b: Banco, id: string) => (await ultimoMessaggio(b, id))?.parti.at(-1)

  test("il limite raggiunto ha la sua frase, con l'ora in cui si libera", async () => {
    const b = await avvia()
    const { id } = await creaSuCodex(b)
    const turno = { id: "t-limite", items: [], status: "inProgress" }
    b.cliente.notifica("turn/started", { threadId: THREAD_REGISTRATO, turn: turno })
    const finestra = { usedPercent: 100, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 2 * 3600 }
    b.cliente.notifica("account/rateLimits/updated", { rateLimits: { limitId: "codex", primary: finestra, secondary: null } })
    b.cliente.notifica("turn/completed", { threadId: THREAD_REGISTRATO, turn: { ...turno, status: "failed", error: { message: "limit", codexErrorInfo: "usageLimitExceeded" }, durationMs: 5 } })
    await aspetta(async () => (await statoDi(b, id)) === "pronta")
    expect((await ultimaParte(b, id))?.errore).toMatch(/^Hai finito i messaggi che l'abbonamento permette per ora: si libera /)
  })

  test("Codex non collegato: non è pronto e la conversazione dice di accedere", async () => {
    const b = await avvia()
    b.cliente.risposte.set("account/read", () => ({ account: null, requiresOpenaiAuth: true, workspaceRouting: null }))
    expect((await chiama<{ id: string; pronto: boolean }[]>(b.a, "GET", "/api/chat/motori")).corpo.find((m) => m.id === "codex")?.pronto).toBe(false)
    const id = await crea(b, { modello: "codex/gpt-5.6-luna" })
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    expect((await ultimaParte(b, id))?.errore).toBe("Codex non è collegato a un account: accedi da un terminale con «codex login» e riscrivi il messaggio.")
    expect(b.cliente.di("thread/start")).toEqual([])
  })

  test("Codex troppo vecchio: la frase dice di aggiornarlo e con quale versione, a conversazione aperta e a conversazione chiusa", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/read", () => rispostaRegistrata("thread/read"))
    const { id, giro } = await creaSuCodex(b)
    await finisciIlGiro(b, id, giro)
    for (const metodo of [...b.cliente.risposte.keys()]) {
      b.cliente.risposte.set(metodo, () => {
        throw new CodexTroppoVecchio("0.150.0", "0.167.0")
      })
    }
    const frase = "Questo Codex (0.150.0) è troppo vecchio per la chat: aggiornalo alla 0.167.0 o a una più recente e riscrivi il messaggio."
    expect((await chiama<{ id: string; pronto: boolean }[]>(b.a, "GET", "/api/chat/motori")).corpo.find((m) => m.id === "codex")?.pronto).toBe(false)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ancora" })).stato).toBe(202)
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    expect((await ultimaParte(b, id))?.errore).toBe(frase)

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const chiusa = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendiamo" })
    expect([chiusa.stato, chiusa.corpo.errore]).toEqual([502, frase])
    expect((await chiama<{ motore: string }[]>(b.a, "GET", "/api/chat/modelli")).corpo.some((m) => m.motore === "claude-code")).toBe(true)
  })

  test("Codex che non parte o non risponde: una frase intera, e il dettaglio va nel registro del server", async () => {
    const b = await avvia()
    b.cliente.risposte.set("account/read", () => {
      throw new ErroreDiCodex("Non riesco ad accendere Codex: spawn", null)
    })
    const id = await crea(b, { modello: "codex/gpt-5.6-luna" })
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    expect((await ultimaParte(b, id))?.errore).toBe("Codex non risponde: controlla che sia installato e riscrivi il messaggio.")
  })

  test("Codex che dà un errore: la frase lo riporta", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/start", () => {
      throw new ErroreDiCodex("model not found", -32600)
    })
    const id = await crea(b, { modello: "codex/gpt-5.6-luna" })
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    expect((await ultimaParte(b, id))?.errore).toBe("Codex ha dato un errore: model not found")
  })

  test("il programma cade con un comando in background: il lavoro sparisce con la conversazione", async () => {
    const b = await avvia()
    b.cliente.risposte.set("thread/backgroundTerminals/list", () => ({ data: [{ itemId: "cmd-1", processId: "4242", command: "ping", cwd: b.lavoro, osPid: null, cpuPercent: null, rssKb: null }], nextCursor: null }))
    const id = await conComandoAcceso(b)
    expect((await dettaglio(b, id)).corpo.task).toHaveLength(1)
    b.cliente.cadi()
    await aspetta(async () => (await dettaglio(b, id)).corpo.task.length === 0)
    expect((await dettaglio(b, id)).corpo.attiva).toBe(false)
  })

  test("il programma cade a metà: l'errore si vede e il messaggio dopo riprende lo stesso thread", async () => {
    const b = await avvia()
    const { id, giro } = await creaSuCodex(b)
    b.cliente.notificheDi(giro.slice(0, doveParteIlComando(giro) + 1))
    await aspettaIlComando(b, id)

    b.cliente.cadi()
    await aspetta(async () => (await statoDi(b, id)) === "errore")
    expect((await ultimaParte(b, id))?.errore).toBe("Codex si è chiuso all'improvviso: riscrivi il messaggio.")
    expect((await dettaglio(b, id)).corpo).toMatchObject({ attiva: false, task: [] })

    b.cliente.turni.push("dopo-la-caduta")
    expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendi" })).stato).toBe(202)
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    expect(b.cliente.di("thread/resume")).toEqual([expect.objectContaining({ threadId: THREAD_REGISTRATO })])
    expect(b.cliente.di("skills/extraRoots/set")).toHaveLength(2)
    expect((await dettaglio(b, id)).corpo.attiva).toBe(true)
  })
})

describe("il motore da solo", () => {
  test("le immagini del messaggio vanno come ingresso immagine, dopo il testo", async () => {
    const b = await avvia()
    const eventi: EventoMotore[] = []
    const sessione = b.codex.apri({
      id: "00000000-0000-4000-8000-0000000000bb",
      esiste: false,
      codice: b.codice,
      lavoro: b.lavoro,
      modello: "codex/gpt-5.6-luna",
      effort: null,
      evento: (e) => void eventi.push(e),
      chiedi: async () => ({ consente: true }),
      lingua: () => "it",
    })
    sessione.scrivi({ testo: "Guarda", immagini: [{ tipo: "image/png", dati: "AAAA" }] })
    await aspetta(() => b.cliente.di("turn/start").length === 1)
    expect(b.cliente.di("turn/start")[0]).toMatchObject({
      input: [
        { type: "text", text: "Guarda", text_elements: [] },
        { type: "image", url: "data:image/png;base64,AAAA" },
      ],
    })
    expect(eventi).toContainEqual({ tipo: "avvio", modello: "codex/gpt-5.6-luna", effort: "medium" })
    sessione.chiudi()
    await sessione.finita
  })

  test("le notifiche di un thread vanno alla sua conversazione; quelle senza thread, come i limiti, a tutte", async () => {
    const b = await avvia()
    const prima = await creaSuCodex(b)
    b.cliente.turni.unshift("giro-b")
    const seconda = await crea(b, { modello: "codex/gpt-5.6-luna" })
    await aspetta(() => b.cliente.di("turn/start").length === 2)
    const altroThread = b.cliente.di("thread/start").length === 2 ? "01a1d700-0000-7000-8000-000000000001" : ""
    expect(altroThread).not.toBe("")

    b.cliente.notifica("turn/started", { threadId: altroThread, turn: { id: "giro-b", items: [], status: "inProgress" } })
    b.cliente.notifica("item/agentMessage/delta", { threadId: altroThread, turnId: "giro-b", itemId: "m", delta: "Solo la seconda" })
    await aspetta(async () => (await ultimoMessaggio(b, seconda))?.parti.some((p) => p.testo === "Solo la seconda"))
    expect((await ultimoMessaggio(b, prima.id))?.parti.some((p) => p.testo === "Solo la seconda")).toBe(false)
  })
})

describe("i tre motori insieme", () => {
  test("una conversazione per ciascuno, aperte insieme: ognuna resta del suo, nell'elenco, nel dettaglio, nei messaggi e nel registro", async () => {
    const b = await avvia()
    const claude = await crea(b, { modello: "opus" })
    const qClaude = await aspetta(() => b.claude.queries.find((q) => !q.chiusa && q.opzioni.sessionId === claude))
    const mango = await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    const { id: codex } = await creaSuCodex(b)

    const elenco = await chiama<{ id: string; motore: string }[]>(b.a, "GET", "/api/chat")
    expect(Object.fromEntries(elenco.corpo.map((v) => [v.id, v.motore]))).toEqual({ [claude]: "claude-code", [mango]: "mango-code", [codex]: "codex" })
    expect((await dettaglio(b, claude)).corpo.motore).toBe("claude-code")
    expect((await dettaglio(b, mango)).corpo.motore).toBe("mango-code")
    expect((await dettaglio(b, codex)).corpo).toMatchObject({ motore: "codex", modello: "codex/gpt-5.6-luna", attiva: true })

    b.cliente.turni.push("secondo")
    for (const id of [claude, mango, codex]) expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ancora" })).stato).toBe(202)
    await aspetta(() => qClaude.ricevuti.length === 2 && b.mc.di(`/session/${SESSIONE}/prompt_async`).length === 2 && b.cliente.di("turn/start").length + b.cliente.di("turn/steer").length === 2)
    expect(b.cliente.di("thread/start")).toHaveLength(1)

    const cambia = async (id: string, modello: string) => {
      const r = await chiama<{ errore?: string; modello?: string }>(b.a, "POST", `/api/chat/${id}/impostazioni`, { modello })
      return [r.stato, r.corpo.errore ?? r.corpo.modello] as const
    }
    expect(await cambia(codex, "mango-code/toq")).toEqual([400, "Questa conversazione è di Codex: per un modello di Mango Code aprine una nuova."])
    expect(await cambia(claude, "codex/gpt-5.6-terra")).toEqual([400, "Questa conversazione è di Claude Code: per un modello di Codex aprine una nuova."])
    expect(await cambia(mango, "codex/gpt-5.6-terra")).toEqual([400, "Questa conversazione è di Mango Code: per un modello di Codex aprine una nuova."])
    expect(await cambia(codex, "codex/gpt-5.6-terra")).toEqual([200, "codex/gpt-5.6-terra"])

    await aspetta(async () => Object.keys(JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as object).length === 1)
    expect(Object.keys(JSON.parse(await readFile(join(b.archivio, ".chat", "codex.json"), "utf-8")) as object)).toEqual([codex])
  })

  test("senza Codex fra i motori la chat è quella di prima", async () => {
    const b = await avvia()
    const chat = new Chat({ codice: b.codice, lavoro: b.lavoro, archivio: b.archivio, eventi: new Eventi(1000), opzioni: { motori: [new ClaudeCode(new Finto().query, new FinteSessioni())] }, titoloDelVideo: () => undefined, adesso: () => new Date(), lingua: () => "it" })
    expect((await chat.motoriOfferti()).map((m) => m.id)).toEqual(["claude-code"])
    await chat.chiudi()
  })
})
