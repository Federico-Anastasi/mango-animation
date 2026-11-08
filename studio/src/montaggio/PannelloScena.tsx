import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { t } from "../lingua"
import { durata, nomeQuadro, pluralizza } from "../testo"
import type { Stile } from "../tipi"
import type { Azione } from "./azione"
import { cambiaAnimazione, ereditata, quadroDellaScena, spostaScena, staccaDallaBase } from "./ritocchi"
import styles from "./Pannelli.module.css"

export function PannelloScena({ azione, indice, stile, animazioni }: { azione: Azione; indice: number; stile: Stile; animazioni: string[] }) {
  const { ctx, esegui, bloccato } = azione
  const scena = ctx.effettivo.scene[indice]
  const risolta = ctx.risolto.scene[indice]
  if (!scena || !risolta) return null
  const inEredita = ereditata(ctx.proprio, ctx.effettivo, indice)
  const sigle = [...new Set([...(scena.animazione ? [scena.animazione] : []), ...animazioni])]
  const spento = bloccato || inEredita
  const nonStaccata = ctx.proprio.base !== undefined

  return (
    <div className={styles.pannello}>
      <h2>{t("Scena «{nome}»", "Scene «{nome}»", { nome: scena.nome })}</h2>
      <p className={styles.nota}>
        {pluralizza(scena.pezzi.length, t("pezzo", "clip"), t("pezzi", "clips"))}, {durata(risolta.durata)}
      </p>

      {inEredita && (
        <div className={styles.avviso}>
          <p>{t("Questa scena viene dal video «{base}»: da qui non si cambia.", "This scene comes from the video «{base}»: it cannot be changed from here.", { base: ctx.proprio.base ?? "" })}</p>
          <Bottone variante="vuoto" onClick={() => esegui(staccaDallaBase(ctx))} disabled={bloccato}>
            {t("Stacca dalla base", "Detach from base")}
          </Bottone>
        </div>
      )}

      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Quadro", "Layout")}</span>
        <select value={scena.quadro ?? ""} disabled={spento} onChange={(e) => esegui(quadroDellaScena(ctx, indice, e.target.value === "" ? null : e.target.value))}>
          <option value="">{t("Quello del video ({quadro})", "The video's ({quadro})", { quadro: nomeQuadro(ctx.effettivo.quadro) })}</option>
          {Object.keys(stile.quadri).map((q) => (
            <option key={q} value={q}>
              {nomeQuadro(q)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Animazione", "Animation")}</span>
        <select value={scena.animazione ?? ""} disabled={spento} onChange={(e) => esegui(cambiaAnimazione(ctx, indice, e.target.value === "" ? null : e.target.value))}>
          <option value="">{t("Nessuna", "None")}</option>
          {sigle.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.azioni}>
        <Bottone variante="vuoto" onClick={() => esegui(spostaScena(ctx, indice, -1))} disabled={bloccato || nonStaccata || indice === 0} titolo={nonStaccata ? t("Con una base le scene non si riordinano: stacca prima il video", "With a base the scenes cannot be reordered: detach the video first") : undefined}>
          <Icona nome="sinistra" />
          {t("Sposta prima", "Move earlier")}
        </Bottone>
        <Bottone variante="vuoto" onClick={() => esegui(spostaScena(ctx, indice, 1))} disabled={bloccato || nonStaccata || indice >= ctx.effettivo.scene.length - 1} titolo={nonStaccata ? t("Con una base le scene non si riordinano: stacca prima il video", "With a base the scenes cannot be reordered: detach the video first") : undefined}>
          {t("Sposta dopo", "Move later")}
          <Icona nome="destra" />
        </Bottone>
      </div>
    </div>
  )
}
