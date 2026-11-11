// Gli otto passi del metodo, detti a un creator (`.claude/rules/processo.md` li nomina per l'agente). Quale passo è un video
// lo decide il server dai file (`docs/API.md`, `fase`): qui ci sono solo le parole.
import { t } from "../lingua"
import type { Fase } from "../tipi"

export const NUMERO_PASSI = 8

export const nomeDelPasso = (passo: number): string => {
  const nomi = [
    t("Idea", "Idea"),
    t("Copione", "Script"),
    t("Prova", "Rehearsal"),
    t("Riprese", "Filming"),
    t("Animazioni", "Animations"),
    t("Montaggio", "Edit"),
    t("Correzioni", "Corrections"),
    t("Uscita", "Release"),
  ]
  return nomi[passo - 1] ?? ""
}

/** «Passo 3 di 8 · Prova»: la forma corta, per l'elenco e per quando la pagina è stretta. */
export const passoCorto = (fase: Fase): string => t("Passo {passo} di {tutti} · {nome}", "Step {passo} of {tutti} · {nome}", { passo: fase.passo, tutti: NUMERO_PASSI, nome: nomeDelPasso(fase.passo) })

/** Cosa fare adesso: `dire` è la frase che si legge, `scrivi` quella che il bottone mette nel campo della chat (il creator la rilegge e la manda). `null` se non c'è più niente da fare. */
export function cosaFareAdesso(fase: Fase): { dire: string; scrivi: string } | null {
  switch (fase.azione) {
    case "idea":
      return { dire: t("Raccontami l'idea in chat.", "Tell me the idea in the chat."), scrivi: t("Ho un'idea per un video: ", "I have an idea for a video: ") }
    case "copione":
      return { dire: t("Dimmi in chat: «scriviamo il copione».", "Tell me in the chat: “let's write the script”."), scrivi: t("Scriviamo il copione.", "Let's write the script.") }
    case "prova":
      return { dire: t("Dimmi in chat: «fammi la prova».", "Tell me in the chat: “make me the rehearsal”."), scrivi: t("Fammi la prova.", "Make me the rehearsal.") }
    case "riprese":
      return { dire: t("Registra seguendo la prova, poi dimmi in chat: «ti ho mandato i video».", "Record following the rehearsal, then tell me in the chat: “I sent you the videos”."), scrivi: t("Ti ho mandato i video.", "I sent you the videos.") }
    case "testo":
      return { dire: t("Dimmi in chat: «preparami il testo delle riprese».", "Tell me in the chat: “prepare the text of the footage”."), scrivi: t("Preparami il testo delle riprese.", "Prepare the text of the footage.") }
    case "animazioni":
      return { dire: t("Dimmi in chat: «facciamo le animazioni», o «monta il video» se non ne servono.", "Tell me in the chat: “let's make the animations”, or “edit the video” if you do not need any."), scrivi: t("Facciamo le animazioni.", "Let's make the animations.") }
    case "monta":
      return { dire: t("Dimmi in chat: «monta il video».", "Tell me in the chat: “edit the video”."), scrivi: t("Monta il video.", "Edit the video.") }
    case "guarda":
      return { dire: t("Guardalo, poi dimmi in chat cosa cambiare.", "Watch it, then tell me in the chat what to change."), scrivi: t("Ho guardato il video e vorrei cambiare: ", "I watched the video and I would like to change: ") }
    case "correzioni":
      return { dire: t("Dimmi in chat: «rimonta il video».", "Tell me in the chat: “edit the video again”."), scrivi: t("Rimonta il video.", "Edit the video again.") }
    case "pubblica":
      return { dire: t("Dimmi in chat: «scrivi la didascalia»; quando l'hai pubblicato, dimmelo.", "Tell me in the chat: “write the caption”; when you have published it, tell me."), scrivi: t("Scrivi la didascalia e gli hashtag.", "Write the caption and the hashtags.") }
    case "fatto":
      return null
  }
}
