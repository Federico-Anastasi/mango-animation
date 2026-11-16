// Il primo giro: quando il creator non ha ancora un profilo, la chat si apre da sola e il motore comincia (la skill `welcome`,
// `docs/CHAT.md`). Si salta da un pulsante discreto e si rifà dalla chat vuota. La scelta si ricorda nel browser.
import { useEffect, useSyncExternalStore } from "react"
import { profilo, useCopia } from "../dati"
import type { NuovoMessaggio } from "./api"
import { negozio } from "./negozio"
import { apriChat, scegliLarghezzaChat } from "./pannello"

const CHIAVE = "mango-animation.primo-giro"
/** Larghezza della chat durante il primo giro: una conversazione più comoda da leggere, senza ricordarla. */
const LARGHEZZA_PRIMO_GIRO = 560

type Scelta = "iniziato" | "saltato"

function leggi(): Scelta | null {
  try {
    const valore = localStorage.getItem(CHIAVE)
    return valore === "iniziato" || valore === "saltato" ? valore : null
  } catch {
    return null
  }
}

let scelta = leggi()
const ascoltatori = new Set<() => void>()

function ricorda(nuova: Scelta): void {
  scelta = nuova
  try {
    localStorage.setItem(CHIAVE, nuova)
  } catch {
    // Senza memoria nel browser la scelta vale per questa apertura e basta.
  }
  ascoltatori.forEach((a) => a())
}

/**
 * Apre la chat con una conversazione nuova e le manda `testo`: è così che una pagina manda il creator dalla chat. Con `conBrowser` la conversazione è di un motore che sa usare il browser del creator: quello che il creator ha scelto se lo sa fare, altrimenti il primo motore pronto che lo sa fare;
 * con `modelloGrande` parte col modello grande del suo motore, senza cambiare la scelta che il creator ricorda per le altre.
 */
export function chiediAllaChat(testo: string, opzioni: { conBrowser?: boolean; modelloGrande?: boolean } = {}): void {
  apriConversazioneCon({ testo }, opzioni)
}

function apriConversazioneCon(messaggio: NuovoMessaggio, opzioni: { conBrowser?: boolean; modelloGrande?: boolean }): void {
  apriChat()
  negozio.apri(null)
  void negozio.invia(messaggio, opzioni)
}

/** La conversazione del primo giro comincia dal motore: il server gli manda l'istruzione, e il creator non vede nessun messaggio come suo. */
export function avviaPrimoGiro(rifacendo: boolean): void {
  ricorda("iniziato")
  scegliLarghezzaChat(LARGHEZZA_PRIMO_GIRO, false)
  apriConversazioneCon({ avvio: rifacendo ? "rifare-primo-giro" : "primo-giro" }, { modelloGrande: true })
}

/** Ferma il motore se sta parlando del primo giro e lascia la chat vuota. */
export function saltaPrimoGiro(): void {
  ricorda("saltato")
  void negozio.chiudi().finally(() => negozio.apri(null))
}

const iscriviti = (ascolta: () => void) => {
  ascoltatori.add(ascolta)
  return () => ascoltatori.delete(ascolta)
}

/** Il primo giro è cominciato e il creator non ha ancora un profilo: la chat mostra «Salta». */
export function usePrimoGiroInCorso(): boolean {
  const iniziato = useSyncExternalStore(iscriviti, () => scelta === "iniziato")
  const presente = useCopia(profilo).dato?.presente ?? true
  return iniziato && !presente
}

/** Nello studio: senza profilo e senza una scelta già fatta, il primo giro parte da solo. */
export function useAvviaPrimoGiro(): void {
  const dato = useCopia(profilo).dato
  useEffect(() => {
    if (dato && !dato.presente && scelta === null) avviaPrimoGiro(false)
  }, [dato])
}
