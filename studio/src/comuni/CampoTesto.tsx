import { useLayoutEffect, useRef, useState } from "react"
import styles from "./CampoTesto.module.css"

/** Porta l'altezza del campo a quella del testo; `righe` resta l'altezza minima. */
function adatta(campo: HTMLTextAreaElement) {
  campo.style.height = "auto"
  campo.style.height = `${campo.scrollHeight + campo.offsetHeight - campo.clientHeight}px`
}

/** Un testo che si scrive e si salva uscendo dal campo; se il salvataggio non riesce il testo resta com'è scritto.
 *  Il campo cresce col testo: non serve mai allargarlo a mano. */
export function CampoTesto({ etichetta, valore, righe = 3, onSalva, aiuto }: { etichetta: string; valore: string; righe?: number; onSalva: (nuovo: string) => Promise<void>; aiuto?: string }) {
  const [bozza, setBozza] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const testo = bozza ?? valore

  useLayoutEffect(() => {
    if (ref.current) adatta(ref.current)
  }, [testo])

  // Cambiando la larghezza il testo va a capo altrove, e l'altezza va rifatta.
  useLayoutEffect(() => {
    const campo = ref.current
    if (!campo) return
    let larga = campo.clientWidth
    const osserva = new ResizeObserver(() => {
      if (campo.clientWidth === larga) return
      larga = campo.clientWidth
      adatta(campo)
    })
    osserva.observe(campo)
    return () => osserva.disconnect()
  }, [])

  const salva = () => {
    if (bozza === null || bozza === valore) {
      setBozza(null)
      return
    }
    setErrore(null)
    onSalva(bozza).then(
      () => setBozza(null),
      (e: Error) => setErrore(e.message),
    )
  }

  return (
    <label className={styles.campo}>
      <span className={styles.etichetta}>{etichetta}</span>
      <textarea ref={ref} rows={righe} value={testo} onChange={(e) => setBozza(e.target.value)} onBlur={salva} />
      {aiuto && <span className={styles.aiuto}>{aiuto}</span>}
      {errore && (
        <span className={styles.errore} role="alert">
          {errore}
        </span>
      )}
    </label>
  )
}
