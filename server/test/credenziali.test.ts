// Il codice del server non legge né passa le credenziali di claude.ai dell'utente: Claude Code usa l'accesso che ha già, da sé. Che il server non si possa usare per prelevare
// un file qualunque lo garantisce `allegati-locali.test.ts`: un percorso si prende solo se il creator l'ha scelto con un gesto.
import { expect, test } from "bun:test"
import { Glob } from "bun"
import { join, resolve } from "node:path"

const CODICE = resolve(import.meta.dir, "..", "..")
const CARTELLE = ["server/src", "plugin"]
const VIETATI = [".credentials", "accessToken", "claudeAiOauth", "createCodeSession", "attachBridgeSession", "fetchRemoteCredentials", "claude-agent-sdk/bridge"]

test("nel codice del server non si legge nessun login di claude.ai", async () => {
  const trovati: string[] = []
  for (const cartella of CARTELLE) {
    for await (const file of new Glob("**/*.ts").scan({ cwd: join(CODICE, cartella) })) {
      const testo = await Bun.file(join(CODICE, cartella, file)).text()
      trovati.push(...VIETATI.filter((v) => testo.includes(v)).map((v) => `${cartella}/${file}: ${v}`))
    }
  }
  expect(trovati).toEqual([])
})
