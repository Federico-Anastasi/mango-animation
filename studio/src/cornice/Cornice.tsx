// La barra in alto: le voci, e a destra solo ciò che serve in quel momento (lavori, telefono, chat, registrare, segnalare un problema).
import { useState } from "react"
import { BottoneChat } from "../chat/BottoneChat"
import { usePannelloChat } from "../chat/pannello"
import { arrivi, canaleTiktok, lavori, registrazione, useCopia } from "../dati"
import { AvvisoProfilo } from "./AvvisoProfilo"
import { Icona } from "../comuni/icone"
import type { NomeIcona } from "../comuni/icone"
import type { VistaApp } from "../indirizzo"
import { t } from "../lingua"
import { ponteSegnalazione } from "../segnalazione/ponte"
import { eUnMontaggio, SegnoMontaggio } from "./MontaggioSuperato"
import { PannelloLavori } from "./PannelloLavori"
import { PannelloRegistrazione, Trascorso } from "./PannelloRegistrazione"
import { PannelloSegnalazione } from "./PannelloSegnalazione"
import styles from "./Cornice.module.css"

interface Voce {
  vista: VistaApp
  nome: string
  icona: NomeIcona
}

const voci = (conCanale: boolean): Voce[] => [
  { vista: "video", nome: t("Video", "Videos"), icona: "video" },
  { vista: "girato", nome: t("Girato", "Footage"), icona: "girato" },
  // I numeri del canale hanno una voce solo quando c'è un canale letto.
  ...(conCanale ? [{ vista: "canale", nome: t("Canale", "Channel"), icona: "crescita" } satisfies Voce] : []),
  { vista: "produzione", nome: t("Produzione", "Production"), icona: "produzione" },
  { vista: "impostazioni", nome: t("Impostazioni", "Settings"), icona: "impostazioni" },
]

export function Cornice({ vista }: { vista: VistaApp }) {
  const chat = usePannelloChat()
  const [aperto, setAperto] = useState<"lavori" | "registrazione" | "segnala" | null>(null)
  const stato = useCopia(lavori).dato
  const telefono = useCopia(arrivi).dato
  const registra = useCopia(registrazione).dato?.in_corso ?? null
  const canaleLetto = useCopia(canaleTiktok).dato?.ultima != null
  const inCorso = stato?.in_corso ?? null
  const inCoda = stato?.in_coda.length ?? 0
  const etichetta = inCorso ? t("Lavoro in corso", "Job in progress") : inCoda > 0 ? t("{n} in attesa", "{n} waiting", { n: inCoda }) : t("Lavori", "Jobs")
  // I due segni compaiono quando c'è qualcosa da dire; il pannello dei lavori resta finché è aperto, anche se l'ultimo lavoro è appena finito.
  const mostraLavori = inCorso !== null || inCoda > 0 || aperto === "lavori"

  return (
    <>
      <header className={styles.cornice} data-chat={chat.aperta ? "aperta" : "chiusa"}>
        <div className={styles.dentro}>
          <span className={styles.marchio}>Mango Animation</span>
          <nav className={styles.menu} aria-label={t("Sezioni", "Sections")}>
            {voci(canaleLetto || vista === "canale").map((v) => (
              <a key={v.vista} href={`#/${v.vista}`} className={styles.voce} aria-current={v.vista === vista ? "page" : undefined}>
                <Icona nome={v.icona} />
                <span>{v.nome}</span>
              </a>
            ))}
          </nav>
          <div className={styles.stati}>
            {telefono?.pronto && (
              <a href="#/girato" className={styles.stato} title={t("Il telefono può mandare i file", "Your phone can send files")}>
                <Icona nome="telefono" />
                <span className={styles.solo}>{t("Telefono pronto", "Phone ready")}</span>
                <span className={styles.puntoVerde} aria-hidden="true" />
              </a>
            )}
            <BottoneChat />
            <div className={styles.lavori}>
              <button type="button" className={styles.stato} aria-expanded={aperto === "registrazione"} aria-label={registra ? t("Sto registrando", "Recording") : t("Registra", "Record")} onClick={() => setAperto(aperto === "registrazione" ? null : "registrazione")}>
                <Icona nome="video" />
                <span className={styles.solo}>{registra ? <Trascorso da={registra.iniziata} /> : t("Registra", "Record")}</span>
                <span className={registra ? styles.puntoRosso : styles.puntoGrigio} aria-hidden="true" />
              </button>
              {aperto === "registrazione" && <PannelloRegistrazione onChiudi={() => setAperto(null)} />}
            </div>
            {mostraLavori && (
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
            )}
            {ponteSegnalazione() && (
              <div className={styles.lavori}>
                <button type="button" className={styles.tema} aria-expanded={aperto === "segnala"} aria-label={t("Segnala un problema", "Report a problem")} title={t("Segnala un problema", "Report a problem")} onClick={() => setAperto(aperto === "segnala" ? null : "segnala")}>
                  <Icona nome="segnala" />
                </button>
                {aperto === "segnala" && <PannelloSegnalazione onChiudi={() => setAperto(null)} />}
              </div>
            )}
          </div>
        </div>
        <span className={styles.rientro} aria-hidden="true" />
      </header>
      <AvvisoProfilo />
    </>
  )
}
