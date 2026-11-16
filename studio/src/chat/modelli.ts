// Modello ed effort della chat: l'elenco dei motori, i nomi per il creator e la scelta che vale per le conversazioni nuove.
import { creaCopia, lettaUnaVolta, type Copia, type StatoCopia } from "../dati"
import { apiChat } from "./api"
import type { StatoNegozio } from "./negozio"
import type { ComandoChat, ImpostazioniChat, LivelloDelModello, LivelloEffort, ModelloChat, MotoreChat } from "./tipi"
import { frasePerLingua, t } from "../lingua"

const normalizzato = (testo: string) => testo.toLowerCase().replace(/[^a-z0-9à-ú]/g, "")

/** Come il creator vede un livello: il nome del modello, nella lingua in uso. */
export const nomeLivello = (livello: LivelloDelModello): string => frasePerLingua(livello.nome.it, livello.nome.en)

/** Il livello che il creator ha scritto, per id o per nome in italiano o in inglese, fra quelli del modello; `null` per il predefinito, `undefined` se non è un livello. */
export function livelloScritto(livelli: LivelloDelModello[], scritto: string): LivelloEffort | null | undefined {
  const cercato = normalizzato(scritto)
  if (cercato === "default" || cercato === "predefinito") return null
  return livelli.find((l) => [l.id, l.nome.it, l.nome.en].some((nome) => normalizzato(nome) === cercato))?.id
}

export const MODELLO_PREDEFINITO = "default"

/** Mango Code o un altro motore che si accende o si spegne cambia i modelli offerti: il server lo annuncia. */
export const modelliChat = creaCopia<ModelloChat[]>(apiChat.modelli, (e) => e.tipo === "modelli")

const copieComandi = new Map<string, Copia<ComandoChat[]>>()

const senzaComandi: StatoCopia<ComandoChat[]> = { dato: [], errore: null, caricato: true }
const nessunComando: Copia<ComandoChat[]> = { stato: () => senzaComandi, iscriviti: () => () => undefined, rileggi: () => Promise.resolve() }

/** I comandi con la barra di un motore che li ha: una copia per motore, letta una volta e di nuovo quando il server dice che sono cambiati. Un motore senza comandi non ne chiede. */
export function comandiDelMotore(motore: MotoreChat | null): Copia<ComandoChat[]> {
  if (motore === null || !motore.capacita.comandi) return nessunComando
  const esistente = copieComandi.get(motore.id)
  if (esistente) return esistente
  const nuova = creaCopia<ComandoChat[]>(() => apiChat.comandi(motore.id), (e) => e.tipo === "comandi")
  copieComandi.set(motore.id, nuova)
  return nuova
}

/** I modelli che la conversazione può scegliere: una già iniziata resta del suo motore, una nuova li ha tutti. */
export function modelliOfferti(modelli: ModelloChat[], chat: Pick<StatoNegozio, "id">, motore: MotoreChat | null): ModelloChat[] {
  return modelli.filter((m) => chat.id === null || m.motore === motore?.id)
}

/** La versione di un modello come [maggiore, minore], dal nome («Opus 5.5»), dal nome vero («claude-opus-5-5») o da un numero solo nel nome («gpt-6-luna»); [0, 0] se non c'è. */
function versioneDi(m: ModelloChat): [number, number] {
  const dalNome = /(\d+)\.(\d+)/.exec(m.nome)
  if (dalNome) return [Number(dalNome[1]), Number(dalNome[2])]
  const vero = /(\d+)-(\d{1,2})(?!\d)/.exec(m.reale.replace(/-\d{8}$/, ""))
  if (vero) return [Number(vero[1]), Number(vero[2])]
  const intero = /\d+/.exec(m.nome)
  return intero ? [Number(intero[0]), 0] : [0, 0]
}

/** Dal più nuovo al più vecchio; a pari versione resta l'ordine dell'elenco. */
const dalPiuRecente = (modelli: ModelloChat[]): ModelloChat[] =>
  [...modelli].sort((a, b) => {
    const [ma, na] = versioneDi(a)
    const [mb, nb] = versioneDi(b)
    return mb - ma || nb - na
  })

