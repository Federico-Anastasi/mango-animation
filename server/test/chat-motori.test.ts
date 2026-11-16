// La chat con più motori insieme: Claude Code finto, Mango Code finto e un terzo motore finto con il suo prefisso, i suoi livelli di
// effort e il suo registro, che non ha i comandi con la barra, i lavori in background né uno strumento suo per le domande.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PercorsiScelti } from "../src/arrivi/percorsiScelti"
import { Chat } from "../src/chat/chat"
import { ClaudeCode } from "../src/chat/claude/claude"
import { MangoCode } from "../src/chat/mangocode"
import { rotteDellaChat } from "../src/chat/rotte"
import { Eventi } from "../src/eventi"
import { opzioniMcp } from "../src/mcp/opzioni"
import { creaServerMcp } from "../src/mcp/strumenti"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"
import { FintoMangoCode, Finto, FinteSessioni, fermaIServerFinti, SENZA_SESSIONI, SESSIONE } from "./aiuti-chat"
import { MotoreFinto } from "./motore-finto"

const cartelle: string[] = []

afterEach(async () => {
  await fermaTutti()
  fermaIServerFinti()
  await Promise.all(cartelle.splice(0).map((c) => rm(c, { recursive: true, force: true })))
})

interface Banco {
  a: Ambiente
  claude: Finto
  sessioni: FinteSessioni
  mc: FintoMangoCode
  finto: MotoreFinto
  /** Dove i motori tengono i loro registri. */
  archivio: string
  dati: string
}

async function avvia(opzioni: { mango?: boolean; registroDiMango?: object } = {}): Promise<Banco> {
  const radice = await mkdtemp(join(tmpdir(), "mango-motori-"))
  cartelle.push(radice)
  const dati = join(radice, "dati")
  const archivio = join(radice, "archivio-motori")
  const mc = new FintoMangoCode()
  if (opzioni.mango !== false) await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, agent: mc.url, engine: mc.url, window: false }))
  if (opzioni.registroDiMango) {
    await mkdir(join(archivio, ".chat"), { recursive: true })
    await writeFile(join(archivio, ".chat", "mango-code.json"), JSON.stringify(opzioni.registroDiMango))
  }
  const claude = new Finto()
  const sessioni = new FinteSessioni()
  const finto = new MotoreFinto(archivio)
  const a = await avviaAmbiente({ chat: { motori: [new ClaudeCode(claude.query, sessioni), new MangoCode({ dati, archivio, adesso: () => new Date() }), finto] } })
  return { a, claude, sessioni, mc, finto, archivio, dati }
}

type Dettaglio = { motore: string; modello: string | null; effort: string | null; stato: string; attiva: boolean; in_attesa: { id: string; tipo: string; domande?: unknown[] }[] }
const dettaglio = (b: Banco, id: string) => chiama<Dettaglio>(b.a, "GET", `/api/chat/${id}`)

async function crea(b: Banco, corpo: object): Promise<string> {
  const r = await chiama<{ id: string }>(b.a, "POST", "/api/chat", { testo: "Ciao", ...corpo })
  expect(r.stato).toBe(201)
  return r.corpo.id
}

/** Una conversazione nuova sul motore finto, col primo messaggio già arrivato. */
async function creaSuFinto(b: Banco, corpo: object = {}): Promise<{ id: string; sessione: MotoreFinto["sessioni"][number] }> {
  const id = await crea(b, { modello: "finto/uno", ...corpo })
  const sessione = await aspetta(() => b.finto.sessioni.find((s) => s.apertura.id === id))
  await aspetta(() => sessione.scritti.length >= 1)
  await aspetta(() => b.finto.registro.eSua(id))
  return { id, sessione }
}

