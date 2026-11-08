// Una fila di numeri grandi, ognuno col suo nome e, se serve, una nota: è come le pagine mostrano i totali.
import type { ReactNode } from "react"
import styles from "./Tessere.module.css"

export function Tessere({ children }: { children: ReactNode }) {
  return <div className={styles.tessere}>{children}</div>
}

export function Tessera({ valore, nome, nota }: { valore: string; nome: string; nota?: string }) {
  return (
    <div className={styles.tessera}>
      <span className={styles.valore}>{valore}</span>
      <span className={styles.nome}>{nome}</span>
      {nota && <span className={styles.nota}>{nota}</span>}
    </div>
  )
}
