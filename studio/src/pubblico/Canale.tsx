// «Come va il mio canale?»: Pubblico, Classifica e Crescita sono tre schede della stessa voce. Senza nessuna lettura una pagina sola dice come farla.
import { PaginaDiCanaleVuota } from "../comuni/PaginaVuota"
import { Schede } from "../comuni/Schede"
import { Caricamento, Errore } from "../comuni/Stati"
import { canaleTiktok, useCopia } from "../dati"
import { SCHEDE_CANALE, scriviIndirizzo, type SchedaCanale } from "../indirizzo"
import { t } from "../lingua"
import { Classifica } from "../classifica/Classifica"
import { Crescita } from "../crescita/Crescita"
import { Pubblico } from "./Pubblico"
import styles from "./Canale.module.css"

const nomi = (): Record<SchedaCanale, string> => ({ pubblico: t("Pubblico", "Audience"), classifica: t("Classifica", "Ranking"), crescita: t("Crescita", "Growth") })

export function Canale({ scheda, video }: { scheda: SchedaCanale; video: string | undefined }) {
  const { dato, errore, caricato } = useCopia(canaleTiktok)
  if (errore && !dato) return <Errore messaggio={errore} onRiprova={() => void canaleTiktok.rileggi()} />
  if (!caricato || !dato) return <Caricamento />
  if (!dato.ultima) return <PaginaDiCanaleVuota pagina="canale" titolo={t("Canale", "Channel")} />
  return (
    <div className={styles.pagina} data-scheda={scheda}>
      <h1>{t("Canale", "Channel")}</h1>
      <div className={styles.schede}>
        <Schede etichetta={t("Schede del canale", "Channel tabs")} schede={SCHEDE_CANALE.map((id) => ({ id, nome: nomi()[id] }))} attiva={scheda} indirizzo={(id) => scriviIndirizzo({ vista: "canale", parte: id })} />
      </div>
      {scheda === "pubblico" && <Pubblico video={video} />}
      {scheda === "classifica" && <Classifica />}
      {scheda === "crescita" && <Crescita />}
    </div>
  )
}
