// Con cosa parla la chat: il Claude Code installato sul computer, o Mango Code coi modelli sul computer (i suoi modelli hanno l'id `mango-code/…`).
// Il segno e il nome nella testata e nelle frasi sono solo di Mango Code: l'assistente di Claude non ha un nome suo, e «Claude» compare solo nel menu dei motori.
import type { NomeIconaChat } from "./icone"
import type { StatoNegozio } from "./negozio"

export interface MotoreChat {
  id: string
  /** Come si chiama nel menu dei motori. */
  nome: string
  /** Come lo chiama il creator nelle frasi: «Mango Code sta lavorando»; `null` se le frasi non lo nominano. */
  corto: string | null
  /** Il segno piccolo accanto al nome nella testata; `null` se la testata non dice con chi si parla. */
  icona: NomeIconaChat | null
}

export const MOTORE_CHAT: MotoreChat = { id: "claude-code", nome: "Claude", corto: null, icona: null }
const MANGO_CODE: MotoreChat = { id: "mango-code", nome: "Mango Code", corto: "Mango Code", icona: "agente" }

/** Il motore di una conversazione dal suo modello. */
export const motoreDi = (modello: string | null): MotoreChat => (modello?.startsWith("mango-code/") ? MANGO_CODE : MOTORE_CHAT)

/** Il motore della conversazione aperta; `null` finché non si sa (una conversazione che si sta ancora aprendo, o che non si apre). */
export const motoreDellaChat = (chat: Pick<StatoNegozio, "id" | "caricato" | "errore" | "modello">): MotoreChat | null =>
  chat.id !== null && chat.modello === null && (!chat.caricato || chat.errore !== null) ? null : motoreDi(chat.modello)
