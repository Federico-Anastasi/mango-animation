// Registra lo schermo con ffmpeg dentro `grezzo/<giorno>/`, da solo o con la voce o anche col viso
// (un secondo file). Un solo proprietario dello stato: questa classe. Niente parte da una lettura.
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { Subprocess } from "bun"
import type { Percorsi } from "./configurazione"
import { rimuovi, scrivi, statistica, testoJson } from "./disco"
import type { Eventi } from "./eventi"
import { leggiFile } from "./sonda"
import { giornoLocale, isoLocale } from "./tempo"
import { ErroreConFrase, frase, type Frase } from "./lingua"

export const MODI = ["schermo", "voce", "viso"] as const
export type Modo = (typeof MODI)[number]

export interface Dispositivi {
  microfoni: string[]
  camere: string[]
}

export interface OpzioniRegistrazione {
  /** L'eseguibile di ffmpeg con gli argomenti che lo precedono; `null` se non è installato. */
  comando: string[] | null
  /** L'ingresso dello schermo e la codifica del video: dipendono dalla macchina; la codifica si decide a ogni registrazione, sul profilo di allora. */
  schermo: string[]
  codifica: (profilo: Record<string, unknown>) => string[]
  elenca: (comando: string[]) => Promise<Dispositivi>
}

export class ErroreRegistrazione extends ErroreConFrase {}

/** I dispositivi che chi registra ha scelto fra quelli trovati; senza, il primo microfono e la prima webcam che non sia virtuale. */
export interface Scelta {
  microfono?: string
  camera?: string
}

interface InCorso {
  modo: Modo
  iniziata: string
  file: string[]
  tipi: ("schermo" | "ripresa")[]
  processi: Subprocess<"pipe", "ignore", "pipe">[]
  letture: Promise<void>[]
  errori: string[]
  chiusa: boolean
}

export interface StatoRegistrazione {
  disponibile: boolean
  motivo: Frase | null
  dispositivi: Dispositivi | null
  in_corso: { modo: Modo; iniziata: string; file: string[] } | null
  ultima: { file: string[]; finita: string; errore: string | null } | null
}

const SENZA_FFMPEG = frase(
  "Per registrare serve un programma che manca su questo computer (ffmpeg): va installato, poi riavvia Mango Animation.",
  "Recording needs a program that is missing on this computer (ffmpeg): install it, then restart Mango Animation.",
)
const ATTESA_CHIUSURA_MS = 15_000
// Un mp4 a frammenti si legge nel browser senza preparazione e resta leggibile anche se ffmpeg viene ucciso.
const CONTENITORE = ["-movflags", "+frag_keyframe+empty_moov+default_base_moof"]

