import { useEffect, useId, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { useCopia } from "../dati"
import { dividiModelli, MODELLO_PREDEFINITO, modelliChat, modelliOfferti, modelloScelto, nomeFuoriElenco, nomeLivello } from "./modelli"
import { motoreDellaChat, motoriChat } from "./motore"
import { negozio, type StatoNegozio } from "./negozio"
import type { ModelloChat, MotoreChat } from "./tipi"
import styles from "./Impostazioni.module.css"
import { t } from "../lingua"

type NomeMenu = "modello" | "effort"

/** La voce che apre gli «Altri»: non è un modello. */
const VOCE_ALTRI = "__altri__"

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
  const { dato: modelli, errore: erroreModelli } = useCopia(modelliChat)
  const { dato: motori, errore: erroreMotori } = useCopia(motoriChat)
  const errore = erroreModelli ?? erroreMotori
  const idModello = useId()
  const idEffort = useId()
  const motore = motoreDellaChat(chat, motori ?? [], modelli ?? [])
  const offerti = modelliOfferti(modelli ?? [], chat, motore)
  const motoriOfferti = (motori ?? []).filter((m) => offerti.some((o) => o.motore === m.id))
  const scelto = modelloScelto(offerti, chat.modello)
  const livelli = motore?.capacita.effort ? (scelto?.effort ?? []) : []
  const { principali, altri } = dividiModelli(offerti)
  const [apertiAltri, setApertiAltri] = useState<string[]>([])
  // Il modello scelto non sparisce mai dal menu: se sta fra gli «Altri» del suo motore, quelli restano aperti.
  const mostraAltri = (id: string) => apertiAltri.includes(id) || (scelto !== undefined && scelto.motore === id && altri.includes(scelto))

  // Un modello ricordato che il motore non offre più non deve bloccare la prima conversazione.
  useEffect(() => {
    if (modelli && chat.id === null && chat.modello !== null && !modelli.some((m) => m.id === chat.modello)) void negozio.scegli({ modello: modelli.some((m) => m.id === MODELLO_PREDEFINITO) ? MODELLO_PREDEFINITO : null })
  }, [modelli, chat.id, chat.modello])

  useEffect(() => {
    if (apertiAltri.length > 0) apriMenu("modello")
  }, [apertiAltri])

  if (!modelli || !motori) {
    return (
      <p className={styles.nota} role={errore ? "alert" : undefined}>
        {errore ? (
          <>
            {t("I modelli non si leggono: {errore}", "The models cannot be read: {errore}", { errore })}{" "}
            <Bottone
              variante="minore"
              onClick={() => {
                void modelliChat.rileggi()
                void motoriChat.rileggi()
              }}
            >
              {t("Riprova", "Try again")}
            </Bottone>
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
  const conGruppi = motoriOfferti.length > 1
  const altriDi = (id: string) => altri.filter((m) => m.motore === id)
  const vociAltri = (id: string) => !mostraAltri(id) && altriDi(id).length > 0 && <option key={`altri-voce-${id}`} value={`${VOCE_ALTRI}${id}`}>{t("Altri…", "More…")}</option>
  const gruppoAltri = (m: MotoreChat) =>
    mostraAltri(m.id) && altriDi(m.id).length > 0 && (
      <optgroup key={`altri-${m.id}`} label={conGruppi ? t("{nome} · Altri", "{nome} · More", { nome: m.nome }) : t("Altri", "More")}>
        {altriDi(m.id).map(opzione)}
      </optgroup>
    )

  return (
    <div className={styles.impostazioni}>
      <div className={styles.campo}>
        <label htmlFor={idModello}>{t("Modello", "Model")}</label>
        <select
          ref={registraModello}
          id={idModello}
          value={scelto?.id ?? ""}
          onChange={(e) => {
            if (e.target.value.startsWith(VOCE_ALTRI)) setApertiAltri([...apertiAltri, e.target.value.slice(VOCE_ALTRI.length)])
            else void negozio.scegli({ modello: e.target.value })
          }}
        >
          {scelto ? null : <option value="">{nomeFuoriElenco(motore, chat.modello)}</option>}
          {conGruppi
            ? motoriOfferti.flatMap((m) => [
                <optgroup key={m.id} label={m.nome}>
                  {principali.filter((modello) => modello.motore === m.id).map(opzione)}
                  {vociAltri(m.id)}
                </optgroup>,
                gruppoAltri(m),
              ])
            : [...principali.map(opzione), vociAltri(motoriOfferti[0]?.id ?? ""), motoriOfferti[0] ? gruppoAltri(motoriOfferti[0]) : null]}
        </select>
      </div>
      {livelli.length > 0 && (
        <div className={styles.campo}>
          <label htmlFor={idEffort}>{t("Effort", "Effort")}</label>
          <select
            ref={registraEffort}
            id={idEffort}
            value={chat.effort !== null && livelli.some((l) => l.id === chat.effort) ? chat.effort : ""}
            title={t("Quanto ragiona prima di rispondere.", "How much it thinks before answering.")}
            onChange={(e) => void negozio.scegli({ effort: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">{t("Predefinito", "Default")}</option>
            {livelli.map((l) => (
              <option key={l.id} value={l.id}>
                {nomeLivello(l)}
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
