// Codex nella chat, tutto insieme: il motore, il cliente che parla su stdio e un programma finto al posto di `codex app-server`
// (`finto-codex.ts`), dalle rotte della chat fino ai messaggi che lo studio legge.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ClaudeCode } from "../src/chat/claude/claude"
import { avviaCodex } from "../src/chat/codex/cliente"
import { Codex } from "../src/chat/codex/codex"
import type { ClienteCodex } from "../src/chat/codex/protocollo"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"
import { Finto, FinteSessioni } from "./aiuti-chat"

const cartelle: string[] = []
const clienti: ClienteCodex[] = []

afterEach(async () => {
  await fermaTutti()
  await Promise.all(clienti.splice(0).map((c) => c.chiudi()))
  await Promise.all(cartelle.splice(0).map((c) => rm(c, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })))
})

interface Banco {
  a: Ambiente
  cliente: ClienteCodex
  lavoro: string
  /** Ciò che il programma finto ha ricevuto, un messaggio per riga. */
  ricevuti: () => Promise<{ method?: string; params?: Record<string, unknown> }[]>
}

async function avvia(ambiente: Record<string, string> = {}): Promise<Banco> {
  const radice = await mkdtemp(join(tmpdir(), "mango-codex-insieme-"))
  cartelle.push(radice)
  const codice = join(radice, "codice")
  const lavoro = join(radice, "lavoro")
  const archivio = join(lavoro, "archivio")
  await mkdir(join(codice, ".claude", "skills", "saluta"), { recursive: true })
  await mkdir(join(codice, ".claude", "rules"), { recursive: true })
  await writeFile(join(codice, "CLAUDE.md"), "# Metodo di prova\n")
  await writeFile(join(codice, ".claude", "skills", "saluta", "SKILL.md"), "---\nname: saluta\ndescription: Saluta il creator.\n---\n\nSaluta.\n")
  await mkdir(lavoro, { recursive: true })
  const registro = join(radice, "ricevuti.jsonl")
  const cliente = avviaCodex({
    programma: process.execPath,
    argomenti: ["run", join(import.meta.dir, "finto-codex.ts")],
    ambiente: { ...process.env, FINTO_CODEX_REGISTRO: registro, FINTO_CODEX_CARTELLA: join(radice, "thread"), FINTO_CODEX_HOME: join(radice, "casa-di-codex"), ...ambiente },
    versioneMinima: "0.167.0",
  })
  clienti.push(cliente)
  if (ambiente["FINTO_CODEX_HOME"] === undefined) await mkdir(join(radice, "casa-di-codex", "sessions"), { recursive: true })
  const codex = new Codex({ cliente, archivio, codice, lavoro, adesso: () => new Date() })
  const a = await avviaAmbiente({ codice, lavoro, archivio, chat: { motori: [new ClaudeCode(new Finto().query, new FinteSessioni()), codex] } })
  const ricevuti = async () =>
    (await readFile(registro, "utf8").catch(() => ""))
      .split("\n")
      .filter((riga) => riga !== "")
      .map((riga) => JSON.parse(riga) as { method?: string; params?: Record<string, unknown> })
  return { a, cliente, lavoro, ricevuti }
}

type Parte = { tipo: string; nome?: string; testo?: string; errore?: string; ingresso?: Record<string, unknown>; esito?: string; immagini?: { media_type: string }[] }
type Dettaglio = {
  motore: string
  modello: string | null
  stato: string
  attiva: boolean
  messaggi: { ruolo: string; parti: Parte[] }[]
  in_attesa: { id: string; tipo: string; strumento?: string; domande?: { domanda: string; opzioni: { etichetta: string }[] }[] }[]
  task: { id: string; descrizione: string }[]
  contesto_usato: { usati: number; totale: number | null } | null
}

