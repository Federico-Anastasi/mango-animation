import { copiaVideo, useCopia } from "../dati"
import { t } from "../lingua"
import type { Lavoro } from "../tipi"
import cornice from "./Cornice.module.css"
import styles from "./PannelloLavori.module.css"

export type MontaggioInCorso = Lavoro & { slug: string }

export const eUnMontaggio = (lavoro: Lavoro | null): lavoro is MontaggioInCorso => lavoro?.comando === "monta" && lavoro.slug !== null

/** Il dettaglio del video dice di quale lavoro parla: se non è questo, è rimasto indietro e non si fa credere a nessuno. */
function useSuperato(lavoro: MontaggioInCorso): boolean {
  const dettaglio = useCopia(copiaVideo(lavoro.slug)).dato
  return dettaglio?.montaggio_superato === true && String(dettaglio.lavoro?.id) === String(lavoro.id)
}

/** Ciò che la barra mostra accanto all'icona dei lavori mentre un video si monta: sotto i 640 px resta solo il segno. */
export function SegnoMontaggio({ lavoro }: { lavoro: MontaggioInCorso }) {
  const superato = useSuperato(lavoro)
  return (
    <>
      <span className={cornice.solo}>{superato ? t("Piano cambiato", "Plan changed") : t("Lavoro in corso", "Job in progress")}</span>
      {superato ? <span className={cornice.segno} aria-hidden="true">!</span> : <span className={cornice.puntoRosso} aria-hidden="true" />}
    </>
  )
}

export function AvvisoSuperato({ lavoro }: { lavoro: MontaggioInCorso }) {
  if (!useSuperato(lavoro)) return null
  return (
    <div className={styles.superato} role="status">
      <span>{t("Il piano è cambiato dopo l'inizio di questo montaggio: ripartirà da solo alla fine del passaggio in corso. Per non aspettare, fermalo con «Ferma» qui sopra e chiedi nella chat di rimontarlo.", "The plan changed after this edit started: it will restart by itself at the end of the current step. To avoid waiting, stop it with «Stop» above and ask in the chat to edit it again.")}</span>
    </div>
  )
}
