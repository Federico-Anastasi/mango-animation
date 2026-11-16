// Il punto di uno stato nella barra: verde pronto, ambra in corso, grigio spento, rosso solo la registrazione.
import styles from "./Punto.module.css"

export type TonoDelPunto = "pronto" | "in-corso" | "spento" | "registra"

export function Punto({ tono }: { tono: TonoDelPunto }) {
  return <span className={styles.punto} data-testid="punto" data-punto={tono} aria-hidden="true" />
}