const dettaglio = async (b: Banco, id: string) => (await chiama<Dettaglio>(b.a, "GET", `/api/chat/${id}`)).corpo
const pronta = (b: Banco, id: string) => aspetta(async () => (await dettaglio(b, id)).stato === "pronta", 15_000)
const scrivi = (b: Banco, id: string, testo: string) => chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo })
const metodi = async (b: Banco) => (await b.ricevuti()).flatMap((m) => m.method ?? [])

async function crea(b: Banco, testo: string): Promise<string> {
  const r = await chiama<{ id: string }>(b.a, "POST", "/api/chat", { testo, modello: "codex/gpt-6-luna" })
  expect(r.stato).toBe(201)
  return r.corpo.id
}

/** Una conversazione nuova col suo primo giro finito. */
async function giro(b: Banco, testo: string): Promise<{ id: string; parti: Parte[] }> {
  const id = await crea(b, testo)
  await aspetta(async () => (await dettaglio(b, id)).messaggi.some((m) => m.ruolo === "claude"), 15_000)
  await pronta(b, id)
  return { id, parti: (await dettaglio(b, id)).messaggi.filter((m) => m.ruolo === "claude").flatMap((m) => m.parti) }
}

/** Aspetta che il comando sia nel messaggio come strumento, ancora senza esito; un comando del giro non è fra i lavori. */
async function aspettaIlComando(b: Banco, id: string): Promise<void> {
  await aspetta(async () => (await dettaglio(b, id)).messaggi.some((m) => m.parti.some((p) => p.nome === "Bash" && p.esito === undefined)), 15_000)
  expect((await dettaglio(b, id)).task).toEqual([])
}

const nomi = (parti: Parte[]): string[] => parti.map((p) => (p.tipo === "strumento" ? (p.nome ?? "") : p.tipo))
const testi = (parti: Parte[]): string[] => parti.flatMap((p) => (p.tipo === "testo" ? (p.testo ?? "") : []))