describe("i motori", () => {
  test("GET /api/chat/motori: nell'ordine dei motori, con nome, prefisso, stato, modello grande e capacità", async () => {
    const b = await avvia()
    const r = await chiama<unknown[]>(b.a, "GET", "/api/chat/motori")
    expect(r.stato).toBe(200)
    expect(r.corpo).toEqual([
      {
        id: "claude-code",
        nome: "Claude",
        nelle_frasi: null,
        prefisso: null,
        pronto: true,
        modello_grande: "opus",
        capacita: { effort: true, comandi: true, ferma_lavoro: true, in_background: true, immagini_negli_esiti: true, controllo_remoto: true, sottoagenti: true, browser: true },
      },
      {
        id: "mango-code",
        nome: "Mango Code",
        nelle_frasi: "Mango Code",
        prefisso: "mango-code/",
        pronto: true,
        modello_grande: null,
        capacita: { effort: false, comandi: true, ferma_lavoro: false, in_background: false, immagini_negli_esiti: false, controllo_remoto: false, sottoagenti: false, browser: false },
      },
      {
        id: "finto",
        nome: "Finto",
        nelle_frasi: "Finto",
        prefisso: "finto/",
        pronto: true,
        modello_grande: "finto/due",
        capacita: { effort: true, comandi: false, ferma_lavoro: false, in_background: false, immagini_negli_esiti: false, controllo_remoto: false, sottoagenti: false, browser: false },
      },
    ])
  })

  test("un motore spento non è pronto e non indica il suo modello grande; quando si accende o si spegne, un evento lo dice", async () => {
    const b = await avvia({ mango: false })
    const ascolto = await ascolta(b.a)
    const stato = async () => (await chiama<{ id: string; pronto: boolean; modello_grande: string | null }[]>(b.a, "GET", "/api/chat/motori")).corpo.map((m) => [m.id, m.pronto, m.modello_grande])
    expect(await stato()).toEqual([
      ["claude-code", true, "opus"],
      ["mango-code", false, null],
      ["finto", true, "finto/due"],
    ])
    b.finto.accendi(false)
    await aspetta(() => ascolto.messaggi.some((m) => (m as { tipo: string }).tipo === "modelli"))
    expect(await stato()).toEqual([
      ["claude-code", true, "opus"],
      ["mango-code", false, null],
      ["finto", false, null],
    ])
    ascolto.chiudi()
  })

  test("Claude Code che non risponde non è pronto", async () => {
    const b = await avvia()
    b.claude.rifiutaLaLettura = "non parte"
    const r = await chiama<{ id: string; pronto: boolean }[]>(b.a, "GET", "/api/chat/motori")
    expect(r.corpo.map((m) => [m.id, m.pronto])).toEqual([
      ["claude-code", false],
      ["mango-code", true],
      ["finto", true],
    ])
  })
})

describe("i modelli di tutti i motori", () => {
  type Modello = { id: string; motore: string; effort: { id: string; nome: { it: string; en: string } }[] }

  test("l'elenco unisce quelli di ciascun motore, nell'ordine dei motori, ognuno col suo motore e i suoi livelli", async () => {
    const b = await avvia()
    const r = await chiama<Modello[]>(b.a, "GET", "/api/chat/modelli")
    expect(r.stato).toBe(200)
    expect(r.corpo.map((m) => [m.id, m.motore])).toEqual([
      ["default", "claude-code"],
      ["opus", "claude-code"],
      ["sonnet", "claude-code"],
      ["claude-opus-4-6", "claude-code"],
      ["claude-haiku-4-5-20251001", "claude-code"],
      ["mango-code/toq", "mango-code"],
      ["finto/uno", "finto"],
      ["finto/due", "finto"],
    ])
    expect(r.corpo.find((m) => m.id === "finto/uno")?.effort).toEqual([
      { id: "corto", nome: { it: "Corto", en: "Short" } },
      { id: "lungo", nome: { it: "Lungo", en: "Long" } },
    ])
  })

  test("l'errore di un motore non toglie i modelli degli altri; se nessuno risponde si dà l'errore", async () => {
    const b = await avvia({ mango: false })
    b.finto.accendi(false)
    b.claude.rifiutaLaLettura = "non parte"
    const nessuno = await chiama<{ errore: string }>(b.a, "GET", "/api/chat/modelli")
    expect(nessuno.stato).toBe(502)
    expect(nessuno.corpo.errore).toContain("Claude Code ha dato un errore")

    b.finto.accendi(true)
    const soloFinto = await chiama<Modello[]>(b.a, "GET", "/api/chat/modelli")
    expect(soloFinto.corpo.map((m) => m.id)).toEqual(["finto/uno", "finto/due"])
  })

  test("l'effort si controlla contro i livelli del modello scelto", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const imposta = async (corpo: object) => {
      const r = await chiama<{ effort?: string | null; errore?: string }>(b.a, "POST", `/api/chat/${id}/impostazioni`, corpo)
      return [r.stato, r.corpo.errore ?? r.corpo.effort] as const
    }
    expect(await imposta({ effort: "lungo" })).toEqual([200, "lungo"])
    expect(await imposta({ effort: "low" })).toEqual([400, "Finto · Uno non ha l'effort «low». I suoi livelli sono: corto, lungo."])
    expect(await imposta({ effort: "enorme" })).toEqual([400, "L'effort «enorme» non esiste. I livelli sono: low, medium, high, xhigh, max, corto, lungo."])
    expect(await imposta({ effort: null })).toEqual([200, null])
    expect(await imposta({ effort: "corto", modello: "finto/due" })).toEqual([400, "Finto · Due non ha livelli di effort."])
    const nuova = await chiama<{ errore: string }>(b.a, "POST", "/api/chat", { testo: "Ciao", modello: "finto/uno", effort: "max" })
    expect(nuova.stato).toBe(400)
    expect(nuova.corpo.errore).toContain("Finto · Uno non ha l'effort «max»")
  })
})

