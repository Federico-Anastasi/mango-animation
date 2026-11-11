// Il prestito delle schede contro un Mango Code finto: `service.json` e il gestore del motore con `GET /engine`, `release`, `resume`.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ErroreConFrase } from "../src/lingua"
import { prestitoDaMangoCode } from "../src/schede"

const cartelle: string[] = []
const serverFinti: { stop: (subito?: boolean) => void }[] = []
afterEach(async () => {
  serverFinti.splice(0).forEach((s) => s.stop(true))
  await Promise.all(cartelle.splice(0).map((c) => rm(c, { recursive: true, force: true })))
})

async function prepara(motore: { phase: string; gpus: number[]; released?: number[] }, liberaRisponde = 200, riaccendiRisponde: number[] = [200], riaccendiMs = 0, liberaSpegne = liberaRisponde === 200) {
  const dati = await mkdtemp(join(tmpdir(), "schede-"))
  cartelle.push(dati)
  const chiamate: { percorso: string; corpo: unknown }[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const u = new URL(req.url)
      const testo = req.method === "POST" ? await req.text() : ""
      chiamate.push({ percorso: u.pathname, corpo: testo ? (JSON.parse(testo) as unknown) : null })
      if (u.pathname === "/global/health") return Response.json({ healthy: true })
      if (u.pathname === "/engine") return Response.json({ phase: motore.phase, name: "Qwen 3.6", gpus: motore.gpus.map((index) => ({ index })), released_gpus: motore.released ?? [], all_released: false })
      if (u.pathname === "/engine/release") {
        // Come il gestore vero quando la risposta si perde: il modello si spegne lo stesso.
        if (liberaSpegne) Object.assign(motore, { phase: "released", released: motore.gpus, gpus: [] })
        return new Response(liberaRisponde === 200 ? "{}" : "occupato", { status: liberaRisponde })
      }
      if (u.pathname === "/engine/resume") {
        await Bun.sleep(riaccendiMs)
        const stato = riaccendiRisponde.shift() ?? 200
        if (stato === 200 && motore.phase === "released") Object.assign(motore, { phase: "running", gpus: motore.released ?? [], released: [] })
        return new Response(stato === 200 ? JSON.stringify({ phase: "running" }) : "non riparte", { status: stato })
      }
      return new Response("non c'è", { status: 404 })
    },
  })
  serverFinti.push(server)
  const url = `http://127.0.0.1:${server.port}`
  await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, agent: url, engine: url, window: false }))
  return { dati, chiamate, prestito: prestitoDaMangoCode(dati) }
}

const del = (chiamate: { percorso: string; corpo: unknown }[]) => chiamate.filter((c) => c.percorso.startsWith("/engine/"))

