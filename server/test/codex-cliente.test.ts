// Il cliente di `codex app-server` contro il finto: lo stesso programma che serve alle prove del motore e della chat.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { avviaCodex } from "../src/chat/codex/cliente"
import { CodexTroppoVecchio, ErroreDiCodex, type ClienteCodex } from "../src/chat/codex/protocollo"
import type { Oggetto } from "../src/chat/traduzione"
import { aspetta } from "./aiuti"

const FINTO = join(import.meta.dir, "finto-codex.ts")
const clienti: ClienteCodex[] = []
let cartella = ""
let registro = ""

beforeEach(async () => {
  cartella = await mkdtemp(join(tmpdir(), "codex-cliente-"))
  registro = join(cartella, "registro.jsonl")
})
afterEach(async () => {
  await Promise.all(clienti.splice(0).map((c) => c.chiudi()))
  await rm(cartella, { recursive: true, force: true })
})

function avvia(ambiente: Record<string, string | undefined> = {}, versioneMinima = "0.100.0"): ClienteCodex {
  const cliente = avviaCodex({ programma: process.execPath, argomenti: ["run", FINTO], ambiente: { FINTO_CODEX_REGISTRO: registro, ...ambiente }, versioneMinima })
  clienti.push(cliente)
  return cliente
}

/** Tutto ciò che il finto ha ricevuto finora. */
async function ricevuti(): Promise<Oggetto[]> {
  const testo = await readFile(registro, "utf8").catch(() => "")
  return testo.split("\n").filter(Boolean).map((r) => JSON.parse(r) as Oggetto)
}
const metodiRicevuti = async (): Promise<unknown[]> => (await ricevuti()).map((m) => m["method"])

interface Giro {
  threadId: string
  turnId: string
}

/** Un thread e un giro avviato col testo dato; le notifiche arrivano a `quando`. */
async function avviaGiro(cliente: ClienteCodex, testo: string): Promise<Giro> {
  const { thread } = await cliente.chiedi<{ thread: { id: string } }>("thread/start", { cwd: cartella })
  const { turn } = await cliente.chiedi<{ turn: { id: string } }>("turn/start", { threadId: thread.id, input: [{ type: "text", text: testo, text_elements: [] }] })
  return { threadId: thread.id, turnId: turn.id }
}

/** Raccoglie le notifiche; `finito` si risolve alla fine del giro. */
function raccogli(cliente: ClienteCodex): { viste: Array<{ metodo: string; parametri: Oggetto }>; finito: Promise<void>; smetti: () => void } {
  const viste: Array<{ metodo: string; parametri: Oggetto }> = []
  const fine = Promise.withResolvers<void>()
  const smetti = cliente.ascolta((metodo, parametri) => {
    viste.push({ metodo, parametri })
    if (metodo === "turn/completed") fine.resolve()
  })
  return { viste, finito: fine.promise, smetti }
}

const testoFinale = (viste: Array<{ metodo: string; parametri: Oggetto }>): string => {
  const voce = viste.map((v) => v.parametri["item"] as Oggetto | undefined).findLast((i) => i?.["type"] === "agentMessage" && i["phase"] === "final_answer")
  return String(voce?.["text"])
}

describe("accensione", () => {
  test("il programma si accende alla prima richiesta e una sola initialize basta per più richieste insieme", async () => {
    const cliente = avvia()
    await Bun.sleep(150)
    expect(await ricevuti()).toEqual([])
    await Promise.all([cliente.chiedi("account/read", {}), cliente.chiedi("model/list", {}), cliente.chiedi("account/rateLimits/read")])
    expect(await metodiRicevuti()).toEqual(["initialize", "initialized", "account/read", "model/list", "account/rateLimits/read"])
    const iniziale = (await ricevuti())[0]!["params"] as Oggetto
    expect(iniziale["clientInfo"]).toMatchObject({ name: "mango-animation" })
    expect(iniziale["capabilities"]).toEqual({ experimentalApi: true })
  })

  test("un programma che non si accende fa fallire la richiesta", async () => {
    const cliente = avviaCodex({ programma: join(cartella, "non-esiste"), ambiente: {}, versioneMinima: "0.1.0" })
    clienti.push(cliente)
    await expect(cliente.chiedi("account/read", {})).rejects.toBeInstanceOf(ErroreDiCodex)
  })

  test("una variabile d'ambiente con valore indefinito è tolta a Codex", async () => {
    process.env["FINTO_CODEX_ACCOUNT"] = "scollegato"
    try {
      const { account } = await avvia({ FINTO_CODEX_ACCOUNT: undefined }).chiedi<{ account: Oggetto | null }>("account/read", {})
      expect(account).not.toBeNull()
    } finally {
      delete process.env["FINTO_CODEX_ACCOUNT"]
    }
  })
})