describe("una conversazione per motore, aperte insieme", () => {
  test("ognuna resta del suo motore: nell'elenco, nel dettaglio, nei messaggi e nel cambio di modello", async () => {
    const b = await avvia()
    const claude = await crea(b, { modello: "opus" })
    const qClaude = await aspetta(() => b.claude.queries.find((q) => !q.chiusa && q.opzioni.sessionId === claude))
    const mango = await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    const { id: finto, sessione: sFinto } = await creaSuFinto(b)

    const elenco = await chiama<{ id: string; motore: string; attiva: boolean }[]>(b.a, "GET", "/api/chat")
    expect(Object.fromEntries(elenco.corpo.map((v) => [v.id, v.motore]))).toEqual({ [claude]: "claude-code", [mango]: "mango-code", [finto]: "finto" })
    expect((await dettaglio(b, claude)).corpo.motore).toBe("claude-code")
    expect((await dettaglio(b, mango)).corpo.motore).toBe("mango-code")
    expect((await dettaglio(b, finto)).corpo).toMatchObject({ motore: "finto", modello: "finto/uno", attiva: true })

    // Un secondo messaggio va solo al motore della sua conversazione.
    for (const id of [claude, mango, finto]) expect((await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Ancora" })).stato).toBe(202)
    await aspetta(() => sFinto.scritti.length === 2 && qClaude.ricevuti.length === 2 && b.mc.di(`/session/${SESSIONE}/prompt_async`).length === 2)
    expect(b.finto.sessioni).toHaveLength(1)
    expect(b.claude.queries.filter((q) => !q.chiusa)).toEqual([qClaude])

    // Il modello si cambia dentro il motore, non fra un motore e l'altro, e la frase nomina i due motori.
    const cambia = async (id: string, modello: string) => {
      const r = await chiama<{ errore?: string; modello?: string }>(b.a, "POST", `/api/chat/${id}/impostazioni`, { modello })
      return [r.stato, r.corpo.errore ?? r.corpo.modello] as const
    }
    expect(await cambia(finto, "mango-code/toq")).toEqual([400, "Questa conversazione è di Finto: per un modello di Mango Code aprine una nuova."])
    expect(await cambia(finto, "opus")).toEqual([400, "Questa conversazione è di Finto: per un modello di Claude aprine una nuova."])
    expect(await cambia(claude, "finto/due")).toEqual([400, "Questa conversazione è di Claude Code: per un modello di Finto Cloud aprine una nuova."])
    expect(await cambia(mango, "finto/due")).toEqual([400, "Questa conversazione è di Mango Code: per un modello di Finto Cloud aprine una nuova."])
    expect((await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${finto}/impostazioni`, { modello: "opus" }, "en")).corpo.errore).toBe("This conversation is with Finto: to use a Claude model, start a new one.")
    expect(await cambia(finto, "finto/due")).toEqual([200, "finto/due"])
    expect(sFinto.modelliCambiati).toEqual(["finto/due"])
  })

  test("chiuse, si rileggono dal motore a cui appartengono e si riaprono su di lui", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)).stato).toBe(200)
    expect((await dettaglio(b, id)).corpo).toMatchObject({ motore: "finto", modello: "finto/uno", attiva: false, stato: "pronta" })

    await chiama(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "Riprendiamo" })
    const riaperta = await aspetta(() => b.finto.sessioni.find((s) => s.apertura.id === id && s.apertura.esiste))
    expect(riaperta.apertura.modello).toBe("finto/uno")
    expect(b.claude.queries.filter((q) => q.opzioni.resume === id)).toEqual([])
  })

  test("il registro di ogni motore è un file suo; quello di Mango Code resta dov'era e si legge", async () => {
    const b = await avvia({
      registroDiMango: { "00000000-0000-4000-8000-0000000000aa": { sessione: "ses_vecchia", modello: "toq", titolo: "Una vecchia di Mango Code", aggiornata: Date.parse("2026-10-01T10:00:00Z") } },
    })
    const { id: finto } = await creaSuFinto(b)
    const mango = await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    const registro = async (nome: string) => JSON.parse(await readFile(join(b.archivio, ".chat", `${nome}.json`), "utf-8")) as Record<string, { modello: string }>

    await aspetta(async () => Object.keys(await registro("mango-code")).length === 2)
    expect(Object.keys(await registro("finto"))).toEqual([finto])
    expect(Object.keys(await registro("mango-code")).sort()).toEqual([mango, "00000000-0000-4000-8000-0000000000aa"].sort())
    expect((await registro("finto"))[finto]?.modello).toBe("uno")

    const elenco = await chiama<{ id: string; motore: string; titolo: string }[]>(b.a, "GET", "/api/chat")
    expect(elenco.corpo.find((v) => v.id === "00000000-0000-4000-8000-0000000000aa")).toMatchObject({ motore: "mango-code", titolo: "Una vecchia di Mango Code" })
    expect(elenco.corpo.find((v) => v.id === finto)?.motore).toBe("finto")
  })
})

describe("ciò che un motore non ha", () => {
  test("un messaggio con la barra a un motore senza comandi: 409 con la frase che lo nomina, nelle due lingue", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const it = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/compact" })
    expect([it.stato, it.corpo.errore]).toEqual([409, "Finto non ha comandi con la barra."])
    const en = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/messaggi`, { testo: "/compact" }, "en")
    expect(en.corpo.errore).toBe("Finto has no slash commands.")
    const nuova = await chiama<{ errore: string }>(b.a, "POST", "/api/chat", { testo: "/compact", modello: "finto/uno" })
    expect([nuova.stato, nuova.corpo.errore]).toEqual([409, "Finto non ha comandi con la barra."])
  })

  test("l'elenco dei comandi si chiede per motore: quello di Claude senza indicazioni, uno vuoto per Mango Code, 409 dove non ci sono, 404 per un motore che non c'è", async () => {
    const b = await avvia()
    expect((await chiama<{ nome: string }[]>(b.a, "GET", "/api/chat/comandi")).corpo.map((c) => c.nome)).toEqual(["context", "usage", "model", "monta"])
    expect((await chiama<{ nome: string }[]>(b.a, "GET", "/api/chat/comandi?motore=claude-code")).corpo).toHaveLength(4)
    expect((await chiama<unknown[]>(b.a, "GET", "/api/chat/comandi?motore=mango-code")).corpo).toEqual([])
    const finto = await chiama<{ errore: string }>(b.a, "GET", "/api/chat/comandi?motore=finto")
    expect([finto.stato, finto.corpo.errore]).toEqual([409, "Finto non ha comandi con la barra."])
    expect((await chiama(b.a, "GET", "/api/chat/comandi?motore=altro")).stato).toBe(404)
  })

  test("mandare in background e fermare un lavoro: 409 con il nome del motore, per Mango Code e per il finto", async () => {
    const b = await avvia()
    const { id: finto } = await creaSuFinto(b)
    const mango = await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    const prova = async (id: string, percorso: string) => {
      const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${id}/${percorso}`)
      return [r.stato, r.corpo.errore] as const
    }
    expect(await prova(finto, "background")).toEqual([409, "Finto non ha lavori da mandare in background."])
    expect(await prova(finto, "task/t1/ferma")).toEqual([409, "Finto non ha lavori da fermare uno per uno: usa «Ferma»."])
    expect(await prova(mango, "background")).toEqual([409, "Mango Code non ha lavori da mandare in background."])
    expect(await prova(mango, "task/t1/ferma")).toEqual([409, "Mango Code non ha lavori da fermare uno per uno: usa «Ferma»."])
  })

  test("l'effort a un motore che non ce l'ha: 409, anche se il livello esiste per un altro", async () => {
    const b = await avvia()
    const mango = await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di(`/session/${SESSIONE}/prompt_async`).length >= 1)
    const r = await chiama<{ errore: string }>(b.a, "POST", `/api/chat/${mango}/impostazioni`, { effort: "high" })
    expect([r.stato, r.corpo.errore]).toEqual([409, "Mango Code non ha livelli di effort."])
    const nuova = await chiama<{ errore: string }>(b.a, "POST", "/api/chat", { testo: "Ciao", modello: "mango-code/toq", effort: "low" }, "en")
    expect([nuova.stato, nuova.corpo.errore]).toEqual([409, "Mango Code has no effort levels."])
  })
})

describe("lo strumento delle domande", () => {
  test("il server «video» riceve la sua conversazione, e fa le domande solo per il motore che non ha uno strumento suo", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    expect(sessione.mcp["video"]?.env).toMatchObject({ MANGO_ANIMATION_CONVERSAZIONE: id, MANGO_ANIMATION_DOMANDE: "1" })

    const claude = await crea(b, { modello: "opus" })
    const q = await aspetta(() => b.claude.queries.find((x) => !x.chiusa && x.opzioni.sessionId === claude))
    expect((q.opzioni.mcpServers as Record<string, { env: Record<string, string> }>)["video"]?.env).toMatchObject({ MANGO_ANIMATION_CONVERSAZIONE: claude })
    expect(JSON.stringify(q.opzioni.mcpServers)).not.toContain("MANGO_ANIMATION_DOMANDE")

    await crea(b, { modello: "mango-code/toq" })
    await aspetta(() => b.mc.di("/mcp").some((r) => r.metodo === "POST"))
    expect(JSON.stringify(b.mc.di("/mcp").filter((r) => r.metodo === "POST").map((r) => r.corpo))).not.toContain("MANGO_ANIMATION_CONVERSAZIONE")
  })
})

describe("POST /api/chat/:id/domande", () => {
  const DOMANDA = { domanda: "Rosso o blu?", intestazione: "Colore", opzioni: [{ etichetta: "Rosso", descrizione: "caldo" }, { etichetta: "Blu", descrizione: "freddo" }], multipla: false }

  /** La richiesta resta aperta: ritorna la risposta che arriverà e il modo di chiudere la connessione. */
  function chiedi(b: Banco, id: string, corpo: unknown = { domande: [DOMANDA] }, lingua: "it" | "en" = "it") {
    const chiusura = new AbortController()
    const risposta = fetch(`${b.a.url}/api/chat/${id}/domande`, {
      method: "POST",
      headers: { ...b.a.accesso, "Content-Type": "application/json", "X-Lingua": lingua },
      body: JSON.stringify(corpo),
      signal: chiusura.signal,
    }).then(async (r) => ({ stato: r.status, corpo: (await r.json()) as Record<string, unknown> }))
    return { risposta, chiudi: () => chiusura.abort() }
  }

  const richiesta = async (b: Banco, id: string) => (await aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa[0]))

  test("apre la domanda nella conversazione e risponde quando il creator ha scelto", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const ascolto = await ascolta(b.a)
    const { risposta } = chiedi(b, id)
    const aperta = await richiesta(b, id)
    expect(aperta).toMatchObject({ tipo: "domanda", domande: [DOMANDA] })
    await aspetta(async () => (await dettaglio(b, id)).corpo.stato === "aspetta")
    await aspetta(() => (ascolto.messaggi as { evento?: string }[]).some((m) => m.evento === "richiesta"))

    expect((await chiama(b.a, "POST", `/api/chat/${id}/risposte/${aperta.id}`, { scelta: { risposte: { "Rosso o blu?": "Blu" } } })).stato).toBe(200)
    expect(await risposta).toEqual({ stato: 200, corpo: { risposte: { "Rosso o blu?": "Blu" } } })
    expect((await dettaglio(b, id)).corpo.in_attesa).toEqual([])
    ascolto.chiudi()
  })

  test("«Ferma» la rifiuta con la frase per il modello, nella lingua di chi chiede", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    const { risposta } = chiedi(b, id, { domande: [DOMANDA] }, "en")
    await richiesta(b, id)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    expect(await risposta).toEqual({ stato: 200, corpo: { rifiutata: "The job was stopped." } })
    expect(sessione.fermate).toBe(1)
  })

  test("se la conversazione si chiude mentre aspetta, la richiesta è rifiutata", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const { risposta } = chiedi(b, id)
    await richiesta(b, id)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)).stato).toBe(200)
    const r = await risposta
    expect(r.stato).toBe(200)
    expect(typeof r.corpo["rifiutata"]).toBe("string")
    expect(r.corpo["risposte"]).toBeUndefined()
  })

  test("se chi chiama chiude la connessione, la richiesta si ritira dalla conversazione", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const ascolto = await ascolta(b.a)
    const { risposta, chiudi } = chiedi(b, id)
    const aperta = await richiesta(b, id)
    chiudi()
    await expect(risposta).rejects.toThrow()
    await aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa.length === 0)
    await aspetta(() => (ascolto.messaggi as { evento?: string; richiesta?: string }[]).some((m) => m.evento === "risposta" && m.richiesta === aperta.id))
    expect((await dettaglio(b, id)).corpo.stato).toBe("lavora")
    ascolto.chiudi()
  })

  test("una conversazione che non è aperta, o che non c'è, dà 404", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    await chiama(b.a, "POST", `/api/chat/${id}/chiudi`)
    const chiusa = await chiedi(b, id).risposta
    expect(chiusa.stato).toBe(404)
    expect(chiusa.corpo["errore"]).toBe("Questa conversazione non è aperta: le domande si fanno mentre il motore ci lavora.")
    expect((await chiedi(b, "ffffffff-ffff-4fff-8fff-ffffffffffff").risposta).stato).toBe(404)
    expect((await chiedi(b, "non-e-un-id").risposta).stato).toBe(404)
  })

  test("domande scritte male: 400, e non si apre niente", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const prova = async (corpo: unknown) => (await chiedi(b, id, corpo).risposta).stato
    expect(await prova({ domande: [] })).toBe(400)
    expect(await prova({ domande: Array(5).fill(DOMANDA).map((d, i) => ({ ...d, domanda: `D${i}` })) })).toBe(400)
    expect(await prova({ domande: "Rosso o blu?" })).toBe(400)
    expect(await prova({ domande: [{ ...DOMANDA, domanda: "" }] })).toBe(400)
    expect(await prova({ domande: [{ ...DOMANDA, opzioni: "Rosso" }] })).toBe(400)
    expect(await prova({ domande: [{ ...DOMANDA, opzioni: [{ descrizione: "senza etichetta" }] }] })).toBe(400)
    expect(await prova({ domande: [{ ...DOMANDA, multipla: "si" }] })).toBe(400)
    expect(await prova({ domande: [DOMANDA, DOMANDA] })).toBe(400)
    expect(await prova({ domande: [DOMANDA], altro: 1 })).toBe(400)
    const frase = (await chiedi(b, id, { domande: [] }, "en").risposta).corpo["errore"]
    expect(frase).toBe("The «domande» are 1 to 4, in a list.")
    expect((await dettaglio(b, id)).corpo.in_attesa).toEqual([])
  })

  test("due domande insieme, con più risposte, e nessuna scadenza: la rotta toglie quella del server", async () => {
    const b = await avvia()
    const { id } = await creaSuFinto(b)
    const due = { domande: [DOMANDA, { domanda: "Quanto?", intestazione: "Misura", opzioni: [], multipla: false }] }
    const { risposta } = chiedi(b, id, due)
    const aperta = await richiesta(b, id)
    await chiama(b.a, "POST", `/api/chat/${id}/risposte/${aperta.id}`, { scelta: { risposte: { "Rosso o blu?": "Rosso", "Quanto?": "Tanto" } } })
    expect((await risposta).corpo).toEqual({ risposte: { "Rosso o blu?": "Rosso", "Quanto?": "Tanto" } })

    const chat = new Chat({
      codice: b.a.codice,
      lavoro: b.a.radice,
      archivio: b.a.archivio,
      eventi: new Eventi(1000),
      opzioni: { motori: [new ClaudeCode(new Finto().query, SENZA_SESSIONI), b.finto] },
      titoloDelVideo: () => undefined,
      adesso: () => new Date(),
      lingua: () => "it",
    })
    const rotta = rotteDellaChat(chat, new PercorsiScelti("chiave")).find(([metodo, modello]) => metodo === "POST" && modello.test("/api/chat/x/domande"))
    let tolte = 0
    const req = new Request("http://127.0.0.1/api/chat/x/domande", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(due) })
    const non = await rotta![2]({ req, param: ["x"], senzaScadenza: () => void tolte++ })
    expect([non.status, tolte]).toEqual([404, 1])
    await chat.chiudi()
  })
})

describe("un giro intero sul motore finto", () => {
  test("gli eventi del motore arrivano alla chat come per ogni altro motore", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    sessione.evento({ tipo: "avvio", modello: "finto/uno", effort: "corto" })
    sessione.evento({ tipo: "testo", voce: "1", pezzo: "Ecco" })
    sessione.evento({ tipo: "fine", errore: null, durata_ms: 10, inCoda: 0 })
    await aspetta(async () => (await dettaglio(b, id)).corpo.stato === "pronta")
    const d = (await chiama<{ effort: string | null; messaggi: { ruolo: string; parti: Record<string, unknown>[] }[] }>(b.a, "GET", `/api/chat/${id}`)).corpo
    expect(d.effort).toBe("corto")
    expect(d.messaggi.at(-1)?.parti.map((p) => p["tipo"])).toEqual(["testo", "fine"])
  })
})

describe("lo strumento `domanda` e la sua rotta, insieme", () => {
  const DOMANDA = { domanda: "Rosso o blu?", intestazione: "Colore", opzioni: [{ etichetta: "Rosso", descrizione: "caldo" }, { etichetta: "Blu", descrizione: "freddo" }], multipla: false }

  /** Lo strumento «video» acceso con l'ambiente che il motore finto ha ricevuto per la sua conversazione, contro il server della prova. */
  async function strumentoDi(b: Banco, sessione: MotoreFinto["sessioni"][number]) {
    const opzioni = opzioniMcp({ ...sessione.mcp["video"]?.env })
    const [lato1, lato2] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: "prova", version: "1" })
    await Promise.all([creaServerMcp({ ...opzioni, api: { indirizzo: b.a.url, intestazioni: async () => b.a.accesso } }).connect(lato1), client.connect(lato2)])
    const chiedi = (segnale?: AbortSignal) =>
      client.callTool({ name: "domanda", arguments: { domande: [DOMANDA] } }, undefined, { signal: segnale }).then((r) => ({ errore: r.isError === true, testo: (r.content as { text?: string }[])[0]?.text ?? "" }))
    return { chiedi, chiudi: () => client.close() }
  }

  const inAttesa = async (b: Banco, id: string) => aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa[0])

  test("il modello chiede, il creator sceglie un bottone, il modello legge la risposta", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    const strumento = await strumentoDi(b, sessione)
    const esito = strumento.chiedi()
    const aperta = await inAttesa(b, id)
    expect(aperta).toMatchObject({ tipo: "domanda", domande: [DOMANDA] })
    expect((await chiama(b.a, "POST", `/api/chat/${id}/risposte/${aperta.id}`, { scelta: { risposte: { "Rosso o blu?": "Blu" } } })).stato).toBe(200)
    expect(await esito).toEqual({ errore: false, testo: "«Rosso o blu?» → Blu" })
    await strumento.chiudi()
  })

  test("«Ferma» mentre il modello aspetta: lo strumento dà al modello la frase del rifiuto", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    const strumento = await strumentoDi(b, sessione)
    const esito = strumento.chiedi()
    await inAttesa(b, id)
    expect((await chiama(b.a, "POST", `/api/chat/${id}/ferma`)).stato).toBe(200)
    expect(await esito).toEqual({ errore: true, testo: "Il lavoro è stato fermato." })
    await strumento.chiudi()
  })

  test("il modello ritira la chiamata: la domanda sparisce dalla chat", async () => {
    const b = await avvia()
    const { id, sessione } = await creaSuFinto(b)
    const strumento = await strumentoDi(b, sessione)
    const ritiro = new AbortController()
    const esito = strumento.chiedi(ritiro.signal).then(
      () => "risposta",
      () => "ritirata",
    )
    await inAttesa(b, id)
    ritiro.abort()
    expect(await esito).toBe("ritirata")
    await aspetta(async () => (await dettaglio(b, id)).corpo.in_attesa.length === 0)
    await strumento.chiudi()
  })
})
