// Le voci di Codex negli eventi della chat: sulla registrazione di giri veri (`dati/codex-giri.jsonl`) e su notifiche scritte a mano
// per ciò che quei giri non hanno.
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { orfani } from "../src/chat/codex/processi"
import { comandoDi, domandeDiCodex, righeDelThread, risposteACodex, TraduttoreDiCodex } from "../src/chat/codex/voci"
import type { EventoMotore } from "../src/chat/motore"
import { messaggiDalleRighe } from "../src/chat/storico"

type Riga = { verso: "codex" | "noi"; id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown> }

const registrazione: Riga[] = (await Bun.file(join(import.meta.dir, "dati", "codex-giri.jsonl")).text())
  .split("\n")
  .filter((riga) => riga !== "")
  .map((riga) => JSON.parse(riga) as Riga)

const notifiche = registrazione.filter((r) => r.verso === "noi" && r.method !== undefined)

/** Il traduttore con tutto ciò che ha emesso. */
function traduttore() {
  const eventi: EventoMotore[] = []
  return { t: new TraduttoreDiCodex((e) => eventi.push(e), "codex/"), eventi }
}

/** Gli eventi di ogni giro registrato, nell'ordine: un giro finisce con `fine`. Con `quanti` ci si ferma alla fine di quel giro. */
function giriRegistrati(quanti = Infinity): { giri: EventoMotore[][]; t: TraduttoreDiCodex } {
  const { t, eventi } = traduttore()
  let finiti = 0
  for (const n of notifiche) {
    if (finiti >= quanti) break
    t.notifica(n.method!, n.params ?? {})
    if (n.method === "turn/completed") finiti++
  }
  const giri: EventoMotore[][] = [[]]
  for (const e of eventi) {
    giri.at(-1)!.push(e)
    if (e.tipo === "fine") giri.push([])
  }
  return { giri, t }
}

const di = <T extends EventoMotore["tipo"]>(eventi: EventoMotore[], tipo: T) => eventi.filter((e): e is Extract<EventoMotore, { tipo: T }> => e.tipo === tipo)

/** Il testo di ogni voce, coi pezzi uniti. */
function testiPerVoce(eventi: EventoMotore[]): string[] {
  const voci = new Map<string, string>()
  for (const e of eventi) if (e.tipo === "testo") voci.set(e.voce, (voci.get(e.voce) ?? "") + e.pezzo)
  return [...voci.values()]
}

describe("i giri registrati", () => {
  test("il comando, il file scritto e il messaggio a giro in corso", () => {
    const [giro] = giriRegistrati().giri
    expect(giro![0]).toEqual({ tipo: "avvio", modello: "codex/gpt-5.6-luna", effort: "low" })
    expect(giro![1]).toEqual({ tipo: "attivo" })

    const strumenti = di(giro!, "strumento")
    expect(strumenti.map((s) => s.nome)).toEqual(["Bash", "Write", "Bash"])
    expect(strumenti[0]!.ingresso).toEqual({ command: "ping -n 10 127.0.0.1" })
    expect(strumenti[1]!.ingresso).toEqual({ file_path: "C:\\lavoro\\prova.txt", content: "ciao\n" })

    const esiti = di(giro!, "esito")
    expect(esiti.map((e) => e.id)).toEqual(strumenti.map((s) => s.id))
    expect(esiti.every((e) => !e.esito.errore)).toBe(true)
    expect(esiti[0]!.esito.testo).toContain("Ping 127.0.0.1")
    expect(esiti[1]!.esito).toEqual({ testo: "", errore: false, immagini: [] })

    expect(di(giro!, "lavoro")).toEqual([])

    const testi = testiPerVoce(giro!)
    expect(testi[0]).toBe("Eseguo il comando richiesto, poi creo `prova.txt` e leggo la variabile d’ambiente.")
    expect(testi.at(-1)).toBe("Creato `prova.txt` con `ciao`; `MANGO_PROVA_AMBIENTE=arrivato`. BANANA")
    expect(di(giro!, "contesto").at(-1)!.usati).toBeGreaterThan(16000)
    expect(giro!.at(-1)).toEqual({ tipo: "fine", errore: null, durata_ms: 21677, inCoda: 0 })
  })

  test("un giro fermato a metà di un comando: finisce fermato, non ha mai un lavoro e il processo resta da chiudere", () => {
    const { giri, t } = giriRegistrati(2)
    const fermato = giri[1]!
    const comando = di(fermato, "strumento")[0]!
    expect(comando.ingresso).toEqual({ command: "ping -n 40 127.0.0.1" })
    expect(di(fermato, "esito")).toEqual([])
    expect(di(fermato, "lavoro")).toEqual([])
    expect(fermato.at(-1)).toMatchObject({ tipo: "fine", errore: { codice: "fermato", causa: "" } })

    expect(t.processiVivi).toHaveLength(1)
    const processo = t.processiVivi[0]!
    expect(t.processoDi(comando.id)).toBe(processo)
    t.chiuso(processo)
    expect(t.processiVivi).toEqual([])
    expect(t.processoDi(comando.id)).toBeNull()
  })

  test("un comando fermato finisce più tardi, da sé o perché lo si chiude: non resta da chiudere, e il suo esito non riapre un giro finito e un giro dopo non ne fa un lavoro", () => {
    const { giri, t } = giriRegistrati()
    const comando = di(giri[1]!, "strumento")[0]!
    expect(di(giri.flat(), "esito").some((e) => e.id === comando.id)).toBe(false)
    expect(t.processiVivi).toEqual([])
    expect(di(giri.slice(2).flat(), "lavoro")).toEqual([])
  })

  test("la skill e lo strumento MCP che aspetta la risposta del creator", () => {
    const { giri } = giriRegistrati()
    expect(testiPerVoce(giri[2]!)).toEqual(["GIRASOLE"])
    const strumento = di(giri[3]!, "strumento")[0]!
    expect(strumento).toMatchObject({ nome: "mcp__prova__domanda", ingresso: { domanda: "Che colore vuoi?" } })
    expect(di(giri[3]!, "esito").find((e) => e.id === strumento.id)).toEqual({ tipo: "esito", id: strumento.id, esito: { testo: "Il creator ha risposto: AZZURRO", errore: false, immagini: [] } })
    expect(giri[3]!.at(-1)).toMatchObject({ tipo: "fine", errore: null })
  })

  test("il titolo dato al thread, la misura del contesto con la finestra del modello", () => {
    const { giri, t } = giriRegistrati()
    expect(di(giri.flat(), "titolo")).toEqual([{ tipo: "titolo", titolo: "Prova del protocollo" }])
    expect(t.contesto).toMatchObject({ totale: 258400 })
    expect(t.contesto!.usati).toBe(di(giri.flat(), "contesto").at(-1)!.usati)
    expect(t.giroInCorso).toBeNull()
  })

  test("le voci di pensiero vuote e i messaggi del creator non danno niente", () => {
    const tutti = giriRegistrati().giri.flat()
    expect(tutti.filter((e) => e.tipo === "pensiero")).toEqual([])
    expect(testiPerVoce(tutti).some((scritto) => scritto.includes("First run this exact shell command"))).toBe(false)
  })
})

