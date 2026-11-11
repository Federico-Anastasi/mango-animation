// Scrive `latest.json`, il file che l'app scarica per sapere se c'è una versione nuova (`docs/APP.md`, «Installer e aggiornamenti»): versione, note, firma e indirizzo dell'installatore.
// Uso: bun run installer/pubblica.ts --versione 0.1.2 --indirizzo <dove sta l'installatore, senza il nome del file> (--note-file <note/v0.1.2.md> | --note "…") [--cartella <bundle/nsis>]
// Con `--note-file` le note di `latest.json` sono l'elenco sotto «**Changed since …**» delle note dell'uscita, come testo semplice: è ciò che la pagina d'attesa mostra a chi aggiorna.
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export interface Latest {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

export function latest(versione: string, note: string, firma: string, url: string, data: Date): Latest {
  return { version: versione, notes: note, pub_date: data.toISOString(), platforms: { "windows-x86_64": { signature: firma.trim(), url } } }
}

/** L'elenco sotto «**Changed since …**» delle note dell'uscita, una riga «- » per voce, senza i segni di Markdown. */
export function novita(markdown: string): string {
  const righe = markdown.replace(/\r\n/g, "\n").split("\n")
  const inizio = righe.findIndex((r) => /^\*\*Changed since .+\*\*\s*$/.test(r))
  if (inizio < 0) throw new Error("Le note dell'uscita non hanno l'elenco «**Changed since …**»: è quello che chi aggiorna legge.")
  const voci: string[] = []
  for (const riga of righe.slice(inizio + 1)) {
    if (riga.startsWith("**")) break
    if (/^[-*] /.test(riga)) voci.push(riga.replace(/^[-*] /, "- "))
    else if (/^\s+\S/.test(riga) && voci.length) voci[voci.length - 1] += ` ${riga.trim()}`
    else if (voci.length) break
  }
  if (!voci.length) throw new Error("L'elenco «**Changed since …**» delle note dell'uscita è vuoto.")
  return voci.map((v) => v.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "")).join("\n")
}

const argomento = (nome: string): string | undefined => {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Il nome che GitHub dà a un file caricato in un'uscita: gli spazi diventano punti. L'indirizzo in `latest.json` deve usare questo. */
export const nomeSuGithub = (file: string): string => file.replaceAll(" ", ".")

if (import.meta.main) {
  const versione = argomento("versione")
  const indirizzo = argomento("indirizzo")
  if (!versione || !indirizzo) throw new Error("Servono --versione e --indirizzo (dove l'installatore sarà scaricabile, senza il nome del file).")
  const cartella = argomento("cartella") ?? join(import.meta.dir, "..", "target", "release", "bundle", "nsis")
  const installatore = (await readdir(cartella)).find((f) => f.includes(`_${versione}_`) && f.endsWith("-setup.exe"))
  if (!installatore) throw new Error(`In ${cartella} non c'è l'installatore della versione ${versione}: si fa con «bun run installer/costruisci.ts».`)
  const firma = await readFile(join(cartella, `${installatore}.sig`), "utf8").catch(() => {
    throw new Error(`Manca ${installatore}.sig: l'installatore va firmato (la chiave di firma al momento di costruirlo, docs/APP.md, «La firma»).`)
  })
  const url = `${indirizzo.replace(/\/$/, "")}/${encodeURIComponent(nomeSuGithub(installatore))}`
  const fileNote = argomento("note-file")
  const note = fileNote ? novita(await readFile(fileNote, "utf8")) : argomento("note")
  if (!note) throw new Error("Servono --note-file <le note dell'uscita> oppure --note \"…\": chi aggiorna legge le novità della versione.")
  await writeFile(join(cartella, "latest.json"), `${JSON.stringify(latest(versione, note, firma, url, new Date()), null, 2)}\n`)
  console.log(`Scritto ${join(cartella, "latest.json")} per ${installatore}`)
}
