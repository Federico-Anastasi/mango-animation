// Le conversazioni di Claude Code di questa cartella, lette dai loro file (`~/.claude/projects/<cartella>/<id>.jsonl`) con le funzioni dell'SDK.
import { getSessionInfo, getSessionMessages, listSessions, type SDKSessionInfo, type SessionMessage } from "@anthropic-ai/claude-agent-sdk"
import { mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { eOggetto, leggiTesto } from "../disco"
import { osserva } from "../osservatore"

import type { MessaggioSessione, Sessioni, VoceSessione } from "./tipi"

/** Come Claude Code chiama la cartella di un progetto: ogni carattere che non è lettera o cifra diventa un trattino. */
export const cartellaDelProgetto = (radice: string): string => resolve(radice).replace(/[^a-zA-Z0-9]/g, "-")

/** Dove Claude Code tiene i file delle conversazioni di una cartella di lavoro. */
export const cartellaDelleSessioni = (radice: string, cartellaDiClaude = process.env["CLAUDE_CONFIG_DIR"] || join(homedir(), ".claude")): string => join(cartellaDiClaude, "projects", cartellaDelProgetto(radice))

export const stessaCartella = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/**
 * Le conversazioni di questa cartella, col titolo che Claude Code mostra in `/resume` (quello dato alla conversazione, o il primo
 * messaggio). L'SDK include anche i worktree del repo, che non si riprendono da qui; una conversazione fatta solo di comandi
 * («/clear», «/login») non ha niente da riprendere.
 */
export const vociDaSessioni = (sessioni: SDKSessionInfo[], radice: string): VoceSessione[] =>
  sessioni
    .filter((s) => s.cwd === undefined || stessaCartella(s.cwd, radice))
    .filter((s) => s.customTitle !== undefined || !s.summary.trimStart().startsWith("/"))
    .map((s) => ({ id: s.sessionId, titolo: s.customTitle ?? s.summary, aggiornata: s.lastModified }))

/** Di una riga `system` del file, ciò che l'SDK non dà e la chat legge. */
interface RigaDiSistema {
  subtype: string
  content?: string
}

const SOTTOTIPI_LETTI = ["local_command", "compact_boundary"]

/**
 * `getSessionMessages` dà le righe `system` solo con il loro `uuid` e l'orario, senza `subtype` né `content`: la risposta di un comando
 * locale (`/model`, `/context`…) e il riassunto della conversazione si leggono dal file.
 */
async function righeDiSistema(file: string): Promise<Map<string, RigaDiSistema>> {
  const righe = new Map<string, RigaDiSistema>()
  const testo = await leggiTesto(file)
  if (testo === null) return righe
  for (const linea of testo.split(/\r?\n/)) {
    if (!SOTTOTIPI_LETTI.some((s) => linea.includes(s))) continue
    let riga: unknown
    try {
      riga = JSON.parse(linea)
    } catch {
      // L'ultima riga può essere scritta a metà mentre Claude Code scrive: la prossima lettura la trova intera.
      continue
    }
    if (!eOggetto(riga) || riga["type"] !== "system" || typeof riga["uuid"] !== "string" || typeof riga["subtype"] !== "string" || !SOTTOTIPI_LETTI.includes(riga["subtype"])) continue
    righe.set(riga["uuid"], { subtype: riga["subtype"], ...(typeof riga["content"] === "string" ? { content: riga["content"] } : {}) })
  }
  return righe
}

/** Le righe di una conversazione nella forma che la chat legge; le righe `system` che la chat non usa restano fuori. */
function righeDaSessione(messaggi: SessionMessage[], sistema: Map<string, RigaDiSistema>): MessaggioSessione[] {
  return messaggi.flatMap((m): MessaggioSessione[] => {
    // I campi oltre a quelli dichiarati ci sono nel file: `timestamp`, `origin`, `isCompactSummary`.
    const extra: Record<string, unknown> = { ...m }
    const origine = extra["origin"]
    const comune = {
      type: m.type,
      uuid: m.uuid,
      message: m.message,
      ...(typeof extra["timestamp"] === "string" ? { timestamp: extra["timestamp"] } : {}),
      ...(eOggetto(origine) && typeof origine["kind"] === "string" ? { origin: { kind: origine["kind"] } } : {}),
      ...(extra["isCompactSummary"] === true ? { isCompactSummary: true } : {}),
    }
    if (m.type !== "system") return [comune]
    const riga = sistema.get(m.uuid)
    return riga ? [{ ...comune, ...riga }] : []
  })
}

export function sessioniDiClaudeCode(radice: string, rimbalzoMs: number, cartellaDiClaude = process.env["CLAUDE_CONFIG_DIR"] || join(homedir(), ".claude")): Sessioni {
  return {
    async elenca() {
      return vociDaSessioni(await listSessions({ dir: radice }), radice)
    },

    async leggi(id) {
      const messaggi = await getSessionMessages(id, { dir: radice, includeSystemMessages: true })
      if (messaggi.length === 0 && (await getSessionInfo(id, { dir: radice })) === undefined) return null
      const conSistema = messaggi.some((m) => m.type === "system")
      const sistema = conSistema ? await righeDiSistema(join(cartellaDelleSessioni(radice, cartellaDiClaude), `${id}.jsonl`)) : new Map<string, RigaDiSistema>()
      return righeDaSessione(messaggi, sistema)
    },

    async osserva(alCambio) {
      const cartella = cartellaDelleSessioni(radice, cartellaDiClaude)
      await mkdir(cartella, { recursive: true })
      return osserva(cartella, {
        ricorsivo: false,
        rimbalzoMs,
        ignora: (relativo) => !relativo.endsWith(".jsonl"),
        alCambio: async (relativi) => relativi.forEach((r) => alCambio(r.slice(0, -".jsonl".length))),
      })
    },
  }
}
