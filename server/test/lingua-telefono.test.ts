// Le pagine e le risposte per il telefono escono nella lingua del telefono (`Accept-Language`): italiano se parla italiano o se manca, inglese altrimenti.
import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { avviaAmbiente, chiama, fermaTutti, scriviVideo, type Ambiente } from "./aiuti"

afterEach(fermaTutti)

const OPZIONI_ARRIVI = { porta: 0, limiteByte: 20 * 1024 ** 3, indirizzo: "192.168.1.20", adesso: () => new Date(2026, 9, 9, 14, 5, 9), spazioLibero: () => 100 * 1024 ** 3 }

async function avvia(): Promise<Ambiente> {
  const a = await avviaAmbiente({ arrivi: OPZIONI_ARRIVI, ffprobe: null }, async (c) => {
    const uscite = join(c.archivio, "video", "uno", "uscite")
    await scriviVideo(c, "uno", { titolo: "First video", stato: "pronto", creato: "2026-10-06" })
    await scriviVideo(c, "due", { titolo: "Second video", stato: "proposta", creato: "2026-10-07" })
    await mkdir(join(c.archivio, "video", "due", "uscite"), { recursive: true })
    await mkdir(uscite, { recursive: true })
    await writeFile(join(uscite, "finale.mp4"), "finale")
    await writeFile(join(c.archivio, "video", "due", "uscite", "prova.mp4"), "prova")
    await writeFile(join(c.archivio, "video", "due", "uscite", "copione.html"), "<p>Una frase.</p>")
  })
  await chiama(a, "PUT", "/api/arrivi", { acceso: true })
  return a
}

const chiave = async (a: Ambiente): Promise<string> => JSON.parse(await readFile(join(a.archivio, "arrivi", "chiave.json"), "utf-8")).chiave
const base = (a: Ambiente): string => `http://127.0.0.1:${a.server.portaArrivi}`
const telefono = (lingua: string | null): Record<string, string> => (lingua === null ? {} : { "accept-language": lingua })

/** Il testo che il telefono mostra: senza stile, senza script e senza tag. */
const visibile = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")

const PAROLE_ITALIANE = /\b(il|lo|gli|di|della|dei|che|non|con|una|dal|nel|sul|sono|ancora|nessun|riprova|apri|tocca|scegli|aggiungi|video montati)\b|[àèéìòù]/i
const PAROLE_INGLESI = /\b(the|and|your|tap|open|you|to|of|is|are)\b/i

describe("le pagine del telefono", () => {
  const pagine = [
    { percorso: "/guarda", titolo: ["I video montati", "Edited videos"], testo: ["Da registrare", "To record"] },
    { percorso: "/carica", titolo: ["Carica su Mango Animation", "Upload to Mango Animation"], testo: ["Carica video", "Upload videos"] },
    { percorso: "/installa/contenuti-video", titolo: ["Manda a Mango Animation", "Send to Mango Animation"], testo: ["Comandi Rapidi", "Shortcuts"] },
  ]

  for (const { percorso, titolo, testo } of pagine) {
    test(`${percorso}: inglese per un telefono inglese, italiano per uno italiano o senza lingua, con l'attributo lang giusto`, async () => {
      const a = await avvia()
      const k = await chiave(a)
      const apri = async (lingua: string | null) => (await fetch(`${base(a)}${percorso}?chiave=${k}`, { headers: telefono(lingua) })).text()

      const en = await apri("en-US,en;q=0.9")
      expect(en).toContain('<html lang="en">')
      expect(en).toContain(`<title>${titolo[1]}</title>`)
      expect(visibile(en)).toContain(testo[1]!)
      expect(visibile(en)).not.toMatch(PAROLE_ITALIANE)

      for (const lingua of ["it-IT,it;q=0.9", null]) {
        const it = await apri(lingua)
        expect(it, String(lingua)).toContain('<html lang="it">')
        expect(it).toContain(`<title>${titolo[0]}</title>`)
        expect(visibile(it)).toContain(testo[0]!)
        expect(visibile(it)).not.toMatch(PAROLE_INGLESI)
      }
    })
  }

  test("l'elenco: le sezioni, le date e il vuoto parlano inglese; la data non è quella italiana", async () => {
    const a = await avvia()
    const k = await chiave(a)
    const en = visibile(await (await fetch(`${base(a)}/guarda?chiave=${k}`, { headers: telefono("en-GB") })).text())
    expect(en).toContain("Edited videos")
    expect(en).toContain("To record")
    expect(en).toContain("The lines to say, to read on your phone.")
    expect(en).toContain("Rehearsals")
    expect(en).toContain("Before recording: the script and the animations.")
    expect(en).toMatch(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) at \d\d:\d\d\b/)
    const it = visibile(await (await fetch(`${base(a)}/guarda?chiave=${k}`, { headers: telefono("it-IT") })).text())
    expect(it).toMatch(/\b\d{1,2} (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) alle (ore )?\d\d:\d\d\b/)
  })

  test("senza video montati l'elenco lo dice nella lingua del telefono", async () => {
    const a = await avviaAmbiente({ arrivi: OPZIONI_ARRIVI, ffprobe: null })
    await chiama(a, "PUT", "/api/arrivi", { acceso: true })
    const k = await chiave(a)
    expect(visibile(await (await fetch(`${base(a)}/guarda?chiave=${k}`, { headers: telefono("en") })).text())).toContain("There are no edited videos yet.")
    expect(visibile(await (await fetch(`${base(a)}/guarda?chiave=${k}`, { headers: telefono("it") })).text())).toContain("Non c'è ancora nessun video montato.")
  })

  test("la pagina dei file porta le frasi dello script nella lingua del telefono, e il numero con il suo separatore", async () => {
    const a = await avvia()
    const k = await chiave(a)
    const en = await (await fetch(`${base(a)}/carica?chiave=${k}`, { headers: telefono("en") })).text()
    expect(en).toContain('"inAttesa":"Waiting"')
    expect(en).toContain('"nonArrivato":"It did not arrive: check that you are on your home Wi-Fi and that the computer is on. Try again."')
    expect(en).toContain('toLocaleString("en-GB"')
    const it = await (await fetch(`${base(a)}/carica?chiave=${k}`, { headers: telefono("it") })).text()
    expect(it).toContain('"inAttesa":"In attesa"')
    expect(it).toContain('toLocaleString("it-IT"')
  })

  test("la guida: i passi e le frasi dei bottoni sono inglesi", async () => {
    const a = await avvia()
    const k = await chiave(a)
    const en = await (await fetch(`${base(a)}/installa/contenuti-video?chiave=${k}`, { headers: { ...telefono("en"), host: "192.168.1.20:47420" } })).text()
    expect(en).toContain("Send to Mango Animation")
    expect(en).toContain("up to 20 GB")
    expect(en).toContain('"copiato":"Copied"')
    expect(en).toContain("Get Contents of URL")
    expect(en).toContain(`http://192.168.1.20:47420/arrivi/contenuti-video?chiave=${k}`)
  })
})

