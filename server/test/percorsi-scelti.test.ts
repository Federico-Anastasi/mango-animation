// I file che il creator sceglie con un gesto (rilascio sulla finestra dell'app, file copiati in Esplora risorse): solo l'app, che li vede, può dire al server quali sono.
import { afterEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { PercorsiScelti } from "../src/arrivi/percorsiScelti"
import { avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

describe("PercorsiScelti", () => {
  test("con la chiave dell'app un percorso si registra e vale una volta sola", () => {
    const scelti = new PercorsiScelti("chiave-dell-app")
    expect(scelti.registra("chiave-dell-app", ["C:\\Video\\Giro.MOV"])).toBe(true)
    expect(scelti.prendi("c:\\video\\giro.mov")).toBe(true)
    expect(scelti.prendi("C:\\Video\\Giro.MOV")).toBe(false)
  })

  test("senza la chiave giusta non si registra niente", () => {
    const scelti = new PercorsiScelti("chiave-dell-app")
    for (const chiave of [null, "", "un'altra"]) expect(scelti.registra(chiave, ["C:\\Video\\a.mov"])).toBe(false)
    expect(scelti.prendi("C:\\Video\\a.mov")).toBe(false)
  })

  test("un percorso non scelto non passa, e uno scelto da tempo scade", () => {
    let ora = 1_000
    const scelti = new PercorsiScelti("k", () => ora)
    scelti.registra("k", ["C:\\Video\\a.mov"])
    expect(scelti.prendi("C:\\Video\\b.mov")).toBe(false)
    ora += 11 * 60_000
    expect(scelti.prendi("C:\\Video\\a.mov")).toBe(false)
  })
})

describe("POST /api/app/percorsi", () => {
  test("registra solo se porta la chiave dell'app, scritta in arrivi/chiave-app.json; la chiave delle API non basta", async () => {
    const a = await avviaAmbiente()
    const chiaveApp = (JSON.parse(await readFile(join(a.archivio, "arrivi", "chiave-app.json"), "utf-8")) as { chiave: string }).chiave
    const manda = (intestazioni: Record<string, string>, percorsi: unknown) =>
      fetch(`${a.url}/api/app/percorsi`, { method: "POST", headers: { ...a.accesso, "Content-Type": "application/json", ...intestazioni }, body: JSON.stringify({ percorsi }) })

    expect((await manda({}, [join(a.radice, "x.mov")])).status).toBe(403)
    expect((await manda({ "X-Chiave-App": "sbagliata" }, [join(a.radice, "x.mov")])).status).toBe(403)
    expect((await manda({ "X-Chiave-App": chiaveApp }, "x.mov")).status).toBe(400)
    expect((await manda({ "X-Chiave-App": chiaveApp }, ["x.mov"])).status).toBe(400)
    expect((await manda({ "X-Chiave-App": chiaveApp }, [join(a.radice, "x.mov")])).status).toBe(200)
    expect((await chiama(a, "POST", "/api/app/percorsi", { percorsi: [] })).stato).toBe(403)
  })
})
