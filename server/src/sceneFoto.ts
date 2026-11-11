// I fotogrammi chiave di una scena (`animazioni/`): il browser la disegna sulla scheda video, da qualche decina di secondi a qualche minuto.
// Per questo è un lavoro della coda, come quelli del motore: non si sovrappone a un montaggio e si vede nel pannello dei lavori.
import type { IoLavoro } from "./coda"
import { ErroreConFrase, frase } from "./lingua"

export const COMANDO_SCENE_FOTO = "scene-foto"

/** Una sigla di scena: lettere, numeri, trattini e trattini bassi, non per prima un trattino. */
export const SIGLA = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Cosa ha reso la scena: i file dei fotogrammi e ciò che i controlli automatici hanno da dire (vuoto: superati). */
export interface RisultatoSceneFoto {
  png: string[]
  segnalazioni: string[]
}

/** Rende i fotogrammi di `sigla` e ne legge lo stdout. Un controllo che non passa è un risultato (lo script esce con 1 e le elenca), non un errore. */
export async function sceneFoto(comando: string[], sigla: string, io: IoLavoro): Promise<RisultatoSceneFoto> {
  const uscita: string[] = []
  const { codice, ultimoErrore } = await io.lancia([...comando, sigla], uscita)
  const inizio = uscita.findIndex((riga) => /^\d+ segnalazioni:$/.test(riga))
  const segnalazioni = inizio < 0 ? [] : uscita.slice(inizio + 1).join("\n").trim().slice(2).split("\n- ")
  if (codice !== 0 && segnalazioni.length === 0) {
    throw ultimoErrore !== null ? new Error(ultimoErrore) : new ErroreConFrase(frase(`La resa della scena «${sigla}» è uscita con codice ${codice} senza dire perché.`, `Rendering the scene «${sigla}» exited with code ${codice} without saying why.`))
  }
  return { png: uscita.slice(0, inizio < 0 ? undefined : inizio).filter((riga) => riga.endsWith(".png")), segnalazioni }
}
