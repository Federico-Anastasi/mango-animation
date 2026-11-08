import type { ReactNode } from "react"
import styles from "./Stima.module.css"

/** Un tempo che il creator sta aspettando (una stima di Claude o della coda), con un leggero risalto. */
export function Stima({ children }: { children: ReactNode }) {
  return <mark className={styles.stima}>{children}</mark>
}