describe("riletto", () => {
  const letto = registrazione.find((r) => r.verso === "noi" && r.method === undefined && (r.result?.["thread"] as { turns?: unknown[] } | undefined)?.turns?.length)!
  const thread = letto.result!["thread"] as Record<string, unknown>

  test("la rilettura dà gli stessi strumenti, testi ed esiti della diretta", () => {
    const { righe, testiDelCreator } = righeDelThread(thread, "C:\\lavoro\\archivio")
    const messaggi = messaggiDalleRighe(righe, "it")
    expect(testiDelCreator).toHaveLength(5)
    expect(messaggi.filter((m) => m.ruolo === "utente")).toHaveLength(5)

    const diretta = giriRegistrati().giri.flat()
    const partiDelMotore = messaggi.filter((m) => m.ruolo === "claude").flatMap((m) => m.parti)
    const strumenti = partiDelMotore.filter((p) => p.tipo === "strumento")
    expect(strumenti.map((s) => [s.id, s.nome, s.ingresso])).toEqual(di(diretta, "strumento").map((s) => [s.id, s.nome, s.ingresso]))
    expect(partiDelMotore.filter((p) => p.tipo === "testo").map((p) => p.testo)).toEqual(testiPerVoce(diretta))

    // Il comando fermato in diretta resta senza esito; riletto ha quello che Codex ha scritto dopo.
    const fermato = di(diretta, "strumento").find((s) => !di(diretta, "esito").some((e) => e.id === s.id))!
    const conEsito = strumenti.filter((s) => s.esito !== undefined || s.errore !== undefined).map((s) => s.id)
    expect(conEsito.filter((id) => id !== fermato.id)).toEqual(di(diretta, "esito").map((e) => e.id))
    expect(strumenti.find((s) => s.id === fermato.id)?.esito).toContain("Trasmessi = 40")
    expect(strumenti.find((s) => s.nome === "mcp__prova__domanda")?.esito).toBe("Il creator ha risposto: AZZURRO")
    expect(messaggi[0]!.quando).toBe(new Date(1794598503753).toISOString())
  })

  test("il messaggio scritto a giro in corso apre un messaggio nuovo del motore, come in diretta", () => {
    const messaggi = messaggiDalleRighe(righeDelThread(thread, "C:\\lavoro\\archivio").righe, "it")
    expect(messaggi.slice(0, 4).map((m) => m.ruolo)).toEqual(["utente", "claude", "utente", "claude"])
    expect(messaggi[2]!.parti).toEqual([{ tipo: "testo", testo: "One more thing: end your final answer with the word BANANA." }])
  })

  test("un riassunto del contesto nasconde ciò che lo precede; una voce ancora in corso non ha esito", () => {
    const giri = [
      { items: [{ type: "userMessage", id: "u1", content: [{ type: "text", text: "Prima" }] }, { type: "agentMessage", id: "a1", text: "Vecchio" }, { type: "contextCompaction", id: "c1" }] },
      { items: [{ type: "userMessage", id: "u2", content: [{ type: "text", text: "Dopo" }] }, { type: "commandExecution", id: "x1", command: "dir", commandActions: [], status: "inProgress", aggregatedOutput: null, exitCode: null }] },
    ]
    const messaggi = messaggiDalleRighe(righeDelThread({ turns: giri }, "C:\\lavoro\\archivio").righe, "it")
    expect(messaggi.map((m) => m.id)).toEqual(["u2", "x1"])
    expect(messaggi[1]!.parti).toEqual([{ tipo: "strumento", id: "x1", nome: "Bash", ingresso: { command: "dir" } }])
  })
})

