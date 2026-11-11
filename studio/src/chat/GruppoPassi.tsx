import { useState } from "react"
import { durataAlSecondo, pluralizza } from "../testo"
import { durataDelGruppo, type Voce } from "./gruppi"
import { IconaChat } from "./icone"
import { Pensiero } from "./Pensiero"
import { Strumento } from "./Strumento"
import styles from "./Strumento.module.css"
import { t } from "../lingua"

/** Prima di questi secondi la durata di un gruppo non vale la pena dirla. */
const DA_QUANDO_SI_DICE = 5

/** I passi di un giro in una riga chiusa che si apre con un clic: «Ha lavorato · 9 passi · 1 min 8 s»; mentre l'ultimo è in corso, «Sta lavorando». */
export function GruppoPassi({ gruppo, lavora }: { gruppo: Extract<Voce, { tipo: "gruppo" }>; lavora: boolean }) {
  const [aperto, setAperto] = useState(false)
  const secondi = durataDelGruppo(gruppo.passi)
  const inCorso = lavora && gruppo.passi.some((p) => p.esito === undefined && !p.errore)
  return (
    <div className={styles.strumento} data-stato={inCorso ? "corso" : "fatto"}>
      <button type="button" className={styles.riga} aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <span className={styles.icona}>
          <IconaChat nome="ingranaggio" dimensione={16} />
        </span>
        <span className={styles.etichetta}>
          {inCorso ? t("Sta lavorando", "Working") : t("Ha lavorato", "Worked")} · {pluralizza(gruppo.passi.length, t("passo", "step"), t("passi", "steps"))}
          {!inCorso && secondi !== null && secondi >= DA_QUANDO_SI_DICE && ` · ${durataAlSecondo(secondi)}`}
        </span>
        {inCorso && <span className={styles.stato}>{t("in corso…", "in progress…")}</span>}
        <span className={styles.freccia}>
          <IconaChat nome={aperto ? "su" : "giu"} dimensione={14} />
        </span>
      </button>
      {aperto && gruppo.dentro.map((p) => (p.tipo === "strumento" ? <Strumento key={p.id} parte={p} lavora={lavora} /> : <Pensiero key={p.testo} testo={p.testo} />))}
    </div>
  )
}
