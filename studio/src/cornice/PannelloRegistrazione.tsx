import { useEffect, useRef, useState } from "react"
import { api } from "../api"
import { useChiudiFuori } from "../comuni/useChiudiFuori"
import { registrazione, useCopia } from "../dati"
import { t } from "../lingua"
import { istante, nomeFile, tempoLeggibile } from "../testo"
import type { ModoRegistrazione } from "../tipi"
import { dispositivoDaUsare, ricorda, type TipoDispositivo } from "./dispositivi"
import base from "./PannelloLavori.module.css"
import styles from "./PannelloRegistrazione.module.css"

const modi = (): Array<{ modo: ModoRegistrazione; nome: string; cosa: string }> => [
  { modo: "schermo", nome: t("Solo lo schermo", "Screen only"), cosa: t("Senza audio.", "No audio.") },
  { modo: "voce", nome: t("Schermo e voce", "Screen and voice"), cosa: t("Lo schermo con la voce dal microfono, in un file solo.", "The screen with your voice from the microphone, in a single file.") },
  { modo: "viso", nome: t("Schermo, voce e viso", "Screen, voice and face"), cosa: t("In più la webcam, in un secondo file.", "Plus the webcam, in a second file.") },
]

/** Il tempo passato da `da`, aggiornato ogni secondo: è un orologio dell'interfaccia, non chiede niente al server. */
export function Trascorso({ da }: { da: string }) {
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setAdesso(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const inizio = istante(da)
  return <>{tempoLeggibile(inizio === null ? 0 : (adesso - inizio) / 1000, false)}</>
}

function ScegliDispositivo({ etichetta, nessuno, trovati, scelto, onScegli }: { etichetta: string; nessuno: string; trovati: readonly string[]; scelto: string | null; onScegli: (nome: string) => void }) {
  if (trovati.length === 0) {
    return (
      <p className={base.piccolo}>
        {etichetta}: {nessuno}
      </p>
    )
  }
  return (
    <label className={styles.dispositivo}>
      <span className={base.piccolo}>{etichetta}</span>
      <select value={scelto ?? ""} onChange={(e) => onScegli(e.target.value)}>
        {scelto === null && <option value="">{t("Scegli", "Choose")}</option>}
        {trovati.map((nome) => (
          <option key={nome} value={nome}>
            {nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PannelloRegistrazione({ onChiudi }: { onChiudi: () => void }) {
  const stato = useCopia(registrazione).dato
  const [modo, setModo] = useState<ModoRegistrazione>("voce")
  const [scelti, setScelti] = useState<Record<TipoDispositivo, string | null>>({ microfono: null, camera: null })
  const [errore, setErrore] = useState<string | null>(null)
  const [occupato, setOccupato] = useState(false)
  const riquadro = useRef<HTMLDivElement>(null)
  useChiudiFuori(riquadro, onChiudi)

  const fai = (azione: () => Promise<unknown>) => {
    setErrore(null)
    setOccupato(true)
    azione()
      .then(() => registrazione.rileggi())
      .catch((e: Error) => setErrore(e.message))
      .finally(() => setOccupato(false))
  }

  const inCorso = stato?.in_corso ?? null
  const dispositivi = stato?.dispositivi ?? null
  const microfoni = dispositivi?.microfoni ?? []
  const camere = dispositivi?.camere ?? []
  const microfono = dispositivoDaUsare("microfono", microfoni, scelti.microfono)
  const camera = dispositivoDaUsare("camera", camere, scelti.camera)
  const scegli = (tipo: TipoDispositivo, nome: string) => {
    ricorda(tipo, nome)
    setScelti((s) => ({ ...s, [tipo]: nome }))
  }
  const conMicrofono = modo !== "schermo"
  const conCamera = modo === "viso"
  const richiesta = () => api.avviaRegistrazione(modo, { ...(conMicrofono && microfono !== null ? { microfono } : {}), ...(conCamera && camera !== null ? { camera } : {}) })

  return (
    <div ref={riquadro} className={base.pannello} role="dialog" aria-label={t("Registrazione", "Recording")}>
      <h2>{t("Registrazione", "Recording")}</h2>
      {errore && (
        <p className={base.errore} role="alert">
          {errore}
        </p>
      )}
      {stato && !stato.disponibile ? (
        <p className={base.piccolo}>{stato.motivo}</p>
      ) : inCorso ? (
        <div className={styles.blocco}>
          <p className={styles.inCorso}>
            <span className={styles.punto} aria-hidden="true" />
            {modi().find((m) => m.modo === inCorso.modo)?.nome ?? t("Registrazione", "Recording")} · <Trascorso da={inCorso.iniziata} />
          </p>
          <ul className={base.elenco}>
            {inCorso.file.map((f) => (
              <li key={f} className={base.piccolo}>
                {nomeFile(f)}
              </li>
            ))}
          </ul>
          <button type="button" className={styles.principale} disabled={occupato} onClick={() => fai(api.fermaRegistrazione)}>
            {t("Ferma la registrazione", "Stop recording")}
          </button>
          <p className={base.piccolo}>{t("Quando la fermi, i file compaiono nel girato di oggi.", "When you stop it, the files appear in today's footage.")}</p>
        </div>
      ) : (
        <div className={styles.blocco}>
          <fieldset className={styles.scelte}>
            <legend>{t("Cosa registro", "What to record")}</legend>
            {modi().map((m) => (
              <label key={m.modo} className={styles.scelta}>
                <input type="radio" name="modo-registrazione" aria-label={m.nome} checked={modo === m.modo} onChange={() => setModo(m.modo)} />
                <span>
                  <strong>{m.nome}</strong>
                  <span className={base.piccolo}>{m.cosa}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {conMicrofono && <ScegliDispositivo etichetta={t("Microfono", "Microphone")} nessuno={t("nessuno trovato", "none found")} trovati={microfoni} scelto={microfono} onScegli={(nome) => scegli("microfono", nome)} />}
          {conCamera && <ScegliDispositivo etichetta={t("Webcam", "Webcam")} nessuno={t("nessuna trovata", "none found")} trovati={camere} scelto={camera} onScegli={(nome) => scegli("camera", nome)} />}
          <div className={styles.azioni}>
            <button type="button" className={styles.principale} disabled={occupato} onClick={() => fai(richiesta)}>
              {t("Avvia la registrazione", "Start recording")}
            </button>
            <button type="button" className={base.azione} disabled={occupato} onClick={() => fai(api.cercaDispositivi)}>
              {t("Cerca di nuovo i dispositivi", "Look for devices again")}
            </button>
          </div>
          {stato?.ultima && (
            <p className={stato.ultima.errore ? base.fallito : base.piccolo}>
              {stato.ultima.errore ? t("L'ultima si è interrotta: {errore}", "The last one was interrupted: {errore}", { errore: stato.ultima.errore }) : <>{t("L'ultima è nel", "The last one is in the")} <a href="#/girato">{t("girato", "footage")}</a>: {stato.ultima.file.map(nomeFile).join(", ")}</>}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