describe("la revisione", () => {
  const giri = [
    { items: [{ type: "enteredReviewMode", id: "r1", review: "il piano" }, { type: "exitedReviewMode", id: "r2", review: "Il piano ha due scene uguali." }] },
    { items: [{ type: "userMessage", id: "u1", content: [{ type: "text", text: "Grazie" }] }, { type: "exitedReviewMode", id: "r3", review: "" }] },
  ]

  test("riletta è il comando del creator e il testo che Codex ne ricava; una revisione vuota non dà niente", () => {
    const messaggi = messaggiDalleRighe(righeDelThread({ turns: giri }, "C:\\lavoro\\archivio").righe, "it")
    expect(messaggi.map((m) => [m.ruolo, m.parti])).toEqual([
      ["utente", [{ tipo: "testo", testo: "/review" }]],
      ["claude", [{ tipo: "testo", testo: "Il piano ha due scene uguali." }]],
      ["utente", [{ tipo: "testo", testo: "Grazie" }]],
    ])
  })

  test("in diretta il testo della revisione è la risposta, una volta sola", () => {
    const eventi: EventoMotore[] = []
    const t = new TraduttoreDiCodex((e) => eventi.push(e), "codex/")
    t.notifica("item/started", { threadId: "t", turnId: "g", item: giri[0]!.items[0] })
    t.notifica("item/completed", { threadId: "t", turnId: "g", item: giri[0]!.items[0] })
    t.notifica("item/completed", { threadId: "t", turnId: "g", item: giri[0]!.items[1] })
    expect(eventi).toEqual([{ tipo: "testo", voce: "r2", pezzo: "Il piano ha due scene uguali." }])
  })
})

