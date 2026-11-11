import { useEffect } from "react"
import cornice from "../cornice/Cornice.module.css"
import { IconaChat } from "./icone"
import { motoreDellaChat } from "./motore"
import { useChat } from "./negozio"
import { commutaChat, usePannelloChat } from "./pannello"
import { t } from "../lingua"

/** Ctrl+J (Cmd+J) apre e chiude la chat da qualunque vista. */
export function useScorciatoiaChat(): void {
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault()
        commutaChat()
      }
    }
    document.addEventListener("keydown", tasto)
    return () => document.removeEventListener("keydown", tasto)
  }, [])
}

function etichettaChat(chi: string | undefined, aspetta: boolean, lavora: boolean): string {
  if (aspetta) return chi ? t("Chat: {chi} aspetta una risposta", "Chat: {chi} is waiting for a reply", { chi }) : t("Chat: aspetta una risposta", "Chat: waiting for a reply")
  if (lavora) return chi ? t("Chat: {chi} sta lavorando", "Chat: {chi} is working", { chi }) : t("Chat: sta lavorando", "Chat: working")
  return t("Chat", "Chat")
}

/** Il bottone nella barra: apre la chat, e dice se chi risponde aspetta una risposta o sta lavorando. */
export function BottoneChat() {
  const { aperta } = usePannelloChat()
  const chat = useChat()
  const { stato, inAttesa } = chat
  const chi = motoreDellaChat(chat)?.corto ?? undefined
  const aspetta = inAttesa.length > 0
  const etichetta = etichettaChat(chi, aspetta, stato === "lavora")
  return (
    <button type="button" className={cornice.stato} aria-pressed={aperta} aria-label={etichetta} title={`${etichetta} (Ctrl+J)`} onClick={commutaChat}>
      <IconaChat nome="chat" />
      <span>{t("Chat", "Chat")}</span>
      <span className={aspetta || stato === "lavora" ? cornice.puntoRosso : cornice.puntoGrigio} aria-hidden="true" />
    </button>
  )
}
