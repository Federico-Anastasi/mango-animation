import { useState } from "react"
import { BottoneChat } from "../chat/BottoneChat"
import { arrivi, lavori, registrazione, useCopia } from "../dati"
import { AvvisoProfilo } from "./AvvisoProfilo"
import { Icona } from "../comuni/icone"
import type { NomeIcona } from "../comuni/icone"
import type { VistaApp } from "../indirizzo"
import { prossimaScelta, scegliLingua, t, useLingua } from "../lingua"
import { prossimoTema, scegliTema, useTema } from "../tema"
import { ponteSegnalazione } from "../segnalazione/ponte"
import { ponteCartella } from "./cartellaDati"
import { eUnMontaggio, SegnoMontaggio } from "./MontaggioSuperato"
import { PannelloDati } from "./PannelloDati"
import { PannelloLavori } from "./PannelloLavori"
import { PannelloRegistrazione, Trascorso } from "./PannelloRegistrazione"
import { PannelloSegnalazione } from "./PannelloSegnalazione"
import styles from "./Cornice.module.css"

const voci = (): Array<{ vista: VistaApp; nome: string; icona: NomeIcona }> => [
  { vista: "video", nome: t("Video", "Videos"), icona: "video" },
  { vista: "girato", nome: t("Girato", "Footage"), icona: "girato" },
  { vista: "pubblico", nome: t("Pubblico", "Audience"), icona: "telefono" },
  { vista: "classifica", nome: t("Classifica", "Ranking"), icona: "classifica" },
  { vista: "crescita", nome: t("Crescita", "Growth"), icona: "crescita" },
  { vista: "produzione", nome: t("Produzione", "Production"), icona: "produzione" },
  { vista: "stile", nome: t("Stile", "Style"), icona: "stile" },
  { vista: "motori", nome: t("Motori", "Engines"), icona: "motori" },
]

const NOME_LINGUA = {
  sistema: () => t("quella del sistema", "the system's"),
  it: () => "italiano",
  en: () => "English",
} as const

const NOME_TEMA = {
  sistema: () => t("del sistema", "system"),
  chiaro: () => t("chiaro", "light"),
  scuro: () => t("scuro", "dark"),
} as const

export function Cornice({ vista }: { vista: VistaApp }) {
  const [aperto, setAperto] = useState<"lavori" | "registrazione" | "dati" | "segnala" | null>(null)
  const stato = useCopia(lavori).dato
  const telefono = useCopia(arrivi).dato
  const registra = useCopia(registrazione).dato?.in_corso ?? null
  const tema = useTema()
  const { scelta: sceltaLingua, lingua } = useLingua()
  const inCorso = stato?.in_corso ?? null
  const inCoda = stato?.in_coda.length ?? 0
  const etichetta = inCorso ? t("Lavoro in corso", "Job in progress") : inCoda > 0 ? t("{n} in attesa", "{n} waiting", { n: inCoda }) : t("Nessun lavoro", "No jobs")

  const temaEtichetta = t("Tema {nome}: tocca per cambiare", "Theme: {nome}. Tap to change", { nome: NOME_TEMA[tema]() })

  return (
    <>
      <header className={styles.cornice}>
        <span className={styles.marchio}>Mango Animation</span>
        <nav className={styles.menu} aria-label={t("Sezioni", "Sections")}>
          {voci().map((v) => (
            <a key={v.vista} href={`#/${v.vista}`} className={styles.voce} aria-current={v.vista === vista ? "page" : undefined}>
              <Icona nome={v.icona} />
              <span>{v.nome}</span>
            </a>
          ))}
        </nav>
        <div className={styles.stati}>
          <a href="#/girato" className={styles.stato} title={telefono?.pronto ? t("Il telefono può mandare i file", "Your phone can send files") : (telefono?.motivo ?? telefono?.errore ?? t("Gli arrivi dal telefono non sono pronti", "Receiving files from your phone is not ready"))}>
            <Icona nome="telefono" />
            <span className={styles.solo}>{telefono === null ? t("Telefono", "Phone") : telefono.pronto ? t("Telefono pronto", "Phone ready") : t("Telefono non pronto", "Phone not ready")}</span>
            <span className={telefono?.pronto ? styles.puntoVerde : styles.puntoGrigio} aria-hidden="true" />
          </a>
          <BottoneChat />
          <div className={styles.lavori}>
            <button type="button" className={styles.stato} aria-expanded={aperto === "registrazione"} aria-label={registra ? t("Sto registrando", "Recording") : t("Registra", "Record")} onClick={() => setAperto(aperto === "registrazione" ? null : "registrazione")}>
              <Icona nome="video" />
              <span className={styles.solo}>{registra ? <Trascorso da={registra.iniziata} /> : t("Registra", "Record")}</span>
              <span className={registra ? styles.puntoRosso : styles.puntoGrigio} aria-hidden="true" />
            </button>
            {aperto === "registrazione" && <PannelloRegistrazione onChiudi={() => setAperto(null)} />}
          </div>
          <div className={styles.lavori}>
            <button type="button" className={styles.stato} aria-expanded={aperto === "lavori"} onClick={() => setAperto(aperto === "lavori" ? null : "lavori")}>
              <Icona nome="lavori" />
              {eUnMontaggio(inCorso) ? (
                <SegnoMontaggio lavoro={inCorso} />
              ) : (
                <>
                  <span className={styles.solo}>{etichetta}</span>
                  <span className={inCorso ? styles.puntoRosso : styles.puntoGrigio} aria-hidden="true" />
                </>
              )}
            </button>
            {aperto === "lavori" && <PannelloLavori onChiudi={() => setAperto(null)} />}
          </div>
          {ponteCartella() && (
            <div className={styles.lavori}>
              <button type="button" className={styles.tema} aria-expanded={aperto === "dati"} aria-label={t("Cartella dei dati", "Data folder")} title={t("Cartella dei dati", "Data folder")} onClick={() => setAperto(aperto === "dati" ? null : "dati")}>
                <Icona nome="cartella" />
              </button>
              {aperto === "dati" && <PannelloDati onChiudi={() => setAperto(null)} />}
            </div>
          )}
          {ponteSegnalazione() && (
            <div className={styles.lavori}>
              <button type="button" className={styles.tema} aria-expanded={aperto === "segnala"} aria-label={t("Segnala un problema", "Report a problem")} title={t("Segnala un problema", "Report a problem")} onClick={() => setAperto(aperto === "segnala" ? null : "segnala")}>
                <Icona nome="segnala" />
              </button>
              {aperto === "segnala" && <PannelloSegnalazione onChiudi={() => setAperto(null)} />}
            </div>
          )}
          <button
            type="button"
            className={styles.tema}
            onClick={() => scegliLingua(prossimaScelta(sceltaLingua))}
            title={t("Lingua: {scelta}. Tocca per cambiare.", "Language: {scelta}. Tap to change.", { scelta: NOME_LINGUA[sceltaLingua]() })}
            aria-label={t("Lingua: {scelta}. Tocca per cambiare.", "Language: {scelta}. Tap to change.", { scelta: NOME_LINGUA[sceltaLingua]() })}
          >
            {lingua.toUpperCase()}
          </button>
          <button type="button" className={styles.tema} onClick={() => scegliTema(prossimoTema(tema))} title={temaEtichetta} aria-label={temaEtichetta}>
            <Icona nome="tema" />
          </button>
        </div>
      </header>
    <AvvisoProfilo />
    </>
  )
}
