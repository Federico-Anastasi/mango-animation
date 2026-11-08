import { useState } from "react"
import { IconaChat } from "./icone"
import { descriviStrumento, ingressoComeTesto } from "./strumenti"
import type { DomandaChat, Richiesta, SceltaRisposta } from "./tipi"
import styles from "./Richieste.module.css"
import { t } from "../lingua"

type Rispondi = (scelta: SceltaRisposta) => Promise<void>

/** Manda la risposta e, se il server la rifiuta, tiene la richiesta aperta con il motivo scritto: non resta mai appesa. */
function useRisposta(rispondi: Rispondi) {
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const manda = (scelta: SceltaRisposta) => {
    setOccupato(true)
    setErrore(null)
    rispondi(scelta).catch((e: unknown) => {
      setErrore(e instanceof Error ? e.message : String(e))
      setOccupato(false)
    })
  }
  return { occupato, errore, manda }
}

function Permesso({ chi, richiesta, rispondi }: { chi: string | undefined; richiesta: Extract<Richiesta, { tipo: "permesso" }>; rispondi: Rispondi }) {
  const { occupato, errore, manda } = useRisposta(rispondi)
  const [motivo, setMotivo] = useState("")
  const { etichetta, icona } = descriviStrumento(richiesta.strumento, richiesta.ingresso)
  return (
    <section className={styles.richiesta} aria-label={chi ? t("{chi} chiede il permesso", "{chi} is asking for permission", { chi }) : t("Richiesta di permesso", "Permission request")}>
      <p className={styles.frase}>
        <IconaChat nome={icona} dimensione={16} />
        <span>{richiesta.frase}</span>
      </p>
      <details className={styles.dettagli}>
        <summary>{etichetta}</summary>
        <pre>{ingressoComeTesto(richiesta.ingresso)}</pre>
      </details>
      <input className={styles.motivo} type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("Se rifiuti, puoi dirgli perché (facoltativo)", "If you refuse, you can tell it why (optional)")} aria-label={t("Perché no (facoltativo)", "Why not (optional)")} disabled={occupato} />
      <div className={styles.bottoni}>
        <button type="button" className={styles.pieno} disabled={occupato} onClick={() => manda({ scelta: "consenti" })}>
          {t("Consenti", "Allow")}
        </button>
        <button type="button" className={styles.vuoto} disabled={occupato} onClick={() => manda({ scelta: "sempre" })} title={t("Vale per questo strumento fino alla fine della conversazione", "Applies to this tool until the end of the conversation")}>
          {t("Consenti sempre", "Always allow")}
        </button>
        <button type="button" className={styles.vuoto} disabled={occupato} onClick={() => manda(motivo.trim() === "" ? { scelta: "no" } : { scelta: "no", motivo: motivo.trim() })}>
          {t("No", "No")}
        </button>
      </div>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </section>
  )
}

interface Scelta {
  etichette: string[]
  altro: boolean
  testo: string
}

const vuota = (): Scelta => ({ etichette: [], altro: false, testo: "" })

const rispostaDi = (s: Scelta): string | null => {
  const parti = [...s.etichette, ...(s.altro && s.testo.trim() !== "" ? [s.testo.trim()] : [])]
  if (s.altro && s.testo.trim() === "") return null
  return parti.length === 0 ? null : parti.join(", ")
}

