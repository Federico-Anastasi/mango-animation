// Il bottone dell'interfaccia: pieno per l'azione della schermata, vuoto per le altre.
import type { ReactNode } from "react"
import styles from "./Bottone.module.css"

export function Bottone({
  children,
  onClick,
  variante = "pieno",
  disabled = false,
  etichetta,
  titolo,
}: {
  children: ReactNode
  onClick: () => void
  variante?: "pieno" | "vuoto"
  disabled?: boolean
  /** Per chi legge lo schermo, se `children` non basta a dire cosa fa. */
  etichetta?: string
  /** Il suggerimento che compare sul bottone: soprattutto perché è spento. */
  titolo?: string
}) {
  return (
    <button type="button" className={variante === "pieno" ? styles.pieno : styles.vuoto} onClick={onClick} disabled={disabled} aria-label={etichetta} title={titolo}>
      {children}
    </button>
  )
}
