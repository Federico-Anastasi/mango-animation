// Modello ed effort della chat: l'elenco di Claude Code, i nomi per il creator e la scelta che vale per le conversazioni nuove.
import { creaCopia } from "../dati"
import { apiChat } from "./api"
import { motoreDellaChat, motoreDi, MOTORE_CHAT } from "./motore"
import type { StatoNegozio } from "./negozio"
import type { ComandoChat, ImpostazioniChat, LivelloEffort, ModelloChat } from "./tipi"
import { t } from "../lingua"

const LIVELLI: readonly string[] = ["low", "medium", "high", "xhigh", "max"]

export function nomeEffort(livello: LivelloEffort): string {
  switch (livello) {
    case "low":
      return t("Basso", "Low")
    case "medium":
      return t("Medio", "Medium")
    case "high":
      return t("Alto", "High")
    case "xhigh":
      return t("Molto alto", "Very high")
    case "max":
      return t("Massimo", "Maximum")
  }
}
const SCRITTI_EFFORT: Record<LivelloEffort, string[]> = {
  low: ["low", "basso"],
  medium: ["medium", "medio"],
  high: ["high", "alto"],
  xhigh: ["xhigh", "molto alto", "very high"],
  max: ["max", "massimo", "maximum"],
}

const soloLettere = (testo: string) => testo.toLowerCase().replace(/[^a-zà-ú]/g, "")

/** Il livello che il creator ha scritto, con i nomi dello studio in italiano e in inglese; `null` per il predefinito, `undefined` se non è un livello. */
export function livelloScritto(scritto: string): LivelloEffort | null | undefined {
  const cercato = soloLettere(scritto)
  if (cercato === "default" || cercato === "predefinito") return null
  return (Object.keys(SCRITTI_EFFORT) as LivelloEffort[]).find((l) => SCRITTI_EFFORT[l].some((nome) => soloLettere(nome) === cercato))
}

export const MODELLO_PREDEFINITO = "default"

/** L'elenco non cambia mentre il server è acceso: si legge una volta, nessun evento lo rilegge. */
// Mango Code che si accende o si spegne cambia i modelli offerti: il server lo annuncia.
export const modelliChat = creaCopia<ModelloChat[]>(apiChat.modelli, (e) => e.tipo === "modelli")

/** I comandi con la barra di Claude Code: si leggono una volta, e di nuovo quando il server dice che sono cambiati. */
export const comandiChat = creaCopia<ComandoChat[]>(apiChat.comandi, (e) => e.tipo === "comandi")

/** I modelli che la conversazione può scegliere: una già iniziata resta del suo motore, una nuova li ha tutti. */
export function modelliOfferti(modelli: ModelloChat[], chat: Pick<StatoNegozio, "id" | "caricato" | "errore" | "modello">): ModelloChat[] {
  const motore = motoreDellaChat(chat)
  return modelli.filter((m) => chat.id === null || motoreDi(m.id).id === motore?.id)
}

/** La versione di un modello come [maggiore, minore], dal nome («Opus 5.5») o dal nome vero («claude-opus-5-5»); [0, 0] se non c'è. */
function versioneDi(m: ModelloChat): [number, number] {
  const dalNome = /(\d+)\.(\d+)/.exec(m.nome)
  if (dalNome) return [Number(dalNome[1]), Number(dalNome[2])]
  const vero = /(\d+)-(\d{1,2})(?!\d)/.exec(m.reale.replace(/-\d{8}$/, ""))
  return vero ? [Number(vero[1]), Number(vero[2])] : [0, 0]
}

/** Dal più nuovo al più vecchio; a pari versione resta l'ordine dell'elenco. */
const dalPiuRecente = (modelli: ModelloChat[]): ModelloChat[] =>
  [...modelli].sort((a, b) => {
    const [ma, na] = versioneDi(a)
    const [mb, nb] = versioneDi(b)
    return mb - ma || nb - na
  })

