import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { Animazioni } from "./animazioni"
import { chiaveApi } from "./arrivi/chiave"
import { ControlloFirewall } from "./arrivi/firewall"
import { videoDaGuardare } from "./arrivi/guarda"
import { Ricevitore } from "./arrivi/ricevitore"
import { CaricatoreCanali } from "./caricatoreCanali"
import { Chat } from "./chat/chat"
import { Coda } from "./coda"
import { Consumi } from "./consumi/consumi"
import { creaPercorsi, opzioniDaAmbiente, schedaVideoDi, VARIABILE_LAVORO, type Opzioni } from "./configurazione"
import { rimuovi } from "./disco"
import { Elaboratore } from "./elaboratore"
import { Eventi } from "./eventi"
import { Indice } from "./indice"
import { eUscita, ignoraNellArchivio, osserva } from "./osservatore"
import { Registrazione } from "./registrazione"
import { creaGestore } from "./rotte"
import { Schemi } from "./schemi"
import { Miniature } from "./miniature"
import { Sonda } from "./sonda"

export interface Server {
  /** La porta dell'interfaccia e dell'API. */
  porta: number
  /** La porta del ricevitore dal telefono, se è in ascolto. */
  readonly portaArrivi: number | null
  /** La chiave delle API: chi la porta può usarle (`accesso.ts`). */
  chiaveApi: string
  indice: Indice
  coda: Coda
  ricevitore: Ricevitore
  miniature: Miniature
  ferma: () => Promise<void>
}

