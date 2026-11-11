// Prepara `app/target/codice/`: il codice del prodotto che l'installatore porta accanto all'eseguibile (`docs/APP.md`, «Installer e aggiornamenti»).
// Senza `node_modules` (li fa `bun install` al primo avvio), senza prove, senza i dati di nessuno. Costruisce prima studio e animazioni, se non si dice `--senza-costruire`.
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join, relative, sep } from "node:path"

/** Ciò che del repo va nell'installatore. */
export const DA_PORTARE = ["CLAUDE.md", "LEGGIMI.md", "LICENSE", "NOTICE.md", "TRADEMARKS.md", "AVVISI-DI-TERZI.md", "stile.json", "stili-di-partenza.json", "font", "motore", "strumenti", "server", "animazioni", "studio/dist", ".claude/rules", ".claude/skills", ".claude/metodo", ".claude-plugin", "plugin", "docs"]

/** Il file, in `codice/`, con l'elenco dei file della versione: l'app lo legge per togliere quelli che l'aggiornamento non ha sovrascritto perché la versione nuova non li ha più (`app/src/codice.rs`). */
export const ELENCO = ".mango-elenco.json"

/** La pagina delle animazioni: il server la ricostruisce da sé dentro `codice/`. */
const CREATI_DAL_SERVER = ["animazioni/dist", "animazioni/dist.lock", "animazioni/dist.nuova", "animazioni/dist.vecchia"]

const CARTELLE_ESCLUSE = ["node_modules", "__pycache__", ".pytest_cache"]
const PERCORSI_ESCLUSI = ["motore/prove", "server/test", "animazioni/test", "animazioni/foto", "docs/images"]

/** Un percorso del repo (relativo, con `/`) che non va nell'installatore. */
export function escluso(percorso: string): boolean {
  const parti = percorso.split("/")
  return parti.some((p) => CARTELLE_ESCLUSE.includes(p)) || percorso.endsWith(".pyc") || PERCORSI_ESCLUSI.some((e) => percorso === e || percorso.startsWith(`${e}/`))
}

async function tuttiIFile(cartella: string, base = ""): Promise<string[]> {
  const voci = await readdir(join(cartella, base), { withFileTypes: true })
  return (await Promise.all(voci.map((v) => (v.isDirectory() ? tuttiIFile(cartella, `${base}${v.name}/`) : [`${base}${v.name}`])))).flat()
}

export async function prepara(repo: string, destinazione: string): Promise<string[]> {
  await rm(destinazione, { recursive: true, force: true })
  const portati: string[] = []
  for (const voce of DA_PORTARE) {
    await mkdir(dirname(join(destinazione, voce)), { recursive: true })
    await cp(join(repo, voce), join(destinazione, voce), {
      recursive: true,
      filter: (sorgente) => !escluso(relative(repo, sorgente).split(sep).join("/")),
    })
    portati.push(voce)
  }
  // Ciò che non si porta (i pacchetti, le cache di Python, le prove) non è del prodotto: l'app non lo tocca.
  const file = (await tuttiIFile(destinazione)).sort()
  await writeFile(join(destinazione, ELENCO), JSON.stringify({ radici: DA_PORTARE, file, conservati_per_nome: CARTELLE_ESCLUSE, conservati_per_percorso: [...PERCORSI_ESCLUSI, ...CREATI_DAL_SERVER] }, null, 1))
  return portati
}

async function costruisci(repo: string, cartella: string): Promise<void> {
  const esito = Bun.spawnSync([process.execPath, "run", "--cwd", join(repo, cartella), "build"], { stdout: "inherit", stderr: "inherit" })
  if (esito.exitCode !== 0) throw new Error(`«bun run build» in ${cartella} non è riuscito: l'installatore non si prepara con un'interfaccia o delle animazioni vecchie.`)
}

if (import.meta.main) {
  const repo = join(import.meta.dir, "..", "..")
  if (!process.argv.includes("--senza-costruire")) {
    await costruisci(repo, "studio")
    await costruisci(repo, "animazioni")
  }
  const portati = await prepara(repo, join(repo, "app", "target", "codice"))
  console.log(`Pronto: app/target/codice/ con ${portati.join(", ")}.`)
}
