import { lazy, Suspense } from "react"
import { useScorciatoiaChat } from "./chat/BottoneChat"
import { usePannelloChat } from "./chat/pannello"
import { PannelloChat } from "./chat/PannelloChat"
import { Cornice } from "./cornice/Cornice"
import { Caricamento } from "./comuni/Stati"
import { useIndirizzo } from "./indirizzo"
import { ElencoVideo } from "./video/ElencoVideo"
import styles from "./App.module.css"

const PaginaVideo = lazy(() => import("./video/PaginaVideo").then((m) => ({ default: m.PaginaVideo })))
const Girato = lazy(() => import("./girato/Girato").then((m) => ({ default: m.Girato })))
const Pubblico = lazy(() => import("./pubblico/Pubblico").then((m) => ({ default: m.Pubblico })))
const Classifica = lazy(() => import("./classifica/Classifica").then((m) => ({ default: m.Classifica })))
const Crescita = lazy(() => import("./crescita/Crescita").then((m) => ({ default: m.Crescita })))
const Produzione = lazy(() => import("./produzione/Produzione").then((m) => ({ default: m.Produzione })))
const Motori = lazy(() => import("./motori/Motori").then((m) => ({ default: m.Motori })))
const PaginaStile = lazy(() => import("./stile/PaginaStile").then((m) => ({ default: m.PaginaStile })))

export function App() {
  const indirizzo = useIndirizzo()
  const chat = usePannelloChat()
  useScorciatoiaChat()
  return (
    <div className={styles.app}>
      <Cornice vista={indirizzo.vista} />
      <div className={styles.area}>
        <main className={styles.corpo}>
          <Suspense fallback={<Caricamento />}>
            {indirizzo.vista === "girato" && <Girato file={indirizzo.parametri.get("file") ?? undefined} />}
            {indirizzo.vista === "pubblico" && <Pubblico video={indirizzo.parametri.get("video") ?? undefined} />}
            {indirizzo.vista === "classifica" && <Classifica />}
            {indirizzo.vista === "crescita" && <Crescita />}
            {indirizzo.vista === "produzione" && <Produzione />}
            {indirizzo.vista === "stile" && <PaginaStile />}
            {indirizzo.vista === "motori" && <Motori />}
            {indirizzo.vista === "video" && (indirizzo.slug ? <PaginaVideo key={indirizzo.slug} slug={indirizzo.slug} scheda={indirizzo.scheda} parametri={indirizzo.parametri} /> : <ElencoVideo />)}
          </Suspense>
        </main>
        {chat.aperta && <PannelloChat />}
      </div>
    </div>
  )
}
