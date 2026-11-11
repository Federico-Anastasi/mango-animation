// Il prestito delle schede video (`docs/ARCHITETTURA.md`, «Le schede video e Mango Code»): il modello di Mango Code acceso tiene le
// schede; un lavoro del motore che vuole la scheda la chiede al suo gestore (`POST /engine/release`) e, finiti i lavori sulla
// scheda, gliela ridà (`POST /engine/resume`). Senza Mango Code acceso non fa niente.
import { CHI_CHIAMA, trovaMangoCode, type Servizio } from "./chat/mangocode"
import { eOggetto } from "./disco"
import { dettaglioDi, ErroreConFrase, frase, type Frase } from "./lingua"

/** I comandi che lavorano sulla scheda video: trascrizione, allineamento, sagoma, voce pulita, resa delle scene (anche le foto di una scena) e delle slide. */
export const COMANDI_SULLA_SCHEDA: ReadonlySet<string> = new Set(["prepara", "prepara-file", "monta", "anteprima", "controlla", "copertina", "prova", "carosello", "scene-foto"])

export interface PrestitoSchede {
  /**
   * Prima di un lavoro sulla scheda `scheda` (`macchina.scheda_video` del profilo: `null` è il processore, assente vuol dire la scheda
   * che c'è): se il modello di Mango Code la tiene, la libera. Dà la frase di ciò che ha fatto, o `null`; se non la libera, un errore.
   */
  prendi: (scheda: number | null | undefined) => Promise<Frase | null>
  /** Ridà le schede al modello, se le aveva prese; torna quando il modello è di nuovo pronto. */
  rendi: () => Promise<string | null>
}

const ATTESA_MS = 120_000
/** Il gestore lascia finire la risposta in corso fino a 60 s, e prima aspetta un modello che si sta accendendo fino a 300 s. */
const ATTESA_LIBERA_MS = 7 * 60_000

async function chiama(url: string, corpo?: object, attesaMs = ATTESA_MS): Promise<unknown> {
  const r = await fetch(url, {
    method: corpo === undefined ? "GET" : "POST",
    headers: corpo === undefined ? CHI_CHIAMA : { ...CHI_CHIAMA, "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(attesaMs),
  })
  const testo = await r.text()
  if (!r.ok) throw new ErroreConFrase(frase(`il gestore del motore di Mango Code ha risposto ${r.status}: ${testo.slice(0, 300)}`, `the Mango Code engine manager answered ${r.status}: ${testo.slice(0, 300)}`))
  return testo ? (JSON.parse(testo) as unknown) : null
}

/**
 * Il prestito è di questo processo: Mango Code lo lega a chi chiama, e se il server si ferma senza renderle le schede tornano al
 * modello da sole. Perciò ciò che il server ha preso si ricorda solo in memoria.
 */
export function prestitoDaMangoCode(dati: string): PrestitoSchede {
  let preso: Servizio | null = null
  /** La riaccensione in corso: un lavoro che arriva intanto la aspetta, invece di contendersi la scheda col modello che si carica. */
  let riaccensione: Promise<string | null> | null = null

  const riaccendi = async (s: Servizio): Promise<string | null> => {
    const inizio = Date.now()
    await chiama(`${s.motore}/engine/resume`, {})
    // Solo a riaccensione riuscita: se fallisce, la prossima `rendi` riprova.
    preso = null
    return `Il modello di Mango Code è di nuovo acceso (${((Date.now() - inizio) / 1000).toFixed(1)} s).`
  }

  return {
    async prendi(scheda) {
      if (scheda === null) return null
      await riaccensione?.catch(() => null)
      const s = await trovaMangoCode(dati)
      if (!s) return null
      const stato = await chiama(`${s.motore}/engine`)
      if (!eOggetto(stato)) return null
      // Già liberata da questo server per un lavoro prima: la si tiene, e alla fine si rende. Liberata da altri (il creator), non è nostra.
      const liberate = Array.isArray(stato["released_gpus"]) ? stato["released_gpus"] : []
      if (stato["phase"] === "released" && (stato["all_released"] === true || scheda === undefined || liberate.includes(scheda))) {
        if (preso === null) return null
        return frase(
          "La scheda era già libera dal modello di Mango Code: torna acceso quando i lavori sulla scheda sono finiti.",
          "The video card was already free of the Mango Code model: it comes back on when the jobs on the card are finished.",
        )
      }
      if (stato["phase"] !== "running" && stato["phase"] !== "starting") return null
      const schede = Array.isArray(stato["gpus"]) ? stato["gpus"].filter(eOggetto).map((c) => c["index"]) : []
      if (scheda !== undefined && !schede.includes(scheda)) return null
      const inizio = Date.now()
      try {
        await chiama(`${s.motore}/engine/release`, scheda === undefined ? {} : { gpus: [scheda] }, ATTESA_LIBERA_MS)
      } catch (errore) {
        // La risposta può perdersi anche se il modello si è spento: allora la scheda è presa, e alla fine si rende.
        const dopo = await chiama(`${s.motore}/engine`).catch(() => null)
        if (!eOggetto(dopo) || dopo["phase"] !== "released") {
          const d = dettaglioDi(errore)
          throw new ErroreConFrase(
            frase(
              `Il modello di Mango Code tiene la scheda video e non la lascia: ${d.it}. Fermalo da Mango Code e rilancia il lavoro.`,
              `The Mango Code model is holding the video card and will not let go: ${d.en}. Stop it from Mango Code and run the job again.`,
            ),
          )
        }
      }
      preso = s
      const nome = typeof stato["name"] === "string" ? stato["name"] : null
      const secondi = ((Date.now() - inizio) / 1000).toFixed(1)
      return frase(
        `Ho liberato ${scheda === undefined ? "le schede" : `la scheda ${scheda}`} da ${nome ?? "il modello"} di Mango Code (${secondi} s): torna acceso quando i lavori sulla scheda sono finiti.`,
        `Freed ${scheda === undefined ? "the video cards" : `video card ${scheda}`} from ${nome ?? "the model"} in Mango Code (${secondi} s): it comes back on when the jobs on the card are finished.`,
      )
    },
    rendi() {
      const s = preso
      if (!s) return Promise.resolve(null)
      riaccensione ??= riaccendi(s).finally(() => {
        riaccensione = null
      })
      return riaccensione
    },
  }
}
