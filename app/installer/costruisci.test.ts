import { expect, test } from "bun:test"
import { join } from "node:path"
import { argomentiCostruzione, CHIAVE, decifra, PASSWORD, scegliFirma, type Ambiente, type Sistema } from "./costruisci"

const CARTELLA = join("C:", "Users", "<utente>", ".tauri")

function sistema(env: Ambiente, file: Record<string, string> = {}): Sistema {
  return {
    env,
    cartellaChiavi: CARTELLA,
    leggi: (percorso) => file[percorso],
    decifra: (cifrata) => `aperta(${cifrata})`,
  }
}

const senzaFirma = { origine: "nessuna", env: {} } as const

test("con la chiave nell'ambiente si usa quella e la sua password, senza guardare i file", () => {
  const firma = scegliFirma(sistema({ [CHIAVE]: "chiave-delle-actions", [PASSWORD]: "segreta" }, { [join(CARTELLA, "mango-animation.key")]: "chiave-del-file" }))
  expect(firma).toEqual({ origine: "ambiente", env: { [CHIAVE]: "chiave-delle-actions", [PASSWORD]: "segreta" } })
  expect(argomentiCostruzione(firma)).toEqual(["tauri", "build", "--config", "tauri.installer.conf.json"])
})

test("una password vuota nell'ambiente vale: è la scelta di chi ha fatto la chiave senza password", () => {
  expect(scegliFirma(sistema({ [CHIAVE]: "k", [PASSWORD]: "" })).env[PASSWORD]).toBe("")
})

test("senza ambiente si legge la chiave dal file e si apre la password cifrata", () => {
  const firma = scegliFirma(sistema({}, { [join(CARTELLA, "mango-animation.key")]: "chiave-del-file", [join(CARTELLA, "mango-animation.password")]: "cifrata\n" }))
  expect(firma).toEqual({ origine: "file", env: { [CHIAVE]: "chiave-del-file", [PASSWORD]: "aperta(cifrata\n)" } })
})

test("la chiave nel file e la password nell'ambiente: non serve il file della password", () => {
  const firma = scegliFirma(sistema({ [PASSWORD]: "dall-ambiente" }, { [join(CARTELLA, "mango-animation.key")]: "chiave-del-file" }))
  expect(firma).toEqual({ origine: "file", env: { [CHIAVE]: "chiave-del-file", [PASSWORD]: "dall-ambiente" } })
})

test("una chiave vuota nell'ambiente (il segreto non c'è) passa al file", () => {
  const firma = scegliFirma(sistema({ [CHIAVE]: "", [PASSWORD]: "" }, { [join(CARTELLA, "mango-animation.key")]: "chiave-del-file" }))
  expect(firma.origine).toBe("file")
})

test("senza chiave né nell'ambiente né nel file si costruisce senza i file degli aggiornamenti", () => {
  const firma = scegliFirma(sistema({}))
  expect(firma).toEqual(senzaFirma)
  const argomenti = argomentiCostruzione(firma)
  expect(argomenti.slice(0, 4)).toEqual(["tauri", "build", "--config", "tauri.installer.conf.json"])
  expect(argomenti.slice(4)).toEqual(["--config", '{"bundle":{"createUpdaterArtifacts":false}}'])
})

test("una chiave senza la sua password ferma tutto: non esce un installatore non firmato per sbaglio", () => {
  expect(() => scegliFirma(sistema({ [CHIAVE]: "k" }))).toThrow("non la sua password")
  expect(() => scegliFirma(sistema({}, { [join(CARTELLA, "mango-animation.key")]: "k" }))).toThrow("non la sua password")
})

test("una password che non si apre ferma tutto", () => {
  const rotto: Sistema = { ...sistema({}, { [join(CARTELLA, "mango-animation.key")]: "k", [join(CARTELLA, "mango-animation.password")]: "x" }), decifra: () => { throw new Error("non si apre") } }
  expect(() => scegliFirma(rotto)).toThrow("non si apre")
})

test.skipIf(process.platform !== "win32")("la password cifrata da Windows per l'utente si riapre col testo di partenza", () => {
  const originale = "pass con spazi e 'apici' e àè"
  const cifrata = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "$input | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString"], { stdin: Buffer.from(originale), stdout: "pipe" }).stdout.toString()
  expect(decifra(cifrata)).toBe(originale)
  expect(() => decifra("non è una password cifrata")).toThrow("Non riesco ad aprire la password")
})