describe("un giro di Codex nella chat", () => {
  test("testo a pezzi: la conversazione è di Codex, col suo modello, e il contesto usato ha la finestra", async () => {
    const b = await avvia()
    const { id, parti } = await giro(b, "Ciao")
    expect(nomi(parti)).toEqual(["testo", "fine"])
    expect(testi(parti)).toEqual(["Questa è la risposta di prova."])
    const d = await dettaglio(b, id)
    expect([d.motore, d.modello, d.attiva]).toEqual(["codex", "codex/gpt-6-luna", true])
    expect(d.contesto_usato?.totale).toBe(258_400)
    const avvio = (await b.ricevuti()).find((m) => m.method === "thread/start")!.params!
    expect(avvio).toMatchObject({ approvalPolicy: "never", sandbox: "danger-full-access", model: "gpt-6-luna" })
    expect(String(avvio["developerInstructions"])).toContain("# Metodo di prova")
    expect(Object.keys((avvio["config"] as { mcp_servers: object }).mcp_servers)).toEqual(["video"])
  })

  test("il giro registrato dal vero: comando, file scritto, e il messaggio scritto a giro in corso arriva nello stesso giro", async () => {
    const b = await avvia()
    const id = await crea(b, "COMANDO")
    await aspettaIlComando(b, id)
    expect((await scrivi(b, id, "Finisci con BANANA")).stato).toBe(202)
    await pronta(b, id)

    const d = await dettaglio(b, id)
    expect(d.task).toEqual([])
    const parti = d.messaggi.filter((m) => m.ruolo === "claude").flatMap((m) => m.parti)
    const strumenti = parti.filter((p) => p.tipo === "strumento")
    expect(strumenti.map((s) => s.nome)).toEqual(["Bash", "Write", "Bash"])
    expect(strumenti[0]).toMatchObject({ ingresso: { command: "ping -n 10 127.0.0.1" } })
    expect(strumenti[0]!.esito).toContain("Ping 127.0.0.1")
    expect(String(strumenti[1]!.ingresso!["file_path"])).toEndWith("prova.txt")
    expect(testi(parti).at(-1)).toContain("BANANA")
    expect(parti.at(-1)).toMatchObject({ tipo: "fine" })
    expect(parti.at(-1)!.errore).toBeUndefined()
    expect((await metodi(b)).filter((m) => m === "turn/start" || m === "turn/steer")).toEqual(["turn/start", "turn/steer"])
  })

  test("il pensiero, l'immagine di uno strumento, l'elenco dei passi, il contesto riassunto", async () => {
    const b = await avvia()
    const pensiero = await giro(b, "PENSIERO")
    expect(pensiero.parti[0]).toEqual({ tipo: "pensiero", testo: "Valuto la richiesta e preparo la risposta." })

    const immagine = await giro(b, "IMMAGINE")
    expect(immagine.parti[0]).toMatchObject({ tipo: "strumento", nome: "mcp__prova__foto", immagini: [{ media_type: "image/png" }] })
    expect(testi(immagine.parti)).toEqual(["L'immagine è rossa."])

    const piano = await giro(b, "PIANO")
    const elenchi = piano.parti.filter((p) => p.nome === "TodoWrite")
    expect(elenchi).toHaveLength(4)
    expect((elenchi.at(-1)!.ingresso!["todos"] as { status: string }[]).map((t) => t.status)).toEqual(["completed", "completed", "completed"])

    const riassunto = await giro(b, "RIASSUNTO")
    expect(testi(riassunto.parti)).toEqual(["Questa è la risposta di prova."])
  })

  test("una skill chiamata con la barra parte come skill di Codex, e riletta torna scritta con la barra", async () => {
    const b = await avvia()
    const comandi = (await chiama<{ nome: string }[]>(b.a, "GET", "/api/chat/comandi?motore=codex")).corpo.map((c) => c.nome)
    expect(comandi).toContain("saluta")
    expect(comandi).toContain("compact")

    const { id, parti } = await giro(b, "/saluta")
    expect(testi(parti)).toEqual(["GIRASOLE"])
    const mandato = (await b.ricevuti()).find((m) => m.method === "turn/start")!.params!["input"] as { type: string; text?: string; name?: string }[]
    expect(mandato.map((i) => i.type)).toEqual(["text", "skill"])
    expect(mandato[0]!.text).toBe(`$${mandato[1]!.name}`)

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const riletta = await dettaglio(b, id)
    expect(riletta.attiva).toBe(false)
    expect(riletta.messaggi[0]!.parti).toEqual([{ tipo: "testo", testo: "/saluta" }])
  })
})

