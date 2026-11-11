import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./theme.css"
import { App } from "./App"
import { ConfineErrore } from "./comuni/ConfineErrore"
import { useLingua } from "./lingua"
import { applicaTema, leggiTema } from "./tema"

applicaTema(leggiTema())

const radice = document.getElementById("root")
if (!radice) throw new Error("Manca l'elemento della pagina in cui disegnare l'interfaccia.")
/** Cambiando la lingua l'interfaccia si ridisegna da capo: ogni testo si traduce quando si disegna. */
function Radice() {
  return <App key={useLingua().lingua} />
}

createRoot(radice).render(
  <StrictMode>
    <ConfineErrore>
      <Radice />
    </ConfineErrore>
  </StrictMode>,
)
