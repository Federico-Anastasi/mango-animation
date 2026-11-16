// Il metodo per Codex dal terminale (`docs/METODO.md`): gli argomenti che gli danno istruzioni, strumento «video» e ambiente, le skill che trova e il programma da lanciare.
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { ambienteDelMetodo, serverVideo } from "../server/src/chat/metodo"
import { stessa } from "./lavoro"
import { regoleDelCreator, testoDelMetodo } from "./metodo"

/** Windows non lancia un programma con più di 32.767 caratteri di argomenti: oltre, Codex non parte. */
const LIMITE_DEGLI_ARGOMENTI = 30_000
/** Uno strumento «video» può aspettare un lavoro fino a 300 secondi (`server/src/mcp/strumenti.ts`): il minuto di Codex lo taglierebbe. */
const SECONDI_PER_UNO_STRUMENTO = 600
const SECONDI_PER_ACCENDERLO = 30

const stringa = (valore: string): string => JSON.stringify(valore)
const lista = (valori: string[]): string => `[${valori.map(stringa).join(",")}]`
const tabella = (valori: Record<string, string>): string => `{${Object.entries(valori).map(([nome, valore]) => `${stringa(nome)}=${stringa(valore)}`).join(",")}}`

const scelte = (ambiente: Record<string, string | undefined>, voglio: (nome: string) => boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(ambiente).filter((voce): voce is [string, string] => voce[1] !== undefined && voglio(voce[0])))

/**
 * Gli argomenti `-c` per Codex: le regole del metodo e del creator come istruzioni, il `CLAUDE.md` del creator come file di istruzioni,
 * lo strumento «video» e l'ambiente dei comandi (`MANGO_ANIMATION_LAVORO`, `PYTHONPATH`). Lo strumento riceve anche le variabili
 * `MANGO_ANIMATION_*` di chi lancia (la porta del server, Python), come le riceve da Claude Code: Codex non gli passa altro dell'ambiente.
 */
export function argomentiDiCodex(radice: string, lavoro: string, ambiente: Record<string, string | undefined>): string[] {
  const istruzioni = [testoDelMetodo(radice, lavoro), ...(stessa(radice, lavoro) ? [] : regoleDelCreator(lavoro))].join("\n\n")
  const ambienteDeiComandi = ambienteDelMetodo(radice, lavoro, ambiente)
  const strumenti = Object.entries(serverVideo(radice, lavoro)).map(([nome, s]) => {
    const env = { ...scelte(ambiente, (n) => n.startsWith("MANGO_ANIMATION_")), ...s.env }
    return `mcp_servers.${nome}={command=${stringa(s.command)},args=${lista(s.args)},env=${tabella(env)},startup_timeout_sec=${SECONDI_PER_ACCENDERLO},tool_timeout_sec=${SECONDI_PER_UNO_STRUMENTO}}`
  })
  const impostazioni = [
    `developer_instructions=${stringa(istruzioni)}`,
    `project_doc_fallback_filenames=${lista(["CLAUDE.md"])}`,
    `shell_environment_policy.set=${tabella(scelte(ambienteDeiComandi, (n) => n === "MANGO_ANIMATION_LAVORO" || n === "PYTHONPATH"))}`,
    ...strumenti,
  ]
  const argomenti = impostazioni.flatMap((i) => ["-c", i])
  const lunghezza = argomenti.reduce((somma, a) => somma + a.length + 1, 0)
  if (lunghezza >= LIMITE_DEGLI_ARGOMENTI)
    throw new Error(`Le istruzioni del metodo e le regole del creator sono lunghe ${lunghezza} caratteri e Codex ne riceve meno di ${LIMITE_DEGLI_ARGOMENTI} dalla riga di comando: accorcia le regole del creator in .claude/rules/.`)
  return argomenti
}

/** Dove sta ogni gruppo di skill, nel nome con cui lo vede Codex: le skill del prodotto e, se ne ha, quelle del creator. */
export const skillDaCollegare = (radice: string, lavoro: string): Record<string, string> => ({
  "mango-animation": join(radice, ".claude", "skills"),
  ...(!stessa(radice, lavoro) && existsSync(join(lavoro, ".claude", "skills")) ? { creator: join(lavoro, ".claude", "skills") } : {}),
})

/**
 * Codex cerca le skill in `.agents/skills/` della cartella in cui lavora e non ha un'impostazione per indicarne un'altra; segue però i
 * collegamenti. Le skill restano quelle di `.claude/skills/` (una copia sola) e un aggiornamento del codice le cambia senza far niente.
 */
export function collegaLeSkill(radice: string, lavoro: string): void {
  mkdirSync(join(lavoro, ".agents", "skills"), { recursive: true })
  for (const [nome, destinazione] of Object.entries(skillDaCollegare(radice, lavoro))) {
    const collegamento = join(lavoro, ".agents", "skills", nome)
    const presente = lstatSync(collegamento, { throwIfNoEntry: false })
    if (presente !== undefined) {
      if (!presente.isSymbolicLink()) throw new Error(`«${collegamento}» c'è già e non è il collegamento che Mango Animation vi mette: spostalo o cancellalo.`)
      if (stessa(readlinkSync(collegamento), destinazione)) continue
      unlinkSync(collegamento)
    }
    symlinkSync(destinazione, collegamento, "junction")
  }
}

/** Il programma `codex`: la variabile dell'app, poi il PATH, poi il pacchetto dello Store di Windows (che non lo mette nel PATH). */
export function trovaCodex(ambiente: Record<string, string | undefined>): string {
  const indicato = ambiente["MANGO_ANIMATION_CODEX"]
  if (indicato) {
    if (!existsSync(indicato)) throw new Error(`Il programma «${indicato}» (MANGO_ANIMATION_CODEX) non c'è: correggi la variabile.`)
    return indicato
  }
  const nelPath = Bun.which("codex")
  if (nelPath !== null) return nelPath
  if (process.platform === "win32") {
    const pacchetto = Bun.spawnSync(["powershell", "-NoProfile", "-Command", "(Get-AppxPackage OpenAI.Codex).InstallLocation"], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim()
    const nelloStore = join(pacchetto, "app", "resources", "codex.exe")
    if (pacchetto !== "" && existsSync(nelloStore)) return nelloStore
  }
  throw new Error("Non trovo Codex: installalo (dal Microsoft Store, o con npm) e collegalo con `codex login`, oppure indica il suo programma in MANGO_ANIMATION_CODEX.")
}
