import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { aspetta } from "./aiuti"

const vivo = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const cartelle: string[] = []
const pidDaFermare: number[] = []

afterEach(async () => {
  for (const pid of pidDaFermare.splice(0)) if (vivo(pid)) Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" })
  for (const cartella of cartelle.splice(0)) await rm(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Accende il processo di prova, aspetta il PID del nipote (il processo che il motore lancia), uccide il padre a forza (senza i suoi figli, come Gestione attività) e dà il PID del nipote. */
async function uccidiIlPadre(modo: string): Promise<number> {
  const cartella = await mkdtemp(join(tmpdir(), "mango-figli-"))
  cartelle.push(cartella)
  const file = join(cartella, "nipote.pid")
  const padre = Bun.spawn([process.execPath, join(import.meta.dir, "figli-prova.ts"), file, modo], { stdin: "ignore", stdout: "ignore", stderr: "inherit" })
  pidDaFermare.push(padre.pid)
  const nipote = Number(await aspetta(async () => (await readFile(file, "utf-8").catch(() => "")) || null, 15_000))
  pidDaFermare.push(nipote)
  expect(vivo(nipote)).toBe(true)
  Bun.spawnSync(["taskkill", "/PID", String(padre.pid), "/F"], { stdout: "ignore", stderr: "ignore" })
  await padre.exited
  return nipote
}

describe("il lavoro del motore non resta vivo se il server viene ucciso a forza", () => {
  test("senza il legame (com'era) il processo lanciato dal motore sopravvive al server: la prova è fatta per vedere questo", async () => {
    const nipote = await uccidiIlPadre("niente")
    await Bun.sleep(1000)
    expect(vivo(nipote)).toBe(true)
  }, 30_000)

  test("con il legame muore insieme al server, a qualunque profondità", async () => {
    const nipote = await uccidiIlPadre("lega")
    await aspetta(() => !vivo(nipote), 10_000)
    expect(vivo(nipote)).toBe(false)
  }, 30_000)
})
