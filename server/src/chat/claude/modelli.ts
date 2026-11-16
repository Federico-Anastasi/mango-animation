// I modelli di Claude Code come li mostra la chat.
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk"
import { frase, nellaLinguaDi } from "../../lingua"
import { livelloDi } from "../livelli"
import { MODELLO_PREDEFINITO, type ModelloChat } from "../tipi"

/** Le righe dell'SDK come le vede il creator: il predefinito dice quale modello è. */
export function traduciModelli(info: ModelInfo[], motore: string): ModelloChat[] {
  return info.map((m) => {
    const reale = m.resolvedModel ?? m.value
    const quale = m.value === MODELLO_PREDEFINITO ? info.find((altro) => altro.value !== MODELLO_PREDEFINITO && altro.resolvedModel === reale)?.displayName : undefined
    return {
      id: m.value,
      nome: m.value === MODELLO_PREDEFINITO ? (quale ? frase(`Predefinito (${quale})`, `Default (${quale})`) : frase("Predefinito", "Default")) : m.displayName,
      descrizione: m.description,
      motore,
      effort: (m.supportedEffortLevels ?? []).map(livelloDi),
      reale,
    }
  })
}

/** La versione di un modello come [maggiore, minore], dal nome («Opus 5.5») o dal nome vero («claude-opus-5-5»); [0, 0] se non c'è. */
function versioneDi(m: ModelloChat): [number, number] {
  const dalNome = /(\d+)\.(\d+)/.exec(nellaLinguaDi(m.nome, "en"))
  if (dalNome) return [Number(dalNome[1]), Number(dalNome[2])]
  const vero = /(\d+)-(\d{1,2})(?!\d)/.exec(m.reale.replace(/-\d{8}$/, ""))
  return vero ? [Number(vero[1]), Number(vero[2])] : [0, 0]
}

/** L'Opus più recente (non la variante a contesto lungo, se c'è l'altra), per il primo giro; `null` se l'elenco non ne ha. */
export function modelloGrande(modelli: ModelloChat[]): string | null {
  const opus = modelli
    .filter((m) => m.id !== MODELLO_PREDEFINITO && /opus/i.test(m.id + m.reale))
    .sort((a, b) => {
      const [ma, na] = versioneDi(a)
      const [mb, nb] = versioneDi(b)
      return mb - ma || nb - na
    })
  return (opus.find((m) => !m.id.includes("[")) ?? opus[0])?.id ?? null
}
