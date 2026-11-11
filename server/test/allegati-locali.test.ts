// Un file del computer (copiato in Esplora risorse) entra fra gli allegati della chat per percorso: il server lo copia, o lo collega se è grande.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { risolviAllegati } from "../src/chat/allegati"
import { avviaAmbiente, chiama, fermaTutti, sceltiDallApp } from "./aiuti"

afterEach(fermaTutti)

type Ambiente = Awaited<ReturnType<typeof avviaAmbiente>>

/** Il file l'ha scelto il creator (lo dice l'app) e poi la chat lo chiede. */
async function copia(a: Ambiente, percorso: unknown) {
  if (typeof percorso === "string" && isAbsolute(percorso)) await sceltiDallApp(a, [percorso])
  return chiama<{ percorso?: string; errore?: string }>(a, "POST", "/api/chat/allegati/locale", { percorso })
}

describe("POST /api/chat/allegati/locale", () => {
  test("copia il file fra gli allegati, col suo nome; uno già preso non si sovrascrive", async () => {
    const a = await avviaAmbiente()
    const fuori = join(a.radice, "fuori")
    await mkdir(fuori, { recursive: true })
    const file = join(fuori, "nota di prova.txt")
    await writeFile(file, "ciao dal documento")

    const r1 = await copia(a, file)
    expect(r1.stato).toBe(201)
    expect(r1.corpo).toEqual({ percorso: ".chat/allegati/nota di prova.txt" })
    expect(await readFile(join(a.archivio, ".chat", "allegati", "nota di prova.txt"), "utf-8")).toBe("ciao dal documento")
    expect((await copia(a, file)).corpo).toEqual({ percorso: ".chat/allegati/nota di prova-2.txt" })
    expect(await readFile(file, "utf-8")).toBe("ciao dal documento")
  })

  test("un percorso che non è completo, un file che non c'è e una cartella sono rifiutati con la frase", async () => {
    const a = await avviaAmbiente()
    const cartella = join(a.radice, "una-cartella")
    await mkdir(cartella, { recursive: true })

    for (const percorso of ["nota.txt", "..\\nota.txt", join(a.radice, "non-c-e.txt"), cartella]) {
      const r = await copia(a, percorso)
      expect(r.stato).toBe(400)
      expect(r.corpo.errore).toMatch(/«percorso» completo|non c'è/)
    }
    expect((await copia(a, 12)).stato).toBe(400)
    expect((await chiama(a, "POST", "/api/chat/allegati/locale", {})).stato).toBe(400)
    await writeFile(join(a.radice, "vuoto.txt"), "")
    const vuoto = await copia(a, join(a.radice, "vuoto.txt"))
    expect(vuoto.stato).toBe(400)
    expect(vuoto.corpo.errore).toContain("vuoto")
  })

  test("oltre il limite dei caricamenti il file si collega, senza copiarlo: lo stesso file sul disco", async () => {
    const a = await avviaAmbiente()
    const grande = join(a.radice, "grande.mov")
    await writeFile(grande, new Uint8Array(16 * 1024 ** 2 + 1).fill(7))
    const r = await copia(a, grande)
    expect(r.stato).toBe(201)
    expect(r.corpo).toEqual({ percorso: ".chat/allegati/grande.mov" })
    const collegato = await stat(join(a.archivio, ".chat", "allegati", "grande.mov"))
    expect(collegato.ino).toBe((await stat(grande)).ino)
    expect(collegato.nlink).toBe(2)
    expect(collegato.size).toBe(16 * 1024 ** 2 + 1)
    // Il collegamento vale come allegato del messaggio.
    expect(await risolviAllegati(a.archivio, [{ percorso: ".chat/allegati/grande.mov" }])).toMatchObject([{ percorso: ".chat/allegati/grande.mov", byte: 16 * 1024 ** 2 + 1 }])
  })

  test("un file che il creator non ha scelto con un gesto non si copia: la chiave delle API non basta, e un percorso vale una volta sola", async () => {
    const a = await avviaAmbiente()
    const file = join(a.radice, "segreto.txt")
    await writeFile(file, "x")
    const senza = await chiama<{ errore?: string }>(a, "POST", "/api/chat/allegati/locale", { percorso: file })
    expect(senza.stato).toBe(403)
    expect(senza.corpo.errore).toContain("non l'hai scelto")
    expect(await Bun.file(join(a.archivio, ".chat", "allegati", "segreto.txt")).exists()).toBe(false)

    expect((await copia(a, file)).stato).toBe(201)
    expect((await chiama(a, "POST", "/api/chat/allegati/locale", { percorso: file })).stato).toBe(403)
  })

  test("un corpo che non dichiara di essere JSON (come quello di una pagina di un altro sito) non copia", async () => {
    const a = await avviaAmbiente()
    const file = join(a.radice, "segreto.txt")
    await writeFile(file, "x")
    await sceltiDallApp(a, [file])
    const r = await fetch(`${a.url}/api/chat/allegati/locale`, { method: "POST", headers: { ...a.accesso, "Content-Type": "text/plain" }, body: JSON.stringify({ percorso: file }) })
    expect(r.status).toBe(400)
    expect((await Bun.file(join(a.archivio, ".chat", "allegati", "segreto.txt")).exists())).toBe(false)
  })
})
