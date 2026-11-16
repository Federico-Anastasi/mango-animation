import { lazy, Suspense, useRef } from "react"
import { useScorciatoiaChat } from "./chat/BottoneChat"
import { usePannelloChat } from "./chat/pannello"
import { PannelloChat } from "./chat/PannelloChat"
import { useAnnunciaPrimoGiro } from "./chat/primoGiro"
import { Cornice } from "./cornice/Cornice"
import { useLarghezzaPagina } from "./cornice/larghezzaPagina"
import { ConfineErrore } from "./comuni/ConfineErrore"
import { Caricamento } from "./comuni/Stati"
import { useIndirizzo } from "./indirizzo"
import { useVaiDelServer } from "./vaiDelServer"
import { ElencoVideo } from "./video/ElencoVideo"
import styles from "./App.module.css"

const PaginaVideo = lazy(() => import("./video/PaginaVideo").then((m) => ({ default: m.PaginaVideo })))
const Girato = lazy(() => import("./girato/Girato").then((m) => ({ default: m.Girato })))
const Canale = lazy(() => import("./pubblico/Canale").then((m) => ({ default: m.Canale })))
const Produzione = lazy(() => import("./produzione/Produzione").then((m) => ({ default: m.Produzione })))
const Impostazioni = lazy(() => import("./impostazioni/Impostazioni").then((m) => ({ default: m.Impostazioni })))

export function App() {
  const indirizzo = useIndirizzo()
  const chat = usePannelloChat()
  useScorciatoiaChat()
  useAnnunciaPrimoGiro()
  useVaiDelServer()
  const radice = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLElement>(null)
  useLarghezzaPagina(radice, corpo)
  return (
    <div ref={radice} className={styles.app}>
      <Cornice vista={indirizzo.vista} />
      <div className={styles.area}>
        <main ref={corpo} className={styles.corpo}>
          <ConfineErrore key={`${indirizzo.vista}/${indirizzo.slug ?? indirizzo.parte ?? ""}`}>
            <Suspense fallback={<Caricamento />}>
              {indirizzo.vista === "girato" && <Girato file={indirizzo.parametri.get("file") ?? undefined} />}
              {indirizzo.vista === "canale" && <Canale scheda={indirizzo.parte} video={indirizzo.parametri.get("video") ?? undefined} />}
              {indirizzo.vista === "produzione" && <Produzione />}
              {indirizzo.vista === "impostazioni" && <Impostazioni sezione={indirizzo.parte} nominata={indirizzo.nominata} />}
              {indirizzo.vista === "video" && (indirizzo.slug ? <PaginaVideo key={indirizzo.slug} slug={indirizzo.slug} scheda={indirizzo.scheda} parametri={indirizzo.parametri} /> : <ElencoVideo />)}
            </Suspense>
          </ConfineErrore>
        </main>
        {chat.aperta && <PannelloChat />}
      </div>
    </div>
  )
}
