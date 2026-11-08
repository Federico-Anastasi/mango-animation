import { afterEach, expect, test } from "bun:test"
import { appendFile, mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Consumi } from "../src/consumi/consumi"
import { FileDiConversazione, riepiloga, type Riepilogo } from "../src/consumi/lettura"
import { ascolta, aspetta, avviaAmbiente, type Ambiente } from "./aiuti"

let n = 0
const id = (): string => `id-${++n}`
const t = (secondi: number): string => new Date(Date.UTC(2026, 10, 3, 10, 0, secondi)).toISOString()

const prompt = (secondi: number, testo: string, extra: object = {}): string =>
  JSON.stringify({ parentUuid: null, isSidechain: false, type: "user", message: { role: "user", content: testo }, uuid: id(), timestamp: t(secondi), ...extra })

const risposta = (secondi: number, messaggio: string, usage: [numero: number, scritti: number, riletti: number, creati: number], blocchi: object[] = [{ type: "text", text: "ok" }], extra: object = {}): string =>
  JSON.stringify({
    parentUuid: "x",
    isSidechain: false,
    message: { model: "m", id: messaggio, type: "message", role: "assistant", content: blocchi, usage: { input_tokens: usage[0], output_tokens: usage[1], cache_read_input_tokens: usage[2], cache_creation_input_tokens: usage[3] } },
    requestId: `req_${messaggio}`,
    type: "assistant",
    uuid: id(),
    timestamp: t(secondi),
    ...extra,
  })

const esito = (secondi: number): string =>
  JSON.stringify({ parentUuid: "x", isSidechain: false, type: "user", message: { role: "user", content: [{ tool_use_id: "t1", type: "tool_result", content: "fatto" }] }, uuid: id(), timestamp: t(secondi), toolUseResult: { stdout: "fatto" } })

const strumento = (nome: string, input: object, idStrumento = "toolu_1"): object => ({ type: "tool_use", id: idStrumento, name: nome, input })

const CONTESTO = (slug: string): string => `[Context: the creator is looking at the video «Un titolo (con parentesi)» (${slug}), tab «Montaggio».]\n\nmonta`

const leggi = (righe: string[], agenti: FileDiConversazione[] = []): Riepilogo => {
  const f = new FileDiConversazione(false)
  righe.forEach((r) => f.aggiungi(r, () => true))
  return riepiloga(new Map([["sessione", f]]), agenti)
}

test("un giro va al video della sua riga di contesto: il tempo è dal messaggio alla fine, i token si contano una volta per richiesta", () => {
  const r = leggi([
    prompt(0, CONTESTO("orto-balcone")),
    // una richiesta scritta in tre blocchi ha la stessa riga d'uso in ognuno
    risposta(5, "m1", [2, 100, 0, 5000]),
    risposta(6, "m1", [2, 100, 0, 5000]),
    risposta(7, "m1", [2, 100, 0, 5000]),
    esito(30),
    risposta(40, "m2", [3, 50, 5000, 700]),
  ])
  expect(r.video.get("orto-balcone")).toEqual({ tempoMs: 40_000, giri: 1, token: { scritti: 150, riletti: 5000, nuovi: 5705 }, dal: Date.parse(t(0)), al: Date.parse(t(40)) })
  expect(r.senzaVideo).toEqual({ tempoMs: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } })
})

test("anche la riga di contesto di prima, in italiano, si legge", () => {
  const r = leggi([prompt(0, "[Contesto: il creator sta guardando il video «Il pane di casa» (il-pane-di-casa), scheda «Scheda».]\n\nciao"), risposta(10, "m1", [1, 10, 0, 0])])
  expect([...r.video.keys()]).toEqual(["il-pane-di-casa"])
})

