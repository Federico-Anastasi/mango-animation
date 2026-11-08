import { useRef, useState } from "react"
import { api } from "../api"
import { Stima } from "../comuni/Stima"
import { useChiudiFuori } from "../comuni/useChiudiFuori"
import { elencoVideo, lavori, useCopia } from "../dati"
import { t } from "../lingua"
import { dataOra, durataCirca, oraMinuti } from "../testo"
import type { Lavoro } from "../tipi"
import { AvvisoSuperato, eUnMontaggio } from "./MontaggioSuperato"
import styles from "./PannelloLavori.module.css"

/** Ogni voce si traduce quando si legge, così segue la lingua scelta in quel momento. */
export const NOME_COMANDO: Record<string, string> = {
  get prepara() {
    return t("Preparazione del girato", "Preparing the footage")
  },
  get "prepara-file"() {
    return t("Preparazione di un file", "Preparing a file")
  },
  get scarica() {
    return t("Scarico dal web", "Download from the web")
  },
  get risolvi() {
    return t("Ricalcolo del montaggio", "Recalculating the edit")
  },
  get monta() {
    return t("Montaggio", "Edit")
  },
  get controlla() {
    return t("Controllo del montato", "Checking the edited video")
  },
  get carosello() {
    return t("Slide del carosello", "Carousel slides")
  },
  get anteprima() {
    return t("Anteprima", "Preview")
  },
  get copertina() {
    return t("Copertina", "Cover")
  },
  get prova() {
    return t("Prova per registrare", "Rehearsal for recording")
  },
}

const NOME_ESITO = {
  riuscito: () => t("riuscito", "done"),
  fallito: () => t("non riuscito", "failed"),
  fermato: () => t("fermato", "stopped"),
  interrotto: () => t("interrotto", "interrupted"),
} as const

export function PannelloLavori({ onChiudi }: { onChiudi: () => void }) {
  const stato = useCopia(lavori).dato
  const titoli = useCopia(elencoVideo).dato
  const [errore, setErrore] = useState<string | null>(null)
  const riquadro = useRef<HTMLDivElement>(null)

  useChiudiFuori(riquadro, onChiudi)

  const titolo = (l: Lavoro) => (l.slug === null ? (l.file?.split("/").pop() ?? t("girato", "footage")) : (titoli?.find((v) => v.slug === l.slug)?.scheda.titolo ?? t("video", "video")))
  const nome = (l: Lavoro) => `${NOME_COMANDO[l.comando] ?? l.comando} · ${titolo(l)}`
  const ferma = (id: string | number) => {
    setErrore(null)
    api.fermaLavoro(id).catch((e: Error) => setErrore(e.message))
  }

  const inCorso = stato?.in_corso ?? null
  const inCoda = stato?.in_coda ?? []
  const finiti = stato?.finiti ?? []

  return (
    <div ref={riquadro} className={styles.pannello} role="dialog" aria-label={t("Lavori", "Jobs")}>
      <h2>{t("Lavori", "Jobs")}</h2>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
      <section>
        <h3>{t("In corso", "In progress")}</h3>
        {inCorso ? (
          <div className={styles.riga}>
            <div className={styles.testa}>
              <span>{nome(inCorso)}</span>
              <button type="button" className={styles.azione} onClick={() => ferma(inCorso.id)}>
                {t("Ferma", "Stop")}
              </button>
            </div>
            {inCorso.iniziato && <span className={styles.piccolo}>{t("partito il {data}", "started {data}", { data: dataOra(inCorso.iniziato) })}</span>}
            <span className={styles.piccolo}>
              {inCorso.stima != null && inCorso.fine_prevista ? <Stima>{t("{durata}, finisce verso le {ora}", "{durata}, finishing around {ora}", { durata: durataCirca(inCorso.stima), ora: oraMinuti(inCorso.fine_prevista) })}</Stima> : t("Quanto dura non si sa ancora: sono finiti troppo pochi lavori come questo.", "It is not known yet how long this takes: too few jobs like this have finished.")}
            </span>
            {eUnMontaggio(inCorso) && <AvvisoSuperato lavoro={inCorso} />}
            {(inCorso.righe ?? []).length > 0 && <pre className={styles.righe}>{(inCorso.righe ?? []).slice(-8).join("\n")}</pre>}
          </div>
        ) : (
          <p className={styles.piccolo}>{t("Niente in corso: la scheda video è libera.", "Nothing in progress: the video card is free.")}</p>
        )}
      </section>
      <section>
        <h3>{t("In attesa", "Waiting")}</h3>
        {inCoda.length === 0 ? (
          <p className={styles.piccolo}>{t("Niente in attesa.", "Nothing waiting.")}</p>
        ) : (
          <ul className={styles.elenco}>
            {inCoda.map((l) => (
              <li key={l.id} className={styles.testa}>
                <span>{nome(l)}</span>
                <button type="button" className={styles.azione} onClick={() => ferma(l.id)}>
                  {t("Togli", "Remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>{t("Finiti", "Finished")}</h3>
        {finiti.length === 0 ? (
          <p className={styles.piccolo}>{t("Ancora niente di finito.", "Nothing finished yet.")}</p>
        ) : (
          <ul className={styles.elenco}>
            {finiti.map((l) => (
              <li key={l.id} className={styles.finito}>
                <span>{nome(l)}</span>
                <span className={l.esito === "fallito" || l.esito === "interrotto" ? styles.fallito : styles.piccolo}>{l.esito ? NOME_ESITO[l.esito]() : t("finito", "finished")}</span>
                {l.errore && <span className={styles.fallito}>{l.errore}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
