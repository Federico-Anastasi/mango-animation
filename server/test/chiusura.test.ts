// La chiusura come la fa la console di Windows: un segnale vero (Ctrl+C o Ctrl+Interr) a un `bun run avvia`
// con un lavoro lungo in corso. `Subprocess.kill("SIGINT")` non vale: su Windows termina il processo senza
// far girare il gestore. Il segnale della console si manda a un gruppo di processi, quindi il server parte
// in un gruppo suo (CreateProcessW con CREATE_NEW_PROCESS_GROUP) e solo lui, il suo lavoro e i figli lo ricevono.
import { dlopen, FFIType, ptr } from "bun:ffi"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { aspetta, piano, scriviFintoMotore } from "./aiuti"

const k = dlopen("kernel32.dll", {
  CreateProcessW: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  GenerateConsoleCtrlEvent: { args: [FFIType.u32, FFIType.u32], returns: FFIType.i32 },
  WaitForSingleObject: { args: [FFIType.u64, FFIType.u32], returns: FFIType.u32 },
  GetExitCodeProcess: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  TerminateProcess: { args: [FFIType.u64, FFIType.u32], returns: FFIType.i32 },
  CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
})

const CREATE_NEW_PROCESS_GROUP = 0x200
const CREATE_UNICODE_ENVIRONMENT = 0x400
const utf16 = (testo: string): Buffer => Buffer.from(`${testo}\0`, "utf16le")

interface ProcessoWindows {
  pid: number
  handle: bigint
}

function avviaInUnGruppo(argomenti: string[], ambiente: Record<string, string>, cartella?: string): ProcessoWindows {
  const riga = utf16(argomenti.map((a) => `"${a}"`).join(" "))
  const blocco = Buffer.concat([...Object.entries({ ...process.env, ...ambiente }).map(([chiave, valore]) => utf16(`${chiave}=${valore}`)), Buffer.from("\0", "utf16le")])
  const startup = Buffer.alloc(104)
  startup.writeUInt32LE(104, 0)
  const info = Buffer.alloc(24)
  const dove = cartella ? utf16(cartella) : null
  if (!k.symbols.CreateProcessW(null, ptr(riga), null, null, 0, CREATE_NEW_PROCESS_GROUP | CREATE_UNICODE_ENVIRONMENT, ptr(blocco), dove ? ptr(dove) : null, ptr(startup), ptr(info))) throw new Error("CreateProcessW non è riuscito")
  return { handle: info.readBigUInt64LE(0), pid: info.readUInt32LE(16) }
}

const finito = (p: ProcessoWindows, ms: number): boolean => k.symbols.WaitForSingleObject(p.handle, ms) === 0
const codiceDiUscita = (p: ProcessoWindows): number => {
  const fuori = Buffer.alloc(4)
  k.symbols.GetExitCodeProcess(p.handle, ptr(fuori))
  return fuori.readUInt32LE(0)
}
const èVivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
async function portaLibera(): Promise<number> {
  const s = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") })
  const porta = s.port!
  await s.stop(true)
  return porta
}

