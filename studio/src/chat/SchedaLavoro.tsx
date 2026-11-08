import { useState } from "react"
import { api } from "../api"
import { Stima } from "../comuni/Stima"
import { NOME_COMANDO } from "../cornice/PannelloLavori"
import { elencoVideo, useCopia } from "../dati"
import { durataAlSecondo, durataCirca, durata, istante, oraMinuti } from "../testo"
import type { Lavoro } from "../tipi"
import { useAdesso } from "./orologio"
import styles from "./SchedaLavoro.module.css"
import { t } from "../lingua"

const nomeEsito = (esito: NonNullable<Lavoro["esito"]>): string =>
  esito === "riuscito" ? t("Finito", "Finished") : esito === "fallito" ? t("Non riuscito", "Failed") : esito === "interrotto" ? t("Interrotto", "Interrupted") : t("Fermato", "Stopped")

/** Un lavoro della coda dentro la conversazione: in attesa, in corso con la stima e «Ferma», o finito. */
export function SchedaLavoro({ lavoro, stato }: { lavoro: Lavoro; stato: "in corso" | "in coda" | "finito" }) {
  const titoli = useCopia(elencoVideo).dato
  const [errore, setErrore] = useState<string | null>(null)
  const adesso = useAdesso(stato !== "finito")
  const titolo = lavoro.slug === null ? (lavoro.file?.split("/").pop() ?? t("girato", "footage")) : (titoli?.find((v) => v.slug === lavoro.slug)?.scheda.titolo ?? t("video", "video"))
  const inizio = lavoro.iniziato ? istante(lavoro.iniziato) : null
  const fine = lavoro.finito ? istante(lavoro.finito) : null
  const passato = stato === "in corso" && inizio !== null ? Math.max(0, (adesso - inizio) / 1000) : stato === "finito" && inizio !== null && fine !== null ? Math.max(0, (fine - inizio) / 1000) : null
  const stima = stato !== "finito" && lavoro.stima != null ? lavoro.stima : null
  const accodato = lavoro.accodato ? istante(lavoro.accodato) : null
  const inAttesaDa = stato === "in coda" && accodato !== null ? Math.max(0, (adesso - accodato) / 1000) : null
  const avanzamento = stato === "in corso" && stima !== null && passato !== null && stima > 0 ? Math.min(passato / stima, 0.97) : null

  const ferma = () => {
    setErrore(null)
    api.fermaLavoro(lavoro.id).catch((e: Error) => setErrore(e.message))
  }

  return (
    <div className={styles.scheda} data-stato={stato === "finito" ? (lavoro.esito ?? "finito") : stato} role="group" aria-label={t("Lavoro: {nome}", "Job: {nome}", { nome: NOME_COMANDO[lavoro.comando] ?? lavoro.comando })}>
      <div className={styles.testa}>
        <span className={styles.punto} aria-hidden="true" />
        <span className={styles.nome}>
          {NOME_COMANDO[lavoro.comando] ?? lavoro.comando} · {titolo}
        </span>
        {stato !== "finito" && (
          <button type="button" className={styles.ferma} onClick={ferma}>
            {stato === "in coda" ? t("Togli", "Remove") : t("Ferma", "Stop")}
          </button>
        )}
      </div>
      <p className={styles.riga}>
        {stato === "in coda" && (
          <>
            {inAttesaDa !== null ? t("In attesa da {durata}: la scheda video fa un lavoro alla volta", "Waiting for {durata}: the video card runs one job at a time", { durata: durataAlSecondo(inAttesaDa) }) : t("In attesa: la scheda video fa un lavoro alla volta", "Waiting: the video card runs one job at a time")}
            {stima !== null && (
              <>
                {t(" · poi ", " · then ")}
                <Stima>{durataCirca(stima)}</Stima>
              </>
            )}
          </>
        )}
        {stato === "in corso" && (
          <>
            {passato !== null ? t("Va da {durata}", "Running for {durata}", { durata: durataAlSecondo(passato) }) : t("Appena partito", "Just started")}
            {" · "}
            {stima !== null && lavoro.fine_prevista ? <Stima>{t("{durata}, finisce verso le {ora}", "{durata}, ends around {ora}", { durata: durataCirca(stima), ora: oraMinuti(lavoro.fine_prevista) })}</Stima> : t("quanto dura non si sa ancora", "how long it takes is not known yet")}
            {stima !== null && passato !== null && passato > stima ? t(" · più del previsto", " · longer than expected") : ""}
          </>
        )}
        {stato === "finito" && (
          <>
            {lavoro.esito ? nomeEsito(lavoro.esito) : t("Finito", "Finished")}
            {passato !== null ? t(" in {durata}", " in {durata}", { durata: durata(passato) }) : ""}
            {lavoro.errore ? `: ${lavoro.errore}` : ""}
          </>
        )}
      </p>
      {avanzamento !== null && (
        <div className={styles.barra} role="progressbar" aria-label={t("Avanzamento stimato", "Estimated progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(avanzamento * 100)}>
          <span style={{ width: `${avanzamento * 100}%` }} />
        </div>
      )}
      {stato === "in corso" && (lavoro.righe ?? []).length > 0 && <pre className={styles.righe}>{(lavoro.righe ?? []).slice(-3).join("\n")}</pre>}
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </div>
  )
}
