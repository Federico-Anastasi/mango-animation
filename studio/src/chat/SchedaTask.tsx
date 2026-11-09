import { useState } from "react"
import { durataAlSecondo, istante } from "../testo"
import { negozio } from "./negozio"
import { useAdesso } from "./orologio"
import type { TaskChat } from "./tipi"
import { testoUso } from "./usoTask"
import styles from "./SchedaLavoro.module.css"
import { t } from "../lingua"

const nomeTipo = (tipo: TaskChat["tipo"]): string => (tipo === "comando" ? t("Comando", "Command") : tipo === "agente" ? t("Sottoagente", "Subagent") : t("Lavoro", "Job"))

/** Un lavoro che Claude ha mandato in background: cosa è, da quanto va, quanto usa, e «Ferma». */
export function SchedaTask({ task }: { task: TaskChat }) {
  const [errore, setErrore] = useState<string | null>(null)
  const adesso = useAdesso(true)
  const inizio = istante(task.iniziato)
  const uso = testoUso(task.uso)

  const ferma = () => {
    setErrore(null)
    negozio.fermaTask(task.id).catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
  }

  return (
    <div className={styles.scheda} data-stato="in corso" role="group" aria-label={t("Lavoro in background: {descrizione}", "Background job: {descrizione}", { descrizione: task.descrizione })}>
      <div className={styles.testa}>
        <span className={styles.punto} aria-hidden="true" />
        <span className={styles.nome}>{task.descrizione}</span>
        <button type="button" className={styles.ferma} onClick={ferma}>
          {t("Ferma", "Stop")}
        </button>
      </div>
      <p className={styles.riga}>
        {nomeTipo(task.tipo)} · {inizio === null ? t("In background", "In the background") : t("In background da {durata}", "In the background for {durata}", { durata: durataAlSecondo(Math.max(0, (adesso - inizio) / 1000)) })}
        {uso && ` · ${uso}`}
      </p>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </div>
  )
}