describe("gli aiutanti e i comandi lasciati accesi", () => {
  type Lavoro = { id: string; tipo: string; descrizione: string; background: boolean; uso?: { token: number; strumenti: number } }
  const lavoriDi = (ascolto: Awaited<ReturnType<typeof ascolta>>, id: string): Lavoro[][] =>
    ascolto.messaggi.flatMap((m) => {
      const e = m as { tipo?: string; id?: string; evento?: string; task?: Lavoro[] }
      return e.tipo === "chat" && e.id === id && e.evento === "task" && e.task ? [e.task] : []
    })

  test("un aiutante compare fra i lavori, con l'uso del suo thread, e sparisce quando finisce; il suo thread non entra nella conversazione", async () => {
    const b = await avvia()
    const ascolto = await ascolta(b.a)
    const { id, parti } = await giro(b, "AIUTANTE")

    const elenchi = lavoriDi(ascolto, id)
    expect(elenchi[0]).toEqual([expect.objectContaining({ tipo: "agente", descrizione: "Conta le scene del video", background: false })])
    expect(elenchi.some((e) => e[0]?.uso?.token === 54_000 && e[0].uso.strumenti === 1)).toBe(true)
    expect(elenchi.at(-1)).toEqual([])
    expect(new Set(elenchi.flat().map((l) => l.id)).size).toBe(1)

    expect(nomi(parti)).toEqual(["testo", "Agent", "Agent", "testo", "fine"])
    expect(testi(parti)).toEqual(["Chiamo un aiutante.", "L'aiutante ha contato dodici scene."])
    expect(JSON.stringify(parti)).not.toContain("Le scene sono dodici")
    const d = await dettaglio(b, id)
    expect(d.task).toEqual([])
    expect(d.contesto_usato?.usati).toBeLessThan(2000)
    ascolto.chiudi()

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const riletta = (await dettaglio(b, id)).messaggi.filter((m) => m.ruolo === "claude").flatMap((m) => m.parti)
    expect(nomi(riletta.filter((p) => p.tipo !== "fine"))).toEqual(["testo", "Agent", "Agent", "testo"])
    expect(riletta.find((p) => p.nome === "Agent")?.ingresso).toEqual({ description: "Conta le scene del video", prompt: "Conta le scene del video" })
  })

  test("un comando lasciato acceso resta fra i lavori in background dopo il giro, Codex lo elenca, «Ferma» sul lavoro lo chiude e sparisce", async () => {
    const b = await avvia()
    const ascolto = await ascolta(b.a)
    const { id } = await giro(b, "SFONDO")
    await aspetta(async () => (await metodi(b)).includes("thread/backgroundTerminals/list"))

    const [comando] = (await dettaglio(b, id)).task
    expect(comando).toMatchObject({ tipo: "comando", descrizione: "ping -n 600 127.0.0.1" })
    expect((comando as unknown as Lavoro).background).toBe(true)
    expect((await dettaglio(b, id)).stato).toBe("pronta")

    expect((await chiama(b.a, "POST", `/api/chat/${id}/task/${comando!.id}/ferma`)).stato).toBe(200)
    const richieste = await b.ricevuti()
    expect(richieste.filter((m) => m.method === "thread/backgroundTerminals/terminate")).toHaveLength(1)
    expect(richieste.some((m) => m.method === "turn/interrupt")).toBe(false)
    await aspetta(async () => (await dettaglio(b, id)).task.length === 0)
    expect(lavoriDi(ascolto, id).at(-1)).toEqual([])
    expect((await dettaglio(b, id)).stato).toBe("pronta")
    ascolto.chiudi()
  })
})

describe("le richieste di Codex al creator", () => {
  test("una domanda diventa bottoni, e la risposta scelta torna a Codex", async () => {
    const b = await avvia()
    const id = await crea(b, "DOMANDA")
    const richiesta = await aspetta(async () => (await dettaglio(b, id)).in_attesa[0], 15_000)
    expect(richiesta).toMatchObject({ tipo: "domanda", domande: [{ domanda: "Che colore vuoi?", opzioni: [{ etichetta: "Azzurro" }, { etichetta: "Rosso" }] }] })
    expect((await dettaglio(b, id)).stato).toBe("aspetta")
    expect((await chiama(b.a, "POST", `/api/chat/${id}/risposte/${richiesta.id}`, { scelta: { risposte: { "Che colore vuoi?": "Rosso" } } })).stato).toBe(200)
    await pronta(b, id)
    expect(testi((await dettaglio(b, id)).messaggi.at(-1)!.parti)).toEqual(["Hai risposto: Rosso."])
  })

  test("un permesso chiesto da Codex si concede dalla chat", async () => {
    const b = await avvia()
    const id = await crea(b, "PERMESSO")
    const richiesta = await aspetta(async () => (await dettaglio(b, id)).in_attesa[0], 15_000)
    expect(richiesta).toMatchObject({ tipo: "permesso", strumento: "Bash" })
    expect((await chiama(b.a, "POST", `/api/chat/${id}/risposte/${richiesta.id}`, { scelta: "consenti" })).stato).toBe(200)
    await pronta(b, id)
    expect(testi((await dettaglio(b, id)).messaggi.at(-1)!.parti)).toEqual(["Comando eseguito."])
  })
})

