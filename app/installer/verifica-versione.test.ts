import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { erroriDiVersione } from "./verifica-versione"

const uguali = { tauri: "0.1.2", cargo: "0.1.2", motore: "0.1.2", tag: "v0.1.2" }

test("la versione uguale dappertutto, col tag v + versione, non ha errori; senza tag si guardano solo i file", () => {
  expect(erroriDiVersione(uguali)).toEqual([])
  expect(erroriDiVersione({ ...uguali, tag: undefined })).toEqual([])
  expect(erroriDiVersione({ tauri: "0.1.3-rc.1", cargo: "0.1.3-rc.1", motore: "0.1.3-rc.1", tag: "v0.1.3-rc.1" })).toEqual([])
})

test("ogni differenza è un errore che dice quali file non combaciano", () => {
  expect(erroriDiVersione({ ...uguali, cargo: "0.1.1" })).toEqual(["tauri.conf.json dice 0.1.2, Cargo.toml 0.1.1."])
  expect(erroriDiVersione({ ...uguali, motore: "0.1.1" })).toEqual(["tauri.conf.json dice 0.1.2, motore/__init__.py 0.1.1."])
  expect(erroriDiVersione({ ...uguali, tag: "v0.1.3" })).toEqual(["Il tag è v0.1.3, la versione dell'app v0.1.2."])
  expect(erroriDiVersione({ ...uguali, tag: "0.1.2" })).toHaveLength(1)
  expect(erroriDiVersione({ ...uguali, note: "Mancano le note." })).toEqual(["Mancano le note."])
  expect(erroriDiVersione({ tauri: "0.1", cargo: "0.1", motore: "0.1" })[0]).toContain("X.Y.Z")
})

test("il repo com'è passa il controllo, e un tag che non è la sua versione no", () => {
  const radice = join(import.meta.dir, "..", "..")
  const versione = JSON.parse(readFileSync(join(radice, "app", "tauri.conf.json"), "utf8")).version
  expect(existsSync(join(import.meta.dir, "note", `v${versione}.md`))).toBe(true)
  const lancia = (...argomenti: string[]) => Bun.spawnSync([process.execPath, "run", join(import.meta.dir, "verifica-versione.ts"), ...argomenti], { stdout: "pipe", stderr: "pipe" })
  expect(lancia("--tag", `v${versione}`).exitCode).toBe(0)
  const sbagliato = lancia("--tag", "v9.9.9")
  expect(sbagliato.exitCode).toBe(1)
  expect(sbagliato.stderr.toString()).toContain("Il tag è v9.9.9")
})
