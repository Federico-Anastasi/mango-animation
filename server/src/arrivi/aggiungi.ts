// Un file che il creator ha sul computer entra nel girato (Girato, «Aggiungi video» e i file lasciati sulla pagina) per la strada degli arrivi dal
// telefono: stesso nome (`AAAAMMGG-HHMMSS-<nome>`), stessi generi (video, foto, audio), stesso passaggio da `.in-corso/` e dalla misura con `ffprobe`
// prima di comparire in `grezzo/<giorno>/` con la sua scheda. Due modi: il file arriva col corpo della richiesta (il browser, anche da un telefono), o
// l'app dice il suo percorso (un file lasciato sulla finestra) e il server lo collega, o lo copia se sta su un altro disco.
import { randomUUID } from "node:crypto"
import { copyFile, link, mkdir, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import type { Percorsi } from "../configurazione"
import { rinomina, statistica } from "../disco"
import { frase } from "../lingua"
import { ErroreArrivo, grandezza } from "./errore"
import { ACCETTATI, MARGINE_DISCO, Scrittura, type SpazioLibero } from "./ingresso"
import { nomeDestinazione, nomePulito, tipoDi } from "./nomi"
import type { PercorsiScelti } from "./percorsiScelti"
import type { Arrivo, Atteso } from "./ricevitore"

export interface ContestoAggiungi {
  percorsi: Percorsi
  limiteByte: number
  spazioLibero: SpazioLibero
  adesso: () => Date
  /** Il file aspetta in `.in-corso/`: lo misura, scrive la scheda e lo mette nel girato. */
  colloca: (atteso: Atteso) => Promise<Arrivo>
  registra: (riga: Record<string, unknown>) => Promise<void>
  /** Il file del girato con questo nome e questa grandezza, se c'è già. */
  giaNelGirato: (nome: string, byte: number) => string | null
  percorsiScelti: PercorsiScelti
}

export type DaAggiungere =
  | { come: "caricato"; nome: string; mime: string | null; corpo: ReadableStream<Uint8Array> | null; lunghezza: number | null }
  | { come: "percorso"; percorso: string }

/** Il file del girato che ha già questo nome (senza il giorno e l'ora d'arrivo) e questa grandezza: aggiungerlo di nuovo sarebbe una copia inutile. */
export function cercaDoppione(grezzo: ReadonlyMap<string, ReadonlyMap<string, { nome: string; byte: number }>>, nome: string, byte: number): string | null {
  const voluto = nome.toLowerCase()
  for (const [giorno, file] of grezzo) {
    for (const f of file.values()) if (f.byte === byte && f.nome.replace(/^\d{8}-\d{6}-/, "").toLowerCase() === voluto) return `${giorno}/${f.nome}`
  }
  return null
}

function nomeAmmesso(grezzo: string, mime: string | null): string {
  const nome = nomePulito(grezzo, mime)
  const tipo = tipoDi(nome, mime)
  if (tipo === null || !ACCETTATI.includes(tipo)) {
    throw new ErroreArrivo(415, frase(`«${nome}» non è un video, una foto o una registrazione audio: nel girato entrano solo questi.`, `«${nome}» is not a video, a photo or an audio recording: only those go into the footage.`))
  }
  return nome
}

const vuoto = (nome: string) => new ErroreArrivo(400, frase(`Il file «${nome}» è vuoto.`, `The file «${nome}» is empty.`))

const troppoGrande = (nome: string, byte: number, massimo: number) =>
  new ErroreArrivo(413, frase(`«${nome}» pesa ${grandezza(byte)}, più del massimo di ${grandezza(massimo)}.`, `«${nome}» is ${grandezza(byte, "en")}, over the ${grandezza(massimo, "en")} limit.`))

const senzaSpazio = (nome: string, libero: number, serve: number) =>
  new ErroreArrivo(
    507,
    frase(
      `Sul computer non c'è abbastanza spazio libero per «${nome}»: ce ne sono ${grandezza(libero)}, ne servono ${grandezza(serve)}. Libera spazio e riprova.`,
      `There is not enough free space on the computer for «${nome}»: ${grandezza(libero, "en")} free, ${grandezza(serve, "en")} needed. Free some space and try again.`,
    ),
  )

const doppione = (nome: string, file: string) => new ErroreArrivo(409, frase(`«${nome}» è già nel girato (${file}): non lo aggiungo due volte.`, `«${nome}» is already in the footage (${file}): I won't add it twice.`))

export async function aggiungiAlGirato(c: ContestoAggiungi, da: DaAggiungere): Promise<Arrivo> {
  const quando = c.adesso()
  const parziali = join(c.percorsi.arrivi, ".in-corso")
  const nome = nomeAmmesso(da.come === "caricato" ? da.nome : basename(da.percorso), da.come === "caricato" ? da.mime : null)
  const attesa = (byte: number): Atteso => {
    const destinazione = nomeDestinazione(quando, nome)
    return { attesa: `${destinazione}.${randomUUID().slice(0, 8)}.attesa`, nome: destinazione, quando, byte }
  }
  const rifiuta = async (errore: unknown): Promise<never> => {
    if (errore instanceof ErroreArrivo) await c.registra({ esito: "rifiutato", motivo: errore.message, nome_originale: nome })
    throw errore
  }

  await mkdir(parziali, { recursive: true })
  if (da.come === "percorso") {
    if (!c.percorsiScelti.prendi(da.percorso)) {
      return rifiuta(new ErroreArrivo(403, frase("Questo file non l'hai scelto tu dall'app: lascialo sulla pagina del girato, oppure usa «Aggiungi video».", "You didn't pick this file in the app: drop it on the footage page, or use «Add video».")))
    }
    const stato = await statistica(da.percorso)
    if (!stato?.isFile()) return rifiuta(new ErroreArrivo(400, frase(`«${nome}» non c'è più, o è una cartella.`, `«${nome}» is no longer there, or it is a folder.`)))
    if (stato.size === 0) return rifiuta(vuoto(nome))
    if (stato.size > c.limiteByte) return rifiuta(troppoGrande(nome, stato.size, c.limiteByte))
    const gia = c.giaNelGirato(nome, stato.size)
    if (gia !== null) return rifiuta(doppione(nome, gia))
    const pronto = attesa(stato.size)
    const dove = join(parziali, pronto.attesa)
    try {
      // Un collegamento non costa spazio né tempo; su un altro disco (o dove il collegamento non si può) si copia.
      await link(da.percorso, dove).catch(async () => {
        const libero = await c.spazioLibero(parziali)
        if (libero < stato.size + MARGINE_DISCO) throw senzaSpazio(nome, libero, stato.size + MARGINE_DISCO)
        await copyFile(da.percorso, dove)
      })
      return await c.colloca(pronto)
    } catch (errore) {
      await rm(dove, { force: true })
      return rifiuta(errore)
    }
  }

  if (da.lunghezza !== null && da.lunghezza > c.limiteByte) return rifiuta(troppoGrande(nome, da.lunghezza, c.limiteByte))
  const gia = da.lunghezza === null ? null : c.giaNelGirato(nome, da.lunghezza)
  if (gia !== null) return rifiuta(doppione(nome, gia))
  if (da.corpo === null) return rifiuta(new ErroreArrivo(400, frase("Non è arrivato nessun file.", "No file arrived.")))
  const libero = await c.spazioLibero(parziali)
  if (libero < (da.lunghezza ?? 0) + MARGINE_DISCO) return rifiuta(senzaSpazio(nome, libero, (da.lunghezza ?? 0) + MARGINE_DISCO))
  const parziale = join(parziali, `${randomUUID()}.parziale`)
  const scrittura = new Scrittura(parziale, c.limiteByte, c.spazioLibero, parziali)
  let pronto: Atteso | null = null
  try {
    try {
      await scrittura.daFlusso(da.corpo)
    } finally {
      await scrittura.chiudi()
    }
    if (scrittura.scritti === 0) throw vuoto(nome)
    if (da.lunghezza !== null && scrittura.scritti !== da.lunghezza) {
      throw new ErroreArrivo(400, frase(`«${nome}» è arrivato a metà: riprova.`, `«${nome}» arrived only in part: try again.`))
    }
    pronto = attesa(scrittura.scritti)
    await rinomina(parziale, join(parziali, pronto.attesa))
    return await c.colloca(pronto)
  } catch (errore) {
    await rm(parziale, { force: true })
    if (pronto !== null) await rm(join(parziali, pronto.attesa), { force: true })
    return rifiuta(errore)
  }
}
