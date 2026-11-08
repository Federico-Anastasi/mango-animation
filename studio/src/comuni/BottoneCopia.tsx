import { useEffect, useState } from "react"
import { t } from "../lingua"
import { Icona } from "./icone"
import styles from "./Bottone.module.css"

/** Copia `testo` negli appunti e per un attimo dice che è fatto. */
export function BottoneCopia({ testo, etichetta = t("Copia", "Copy") }: { testo: string; etichetta?: string }) {
  const [stato, setStato] = useState<"idle" | "copiato" | "fallito">("idle")

  useEffect(() => {
    if (stato === "idle") return
    const timer = setTimeout(() => setStato("idle"), 1800)
    return () => clearTimeout(timer)
  }, [stato])

  const copia = () => {
    navigator.clipboard.writeText(testo).then(
      () => setStato("copiato"),
      () => setStato("fallito"),
    )
  }

  return (
    <button type="button" className={styles.vuoto} onClick={copia} title={stato === "fallito" ? t("Il browser non ha permesso di copiare: selezionalo a mano.", "The browser did not allow copying: select it by hand.") : undefined}>
      <Icona nome={stato === "copiato" ? "spunta" : "copia"} />
      {stato === "copiato" ? t("Copiato", "Copied") : stato === "fallito" ? t("Non copiato", "Not copied") : etichetta}
    </button>
  )
}