describe("richieste e notifiche", () => {
  test("la risposta torna col suo result; l'account scollegato lo dice l'ambiente", async () => {
    const collegato = await avvia().chiedi<{ account: Oggetto | null }>("account/read", {})
    expect(collegato.account).toMatchObject({ type: "chatgpt" })
    const scollegato = await avvia({ FINTO_CODEX_ACCOUNT: "scollegato" }).chiedi<{ account: Oggetto | null }>("account/read", {})
    expect(scollegato.account).toBeNull()
  })

  test("una richiesta senza parametri a un metodo che li vuole è un errore di Codex, non una risposta vuota", async () => {
    const errore = await avvia().chiedi("account/read").catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreDiCodex)
    expect((errore as ErroreDiCodex).codice).toBe(-32600)
    expect((errore as ErroreDiCodex).message).toContain("params")
  })

  test("un errore JSON-RPC diventa ErroreDiCodex col suo codice", async () => {
    const cliente = avvia()
    const ignoto = await cliente.chiedi("metodo/che/non/esiste", {}).catch((e: unknown) => e)
    expect(ignoto).toBeInstanceOf(ErroreDiCodex)
    expect((ignoto as ErroreDiCodex).codice).toBe(-32601)
    expect((ignoto as ErroreDiCodex).message).toContain("metodo/che/non/esiste")
    const thread = await cliente.chiedi("thread/read", { threadId: "non-c-e" }).catch((e: unknown) => e)
    expect((thread as ErroreDiCodex).codice).toBe(-32600)
  })

  test("le notifiche arrivano a chi ascolta finché non smette", async () => {
    const cliente = avvia()
    const primo = raccogli(cliente)
    await avviaGiro(cliente, "ciao")
    await primo.finito
    const metodi = primo.viste.map((v) => v.metodo)
    expect(metodi).toContain("turn/started")
    expect(metodi).toContain("item/agentMessage/delta")
    expect(metodi.at(-1)).toBe("turn/completed")
    primo.smetti()
    const dopo = primo.viste.length
    const secondo = raccogli(cliente)
    await avviaGiro(cliente, "ciao di nuovo")
    await secondo.finito
    expect(primo.viste.length).toBe(dopo)
    expect(secondo.viste.length).toBeGreaterThan(0)
  })

  test("una notifica che fa fallire chi ascolta non rompe le altre", async () => {
    const cliente = avvia()
    const errori = spyOn(console, "error").mockImplementation(() => undefined)
    cliente.ascolta(() => {
      throw new Error("chi ascolta ha sbagliato")
    })
    const altro = raccogli(cliente)
    await avviaGiro(cliente, "ciao")
    await altro.finito
    expect(errori).toHaveBeenCalled()
    errori.mockRestore()
  })
})

