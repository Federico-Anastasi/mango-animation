import { useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CampoRiga } from "../comuni/CampoRiga"
import { Icona } from "../comuni/icone"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import { perCampoDataOra } from "../testo"
import type { Pubblicazione } from "../tipi"
import type { PropsScheda } from "./PaginaVideo"
import { CANALI, conLista, nonFallire } from "./liste"
import styles from "./SchedaDelVideo.module.css"

/** Un indirizzo vuoto non si scrive: la chiave sparisce dalla pubblicazione. */
const conIndirizzo = (canale: string, data: string, url: string): Pubblicazione => (url.trim() === "" ? { canale, data } : { canale, data, url: url.trim() })

function SceltaCanale({ valore, onCambia }: { valore: string; onCambia: (canale: string) => void }) {
  const noto = CANALI.some((c) => c.id === valore)
  return (
    <label className={styles.campoScelta}>
      <span>{t("Canale", "Channel")}</span>
      <select value={valore} onChange={(e) => onCambia(e.target.value)}>
        {!noto && <option value={valore}>{valore}</option>}
        {CANALI.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PubblicazioniScheda({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const pubblicazioni = scheda.pubblicazioni ?? []
  const salva = (nuove: Pubblicazione[]) => salvaScheda(conLista(scheda, "pubblicazioni", nuove))
  const cambia = (i: number, nuova: Pubblicazione) => salva(pubblicazioni.map((p, j) => (j === i ? nuova : p)))

  const [canaleScelto, setCanaleScelto] = useState<string | null>(null)
  const [quando, setQuando] = useState("")
  const [indirizzo, setIndirizzo] = useState("")
  const [errore, setErrore] = useState<string | null>(null)
  const canale = canaleScelto ?? scheda.canali?.[0] ?? CANALI[0].id

  const aggiungi = () => {
    if (quando === "") {
      setErrore(t("Scrivi giorno e ora in cui è uscito.", "Write the day and time it came out."))
      return
    }
    setErrore(null)
    salva([...pubblicazioni, conIndirizzo(canale, quando, indirizzo)]).then(
      () => {
        setCanaleScelto(null)
        setQuando("")
        setIndirizzo("")
      },
      (e: Error) => setErrore(e.message),
    )
  }

  return (
    <>
      {pubblicazioni.length === 0 ? (
        <Vuoto>{t("Non è ancora stato pubblicato su nessun canale.", "It has not been published on any channel yet.")}</Vuoto>
      ) : (
        <ul className={styles.pubblicazioni}>
          {pubblicazioni.map((p, i) => (
            <li key={i}>
              <div role="group" aria-label={t("Pubblicazione {n}", "Publication {n}", { n: i + 1 })} className={styles.rigaPubblicazione}>
                <SceltaCanale valore={p.canale} onCambia={(c) => nonFallire(cambia(i, conIndirizzo(c, p.data, p.url ?? "")))} />
                <CampoRiga
                  etichetta={t("Giorno e ora", "Day and time")}
                  tipo="datetime-local"
                  valore={perCampoDataOra(p.data)}
                  onSalva={(v) => (v === "" ? Promise.reject(new Error(t("Scrivi giorno e ora in cui è uscito.", "Write the day and time it came out."))) : cambia(i, conIndirizzo(p.canale, v, p.url ?? "")))}
                />
                <CampoRiga etichetta={t("Indirizzo", "Address")} valore={p.url ?? ""} onSalva={(v) => cambia(i, conIndirizzo(p.canale, p.data, v))} />
                <div className={styles.azioniRiga}>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {t("Apri l'indirizzo", "Open the address")}
                    </a>
                  )}
                  <Bottone variante="vuoto" etichetta={t("Togli la pubblicazione {n}", "Remove publication {n}", { n: i + 1 })} onClick={() => nonFallire(salva(pubblicazioni.filter((_, j) => j !== i)))}>
                    <Icona nome="togli" />
                    {t("Togli", "Remove")}
                  </Bottone>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div role="group" aria-label={t("Aggiungi una pubblicazione", "Add a publication")} className={styles.rigaPubblicazione}>
        <p className={styles.titoloAggiungi}>{t("Una pubblicazione nuova", "A new publication")}</p>
        <SceltaCanale valore={canale} onCambia={setCanaleScelto} />
        <label className={styles.campoScelta}>
          <span>{t("Giorno e ora", "Day and time")}</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </label>
        <label className={styles.campoScelta}>
          <span>{t("Indirizzo", "Address")}</span>
          <input type="text" value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} />
        </label>
        <div className={styles.azioniRiga}>
          <Bottone variante="vuoto" onClick={aggiungi} etichetta={t("Aggiungi la pubblicazione", "Add the publication")}>
            <Icona nome="piu" />
            {t("Aggiungi", "Add")}
          </Bottone>
        </div>
        {errore && (
          <span className={styles.errore} role="alert">
            {errore}
          </span>
        )}
      </div>
    </>
  )
}
