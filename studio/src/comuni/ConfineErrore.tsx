import { Component, type ReactNode } from "react"
import { t } from "../lingua"
import { Errore } from "./Stati"
import styles from "./ConfineErrore.module.css"

/**
 * Un'eccezione nel disegno (anche un pezzo di interfaccia che non si scarica) diventa una frase con «Ricarica», non una finestra bianca.
 * Con `locale` il confine sta attorno a un pezzo di pagina che sa dire da sé cosa non va: mostra la frase dell'errore, senza «Ricarica»,
 * e quando `reimposta` cambia riprova a disegnare.
 */
export class ConfineErrore extends Component<{ children: ReactNode; locale?: boolean; reimposta?: string }, { errore: Error | null }> {
  state: { errore: Error | null } = { errore: null }

  static getDerivedStateFromError(errore: Error): { errore: Error } {
    return { errore }
  }

  componentDidUpdate(prima: { reimposta?: string }): void {
    if (this.state.errore && prima.reimposta !== this.props.reimposta) this.setState({ errore: null })
  }

  render(): ReactNode {
    if (!this.state.errore) return this.props.children
    if (this.props.locale) return <Errore messaggio={this.state.errore.message} />
    return (
      <div className={styles.confine}>
        <Errore
          messaggio={t("Qualcosa si è rotto in questa pagina. Ricaricala per riprovare.", "Something broke on this page. Reload it to try again.")}
          dettaglio={[this.state.errore.message]}
          etichettaRiprova={t("Ricarica", "Reload")}
          onRiprova={() => window.location.reload()}
        />
      </div>
    )
  }
}
