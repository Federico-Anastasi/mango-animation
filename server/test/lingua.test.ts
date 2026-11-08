import { afterEach, describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { frase, linguaDi, linguaInUso, nellaLingua } from "../src/lingua"
import { aspetta, avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

describe("le frasi nelle due lingue", () => {
  test("una frase in JSON esce nella lingua della richiesta in corso, e in italiano fuori da una richiesta", () => {
    const f = frase("Manca il titolo.", "The title is missing.")
    expect(JSON.stringify({ f })).toBe('{"f":"Manca il titolo."}')
    expect(nellaLingua("en", () => JSON.stringify({ f, lista: [f] }))).toBe('{"f":"The title is missing.","lista":["The title is missing."]}')
    expect(String(f)).toBe("Manca il titolo.")
  })

  test("due richieste insieme non si scambiano la lingua", async () => {
    const f = frase("uno", "one")
    const risultati = await Promise.all(
      (["en", "it", "en", "it"] as const).map((l) =>
        nellaLingua(l, async () => {
          await Bun.sleep(l === "en" ? 20 : 5)
          return `${linguaInUso()}:${JSON.stringify(f)}`
        }),
      ),
    )
    expect(risultati).toEqual(['en:"one"', 'it:"uno"', 'en:"one"', 'it:"uno"'])
  })

  test("la lingua viene dall'intestazione X-Lingua; senza o con altro, italiano", () => {
    const con = (valore: string | null): Request => new Request("http://127.0.0.1/", { headers: valore === null ? {} : { "X-Lingua": valore } })
    expect(linguaDi(con("en"))).toBe("en")
    expect(linguaDi(con(" EN "))).toBe("en")
    expect(linguaDi(con("it"))).toBe("it")
    expect(linguaDi(con("fr"))).toBe("it")
    expect(linguaDi(con(null))).toBe("it")
  })
})

describe("gli errori delle rotte", () => {
  test("lo stesso errore in italiano di base e in inglese se lo studio lo chiede", async () => {
    const a = await avviaAmbiente()
    const it = await chiama<{ errore: string }>(a, "GET", "/api/video/non-c-e")
    const en = await chiama<{ errore: string }>(a, "GET", "/api/video/non-c-e", undefined, "en")
    expect(it.stato).toBe(404)
    expect(en.stato).toBe(404)
    expect(it.corpo.errore).toBe("Non c'è un video «non-c-e» con una scheda valida: la sua scheda va sistemata.")
    expect(en.corpo.errore).toBe("There is no video «non-c-e» with a valid card: its card needs fixing.")
  })

  test("anche una rotta che non c'è e un metodo non ammesso", async () => {
    const a = await avviaAmbiente()
    expect((await chiama<{ errore: string }>(a, "GET", "/api/non-esiste", undefined, "en")).corpo.errore).toMatch(/^This route does not exist/)
    expect((await chiama<{ errore: string }>(a, "DELETE", "/api/stile", undefined, "en")).corpo.errore).toBe("This method is not allowed here.")
    expect((await chiama<{ errore: string }>(a, "DELETE", "/api/stile")).corpo.errore).toBe("Metodo non ammesso qui.")
  })

  test("il corpo senza l'intestazione JSON, nelle due lingue", async () => {
    const a = await avviaAmbiente()
    const r = await chiama<{ errore: string }>(a, "POST", "/api/video", undefined, "en")
    expect(r.stato).toBe(400)
    expect(r.corpo.errore).toBe("Send the body as JSON, with the header Content-Type: application/json.")
  })
})

describe("i lavori", () => {
  const lavoroFallito = async (lingua?: "it" | "en") => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    expect((await chiama(a, "POST", "/api/video/v/lavori", { comando: "prepara" }, lingua)).stato).toBe(202)
    const finiti = await aspetta(async () => {
      const f = (await chiama<{ finiti: { comando: string; errore: string | null }[] }>(a, "GET", "/api/lavori")).corpo.finiti
      return f.find((l) => l.comando === "prepara")
    })
    return finiti.errore
  }

  test("il motore parte nella lingua di chi ha chiesto il lavoro, e l'errore che mostra è in quella", async () => {
    expect(await lavoroFallito("en")).toBe("The file prova.mp4 is missing: copy it into archivio/grezzo/ and try again.")
  })

  test("senza lingua il lavoro resta in italiano", async () => {
    expect(await lavoroFallito()).toBe("Manca il file prova.mp4: copialo in archivio/grezzo/ e riprova.")
  })

  test("un lavoro che parte da solo parla la lingua che lo studio ha usato per ultima; chi non la dice non la cambia", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    await writeFile(join(a.radice, "risolvi-rotto"), "")
    const errori = async () => (await chiama<{ finiti: { comando: string; errore: string | null }[] }>(a, "GET", "/api/lavori")).corpo.finiti.filter((l) => l.comando === "risolvi").map((l) => l.errore)
    const cambiaIlPiano = async (coda: number) => {
      const prima = (await errori()).length
      await writeFile(join(a.archivio, "video", "v", "piano.json"), JSON.stringify({ ...piano(), coda }))
      return aspetta(async () => ((await errori()).length > prima ? (await errori())[0] : null))
    }

    await chiama(a, "GET", "/api/video", undefined, "en")
    expect(await cambiaIlPiano(1)).toBe("The plan does not resolve: fix it and try again.")
    await chiama(a, "GET", "/api/video")
    expect(await cambiaIlPiano(2)).toBe("The plan does not resolve: fix it and try again.")
    await chiama(a, "GET", "/api/video", undefined, "it")
    expect(await cambiaIlPiano(3)).toBe("Il piano non si risolve: correggilo e riprova.")
  })
})