describe("il prestito delle schede", () => {
  test("se il modello tiene la scheda del profilo la libera, e alla fine la rende", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0, 1, 2] })
    const liberata = await prestito.prendi(1)
    expect(String(liberata)).toMatch(/^Ho liberato la scheda 1 da Qwen 3\.6 di Mango Code \(\d+\.\d s\)/)
    expect(liberata?.en).toMatch(/^Freed video card 1 from Qwen 3\.6 in Mango Code \(\d+\.\d s\): it comes back on when the jobs on the card are finished\.$/)
    expect(await prestito.rendi()).toMatch(/^Il modello di Mango Code è di nuovo acceso/)
    expect(del(chiamate)).toEqual([
      { percorso: "/engine/release", corpo: { gpus: [1] } },
      { percorso: "/engine/resume", corpo: {} },
    ])
    expect(await prestito.rendi()).toBeNull()
  })

  test("se libera fallisce ma il modello si è spento lo stesso, la scheda è presa e alla fine si rende", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] }, 500, [200], 0, true)
    expect(String(await prestito.prendi(0))).toMatch(/^Ho liberato la scheda 0/)
    await prestito.rendi()
    expect(del(chiamate).map((c) => c.percorso)).toEqual(["/engine/release", "/engine/resume"])
  })

  test("una riaccensione fallita si riprova alla volta dopo", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] }, 200, [503, 200])
    await prestito.prendi(0)
    await expect(prestito.rendi()).rejects.toThrow("503")
    expect(await prestito.rendi()).toMatch(/di nuovo acceso/)
    expect(del(chiamate).map((c) => c.percorso)).toEqual(["/engine/release", "/engine/resume", "/engine/resume"])
  })

  test("un lavoro che arriva mentre il modello si riaccende aspetta la fine della riaccensione", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] }, 200, [200], 300)
    await prestito.prendi(0)
    const resa = prestito.rendi()
    await prestito.prendi(0)
    await resa
    expect(del(chiamate).map((c) => c.percorso)).toEqual(["/engine/release", "/engine/resume", "/engine/release"])
  })

  test("una scheda liberata a mano da Mango Code non la riaccende il server", async () => {
    const { chiamate, prestito } = await prepara({ phase: "released", gpus: [], released: [0] })
    expect(await prestito.prendi(0)).toBeNull()
    expect(await prestito.rendi()).toBeNull()
    expect(del(chiamate)).toEqual([])
  })

  test("un secondo lavoro sulla stessa scheda la trova già libera: non la chiede di nuovo, e alla fine si rende una volta sola", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] })
    await prestito.prendi(0)
    expect(String(await prestito.prendi(0))).toMatch(/era già libera/)
    await prestito.rendi()
    expect(del(chiamate).map((c) => c.percorso)).toEqual(["/engine/release", "/engine/resume"])
  })

  test("un corpo che il gestore rifiuta (400) non presta niente: è un errore, non «tutte le schede», e non c'è niente da rendere", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] }, 400)
    await expect(prestito.prendi(0)).rejects.toThrow("400")
    expect(del(chiamate)).toEqual([{ percorso: "/engine/release", corpo: { gpus: [0] } }])
    expect(await prestito.rendi()).toBeNull()
  })

  test("senza scheda nel profilo le libera tutte", async () => {
    const { chiamate, prestito } = await prepara({ phase: "running", gpus: [0] })
    await prestito.prendi(undefined)
    expect(del(chiamate)).toEqual([{ percorso: "/engine/release", corpo: {} }])
  })

  test("non tocca niente se il modello è spento, se tiene altre schede o se il lavoro va sul processore", async () => {
    const spento = await prepara({ phase: "stopped", gpus: [] })
    expect(await spento.prestito.prendi(0)).toBeNull()
    const altre = await prepara({ phase: "running", gpus: [0, 2] })
    expect(await altre.prestito.prendi(1)).toBeNull()
    expect(await altre.prestito.prendi(null)).toBeNull()
    expect(del([...spento.chiamate, ...altre.chiamate])).toEqual([])
    expect(await altre.prestito.rendi()).toBeNull()
  })

  test("un Mango Code acceso ma non pronto (`reason` e niente `agent`) non ha schede da prestare", async () => {
    const dati = await mkdtemp(join(tmpdir(), "schede-"))
    cartelle.push(dati)
    await Bun.write(join(dati, "service.json"), JSON.stringify({ version: 1, pid: process.pid, reason: "Il modello non è ancora stato scelto." }))
    expect(await prestitoDaMangoCode(dati).prendi(0)).toBeNull()
  })

  test("senza Mango Code acceso non fa niente", async () => {
    const dati = await mkdtemp(join(tmpdir(), "schede-"))
    cartelle.push(dati)
    expect(await prestitoDaMangoCode(dati).prendi(0)).toBeNull()
  })

  test("se il gestore non libera la scheda, l'errore dice cosa fare", async () => {
    const { prestito } = await prepara({ phase: "running", gpus: [0] }, 500)
    await expect(prestito.prendi(0)).rejects.toThrow("Il modello di Mango Code tiene la scheda video e non la lascia")
    const errore = await prestito.prendi(0).catch((e: unknown) => e)
    expect((errore as ErroreConFrase).testo).toMatchObject({ en: expect.stringMatching(/^The Mango Code model is holding the video card and will not let go: the Mango Code engine manager answered 500: .*Stop it from Mango Code and run the job again\.$/) })
  })
})

test("le prove e i processi che lanciano non vedono il Mango Code del computer: la sua cartella dei dati è una finta", () => {
  const dati = process.env["MANGO_DATA"] ?? ""
  expect(dati.startsWith(tmpdir())).toBe(true)
  expect(dati).not.toBe(join(process.env["LOCALAPPDATA"] ?? "", "MangoCode"))
})