const lanciati: ProcessoWindows[] = []
const cartelle: string[] = []
afterEach(async () => {
  for (const p of lanciati.splice(0)) {
    if (!finito(p, 0)) k.symbols.TerminateProcess(p.handle, 1)
    k.symbols.CloseHandle(p.handle)
  }
  for (const c of cartelle.splice(0)) await rm(c, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

describe.each([
  ["Ctrl+C", 0, false],
  ["Ctrl+Interr", 1, false],
  ["Ctrl+Interr a `bun run avvia`", 1, true],
] as const)("la chiusura con %s", (_nome, evento, conBunRun) => {
  test(`ferma il lavoro in corso per PID, con i suoi figli, ${conBunRun ? "" : "scrive l'esito "}e libera le porte`, async () => {
    const radice = await mkdtemp(join(tmpdir(), "mango-animation-chiusura-"))
    cartelle.push(radice)
    const archivio = join(radice, "archivio")
    await scriviFintoMotore(radice)
    await mkdir(join(archivio, "grezzo", "2026-10-06"), { recursive: true })
    await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4"), "x")
    await writeFile(join(archivio, "grezzo", "2026-10-06", "a.mp4.scheda.json"), JSON.stringify({ tipo: "ripresa", origine: "telefono" }))
    await mkdir(join(archivio, "video", "v"), { recursive: true })
    await writeFile(join(archivio, "video", "v", "scheda.json"), JSON.stringify({ titolo: "v", stato: "proposta", creato: "2026-10-06" }))
    await writeFile(join(archivio, "video", "v", "piano.json"), JSON.stringify(piano()))
    // Col risolto al passo il server non ne rifà uno all'avvio: l'unico lavoro è il montaggio.
    await mkdir(join(archivio, "video", "v", "lavoro"), { recursive: true })
    await writeFile(join(archivio, "video", "v", "lavoro", "risolto.json"), JSON.stringify({ durata: 12.5 }))

    const [porta, portaArrivi] = [await portaLibera(), await portaLibera()]
    // `bun run avvia` non passa dal programma che riabilita Ctrl+C: nel gruppo nuovo resta solo Ctrl+Interr.
    const comando = conBunRun ? [process.execPath, "run", "avvia"] : [process.execPath, join(import.meta.dir, "avviaConLaConsole.ts")]
    const server = avviaInUnGruppo(
      comando,
      {
      MANGO_ANIMATION_LAVORO: radice,
      MANGO_ANIMATION_PORTA: String(porta),
      MANGO_ANIMATION_PORTA_ARRIVI: String(portaArrivi),
      MANGO_ANIMATION_PYTHON: "python",
      MANGO_ANIMATION_MODULO: "finto_motore",
      PYTHONPATH: join(radice, "finto"),
      FINTO_IGNORA_CTRL_C: "1",
      },
      join(import.meta.dir, ".."),
    )
    lanciati.push(server)

    const url = `http://127.0.0.1:${porta}`
    const chiave = (JSON.parse(await aspetta(() => readFile(join(archivio, "arrivi", "chiave-api.json"), "utf-8").catch(() => ""), 20_000)) as { chiave: string }).chiave
    const accesso = { "X-Chiave-Api": chiave }
    await aspetta(async () => (await fetch(`${url}/api/video`, { headers: accesso }).catch(() => null))?.ok, 20_000)
    const messo = await fetch(`${url}/api/video/v/lavori`, { method: "POST", headers: { ...accesso, "Content-Type": "application/json" }, body: JSON.stringify({ comando: "monta" }) })
    expect(messo.status).toBe(202)
    const lavoro = Number(await aspetta(() => readFile(join(radice, "pid-v"), "utf-8").catch(() => ""), 15_000))
    const figlio = Number(await aspetta(() => readFile(join(radice, "figlio-v"), "utf-8").catch(() => ""), 15_000))
    expect(èVivo(lavoro) && èVivo(figlio)).toBe(true)

    expect(k.symbols.GenerateConsoleCtrlEvent(evento, server.pid)).toBe(1)
    // Con `bun run` il programma che si vede muore subito per il segnale (codice di uscita di Ctrl+C) e il server vero
    // chiude per conto suo: si guarda cosa resta, non l'uscita.
    expect(finito(server, 20_000)).toBe(true)
    if (!conBunRun) expect(codiceDiUscita(server)).toBe(0)

    const registro = join(archivio, "lavori.jsonl")
    const righeDelRegistro = async (): Promise<string[]> => (await readFile(registro, "utf-8").catch(() => "")).trim().split("\n").filter(Boolean)
    const lette = async (): Promise<{ comando: string; esito: string }[]> => (await righeDelRegistro()).map((r) => JSON.parse(r) as { comando: string; esito: string })
    if (conBunRun) {
      // `bun run`, morendo, può portarsi via il server prima che scriva l'esito: allora lo scrive il prossimo avvio (coda.test.ts,
      // «se il server muore senza chiudere»). Qui si guarda che il lavoro e i figli siano fermi e che nel registro non ci sia altro.
      await aspetta(() => !èVivo(lavoro) && !èVivo(figlio), 20_000)
      const [inCorso, ...dopo] = await lette()
      expect(inCorso).toMatchObject({ comando: "monta", esito: "in corso" })
      expect(dopo).toMatchObject(dopo.length > 0 ? [{ comando: "monta", esito: "interrotto" }] : [])
    } else {
      expect(await aspetta(async () => ((await righeDelRegistro()).length >= 2 ? await lette() : null), 20_000)).toMatchObject([{ comando: "monta", esito: "in corso" }, { comando: "monta", esito: "interrotto" }])
      await aspetta(() => !èVivo(lavoro) && !èVivo(figlio))
    }
    for (const p of [porta, portaArrivi]) {
      const libera = await aspetta(() => {
        try {
          return Bun.serve({ port: p, hostname: "0.0.0.0", fetch: () => new Response("") })
        } catch {
          return null
        }
      })
      await libera.stop(true)
    }
  }, 60_000)
})

describe("senza segnale della console", () => {
  test("Subprocess.kill(SIGINT) su Windows non fa girare il gestore: per questo la prova manda il segnale vero", async () => {
    const radice = await mkdtemp(join(tmpdir(), "mango-animation-segnale-"))
    cartelle.push(radice)
    const sentinella = join(radice, "gestore.txt")
    await writeFile(join(radice, "figlio.ts"), `import { writeFileSync } from "node:fs"\nprocess.on("SIGINT", () => { writeFileSync(${JSON.stringify(sentinella)}, "gestore") })\nwriteFileSync(${JSON.stringify(join(radice, "pronto.txt"))}, "")\nsetInterval(() => {}, 1000)\n`)
    const figlio = Bun.spawn([process.execPath, join(radice, "figlio.ts")], { stdout: "ignore", stderr: "ignore", stdin: "ignore" })
    await aspetta(() => Bun.file(join(radice, "pronto.txt")).exists())
    figlio.kill("SIGINT")
    await figlio.exited
    expect(await Bun.file(sentinella).exists()).toBe(false)
  })
})
