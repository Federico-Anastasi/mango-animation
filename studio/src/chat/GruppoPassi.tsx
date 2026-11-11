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

/** I passi di un giro in una riga chiusa che si apre con un clic: «Ha lavorato · 9 passi · 1 min 8 s». */
export function GruppoPassi({ gruppo }: { gruppo: Extract<Voce, { tipo: "gruppo" }> }) {
  const [aperto, setAperto] = useState(false)
  const secondi = durataDelGruppo(gruppo.passi)
  return (
    <div className={styles.strumento} data-stato="fatto">
      <button type="button" className={styles.riga} aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <span className={styles.icona}>
          <IconaChat nome="ingranaggio" dimensione={16} />
        </span>
        <span className={styles.etichetta}>
          {t("Ha lavorato", "Worked")} · {pluralizza(gruppo.passi.length, t("passo", "step"), t("passi", "steps"))}
          {secondi !== null && secondi >= DA_QUANDO_SI_DICE && ` · ${durataAlSecondo(secondi)}`}
        </span>
        <span className={styles.freccia}>
          <IconaChat nome={aperto ? "su" : "giu"} dimensione={14} />
        </span>
      </button>
      {aperto && gruppo.dentro.map((p) => (p.tipo === "strumento" ? <Strumento key={p.id} parte={p} lavora={false} /> : <Pensiero key={p.testo} testo={p.testo} />))}
    </div>
  )
}
