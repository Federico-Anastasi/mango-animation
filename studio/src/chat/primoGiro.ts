// Il primo giro: quando il creator non ha ancora un profilo, la chat si apre da sola e Claude comincia (la skill `welcome`,
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
 * Apre la chat con una conversazione nuova e le manda `testo`: è così che una pagina manda il creator da Claude. Con `soloClaudeCode` la conversazione è di Claude Code anche se il creator di solito sceglie Mango Code;
 * con `modelloGrande` parte con l'Opus più recente (o «Predefinito» se non c'è), senza cambiare la scelta che il creator ricorda per le altre.
 */
export function chiediAClaude(testo: string, opzioni: { soloClaudeCode?: boolean; modelloGrande?: boolean } = {}): void {
  apriConversazioneCon({ testo }, opzioni)
}

function apriConversazioneCon(messaggio: NuovoMessaggio, opzioni: { soloClaudeCode?: boolean; modelloGrande?: boolean }): void {
  apriChat()
  negozio.apri(null)
  void negozio.invia(messaggio, opzioni)
}

/** La conversazione del primo giro comincia da Claude: il server gli manda l'istruzione, e il creator non vede nessun messaggio come suo. */
export function avviaPrimoGiro(rifacendo: boolean): void {
  ricorda("iniziato")
  scegliLarghezzaChat(LARGHEZZA_PRIMO_GIRO, false)
  apriConversazioneCon({ avvio: rifacendo ? "rifare-primo-giro" : "primo-giro" }, { modelloGrande: true })
}

/** Ferma Claude se sta parlando del primo giro e lascia la chat vuota. */
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