test("senza contesto il giro va al video che gli strumenti toccano di più (percorso, anche con le barre di Windows, strumento «video», comando del motore)", () => {
  const r = leggi([
    prompt(0, "monta"),
    risposta(2, "m1", [1, 10, 0, 0], [strumento("Read", { file_path: "C:\\Users\\utente\\mango-animation\\archivio\\video\\orto-balcone\\piano.json" }, "a")]),
    risposta(4, "m2", [1, 10, 0, 0], [strumento("mcp__video__video_leggi", { slug: "orto-balcone" }, "b")]),
    risposta(6, "m3", [1, 10, 0, 0], [strumento("Bash", { command: "python -m motore monta altro-video" }, "c")]),
    risposta(8, "m4", [1, 10, 0, 0], [strumento("Bash", { command: "ls archivio/video/orto-balcone/uscite" }, "d")]),
  ])
  expect([...r.video.keys()]).toEqual(["orto-balcone"])
  expect(r.video.get("orto-balcone")?.giri).toBe(1)
})

test("una cartella del codice che si chiama «video» o un percorso con segnaposto non sono un video", () => {
  const r = leggi([
    prompt(0, "guarda"),
    risposta(2, "m1", [1, 10, 0, 0], [strumento("Read", { file_path: "studio/src/video/PaginaVideo.tsx" }, "a"), strumento("Bash", { command: "ls archivio/video/<slug>/ studio/src/video/elenco.ts" }, "b")]),
  ])
  expect(r.video.size).toBe(0)
  expect(r.senzaVideo.giri).toBe(1)
})

test("se gli strumenti lavorano solo su un altro video, vince quello; se toccano anche quello del contesto, o niente, vince il contesto", () => {
  const altro = leggi([prompt(0, CONTESTO("orto-balcone")), risposta(2, "m1", [1, 10, 0, 0], [strumento("Read", { file_path: "archivio/video/stampa-3d/piano.json" })])])
  expect([...altro.video.keys()]).toEqual(["stampa-3d"])
  const pari = leggi([
    prompt(0, CONTESTO("orto-balcone")),
    risposta(2, "m1", [1, 10, 0, 0], [strumento("Read", { file_path: "archivio/video/stampa-3d/piano.json" }, "a"), strumento("Read", { file_path: "archivio/video/orto-balcone/piano.json" }, "b")]),
  ])
  expect([...pari.video.keys()]).toEqual(["orto-balcone"])
  const nulla = leggi([prompt(0, CONTESTO("orto-balcone")), risposta(2, "m1", [1, 10, 0, 0], [strumento("Bash", { command: "bun test" })])])
  expect([...nulla.video.keys()]).toEqual(["orto-balcone"])
})

test("un giro senza video non si attribuisce: sta a parte, e il tempo si conta lo stesso", () => {
  const r = leggi([prompt(0, "[Context: the creator is looking at the page «Girato».]\n\nciao"), risposta(20, "m1", [1, 10, 100, 0]), prompt(100, "ancora"), risposta(130, "m2", [1, 5, 0, 0])])
  expect(r.video.size).toBe(0)
  expect(r.senzaVideo).toEqual({ tempoMs: 50_000, giri: 2, token: { scritti: 15, riletti: 100, nuovi: 2 } })
})

test("i giri sono separati dai messaggi del creator; gli esiti degli strumenti, i comandi e le note del sistema non ne aprono uno", () => {
  const r = leggi([
    prompt(0, CONTESTO("a-uno")),
    risposta(10, "m1", [1, 1, 0, 0]),
    esito(11),
    prompt(12, "<local-command-caveat>x</local-command-caveat>", { isMeta: true }),
    risposta(20, "m2", [1, 1, 0, 0]),
    prompt(1000, CONTESTO("a-uno")),
    risposta(1030, "m3", [1, 1, 0, 0]),
  ])
  expect(r.video.get("a-uno")).toMatchObject({ giri: 2, tempoMs: 20_000 + 30_000 })
})

