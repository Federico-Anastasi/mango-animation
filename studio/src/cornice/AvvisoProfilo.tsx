import { useEffect, useRef } from "react"
import { profilo, useCopia } from "../dati"
import { t, useLingua } from "../lingua"
import styles from "./AvvisoProfilo.module.css"

/** Sotto la barra, finché `profilo.json` non passa lo schema: lo studio intanto lavora con l'ultimo profilo buono. */
export function AvvisoProfilo() {
  const stato = useCopia(profilo).dato
  const { lingua } = useLingua()
  const linguaVista = useRef(lingua)
  useEffect(() => {
    if (linguaVista.current === lingua) return
    linguaVista.current = lingua
    void profilo.rileggi()
  }, [lingua])

  if (!stato || stato.valido) return null
  return (
    <section className={styles.avviso} role="status" aria-labelledby="avviso-profilo">
      <strong id="avviso-profilo">{t("Profilo da correggere", "Profile needs fixing")}</strong>
      <p>
        {t(
          "Il profilo non passa il controllo, e lo studio lavora con l'ultimo profilo buono (o senza). Chiedi nella chat di correggerlo, oppure correggi il file a mano.",
          "The profile did not pass the check, so the studio is using the last good profile (or none). Ask in the chat to fix it, or fix the file by hand.",
        )}
      </p>
      {stato.problemi.length > 0 && (
        <ul>
          {stato.problemi.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
