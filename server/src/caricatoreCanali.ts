// Dal disco all'indice dei canali. Una lettura che Claude sta ancora scrivendo (file mancanti, JSON a metà)
// non rompe niente: il file che non si legge resta com'era e si riprova alla prossima notizia.
import { join } from "node:path"
import { impronta, nuovaLettura, type Classifica, type Crescita,type IndiceCanali, type LetturaDelCanale, type ProfiloInClassifica, type VideoDelCanale } from "./canale"
import type { Percorsi } from "./configurazione"
import { elenca, jsonDaTesto, leggiTesto } from "./disco"

const FILE_SINGOLI = new Set(["esito.json", "profilo.json", "video.json", "messaggi.json"])
const eOggetto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const eNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const eProfilo = (v: unknown): v is ProfiloInClassifica => eOggetto(v) && typeof v["nome"] === "string" && typeof v["cosa_fa"] === "string" && eNumero(v["follower"]) && eNumero(v["mi_piace"]) && eNumero(v["visualizzazioni"])

function comeClassifica(letto: unknown): Classifica | null {
  if (!eOggetto(letto) || typeof letto["quando"] !== "string" || !eNumero(letto["quanti"]) || !eNumero(letto["video_della_mediana"])) return null
  if (!Array.isArray(letto["profili"]) || !letto["profili"].every(eProfilo)) return null
  return {
    quando: letto["quando"],
    io: typeof letto["io"] === "string" ? letto["io"] : null,
    quanti: letto["quanti"],
    video_della_mediana: letto["video_della_mediana"],
    come: Array.isArray(letto["come"]) ? letto["come"].map(String) : [],
    profili: letto["profili"],
  }
}

const eTappa = (v: unknown): boolean => eOggetto(v) && typeof v["data"] === "string" && eNumero(v["follower"])
const eScenario = (v: unknown): v is Crescita["scenari"][number] => eOggetto(v) && typeof v["nome"] === "string" && Array.isArray(v["tappe"]) && v["tappe"].every(eTappa)

function comeCrescita(letto: unknown): Crescita | null {
  if (!eOggetto(letto) || typeof letto["quando"] !== "string" || typeof letto["obiettivo"] !== "string") return null
  const scenari = letto["scenari"]
  if (!Array.isArray(scenari) || !scenari.every(eScenario)) return null
  if (!scenari.some((s) => s.nome === letto["obiettivo"])) return null
  return { ...letto, quando: letto["quando"], obiettivo: letto["obiettivo"], scenari }
}

export class CaricatoreCanali {
  private readonly firmeClassifica = new Map<string, string>()
  private readonly firmeCrescita = new Map<string, string>()

  constructor(
    private readonly percorsi: Percorsi,
    readonly indice: IndiceCanali,
  ) {}

  private cartella(canale: string, lettura?: string): string {
    return join(this.percorsi.canali, canale, "letture", ...(lettura ? [lettura] : []))
  }

  async costruisci(): Promise<void> {
    for (const canale of (await elenca(this.percorsi.canali)).filter((d) => d.isDirectory())) await this.riallinea(canale.name)
  }

  /** Rilegge le cartelle delle letture di un canale: quelle nuove si caricano, quelle sparite si tolgono. */
  private async riallinea(canale: string): Promise<boolean> {
    const presenti = (await elenca(this.cartella(canale))).filter((d) => d.isDirectory()).map((d) => d.name)
    const letture = this.indice.canali.get(canale) ?? new Map<string, LetturaDelCanale>()
    this.indice.canali.set(canale, letture)
    let cambiato = false
    for (const nome of [...letture.keys()].filter((n) => !presenti.includes(n))) {
      letture.delete(nome)
      cambiato = true
    }
    for (const nome of presenti) cambiato = (await this.caricaLettura(canale, nome)) || cambiato
    cambiato = (await this.caricaClassifica(canale)) || cambiato
    return (await this.caricaCrescita(canale)) || cambiato
  }

  /** Un file che non si legge per intero o non ha la forma giusta lascia la crescita di prima. */
  private async caricaCrescita(canale: string): Promise<boolean> {
    const testo = await leggiTesto(join(this.percorsi.canali, canale, "crescita.json"))
    if (testo === null) {
      this.firmeCrescita.delete(canale)
      return this.indice.crescite.delete(canale)
    }
    const firma = String(Bun.hash(testo))
    if (this.firmeCrescita.get(canale) === firma) return false
    const crescita = comeCrescita(jsonDaTesto(testo)?.valore)
    if (!crescita) return false
    this.indice.crescite.set(canale, crescita)
    this.firmeCrescita.set(canale, firma)
    return true
  }

  private async caricaClassifica(canale: string): Promise<boolean> {
    const testo = await leggiTesto(join(this.percorsi.canali, canale, "classifica.json"))
    if (testo === null) {
      this.firmeClassifica.delete(canale)
      return this.indice.classifiche.delete(canale)
    }
    const firma = String(Bun.hash(testo))
    if (this.firmeClassifica.get(canale) === firma) return false
    const classifica = comeClassifica(jsonDaTesto(testo)?.valore)
    if (!classifica) return false
    this.indice.classifiche.set(canale, classifica)
    this.firmeClassifica.set(canale, firma)
    return true
  }

