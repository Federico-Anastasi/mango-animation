// Controlla che la versione dell'app sia la stessa in tutti i file che la scrivono e che se ne possa fare un'uscita: `tauri.conf.json`, `Cargo.toml`, `motore/__init__.py`, il tag (`v` + versione, se si dà `--tag`) e le note dell'uscita con l'elenco delle novità. Esce con 1 a ogni differenza.
// Uso, dalla radice del repo: bun run app/installer/verifica-versione.ts [--tag v0.1.2]   (il workflow delle uscite lo lancia prima di costruire)
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { novita } from "./pubblica"

export interface Versioni {
  tauri: string
  cargo: string
  motore: string
  tag?: string
  /** Perché le note dell'uscita non vanno (mancano, o senza l'elenco delle novità); niente se vanno. */
  note?: string
}

/** Le differenze fra ciò che i file dicono; vuoto quando la versione è la stessa dappertutto. */
export function erroriDiVersione(v: Versioni): string[] {
  const errori: string[] = []
  if (!/^\d+\.\d+\.\d+(-rc\.\d+)?$/.test(v.tauri)) errori.push(`tauri.conf.json dice «${v.tauri}»: serve X.Y.Z oppure X.Y.Z-rc.N.`)
  if (v.cargo !== v.tauri) errori.push(`tauri.conf.json dice ${v.tauri}, Cargo.toml ${v.cargo}.`)
  if (v.motore !== v.tauri) errori.push(`tauri.conf.json dice ${v.tauri}, motore/__init__.py ${v.motore}.`)
  if (v.tag !== undefined && v.tag !== `v${v.tauri}`) errori.push(`Il tag è ${v.tag}, la versione dell'app v${v.tauri}.`)
  if (v.note) errori.push(v.note)
  return errori
}

if (import.meta.main) {
  const repo = join(import.meta.dir, "..", "..")
  const tauri: string = JSON.parse(readFileSync(join(repo, "app", "tauri.conf.json"), "utf8")).version
  const cargo: string = Bun.TOML.parse(readFileSync(join(repo, "app", "Cargo.toml"), "utf8")).package.version
  const motore = readFileSync(join(repo, "motore", "__init__.py"), "utf8").match(/^VERSIONE = "([^"]+)"/m)?.[1] ?? "(manca VERSIONE)"
  const i = process.argv.indexOf("--tag")
  const tag = i >= 0 ? process.argv[i + 1] : undefined

  const fileNote = join(repo, "app", "installer", "note", `v${tauri}.md`)
  let note: string | undefined
  if (!existsSync(fileNote)) note = `Mancano le note dell'uscita: app/installer/note/v${tauri}.md.`
  else {
    try {
      novita(readFileSync(fileNote, "utf8"))
    } catch (e) {
      note = `app/installer/note/v${tauri}.md: ${(e as Error).message}`
    }
  }

  const errori = erroriDiVersione({ tauri, cargo, motore, tag, note })
  for (const e of errori) console.error(e)
  if (errori.length) process.exit(1)
  console.log(`Versione ${tauri}${tag ? `, tag ${tag}` : ""}.`)
}
