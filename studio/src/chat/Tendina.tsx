import { useEffect, useRef } from "react"
import type { VoceComando } from "./comandi"
import styles from "./Tendina.module.css"
import { t } from "../lingua"

/** L'id dell'opzione scelta, per `aria-activedescendant` del campo. */
export const idOpzione = (id: string, indice: number): string => `${id}-${indice}`

/** I comandi che il messaggio può diventare, sopra il campo: la scelta e i tasti sono del campo (`Compositore`). */
export function Tendina({ voci, attiva, id, nota, onScegli, onRiprova }: { voci: VoceComando[]; attiva: number; id: string; nota: string | null; onScegli: (voce: VoceComando) => void; onRiprova: () => void }) {
  const elenco = useRef<HTMLUListElement>(null)

  useEffect(() => {
    elenco.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" })
  }, [attiva, voci])

  return (
    <div className={styles.tendina}>
      <ul ref={elenco} id={id} role="listbox" aria-label={t("Comandi", "Commands")} className={styles.elenco}>
        {voci.map((v, i) => (
          // Il fuoco resta nel campo: il clic sceglie senza portarlo via.
          <li key={`${i}-${v.nome}`} id={idOpzione(id, i)} role="option" aria-selected={i === attiva} data-attiva={i === attiva} className={styles.voce} onMouseDown={(e) => e.preventDefault()} onClick={() => onScegli(v)}>
            <span className={styles.nome}>
              /{v.nome}
              {v.argomenti && <span className={styles.argomenti}> {v.argomenti}</span>}
            </span>
            <span className={styles.descrizione}>{v.descrizione}</span>
          </li>
        ))}
      </ul>
      {nota && (
        <p className={styles.nota} role="status">
          {nota}{" "}
          <button type="button" className={styles.riprova} onClick={onRiprova}>
            {t("Riprova", "Try again")}
          </button>
        </p>
      )}
    </div>
  )
}
