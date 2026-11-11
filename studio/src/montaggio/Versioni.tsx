// «Com'era prima?»: le versioni del piano che il server tiene (`storia/`), con la data, cosa scrivevano, «Guarda» (la loro struttura, in sola lettura)
// e «Torna a questa» (con conferma: il piano di adesso resta fra le versioni).
import { useEffect, useState } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { Icona } from "../comuni/icone"
import { t } from "../lingua"
import { dataOra, durata, nomeFile, nomeQuadro, pluralizza, tempoLeggibile } from "../testo"
import type { DettaglioVideo, Pezzo, Piano, VersionePiano } from "../tipi"
import styles from "./Versioni.module.css"

const cosaScrive = (v: VersionePiano): string =>
  v.scene === null || v.pezzi === null ? t("piano che non si legge", "plan that cannot be read") : `${pluralizza(v.scene, t("scena", "scene"), t("scene", "scenes"))} · ${pluralizza(v.pezzi, t("pezzo", "clip"), t("pezzi", "clips"))}`

const testoPezzo = (p: Pezzo, piano: Piano): string => {
  if (p.sorgente === undefined) return t("senza voce, {durata}", "no voice, {durata}", { durata: durata(p.durata ?? 0) })
  if (p.dice) return `${t("«{dice}»", "“{dice}”", { dice: p.dice })}${p.minuto ? ` (${p.minuto})` : ""}`
  const ripresa = nomeFile(piano.sorgenti?.[p.sorgente]?.file ?? p.sorgente)
  return p.da !== undefined && p.a !== undefined ? `${ripresa} · ${tempoLeggibile(p.da)}–${tempoLeggibile(p.a)}` : ripresa
}

/** Il piano com'era: scena per scena, cosa mostra e cosa dice. Non si tocca niente. */
function Contorno({ piano }: { piano: Piano }) {
  const scene = piano.scene ?? []
  if (scene.length === 0) return <p className={styles.tenue}>{t("Questa versione non scrive scene proprie.", "This version writes no scenes of its own.")}</p>
  return (
    <ol className={styles.contorno}>
      {scene.map((scena, i) => {
        const quadro = scena.quadro ?? piano.quadro
        return (
          <li key={i}>
            <strong>{scena.nome}</strong>
            {quadro && <span className={styles.tenue}> · {nomeQuadro(quadro)}</span>}
            <ul>
              {scena.pezzi.map((pezzo, j) => (
                <li key={j}>{testoPezzo(pezzo, piano)}</li>
              ))}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

export function Versioni({ video }: { video: DettaglioVideo }) {
  const { slug } = video
  const [aperto, setAperto] = useState(false)
  const [versioni, setVersioni] = useState<VersionePiano[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [guardata, setGuardata] = useState<{ n: number; piano: Piano } | null>(null)
  const [conferma, setConferma] = useState<number | null>(null)
  const [invio, setInvio] = useState(false)

  // Ogni salvataggio del piano ne fa una versione nuova: l'elenco si rilegge quando il piano cambia.
  useEffect(() => {
    let vivo = true
    api.versioniPiano(slug).then(
      (r) => {
        if (!vivo) return
        setVersioni(r.versioni)
        setErrore(null)
      },
      (e: Error) => {
        if (vivo) setErrore(e.message)
      },
    )
    return () => {
      vivo = false
    }
  }, [slug, video.piano_cambiato])

  if (versioni === null || versioni.length < 2) {
    return errore ? (
      <p className={styles.errore} role="alert">
        {errore}
      </p>
    ) : null
  }

  const guarda = (n: number) => {
    if (guardata?.n === n) {
      setGuardata(null)
      return
    }
    setErrore(null)
    api.versionePiano(slug, n).then(setGuardata, (e: Error) => setErrore(e.message))
  }
  const torna = (n: number) => {
    setInvio(true)
    api
      .tornaAllaVersione(slug, n)
      .then(
        () => {
          setGuardata(null)
          setErrore(null)
        },
        (e: Error) => setErrore(e.message),
      )
      .finally(() => {
        setConferma(null)
        setInvio(false)
      })
  }

  return (
    <section className={styles.versioni} aria-label={t("Versioni del montaggio", "Edit versions")}>
      <button type="button" className={styles.apri} aria-expanded={aperto} onClick={() => setAperto(!aperto)}>
        <Icona nome={aperto ? "giu" : "destra"} dimensione={14} />
        {t("Versioni", "Versions")} · {versioni.length}
      </button>
      {errore && (
        <p className={styles.errore} role="alert">
          {errore}
        </p>
      )}
      {aperto && (
        <ul className={styles.elenco}>
          {versioni.map((v) => (
            <li key={v.n ?? "adesso"} className={styles.riga} data-in-uso={v.in_uso || undefined}>
              <div className={styles.intesta}>
                <span className={styles.quando} title={v.da && !v.in_uso ? t("In uso dal {quando}", "In use since {quando}", { quando: dataOra(v.da) }) : undefined}>
                  {v.in_uso
                    ? v.da
                      ? t("In uso adesso, dal {quando}", "In use now, since {quando}", { quando: dataOra(v.da) })
                      : t("In uso adesso", "In use now")
                    : v.fino
                      ? t("Fino al {quando}", "Until {quando}", { quando: dataOra(v.fino) })
                      : t("Più vecchia", "Older")}
                </span>
                <span className={styles.tenue}>{cosaScrive(v)}</span>
                {!v.in_uso && v.n !== null && (
                  <span className={styles.gesti}>
                    <Bottone variante="vuoto" onClick={() => guarda(v.n!)} titolo={t("Mostra com'era questa versione, senza cambiare niente", "Shows what this version was like, without changing anything")}>
                      {guardata?.n === v.n ? t("Chiudi", "Close") : t("Guarda", "Look")}
                    </Bottone>
                    <Bottone variante="vuoto" onClick={() => setConferma(v.n)} disabled={invio}>
                      {t("Torna a questa", "Go back to this one")}
                    </Bottone>
                  </span>
                )}
              </div>
              {conferma !== null && conferma === v.n && (
                <div className={styles.conferma} role="alertdialog" aria-label={t("Conferma", "Confirm")}>
                  <span>{t("Il piano torna com'era. Quello di adesso resta fra le versioni, e potrai tornarci. Il video montato cambia solo quando lo rimonti.", "The plan goes back to how it was. The current one stays among the versions, and you can go back to it. The edited video only changes when you edit it again.")}</span>
                  <Bottone onClick={() => torna(conferma)} disabled={invio}>
                    {t("Sì, torna a questa", "Yes, go back to this one")}
                  </Bottone>
                  <Bottone variante="vuoto" onClick={() => setConferma(null)}>
                    {t("No, lascia com'è", "No, leave it")}
                  </Bottone>
                </div>
              )}
              {guardata?.n === v.n && <Contorno piano={guardata.piano} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