test("un messaggio senza risposta (un comando, un'interruzione) non è un giro", () => {
  const r = leggi([prompt(0, CONTESTO("a-uno")), prompt(5, "[Request interrupted by user]"), risposta(9, "m1", [1, 1, 0, 0])])
  expect(r.video.get("a-uno")).toBeUndefined()
  expect(r.senzaVideo).toMatchObject({ giri: 1, tempoMs: 4_000 })
})

test("i sottoagenti: i token e i video toccati vanno al giro che li ha lanciati, il tempo no (è già nel giro)", () => {
  const principale = new FileDiConversazione(false)
  ;[prompt(0, "indaga"), risposta(5, "m1", [1, 10, 0, 0], [strumento("Agent", { prompt: "x" }, "toolu_agente")]), risposta(100, "m2", [1, 10, 0, 0])].forEach((r) => principale.aggiungi(r, () => true))
  const agente = new FileDiConversazione(true)
  agente.sessione = "sessione"
  agente.idStrumento = "toolu_agente"
  ;[risposta(10, "a1", [4, 400, 9000, 1000], [strumento("Read", { file_path: "archivio/video/stampa-3d/piano.json" })]), risposta(60, "a2", [4, 100, 10000, 0])].forEach((r) => agente.aggiungi(r, () => true))
  const r = riepiloga(new Map([["sessione", principale]]), [agente])
  expect(r.video.get("stampa-3d")).toEqual({ tempoMs: 100_000, giri: 1, token: { scritti: 520, riletti: 19000, nuovi: 1010 }, dal: Date.parse(t(0)), al: Date.parse(t(100)) })
})

test("un sottoagente senza giro che lo abbia lanciato conta per i suoi strumenti, senza tempo", () => {
  const agente = new FileDiConversazione(true)
  agente.sessione = "sparita"
  ;[risposta(10, "a1", [1, 100, 0, 0], [strumento("Read", { file_path: "archivio/video/stampa-3d/piano.json" })])].forEach((r) => agente.aggiungi(r, () => true))
  const r = riepiloga(new Map(), [agente])
  expect(r.video.get("stampa-3d")).toMatchObject({ tempoMs: 0, giri: 0, token: { scritti: 100, riletti: 0, nuovi: 1 } })
})

test("la stessa richiesta scritta in due file si conta una volta sola", () => {
  const proprietari = new Map<string, string>()
  const reclama = (file: string) => (chiave: string) => {
    if (!proprietari.has(chiave)) proprietari.set(chiave, file)
    return proprietari.get(chiave) === file
  }
  const prima = new FileDiConversazione(false)
  const seconda = new FileDiConversazione(false)
  const righe = [prompt(0, CONTESTO("a-uno")), risposta(5, "m1", [1, 10, 0, 0])]
  righe.forEach((r) => prima.aggiungi(r, reclama("prima")))
  righe.forEach((r) => seconda.aggiungi(r, reclama("seconda")))
  expect(riepiloga(new Map([["p", prima], ["s", seconda]]), []).video.get("a-uno")?.token.scritti).toBe(10)
})

let ambienti: string[] = []
afterEach(async () => {
  await Promise.all(ambienti.map((c) => rm(c, { recursive: true, force: true })))
  ambienti = []
})

async function cartella(): Promise<string> {
  const c = await mkdtemp(join(tmpdir(), "consumi-prova-"))
  ambienti.push(c)
  return c
}

const SESSIONE = "11111111-1111-4111-8111-111111111111"

