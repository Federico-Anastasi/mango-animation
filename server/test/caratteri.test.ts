// «Aggiungi un carattere»: un file .ttf, .otf o .woff2 finisce in `font/` della cartella di lavoro del creator, col nome letto dal file,
// e da lì lo serve il server allo studio.
import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { nomeDelCarattere } from "../src/caratteri"
import { avviaAmbiente, chiama, fermaTutti } from "./aiuti"

afterEach(fermaTutti)

const REPO = join(import.meta.dir, "..", "..")
const TTF = readFileSync(join(REPO, "font", "Metropolis-Medium.ttf"))
const WOFF2 = readFileSync(join(REPO, "studio", "src", "assets", "fonts", "ChivoMono-400.woff2"))
const manda = (a: Awaited<ReturnType<typeof avviaAmbiente>>, nome: string, byte: Uint8Array, lingua: "it" | "en" = "it") =>
  chiama<{ file?: string; nome?: string; errore?: string }>(a, "POST", "/api/caratteri", { nome, dati: Buffer.from(byte).toString("base64") }, lingua)

describe("il nome di un carattere", () => {
  test("si legge dal file, anche in un .woff2", () => {
    expect(nomeDelCarattere(TTF)).toBe("Metropolis Medium")
    expect(nomeDelCarattere(WOFF2)).toBe("Chivo Mono Medium")
  })

  test("un file che non è un carattere non ha nome", () => {
    expect(nomeDelCarattere(new TextEncoder().encode("questo è un testo, non un carattere"))).toBeNull()
    expect(nomeDelCarattere(TTF.subarray(0, 200))).toBeNull()
    expect(nomeDelCarattere(new Uint8Array(0))).toBeNull()
  })
})

describe("la rotta dei caratteri", () => {
  test("l'elenco ha quelli del prodotto; uno aggiunto finisce nella cartella del creator e compare col suo nome", async () => {
    const a = await avviaAmbiente()
    const prima = await chiama<Array<{ file: string; nome: string; mio: boolean }>>(a, "GET", "/api/caratteri")
    expect(prima.corpo).toEqual([
      { file: "font/Archivo-700.ttf", nome: "Archivo SemiBold", mio: false },
      { file: "font/Metropolis-Medium.ttf", nome: "Metropolis Medium", mio: false },
    ])
    const aggiunto = await manda(a, "Chivo Mono.woff2", WOFF2)
    expect(aggiunto).toMatchObject({ stato: 200, corpo: { file: "font/Chivo_Mono.woff2", nome: "Chivo Mono Medium" } })
    expect(readFileSync(join(a.radice, "font", "Chivo_Mono.woff2"))).toEqual(WOFF2)
    const dopo = await chiama<Array<{ file: string; mio: boolean }>>(a, "GET", "/api/caratteri")
    expect(dopo.corpo.map((c) => [c.file, c.mio])).toEqual([["font/Archivo-700.ttf", false], ["font/Metropolis-Medium.ttf", false], ["font/Chivo_Mono.woff2", true]])
  })

  test("lo stesso file due volte non si ripete; un altro con lo stesso nome prende un numero; non si copre mai un carattere del prodotto", async () => {
    const a = await avviaAmbiente()
    expect((await manda(a, "mio.ttf", TTF)).corpo.file).toBe("font/mio.ttf")
    expect((await manda(a, "mio.ttf", TTF)).corpo.file).toBe("font/mio.ttf")
    expect((await manda(a, "mio.ttf", readFileSync(join(REPO, "font", "Archivo-700.ttf")))).corpo.file).toBe("font/mio-2.ttf")
    const delProdotto = await manda(a, "Archivo-700.ttf", TTF)
    expect(delProdotto.corpo.file).toBe("font/Archivo-700-2.ttf")
    expect(existsSync(join(a.radice, "font", "Archivo-700.ttf"))).toBe(false)
  })

  test("serve il file del creator, e quello del prodotto se il creator non ce l'ha", async () => {
    const a = await avviaAmbiente()
    await manda(a, "mio.ttf", TTF)
    const suo = await fetch(`${a.url}/font/mio.ttf`, { headers: a.accesso })
    expect(suo.status).toBe(200)
    expect(new Uint8Array(await suo.arrayBuffer())).toEqual(new Uint8Array(TTF))
    expect((await fetch(`${a.url}/font/Archivo-700.ttf`, { headers: a.accesso })).status).toBe(200)
    expect((await fetch(`${a.url}/font/non-c-e.ttf`, { headers: a.accesso })).status).toBe(404)
  })

  test("un file che non va dice perché, nelle due lingue, e non scrive niente", async () => {
    const a = await avviaAmbiente()
    const testo = await manda(a, "falso.ttf", new TextEncoder().encode("niente da vedere"))
    expect(testo.stato).toBe(400)
    expect(testo.corpo.errore).toContain("non è un carattere")
    expect((await manda(a, "falso.ttf", new TextEncoder().encode("nothing to see"), "en")).corpo.errore).toContain("not a font")
    const estensione = await manda(a, "mio.exe", TTF)
    expect(estensione).toMatchObject({ stato: 400 })
    expect(estensione.corpo.errore).toContain(".ttf")
    const grande = await manda(a, "grande.ttf", new Uint8Array(5 * 1024 ** 2 + 1))
    expect(grande.stato).toBe(413)
    expect(grande.corpo.errore).toContain("troppo grande")
    expect(existsSync(join(a.radice, "font"))).toBe(false)
    expect((await chiama(a, "POST", "/api/caratteri", { nome: "x.ttf" })).stato).toBe(400)
  })

  test("un nome con cartelle o simboli diventa un nome di file semplice", async () => {
    const a = await avviaAmbiente()
    expect((await manda(a, String.raw`C:\Users\Anna\Caratteri\Il mio: carattere?.TTF`, TTF)).corpo.file).toBe("font/Il_mio_carattere.ttf")
    expect((await manda(a, "../../fuori.ttf", TTF)).corpo.file).toBe("font/fuori.ttf")
  })
})