describe("le risposte al telefono", () => {
  const manda = async (a: Ambiente, lingua: string | null, corpo: string = "x".repeat(200), intestazioni: Record<string, string> = {}) =>
    fetch(`${base(a)}/arrivi/contenuti-video?chiave=${await chiave(a)}`, { method: "POST", body: corpo, headers: { ...telefono(lingua), ...intestazioni } })

  test("un file ricevuto, uno che non si riconosce e uno vuoto: l'esito arriva nella lingua del telefono", async () => {
    const a = await avvia()
    const buono = await manda(a, "en-US", "x".repeat(2000), { "x-nome-file": "clip.mov", "content-type": "video/quicktime" })
    expect(await buono.json()).toMatchObject({ ok: true, messaggio: "Received: clip.mov (1 MB)." })
    const strano = await manda(a, "en-US", "x", { "x-nome-file": "clip.xyz", "content-type": "application/octet-stream" })
    expect(await strano.json()).toEqual({ ok: false, errore: "I do not recognise what file this is («clip.xyz»). This page accepts: videos, audio recordings, photos." })
    const vuoto = await manda(a, "en-US", "", { "x-nome-file": "vuoto.mov", "content-type": "video/quicktime" })
    expect(((await vuoto.json()) as { errore: string }).errore).toMatch(/^(The file is empty\.|No file arrived\.)$/)
    const it = await manda(a, "it-IT", "x", { "x-nome-file": "clip.xyz", "content-type": "application/octet-stream" })
    expect(((await it.json()) as { errore: string }).errore).toBe("Non riconosco che file sia («clip.xyz»). Questa pagina accetta: video, registrazioni audio, foto.")
  })

  test("la chiave sbagliata, il metodo sbagliato e un video che non c'è parlano la lingua del telefono", async () => {
    const a = await avvia()
    const k = await chiave(a)
    const errore = async (percorso: string, lingua: string | null, metodo = "GET") => ((await (await fetch(`${base(a)}${percorso}`, { method: metodo, headers: telefono(lingua) })).json()) as { errore: string }).errore
    expect(await errore("/guarda?chiave=no", "en")).toBe("The key is not right: open the QR code in Mango Animation again and redo the Shortcut.")
    expect(await errore("/guarda?chiave=no", "it")).toBe("La chiave non è giusta: riapri il codice QR in Mango Animation e rifai la Scorciatoia.")
    expect(await errore(`/carica?chiave=${k}`, "en", "POST")).toBe("This method is not allowed here.")
    expect(await errore(`/guarda/nessuno.mp4?chiave=${k}`, "en")).toBe("This video is not edited yet.")
    expect(await errore(`/guarda/prova/uno.mp4?chiave=${k}`, "en")).toBe("This video has no rehearsal.")
    expect(await errore(`/guarda/copione/uno.html?chiave=${k}`, "en")).toBe("This video has no script page to record from.")
    expect(await errore(`/guarda/copione/uno.html?chiave=${k}`, null)).toBe("Questo video non ha una pagina da registrare.")
  })

  test("il registro degli arrivi resta in italiano anche per un telefono inglese", async () => {
    const a = await avvia()
    await manda(a, "en-US", "x", { "x-nome-file": "clip.xyz", "content-type": "application/octet-stream" })
    const righe = (await readFile(join(a.archivio, "arrivi", "registro.jsonl"), "utf-8")).trim().split("\n").map((r) => JSON.parse(r) as { esito: string; motivo?: string })
    expect(righe.find((r) => r.esito === "rifiutato")?.motivo).toMatch(/^Non riconosco che file sia/)
  })
})
