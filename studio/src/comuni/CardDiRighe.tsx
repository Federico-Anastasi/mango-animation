// Un gruppo di cose dello stesso genere: sopra il nome del gruppo, dentro una riga per cosa, con a sinistra il nome e a cosa serve
// e a destra il suo controllo.
import { useId, type ReactNode } from "react"
import styles from "./CardDiRighe.module.css"

export function CardDiRighe({ nome, children }: { nome: string; children: ReactNode }) {
  const id = useId()
  return (
    <section role="group" aria-labelledby={id} className={styles.gruppo}>
      <h3 id={id} className={styles.nomeDelGruppo}>
        {nome}
      </h3>
      <ul className={styles.card}>{children}</ul>
    </section>
  )
}

export function Riga({ nome, spiegazione, children }: { nome: string; spiegazione?: string; children: ReactNode }) {
  return (
    <li className={styles.riga}>
      <div className={styles.testo}>
        <span className={styles.nome}>{nome}</span>
        {spiegazione && <span className={styles.spiegazione}>{spiegazione}</span>}
      </div>
      <div className={styles.controllo}>{children}</div>
    </li>
  )
}