  private async caricaLettura(canale: string, nome: string): Promise<boolean> {
    const letture = this.indice.canali.get(canale)!
    const lettura = letture.get(nome) ?? nuovaLettura(nome)
    letture.set(nome, lettura)
    let cambiato = false
    for (const file of FILE_SINGOLI) cambiato = (await this.leggiFile(canale, lettura, file)) || cambiato
    return (await this.riallineaCommenti(canale, lettura)) || cambiato
  }

  private async riallineaCommenti(canale: string, lettura: LetturaDelCanale): Promise<boolean> {
    const presenti = (await elenca(join(this.cartella(canale, lettura.lettura), "commenti"))).filter((d) => d.isFile() && d.name.endsWith(".json")).map((d) => d.name.slice(0, -".json".length))
    let cambiato = false
    for (const id of [...lettura.commenti.keys()].filter((i) => !presenti.includes(i))) {
      lettura.commenti.delete(id)
      lettura.impronte.delete(`commenti/${id}.json`)
      cambiato = true
    }
    for (const id of presenti) cambiato = (await this.leggiFile(canale, lettura, `commenti/${id}.json`)) || cambiato
    return cambiato
  }

  /** Dice se è cambiato qualcosa; `relativi` sono percorsi dentro `archivio/canali/`, con `/`. */
  async cambiati(relativi: string[]): Promise<Set<string>> {
    const daRifare = new Map<string, Set<string>>()
    for (const relativo of relativi) {
      const [canale, letture, nome, ...resto] = relativo.split("/")
      if (!canale) continue
      const cose = daRifare.get(canale) ?? new Set<string>()
      daRifare.set(canale, cose)
      if (letture !== "letture" || !nome) cose.add("*")
      else cose.add(`${nome}/${resto.join("/")}`)
    }

    const cambiati = new Set<string>()
    for (const [canale, cose] of daRifare) {
      if (cose.has("*") || !this.indice.canali.has(canale)) {
        if (await this.riallinea(canale)) cambiati.add(canale)
        continue
      }
      for (const cosa of cose) {
        const [nome = "", ...resto] = cosa.split("/")
        const rel = resto.join("/")
        const lettura = this.indice.canali.get(canale)!.get(nome)
        if (!lettura || rel === "") {
          if (await this.riallinea(canale)) cambiati.add(canale)
        } else if (rel === "commenti") {
          if (await this.riallineaCommenti(canale, lettura)) cambiati.add(canale)
        } else if (FILE_SINGOLI.has(rel) || /^commenti\/[^/]+\.json$/.test(rel)) {
          if (await this.leggiFile(canale, lettura, rel)) cambiati.add(canale)
        }
      }
    }
    return cambiati
  }

  /** Legge un file della lettura e ne aggiorna l'indice. Dice se l'indice è cambiato. */
  private async leggiFile(canale: string, lettura: LetturaDelCanale, rel: string): Promise<boolean> {
    const testo = await leggiTesto(join(this.cartella(canale, lettura.lettura), rel))
    if (testo === null) return this.dimentica(lettura, rel)
    const firma = String(Bun.hash(testo))
    if (lettura.impronte.get(rel) === firma) return false
    const letto = jsonDaTesto(testo)?.valore
    if (!eOggetto(letto)) return false

    const id = /^commenti\/([^/]+)\.json$/.exec(rel)?.[1]
    if (id !== undefined) {
      if (!Array.isArray(letto["commenti"])) return false
      lettura.commenti.set(id, new Set(letto["commenti"].flatMap((c) => (eOggetto(c) && c["id"] !== undefined ? [String(c["id"])] : []))))
    } else if (rel === "esito.json") {
      if (typeof letto["completa"] !== "boolean") return false
      lettura.completa = letto["completa"]
      lettura.mancano = Array.isArray(letto["mancano"]) ? letto["mancano"].map(String) : []
      if (typeof letto["quando"] === "string") lettura.quando = letto["quando"]
      lettura.scritta = true
    } else if (rel === "profilo.json") {
      lettura.profilo = letto
    } else if (rel === "video.json") {
      if (!Array.isArray(letto["video"])) return false
      lettura.video = letto["video"].filter((v): v is VideoDelCanale => eOggetto(v) && typeof v["id"] === "string")
    } else if (rel === "messaggi.json") {
      if (!Array.isArray(letto["conversazioni"])) return false
      lettura.conversazioni = new Map(
        letto["conversazioni"].filter(eOggetto).map((c) => [
          String(c["con"]),
          (Array.isArray(c["messaggi"]) ? c["messaggi"] : []).filter(eOggetto).map((m) => impronta(String(m["da"]), String(m["quando_scritto"]), String(m["testo"]))),
        ]),
      )
    }
    lettura.impronte.set(rel, firma)
    return true
  }

  private dimentica(lettura: LetturaDelCanale, rel: string): boolean {
    if (!lettura.impronte.delete(rel)) return false
    const id = /^commenti\/([^/]+)\.json$/.exec(rel)?.[1]
    if (id !== undefined) lettura.commenti.delete(id)
    else if (rel === "esito.json") lettura.scritta = false
    else if (rel === "profilo.json") lettura.profilo = null
    else if (rel === "video.json") lettura.video = null
    else if (rel === "messaggi.json") lettura.conversazioni = null
    return true
  }
}
