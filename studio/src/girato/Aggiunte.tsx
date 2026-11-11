// Ciò che si vede mentre dei file entrano nel girato: la zona dove rilasciarli e, per ognuno, a che punto è o perché non è entrato.
import { Bottone } from "../comuni/Bottone"
import { t } from "../lingua"
import { peso } from "../testo"
import type { Voce } from "./aggiungi"
import styles from "./Aggiunte.module.css"

/** Il riquadro che copre la vista mentre dei file le passano sopra. */
export function ZonaDiRilascio({ area }: { area: DOMRect | null }) {
  if (area === null) return null
  return (
    <div className={styles.zona} style={{ top: area.top, left: area.left, width: area.width, height: area.height }} aria-hidden="true">
      <p>{t("Rilascia qui i video per aggiungerli al girato", "Drop the videos here to add them to the footage")}</p>
    </div>
  )
}

function Stato({ voce }: { voce: Voce }) {
  switch (voce.stato) {
    case "attesa":
      return <span>{t("In attesa", "Waiting")}</span>
    case "invio":
      return voce.percento === null ? <span>{t("Lo aggiungo al girato…", "Adding it to the footage…")}</span> : <span>{t("{percento}% · {fatti} di {totale}", "{percento}% · {fatti} of {totale}", { percento: voce.percento, fatti: peso(voce.caricati), totale: peso(voce.totale) })}</span>
    case "salvo":
      return <span>{t("Inviato: il computer lo sta salvando…", "Sent: the computer is saving it…")}</span>
    case "fatto":
      return <span>{t("Aggiunto al girato", "Added to the footage")}</span>
    case "errore":
      return <span className={styles.errore}>{voce.errore}</span>
  }
}

export function ElencoAggiunte({ voci, onChiudi }: { voci: readonly Voce[]; onChiudi: () => void }) {
  if (voci.length === 0) return null
  const finite = voci.every((v) => v.stato === "fatto" || v.stato === "errore")
  return (
    <section className={styles.elenco} aria-label={t("File che entrano nel girato", "Files going into the footage")}>
      <ul aria-live="polite">
        {voci.map((v) => (
          <li key={v.id} data-stato={v.stato}>
            <b>{v.nome}</b>
            {(v.stato === "invio" || v.stato === "salvo") && v.percento !== null && <progress max={100} value={v.stato === "salvo" ? 100 : v.percento} aria-label={t("Avanzamento di {nome}", "Progress of {nome}", { nome: v.nome })} />}
            <Stato voce={v} />
          </li>
        ))}
      </ul>
      {finite && (
        <Bottone variante="vuoto" onClick={onChiudi}>
          {t("Chiudi l'elenco", "Close the list")}
        </Bottone>
      )}
    </section>
  )
}
