import { afterEach, describe, expect, test } from "bun:test"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Opzioni } from "../src/configurazione"
import { ascolta, aspetta, avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

// Fa da ffmpeg: scrive qualche byte nell'ultimo argomento, annota gli argomenti, e chiude quando legge «q».
const FINTO_FFMPEG = `import { appendFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const args = process.argv.slice(2)
appendFileSync(join(import.meta.dir, "ffmpeg.log"), JSON.stringify(args) + "\\n")
if (args.some((a) => a.includes("Rotto"))) {
  console.error("Could not find audio only device with name [Rotto]")
  process.exit(1)
}
writeFileSync(args[args.length - 1], "video")
for await (const pezzo of process.stdin) if (new TextDecoder().decode(pezzo).includes("q")) break
`

interface Stato {
  disponibile: boolean
  motivo: string | null
  dispositivi: { microfoni: string[]; camere: string[] } | null
  in_corso: { modo: string; iniziata: string; file: string[] } | null
  ultima: { file: string[]; finita: string; errore: string | null } | null
}

async function ambiente(dispositivi = { microfoni: ["Microfono di prova"], camere: ["OBS Virtual Camera", "Camera di prova"] }, senzaFfmpeg = false): Promise<{ a: Ambiente; righe: () => Promise<string[][]> }> {
  let registro = ""
  // Il comando si sa solo quando la cartella della prova esiste: lo scrive `semina`, prima che il server parta.
  const registrazione: Opzioni["registrazione"] = {
    comando: null,
    schermo: ["-i", "schermo"],
    codifica: (profilo) => {
      const scheda = (profilo["macchina"] as { scheda_registrazione?: unknown } | undefined)?.scheda_registrazione
      return ["-c:v", "finto", ...(typeof scheda === "number" ? ["-gpu", String(scheda)] : [])]
    },
    elenca: async () => dispositivi,
  }
  const a = await avviaAmbiente({ registrazione }, async (c) => {
    registro = join(c.radice, "ffmpeg.log")
    await writeFile(join(c.radice, "finto-ffmpeg.ts"), FINTO_FFMPEG)
    if (!senzaFfmpeg) registrazione.comando = [process.execPath, join(c.radice, "finto-ffmpeg.ts")]
  })
  await aspetta(async () => senzaFfmpeg || (await chiama<Stato>(a, "GET", "/api/registrazione")).corpo.dispositivi !== null)
  return { a, righe: async () => (await readFile(registro, "utf-8").catch(() => "")).split("\n").filter(Boolean).map((r) => JSON.parse(r) as string[]) }
}

describe("la registrazione", () => {
  test("schermo e voce: un file nel girato di oggi, con la scheda, annunciato; fermandola prende le misure", async () => {
    const { a, righe } = await ambiente()
    const eventi = await ascolta(a)
    const avvio = await chiama<Stato>(a, "POST", "/api/registrazione", { modo: "voce" })
    expect(avvio.stato).toBe(201)
    const file = avvio.corpo.in_corso!.file
    expect(file).toHaveLength(1)
    expect(file[0]).toMatch(/^\d{4}-\d{2}-\d{2}\/\d{8}-\d{6}-schermo\.mp4$/)
    const [argomenti] = await aspetta(async () => ((await righe()).length > 0 ? await righe() : null))
    expect(argomenti).toContain("audio=Microfono di prova")
    expect(argomenti!.join(" ")).toContain("-i schermo")
    expect(argomenti!.join(" ")).toContain("-c:v finto")
    expect(argomenti!.join(" ")).toContain("-movflags +frag_keyframe+empty_moov+default_base_moof")
    const scheda = JSON.parse(await readFile(join(a.archivio, "grezzo", `${file[0]}.scheda.json`), "utf-8")) as Record<string, unknown>
    expect(scheda).toMatchObject({ tipo: "schermo", origine: "registrazione" })

    expect((await chiama(a, "POST", "/api/registrazione", { modo: "schermo" })).stato).toBe(409)

    const fine = await chiama<Stato>(a, "DELETE", "/api/registrazione")
    expect(fine.stato).toBe(200)
    expect(fine.corpo.in_corso).toBeNull()
    expect(fine.corpo.ultima).toMatchObject({ file, errore: null })
    expect(await readFile(join(a.archivio, "grezzo", file[0]!), "utf-8")).toBe("video")
    await aspetta(() => eventi.messaggi.filter((m) => m.tipo === "registrazione").length >= 2)
    eventi.chiudi()
  })

  test("due richieste di avvio insieme: parte una registrazione sola, l'altra riceve 409", async () => {
    const { a, righe } = await ambiente()
    const risposte = await Promise.all([chiama<Stato>(a, "POST", "/api/registrazione", { modo: "schermo" }), chiama<Stato>(a, "POST", "/api/registrazione", { modo: "schermo" })])
    expect(risposte.map((r) => r.stato).sort()).toEqual([201, 409])
    await aspetta(async () => ((await righe()).length > 0 ? true : null))
    await Bun.sleep(300)
    expect(await righe()).toHaveLength(1)
    expect((await chiama(a, "DELETE", "/api/registrazione")).stato).toBe(200)
  })

  test("la scheda di codifica segue il profilo del creator anche se cambia mentre il server gira", async () => {
    const { a, righe } = await ambiente()
    const registra = async (): Promise<string[]> => {
      const prima = (await righe()).length
      expect((await chiama(a, "POST", "/api/registrazione", { modo: "schermo" })).stato).toBe(201)
      const lanci = await aspetta(async () => ((await righe()).length > prima ? await righe() : null))
      expect((await chiama(a, "DELETE", "/api/registrazione")).stato).toBe(200)
      return lanci.at(-1)!
    }
    expect(await registra()).not.toContain("-gpu")
    await writeFile(join(a.radice, "profilo.json"), JSON.stringify({ macchina: { scheda_registrazione: 3 } }))
    await aspetta(() => a.server.indice.profilo.testo !== null)
    const argomenti = await registra()
    expect(argomenti[argomenti.indexOf("-gpu") + 1]).toBe("3")
  })

  test("col viso i file sono due e la camera scelta non è quella virtuale; solo schermo non apre il microfono", async () => {
    const { a, righe } = await ambiente()
    const avvio = await chiama<Stato>(a, "POST", "/api/registrazione", { modo: "viso" })
    expect(avvio.corpo.in_corso!.file.map((f) => f.replace(/^.*-/, ""))).toEqual(["schermo.mp4", "viso.mp4"])
    const lanci = await aspetta(async () => ((await righe()).length >= 2 ? await righe() : null))
    expect(lanci.some((l) => l.includes("video=Camera di prova"))).toBe(true)
    await chiama(a, "DELETE", "/api/registrazione")

    await chiama(a, "POST", "/api/registrazione", { modo: "schermo" })
    const terzo = (await aspetta(async () => ((await righe()).length >= 3 ? await righe() : null)))[2]!
    expect(terzo.some((x) => x.startsWith("audio="))).toBe(false)
    expect(terzo).toContain("-an")
    await chiama(a, "DELETE", "/api/registrazione")
  })

  test("il microfono e la webcam scelti fra quelli trovati sono quelli che si registrano, anche una camera virtuale; uno che non c'è si rifiuta", async () => {
    const { a, righe } = await ambiente({ microfoni: ["Microfono uno", "Microfono due"], camere: ["Camera uno", "OBS Virtual Camera"] })
    const avvio = await chiama<Stato>(a, "POST", "/api/registrazione", { modo: "viso", microfono: "Microfono due", camera: "OBS Virtual Camera" })
    expect(avvio.stato).toBe(201)
    const lanci = await aspetta(async () => ((await righe()).length >= 2 ? await righe() : null))
    expect(lanci.some((l) => l.includes("audio=Microfono due"))).toBe(true)
    expect(lanci.some((l) => l.includes("video=OBS Virtual Camera"))).toBe(true)
    expect(lanci.some((l) => l.includes("audio=Microfono uno"))).toBe(false)
    await chiama(a, "DELETE", "/api/registrazione")

    const prima = (await righe()).length
    const nonTrovato = await chiama<{ errore: string }>(a, "POST", "/api/registrazione", { modo: "voce", microfono: "Un altro" })
    expect(nonTrovato.stato).toBe(409)
    expect(nonTrovato.corpo.errore).toMatch(/«Un altro» non è fra quelli trovati/)
    expect((await chiama<{ errore: string }>(a, "POST", "/api/registrazione", { modo: "viso", camera: "Quella" })).corpo.errore).toMatch(/«Quella» non è fra quelle trovate/)
    expect((await chiama(a, "POST", "/api/registrazione", { modo: "voce", microfono: 3 })).stato).toBe(400)
    expect((await chiama(a, "POST", "/api/registrazione", { modo: "voce", microfono: "" })).stato).toBe(400)
    expect((await righe()).length).toBe(prima)
  })

  test("senza microfono, senza ffmpeg o con un modo sbagliato dice perché, e non parte niente", async () => {
    const senzaMicrofono = await ambiente({ microfoni: [], camere: [] })
    const r = await chiama<{ errore: string }>(senzaMicrofono.a, "POST", "/api/registrazione", { modo: "voce" })
    expect(r.stato).toBe(409)
    expect(r.corpo.errore).toMatch(/microfono/)
    expect((await chiama(senzaMicrofono.a, "POST", "/api/registrazione", { modo: "tutto" })).stato).toBe(400)
    expect((await chiama(senzaMicrofono.a, "DELETE", "/api/registrazione")).stato).toBe(409)
    expect(await senzaMicrofono.righe()).toEqual([])

    const senzaFfmpeg = await ambiente(undefined, true)
    const stato = await chiama<Stato>(senzaFfmpeg.a, "GET", "/api/registrazione")
    expect(stato.corpo.disponibile).toBe(false)
    expect(stato.corpo.motivo).toBe("Per registrare serve un programma che manca su questo computer (ffmpeg): va installato, poi riavvia Mango Animation.")
    expect((await chiama(senzaFfmpeg.a, "POST", "/api/registrazione", { modo: "schermo" })).stato).toBe(409)
  })

  test("se ffmpeg muore da solo la registrazione risulta finita, con la sua frase d'errore", async () => {
    const { a } = await ambiente({ microfoni: ["Rotto"], camere: [] })
    await chiama(a, "POST", "/api/registrazione", { modo: "voce" })
    const stato = await aspetta(async () => {
      const s = (await chiama<Stato>(a, "GET", "/api/registrazione")).corpo
      return s.in_corso === null ? s : null
    })
    expect(stato.ultima?.errore).toMatch(/Rotto/)
  })
})
