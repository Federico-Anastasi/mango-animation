// Le schede di una pagina: una fila di collegamenti, uno solo acceso. Se la pagina è stretta (anche perché la chat le sta accanto) scorrono di lato, con l'ombra sul bordo dove c'è altro.
import styles from "./Schede.module.css"

export function Schede<T extends string>({ etichetta, schede, attiva, indirizzo }: { etichetta: string; schede: Array<{ id: T; nome: string }>; attiva: T; indirizzo: (id: T) => string }) {
  return (
    <nav className={`${styles.schede} scorri-con-segno`} aria-label={etichetta}>
      {schede.map((s) => (
        <a key={s.id} href={indirizzo(s.id)} className={styles.scheda} aria-current={s.id === attiva ? "page" : undefined}>
          {s.nome}
        </a>
      ))}
    </nav>
  )
}