const diClaude = (m: ModelloChat) => m.id !== MODELLO_PREDEFINITO && motoreDi(m.id).id === MOTORE_CHAT.id

/** Il menu corto: «Predefinito», i tre modelli di Claude più recenti (non quello che è già il predefinito) e quelli di Mango Code; gli altri vanno sotto «Altri». */
export function dividiModelli(offerti: ModelloChat[]): { principali: ModelloChat[]; altri: ModelloChat[] } {
  const reale = offerti.find((m) => m.id === MODELLO_PREDEFINITO)?.reale
  const recenti = new Set(dalPiuRecente(offerti.filter((m) => diClaude(m) && m.reale !== reale)).slice(0, 3))
  return { principali: offerti.filter((m) => !diClaude(m) || recenti.has(m)), altri: offerti.filter((m) => diClaude(m) && !recenti.has(m)) }
}

/** L'Opus più recente che Claude offre (non la variante a contesto lungo, se c'è l'altra); `undefined` se l'elenco non ne ha. */
export function opusPiuRecente(modelli: ModelloChat[]): ModelloChat | undefined {
  const opus = dalPiuRecente(modelli.filter((m) => diClaude(m) && /opus/i.test(m.id + m.reale)))
  return opus.find((m) => !m.id.includes("[")) ?? opus[0]
}

/** I modelli, aspettando che la prima lettura sia finita; `null` se non si sono potuti leggere. */
export function modelliLetti(): Promise<ModelloChat[] | null> {
  if (modelliChat.stato().caricato) return Promise.resolve(modelliChat.stato().dato)
  return new Promise((risolvi) => {
    const smetti = modelliChat.iscriviti(() => {
      if (!modelliChat.stato().caricato) return
      smetti()
      risolvi(modelliChat.stato().dato)
    })
  })
}

/** La riga dell'elenco per un modello: per nome, per modello vero (ciò che Claude Code dice di aver acceso), o il predefinito se non c'è scelta. */
export const modelloScelto = (modelli: ModelloChat[], modello: string | null): ModelloChat | undefined =>
  modelli.find((m) => m.id === (modello ?? MODELLO_PREDEFINITO)) ?? modelli.find((m) => m.reale === modello)

/** Come scrivere il modello di una conversazione che l'elenco non ha: Mango Code spento, un modello che non è più offerto, o quello che si sa. */
export function nomeFuoriElenco(modelli: ModelloChat[], modello: string | null): string {
  if (modello === null) return t("Predefinito", "Default")
  if (!modello.startsWith("mango-code/")) return modello
  return modelli.some((m) => m.id.startsWith("mango-code/")) ? `Mango Code · ${modello.slice("mango-code/".length)}` : t("Mango Code (spento)", "Mango Code (off)")
}

/** Come il server: cambiando modello, l'effort che il nuovo non ha torna al predefinito. */
export function correggi(modelli: ModelloChat[], corrente: ImpostazioniChat, scelta: Partial<ImpostazioniChat>): ImpostazioniChat {
  const modello = scelta.modello === undefined ? corrente.modello : scelta.modello
  const effort = scelta.effort === undefined ? corrente.effort : scelta.effort
  const livelli = modelloScelto(modelli, modello)?.effort
  return { modello, effort: effort !== null && livelli && !livelli.includes(effort) ? null : effort }
}

const CHIAVE = "mango-animation.chat.impostazioni"

/** La scelta fatta per ultima: è quella con cui parte una conversazione nuova. */
export function leggiPredefinite(): ImpostazioniChat {
  try {
    const letto: unknown = JSON.parse(localStorage.getItem(CHIAVE) ?? "null")
    if (typeof letto !== "object" || letto === null) return { modello: null, effort: null }
    const modello = "modello" in letto && typeof letto.modello === "string" ? letto.modello : null
    const effort = "effort" in letto && typeof letto.effort === "string" && LIVELLI.includes(letto.effort) ? (letto.effort as LivelloEffort) : null
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