test("il proprietario legge tutto una volta, poi solo ciò che si aggiunge; una riga a metà aspetta il resto", async () => {
  const c = await cartella()
  await mkdir(join(c, SESSIONE, "subagents"), { recursive: true })
  const file = join(c, `${SESSIONE}.jsonl`)
  const prima = [prompt(0, CONTESTO("orto-balcone")), risposta(10, "m1", [1, 10, 100, 0])]
  await writeFile(file, `${prima.join("\n")}\n`)
  const consumi = new Consumi(c, { quietoMs: 30 }, () => undefined)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 10, giri: 1, token: { scritti: 10, riletti: 100, nuovi: 1 } })

  const seconda = risposta(25, "m2", [1, 5, 0, 0])
  await appendFile(file, seconda.slice(0, 40))
  await Bun.sleep(150)
  expect(consumi.vista().video["orto-balcone"]?.token.scritti).toBe(10)
  await appendFile(file, `${seconda.slice(40)}\n`)
  await aspetta(() => consumi.vista().video["orto-balcone"]?.token.scritti === 15)
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 25, token: { scritti: 15 } })
  await consumi.chiudi()
})

test("un sottoagente si lega al giro per l'id dello strumento scritto nel suo file di dati", async () => {
  const c = await cartella()
  const agenti = join(c, SESSIONE, "subagents")
  await mkdir(agenti, { recursive: true })
  await writeFile(join(c, `${SESSIONE}.jsonl`), `${[prompt(0, CONTESTO("orto-balcone")), risposta(5, "m1", [1, 10, 0, 0], [strumento("Agent", { prompt: "x" }, "toolu_ag")])].join("\n")}\n`)
  await writeFile(join(agenti, "agent-a1.meta.json"), JSON.stringify({ toolUseId: "toolu_ag" }))
  await writeFile(join(agenti, "agent-a1.jsonl"), `${risposta(20, "a1", [1, 1000, 0, 0])}\n`)
  const consumi = new Consumi(c, { quietoMs: 30 }, () => undefined)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().video["orto-balcone"]).toMatchObject({ tempo: 5, giri: 1, token: { scritti: 1010 } })
  await consumi.chiudi()
})

test("un file riscritto più corto si rilegge da capo; un file tolto sparisce dai conti", async () => {
  const c = await cartella()
  const file = join(c, `${SESSIONE}.jsonl`)
  const altro = join(c, "22222222-2222-4222-8222-222222222222.jsonl")
  await writeFile(file, `${[prompt(0, CONTESTO("orto-balcone")), risposta(10, "m1", [1, 10, 0, 0]), risposta(20, "m2", [1, 10, 0, 0])].join("\n")}\n`)
  await writeFile(altro, `${[prompt(0, CONTESTO("stampa-3d")), risposta(10, "m3", [1, 7, 0, 0])].join("\n")}\n`)
  const consumi = new Consumi(c, { quietoMs: 30 }, () => undefined)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista().video["orto-balcone"]?.token.scritti).toBe(20)
  await writeFile(file, `${[prompt(0, CONTESTO("orto-balcone")), risposta(10, "m9", [1, 4, 0, 0])].join("\n")}\n`)
  await aspetta(() => consumi.vista().video["orto-balcone"]?.token.scritti === 4)
  await rm(altro)
  await aspetta(() => consumi.vista().video["stampa-3d"] === undefined)
  await truncate(file, 0)
  await aspetta(() => consumi.vista().video["orto-balcone"] === undefined)
  await consumi.chiudi()
})

test("l'avviso arriva a prima lettura finita e a ogni cambio che sposta i conti, non per un file che non li cambia", async () => {
  const c = await cartella()
  const file = join(c, `${SESSIONE}.jsonl`)
  await writeFile(file, `${[prompt(0, CONTESTO("orto-balcone")), risposta(10, "m1", [1, 10, 0, 0])].join("\n")}\n`)
  let avvisi = 0
  const consumi = new Consumi(c, { quietoMs: 30 }, () => avvisi++)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(avvisi).toBe(1)
  await appendFile(file, `${JSON.stringify({ type: "last-prompt", sessionId: SESSIONE })}\n`)
  await Bun.sleep(250)
  expect(avvisi).toBe(1)
  await appendFile(file, `${risposta(30, "m2", [1, 10, 0, 0])}\n`)
  await aspetta(() => avvisi === 2)
  await consumi.chiudi()
})

