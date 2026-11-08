import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { IconaChat } from "./icone"
import styles from "./Immagine.module.css"
import { t } from "../lingua"

/** Un'immagine nella conversazione: si vede grande quanto la chat, e al clic si apre a tutto schermo. */
export function Immagine({ src, alt }: { src: string; alt: string }) {
  const [aperta, setAperta] = useState(false)
  return (
    <>
      <button type="button" className={styles.miniatura} onClick={() => setAperta(true)} aria-label={t("Ingrandisci: {alt}", "Enlarge: {alt}", { alt })}>
        <img src={src} alt={alt} loading="lazy" />
      </button>
      {aperta && <AnteprimaPiena src={src} alt={alt} onChiudi={() => setAperta(false)} />}
    </>
  )
}

function AnteprimaPiena({ src, alt, onChiudi }: { src: string; alt: string; onChiudi: () => void }) {
  const chiudi = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    chiudi.current?.focus()
    const tasto = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      onChiudi()
    }
    document.addEventListener("keydown", tasto, true)
    return () => document.removeEventListener("keydown", tasto, true)
  }, [onChiudi])

  return createPortal(
    <div className={styles.velo} role="dialog" aria-modal="true" aria-label={alt} onClick={onChiudi}>
      <button ref={chiudi} type="button" className={styles.chiudi} onClick={onChiudi} aria-label={t("Chiudi l'immagine", "Close the image")}>
        <IconaChat nome="croce" />
      </button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  )
}
