import { useEffect, useId } from "react"
import { useCopia } from "../dati"
import { MODELLO_PREDEFINITO, modelliChat, modelliOfferti, modelloScelto, nomeEffort, nomeFuoriElenco } from "./modelli"
import { motoreDellaChat, motoreDi } from "./motore"
import { negozio, type StatoNegozio } from "./negozio"
import type { LivelloEffort, ModelloChat } from "./tipi"
import styles from "./Impostazioni.module.css"
import { t } from "../lingua"

type NomeMenu = "modello" | "effort"

const menu = new Map<NomeMenu, HTMLSelectElement>()

const registra = (quale: NomeMenu) => (el: HTMLSelectElement | null) => {
  if (!el) return
  menu.set(quale, el)
  return () => {
    if (menu.get(quale) === el) menu.delete(quale)
  }
}
const registraModello = registra("modello")
const registraEffort = registra("effort")

/** Porta il fuoco su un menu della testata e lo apre; `false` se in questo momento il menu non c'è. */
export function apriMenu(quale: NomeMenu): boolean {
  const el = menu.get(quale)
  if (!el) return false
  el.focus()
  try {
    el.showPicker()
  } catch {
    // Senza un gesto dell'utente, o in un browser che non lo sa fare, il fuoco sul menu basta.
  }
  return true
}

/** I due menu della testata: il modello e l'effort della conversazione aperta, che diventano la scelta delle nuove. Una conversazione iniziata resta del suo motore: offre solo i suoi modelli. */
export function Impostazioni({ chat }: { chat: StatoNegozio }) {
  const { dato: modelli, errore } = useCopia(modelliChat)
  const idModello = useId()
  const idEffort = useId()
  const motore = motoreDellaChat(chat)
  const offerti = modelliOfferti(modelli ?? [], chat)
  const motoriOfferti = [...new Map(offerti.map((m) => [motoreDi(m.id).id, motoreDi(m.id)])).values()]
  const scelto = modelloScelto(offerti, chat.modello)
  const livelli = scelto?.effort ?? []

  // Un modello ricordato che Claude Code non offre più non deve bloccare la prima conversazione.
  useEffect(() => {
    if (modelli && chat.id === null && chat.modello !== null && !modelli.some((m) => m.id === chat.modello)) void negozio.scegli({ modello: MODELLO_PREDEFINITO })
  }, [modelli, chat.id, chat.modello])

  if (!modelli) {
    return (
      <p className={styles.nota} role={errore ? "alert" : undefined}>
        {errore ? (
          <>
            {t("I modelli non si leggono: {errore}", "The models cannot be read: {errore}", { errore })}{" "}
            <button type="button" className={styles.riprova} onClick={() => void modelliChat.rileggi()}>
              {t("Riprova", "Try again")}
            </button>
          </>
        ) : (
          t("Carico i modelli…", "Loading the models…")
        )}
      </p>
    )
  }

  if (motore === null) return null

  const opzione = (m: ModelloChat) => (
    <option key={m.id} value={m.id}>
      {m.nome}
    </option>
  )

  return (
    <div className={styles.impostazioni}>
      <div className={styles.campo}>
        <label htmlFor={idModello}>{t("Modello", "Model")}</label>
        <select ref={registraModello} id={idModello} value={scelto?.id ?? ""} onChange={(e) => void negozio.scegli({ modello: e.target.value })}>
          {scelto ? null : <option value="">{nomeFuoriElenco(modelli, chat.modello)}</option>}
          {motoriOfferti.length > 1
            ? motoriOfferti.map((m) => (
                <optgroup key={m.id} label={m.nome}>
                  {offerti.filter((modello) => motoreDi(modello.id).id === m.id).map(opzione)}
                </optgroup>
              ))
            : offerti.map(opzione)}
        </select>
      </div>
      {livelli.length > 0 && (
        <div className={styles.campo}>
          <label htmlFor={idEffort}>{t("Effort", "Effort")}</label>
          <select
            ref={registraEffort}
            id={idEffort}
            value={chat.effort !== null && livelli.includes(chat.effort) ? chat.effort : ""}
            title={t("Quanto ragiona prima di rispondere.", "How much it thinks before answering.")}
            onChange={(e) => void negozio.scegli({ effort: e.target.value === "" ? null : (e.target.value as LivelloEffort) })}
          >
            <option value="">{t("Predefinito", "Default")}</option>
            {livelli.map((l) => (
              <option key={l} value={l}>
                {nomeEffort(l)}
              </option>
            ))}
          </select>
        </div>
      )}
      {chat.erroreImpostazioni && (
        <p className={styles.errore} role="alert">
          {chat.erroreImpostazioni}
        </p>
      )}
    </div>
  )
}
