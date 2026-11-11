// Ciò che vale per questo studio e non per un video: la cartella dei dati (solo nell'app), la lingua, il tema e dove trovare la guida.
import { t, scegliLingua, useLingua, type SceltaLingua } from "../lingua"
import { scegliTema, useTema, type Tema } from "../tema"
import { CartellaDeiDati } from "./CartellaDeiDati"
import pagina from "./Impostazioni.module.css"
import styles from "./Generali.module.css"

const GUIDA = "https://github.com/Federico-Anastasi/mango-animation/blob/main/docs/guida"

const lingue = (): Array<{ id: SceltaLingua; nome: string }> => [
  { id: "sistema", nome: t("Quella del sistema", "The system's") },
  { id: "it", nome: "Italiano" },
  { id: "en", nome: "English" },
]

const temi = (): Array<{ id: Tema; nome: string }> => [
  { id: "sistema", nome: t("Quello del sistema", "The system's") },
  { id: "chiaro", nome: t("Chiaro", "Light") },
  { id: "scuro", nome: t("Scuro", "Dark") },
]

function Scelta<T extends string>({ nome, legenda, valori, scelta, onScegli }: { nome: string; legenda: string; valori: Array<{ id: T; nome: string }>; scelta: T; onScegli: (id: T) => void }) {
  return (
    <fieldset className={styles.scelta}>
      <legend>{legenda}</legend>
      {valori.map((v) => (
        <label key={v.id}>
          <input type="radio" name={nome} checked={v.id === scelta} onChange={() => onScegli(v.id)} />
          {v.nome}
        </label>
      ))}
    </fieldset>
  )
}

export function Generali() {
  const { scelta: sceltaLingua, lingua } = useLingua()
  const tema = useTema()
  return (
    <div className={pagina.contenuto}>
      <h1>{t("Generali", "General")}</h1>
      <CartellaDeiDati />
      <section className={styles.sezione} aria-labelledby="lingua-e-tema">
        <h2 id="lingua-e-tema">{t("Lingua e tema", "Language and theme")}</h2>
        <p className={styles.sotto}>{t("Valgono per questo schermo: sul telefono si scelgono da lì.", "They apply to this screen: on your phone you choose them there.")}</p>
        <Scelta nome="lingua" legenda={t("Lingua", "Language")} valori={lingue()} scelta={sceltaLingua} onScegli={scegliLingua} />
        <Scelta nome="tema" legenda={t("Tema", "Theme")} valori={temi()} scelta={tema} onScegli={scegliTema} />
      </section>
      <section className={styles.sezione} aria-labelledby="guida">
        <h2 id="guida">{t("Guida", "Guide")}</h2>
        <p className={styles.sotto}>{t("Dall'installazione al primo video pubblicato, fase per fase.", "From installing to the first published video, step by step.")}</p>
        <p>
          <a href={`${GUIDA}/${lingua === "it" ? "italiano" : "english"}.md`} target="_blank" rel="noreferrer">
            {t("Apri la guida", "Open the guide")}
          </a>
        </p>
      </section>
    </div>
  )
}
