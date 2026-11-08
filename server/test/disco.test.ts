import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import * as fsp from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { rinomina } from "../src/disco"

const cartelle: string[] = []
const nuova = async (): Promise<string> => {
  const cartella = await mkdtemp(join(tmpdir(), "mango-disco-"))
  cartelle.push(cartella)
  return cartella
}

afterEach(async () => {
  for (const cartella of cartelle.splice(0)) await rm(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Una rinomina che, verso `destinazione` da un'altra cartella, fa come fra due dischi: EXDEV. */
function fraDueDischi(destinazione: string): { ripristina: () => void } {
  const vera = fsp.rename
  const spia = spyOn(fsp, "rename").mockImplementation(async (da, a) => {
    if (a === destinazione && dirname(String(da)) !== dirname(destinazione)) throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" })
    return vera(da, a)
  })
  return { ripristina: () => spia.mockRestore() }
}

describe("rinomina", () => {
  test("fra due dischi copia accanto alla destinazione, la mette a posto e toglie l'originale", async () => {
    const radice = await nuova()
    const da = join(radice, "arrivi", "file.attesa")
    const a = join(radice, "grezzo", "2026-10-24", "file.mov")
    await mkdir(join(radice, "arrivi"), { recursive: true })
    await mkdir(join(radice, "grezzo", "2026-10-24"), { recursive: true })
    const contenuto = Buffer.from("un video lungo ".repeat(5000))
    await writeFile(da, contenuto)

    const prova = fraDueDischi(a)
    try {
      await rinomina(da, a)
    } finally {
      prova.ripristina()
    }

    expect((await readFile(a)).equals(contenuto)).toBe(true)
    expect(await readdir(join(radice, "arrivi"))).toEqual([])
    expect(await readdir(join(radice, "grezzo", "2026-10-24"))).toEqual(["file.mov"])
  })

  test("se la copia non riesce l'originale resta e non resta niente a metà", async () => {
    const radice = await nuova()
    const da = join(radice, "non-c-e")
    const a = join(radice, "file.mov")
    const prova = fraDueDischi(a)
    try {
      await expect(rinomina(da, a)).rejects.toThrow()
    } finally {
      prova.ripristina()
    }
    expect(await readdir(radice)).toEqual([])
  })

  test("un errore diverso da EXDEV non cambia: si propaga", async () => {
    const radice = await nuova()
    await expect(rinomina(join(radice, "non-c-e"), join(radice, "altro"))).rejects.toThrow()
  })
})