describe("fermare, chiudere, riprendere", () => {
  test("«Ferma» a metà di un comando: il giro si ferma senza errore e il comando non resta vivo", async () => {
    const b = await avvia()
    const id = await crea(b, "LUNGO")
    await aspettaIlComando(b, id)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    await pronta(b, id)
    const d = await dettaglio(b, id)
    expect(d.task).toEqual([])
    expect(d.messaggi.at(-1)!.parti.at(-1)).toMatchObject({ tipo: "fine" })
    expect(d.messaggi.at(-1)!.parti.at(-1)!.errore).toBeUndefined()
    const chiusure = (await b.ricevuti()).filter((m) => m.method === "thread/backgroundTerminals/terminate")
    expect(chiusure).toHaveLength(1)
    expect((await metodi(b)).indexOf("turn/interrupt")).toBeLessThan((await metodi(b)).indexOf("thread/backgroundTerminals/terminate"))
  })

  test("chiusa e riletta è uguale alla diretta, e un messaggio la continua riprendendo il suo thread", async () => {
    const b = await avvia()
    const { id } = await giro(b, "COMANDO")
    const diretta = (await dettaglio(b, id)).messaggi.map((m) => [m.ruolo, m.parti.filter((p) => p.tipo !== "fine").map((p) => [p.tipo, p.nome, p.testo, p.esito, p.ingresso])])
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)

    const elenco = (await chiama<{ id: string; motore: string; attiva: boolean }[]>(b.a, "GET", "/api/chat")).corpo
    expect(elenco.find((v) => v.id === id)).toMatchObject({ motore: "codex", attiva: false })
    const riletta = await dettaglio(b, id)
    expect([riletta.motore, riletta.modello, riletta.attiva]).toEqual(["codex", "codex/gpt-6-luna", false])
    expect(riletta.messaggi.map((m) => [m.ruolo, m.parti.map((p) => [p.tipo, p.nome, p.testo, p.esito, p.ingresso])])).toEqual(diretta)

    expect((await scrivi(b, id, "Ancora")).stato).toBe(202)
    await aspetta(async () => testi((await dettaglio(b, id)).messaggi.at(-1)!.parti).includes("Questa è la risposta di prova."), 15_000)
    await pronta(b, id)
    expect((await metodi(b)).filter((m) => m === "thread/start" || m === "thread/resume")).toEqual(["thread/start", "thread/resume"])
    expect((await dettaglio(b, id)).messaggi.length).toBe(riletta.messaggi.length + 2)
  })

  test("Codex che cade a metà giro: una frase intera, e il messaggio dopo riprende la conversazione", async () => {
    const b = await avvia()
    const id = await crea(b, "CADUTA")
    await aspetta(async () => (await dettaglio(b, id)).messaggi.at(-1)?.parti.at(-1)?.errore !== undefined, 15_000)
    const errore = (await dettaglio(b, id)).messaggi.at(-1)!.parti.at(-1)!.errore!
    expect(errore).toContain("Codex")
    expect(errore).not.toContain("finto-codex")

    expect((await scrivi(b, id, "Riprova")).stato).toBe(202)
    await aspetta(async () => testi((await dettaglio(b, id)).messaggi.at(-1)!.parti).includes("Questa è la risposta di prova."), 15_000)
    expect((await metodi(b)).filter((m) => m === "initialize")).toHaveLength(2)
    expect(await metodi(b)).toContain("thread/resume")
  })
})

