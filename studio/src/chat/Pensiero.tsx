import { IconaChat } from "./icone"
import styles from "./Messaggio.module.css"
import { t } from "../lingua"

export function Pensiero({ testo }: { testo: string }) {
  return (
    <details className={styles.pensiero}>
      <summary>
        <IconaChat nome="pensiero" dimensione={15} />
        {t("Ha ragionato", "Thought it through")}
      </summary>
      <p>{testo}</p>
    </details>
  )
}
