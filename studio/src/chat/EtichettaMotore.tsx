import { IconaChat } from "./icone"
import type { MotoreChat } from "./motore"
import styles from "./EtichettaMotore.module.css"

/** Il segno e il nome del motore con cui si parla, piccoli, nella testata. */
export function EtichettaMotore({ motore }: { motore: MotoreChat }) {
  if (motore.icona === null) return null
  return (
    <span className={styles.etichetta} data-motore={motore.id}>
      <IconaChat nome={motore.icona} dimensione={14} />
      {motore.nome}
    </span>
  )
}
