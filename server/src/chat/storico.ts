// Una conversazione riletta: gli stessi messaggi che la chat mostra in diretta, rifatti da ciò che il motore ha tenuto.
// Ogni motore dà le sue righe nella forma di `RigaLetta`.
import type { Lingua } from "../lingua"
import { daTestoDelCreator } from "./allegati"
import type { EsitoDelloStrumento } from "./motore"
import { eAvvio } from "./primoGiro"
import { conEsito } from "./traduzione"
import type { MessaggioChat, Parte } from "./tipi"

/** Una riga di una conversazione riletta. `quando` è l'istante scritto dal motore, se c'è. */
export type RigaLetta =
  /** Un messaggio del creator, con le Parti che la chat mostra; senza Parti non è un messaggio. */
  | { tipo: "creator"; id: string; quando?: string; parti: Parte[] }
  /** Ciò che il motore ha scritto o fatto: si aggiunge al suo messaggio del giro. */
  | { tipo: "motore"; id: string; quando?: string; parti: Parte[] }
  | { tipo: "esiti"; quando?: string; esiti: { id: string; esito: EsitoDelloStrumento }[] }
  /** Ciò che ha scritto un comando locale del motore. */
  | { tipo: "uscita"; id: string; quando?: string; testo: string }
  /** Il contesto è stato riassunto: come nel terminale, si vede solo ciò che segue l'ultimo riassunto. */
  | { tipo: "riassunto" }

/** Le Parti di un messaggio del creator dal testo com'è arrivato al motore; nessuna se è l'avvio del primo giro, che il creator non ha scritto. */
export const partiDelTestoDelCreator = (testo: string, archivio: string): Parte[] => (eAvvio(testo) ? [] : daTestoDelCreator(testo, archivio))

export function messaggiDalleRighe(righe: RigaLetta[], lingua: Lingua): MessaggioChat[] {
  const messaggi: MessaggioChat[] = []
  const strumenti = new Map<string, { messaggio: MessaggioChat; indice: number }>()
  let delMotore: MessaggioChat | null = null
  const nelGiro = (id: string, quando: string | undefined): MessaggioChat => {
    if (delMotore) return delMotore
    delMotore = { id, ruolo: "claude", quando: quando ?? new Date(0).toISOString(), parti: [] }
    messaggi.push(delMotore)
    return delMotore
  }

  const riassunto = righe.findLastIndex((r) => r.tipo === "riassunto")
  for (const riga of righe.slice(riassunto + 1)) {
    switch (riga.tipo) {
      case "uscita":
        nelGiro(riga.id, riga.quando).parti.push({ tipo: "testo", testo: riga.testo })
        break
      case "motore": {
        if (riga.parti.length === 0) break
        const messaggio = nelGiro(riga.id, riga.quando)
        riga.parti.forEach((parte) => {
          const indice = messaggio.parti.push(parte) - 1
          if (parte.tipo === "strumento") strumenti.set(parte.id, { messaggio, indice })
        })
        break
      }
      case "esiti":
        for (const { id, esito } of riga.esiti) {
          const dove = strumenti.get(id)
          const parte = dove?.messaggio.parti[dove.indice]
          if (dove && parte?.tipo === "strumento") dove.messaggio.parti[dove.indice] = conEsito(parte, esito, lingua, riga.quando)
        }
        break
      case "creator":
        if (riga.parti.length === 0) break
        delMotore = null
        messaggi.push({ id: riga.id, ruolo: "utente", quando: riga.quando ?? new Date(0).toISOString(), parti: riga.parti })
        break
    }
  }
  return messaggi
}