describe("i sottoagenti", () => {
  const voce = (item: Record<string, unknown>, thread = "t") => ({ threadId: thread, turnId: "g", item })
  const lancio = (extra: Record<string, unknown> = {}) => ({
    type: "collabAgentToolCall",
    id: "c1",
    tool: "spawnAgent",
    status: "completed",
    senderThreadId: "t",
    receiverThreadIds: ["f1"],
    prompt: "Conta le scene\ndel video",
    model: null,
    reasoningEffort: null,
    agentsStates: { f1: { status: "running", message: null } },
    ...extra,
  })
  const attivita = (kind: string, extra: Record<string, unknown> = {}) => ({ type: "subAgentActivity", id: `a-${kind}`, kind, agentThreadId: "f1", agentPath: "/root/conta", model: null, reasoningEffort: null, ...extra })
  const lavori = (eventi: EventoMotore[]) => di(eventi, "lavoro")
  const conFiglio = () => {
    const banco = traduttore()
    banco.t.figlioNato("f1")
    return banco
  }

  test("l'aiutante lanciato è uno strumento Agent e, quando se ne sa il thread, un lavoro di genere agente con la sua richiesta in una riga", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/started", voce(lancio({ status: "inProgress", receiverThreadIds: [], agentsStates: {} })))
    expect(lavori(eventi)).toEqual([])
    t.notifica("item/completed", voce(lancio()))
    expect(di(eventi, "strumento")).toEqual([{ tipo: "strumento", id: "c1", nome: "Agent", ingresso: { description: "Conta le scene\ndel video", prompt: "Conta le scene\ndel video" } }])
    expect(lavori(eventi)).toEqual([{ tipo: "lavoro", cosa: "iniziato", id: "f1", genere: "agente", descrizione: "Conta le scene del video", background: false }])
    expect(di(eventi, "esito")).toHaveLength(1)
  })

  test("la voce subAgentActivity apre il lavoro una volta sola, e la richiesta che arriva dopo ne precisa la descrizione", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/started", voce(attivita("started")))
    t.notifica("item/completed", voce(attivita("started")))
    t.notifica("item/completed", voce(lancio()))
    t.notifica("item/completed", voce(lancio({ id: "c2" })))
    expect(lavori(eventi)).toEqual([
      { tipo: "lavoro", cosa: "iniziato", id: "f1", genere: "agente", descrizione: "/root/conta", background: false },
      { tipo: "lavoro", cosa: "cambiato", id: "f1", descrizione: "Conta le scene del video" },
    ])
    expect(di(eventi, "strumento")).toHaveLength(0)
  })

  test("l'aiutante che finisce, o è interrotto, chiude il lavoro; una voce che arriva dopo non lo riapre", () => {
    for (const kind of ["completed", "interrupted"]) {
      const { t, eventi } = traduttore()
      t.notifica("item/completed", voce(lancio()))
      t.notifica("item/completed", voce(attivita(kind)))
      t.notifica("item/completed", voce(attivita(kind)))
      t.notifica("item/completed", voce(attivita("started")))
      t.notifica("item/completed", voce(lancio({ id: "c2" })))
      expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])
    }
  })

  test("le altre chiamate non aprono lavori: decidono lo stato di quelli che ci sono", () => {
    const { t, eventi } = traduttore()
    for (const tool of ["wait", "sendInput", "resumeAgent", "closeAgent", "sendMessage", "followupTask", "interruptAgent", "listAgents"]) {
      t.notifica("item/completed", voce(lancio({ id: tool, tool, receiverThreadIds: ["f9"], agentsStates: { f9: { status: "running", message: null } } })))
    }
    expect(lavori(eventi)).toEqual([])

    t.notifica("item/completed", voce(lancio()))
    t.notifica("item/completed", voce(lancio({ id: "w1", tool: "wait", receiverThreadIds: [] })))
    t.notifica("item/completed", voce(lancio({ id: "w2", tool: "wait", receiverThreadIds: [], agentsStates: { f1: { status: "completed", message: "Sono 12." } } })))
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])
    expect(di(eventi, "esito")).toHaveLength(11)
  })

  test("chiuderlo o interromperlo con la sua chiamata lo toglie dai lavori", () => {
    for (const tool of ["closeAgent", "interruptAgent"]) {
      const { t, eventi } = traduttore()
      t.notifica("item/completed", voce(lancio()))
      t.notifica("item/completed", voce(lancio({ id: tool, tool })))
      expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])
    }
  })

  test("una chiamata che fallisce non apre il lavoro, e l'aiutante che muore appena nato lo chiude", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/completed", voce(lancio({ status: "failed", agentsStates: {} })))
    t.notifica("item/completed", voce(lancio({ id: "c2", receiverThreadIds: ["f2"], agentsStates: { f2: { status: "errored", message: "no" } } })))
    expect(lavori(eventi)).toEqual([])
    t.notifica("item/completed", voce(lancio({ id: "c3", receiverThreadIds: ["f3"], agentsStates: { f3: { status: "running", message: null } } })))
    t.notifica("item/completed", voce(lancio({ id: "w", tool: "wait", receiverThreadIds: ["f3"], agentsStates: { f3: { status: "shutdown", message: null } } })))
    expect(lavori(eventi).map((l) => [l.cosa, "id" in l ? l.id : ""])).toEqual([
      ["iniziato", "f3"],
      ["finito", "f3"],
    ])
  })

  test("i token del thread figlio sono l'uso del lavoro, con gli strumenti che ha lanciato; il suo messaggio e il suo contesto non sono della conversazione", () => {
    const { t, eventi } = conFiglio()
    t.notifica("item/completed", voce(lancio()))
    const prima = eventi.length
    t.notificaDelFiglio("f1", "turn/started", { threadId: "f1", turn: { id: "gf" } })
    t.notificaDelFiglio("f1", "item/started", voce({ type: "commandExecution", id: "x", command: "dir", commandActions: [], processId: "9" }, "f1"))
    t.notificaDelFiglio("f1", "item/started", voce({ type: "webSearch", id: "w", query: "q" }, "f1"))
    t.notificaDelFiglio("f1", "item/agentMessage/delta", { threadId: "f1", itemId: "m", delta: "Sono 12." })
    t.notificaDelFiglio("f1", "thread/tokenUsage/updated", { threadId: "f1", turnId: "gf", tokenUsage: { total: { totalTokens: 5400 }, last: { totalTokens: 900 }, modelContextWindow: 100000 } })
    expect(eventi.slice(prima)).toEqual([{ tipo: "lavoro", cosa: "uso", id: "f1", uso: { token: 5400, strumenti: 2 } }])
    expect(t.contesto).toBeNull()
    expect(t.processiVivi).toEqual([])
    expect(t.giroDelFiglio("f1")).toBe("gf")
  })

  test("il thread figlio interrotto chiude il lavoro, chiuso anche; finito il suo giro no, può riceverne un altro", () => {
    const { t, eventi } = conFiglio()
    t.notifica("item/completed", voce(lancio()))
    t.notificaDelFiglio("f1", "turn/started", { threadId: "f1", turn: { id: "g1" } })
    t.notificaDelFiglio("f1", "turn/completed", { threadId: "f1", turn: { id: "g1", status: "completed" } })
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato"])
    expect(t.giroDelFiglio("f1")).toBeNull()
    t.notificaDelFiglio("f1", "turn/started", { threadId: "f1", turn: { id: "g2" } })
    t.notificaDelFiglio("f1", "turn/completed", { threadId: "f1", turn: { id: "g2", status: "interrupted" } })
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])

    const chiuso = conFiglio()
    chiuso.t.notifica("item/completed", voce(lancio()))
    chiuso.t.notificaDelFiglio("f1", "thread/closed", { threadId: "f1" })
    expect(lavori(chiuso.eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])
  })

  test("a fine giro l'aiutante ancora al lavoro passa in background prima della fine, e resta finché non finisce", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/completed", voce(lancio()))
    t.notifica("turn/completed", { turn: { id: "g1", status: "completed", durationMs: 5 } })
    expect(eventi.slice(-2)).toEqual([
      { tipo: "lavoro", cosa: "cambiato", id: "f1", background: true },
      { tipo: "fine", errore: null, durata_ms: 5, inCoda: 0 },
    ])

    t.notifica("turn/started", { turn: { id: "g2" } })
    t.notifica("turn/completed", { turn: { id: "g2", status: "completed", durationMs: 5 } })
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "cambiato"])
    t.notifica("item/completed", voce(attivita("completed")))
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "cambiato", "finito"])
  })

  test("i thread figli si riconoscono, anche quelli che nascono da un altro figlio", () => {
    const { t } = conFiglio()
    expect(t.haFiglio("f1")).toBe(true)
    expect(t.haFiglio("f2")).toBe(false)
    t.figlioNato("f2")
    expect(t.haFiglio("f2")).toBe(true)
  })

  test("riletto, lo strumento Agent resta com'è e le voci subAgentActivity non danno righe", () => {
    const giri = [{ items: [{ type: "userMessage", id: "u", content: [{ type: "text", text: "Conta" }] }, lancio({ id: "c1" }), attivita("started"), attivita("completed")] }]
    const messaggi = messaggiDalleRighe(righeDelThread({ turns: giri }, "C:\\lavoro\\archivio").righe, "it")
    expect(messaggi.map((m) => m.id)).toEqual(["u", "c1"])
    expect(messaggi[1]!.parti).toEqual([expect.objectContaining({ tipo: "strumento", id: "c1", nome: "Agent", ingresso: { description: "Conta le scene\ndel video", prompt: "Conta le scene\ndel video" } })])
  })
})

