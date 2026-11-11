import { afterEach, describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { avviaAmbiente, fermaTutti, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const chiaveDi = async (a: Ambiente): Promise<string> => (JSON.parse(await readFile(join(a.archivio, "arrivi", "chiave-api.json"), "utf-8")) as { chiave: string }).chiave
const con = (a: Ambiente, percorso: string, init: RequestInit = {}) => fetch(`${a.url}${percorso}`, { redirect: "manual", ...init })

describe("le API locali vogliono la chiave", () => {
  test("senza chiave ogni percorso è 401, API, file ed eventi compresi; la pagina dice come entrare", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    for (const [metodo, percorso] of [
      ["GET", "/api/video"],
      ["POST", "/api/video"],
      ["GET", "/api/eventi"],
      ["POST", "/api/chat"],
      ["GET", "/media/video/v/scheda.json"],
      ["GET", "/font/qualcosa.woff2"],
      ["GET", "/"],
    ] as const) {
      const r = await con(a, percorso, { method: metodo, headers: metodo === "POST" ? { "Content-Type": "application/json" } : {}, body: metodo === "POST" ? "{}" : undefined })
      expect([percorso, r.status]).toEqual([percorso, 401])
    }
    const json = await (await con(a, "/api/video")).json()
    expect((json as { errore: string }).errore).toContain("X-Chiave-Api")
    const pagina = await con(a, "/", { headers: { accept: "text/html" } })
    expect(pagina.headers.get("content-type")).toContain("text/html")
    expect(await pagina.text()).toContain("si apre dall&#39;app")
  })

  test("la chiave giusta passa nell'intestazione, come Bearer e nel cookie; una sbagliata no", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    const chiave = await chiaveDi(a)
    expect(chiave.length).toBeGreaterThanOrEqual(32)
    expect((await con(a, "/api/video", { headers: { "X-Chiave-Api": chiave } })).status).toBe(200)
    expect((await con(a, "/api/video", { headers: { Authorization: `Bearer ${chiave}` } })).status).toBe(200)
    expect((await con(a, "/api/video", { headers: { Cookie: `mango_api_${new URL(a.url).port}=${chiave}` } })).status).toBe(200)
    expect((await con(a, "/api/video", { headers: { "X-Chiave-Api": "non-la-giusta" } })).status).toBe(401)
    expect((await con(a, "/api/video", { headers: { Cookie: `mango_api_${new URL(a.url).port}=non-la-giusta` } })).status).toBe(401)
    // Il cookie di un altro server sullo stesso computer non vale per questo.
    expect((await con(a, "/api/video", { headers: { Cookie: `mango_api_1=${chiave}` } })).status).toBe(401)
  })

  test("/entra con la chiave giusta mette il cookie e rimanda allo studio; con una sbagliata no", async () => {
    const a = await avviaAmbiente()
    const chiave = await chiaveDi(a)
    const dentro = await con(a, `/entra?chiave=${encodeURIComponent(chiave)}`)
    expect(dentro.status).toBe(303)
    expect(dentro.headers.get("location")).toBe("/")
    const cookie = dentro.headers.get("set-cookie") ?? ""
    expect(cookie).toContain(`mango_api_${new URL(a.url).port}=${chiave}`)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect((await con(a, "/api/video", { headers: { Cookie: cookie.split(";")[0]! } })).status).toBe(200)

    const sbagliata = await con(a, "/entra?chiave=nonlagiusta")
    expect(sbagliata.status).toBe(401)
    expect(sbagliata.headers.get("set-cookie")).toBeNull()
    expect((await con(a, "/entra", { method: "POST" })).status).toBe(405)
  })

  test("/entra rimanda dove si chiede dentro il sito, mai a un altro indirizzo", async () => {
    const a = await avviaAmbiente()
    const chiave = encodeURIComponent(await chiaveDi(a))
    const dove = async (dopo: string): Promise<string | null> => (await con(a, `/entra?chiave=${chiave}&dopo=${encodeURIComponent(dopo)}`)).headers.get("location")
    expect(await dove("/media/video/v/uscite/finale.mp4")).toBe("/media/video/v/uscite/finale.mp4")
    expect(await dove("/#/video/v")).toBe("/#/video/v")
    for (const fuori of ["https://altro.example/", "//altro.example/", "/\\altro.example", "altro"]) expect(await dove(fuori)).toBe("/")
  })

  test("la chiave si fa una volta e resta quella dopo un riavvio", async () => {
    const a = await avviaAmbiente()
    const chiave = await chiaveDi(a)
    expect(a.server.chiaveApi).toBe(chiave)
    await a.server.ferma()
    const b = await avviaAmbiente({ lavoro: a.radice, archivio: a.archivio, stile: a.stile })
    expect(await chiaveDi(b)).toBe(chiave)
    expect(b.server.chiaveApi).toBe(chiave)
  })

  test("l'host e l'origine si controllano prima della chiave: un'altra pagina web è 403 anche con la chiave giusta", async () => {
    const a = await avviaAmbiente()
    const r = await con(a, "/api/video", { method: "POST", headers: { "X-Chiave-Api": await chiaveDi(a), Origin: "https://altro.example", "Content-Type": "application/json" }, body: "{}" })
    expect(r.status).toBe(403)
  })

  test("un'origine «null» o scritta male è 403, non un errore del server", async () => {
    const a = await avviaAmbiente()
    for (const origine of ["null", "non un indirizzo"]) {
      const r = await con(a, "/api/video", { method: "POST", headers: { "X-Chiave-Api": await chiaveDi(a), Origin: origine, "Content-Type": "application/json" }, body: "{}" })
      expect(r.status).toBe(403)
    }
  })
})
