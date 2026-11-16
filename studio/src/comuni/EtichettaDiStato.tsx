// Uno stato accanto a un nome. Pronto è verde, in corso ambra, errore rosso; ogni altro stato («Spento», «Da collegare») è neutro.
import type { ReactNode } from "react"
import styles from "./EtichettaDiStato.module.css"

export function EtichettaDiStato({ stato, children }: { stato?: "pronto" | "in-corso" | "errore"; children: ReactNode }) {
  return (
    <span className={styles.etichetta} data-stato={stato}>
      {children}
    </span>
  )
}
