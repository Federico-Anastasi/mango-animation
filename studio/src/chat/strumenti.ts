// Come la chat dice uno strumento di Claude Code: un verbo e l'oggetto, mai il nome interno.
import { t } from "../lingua"

export type IconaStrumento = "libro" | "matita" | "terminale" | "lente" | "globo" | "agente" | "bacchetta" | "elenco" | "domanda" | "video" | "foto" | "ingranaggio"

export interface DescrizioneStrumento {
  etichetta: string
  icona: IconaStrumento
  /** Il comando o il percorso, per mostrarlo a parte se serve. */
  dettaglio?: string
}

type Ingresso = Record<string, unknown>

const comeOggetto = (ingresso: unknown): Ingresso => (typeof ingresso === "object" && ingresso !== null && !Array.isArray(ingresso) ? (ingresso as Ingresso) : {})
const testo = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined)
const taglia = (s: string, max: number): string => {
  const riga = s.split("\n")[0]!.trim()
  return riga.length > max ? `${riga.slice(0, max - 1).trimEnd()}…` : riga
}

/** Un percorso nella cartella del lavoro si scrive corto: «docs/PIANO.md», non il percorso intero del computer. */
export function percorsoCorto(percorso: string): string {
  const dritto = percorso.replace(/\\/g, "/")
  const dentro = /\/mango-animation\/(.+)$/.exec(dritto)
  if (dentro) return dentro[1]!
  const archivio = /\/(archivio\/.+)$/.exec(dritto)
  if (archivio) return archivio[1]!
  const pezzi = dritto.split("/").filter(Boolean)
  return pezzi.length > 3 ? `…/${pezzi.slice(-3).join("/")}` : dritto
}

const RADICE = String.raw`(?:[A-Za-z]:|/|~)`
const CD_ASSOLUTO = new RegExp(String.raw`(^|&&|;)\s*cd\s+(?:"${RADICE}[^"]*"|'${RADICE}[^']*'|${RADICE}[^\s&;|]*)\s*(?:&&|;)\s*`)

/** Il comando senza i `cd` a una cartella intera davanti: si legge cosa fa, non dove sta il lavoro. Un `cd` relativo resta. */
function senzaCdIniziale(comando: string): string {
  let corrente = comando.trim()
  for (let precedente = ""; precedente !== corrente; ) {
    precedente = corrente
    corrente = corrente.replace(CD_ASSOLUTO, "$1 ").trim()
  }
  return corrente === "" ? comando : corrente
}

function nomeVideo(nome: string): string | undefined {
  switch (nome) {
    case "video_elenco":
      return t("elenco dei video", "list of videos")
    case "video_leggi":
      return t("legge", "reads")
    case "scheda_cambia":
      return t("cambia la scheda", "changes the card")
    case "piano_scrivi":
      return t("scrive il piano", "writes the plan")
    case "piano_annulla":
      return t("annulla l'ultimo cambio del piano", "undoes the last plan change")
    case "valida":
      return t("controlla il piano", "checks the plan")
    case "parole":
      return t("legge le parole", "reads the words")
    case "foto":
      return t("guarda i fotogrammi", "looks at the frames")
    case "scene_foto":
      return t("guarda le scene", "looks at the scenes")
    case "slide":
      return t("guarda le slide", "looks at the slides")
    case "girato_prepara":
      return t("prepara un file del girato", "prepares a footage file")
    case "girato_scarica":
      return t("scarica dal web", "downloads from the web")
    case "lavoro":
      return t("lavoro", "job")
    case "lavoro_stato":
      return t("stato del lavoro", "job status")
    case "lavoro_aspetta":
      return t("aspetta il lavoro", "waits for the job")
    default:
      return undefined
  }
}

function descriviVideo(nome: string, ingresso: Ingresso): DescrizioneStrumento {
  const comando = nome === "lavoro" ? testo(ingresso.comando) : undefined
  const parole = [nomeVideo(nome) ?? nome.replace(/_/g, " "), comando, testo(ingresso.slug) ?? testo(ingresso.video)]
  return { etichetta: t("Video · {parole}", "Video · {parole}", { parole: parole.filter(Boolean).join(" ") }), icona: nome === "foto" || nome === "scene_foto" ? "foto" : "video" }
}

