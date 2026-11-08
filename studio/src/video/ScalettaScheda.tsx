import { useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CampoTesto } from "../comuni/CampoTesto"
import { Icona } from "../comuni/icone"
import { Vuoto } from "../comuni/Stati"
import { t } from "../lingua"
import type { PassoScaletta } from "../tipi"
import type { PropsScheda } from "./PaginaVideo"
import { conLista, nonFallire } from "./liste"
import styles from "./SchedaDelVideo.module.css"

/** Un campo svuotato sparisce dal passo: solo `apri` è obbligatorio. */
function passoCon(passo: PassoScaletta, campo: keyof PassoScaletta, testo: string): PassoScaletta {
  const nuovo = { ...passo, [campo]: testo.trim() }
  if (campo !== "apri" && nuovo[campo] === "") delete nuovo[campo]
  return nuovo
}

export function ScalettaScheda({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const passi = scheda.scaletta ?? []
  const salva = (nuovi: PassoScaletta[]) => salvaScheda(conLista(scheda, "scaletta", nuovi))
  const cambia = (i: number, campo: keyof PassoScaletta, testo: string) => salva(passi.map((p, j) => (j === i ? passoCon(p, campo, testo) : p)))
  const sposta = (i: number, verso: -1 | 1) => {
    const nuovi = [...passi]
    const [passo] = nuovi.splice(i, 1)
    nuovi.splice(i + verso, 0, passo!)
    nonFallire(salva(nuovi))
  }

  const [nuovo, setNuovo] = useState("")
  const [errore, setErrore] = useState<string | null>(null)
  const aggiungi = () => {
    const apri = nuovo.trim()
    if (apri === "") {
      setErrore(t("Scrivi cosa aprire in questo passo.", "Write what to open in this step."))
      return
    }
    setErrore(null)
    salva([...passi, { apri }]).then(
      () => setNuovo(""),
      (e: Error) => setErrore(e.message),
    )
  }

  return (
    <section className={styles.blocco}>
      <h2 id="titolo-scaletta">{t("La scaletta", "The outline")}</h2>
      {passi.length === 0 ? (
        <Vuoto>{t("Nessun passo. Serve ai video che si registrano a braccio: un passo per ogni cosa da aprire.", "No steps. It is for videos recorded off the cuff: one step for each thing to open.")}</Vuoto>
      ) : (
        <ol className={styles.scaletta} aria-labelledby="titolo-scaletta">
          {passi.map((passo, i) => (
            <li key={i}>
              <span className={styles.numeroPasso}>{i + 1}</span>
              <div className={styles.passo}>
                <CampoTesto etichetta={t("Cosa aprire", "What to open")} righe={1} valore={passo.apri} onSalva={(v) => (v.trim() === "" ? Promise.reject(new Error(t("Scrivi cosa aprire in questo passo.", "Write what to open in this step."))) : cambia(i, "apri", v))} />
                <CampoTesto etichetta={t("Cosa fare", "What to do")} righe={1} valore={passo.fai ?? ""} onSalva={(v) => cambia(i, "fai", v)} />
                <CampoTesto etichetta={t("Cosa spiegare", "What to explain")} righe={1} valore={passo.spiega ?? ""} onSalva={(v) => cambia(i, "spiega", v)} />
              </div>
              <div className={styles.azioniPasso}>
                <button type="button" className={styles.piccolo} aria-label={t("Sposta il passo {n} su", "Move step {n} up", { n: i + 1 })} title={t("Sposta su", "Move up")} disabled={i === 0} onClick={() => sposta(i, -1)}>
                  <Icona nome="su" dimensione={16} />
                </button>
                <button type="button" className={styles.piccolo} aria-label={t("Sposta il passo {n} giù", "Move step {n} down", { n: i + 1 })} title={t("Sposta giù", "Move down")} disabled={i === passi.length - 1} onClick={() => sposta(i, 1)}>
                  <Icona nome="giu" dimensione={16} />
                </button>
                <button type="button" className={styles.piccolo} aria-label={t("Togli il passo {n}", "Remove step {n}", { n: i + 1 })} title={t("Togli", "Remove")} onClick={() => nonFallire(salva(passi.filter((_, j) => j !== i)))}>
                  <Icona nome="togli" dimensione={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className={styles.aggiungi}>
        <input type="text" aria-label={t("Nuovo passo", "New step")} placeholder={t("Cosa aprire nel nuovo passo", "What to open in the new step")} value={nuovo} onChange={(e) => setNuovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aggiungi()} />
        <Bottone variante="vuoto" onClick={aggiungi} etichetta={t("Aggiungi il passo", "Add the step")}>
          <Icona nome="piu" />
          {t("Aggiungi", "Add")}
        </Bottone>
        {errore && (
          <span className={styles.errore} role="alert">
            {errore}
          </span>
        )}
      </div>
    </section>
  )
}