describe("chiudere presso Codex, l'elenco, il contesto e la revisione", () => {
  const eventiElenco = (ascolto: Awaited<ReturnType<typeof ascolta>>, id: string) =>
    ascolto.messaggi.filter((m) => {
      const e = m as { tipo?: string; id?: string; evento?: string }
      return e.tipo === "chat" && e.id === id && e.evento === "elenco"
    })

  test("chiusa, la conversazione smette di essere seguita presso Codex; un messaggio dopo la riprende, e Codex non la darebbe per caricata senza", async () => {
    const b = await avvia()
    const { id } = await giro(b, "Ciao")
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    await aspetta(async () => (await metodi(b)).includes("thread/unsubscribe"))
    expect((await scrivi(b, id, "Ancora")).stato).toBe(202)
    await aspetta(async () => testi((await dettaglio(b, id)).messaggi.at(-1)!.parti).includes("Questa è la risposta di prova."), 15_000)
    await pronta(b, id)
    const richieste = await metodi(b)
    expect(richieste.filter((m) => m === "thread/unsubscribe")).toHaveLength(1)
    expect(richieste.indexOf("thread/unsubscribe")).toBeLessThan(richieste.indexOf("thread/resume"))
    expect(richieste.filter((m) => m === "turn/start")).toHaveLength(2)
  })

  test("una conversazione aperta dal terminale compare nell'elenco da sola, e si rilegge", async () => {
    const b = await avvia()
    expect((await chiama<{ id: string }[]>(b.a, "GET", "/api/chat")).corpo).toEqual([])
    const ascolto = await ascolta(b.a)

    const { threadId } = await b.cliente.chiedi<{ threadId: string }>("finto/terminale", { cwd: b.lavoro, testo: "Dal terminale" })
    await aspetta(() => eventiElenco(ascolto, threadId).length > 0, 15_000)
    const elenco = (await chiama<{ id: string; motore: string; titolo: string }[]>(b.a, "GET", "/api/chat")).corpo
    expect(elenco.map((v) => [v.id, v.motore, v.titolo])).toEqual([[threadId, "codex", "Dal terminale"]])
    expect((await dettaglio(b, threadId)).messaggi[0]?.parti).toEqual([{ tipo: "testo", testo: "Dal terminale" }])
    ascolto.chiudi()
  })

  test("se Codex crea la cartella dei thread dopo l'avvio del server, una conversazione aperta dal terminale compare lo stesso nell'elenco", async () => {
    const casa = await mkdtemp(join(tmpdir(), "mango-codex-casa-"))
    cartelle.push(casa)
    const b = await avvia({ FINTO_CODEX_HOME: casa })
    expect((await chiama<{ id: string }[]>(b.a, "GET", "/api/chat")).corpo).toEqual([])
    const ascolto = await ascolta(b.a)

    const { threadId } = await b.cliente.chiedi<{ threadId: string }>("finto/terminale", { cwd: b.lavoro, testo: "Dal terminale" })
    await aspetta(() => eventiElenco(ascolto, threadId).length > 0, 15_000)
    const elenco = (await chiama<{ id: string; motore: string; titolo: string }[]>(b.a, "GET", "/api/chat")).corpo
    expect(elenco.map((v) => [v.id, v.motore, v.titolo])).toEqual([[threadId, "codex", "Dal terminale"]])
    ascolto.chiudi()
  })

  test("le conversazioni accese dalla chat non fanno rileggere l'elenco con i loro file", async () => {
    const b = await avvia()
    await chiama(b.a, "GET", "/api/chat")
    const ascolto = await ascolta(b.a)
    const { id } = await giro(b, "Ciao")
    const registro = JSON.parse(await readFile(join(b.a.archivio, ".chat", "codex.json"), "utf8")) as Record<string, { sessione: string }>
    await Bun.sleep(700)
    expect(eventiElenco(ascolto, registro[id]!.sessione)).toEqual([])
    ascolto.chiudi()
  })

  test("senza la cartella di Codex l'elenco resta quello di prima, e il registro del server dice perché", async () => {
    const b = await avvia({ FINTO_CODEX_HOME: join(tmpdir(), `mango-codex-che-non-c-e-${crypto.randomUUID()}`) })
    const righe: string[] = []
    const originale = console.error
    console.error = (...x: unknown[]) => void righe.push(x.map(String).join(" "))
    try {
      expect((await chiama(b.a, "GET", "/api/chat")).stato).toBe(200)
    } finally {
      console.error = originale
    }
    expect(righe.some((r) => r.includes("non riesco a seguire le sue conversazioni"))).toBe(true)
  })

  test("il contesto di una conversazione chiusa e riletta è quello dell'ultima risposta, con la finestra", async () => {
    const b = await avvia()
    const { id } = await giro(b, "Ciao")
    const diretta = (await dettaglio(b, id)).contesto_usato
    expect(diretta).toMatchObject({ totale: 258_400 })
    expect(diretta!.usati).toBeGreaterThan(0)
    await aspetta(async () => JSON.stringify(JSON.parse(await readFile(join(b.a.archivio, ".chat", "codex.json"), "utf8"))).includes(`"usati":${diretta!.usati}`))
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    expect((await dettaglio(b, id)).contesto_usato).toEqual(diretta)
  })

  test("«/review» fa rivedere ciò che il creator dice; il testo della revisione c'è in diretta e riletto", async () => {
    const b = await avvia()
    const { id } = await giro(b, "Ciao")
    expect((await scrivi(b, id, "/review il piano del video")).stato).toBe(202)
    await aspetta(async () => testi((await dettaglio(b, id)).messaggi.at(-1)!.parti).includes("Il piano ha due scene uguali."), 15_000)
    await pronta(b, id)
    const avvio = (await b.ricevuti()).find((m) => m.method === "review/start")!.params!
    expect(avvio).toMatchObject({ target: { type: "custom", instructions: "il piano del video" } })

    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const riletta = (await dettaglio(b, id)).messaggi
    expect(riletta.at(-2)).toMatchObject({ ruolo: "utente", parti: [{ tipo: "testo", testo: "/review" }] })
    expect(testi(riletta.at(-1)!.parti)).toEqual(["Il piano ha due scene uguali."])
  })

  test("«/rename» rinomina il thread presso Codex e la conversazione resta pronta", async () => {
    const b = await avvia()
    const { id } = await giro(b, "Ciao")
    expect((await scrivi(b, id, "/rename Il video del mare")).stato).toBe(202)
    await aspetta(async () => (await dettaglio(b, id)).stato === "pronta" && testi((await dettaglio(b, id)).messaggi.at(-1)!.parti).includes("Conversazione rinominata: «Il video del mare»."), 15_000)
    expect((await b.ricevuti()).find((m) => m.method === "thread/name/set")!.params).toMatchObject({ name: "Il video del mare" })
    expect((await chiama<{ id: string; titolo: string }[]>(b.a, "GET", "/api/chat")).corpo.find((v) => v.id === id)?.titolo).toBe("Il video del mare")
  })
})

