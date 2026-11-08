import { useCopia } from "../dati"
import { dataOra } from "../testo"
import { Errore, Caricamento } from "../comuni/Stati"
import { elencoChat, negozio } from "./negozio"
import styles from "./Elenco.module.css"
import { t } from "../lingua"

/** Le conversazioni, dalla più recente: un clic riprende quella. */
export function Elenco({ corrente, massimo, onScelta }: { corrente: string | null; massimo?: number; onScelta: () => void }) {
  const copia = useCopia(elencoChat)
  if (copia.dato === null) return copia.errore ? <Errore messaggio={copia.errore} onRiprova={() => void elencoChat.rileggi()} /> : <Caricamento etichetta={t("Cerco le conversazioni…", "Looking for conversations…")} />
  const voci = massimo ? copia.dato.slice(0, massimo) : copia.dato
  if (voci.length === 0) return <p className={styles.vuoto}>{t("Non c'è ancora nessuna conversazione.", "There are no conversations yet.")}</p>
  return (
    <ul className={styles.elenco} aria-label={t("Conversazioni", "Conversations")}>
      {voci.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            className={styles.voce}
            aria-current={v.id === corrente ? "true" : undefined}
            onClick={() => {
              if (v.id !== corrente) negozio.apri(v.id)
              onScelta()
            }}
          >
            <span className={styles.titolo}>{v.titolo || t("Senza titolo", "Untitled")}</span>
            <span className={styles.quando}>
              {v.attiva && <span className={styles.punto} role="img" aria-label={t("aperta", "open")} />}
              {dataOra(v.aggiornata)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
