import { useEffect, useState } from "react"
import { t } from "../lingua"
import { Icona } from "./icone"
import styles from "./Bottone.module.css"

/**
 * Scrive `testo` negli appunti. Lo studio dal telefono si apre da un indirizzo `http://` della rete di casa, dove il browser non
 * offre gli appunti moderni: lì si copia come un tempo, da un campo nascosto.
 */
export function copiaNegliAppunti(testo: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(testo)
  const campo = document.createElement("textarea")
  campo.value = testo
  campo.style.cssText = "position: fixed; opacity: 0"
  document.body.append(campo)
  campo.select()
  try {
    return document.execCommand("copy") ? Promise.resolve() : Promise.reject(new Error("copia rifiutata"))
  } catch (e) {
    return Promise.reject(e)
  } finally {
    campo.remove()
  }
}

/** Copia `testo` negli appunti e per un attimo dice che è fatto. */
export function BottoneCopia({ testo, etichetta = t("Copia", "Copy") }: { testo: string; etichetta?: string }) {
  const [stato, setStato] = useState<"idle" | "copiato" | "fallito">("idle")

  useEffect(() => {
    if (stato === "idle") return
    const timer = setTimeout(() => setStato("idle"), 1800)
    return () => clearTimeout(timer)
  }, [stato])

  const copia = () => {
    copiaNegliAppunti(testo).then(
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