function Domanda({ domanda, scelta, cambia, disabilitata }: { domanda: DomandaChat; scelta: Scelta; cambia: (s: Scelta) => void; disabilitata: boolean }) {
  const scegli = (etichetta: string) => {
    if (domanda.multipla) cambia({ ...scelta, etichette: scelta.etichette.includes(etichetta) ? scelta.etichette.filter((e) => e !== etichetta) : [...scelta.etichette, etichetta] })
    else cambia({ etichette: [etichetta], altro: false, testo: "" })
  }
  const scegliAltro = () => {
    if (domanda.multipla) cambia({ ...scelta, altro: !scelta.altro })
    else cambia({ etichette: [], altro: true, testo: scelta.testo })
  }
  return (
    <fieldset className={styles.domanda} disabled={disabilitata}>
      <legend>
        {domanda.intestazione && <span className={styles.intestazione}>{domanda.intestazione}</span>}
        <span>{domanda.domanda}</span>
      </legend>
      {domanda.multipla && <p className={styles.aiuto}>{t("Puoi sceglierne più di una.", "You can choose more than one.")}</p>}
      <div className={styles.opzioni}>
        {domanda.opzioni.map((o) => (
          <button key={o.etichetta} type="button" className={styles.opzione} aria-pressed={scelta.etichette.includes(o.etichetta)} onClick={() => scegli(o.etichetta)}>
            <span className={styles.segno} aria-hidden="true" data-multipla={domanda.multipla ? "" : undefined}>
              {scelta.etichette.includes(o.etichetta) && <IconaChat nome="spunta" dimensione={12} />}
            </span>
            <span className={styles.testoOpzione}>
              <strong>{o.etichetta}</strong>
              {o.descrizione && <span>{o.descrizione}</span>}
            </span>
          </button>
        ))}
        <button type="button" className={styles.opzione} aria-pressed={scelta.altro} onClick={scegliAltro}>
          <span className={styles.segno} aria-hidden="true" data-multipla={domanda.multipla ? "" : undefined}>
            {scelta.altro && <IconaChat nome="spunta" dimensione={12} />}
          </span>
          <span className={styles.testoOpzione}>
            <strong>{t("Altro", "Other")}</strong>
            <span>{t("Lo scrivi tu.", "You write it.")}</span>
          </span>
        </button>
        {scelta.altro && <input className={styles.motivo} type="text" autoFocus value={scelta.testo} onChange={(e) => cambia({ ...scelta, testo: e.target.value })} placeholder={t("Scrivi la tua risposta", "Write your answer")} aria-label={t("Altro: {domanda}", "Other: {domanda}", { domanda: domanda.domanda })} />}
      </div>
    </fieldset>
  )
}

function Domande({ chi, richiesta, rispondi }: { chi: string | undefined; richiesta: Extract<Richiesta, { tipo: "domanda" }>; rispondi: Rispondi }) {
  const { occupato, errore, manda } = useRisposta(rispondi)
  const [scelte, setScelte] = useState<Scelta[]>(() => richiesta.domande.map(vuota))
  const risposte = richiesta.domande.map((_, i) => rispostaDi(scelte[i] ?? vuota()))
  const completa = risposte.every((r) => r !== null)
  const invia = () => manda({ scelta: { risposte: Object.fromEntries(richiesta.domande.map((d, i) => [d.domanda, risposte[i] ?? ""])) } })
  return (
    <section className={styles.richiesta} aria-label={chi ? t("{chi} ti fa una domanda", "{chi} has a question for you", { chi }) : t("Una domanda per te", "A question for you")}>
      {richiesta.domande.map((d, i) => (
        <Domanda key={`${i}-${d.domanda}`} domanda={d} scelta={scelte[i] ?? vuota()} cambia={(s) => setScelte(scelte.map((v, k) => (k === i ? s : v)))} disabilitata={occupato} />
      ))}
      <div className={styles.bottoni}>
        <button type="button" className={styles.pieno} disabled={!completa || occupato} onClick={invia}>
          {richiesta.domande.length > 1 ? t("Invia le risposte", "Send the answers") : t("Invia la risposta", "Send the answer")}
        </button>
        {!completa && <span className={styles.aiuto}>{richiesta.domande.length > 1 ? t("Rispondi a tutte le domande.", "Answer all the questions.") : t("Scegli una risposta.", "Choose an answer.")}</span>}
      </div>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
    </section>
  )
}

/** Ciò che Claude chiede e aspetta: un permesso o delle domande. Finché non si risponde la conversazione sta ferma. */
export function Richieste({ chi, richieste, rispondi }: { chi: string | undefined; richieste: Richiesta[]; rispondi: (richiesta: string, scelta: SceltaRisposta) => Promise<void> }) {
  return (
    <div className={styles.richieste}>
      {richieste.map((r) => (r.tipo === "permesso" ? <Permesso key={r.id} chi={chi} richiesta={r} rispondi={(s) => rispondi(r.id, s)} /> : <Domande key={r.id} chi={chi} richiesta={r} rispondi={(s) => rispondi(r.id, s)} />))}
    </div>
  )
}
