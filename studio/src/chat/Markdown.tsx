import { Fragment, useMemo, useState, type ReactNode } from "react"
import { Icona } from "../comuni/icone"
import { Stima } from "../comuni/Stima"
import type { Pezzo } from "./collegamenti"
import { indirizzoSicuro, leggiBlocchi, type Blocco, type Inline } from "./analisiMarkdown"
import { dividiStime } from "./stime"
import styles from "./Markdown.module.css"
import { t } from "../lingua"

type Collega = (testo: string) => Pezzo[]

const ALLINEA = { sinistra: "left", centro: "center", destra: "right" } as const

function ConStime({ testo }: { testo: string }) {
  return (
    <>
      {dividiStime(testo).map((f, i) => (f.stima ? <Stima key={i}>{f.testo}</Stima> : <Fragment key={i}>{f.testo}</Fragment>))}
    </>
  )
}

function Collegamenti({ testo, collega }: { testo: string; collega?: Collega }) {
  if (!collega) return <ConStime testo={testo} />
  return (
    <>
      {collega(testo).map((p, i) =>
        typeof p === "string" ? (
          <ConStime key={i} testo={p} />
        ) : (
          <a key={i} href={p.href} data-video="">
            {p.testo}
          </a>
        ),
      )}
    </>
  )
}

function Inlines({ nodi, collega }: { nodi: Inline[]; collega?: Collega }): ReactNode {
  return nodi.map((n, i) => {
    switch (n.tipo) {
      case "testo":
        return <Collegamenti key={i} testo={n.testo} collega={collega} />
      case "codice": {
        const pezzi = collega?.(n.testo) ?? [n.testo]
        const link = pezzi.length === 1 && typeof pezzi[0] !== "string" ? pezzi[0] : null
        return link ? (
          <a key={i} href={link.href} data-video="" className={styles.codiceLink}>
            <code>{n.testo}</code>
          </a>
        ) : (
          <code key={i}>{n.testo}</code>
        )
      }
      case "forte":
        return (
          <strong key={i}>
            <Inlines nodi={n.figli} collega={collega} />
          </strong>
        )
      case "corsivo":
        return (
          <em key={i}>
            <Inlines nodi={n.figli} collega={collega} />
          </em>
        )
      case "barrato":
        return (
          <del key={i}>
            <Inlines nodi={n.figli} collega={collega} />
          </del>
        )
      case "a-capo":
        return <br key={i} />
      case "collegamento":
        return indirizzoSicuro(n.href) ? (
          <a key={i} href={n.href} {...(n.href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer noopener" })}>
            <Inlines nodi={n.figli} />
          </a>
        ) : (
          <Fragment key={i}>
            <Inlines nodi={n.figli} />
          </Fragment>
        )
    }
  })
}

export function BloccoCodice({ testo, lingua }: { testo: string; lingua?: string }) {
  const [copiato, setCopiato] = useState(false)
  const copia = () => {
    navigator.clipboard.writeText(testo).then(
      () => {
        setCopiato(true)
        setTimeout(() => setCopiato(false), 1500)
      },
      () => undefined,
    )
  }
  return (
    <div className={styles.codice}>
      <div className={styles.testaCodice}>
        <span>{lingua}</span>
        <button type="button" onClick={copia} aria-label={t("Copia il codice", "Copy the code")}>
          <Icona nome={copiato ? "spunta" : "copia"} />
          {copiato ? t("Copiato", "Copied") : t("Copia", "Copy")}
        </button>
      </div>
      <pre tabIndex={0}>
        <code>{testo}</code>
      </pre>
    </div>
  )
}

function Blocchi({ blocchi, collega }: { blocchi: Blocco[]; collega?: Collega }): ReactNode {
  return blocchi.map((b, i) => {
    switch (b.tipo) {
      case "titolo":
        return (
          <p key={i} className={styles.titolo} data-livello={Math.min(b.livello, 4)} role="heading" aria-level={Math.min(b.livello + 2, 6)}>
            <Inlines nodi={b.figli} collega={collega} />
          </p>
        )
      case "paragrafo":
        return (
          <p key={i}>
            <Inlines nodi={b.figli} collega={collega} />
          </p>
        )
      case "linea":
        return <hr key={i} />
      case "codice":
        return <BloccoCodice key={i} testo={b.testo} lingua={b.lingua} />
      case "citazione":
        return (
          <blockquote key={i}>
            <Blocchi blocchi={b.blocchi} collega={collega} />
          </blockquote>
        )
      case "elenco": {
        const Tag = b.ordinato ? "ol" : "ul"
        return (
          <Tag key={i} {...(b.ordinato && b.inizio !== 1 ? { start: b.inizio } : {})}>
            {b.voci.map((v, k) => (
              <li key={k} className={v.casella === null ? undefined : styles.casella}>
                {v.casella !== null && <input type="checkbox" checked={v.casella} readOnly aria-label={v.casella ? t("fatto", "done") : t("da fare", "to do")} />}
                <div>
                  <Blocchi blocchi={v.blocchi} collega={collega} />
                </div>
              </li>
            ))}
          </Tag>
        )
      }
      case "tabella":
        return (
          <div key={i} className={styles.tabella} tabIndex={0}>
            <table>
              <thead>
                <tr>
                  {b.testa.map((c, k) => (
                    <th key={k} style={{ textAlign: ALLINEA[b.allineamento[k] ?? "sinistra"] }}>
                      <Inlines nodi={c} collega={collega} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.righe.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, j) => (
                      <td key={j} style={{ textAlign: ALLINEA[b.allineamento[j] ?? "sinistra"] }}>
                        <Inlines nodi={c} collega={collega} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  })
}

/** Il markdown di Claude, reso senza HTML grezzo: niente di ciò che è scritto può diventare codice della pagina. */
export function Markdown({ testo, collega }: { testo: string; collega?: Collega }) {
  const blocchi = useMemo(() => leggiBlocchi(testo), [testo])
  return (
    <div className={styles.markdown}>
      <Blocchi blocchi={blocchi} collega={collega} />
    </div>
  )
}
