import { Bottone } from "../comuni/Bottone"
import { useCopia } from "../dati"
import { t } from "../lingua"
import { MODELLO_PREDEFINITO, modelliChat, modelloGrande, modelloScelto, predefinitoDi } from "./modelli"
import { avviaPrimoGiro, saltaPrimoGiro } from "./primoGiro"
import type { MotoreChat } from "./tipi"
import styles from "./AvvisoPrimoGiro.module.css"

/**
 * Ciò che il creator legge prima che il primo giro cominci: cos'è, e con quale motore e modello parte la chat al clic (il modello grande del motore, se ne indica uno).
 * Niente va al motore finché non preme «Comincia». `scelto` è il modello che il creator ha scelto per le conversazioni nuove.
 */
export function AvvisoPrimoGiro({ motore, scelto }: { motore: MotoreChat | null; scelto: string | null }) {
  const modelli = useCopia(modelliChat).dato ?? []
  const grande = motore ? modelloGrande(motore, modelli) : undefined
  const senzaGrande = motore?.prefisso === null ? MODELLO_PREDEFINITO : (scelto ?? (motore ? predefinitoDi(motore, modelli) : null))
  const modello = grande ?? modelloScelto(modelli, senzaGrande)
  return (
    <section className={styles.avviso} aria-labelledby="avviso-primo-giro">
      <h2 id="avviso-primo-giro">{t("Il primo giro sta per cominciare", "The first round is about to start")}</h2>
      <p>{t("Ti faccio qualche domanda su chi sei, dove pubblichi e che stile vuoi, e scrivo il tuo profilo. Ci vogliono pochi minuti.", "I will ask you a few questions about who you are, where you publish and what style you want, and write your profile. It takes a few minutes.")}</p>
      {motore && modello && (
        <p>{t("Quando premi «Comincia» la chat parte con {motore} e il modello {modello}.", "When you press “Start” the chat starts with {motore} and the {modello} model.", { motore: motore.nome, modello: modello.nome })}</p>
      )}
      <div className={styles.bottoni}>
        <Bottone variante="principale" onClick={() => avviaPrimoGiro(false)}>
          {t("Comincia", "Start")}
        </Bottone>
        <Bottone onClick={saltaPrimoGiro}>{t("Rimanda", "Not now")}</Bottone>
      </div>
      <p className={styles.nota}>{t("Se rimandi, lo trovi in Impostazioni › Profilo.", "If you put it off, you will find it in Settings › Profile.")}</p>
    </section>
  )
}
