import { tempoLeggibile } from "../testo"
import { useAdesso } from "./orologio"
import styles from "./Cronometro.module.css"

/** Il tempo che passa da un istante (ms), «2:14», più `prima` (ms) già fatti: va avanti da solo finché `da` c'è, altrimenti resta fermo. */
export function Cronometro({ da, prima = 0 }: { da: number | null; prima?: number }) {
  const adesso = useAdesso(da !== null)
  const secondi = (prima + (da === null ? 0 : Math.max(0, adesso - da))) / 1000
  return <time className={styles.cronometro}>{tempoLeggibile(secondi, false)}</time>
}
