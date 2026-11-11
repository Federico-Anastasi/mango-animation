// Le impostazioni in un posto solo: il profilo del creator, lo stile, il computer, il telefono, e ciò che vale per lo studio.
// Stile e Computer (i motori) sono le pagine di prima, ospitate come sezioni.
import { lazy, Suspense } from "react"
import { Schede } from "../comuni/Schede"
import { Caricamento } from "../comuni/Stati"
import { scriviIndirizzo, SEZIONI_IMPOSTAZIONI, type SezioneImpostazioni } from "../indirizzo"
import { t } from "../lingua"
import { Generali } from "./Generali"
import { Profilo } from "./Profilo"
import { Telefono } from "./Telefono"
import styles from "./Impostazioni.module.css"

const PaginaStile = lazy(() => import("../stile/PaginaStile").then((m) => ({ default: m.PaginaStile })))
const Motori = lazy(() => import("../motori/Motori").then((m) => ({ default: m.Motori })))

const nomi = (): Record<SezioneImpostazioni, string> => ({
  profilo: t("Profilo", "Profile"),
  stile: t("Stile", "Style"),
  computer: t("Computer", "Computer"),
  telefono: t("Telefono", "Phone"),
  generali: t("Generali", "General"),
})

export function Impostazioni({ sezione }: { sezione: SezioneImpostazioni }) {
  return (
    <div className={styles.pagina}>
      <div className={styles.schede}>
        <Schede etichetta={t("Impostazioni", "Settings")} schede={SEZIONI_IMPOSTAZIONI.map((id) => ({ id, nome: nomi()[id] }))} attiva={sezione} indirizzo={(id) => scriviIndirizzo({ vista: "impostazioni", parte: id })} />
      </div>
      <Suspense fallback={<Caricamento />}>
        {sezione === "profilo" && <Profilo />}
        {sezione === "stile" && <PaginaStile />}
        {sezione === "computer" && <Motori />}
        {sezione === "telefono" && <Telefono />}
        {sezione === "generali" && <Generali />}
      </Suspense>
    </div>
  )
}
