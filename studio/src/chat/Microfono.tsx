import { useEffect } from "react"
import { useDettatura, type ScriviDettato } from "./dettatura"
import styles from "./Microfono.module.css"
import { t } from "../lingua"

const scorciatoia = (): string => t("Ctrl+Spazio", "Ctrl+Space")

function Simbolo() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M8.5 20.5h7" />
    </svg>
  )
}

const tempo = (secondi: number) => `${Math.floor(secondi / 60)}:${String(secondi % 60).padStart(2, "0")}`

/**
 * Il microfono nel campo della chat: un clic comincia a dettare, un altro finisce. Le parole entrano nel campo dove sta
 * il cursore, mentre il creator parla; il creator le rilegge e manda lui, e mandare spegne il microfono. Compare solo nell'app, dove il
 * ponte c'è.
 */
export function useMicrofono(scrivi: ScriviDettato) {
  const d = useDettatura(scrivi)
  const { alterna } = d

  useEffect(() => {
    if (!d.disponibile) return
    const tasto = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.code !== "Space") return
      e.preventDefault()
      void alterna()
    }
    document.addEventListener("keydown", tasto)
    return () => document.removeEventListener("keydown", tasto)
  }, [d.disponibile, alterna])

  const ascolta = d.fase === "ascolta"

  const bottone = d.disponibile ? (
    <button
      type="button"
      className={styles.microfono}
      data-acceso={ascolta}
      onClick={() => void alterna()}
      disabled={d.fase === "avvio"}
      aria-pressed={ascolta}
      aria-label={ascolta ? t("Finisci di dettare", "Stop dictating") : t("Detta a voce", "Dictate by voice")}
      title={ascolta ? t("Finisci di dettare ({tasti})", "Stop dictating ({tasti})", { tasti: scorciatoia() }) : t("Detta a voce ({tasti})", "Dictate by voice ({tasti})", { tasti: scorciatoia() })}
    >
      <Simbolo />
    </button>
  ) : null

  const striscia =
    d.disponibile && (d.fase !== "ferma" || d.errore) ? (
      <div className={styles.striscia} data-fase={d.fase} role="status" aria-live="polite">
        {d.fase !== "ferma" && (
          <div className={styles.testa}>
            <span className={styles.punto} aria-hidden="true" />
            <strong>{!ascolta ? t("Apro il microfono…", "Opening the microphone…") : d.prepara ? t("Preparo la dettatura…", "Preparing dictation…") : t("Ti ascolto", "Listening")}</strong>
            {ascolta && <span className={styles.tempo}>{tempo(d.secondi)}</span>}
            {ascolta && (
              <span className={styles.livello} aria-hidden="true">
                <span style={{ width: `${Math.round(d.livello * 100)}%` }} />
              </span>
            )}
            {ascolta && (
              <span className={styles.come}>
                {d.prepara ? t("Puoi già parlare: le parole compaiono appena è pronta", "You can already speak: the words appear as soon as it is ready") : t("Clic sul microfono o {tasti} per finire", "Click the microphone or press {tasti} to finish", { tasti: scorciatoia() })}
              </span>
            )}
          </div>
        )}
        {d.errore && (
          <p className={styles.errore} role="alert">
            {d.errore}
          </p>
        )}
      </div>
    ) : null

  return { bottone, striscia, spegni: d.spegni }
}