/** Il menu corto: di ogni motore «Predefinito» e i tre modelli più recenti (non quello che è già il predefinito); gli altri vanno sotto «Altri». */
export function dividiModelli(offerti: ModelloChat[]): { principali: ModelloChat[]; altri: ModelloChat[] } {
  const recenti = new Set<ModelloChat>()
  for (const motore of new Set(offerti.map((m) => m.motore))) {
    const suoi = offerti.filter((m) => m.motore === motore)
    const reale = suoi.find((m) => m.id === MODELLO_PREDEFINITO)?.reale
    dalPiuRecente(suoi.filter((m) => m.id !== MODELLO_PREDEFINITO && m.reale !== reale))
      .slice(0, 3)
      .forEach((m) => recenti.add(m))
  }
  const sempre = (m: ModelloChat) => m.id === MODELLO_PREDEFINITO || recenti.has(m)
  return { principali: offerti.filter(sempre), altri: offerti.filter((m) => !sempre(m)) }
}

/** Il modello che il motore indica per il primo giro; se non ne indica uno, l'Opus più recente che offre (non la variante a contesto lungo, se c'è l'altra); `undefined` se non c'è. */
export function modelloGrande(motore: MotoreChat, modelli: ModelloChat[]): ModelloChat | undefined {
  const suoi = modelli.filter((m) => m.motore === motore.id)
  const indicato = suoi.find((m) => m.id === motore.modello_grande)
  if (indicato) return indicato
  const opus = dalPiuRecente(suoi.filter((m) => m.id !== MODELLO_PREDEFINITO && /opus/i.test(m.id + m.reale)))
  return opus.find((m) => !m.id.includes("[")) ?? opus[0]
}

/** Il modello con cui parte un motore senza una scelta: il suo «Predefinito» o, se non ce l'ha, il primo che offre. */
export const predefinitoDi = (motore: MotoreChat, modelli: ModelloChat[]): string | null =>
  (modelli.find((m) => m.motore === motore.id && m.id === MODELLO_PREDEFINITO) ?? modelli.find((m) => m.motore === motore.id))?.id ?? (motore.prefisso === null ? MODELLO_PREDEFINITO : null)

/** I modelli, aspettando che la prima lettura sia finita; `null` se non si sono potuti leggere. */
export const modelliLetti = (): Promise<ModelloChat[] | null> => lettaUnaVolta(modelliChat)

/** La riga dell'elenco per un modello: per nome, per modello vero (ciò che Claude Code dice di aver acceso), o il predefinito se non c'è scelta. */
export const modelloScelto = (modelli: ModelloChat[], modello: string | null): ModelloChat | undefined =>
  modelli.find((m) => m.id === (modello ?? MODELLO_PREDEFINITO)) ?? modelli.find((m) => m.reale === modello)

/** Come scrivere il modello di una conversazione che l'elenco non ha: il motore spento, un modello che non è più offerto, o quello che si sa. */
export function nomeFuoriElenco(motore: MotoreChat | null, modello: string | null): string {
  if (modello === null) return t("Predefinito", "Default")
  if (motore === null) return modello
  if (!motore.pronto) return t("{nome} (spento)", "{nome} (off)", { nome: motore.nome })
  if (motore.prefisso !== null && modello.startsWith(motore.prefisso)) return `${motore.nome} · ${modello.slice(motore.prefisso.length)}`
  return modello
}

/** Come il server: cambiando modello, l'effort che il nuovo non ha torna al predefinito. */
export function correggi(modelli: ModelloChat[], corrente: ImpostazioniChat, scelta: Partial<ImpostazioniChat>): ImpostazioniChat {
  const modello = scelta.modello === undefined ? corrente.modello : scelta.modello
  const effort = scelta.effort === undefined ? corrente.effort : scelta.effort
  const livelli = modelloScelto(modelli, modello)?.effort
  return { modello, effort: effort !== null && livelli && !livelli.some((l) => l.id === effort) ? null : effort }
}

const CHIAVE = "mango-animation.chat.impostazioni"

/** La scelta fatta per ultima: è quella con cui parte una conversazione nuova. */
export function leggiPredefinite(): ImpostazioniChat {
  try {
    const letto: unknown = JSON.parse(localStorage.getItem(CHIAVE) ?? "null")
    if (typeof letto !== "object" || letto === null) return { modello: null, effort: null }
    const modello = "modello" in letto && typeof letto.modello === "string" ? letto.modello : null
    const effort = "effort" in letto && typeof letto.effort === "string" ? letto.effort : null
    return { modello, effort }
  } catch {
    return { modello: null, effort: null }
  }
}

export function ricordaPredefinite(impostazioni: ImpostazioniChat): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(impostazioni))
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
}