/** `ffmpeg -list_devices` scrive su stderr una riga per dispositivo: `"Nome" (video)` o `"Nome" (audio)`. */
export async function elencaConFfmpeg(comando: string[]): Promise<Dispositivi> {
  const processo = Bun.spawn([...comando, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
  const [testo] = await Promise.all([new Response(processo.stderr).text(), processo.exited])
  const nomi = (genere: string): string[] => [...testo.matchAll(/"([^"]+)" \((video|audio)\)/g)].filter((m) => m[2] === genere).map((m) => m[1] ?? "")
  return { microfoni: nomi("audio"), camere: nomi("video") }
}

export class Registrazione {
  private dispositivi: Dispositivi | null = null
  private inCorso: InCorso | null = null
  private ultima: StatoRegistrazione["ultima"] = null

  constructor(
    private readonly opzioni: OpzioniRegistrazione,
    private readonly ffprobe: string | null,
    private readonly percorsi: Percorsi,
    private readonly eventi: Eventi,
    private readonly dopoScrittura: (percorsiRelativi: string[]) => Promise<void>,
    private readonly profilo: () => Record<string, unknown>,
  ) {}

  stato(): StatoRegistrazione {
    const c = this.inCorso
    return {
      disponibile: this.opzioni.comando !== null,
      motivo: this.opzioni.comando === null ? SENZA_FFMPEG : null,
      dispositivi: this.dispositivi,
      in_corso: c ? { modo: c.modo, iniziata: c.iniziata, file: c.file } : null,
      ultima: this.ultima,
    }
  }

  async elencaDispositivi(): Promise<void> {
    if (this.opzioni.comando === null) return
    this.dispositivi = await this.opzioni.elenca(this.opzioni.comando)
    this.eventi.emetti({ tipo: "registrazione" })
  }

  async avvia(modo: Modo, scelta: Scelta = {}): Promise<void> {
    const comando = this.opzioni.comando
    if (comando === null) throw new ErroreRegistrazione(SENZA_FFMPEG)
    if (this.inCorso) throw new ErroreRegistrazione(frase("Una registrazione è già in corso: fermala prima di avviarne un'altra.", "A recording is already running: stop it before starting another."))
    if (scelta.microfono !== undefined && !this.dispositivi?.microfoni.includes(scelta.microfono)) throw new ErroreRegistrazione(
        frase(
          `Il microfono «${scelta.microfono}» non è fra quelli trovati: scegline un altro, o «Cerca di nuovo i dispositivi».`,
          `The microphone «${scelta.microfono}» is not among those found: choose another, or «Look for devices again».`,
        ),
      )
    if (scelta.camera !== undefined && !this.dispositivi?.camere.includes(scelta.camera)) throw new ErroreRegistrazione(
        frase(
          `La webcam «${scelta.camera}» non è fra quelle trovate: scegline un'altra, o «Cerca di nuovo i dispositivi».`,
          `The webcam «${scelta.camera}» is not among those found: choose another, or «Look for devices again».`,
        ),
      )
    const microfono = scelta.microfono ?? this.dispositivi?.microfoni[0]
    // Una camera virtuale (quella di OBS) non è il viso di nessuno, se non è lei che si sceglie.
    const camera = scelta.camera ?? this.dispositivi?.camere.find((nome) => !/virtual/i.test(nome))
    if (modo !== "schermo" && microfono === undefined) throw new ErroreRegistrazione(frase("Non trovo un microfono: collegalo, poi «Cerca di nuovo i dispositivi».", "I cannot find a microphone: plug one in, then «Look for devices again»."))
    if (modo === "viso" && camera === undefined) throw new ErroreRegistrazione(frase("Non trovo una webcam: collegala, poi «Cerca di nuovo i dispositivi».", "I cannot find a webcam: plug one in, then «Look for devices again»."))

    const adesso = new Date()
    const iniziata = isoLocale(adesso)
    const timbro = iniziata.replaceAll("-", "").replaceAll(":", "").replace("T", "-")
    const nome = (cosa: string): string => `${giornoLocale(adesso)}/${timbro}-${cosa}.mp4`
    const base = [...comando, "-hide_banner", "-loglevel", "error", "-y"]
    const voce = modo === "schermo" ? ["-an"] : ["-f", "dshow", "-audio_buffer_size", "50", "-i", `audio=${microfono}`]
    const audio = modo === "schermo" ? [] : ["-c:a", "aac", "-b:a", "192k"]
    const codifica = this.opzioni.codifica(this.profilo())
    const lanci: { file: string; tipo: "schermo" | "ripresa"; argomenti: string[] }[] = [
      { file: nome("schermo"), tipo: "schermo", argomenti: [...base, ...this.opzioni.schermo, ...voce, ...codifica, ...audio, ...CONTENITORE] },
    ]
    if (modo === "viso") lanci.push({ file: nome("viso"), tipo: "ripresa", argomenti: [...base, "-f", "dshow", "-i", `video=${camera}`, "-an", ...codifica, ...CONTENITORE] })

    const corrente: InCorso = { modo, iniziata, file: lanci.map((l) => l.file), tipi: lanci.map((l) => l.tipo), processi: [], letture: [], errori: [], chiusa: false }
    // La scheda nasce prima del file: così chi osserva il girato non lo prende per un file messo a mano.
    for (const l of lanci) {
      await mkdir(dirname(this.percorsi.grezzo(l.file)), { recursive: true })
      await scrivi(this.percorsi.schedaGrezzo(l.file), testoJson({ tipo: l.tipo, origine: "registrazione", arrivato: iniziata }))
    }
    for (const l of lanci) {
      const processo = Bun.spawn([...l.argomenti, this.percorsi.grezzo(l.file)], { stdin: "pipe", stdout: "ignore", stderr: "pipe" })
      corrente.processi.push(processo)
      corrente.letture.push(
        new Response(processo.stderr).text().then((testo) => {
          const riga = testo.trim().split(/\r?\n/).pop() ?? ""
          if (riga !== "") corrente.errori.push(riga)
        }),
      )
      // Un ffmpeg che muore da solo (dispositivo occupato, disco pieno) chiude tutta la registrazione.
      void processo.exited.then((codice) => {
        if (codice !== 0 && !corrente.chiusa) void this.chiudi(corrente)
      })
    }
    this.inCorso = corrente
    this.eventi.emetti({ tipo: "registrazione" })
  }

  async ferma(): Promise<void> {
    if (!this.inCorso) throw new ErroreRegistrazione(frase("Non c'è nessuna registrazione in corso.", "No recording is running."))
    await this.chiudi(this.inCorso)
  }

  /** Alla chiusura del server: una registrazione in corso si ferma bene, perché il file resti leggibile. */
  async spegni(): Promise<void> {
    if (this.inCorso) await this.chiudi(this.inCorso)
  }

  private async chiudi(corrente: InCorso): Promise<void> {
    if (corrente.chiusa) return
    corrente.chiusa = true
    await Promise.all(
      corrente.processi.map(async (processo) => {
        if (processo.exitCode === null) {
          // «q» è il modo in cui ffmpeg chiude bene il file.
          try {
            processo.stdin.write("q")
            await processo.stdin.end()
          } catch {
            // è già uscito
          }
        }
        const uscito = await Promise.race([processo.exited.then(() => true), Bun.sleep(ATTESA_CHIUSURA_MS).then(() => false)])
        if (!uscito) processo.kill()
        await processo.exited
      }),
    )
    await Promise.all(corrente.letture)

    for (const [i, file] of corrente.file.entries()) {
      // Un ffmpeg morto prima di scrivere non lascia un file: la sua scheda non deve restare.
      if ((await statistica(this.percorsi.grezzo(file))) === null) {
        await rimuovi(this.percorsi.schedaGrezzo(file))
        continue
      }
      const lettura = this.ffprobe ? await leggiFile(this.ffprobe, this.percorsi.grezzo(file)) : null
      await scrivi(this.percorsi.schedaGrezzo(file), testoJson({ tipo: corrente.tipi[i], origine: "registrazione", arrivato: corrente.iniziata, ...lettura?.misure }))
    }
    this.ultima = { file: corrente.file, finita: isoLocale(new Date()), errore: corrente.errori[0] ?? null }
    if (this.inCorso === corrente) this.inCorso = null
    await this.dopoScrittura(corrente.file.flatMap((f) => [`grezzo/${f}`, `grezzo/${f}.scheda.json`]))
    this.eventi.emetti({ tipo: "registrazione" })
  }
}