describe("le richieste di Codex a noi", () => {
  test("il gestore risponde e ciò che torna è il result", async () => {
    const cliente = avvia()
    const chiamate: Array<{ metodo: string; parametri: Oggetto }> = []
    cliente.rispondi(async (metodo, parametri) => {
      chiamate.push({ metodo, parametri })
      return { answers: { colore: { answers: ["Azzurro"] } } }
    })
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "DOMANDA")
    await ascolto.finito
    expect(chiamate.map((c) => c.metodo)).toEqual(["item/tool/requestUserInput"])
    expect(testoFinale(ascolto.viste)).toBe("Hai risposto: Azzurro.")
    const risposta = (await ricevuti()).find((m) => m["method"] === undefined && (m["result"] as Oggetto | undefined)?.["answers"] !== undefined)
    expect(risposta).toBeDefined()
  })

  test("un gestore che fallisce, o l'assenza di un gestore, danno a Codex un errore JSON-RPC", async () => {
    const cliente = avvia()
    cliente.rispondi(() => Promise.reject(new Error("niente da dire")))
    const rotto = raccogli(cliente)
    await avviaGiro(cliente, "DOMANDA")
    await rotto.finito
    expect(testoFinale(rotto.viste)).toBe("La domanda non ha avuto risposta: niente da dire.")

    const senza = avvia()
    const vuoto = raccogli(senza)
    await avviaGiro(senza, "DOMANDA")
    await vuoto.finito
    expect(testoFinale(vuoto.viste)).toStartWith("La domanda non ha avuto risposta:")
  })

  test("un gestore che lancia in modo sincrono è un gestore che fallisce", async () => {
    const cliente = avvia()
    cliente.rispondi(() => {
      throw new Error("subito")
    })
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "DOMANDA")
    await ascolto.finito
    expect(testoFinale(ascolto.viste)).toBe("La domanda non ha avuto risposta: subito.")
  })

  test("se Codex ritira la richiesta scatta la ritirata e la risposta tardiva non parte", async () => {
    const cliente = avvia()
    const tardiva = Promise.withResolvers<unknown>()
    const visto = Promise.withResolvers<AbortSignal>()
    cliente.rispondi((_metodo, _parametri, ritirata) => {
      visto.resolve(ritirata)
      return tardiva.promise
    })
    const ascolto = raccogli(cliente)
    const { threadId, turnId } = await avviaGiro(cliente, "PERMESSO")
    const ritirata = await visto.promise
    expect(ritirata.aborted).toBe(false)
    await cliente.chiedi("turn/interrupt", { threadId, turnId })
    await ascolto.finito
    expect(ritirata.aborted).toBe(true)
    const idRichiesta = ascolto.viste.find((v) => v.metodo === "serverRequest/resolved")?.parametri["requestId"]
    expect(idRichiesta).toBeDefined()
    tardiva.resolve({ decision: "accept" })
    await Bun.sleep(100)
    expect((await ricevuti()).filter((m) => m["id"] === idRichiesta && m["method"] === undefined)).toEqual([])
  })

  test("una ritirata arrivata dopo la risposta non cambia niente", async () => {
    const cliente = avvia()
    const segnali: AbortSignal[] = []
    cliente.rispondi(async (_metodo, _parametri, ritirata) => {
      segnali.push(ritirata)
      return { decision: "accept" }
    })
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "PERMESSO")
    await ascolto.finito
    expect(ascolto.viste.some((v) => v.metodo === "serverRequest/resolved")).toBe(true)
    expect(segnali[0]?.aborted).toBe(false)
  })
})

describe("versione", () => {
  test("una versione più vecchia della minima fa fallire ogni richiesta", async () => {
    const cliente = avvia({ FINTO_CODEX_VERSIONE: "0.50.2" }, "0.100.0")
    for (let i = 0; i < 2; i++) {
      const errore = await cliente.chiedi("account/read", {}).catch((e: unknown) => e)
      expect(errore).toBeInstanceOf(CodexTroppoVecchio)
      expect((errore as CodexTroppoVecchio).versione).toBe("0.50.2")
      expect((errore as CodexTroppoVecchio).minima).toBe("0.100.0")
    }
    expect((await metodiRicevuti()).every((m) => m === "initialize")).toBe(true)
  })

  test("la minima stessa passa, con o senza il suffisso di prova", async () => {
    await avvia({ FINTO_CODEX_VERSIONE: "0.167.0" }, "0.167.0").chiedi("account/read", {})
    await avvia({ FINTO_CODEX_VERSIONE: "0.167.0-alpha.4.1" }, "0.167.0").chiedi("account/read", {})
    await avvia({ FINTO_CODEX_VERSIONE: "1.0.0" }, "0.167.9").chiedi("account/read", {})
  })

  test("una versione che non si legge non blocca", async () => {
    await avvia({ FINTO_CODEX_VERSIONE: "boh" }, "0.167.0").chiedi("account/read", {})
  })
})