describe("i comandi che restano accesi", () => {
  const comando = (extra: Record<string, unknown> = {}) => ({
    threadId: "t",
    turnId: "g1",
    item: { type: "commandExecution", id: "x1", command: "ping -n 600 127.0.0.1", commandActions: [], processId: "77", status: "inProgress", aggregatedOutput: null, exitCode: null, ...extra },
  })
  const lavori = (eventi: EventoMotore[]) => di(eventi, "lavoro")
  const fineDelGiro = (t: TraduttoreDiCodex, id: string, stato = "completed") => t.notifica("turn/completed", { turn: { id, status: stato, durationMs: 5 } })

  test("durante il giro un comando è solo il suo strumento: nessun lavoro, e il suo processo è da chiudere", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    expect(lavori(eventi)).toEqual([])
    expect(di(eventi, "strumento")).toEqual([{ tipo: "strumento", id: "x1", nome: "Bash", ingresso: { command: "ping -n 600 127.0.0.1" } }])
    expect(t.processiInSfondo).toEqual([])
    expect(t.processiVivi).toEqual(["77"])
  })

  test("un comando ancora acceso a fine giro nasce in background con la sua descrizione, prima della fine, e il suo processo resta da chiudere", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    fineDelGiro(t, "g1")
    expect(lavori(eventi)).toEqual([{ tipo: "lavoro", cosa: "iniziato", id: "x1", genere: "comando", descrizione: "ping -n 600 127.0.0.1", background: true }])
    expect(eventi.at(-1)).toMatchObject({ tipo: "fine", errore: null })
    expect(eventi.at(-2)).toEqual(lavori(eventi)[0]!)
    expect(t.processiInSfondo).toEqual(["77"])
    expect(t.processiVivi).toEqual(["77"])
  })

  test("resta fra i lavori attraverso i giri dopo, e sparisce quando Codex dice che è finito, senza riaprire il giro", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    fineDelGiro(t, "g1")
    t.notifica("turn/started", { turn: { id: "g2" } })
    fineDelGiro(t, "g2")
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato"])

    t.notifica("item/completed", comando({ status: "completed", aggregatedOutput: "ok", exitCode: 0 }))
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato", "finito"])
    expect(di(eventi, "esito")).toEqual([])
    expect(t.processiVivi).toEqual([])
    expect(t.processiInSfondo).toEqual([])
  })

  test("un giro fermato non lascia lavori, nemmeno dopo: il processo del comando resta da chiudere", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    fineDelGiro(t, "g1", "interrupted")
    expect(lavori(eventi)).toEqual([])
    expect(t.processiInSfondo).toEqual([])
    expect(t.processiVivi).toEqual(["77"])

    t.notifica("turn/started", { turn: { id: "g2" } })
    fineDelGiro(t, "g2")
    expect(lavori(eventi)).toEqual([])
    expect(t.processiVivi).toEqual(["77"])
    t.chiuso("77")
    expect(t.processiVivi).toEqual([])
    expect(lavori(eventi)).toEqual([])
  })

  test("un giro fermato non tocca un comando già in background da un giro prima", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    fineDelGiro(t, "g1")
    t.notifica("turn/started", { turn: { id: "g2" } })
    fineDelGiro(t, "g2", "interrupted")
    expect(lavori(eventi).map((l) => l.cosa)).toEqual(["iniziato"])
    expect(t.processiInSfondo).toEqual(["77"])
  })

  test("i processi che Codex non elenca più sono finiti, quelli che elenca restano; senza processo non si può dire", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    t.notifica("item/started", comando({ id: "x2", processId: "78" }))
    t.notifica("item/started", comando({ id: "x3", processId: null }))
    fineDelGiro(t, "g1")
    expect(t.processiInSfondo).toEqual(["77", "78"])

    t.terminaliFiniti(["77", "78"], new Set(["78"]))
    expect(lavori(eventi).filter((l) => l.cosa === "finito")).toEqual([{ tipo: "lavoro", cosa: "finito", id: "x1" }])
    expect(t.processiInSfondo).toEqual(["78"])
    expect(t.processoDi("x1")).toBeNull()
  })

  test("un comando che finisce nel suo giro non è mai un lavoro: ha il suo esito", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/started", comando())
    t.notifica("item/completed", comando({ status: "completed", aggregatedOutput: "ok", exitCode: 0 }))
    fineDelGiro(t, "g1")
    expect(lavori(eventi)).toEqual([])
    expect(di(eventi, "esito")).toEqual([{ tipo: "esito", id: "x1", esito: { testo: "ok", errore: false, immagini: [] } }])
    expect(t.processiInSfondo).toEqual([])
  })
})

