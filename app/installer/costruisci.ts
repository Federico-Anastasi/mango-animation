// Costruisce l'installatore (`docs/APP.md`, «Installer e aggiornamenti»): prepara il codice da portare (`prepara.ts`), lancia `cargo tauri build` e firma. Lo usano il workflow delle uscite e chi costruisce a mano.
// La costruzione non vede mai la chiave di firma: la firma è un passo a parte (`cargo tauri signer sign`) che la riceve da solo. La chiave si cerca nell'ordine: variabili d'ambiente (le Actions), file in `%USERPROFILE%\.tauri\`; senza nessuna delle due l'installatore esce lo stesso, senza il file della firma.
// Uso, da `app/`: bun run installer/costruisci.ts [--senza-firma | --solo-firma]
//   --senza-firma: prepara e costruisce, non legge nessuna chiave (il passo delle Actions senza segreti).
//   --solo-firma: firma l'installatore già costruito, e senza chiave è un errore (il passo delle Actions con i segreti).
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
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
  // Lanciato da PowerShell 7, Windows PowerShell eredita il suo PSModulePath e non trova più `ConvertTo-SecureString`.
  const { PSModulePath: _, ...env } = process.env
  const esito = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "[System.Net.NetworkCredential]::new('', ($input | ConvertTo-SecureString)).Password"], { stdin: Buffer.from(cifrata.trim()), stdout: "pipe", stderr: "pipe", env })
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

/** Gli argomenti di `cargo` per costruire l'installatore: senza i file della firma (li scrive `argomentiFirma`) e con `Cargo.lock` com'è. */
export const ARGOMENTI_COSTRUZIONE = ["tauri", "build", "--config", "tauri.installer.conf.json", "--config", JSON.stringify({ bundle: { createUpdaterArtifacts: false } }), "--", "--locked"]

/** Gli argomenti di `cargo` per scrivere il `.sig` dell'installatore; la chiave e la password arrivano dall'ambiente. */
export const argomentiFirma = (installatore: string): string[] => ["tauri", "signer", "sign", installatore]

/** L'ambiente di tutto ciò che non firma: senza la chiave e la sua password. */
export const senzaChiave = (env: Ambiente): Ambiente => Object.fromEntries(Object.entries(env).filter(([nome]) => nome !== CHIAVE && nome !== PASSWORD))

const SPIEGAZIONE: Record<Firma["origine"], string> = {
  ambiente: "chiave di firma dall'ambiente",
  file: "chiave di firma dal file in .tauri",
  nessuna: "nessuna chiave di firma: l'installatore esce senza i file degli aggiornamenti (docs/APP.md, «La firma», per farsi una chiave)",
}

function esegui(comando: string[], env: Ambiente): void {
  const esito = Bun.spawnSync(comando, { cwd: join(import.meta.dir, ".."), env, stdout: "inherit", stderr: "inherit" })
  if (esito.exitCode !== 0) throw new Error(`«${comando.slice(0, 3).join(" ")}» non è riuscito (codice ${esito.exitCode}).`)
}

/** L'installatore della versione dell'app in `target/release/bundle/nsis`. */
function installatoreCostruito(): string {
  const app = join(import.meta.dir, "..")
  const versione = JSON.parse(readFileSync(join(app, "tauri.conf.json"), "utf8")).version
  const cartella = join(app, "target", "release", "bundle", "nsis")
  const trovati = existsSync(cartella) ? readdirSync(cartella).filter((f) => f.endsWith(`_${versione}_x64-setup.exe`)) : []
  if (trovati.length !== 1) throw new Error(`In ${cartella} serve l'installatore della ${versione} (uno solo), ce ne sono ${trovati.length}: si fa con «bun run installer/costruisci.ts --senza-firma».`)
  return join(cartella, trovati[0])
}

if (import.meta.main) {
  const senzaFirma = process.argv.includes("--senza-firma")
  const soloFirma = process.argv.includes("--solo-firma")
  if (senzaFirma && soloFirma) throw new Error("--senza-firma e --solo-firma insieme non hanno senso: per fare tutto, nessuno dei due.")
  // La chiave si sceglie prima di costruire: una chiave senza password si scopre subito, non dopo un quarto d'ora.
  const firma = senzaFirma ? undefined : scegliFirma(sistema())
  if (firma?.origine === "nessuna" && soloFirma) throw new Error("Manca la chiave di firma: senza, un'uscita non si pubblica (docs/APP.md, «La firma»).")
  if (firma) console.log(`Firma: ${SPIEGAZIONE[firma.origine]}.`)
  if (!soloFirma) {
    const ambiente = senzaChiave(process.env)
    esegui([process.execPath, "run", "installer/prepara.ts"], ambiente)
    esegui(["cargo", ...ARGOMENTI_COSTRUZIONE], ambiente)
  }
  if (firma && firma.origine !== "nessuna") {
    const installatore = installatoreCostruito()
    rmSync(`${installatore}.sig`, { force: true })
    esegui(["cargo", ...argomentiFirma(installatore)], { ...process.env, ...firma.env })
  }
}