describe("caduta e chiusura", () => {
  test("se cade a metà giro chi ascolta è avvisato e la richiesta dopo lo riaccende", async () => {
    const cliente = avvia()
    const cadute: Error[] = []
    cliente.allaCaduta((errore) => cadute.push(errore))
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "CADUTA")
    await aspetta(() => cadute.length > 0)
    expect(cadute).toHaveLength(1)
    expect(cadute[0]).toBeInstanceOf(ErroreDiCodex)
    expect(ascolto.viste.map((v) => v.metodo)).toContain("item/agentMessage/delta")
    expect(ascolto.viste.map((v) => v.metodo)).not.toContain("turn/completed")

    await cliente.chiedi("account/read", {})
    expect((await metodiRicevuti()).filter((m) => m === "initialize")).toHaveLength(2)
    expect(cadute).toHaveLength(1)
  })

  test("le richieste in attesa falliscono con ErroreDiCodex, senza codice e con le ultime righe degli errori", async () => {
    const cliente = avvia()
    let cadute = 0
    cliente.allaCaduta(() => cadute++)
    const { threadId, turnId } = await avviaGiro(cliente, "LUNGO")
    const attesa = cliente.chiedi("turn/steer", { threadId, expectedTurnId: turnId, input: [{ type: "text", text: "CADUTA", text_elements: [] }] })
    const errore = await attesa.catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(ErroreDiCodex)
    expect((errore as ErroreDiCodex).codice).toBeNull()
    expect((errore as ErroreDiCodex).message).toContain("finto-codex: caduto come richiesto")
    expect(cadute).toBe(1)
  })

  test("chiudi spegne il programma senza avvisare chi ascolta la caduta, e la richiesta dopo lo riaccende", async () => {
    const cliente = avvia()
    let cadute = 0
    cliente.allaCaduta(() => cadute++)
    const { pid } = await cliente.chiedi<{ pid: number }>("finto/pid")
    await cliente.chiudi()
    await aspetta(() => {
      try {
        process.kill(pid, 0)
        return false
      } catch {
        return true
      }
    })
    expect(cadute).toBe(0)
    await cliente.chiedi("account/read", {})
    expect((await metodiRicevuti()).filter((m) => m === "initialize")).toHaveLength(2)
    await cliente.chiudi()
    expect(cadute).toBe(0)
  })

  test("chiudi su un programma mai acceso non fa niente, e chiudere due volte nemmeno", async () => {
    const cliente = avvia()
    await cliente.chiudi()
    await cliente.chiedi("account/read", {})
    await cliente.chiudi()
    await cliente.chiudi()
  })

  test("chiudi fa fallire le richieste ancora in attesa", async () => {
    const cliente = avvia()
    const { threadId, turnId } = await avviaGiro(cliente, "LUNGO")
    const attesa = cliente.chiedi("turn/steer", { threadId, expectedTurnId: turnId, input: [{ type: "text", text: "CADUTA", text_elements: [] }] }).catch((e: unknown) => e)
    await Bun.sleep(0)
    await cliente.chiudi()
    expect(await attesa).toBeInstanceOf(ErroreDiCodex)
  })
})

describe("righe che non sono JSON", () => {
  test("vanno nel registro del server e non rompono niente", async () => {
    const cliente = avvia()
    const errori = spyOn(console, "error").mockImplementation(() => undefined)
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "RUMORE")
    await ascolto.finito
    expect(testoFinale(ascolto.viste)).toBe("Questa è la risposta di prova.")
    expect(errori.mock.calls.some((c) => String(c[0]).includes("questa riga non è JSON"))).toBe(true)
    await cliente.chiedi("account/read", {})
    errori.mockRestore()
  })
})

