// Una fra due, tre o quattro scelte brevi: quella scelta è il segmento in rilievo.
import { useId } from "react"
import styles from "./Segmenti.module.css"

export function Segmenti<T extends string>({ etichetta, valori, scelta, onScegli }: { etichetta: string; valori: ReadonlyArray<{ id: T; nome: string }>; scelta: T; onScegli: (id: T) => void }) {
  const gruppo = useId()
  return (
    <div role="radiogroup" aria-label={etichetta} className={styles.segmenti}>
      {valori.map((v) => (
        <label key={v.id} className={styles.segmento}>
          <input type="radio" name={gruppo} checked={v.id === scelta} onChange={() => onScegli(v.id)} />
          {v.nome}
        </label>
      ))}
    </div>
  )
}
