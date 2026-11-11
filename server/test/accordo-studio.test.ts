import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { copyFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { generaArchivio } from "../../studio/verifica/genera-archivio"
import { avviaAmbiente, chiama, fermaTutti, type Ambiente } from "./aiuti"
import { leggiTipi, tipiDelloStudio, type TipiLetti } from "./tipiDelloStudio"

// La prova unica fra server e studio: lo studio ha i suoi tipi scritti a mano (`studio/src/tipi.ts`), il server il suo indice. Qui il server vero legge l'archivio di esempio
// dello studio (`studio/verifica/genera-archivio.ts`) e ciò che manda deve avere la forma che lo studio si aspetta: se un campo cambia da una parte sola, la prova si rompe.
let a: Ambiente
let tipi: TipiLetti

beforeAll(async () => {
  tipi = tipiDelloStudio()
  a = await avviaAmbiente({}, async (c) => generaArchivio(c.archivio))
}, 180_000)
afterAll(fermaTutti)

const leggi = async <T = unknown>(percorso: string): Promise<T> => {
  const r = await chiama<T>(a, "GET", percorso)
  expect(r.stato, percorso).toBe(200)
  return r.corpo
}

describe("ciò che il server manda ha la forma dei tipi dello studio", () => {
  test("l'archivio di esempio passa i controlli del server: nessun problema nelle schede, nei piani e nel girato", async () => {
    const elenco = await leggi<{ slug: string }[]>("/api/video")
    expect(elenco.length).toBeGreaterThan(5)
    for (const { slug } of elenco) {
      const { problemi } = await leggi<{ problemi: { scheda: string[]; piano: string[] } }>(`/api/video/${slug}`)
      expect({ slug, problemi }).toEqual({ slug, problemi: { scheda: [], piano: [] } })
    }
    const girato = await leggi<{ file: { file: string; scheda_problemi: string[] }[] }[]>("/api/grezzo")
    expect(girato.flatMap((g) => g.file.filter((f) => f.scheda_problemi.length > 0).map((f) => f.file))).toEqual([])
  })

  test("l'elenco dei video e il dettaglio di ognuno (scheda, piano, risolto, uscite, lavoro)", async () => {
    const elenco = await leggi<{ slug: string }[]>("/api/video")
    expect(tipi.controlla("VoceElenco", elenco, { elenco: true })).toEqual([])
    for (const { slug } of elenco) expect(tipi.controlla("DettaglioVideo", await leggi(`/api/video/${slug}`)), slug).toEqual([])
  })

  test("il girato e le parole di un file preparato", async () => {
    const girato = await leggi<{ file: { file: string; preparato: { parole: string | null } }[] }[]>("/api/grezzo")
    expect(tipi.controlla("GiornoGrezzo", girato, { elenco: true })).toEqual([])
    const preparato = girato.flatMap((g) => g.file).find((f) => f.preparato.parole !== null)
    expect(preparato).toBeDefined()
    const parole = await leggi<unknown[]>(`/api/grezzo/parole?file=${encodeURIComponent(preparato!.file)}`)
    expect(parole.length).toBeGreaterThan(0)
    expect(tipi.controlla("ParolaGrezzo", parole, { elenco: true })).toEqual([])
  })

  test("lo stile, i lavori, il profilo, i motori, le animazioni, gli arrivi, lo studio dalla rete, la registrazione e i consumi", async () => {
    const casi: [string, string, boolean?][] = [
      ["/api/stile", "Stile"],
      ["/api/lavori", "StatoLavori"],
      ["/api/profilo", "StatoProfilo"],
      ["/api/motori", "Motori"],
      ["/api/arrivi", "StatoArrivi"],
      ["/api/accesso-studio", "StatoStudioRemoto"],
      ["/api/registrazione", "StatoRegistrazione"],
      ["/api/consumi", "ConsumiDiClaude"],
    ]
    for (const [percorso, tipo] of casi) expect(tipi.controlla(tipo, await leggi(percorso)), percorso).toEqual([])
    const animazioni = await leggi<Record<string, unknown[]>>("/api/animazioni")
    for (const [video, scene] of Object.entries(animazioni)) expect(tipi.controlla("AnimazioneDisponibile", scene, { elenco: true }), video).toEqual([])
  })

  test("gli stili di partenza e i caratteri", async () => {
    await copyFile(resolve(import.meta.dir, "..", "..", "stili-di-partenza.json"), join(a.codice, "stili-di-partenza.json"))
    expect(tipi.controlla("StileDiPartenza", await leggi("/api/stile/partenza"), { elenco: true })).toEqual([])
    expect(tipi.controlla("Carattere", await leggi("/api/caratteri"), { elenco: true })).toEqual([])
  })

  test("un lavoro finito, con l'errore e le righe, ha la forma di quello che lo studio mostra", async () => {
    const { id } = (await chiama<{ id: string }>(a, "POST", "/api/video/pane-veloce/lavori", { comando: "controlla" })).corpo
    await Bun.sleep(100)
    const fine = async () => (await leggi<{ in_corso: unknown; in_coda: unknown[]; finiti: { id: string }[] }>("/api/lavori")).finiti.some((f) => f.id === id)
    for (let n = 0; n < 100 && !(await fine()); n++) await Bun.sleep(100)
    expect(await fine()).toBe(true)
    expect(tipi.controlla("StatoLavori", await leggi("/api/lavori"))).toEqual([])
  })

  test("gli eventi del server sono quelli dello studio, e viceversa", () => {
    const server = leggiTipi(resolve(import.meta.dir, "..", "src", "eventi.ts"))
    const delloStudio = tipi.valoriDi("Evento", "tipo")
    expect(delloStudio.length).toBeGreaterThan(10)
    expect([...delloStudio].sort()).toEqual([...server.valoriDi("Messaggio", "tipo")].sort())
    expect([...tipi.letterali("EventoVideo")].sort()).toEqual([...server.letterali("CosaDelVideo")].sort())
  })

  test("un dato vero con un campo tolto o cambiato dal server non passa", async () => {
    const dettaglio = await leggi<{ risolto: { durata?: number }; scheda: { stato: string }; uscite: { byte?: number }[] }>("/api/video/pasta-fresca")
    expect(tipi.controlla("DettaglioVideo", dettaglio)).toEqual([])
    delete dettaglio.risolto.durata
    dettaglio.scheda.stato = "inventato"
    expect(tipi.controlla("DettaglioVideo", dettaglio).map((p) => p.split(":")[0])).toEqual(expect.arrayContaining(["DettaglioVideo.risolto.durata", "DettaglioVideo.scheda.stato"]))
  })

  test("il controllo si accorge di una divergenza: un campo che manca, uno del tipo sbagliato, un'alternativa che non c'è", () => {
    expect(tipi.controlla("VoceElenco", { slug: "x" })).not.toEqual([])
    expect(tipi.controlla("ParolaGrezzo", { p: "ciao", da: "uno", a: 2 })).toEqual(["ParolaGrezzo.da: dovrebbe essere un numero, è \"uno\""])
    expect(tipi.controlla("StatoVideo", "inventato")).not.toEqual([])
    expect(tipi.controlla("StatoVideo", "pronto")).toEqual([])
  })
})