describe("i giri del finto", () => {
  const voceDi = (viste: Array<{ metodo: string; parametri: Oggetto }>, metodo: string, tipo: string): Oggetto | undefined =>
    viste.map((v) => v.parametri["item"] as Oggetto | undefined).find((i, n) => viste[n]?.metodo === metodo && i?.["type"] === tipo)

  test("un messaggio a giro in corso entra nel giro registrato del comando", async () => {
    const cliente = avvia()
    const ascolto = raccogli(cliente)
    const { threadId, turnId } = await avviaGiro(cliente, "COMANDO")
    await aspetta(() => voceDi(ascolto.viste, "item/started", "commandExecution"))
    await cliente.chiedi("turn/steer", { threadId, expectedTurnId: turnId, input: [{ type: "text", text: "e una cosa in più", text_elements: [] }] })
    await ascolto.finito
    const messaggi = ascolto.viste.filter((v) => v.metodo === "item/completed" && (v.parametri["item"] as Oggetto)["type"] === "userMessage")
    expect(messaggi).toHaveLength(2)
    expect(JSON.stringify(messaggi[1]?.parametri["item"])).toContain("e una cosa in più")
    expect(ascolto.viste.every((v) => v.metodo === "serverRequest/resolved" || v.parametri["threadId"] === threadId || v.metodo.startsWith("account/") || v.metodo === "thread/started")).toBe(true)
    const letto = await cliente.chiedi<{ thread: { turns: Array<{ items: Oggetto[]; status: string }> } }>("thread/read", { threadId, includeTurns: true })
    expect(letto.thread.turns[0]?.status).toBe("completed")
    expect(letto.thread.turns[0]?.items.some((i) => i["type"] === "fileChange")).toBe(true)
  })

  test("il comando fermato a metà resta vivo finché non si chiudono i terminali", async () => {
    const cliente = avvia()
    const ascolto = raccogli(cliente)
    const { threadId, turnId } = await avviaGiro(cliente, "COMANDO_FERMATO")
    const comando = await aspetta(() => voceDi(ascolto.viste, "item/started", "commandExecution"))
    await cliente.chiedi("turn/interrupt", { threadId, turnId })
    await ascolto.finito
    expect(ascolto.viste.at(-1)?.parametri["turn"]).toMatchObject({ status: "interrupted" })
    const processo = String(comando["processId"])
    expect(await cliente.chiedi<{ terminated: boolean }>("thread/backgroundTerminals/terminate", { threadId, processId: "0" })).toEqual({ terminated: false })
    expect(await cliente.chiedi<{ terminated: boolean }>("thread/backgroundTerminals/terminate", { threadId, processId: processo })).toEqual({ terminated: true })
    await aspetta(() => ascolto.viste.some((v) => v.metodo === "item/completed" && (v.parametri["item"] as Oggetto)["id"] === comando["id"]))
  })

  test("il limite raggiunto fa fallire il giro dopo il 100% della finestra", async () => {
    const cliente = avvia()
    const ascolto = raccogli(cliente)
    await avviaGiro(cliente, "LIMITE")
    await ascolto.finito
    const metodi = ascolto.viste.map((v) => v.metodo)
    expect(metodi.indexOf("account/rateLimits/updated")).toBeLessThan(metodi.indexOf("turn/completed"))
    const finestra = ((ascolto.viste.find((v) => v.metodo === "account/rateLimits/updated")?.parametri["rateLimits"] as Oggetto)["primary"] as Oggetto)["usedPercent"]
    expect(finestra).toBe(100)
    expect(ascolto.viste.at(-1)?.parametri["turn"]).toMatchObject({ status: "failed", error: { codexErrorInfo: "usageLimitExceeded" } })
  })

  test("i thread tenuti in una cartella si riprendono dopo la caduta", async () => {
    const cliente = avvia({ FINTO_CODEX_CARTELLA: join(cartella, "thread") })
    const { threadId } = await avviaGiro(cliente, "CADUTA")
    await Bun.sleep(200)
    const ripreso = await cliente.chiedi<{ thread: { id: string; turns: unknown[] } }>("thread/resume", { threadId })
    expect(ripreso.thread.id).toBe(threadId)
    expect(ripreso.thread.turns).toHaveLength(1)
  })
})
