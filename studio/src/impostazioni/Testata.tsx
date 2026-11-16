// L'inizio di ogni sezione: il titolo, a cosa serve, e a destra l'azione che porta avanti.
import type { ReactNode } from "react"
import styles from "./Impostazioni.module.css"

export function Testata({ titolo, sotto, children }: { titolo: string; sotto?: string; children?: ReactNode }) {
  return (
    <header className={styles.testata}>
      <div className={styles.titoli}>
        <h1>{titolo}</h1>
        {sotto && <p className={styles.sotto}>{sotto}</p>}
      </div>
      {children && <div className={styles.azioni}>{children}</div>}
    </header>
  )
}
