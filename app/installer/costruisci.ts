// Costruisce l'installatore (`docs/APP.md`, «Installer e aggiornamenti»): prepara il codice da portare (`prepara.ts`) e lancia `cargo tauri build`. Lo usano il workflow delle uscite e chi costruisce a mano.
// La chiave di firma degli aggiornamenti si cerca nell'ordine: variabili d'ambiente (le Actions), file in `%USERPROFILE%\.tauri\`; senza nessuna delle due l'installatore esce lo stesso, senza i file degli aggiornamenti.
// Uso, da `app/`: bun run installer/costruisci.ts
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const CHIAVE = "TAURI_SIGNING_PRIVATE_KEY"
export const PASSWORD = "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"

export type Ambiente = Record<string, string | undefined>

export interface Firma {
  /** Da dove viene la chiave; `nessuna` costruisce senza i file degli aggiornamenti. */
  origine: "ambiente" | "file" | "nessuna"
  /** Le variabili da aggiungere all'ambiente di `cargo tauri build`. */
  env: Record<string, string>
}

export interface Sistema {
  env: Ambiente
  /** La cartella delle chiavi (`%USERPROFILE%\.tauri`). */
  cartellaChiavi: string
  /** Il testo di un file, o `undefined` se non c'è. */
  leggi(percorso: string): string | undefined
  /** Apre una password cifrata da Windows per l'utente (DPAPI). */
  decifra(cifrata: string): string
}

export function sistema(): Sistema {
  return {
    env: process.env,
    cartellaChiavi: join(process.env.USERPROFILE ?? homedir(), ".tauri"),
    leggi: (percorso) => (existsSync(percorso) ? readFileSync(percorso, "utf8") : undefined),
    decifra,
  }
}

/** La password scritta da `ConvertFrom-SecureString` si apre solo con PowerShell, sullo stesso computer e con lo stesso utente. */
export function decifra(cifrata: string): string {
  const esito = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "[System.Net.NetworkCredential]::new('', ($input | ConvertTo-SecureString)).Password"], { stdin: Buffer.from(cifrata.trim()), stdout: "pipe", stderr: "pipe" })
  if (esito.exitCode !== 0) throw new Error(`Non riesco ad aprire la password della chiave di firma (è cifrata per un altro utente o un altro computer?): ${esito.stderr.toString().trim()}`)
  return esito.stdout.toString().replace(/\r?\n$/, "")
}

/** La chiave e la password da usare, con l'ordine: ambiente, file, nessuna. Una chiave trovata senza la sua password è un errore, non un installatore non firmato. */
export function scegliFirma(sis: Sistema): Firma {
  const chiaveAmbiente = sis.env[CHIAVE]
  const fileChiave = join(sis.cartellaChiavi, "mango-animation.key")
  const chiaveFile = chiaveAmbiente ? undefined : sis.leggi(fileChiave)
  const chiave = chiaveAmbiente || chiaveFile
  if (!chiave) return { origine: "nessuna", env: {} }

  let password = sis.env[PASSWORD]
  if (password === undefined) {
    const cifrata = sis.leggi(join(sis.cartellaChiavi, "mango-animation.password"))
    if (cifrata === undefined) throw new Error(`C'è la chiave di firma ma non la sua password: ${PASSWORD} nell'ambiente, oppure il file mango-animation.password accanto alla chiave (docs/APP.md, «La firma»).`)
    password = sis.decifra(cifrata)
  }
  return { origine: chiaveAmbiente ? "ambiente" : "file", env: { [CHIAVE]: chiave, [PASSWORD]: password } }
}

/** Gli argomenti di `cargo` per costruire l'installatore. */
export function argomentiCostruzione(firma: Firma): string[] {
  const argomenti = ["tauri", "build", "--config", "tauri.installer.conf.json"]
  if (firma.origine === "nessuna") argomenti.push("--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }))
  return argomenti
}

const SPIEGAZIONE: Record<Firma["origine"], string> = {
  ambiente: "chiave di firma dall'ambiente",
  file: "chiave di firma dal file in .tauri",
  nessuna: "nessuna chiave di firma: l'installatore esce senza i file degli aggiornamenti (docs/APP.md, «La firma», per farsi una chiave)",
}

function esegui(comando: string[], env: Ambiente): void {
  const esito = Bun.spawnSync(comando, { cwd: join(import.meta.dir, ".."), env, stdout: "inherit", stderr: "inherit" })
  if (esito.exitCode !== 0) throw new Error(`«${comando.slice(0, 3).join(" ")}» non è riuscito (codice ${esito.exitCode}).`)
}

if (import.meta.main) {
  const firma = scegliFirma(sistema())
  console.log(`Costruzione: ${SPIEGAZIONE[firma.origine]}.`)
  esegui([process.execPath, "run", "installer/prepara.ts"], process.env)
  esegui(["cargo", ...argomentiCostruzione(firma)], { ...process.env, ...firma.env })
}
