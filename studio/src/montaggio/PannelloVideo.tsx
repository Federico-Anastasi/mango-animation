import { useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { CampoNumero } from "../comuni/CampoNumero"
import { elencoVideo, useCopia } from "../dati"
import { nomeQuadro, tempoLeggibile } from "../testo"
import type { Stile } from "../tipi"
import { frasePerLingua, t } from "../lingua"
import type { Azione } from "./azione"
import { codaDelVideo, modoSottotitoli, quadroDelVideo, staccaDallaBase, testoTitolo } from "./ritocchi"
import styles from "./Pannelli.module.css"

const modi = () => [
  { valore: "parola per parola", nome: t("Parola per parola", "Word by word") },
  { valore: "a battute", nome: t("A battute", "By lines") },
  { valore: "nessuno", nome: t("Nessuno", "None") },
] as const

export function PannelloVideo({ azione, stile, onVaiA }: { azione: Azione; stile: Stile; onVaiA: (tratto: number) => void }) {
  const { ctx, esegui, bloccato } = azione
  const [titolo, setTitolo] = useState<string | null>(null)
  const titoli = useCopia(elencoVideo).dato
  const base = ctx.proprio.base
  const nomeBase = base ? (titoli?.find((v) => v.slug === base)?.scheda.titolo ?? base) : null
  const piano = ctx.effettivo

  return (
    <div className={styles.pannello}>
      <h2>{t("Il video", "The video")}</h2>
      {nomeBase && (
        <div className={styles.avviso}>
          <p>{t("Questo video parte dal video «{base}»: ciò che non dichiara lo prende da lì.", "This video starts from the video «{base}»: what it does not declare it takes from there.", { base: nomeBase })}</p>
          <Bottone variante="vuoto" onClick={() => esegui(staccaDallaBase(ctx))} disabled={bloccato}>
            {t("Stacca dalla base", "Detach from base")}
          </Bottone>
        </div>
      )}

      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Quadro del video", "Video layout")}</span>
        <select value={piano.quadro} disabled={bloccato} onChange={(e) => esegui(quadroDelVideo(ctx, e.target.value))}>
          {Object.keys(stile.quadri).map((q) => (
            <option key={q} value={q}>
              {nomeQuadro(q)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Sottotitoli", "Subtitles")}</span>
        <select value={piano.sottotitoli?.modo ?? stile.sottotitoli.modo} disabled={bloccato} onChange={(e) => esegui(modoSottotitoli(ctx, e.target.value as ReturnType<typeof modi>[number]["valore"]))}>
          {modi().map((m) => (
            <option key={m.valore} value={m.valore}>
              {m.nome}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.campo}>
        <span className={styles.etichetta}>{t("Titolo sul video", "Title on the video")}</span>
        <input
          value={titolo ?? piano.titolo?.testo ?? ""}
          disabled={bloccato}
          placeholder={t("Nessun titolo", "No title")}
          onChange={(e) => setTitolo(e.target.value)}
          onBlur={() => {
            if (titolo === null) return
            const nuovo = titolo
            setTitolo(null)
            if (nuovo.trim() !== (piano.titolo?.testo ?? "")) esegui(testoTitolo(ctx, nuovo))
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") setTitolo(null)
          }}
        />
      </label>

      <CampoNumero etichetta={t("Coda dopo l'ultima parola", "Tail after the last word")} valore={piano.coda ?? 0} unita="s" disabled={bloccato} onConferma={(n) => esegui(codaDelVideo(ctx, n))} />

      <h3>{t("Avvisi del montaggio", "Edit warnings")}</h3>
      {ctx.risolto.avvisi.length === 0 ? (
        <p className={styles.nota}>{t("Nessun avviso: il montaggio non ha niente da segnalare.", "No warnings: the edit has nothing to report.")}</p>
      ) : (
        <ul className={styles.avvisi}>
          {ctx.risolto.avvisi.map((a) => {
            const tratto = ctx.risolto.tratti[a.tratto]
            return (
              <li key={`${a.tratto}-${a.cosa}`}>
                {frasePerLingua(a.cosa, a.cosa_en)}
                {tratto && (
                  <button type="button" className={styles.vai} onClick={() => onVaiA(a.tratto)}>
                    {t("Vai a {tempo}", "Go to {tempo}", { tempo: tempoLeggibile(tratto.esce) })}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
