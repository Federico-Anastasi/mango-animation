// Quanto usano i lavori di Claude Code, in una riga: «12,4k token · 18 strumenti».
import { t } from "../lingua"
import { numero, quantitaCompatta } from "../testo"
import type { TaskChat, UsoTask } from "./tipi"

/** `null` se il lavoro non ha ancora usato niente: «0 token · 0 strumenti» non dice nulla. Gli spazi non vanno a capo: in una riga stretta la frase va a capo tutta intera. */
export function testoUso(uso: UsoTask | undefined): string | null {
  if (!uso || (uso.token === 0 && uso.strumenti === 0)) return null
  const token = `${quantitaCompatta(uso.token)} ${uso.token === 1 ? "token" : t("token", "tokens")}`
  const strumenti = uso.strumenti === 1 ? t("1 strumento", "1 tool") : t("{n} strumenti", "{n} tools", { n: numero(uso.strumenti) })
  return `${token} · ${strumenti}`.replaceAll(" ", "\u00A0")
}

/** Ciò che i lavori in primo piano hanno usato, insieme: Claude li aspetta tutti. `undefined` se nessuno ha numeri. */
export function usoInPrimoPiano(task: TaskChat[]): UsoTask | undefined {
  const usi = task.flatMap((x) => (!x.background && x.uso ? [x.uso] : []))
  return usi.length === 0 ? undefined : { token: usi.reduce((somma, u) => somma + u.token, 0), strumenti: usi.reduce((somma, u) => somma + u.strumenti, 0) }
}