describe("ciò che i giri registrati non hanno", () => {
  const voce = (item: Record<string, unknown>) => ({ threadId: "t", turnId: "g", item })

  test("il pensiero a pezzi, riassunto o intero, è una Parte per pezzo di ragionamento; arrivato intero non si ripete", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/started", voce({ type: "reasoning", id: "r1", summary: [], content: [] }))
    t.notifica("item/reasoning/summaryTextDelta", { itemId: "r1", summaryIndex: 0, delta: "Guardo " })
    t.notifica("item/reasoning/summaryTextDelta", { itemId: "r1", summaryIndex: 0, delta: "il piano." })
    t.notifica("item/reasoning/summaryTextDelta", { itemId: "r1", summaryIndex: 1, delta: "Poi taglio." })
    t.notifica("item/reasoning/textDelta", { itemId: "r1", contentIndex: 0, delta: "grezzo" })
    t.notifica("item/completed", voce({ type: "reasoning", id: "r1", summary: ["Guardo il piano.", "Poi taglio."], content: ["grezzo"] }))
    expect(eventi).toEqual([
      { tipo: "pensiero", voce: "r1:s0", pezzo: "Guardo " },
      { tipo: "pensiero", voce: "r1:s0", pezzo: "il piano." },
      { tipo: "pensiero", voce: "r1:s1", pezzo: "Poi taglio." },
      { tipo: "pensiero", voce: "r1:c0", pezzo: "grezzo" },
    ])
  })

  test("pensiero e testo arrivati solo interi si danno alla fine della voce: il pensiero vero, o il suo riassunto", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/completed", voce({ type: "reasoning", id: "r1", summary: ["Riassunto."], content: [] }))
    t.notifica("item/completed", voce({ type: "reasoning", id: "r2", summary: ["Riassunto."], content: ["Uno.", "Due."] }))
    t.notifica("item/completed", voce({ type: "agentMessage", id: "m1", text: "Fatto." }))
    expect(eventi).toEqual([
      { tipo: "pensiero", voce: "r1", pezzo: "Riassunto." },
      { tipo: "pensiero", voce: "r2", pezzo: "Uno.\n\nDue." },
      { tipo: "testo", voce: "m1", pezzo: "Fatto." },
    ])
  })

  test("uno strumento MCP con un'immagine nel risultato, e uno che fallisce", () => {
    const { t, eventi } = traduttore()
    const chiamata = { type: "mcpToolCall", id: "s1", server: "video", tool: "foto", arguments: { slug: "v" }, error: null }
    t.notifica("item/started", voce({ ...chiamata, status: "inProgress", result: null }))
    t.notifica("item/completed", voce({ ...chiamata, status: "completed", result: { content: [{ type: "text", text: "Ecco." }, { type: "image", data: "AAAA", mimeType: "image/jpeg" }, { type: "text", text: "Fine." }] } }))
    t.notifica("item/completed", voce({ ...chiamata, id: "s2", status: "failed", result: null, error: { message: "Il video «v» non c'è." } }))
    expect(eventi).toEqual([
      { tipo: "strumento", id: "s1", nome: "mcp__video__foto", ingresso: { slug: "v" } },
      { tipo: "esito", id: "s1", esito: { testo: "Ecco.\nFine.", errore: false, immagini: [{ media_type: "image/jpeg", data: "AAAA" }] } },
      { tipo: "esito", id: "s2", esito: { testo: "Il video «v» non c'è.", errore: true, immagini: [] } },
    ])
  })

  test("un comando che esce con errore, una modifica a più file, una ricerca, un'immagine guardata", () => {
    const { t, eventi } = traduttore()
    t.notifica("item/completed", voce({ type: "commandExecution", id: "c1", command: "x", commandActions: [], status: "completed", aggregatedOutput: "no", exitCode: 2 }))
    const cambi = { type: "fileChange", id: "f1", changes: [{ path: "a.md", kind: { type: "update", move_path: null }, diff: "@@" }, { path: "b.md", kind: { type: "add" }, diff: "b" }] }
    t.notifica("item/started", voce({ ...cambi, status: "inProgress" }))
    t.notifica("item/completed", voce({ ...cambi, status: "failed" }))
    t.notifica("item/started", voce({ type: "webSearch", id: "w1", query: "tiktok orari", action: null, results: null }))
    t.notifica("item/started", voce({ type: "imageView", id: "i1", path: "C:\\lavoro\\foto.png" }))
    expect(eventi).toEqual([
      { tipo: "esito", id: "c1", esito: { testo: "no", errore: true, immagini: [] } },
      { tipo: "strumento", id: "f1", nome: "Edit", ingresso: { file_path: "a.md", diff: "@@" } },
      { tipo: "strumento", id: "f1:1", nome: "Write", ingresso: { file_path: "b.md", content: "b" } },
      { tipo: "esito", id: "f1", esito: { testo: "", errore: true, immagini: [] } },
      { tipo: "esito", id: "f1:1", esito: { testo: "", errore: true, immagini: [] } },
      { tipo: "strumento", id: "w1", nome: "WebSearch", ingresso: { query: "tiktok orari" } },
      { tipo: "strumento", id: "i1", nome: "Read", ingresso: { file_path: "C:\\lavoro\\foto.png" } },
    ])
  })

  test("il comando si mostra senza la shell che lo avvolge", () => {
    expect(comandoDi({ command: '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -Command \'dir | sort\'', commandActions: [{ type: "listFiles", command: "dir" }, { type: "unknown", command: "sort" }] })).toBe("dir | sort")
    expect(comandoDi({ command: "/bin/bash -lc \"ls -la 'a b'\"", commandActions: [] })).toBe("ls -la 'a b'")
    expect(comandoDi({ command: "python -m motore", commandActions: [] })).toBe("python -m motore")
    expect(comandoDi({ command: 'pwsh -Command "x"', commandActions: [{ type: "unknown", command: "y" }] })).toBe("y")
  })

  test("ogni aggiornamento del piano è un elenco dei passi, già fatto", () => {
    const { t, eventi } = traduttore()
    t.notifica("turn/plan/updated", { threadId: "t", turnId: "g", explanation: null, plan: [{ step: "Leggo", status: "completed" }, { step: "Taglio", status: "inProgress" }, { step: "Monto", status: "pending" }] })
    t.notifica("turn/plan/updated", { threadId: "t", turnId: "g", explanation: null, plan: [] })
    expect(eventi.map((e) => [e.tipo, "id" in e ? e.id : ""])).toEqual([
      ["strumento", "piano:g:0"],
      ["esito", "piano:g:0"],
      ["strumento", "piano:g:1"],
      ["esito", "piano:g:1"],
    ])
    expect(eventi[0]).toMatchObject({
      nome: "TodoWrite",
      ingresso: { todos: [{ content: "Leggo", activeForm: "Leggo", status: "completed" }, { content: "Taglio", activeForm: "Taglio", status: "in_progress" }, { content: "Monto", activeForm: "Monto", status: "pending" }] },
    })
  })

  test("il contesto riassunto, detto due volte da Codex, è un riassunto solo per giro, e la misura si azzera", () => {
    const { t, eventi } = traduttore()
    t.notifica("thread/tokenUsage/updated", { tokenUsage: { last: { totalTokens: 900 }, modelContextWindow: 1000 } })
    t.notifica("turn/started", { turn: { id: "g1" } })
    t.notifica("item/completed", voce({ type: "contextCompaction", id: "k1" }))
    t.notifica("thread/compacted", { threadId: "t", turnId: "g1" })
    expect(t.contesto).toBeNull()
    t.notifica("turn/completed", { turn: { id: "g1", status: "completed", durationMs: 5 } })
    t.notifica("turn/started", { turn: { id: "g2" } })
    t.notifica("thread/compacted", { threadId: "t", turnId: "g2" })
    expect(eventi.filter((e) => e.tipo === "riassunto")).toHaveLength(2)
  })

  test("come finisce male un giro: limite raggiunto con la sua scadenza, sovraccarico, non collegato, senza risposta, altro", () => {
    const fineCon = (errore: unknown, prima: (t: TraduttoreDiCodex) => void = () => undefined) => {
      const { t, eventi } = traduttore()
      t.notifica("turn/started", { turn: { id: "g" } })
      prima(t)
      t.notifica("turn/completed", { turn: { id: "g", status: "failed", error: errore, durationMs: 10 } })
      return di(eventi, "fine")[0]!.errore
    }
    const limiti = { primary: { usedPercent: 100, resetsAt: 2000 }, secondary: { usedPercent: 100, resetsAt: 3000 } }
    expect(fineCon({ message: "limit", codexErrorInfo: "usageLimitExceeded" }, (t) => t.notifica("account/rateLimits/updated", { rateLimits: limiti }))).toEqual({ codice: "limite", finoA: 3000 })
    expect(fineCon({ message: "limit", codexErrorInfo: "usageLimitExceeded" }, (t) => t.notifica("account/rateLimits/updated", { rateLimits: { primary: { usedPercent: 12, resetsAt: 2000 }, secondary: null } }))).toEqual({ codice: "limite", finoA: null })
    expect(fineCon({ message: "busy", codexErrorInfo: "serverOverloaded" })).toEqual({ codice: "sovraccarico" })
    expect(fineCon({ message: "401", codexErrorInfo: "unauthorized" })).toEqual({ codice: "non_collegato" })
    expect(fineCon({ message: "stream closed", codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } } })).toEqual({ codice: "non_risposto", dettaglio: "stream closed" })
    expect(fineCon({ message: "Il modello non c'è.", codexErrorInfo: "modelNotFound" })).toEqual({ codice: "errore", causa: "Il modello non c'è." })
    // L'errore arrivato prima con la sua notifica vale se il giro non lo ripete; uno che Codex riprova da sé no.
    expect(fineCon(null, (t) => t.notifica("error", { error: { message: "busy", codexErrorInfo: "serverOverloaded" }, willRetry: false }))).toEqual({ codice: "sovraccarico" })
    expect(fineCon(null, (t) => t.notifica("error", { error: { message: "busy", codexErrorInfo: "serverOverloaded" }, willRetry: true }))).toEqual({ codice: "errore", causa: "" })
  })

  test("le domande di Codex nella forma della chat, e le risposte del creator nella sua", () => {
    const parametri = {
      questions: [
        { id: "q1", header: "Taglio", question: "Quale taglio?", isOther: true, isSecret: false, options: [{ label: "Corto", description: "30 s" }, { label: "Lungo", description: "60 s" }] },
        { id: "q2", header: "Titolo", question: "Che titolo?", isOther: true, isSecret: false, options: null },
      ],
    }
    expect(domandeDiCodex(parametri)).toEqual([
      { domanda: "Quale taglio?", intestazione: "Taglio", opzioni: [{ etichetta: "Corto", descrizione: "30 s" }, { etichetta: "Lungo", descrizione: "60 s" }], multipla: false },
      { domanda: "Che titolo?", intestazione: "Titolo", opzioni: [], multipla: false },
    ])
    expect(risposteACodex(parametri, { "Quale taglio?": "Lungo", "Che titolo?": "Il mio titolo" })).toEqual({ answers: { q1: { answers: ["Lungo"] }, q2: { answers: ["Il mio titolo"] } } })
  })
})

describe("ciò che un comando chiuso lascia acceso", () => {
  // 10 è il programma di Codex; 20 la shell di un comando con 21 e 22 sotto; 30 il server MCP con 31 sotto; 40 un'altra shell con 41.
  const prima = new Map([[10, 1], [20, 10], [21, 20], [22, 21], [30, 10], [31, 30], [40, 10], [41, 40], [99, 1]])

  test("morta la shell, restano da fermare i programmi che aveva lanciato: il più in alto, non ciò che sta sotto un processo vivo", () => {
    expect(orfani(prima, new Set([10, 21, 22, 30, 31, 40, 41, 99]), 10)).toEqual([21])
    expect(orfani(prima, new Set([10, 22, 30, 31, 40, 41, 99]), 10)).toEqual([22])
  })

  test("se la shell è viva o tutto è morto non c'è niente da fermare, e ciò che non discende da Codex non si tocca", () => {
    expect(orfani(prima, new Set([10, 20, 21, 22, 30, 31, 40, 41, 99]), 10)).toEqual([])
    expect(orfani(prima, new Set([10, 30, 31, 40, 41, 99]), 10)).toEqual([])
    expect(orfani(new Map([...prima, [100, 99]]), new Set([10, 100]), 10)).toEqual([])
  })
})
