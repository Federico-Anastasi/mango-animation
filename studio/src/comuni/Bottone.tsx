// Il bottone dell'interfaccia. Il principale è uno per pagina, ciò che porta avanti; il minore è ciò che si può ignorare;
// quello che distrugge toglie o cancella.
import type { ReactNode } from "react"
import styles from "./Bottone.module.css"

export function Bottone({
  children,
  onClick,
  variante = "normale",
  disabled = false,
  etichetta,
  titolo,
}: {
  children: ReactNode
  onClick: () => void
  variante?: "principale" | "normale" | "minore" | "distrugge"
  disabled?: boolean
  /** Per chi legge lo schermo, se `children` non basta a dire cosa fa. */
  etichetta?: string
  /** Il suggerimento che compare sul bottone: soprattutto perché è spento. */
  titolo?: string
}) {
  return (
    <button type="button" className={styles.bottone} data-variante={variante} onClick={onClick} disabled={disabled} aria-label={etichetta} title={titolo}>
      {children}
    </button>
  )
}