describe("ciò che non va, detto al creator", () => {
  test("il limite dell'account raggiunto", async () => {
    const b = await avvia()
    const { parti } = await giro(b, "LIMITE")
    expect(parti.at(-1)!.errore).toStartWith("Hai finito i messaggi che l'abbonamento permette per ora")
  })

  test("Codex non collegato all'account: non è pronto, e una conversazione lo dice", async () => {
    const b = await avvia({ FINTO_CODEX_ACCOUNT: "scollegato" })
    const motori = (await chiama<{ id: string; pronto: boolean }[]>(b.a, "GET", "/api/chat/motori")).corpo
    expect(motori.find((m) => m.id === "codex")?.pronto).toBe(false)
    const id = await crea(b, "Ciao")
    await aspetta(async () => (await dettaglio(b, id)).messaggi.at(-1)?.parti.at(-1)?.errore !== undefined, 15_000)
    expect((await dettaglio(b, id)).messaggi.at(-1)!.parti.at(-1)!.errore).toContain("Codex")
    expect(await metodi(b)).not.toContain("turn/start")
  })

  test("un Codex più vecchio di quello provato: non è pronto, e i suoi modelli non ci sono", async () => {
    const b = await avvia({ FINTO_CODEX_VERSIONE: "0.120.0" })
    const motori = (await chiama<{ id: string; pronto: boolean }[]>(b.a, "GET", "/api/chat/motori")).corpo
    expect(motori.find((m) => m.id === "codex")?.pronto).toBe(false)
    const modelli = (await chiama<{ motore: string }[]>(b.a, "GET", "/api/chat/modelli")).corpo
    expect(modelli.some((m) => m.motore === "codex")).toBe(false)
    expect(modelli.length).toBeGreaterThan(0)
  })
})