test("senza cartella delle conversazioni i conti sono vuoti e pronti; quando la prima conversazione la crea, si contano", async () => {
  const c = await cartella()
  const progetto = join(c, "non-esiste-ancora")
  const consumi = new Consumi(progetto, { quietoMs: 30 }, () => undefined)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  expect(consumi.vista()).toEqual({ pronto: true, video: {}, senza_video: { tempo: 0, giri: 0, token: { scritti: 0, riletti: 0, nuovi: 0 } } })
  await mkdir(progetto, { recursive: true })
  await writeFile(join(progetto, `${SESSIONE}.jsonl`), `${[prompt(0, CONTESTO("orto-balcone")), risposta(10, "m1", [1, 10, 0, 0])].join("\n")}\n`)
  await aspetta(() => consumi.vista().video["orto-balcone"]?.token.scritti === 10)
  await consumi.chiudi()
})

test("una riga con le chiavi in un altro ordine si legge lo stesso", () => {
  const riordinata = JSON.stringify({ type: "assistant", timestamp: t(10), uuid: id(), parentUuid: "x", requestId: "req_r1", message: { id: "r1", role: "assistant", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })
  expect(leggi([prompt(0, CONTESTO("a-uno")), riordinata]).video.get("a-uno")?.token.scritti).toBe(7)
})

test("una richiesta ripetuta in una conversazione biforcata si conta nel file più vecchio, qualunque sia l'ordine dei nomi", async () => {
  const c = await cartella()
  const righe = [prompt(0, CONTESTO("orto-balcone")), risposta(10, "m1", [1, 10, 0, 0])]
  const vecchio = join(c, "ffffffff-ffff-4fff-8fff-ffffffffffff.jsonl")
  const nuovo = join(c, "00000000-0000-4000-8000-000000000000.jsonl")
  await writeFile(vecchio, `${righe.join("\n")}\n`)
  await Bun.sleep(50)
  await writeFile(nuovo, `${[...righe, prompt(20, CONTESTO("stampa-3d")), risposta(30, "m2", [1, 5, 0, 0])].join("\n")}\n`)
  const consumi = new Consumi(c, { quietoMs: 30 }, () => undefined)
  await consumi.avvia()
  await aspetta(() => consumi.vista().pronto)
  await rm(nuovo)
  // Tolta la copia, la richiesta resta contata: era del file più vecchio.
  await aspetta(() => consumi.vista().video["stampa-3d"] === undefined)
  expect(consumi.vista().video["orto-balcone"]?.token.scritti).toBe(10)
  await consumi.chiudi()
})

let ambiente: Ambiente | null = null
afterEach(async () => {
  await ambiente?.ferma()
  ambiente = null
})

test("GET /api/consumi risponde dalla memoria e annuncia sul canale degli eventi che i conti sono pronti", async () => {
  const c = await cartella()
  await writeFile(join(c, `${SESSIONE}.jsonl`), `${[prompt(0, CONTESTO("orto-balcone")), risposta(90, "m1", [1, 10, 100, 5])].join("\n")}\n`)
  ambiente = await avviaAmbiente({ consumi: { cartella: c, quietoMs: 30 } })
  const eventi = await ascolta(ambiente)
  const leggi = async () => {
    const risposta = await fetch(`${ambiente!.url}/api/consumi`, { headers: ambiente!.accesso })
    expect(risposta.status).toBe(200)
    return (await risposta.json()) as { pronto: boolean; video: Record<string, unknown> }
  }
  const corpo = await aspetta(async () => ((await leggi()).pronto ? await leggi() : null))
  expect(corpo.video["orto-balcone"]).toEqual({ tempo: 90, giri: 1, token: { scritti: 10, riletti: 100, nuovi: 6 }, dal: "2026-11-03T10:00:00.000Z", al: "2026-11-03T10:01:30.000Z" })
  await aspetta(() => eventi.messaggi.some((m) => m.tipo === "consumi"))
  eventi.chiudi()
})
