import { urlUscita } from "../api"
import { t } from "../lingua"
import type { Uscita } from "../tipi"
import styles from "./ProvaVideo.module.css"

export function ProvaVideo({ prova }: { prova: Uscita }) {
  return (
    <div className={styles.pagina}>
      <p className={styles.tenue}>{t("Le animazioni con la battuta da dire, per registrare", "The animations with the line to say, to record against")}</p>
      <video className={styles.video} src={urlUscita(prova)} controls preload="metadata" />
    </div>
  )
}
