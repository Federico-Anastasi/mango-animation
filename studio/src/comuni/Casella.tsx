import { Icona } from "./icone"
import styles from "./Casella.module.css"

/** La casella, solo disegnata: per ciò di cui se ne spunta più d'una fra molte. Il gesto e il nome sono di chi la contiene. */
export function Casella({ spuntata }: { spuntata: boolean }) {
  return (
    <span className={styles.casella} data-spuntata={spuntata} aria-hidden="true">
      {spuntata && <Icona nome="spunta" dimensione={12} />}
    </span>
  )
}
