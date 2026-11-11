// «A che punto è questo video?»: gli otto passi del metodo, quello di adesso in rilievo, e cosa fare o chiedere per andare avanti.
import { proponiNellaChat } from "../chat/bozza"
import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { t } from "../lingua"
import type { Fase } from "../tipi"
import { cosaFareAdesso, NUMERO_PASSI, nomeDelPasso, passoCorto } from "./passi"
import styles from "./RigaDeiPassi.module.css"

export function RigaDeiPassi({ fase }: { fase: Fase }) {
  const fatto = fase.azione === "fatto"
  const adesso = cosaFareAdesso(fase)
  return (
    <section className={styles.riga} aria-label={t("A che punto è il video", "Where the video is")}>
      <ol className={styles.passi}>
        {Array.from({ length: NUMERO_PASSI }, (_, i) => i + 1).map((passo) => {
          const stato = fatto || passo < fase.passo ? "fatto" : passo === fase.passo ? "adesso" : "dopo"
          return (
            <li key={passo} className={styles.passo} data-stato={stato} aria-current={stato === "adesso" ? "step" : undefined}>
              <span className={styles.segno}>{stato === "fatto" ? <Icona nome="spunta" dimensione={12} /> : passo}</span>
              <span className={styles.nome}>{nomeDelPasso(passo)}</span>
            </li>
          )
        })}
      </ol>
      <p className={styles.corto}>{fatto ? t("Fatto · uscito", "Done · released") : passoCorto(fase)}</p>
      {adesso && (
        <div className={styles.adesso}>
          <p>{adesso.dire}</p>
          <Bottone variante="vuoto" onClick={() => proponiNellaChat(adesso.scrivi)} titolo={t("Mette la frase nel campo della chat, senza mandarla", "Puts the sentence in the chat box, without sending it")}>
            {t("Scrivila nella chat", "Write it in the chat")}
          </Bottone>
        </div>
      )}
    </section>
  )
}
