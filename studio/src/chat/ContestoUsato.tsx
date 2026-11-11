import { numero, quantitaGrossa } from "../testo"
import type { ContestoUsato as Contesto } from "./tipi"
import styles from "./ContestoUsato.module.css"
import { t } from "../lingua"

const spiega = (): string =>
  t(
    "È la memoria del modello per questa conversazione. Quando si riempie il modello riassume la conversazione e ne perde i dettagli: per un lavoro nuovo conviene una conversazione nuova.",
    "This is the model's memory for this conversation. When it fills up, the model summarises the conversation and loses its details: for new work, a new conversation is better.",
  )

/** Da qui in su la barra avvisa, e verso la fine diventa rossa. */
const ALTO = 70
const PIENO = 90

/** Quanto è pieno il contesto della conversazione, piccolo, nella testata della chat. */
export function ContestoUsato({ contesto }: { contesto: Contesto }) {
  const { usati, totale } = contesto
  if (totale === null || totale <= 0) {
    return (
      <span className={styles.contesto} title={t("{n} token. {spiega}", "{n} tokens. {spiega}", { n: numero(usati), spiega: spiega() })}>
        {t("Contesto {n} token", "Context {n} tokens", { n: quantitaGrossa(usati) })}
      </span>
    )
  }
  const percento = Math.round((usati / totale) * 100)
  const livello = percento >= PIENO ? "pieno" : percento >= ALTO ? "alto" : "normale"
  return (
    <span
      className={styles.contesto}
      role="meter"
      aria-label={t("Contesto usato", "Context used")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percento}
      aria-valuetext={t("{usati} token su {totale}, {percento}%", "{usati} tokens of {totale}, {percento}%", { usati: quantitaGrossa(usati), totale: quantitaGrossa(totale), percento })}
      data-livello={livello}
      title={t("Contesto usato: {usati} token su {totale} ({percento}%). {spiega}", "Context used: {usati} tokens of {totale} ({percento}%). {spiega}", { usati: numero(usati), totale: numero(totale), percento, spiega: spiega() })}
    >
      <span className={styles.barra} aria-hidden="true">
        <span className={styles.pieno} style={{ width: `${Math.min(percento, 100)}%` }} />
      </span>
      {t("Contesto {percento}%", "Context {percento}%", { percento })}
      {livello !== "normale" && t(" · meglio una conversazione nuova", " · better start a new conversation")}
    </span>
  )
}
