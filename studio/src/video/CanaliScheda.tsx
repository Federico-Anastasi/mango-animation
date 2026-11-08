import { t } from "../lingua"
import type { PropsScheda } from "./PaginaVideo"
import { CANALI, conLista, nonFallire } from "./liste"
import styles from "./SchedaDelVideo.module.css"

export function CanaliScheda({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const scelti = scheda.canali ?? []
  const cambia = (id: (typeof CANALI)[number]["id"]) => {
    const nuovi = CANALI.map((c) => c.id).filter((c) => (c === id ? !scelti.includes(c) : scelti.includes(c)))
    nonFallire(salvaScheda(conLista(scheda, "canali", nuovi)))
  }
  return (
    <section className={styles.blocco}>
      <h2 id="titolo-canali">{t("Dove deve uscire", "Where it should go out")}</h2>
      <fieldset className={styles.canali} aria-labelledby="titolo-canali">
        {CANALI.map((c) => (
          <label key={c.id}>
            <input type="checkbox" checked={scelti.includes(c.id)} onChange={() => cambia(c.id)} />
            {c.nome}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
