import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { latest, nomeSuGithub, novita } from "./pubblica"

test("latest.json dice versione, note, firma e indirizzo dell'installatore per Windows, e la firma non ha il ritorno a capo del file", () => {
  const l = latest("0.1.1", "Corretto un errore", "dW50cnVzdGVk\n", "https://esempio.it/Mango%20Animation_0.1.1_x64-setup.exe", new Date("2026-11-05T20:00:00Z"))
  expect(l).toEqual({
    version: "0.1.1",
    notes: "Corretto un errore",
    pub_date: "2026-11-05T20:00:00.000Z",
    platforms: { "windows-x86_64": { signature: "dW50cnVzdGVk", url: "https://esempio.it/Mango%20Animation_0.1.1_x64-setup.exe" } },
  })
})

test("nell'indirizzo il nome dell'installatore è quello che GitHub dà al file caricato: gli spazi diventano punti", () => {
  expect(nomeSuGithub("Mango Animation_0.1.1_x64-setup.exe")).toBe("Mango.Animation_0.1.1_x64-setup.exe")
})

test("le note di latest.json sono l'elenco delle novità come testo semplice, non la prima riga del file", () => {
  const note = ["Windows 10 or 11, 64-bit only.", "", "**Install:** scarica l'installatore.", "", "**Changed since 0.1.1**", "- Lo **zoom** della finestra: `Ctrl+0` torna al 100%, vedi [la guida](https://esempio.it/guida).", "- Una voce lunga che", "  va a capo.", "", "**What to expect**", "- Non è una novità."].join("\r\n")
  expect(novita(note)).toBe("- Lo zoom della finestra: Ctrl+0 torna al 100%, vedi la guida.\n- Una voce lunga che va a capo.")
})

test("note senza l'elenco delle novità, o con l'elenco vuoto, sono un errore: chi aggiorna non leggerebbe niente di vero", () => {
  expect(() => novita("Windows 10 or 11, 64-bit only.\n\n**What to expect**\n- Qualcosa.\n")).toThrow("«**Changed since …**»")
  expect(() => novita("**Changed since 0.1.1**\n\n**What to expect**\n- Qualcosa.\n")).toThrow("vuoto")
})

test("le note dell'uscita in corso danno novità vere, senza la riga dei sistemi supportati", () => {
  const versione = JSON.parse(readFileSync(join(import.meta.dir, "..", "tauri.conf.json"), "utf8")).version
  const testo = novita(readFileSync(join(import.meta.dir, "note", `v${versione}.md`), "utf8"))
  expect(testo.startsWith("- ")).toBe(true)
  expect(testo).not.toContain("Windows 10 or 11")
  expect(testo).not.toMatch(/[`*]/)
})
