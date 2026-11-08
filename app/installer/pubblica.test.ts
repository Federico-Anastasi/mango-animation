import { expect, test } from "bun:test"
import { latest, nomeSuGithub } from "./pubblica"

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