/** Mette insieme e avvia tutto. `parziali` sostituisce le opzioni di una partenza vera: le prove le usano per un archivio e delle porte loro. */
export async function creaServer(parziali: Partial<Opzioni> = {}): Promise<Server> {
  const ambiente = parziali.lavoro === undefined ? process.env : { ...process.env, [VARIABILE_LAVORO]: parziali.lavoro }
  const opzioni: Opzioni = { ...opzioniDaAmbiente(ambiente), ...parziali }
  const percorsi = creaPercorsi(opzioni.archivio)
  if (opzioni.ffprobe === null) console.error("ffprobe non si trova nel PATH di questo programma: i file dal telefono e scaricati entrano senza durata né misure. Installa ffmpeg (docs/NUOVO-COMPUTER.md) e riavvia.")
  await mkdir(opzioni.archivio, { recursive: true })
  await rimuovi(join(percorsi.arrivi, ".scarichi"))

  const chiaveDelleApi = await chiaveApi(percorsi.arrivi)
  const eventi = new Eventi(opzioni.battitoMs)
  const indice = new Indice()
  const schemi = await Schemi.carica(opzioni.schemi)
  const coda = new Coda(
    opzioni,
    percorsi,
    eventi,
    (lavoro) => elaboratore.dopoIlLavoro(lavoro),
    (lavoro) => indice.secondiDaLavorare(lavoro),
    () => schedaVideoDi(indice.profilo.valore),
  )
  await coda.carica()
  const sonda = new Sonda(opzioni.ffprobe, percorsi, opzioni.fermoMs, (relativi) => elaboratore.cambiati(relativi))
  const miniature = new Miniature(
    opzioni.ffmpeg,
    opzioni.ffprobe,
    percorsi,
    () => elaboratore.misureMiniatura(),
    (relativi) => elaboratore.cambiati(relativi),
  )
  const elaboratore = new Elaboratore(opzioni, percorsi, indice, eventi, schemi, coda, sonda, miniature, new CaricatoreCanali(percorsi, indice.canali))
  await elaboratore.profiloCambiato()
  await elaboratore.costruisci()

  const osservatoreArchivio = osserva(opzioni.archivio, {
    ricorsivo: true,
    rimbalzoMs: opzioni.rimbalzoMs,
    ignora: ignoraNellArchivio,
    lenti: { quietoMs: opzioni.quietoUsciteMs, riconosci: eUscita },
    alCambio: (relativi) => elaboratore.cambiati(relativi),
  })
  // Lo stile del prodotto, quello del creator e il profilo stanno in due cartelle sole: un osservatore per cartella.
  const osservatoriDelleImpostazioni = [
    ...[...new Set([dirname(opzioni.stile), dirname(opzioni.stileCreator)])].map((cartella) =>
      osserva(cartella, {
        ricorsivo: false,
        rimbalzoMs: opzioni.rimbalzoMs,
        ignora: (relativo) => relativo !== "stile.json" && relativo !== "profilo.json",
        alCambio: async (relativi) => {
          if (relativi.includes("stile.json")) await elaboratore.stileCambiato()
          if (relativi.includes("profilo.json")) await elaboratore.profiloCambiato()
        },
      }),
    ),
    osserva(opzioni.schemi, {
      ricorsivo: false,
      rimbalzoMs: opzioni.rimbalzoMs,
      ignora: (relativo) => !relativo.endsWith(".schema.json"),
      alCambio: () => elaboratore.schemiCambiati(),
    }),
  ]

  const firewall = new ControlloFirewall(process.execPath, opzioni.leggiFirewall)
  const ricevitore = await Ricevitore.avvia({
    percorsi,
    firewall,
    ffprobe: opzioni.ffprobe,
    porta: opzioni.arrivi.porta,
    indirizzo: opzioni.arrivi.indirizzo,
    limiteByte: opzioni.arrivi.limiteByte,
    spazioLibero: opzioni.arrivi.spazioLibero,
    adesso: opzioni.arrivi.adesso,
    interfacce: opzioni.arrivi.interfacce,
    eventi,
    dopoArrivo: (relativi) => elaboratore.cambiati(relativi),
    video: () => videoDaGuardare(indice.video.values()),
    chiaveApi: chiaveDelleApi,
  })
  const animazioni = new Animazioni(opzioni.animazioni, opzioni.rimbalzoMs, join(opzioni.lavoro, "animazioni", "scene"), () => eventi.emetti({ tipo: "animazioni" }))
  const registrazione = new Registrazione(opzioni.registrazione, opzioni.ffprobe, percorsi, eventi, (relativi) => elaboratore.cambiati(relativi), () => indice.profilo.valore)
  void registrazione.elencaDispositivi().catch((errore) => console.error(`Non riesco a elencare microfoni e webcam: ${errore instanceof Error ? errore.message : String(errore)}`))

  const chat = new Chat({ codice: opzioni.codice, lavoro: opzioni.lavoro, archivio: opzioni.archivio, eventi, opzioni: opzioni.chat, titoloDelVideo: (slug) => indice.visibile(slug)?.scheda?.titolo, adesso: () => new Date() })

  const consumi = new Consumi(opzioni.consumi.cartella, opzioni.consumi, () => eventi.emetti({ tipo: "consumi" }))
  await consumi.avvia()

  const gestore = creaGestore({ opzioni, percorsi, indice, elaboratore, coda, eventi, animazioni, ricevitore, firewall, registrazione, chat, consumi, schemi, chiaveApi: chiaveDelleApi })
  const server = Bun.serve({
    hostname: opzioni.indirizzo,
    port: opzioni.porta,
    maxRequestBodySize: 16 * 1024 ** 2,
    idleTimeout: 60,
    fetch: (req, s) => gestore(req, () => s.timeout(req, 0)),
  })

  ricevitore.collegaStudio(server.port ?? opzioni.porta)

  return {
    porta: server.port ?? opzioni.porta,
    get portaArrivi() {
      return ricevitore.porta
    },
    chiaveApi: chiaveDelleApi,
    indice,
    coda,
    ricevitore,
    miniature,
    ferma: async () => {
      await server.stop(true)
      await chat.chiudi()
      await consumi.chiudi()
      await registrazione.spegni()
      ricevitore.chiudi()
      osservatoreArchivio.chiudi()
      osservatoriDelleImpostazioni.forEach((o) => o.chiudi())
      animazioni.chiudi()
      eventi.chiudi()
      await coda.chiudi()
      await ricevitore.attendi()
      await sonda.attendi()
      await miniature.ferma()
    },
  }
}
