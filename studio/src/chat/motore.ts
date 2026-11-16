// Con cosa parla la chat: i motori li dà il server (`GET /api/chat/motori`), lo studio non ne conosce nessuno.
// Il segno e il nome nella testata e nelle frasi sono dei motori che le frasi nominano (`nelle_frasi`): gli altri non hanno nome suo.
import { creaCopia, lettaUnaVolta, useCopia } from "../dati"
import { apiChat } from "./api"
import type { NomeIconaChat } from "./icone"
import { modelliChat } from "./modelli"
import type { StatoNegozio } from "./negozio"
import type { ModelloChat, MotoreChat } from "./tipi"

/** L'elenco dei motori, nell'ordine in cui il server li dà. Cambia quando un motore si accende o si spegne: come i modelli. */
export const motoriChat = creaCopia<MotoreChat[]>(apiChat.motori, (e) => e.tipo === "modelli")

/** I motori, aspettando che la prima lettura sia finita; `null` se non si sono potuti leggere. */
export const motoriLetti = (): Promise<MotoreChat[] | null> => lettaUnaVolta(motoriChat)

/** Il segno piccolo accanto al nome nella testata; `null` se la testata non dice con chi si parla. */
export const iconaDelMotore = (motore: MotoreChat): NomeIconaChat | null => (motore.nelle_frasi === null ? null : "agente")

/** Il motore a cui va una scelta senza modello: quello i cui modelli non hanno prefisso, altrimenti il primo dell'elenco. */
const motorePredefinito = (motori: MotoreChat[]): MotoreChat | undefined => motori.find((m) => m.prefisso === null) ?? motori[0]

/** Il motore di un modello: quello che l'elenco dei modelli gli dà; per un modello fuori elenco, quello il cui prefisso lo apre. */
export function motoreDelModello(motori: MotoreChat[], modelli: ModelloChat[], modello: string | null): MotoreChat | undefined {
  if (modello === null) return motorePredefinito(motori)
  const dalModello = (modelli.find((m) => m.id === modello) ?? modelli.find((m) => m.reale === modello))?.motore
  if (dalModello !== undefined) return motori.find((m) => m.id === dalModello)
  return motori.find((m) => m.prefisso !== null && modello.startsWith(m.prefisso)) ?? motorePredefinito(motori)
}

/** Il motore della conversazione aperta; `null` finché non si sa (una conversazione che si sta ancora aprendo, o che non si apre). */
export function motoreDellaChat(chat: Pick<StatoNegozio, "id" | "motore" | "modello">, motori: MotoreChat[], modelli: ModelloChat[]): MotoreChat | null {
  if (chat.id === null) return motoreDelModello(motori, modelli, chat.modello) ?? null
  return motori.find((m) => m.id === chat.motore) ?? null
}

/** Il motore della conversazione aperta, riletto quando il server cambia i motori o i modelli. */
export function useMotoreDellaChat(chat: Pick<StatoNegozio, "id" | "motore" | "modello">): MotoreChat | null {
  const motori = useCopia(motoriChat).dato
  const modelli = useCopia(modelliChat).dato
  return motoreDellaChat(chat, motori ?? [], modelli ?? [])
}
