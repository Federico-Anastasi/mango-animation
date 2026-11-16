// Una sezione di pagina: sopra il nome del gruppo, sotto una card col suo contenuto.
import type { ReactNode } from "react"
import styles from "./Gruppo.module.css"

export function Gruppo({ titolo, id, className, children }: { titolo: ReactNode; id?: string; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `${styles.gruppo} ${className}` : styles.gruppo} aria-labelledby={id}>
      <h2 id={id} className={styles.nome}>
        {titolo}
      </h2>
      <div className={styles.card}>{children}</div>
    </section>
  )
}
