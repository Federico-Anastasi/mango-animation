// L'intestazione di una colonna che si tocca per ordinare: la prima volta dal più alto, la seconda dal più basso.
import styles from "./IntestazioneOrdinabile.module.css"

export function IntestazioneOrdinabile({ nome, scelta, rovescio, onOrdina, className }: { nome: string; scelta: boolean; rovescio: boolean; onOrdina: () => void; className?: string }) {
  return (
    <th scope="col" className={className} aria-sort={scelta ? (rovescio ? "ascending" : "descending") : "none"}>
      <button type="button" className={styles.ordina} onClick={onOrdina}>
        {nome}
        {scelta && <span aria-hidden="true"> {rovescio ? "↑" : "↓"}</span>}
      </button>
    </th>
  )
}
