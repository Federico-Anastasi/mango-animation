import { IconaChat } from "./icone"
import { iconaDelMotore } from "./motore"
import type { MotoreChat } from "./tipi"
import styles from "./EtichettaMotore.module.css"

/** Il segno e il nome del motore con cui si parla, piccoli, nella testata. */
export function EtichettaMotore({ motore }: { motore: MotoreChat }) {
  const icona = iconaDelMotore(motore)
  if (icona === null) return null
  return (
    <span className={styles.etichetta} data-motore={motore.id}>
      <IconaChat nome={icona} dimensione={14} />
      {motore.nome}
    </span>
  )
}
