import { join } from "node:path"
import { opzioniDaAmbiente, type Opzioni } from "../configurazione"
import { INTESTAZIONE_CHIAVE } from "../accesso"
import { leggiChiaveApi } from "../arrivi/chiave"
import type { Api } from "./api"

export interface OpzioniMcp {
  /** Il server di Mango Animation: l'indirizzo senza la barra finale e la chiave per parlargli. */
  api: Api
  /** La cartella del codice: da lì si lancia il motore. */
  codice: string
  motore: Opzioni["motore"]
  /** Il comando che rende i fotogrammi chiave di una scena; la sigla si aggiunge in fondo. */
  comandoSceneFoto: string[]
  ffmpeg: string | null
  /** yt-dlp, se c'è: per i sottotitoli dei video in rete. */
  ytdlp: string[] | null
}

/** Le stesse variabili d'ambiente del server (`docs/API.md`): porta, Python e modulo del motore. */
export function opzioniMcp(ambiente: Record<string, string | undefined> = process.env): OpzioniMcp {
  const o = opzioniDaAmbiente(ambiente)
  return {
    api: {
      indirizzo: `http://${o.indirizzo}:${o.porta}`,
      intestazioni: async () => {
        const chiave = await leggiChiaveApi(join(o.archivio, "arrivi"))
        const intestazioni: Record<string, string> = {}
        if (chiave !== null) intestazioni[INTESTAZIONE_CHIAVE] = chiave
        return intestazioni
      },
    },
    codice: o.codice,
    motore: o.motore,
    comandoSceneFoto: [process.execPath, "run", "--silent", "--cwd", o.animazioni.cartella, "foto", "--"],
    ffmpeg: o.ffmpeg,
    ytdlp: o.ytdlp,
  }
}
