import { useEffect, useRef, useState } from "react"
import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { t } from "../lingua"
import { pluralizza, tempoLeggibile } from "../testo"
import type { Azione } from "./azione"
import { correggiParola, ereditata, togliParole } from "./ritocchi"
import styles from "./Pannelli.module.css"

export function PannelloParole({ azione, da, a, correggi, onDeseleziona }: { azione: Azione; da: number; a: number; correggi: number; onDeseleziona: () => void }) {
  const { ctx, esegui, bloccato } = azione
  const [primo, ultimo] = [Math.min(da, a), Math.max(da, a)]
  const scelte = ctx.risolto.parole.slice(primo, ultimo + 1)
  const una = scelte.length === 1 ? scelte[0]! : null
  const [testo, setTesto] = useState<string | null>(null)
  const [inRosso, setInRosso] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const eredita = scelte.some((p) => {
    const t = ctx.risolto.tratti[p.tratto]
    return t ? ereditata(ctx.proprio, ctx.effettivo, t.scena) : false
  })

  useEffect(() => {
    setTesto(null)
    setInRosso(false)
  }, [da, a])

  useEffect(() => {
    if (correggi > 0) campo.current?.focus()
  }, [correggi])

  return (
    <div className={styles.pannello}>
      <h2>{pluralizza(scelte.length, t("parola scelta", "selected word"), t("parole scelte", "selected words"))}</h2>
      <p className={styles.frase}>«{scelte.map((p) => p.p).join(" ")}»</p>
      <p className={styles.nota}>
        {t("Da {da} a {a}", "From {da} to {a}", { da: tempoLeggibile(scelte[0]?.da ?? 0), a: tempoLeggibile(scelte[scelte.length - 1]?.a ?? 0) })}
      </p>
      {eredita && <p className={styles.nota}>{t("Alcune parole vengono dal video di base: per toglierle stacca prima il video.", "Some words come from the base video: to remove them, detach the video first.")}</p>}
      <div className={styles.azioni}>
        <Bottone
          variante="vuoto"
          onClick={() => {
            esegui(togliParole(ctx, primo, ultimo))
            onDeseleziona()
          }}
          disabled={bloccato || eredita}
        >
          <Icona nome="togli" />
          {t("Togli dal montaggio", "Remove from the edit")}
        </Bottone>
      </div>
      {una && (
        <form
          className={styles.blocco}
          onSubmit={(e) => {
            e.preventDefault()
            esegui(correggiParola(ctx, primo, testo ?? una.p, inRosso))
          }}
        >
          <label className={styles.campo}>
            <span className={styles.etichetta}>{t("Come si scrive", "How it is spelled")}</span>
            <input ref={campo} value={testo ?? una.p} disabled={bloccato} onChange={(e) => setTesto(e.target.value)} />
          </label>
          <label className={styles.spunta}>
            <input type="checkbox" checked={inRosso} onChange={(e) => setInRosso(e.target.checked)} />
            {t("Scrivila in rosso", "Write it in red")}
          </label>
          <p className={styles.nota}>{t("La correzione vale ogni volta che in questo girato si sente la parola così.", "The correction applies every time this word is heard like this in this footage.")}</p>
          <div className={styles.azioni}>
            <button type="submit" className={styles.pieno} disabled={bloccato}>
              {t("Correggi", "Correct")}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