export function descriviStrumento(nome: string, ingressoGrezzo: unknown): DescrizioneStrumento {
  const ingresso = comeOggetto(ingressoGrezzo)
  const file = testo(ingresso.file_path) ?? testo(ingresso.path) ?? testo(ingresso.notebook_path)
  switch (nome) {
    case "Read":
      return { etichetta: file ? t("Legge {file}", "Reads {file}", { file: percorsoCorto(file) }) : t("Legge un file", "Reads a file"), icona: "libro", dettaglio: file }
    case "Write":
      return { etichetta: file ? t("Scrive {file}", "Writes {file}", { file: percorsoCorto(file) }) : t("Scrive un file", "Writes a file"), icona: "matita", dettaglio: file }
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return { etichetta: file ? t("Modifica {file}", "Edits {file}", { file: percorsoCorto(file) }) : t("Modifica un file", "Edits a file"), icona: "matita", dettaglio: file }
    case "Bash": {
      const comando = testo(ingresso.command)
      const cosaFa = testo(ingresso.description)
      const etichetta = cosaFa ? taglia(cosaFa, 70) : comando ? t("Lancia: {comando}", "Runs: {comando}", { comando: taglia(senzaCdIniziale(comando), 70) }) : t("Lancia un comando", "Runs a command")
      return { etichetta, icona: "terminale", dettaglio: comando }
    }
    case "BashOutput":
    case "KillShell":
      return { etichetta: nome === "BashOutput" ? t("Guarda l'uscita del comando", "Checks the command output") : t("Ferma un comando", "Stops a command"), icona: "terminale" }
    case "Grep": {
      const cerca = testo(ingresso.pattern)
      return { etichetta: cerca ? t("Cerca «{cosa}»", "Searches for “{cosa}”", { cosa: taglia(cerca, 50) }) : t("Cerca nei file", "Searches the files"), icona: "lente" }
    }
    case "LS":
      return { etichetta: file ? t("Elenca i file {file}", "Lists the files in {file}", { file: percorsoCorto(file) }) : t("Elenca i file", "Lists files"), icona: "lente", dettaglio: file }
    case "Glob": {
      const cerca = testo(ingresso.pattern)
      return { etichetta: cerca ? t("Cerca i file «{cosa}»", "Finds files “{cosa}”", { cosa: taglia(cerca, 50) }) : t("Cerca i file", "Finds files"), icona: "lente" }
    }
    case "WebFetch": {
      const indirizzo = testo(ingresso.url)
      let sito = indirizzo
      try {
        if (indirizzo) sito = new URL(indirizzo).host
      } catch {
        // Un indirizzo che non si legge si mostra com'è.
      }
      return { etichetta: sito ? t("Apre {sito}", "Opens {sito}", { sito }) : t("Apre una pagina web", "Opens a web page"), icona: "globo", dettaglio: indirizzo }
    }
    case "WebSearch": {
      const cerca = testo(ingresso.query)
      return { etichetta: cerca ? t("Cerca sul web «{cosa}»", "Searches the web for “{cosa}”", { cosa: taglia(cerca, 50) }) : t("Cerca sul web", "Searches the web"), icona: "globo" }
    }
    case "Task":
    case "Agent": {
      const cosa = testo(ingresso.description)
      return { etichetta: cosa ? t("Aiutante: {cosa}", "Helper: {cosa}", { cosa: taglia(cosa, 60) }) : t("Manda un aiutante", "Sends a helper"), icona: "agente" }
    }
    case "Skill": {
      const quale = testo(ingresso.skill) ?? testo(ingresso.name)
      return { etichetta: quale ? t("Usa la guida «{quale}»", "Uses the guide “{quale}”", { quale }) : t("Usa una guida", "Uses a guide"), icona: "bacchetta" }
    }
    case "ToolSearch":
      return { etichetta: t("Cerca uno strumento", "Looks for a tool"), icona: "lente" }
    case "TodoWrite":
      return { etichetta: t("Aggiorna l'elenco dei passi", "Updates the list of steps"), icona: "elenco" }
    case "AskUserQuestion":
      return { etichetta: t("Ti fa una domanda", "Asks you a question"), icona: "domanda" }
    case "ExitPlanMode":
      return { etichetta: t("Propone il piano", "Proposes the plan"), icona: "elenco" }
  }
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(nome)
  if (mcp) {
    const [, server = "", strumento = ""] = mcp
    if (server === "video") return descriviVideo(strumento, ingresso)
    return { etichetta: `${server.replace(/_/g, " ")} · ${strumento.replace(/_/g, " ")}`, icona: "ingranaggio" }
  }
  return { etichetta: t("Usa lo strumento «{nome}»", "Uses the tool “{nome}”", { nome }), icona: "ingranaggio" }
}

/** Un esito di strumento come testo: una stringa com'è, il resto scritto in JSON. */
export function esitoComeTesto(esito: unknown): string {
  if (typeof esito === "string") return esito
  if (esito === undefined || esito === null) return ""
  try {
    return JSON.stringify(esito, null, 2)
  } catch {
    return String(esito)
  }
}

export function ingressoComeTesto(ingresso: unknown): string {
  const comando = testo(comeOggetto(ingresso).command)
  if (comando) return comando
  return esitoComeTesto(ingresso)
}
