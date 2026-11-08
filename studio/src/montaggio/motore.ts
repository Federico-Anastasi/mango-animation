// L'anteprima «Piano» fuori da React: due serie di video che si passano il testimone da un tratto al
// successivo (mentre uno suona, l'altro aspetta fermo all'inizio del tratto dopo) e un solo palco su cui
// si compongono gli strati del quadro alle misure di `stile.json`. React dà i dati e legge il tempo dal
// trasporto; qui dentro si decide cosa suona e cosa si disegna a ogni fotogramma.
import { t } from "../lingua"
import type { PianoCompleto, Risolto, Strato, Stile, Tratto, Zoom } from "../tipi"
import { avanzamentoDelPezzo, colore, comeRett, contieniLaVista, finestraGirato, posaInserto, posaNellArea, posaRiquadro, posaSagoma, posaSagomaMisurata, posaViso, scalaDellaSagoma, secondoDellaSagoma, stratoDi, tempoDiScena, trattoDellaSagoma, type Misure, type MisuraTesta, type Posa, type Rett } from "./composizione"
import { inseguimento } from "./inseguimento"
import { dellaSorgente, sagomaDi, type InfoSorgente } from "./sorgenti"
import { trattoA } from "./ritocchi"
import { Testi } from "./testi"
import type { Trasporto } from "./trasporto"

export interface Slot {
  girato: HTMLVideoElement
  sagoma: HTMLVideoElement
  anim: HTMLVideoElement
}

export interface DatiPiano {
  risolto: Risolto
  piano: PianoCompleto
  stile: Stile
  sorgenti: Record<string, InfoSorgente>
  /** Dove sta la testa nelle riprese messe in sagoma, per nome di sorgente; ciò che il montaggio non ha ancora misurato manca. */
  teste: Record<string, MisuraTesta>
  /** Dove sta l'animazione resa di una scena (se non è ancora stata resa il server non la trova). */
  urlAnimazione: (sigla: string) => string
  /** Cambia quando un montaggio nuovo può aver reso scene che mancavano: si riprova a caricarle. */
  versioneScene: string
}

export interface ZoomProvvisorio {
  tratto: number
  zoom: Zoom
}

/** Quanto si fidano i video di essere già dove devono prima di saltare di nuovo. */
const GIA_LI_S = 0.3
const RITARDO_SALTO_S = 0.3
const FINE_TRATTO_S = 0.015

export interface Problema {
  testo: string
  /** Si risolve preparando il girato. */
  daPreparare: boolean
}

/** Ciò che manca perché il tratto `k` si veda per intero: lo dice a chi guarda, in parole. */
export function problemiDelTratto(dati: DatiPiano, k: number): Problema[] {
  const tratto = dati.risolto.tratti[k]
  if (!tratto) return []
  const scena = dati.risolto.scene[tratto.scena]
  const quadro = scena ? dati.stile.quadri[scena.quadro] : undefined
  if (!scena || !quadro) return [{ testo: t("Il quadro «{quadro}» non è nello stile.", "The layout «{quadro}» is not in the style.", { quadro: scena?.quadro ?? "?" }), daPreparare: false }]
  // Un pezzo senza voce non ha girato né file da preparare: solo l'animazione della scena.
  if (tratto.sorgente === null) return []
  const info = dati.sorgenti[tratto.sorgente]
  const sorgente = dati.piano.sorgenti[tratto.sorgente]
  const problemi: Problema[] = []
  const aggiungi = (testo: string, daPreparare = false) => problemi.push({ testo, daPreparare })
  const usaGirato = quadro.strati.some((s) => s.tipo === "girato" || s.tipo === "riquadro" || s.tipo === "inserto" || s.tipo === "viso")
  if (!info || !info.trovato) aggiungi(t("Il file di questo pezzo non è nel girato.", "The file of this clip is not in the footage."))
  else if (usaGirato && !info.leggero) aggiungi(t("Il file di questo pezzo va ancora preparato.", "The file of this clip still needs to be prepared."), true)
  else if (usaGirato && (info.larghezza === null || info.altezza === null)) aggiungi(t("Del file di questo pezzo non si conoscono le misure: va preparato di nuovo.", "The size of this clip's file is not known: it needs to be prepared again."), true)
  const strato = stratoDi(quadro, "sagoma")
  const daSagoma = tratto.sagoma?.sorgente ?? tratto.sorgente
  const dellaSagoma = trattoDellaSagoma(tratto)
  const sagoma = sagomaDi(dellaSagoma.sorgente === null ? undefined : dati.sorgenti[dellaSagoma.sorgente], dellaSagoma.da, dellaSagoma.a)
  if (info?.trovato && strato && !sagoma) aggiungi(t("La sagoma di questo pezzo va ancora preparata.", "The silhouette of this clip still needs to be prepared."), true)
  else if (strato && sagoma && !dati.teste[daSagoma]) aggiungi(t("La sagoma è posata in modo approssimato: la sua posizione esatta arriva col primo montaggio.", "The silhouette is placed roughly: its exact position comes with the first edit."))
  if (tratto.vista && !sorgente?.viste?.[tratto.vista]) aggiungi(t("La vista «{vista}» non è dichiarata per questo file.", "The view «{vista}» is not declared for this file.", { vista: tratto.vista }))
  const riquadro = stratoDi(quadro, "riquadro") ?? stratoDi(quadro, "viso")
  if (riquadro && !sorgente?.riquadri?.[riquadro.nome]) aggiungi(t("Il file non ha il riquadro «{nome}».", "The file has no frame box «{nome}».", { nome: riquadro.nome }))
  if (stratoDi(quadro, "inserto") && !(tratto.vista && sorgente?.viste?.[tratto.vista]?.inserto)) aggiungi(t("Il quadro vuole un inserto, ma la vista non ne ha uno.", "The layout needs an inset, but the view has none."))
  return problemi
}

/** Disegna la parte `origine` del video nella `destinazione`. Le copie leggere sono più piccole dell'originale: le misure del piano si portano alla loro scala. */
function disegnaPosaSu(ctx: CanvasRenderingContext2D, el: HTMLVideoElement, posa: Posa, copia: Rett | null): void {
  const { origine, destinazione } = posa
  const kx = copia ? el.videoWidth / copia.w : 1
  const ky = copia ? el.videoHeight / copia.h : 1
  ctx.drawImage(el, origine.x * kx, origine.y * ky, origine.w * kx, origine.h * ky, destinazione.x, destinazione.y, destinazione.w, destinazione.h)
}

function impostaSorgente(el: HTMLVideoElement, url: string | null): void {
  if (url === null) {
    if (el.dataset.src === undefined) return
    delete el.dataset.src
    el.removeAttribute("src")
    el.load()
    return
  }
  if (el.dataset.src === url) return
  el.dataset.src = url
  el.src = url
  el.preload = "auto"
}

const haSorgente = (el: HTMLVideoElement) => el.dataset.src !== undefined

function posiziona(el: HTMLVideoElement, secondo: number): void {
  if (!haSorgente(el) || el.seeking) return
  if (Math.abs(el.currentTime - secondo) > 0.02) el.currentTime = secondo
}

function misuraSalti(el: HTMLVideoElement, ritardo: { valore: number }): () => void {
  let dal = 0
  const inizio = () => {
    dal = performance.now()
  }
  const fine = () => {
    if (dal) ritardo.valore = Math.min(Math.max((performance.now() - dal) / 1000, 0.05), 2)
    dal = 0
  }
  el.addEventListener("seeking", inizio)
  el.addEventListener("seeked", fine)
  return () => {
    el.removeEventListener("seeking", inizio)
    el.removeEventListener("seeked", fine)
  }
}

export class MotorePiano {
  private dati: DatiPiano | null = null
  private attivo: 0 | 1 = 0
  private caricato: [number, number] = [-1, -1]
  private saltiVisti = -1
  private daRifare = true
  private sporco = true
  private orologio = 0
  private cornice = 0
  private ultimoScena = 0
  private suonava = false
  private mancanti = new Set<string>()
  private versioneScene = ""
  private ritardo = { valore: RITARDO_SALTO_S }
  private pulizie: Array<() => void> = []
  private scale = new Map<string, number | null>()
  private lavagna: HTMLCanvasElement | null = null
  private readonly testi = new Testi(() => {
    this.sporco = true
  })
  zoomProvvisorio: ZoomProvvisorio | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly slot: [Slot, Slot],
    private readonly trasporto: Trasporto,
  ) {}

  imposta(dati: DatiPiano): void {
    if (dati.versioneScene !== this.versioneScene) {
      this.versioneScene = dati.versioneScene
      this.mancanti.clear()
    }
    this.dati = dati
    this.scale.clear()
    this.caricato = [-1, -1]
    this.daRifare = true
    this.sporco = true
  }

  ridisegna(): void {
    this.sporco = true
  }

  avvia(): () => void {
    for (const s of this.slot) {
      for (const el of [s.girato, s.sagoma, s.anim]) {
        el.addEventListener("loadeddata", this.sporca)
        el.addEventListener("seeked", this.sporca)
        this.pulizie.push(() => {
          el.removeEventListener("loadeddata", this.sporca)
          el.removeEventListener("seeked", this.sporca)
        })
      }
      this.pulizie.push(misuraSalti(s.girato, this.ritardo))
      s.anim.addEventListener("error", this.animazioneMancante)
      this.pulizie.push(() => s.anim.removeEventListener("error", this.animazioneMancante))
    }
    this.pulizie.push(this.trasporto.iscriviti(this.sporca))
    this.cornice = requestAnimationFrame(this.giro)
    return () => {
      cancelAnimationFrame(this.cornice)
      this.pulizie.forEach((p) => p())
      this.pulizie = []
      for (const s of this.slot) for (const el of [s.girato, s.sagoma, s.anim]) el.pause()
    }
  }

  private sporca = () => {
    this.sporco = true
  }

  // Il server non dice quali scene sono rese: si prova a caricarle, e una che non c'è si ricorda e non si richiede.
  private animazioneMancante = (e: Event) => {
    const el = e.currentTarget as HTMLVideoElement
    if (el.dataset.src !== undefined) this.mancanti.add(el.dataset.src)
    impostaSorgente(el, null)
    this.sporco = true
  }

  /** Il file di sagoma che porta il tratto, coi dati del piano di adesso. */
  private sagomaDel(tratto: Tratto): { url: string; inizio: number } | null {
    const dati = this.dati!
    const { sorgente, da, a } = trattoDellaSagoma(tratto)
    return sagomaDi(sorgente === null ? undefined : dati.sorgenti[sorgente], da, a)
  }

  /** Il secondo del file di sagoma che corrisponde al secondo `s` della sorgente del tratto: i pezzi cominciano dove dice `inizio`. */
  private secondoNelFileDiSagoma(tratto: Tratto, s: number): number {
    return secondoDellaSagoma(tratto, s) - (this.sagomaDel(tratto)?.inizio ?? 0)
  }

  private carica(i: 0 | 1, k: number, secondo: number | null): void {
    const dati = this.dati!
    const tratto = dati.risolto.tratti[k]
    const slot = this.slot[i]
    if (!tratto) {
      this.caricato[i] = -1
      return
    }
    const scena = dati.risolto.scene[tratto.scena]
    const quadro = scena ? dati.stile.quadri[scena.quadro] : undefined
    const info = dellaSorgente(dati.sorgenti, tratto)
    impostaSorgente(slot.girato, info?.leggero ?? null)
    const sagoma = quadro && stratoDi(quadro, "sagoma") ? this.sagomaDel(tratto) : null
    impostaSorgente(slot.sagoma, sagoma?.url ?? null)
    const animazione = quadro && stratoDi(quadro, "animazione") && scena?.animazione ? dati.urlAnimazione(scena.animazione) : null
    impostaSorgente(slot.anim, animazione !== null && !this.mancanti.has(animazione) ? animazione : null)
    this.caricato[i] = k
    const s = secondo ?? tratto.da
    posiziona(slot.girato, s)
    posiziona(slot.sagoma, this.secondoNelFileDiSagoma(tratto, s))
    if (scena) posiziona(slot.anim, tempoDiScena(scena.ancore, (secondo === null ? tratto.esce : tratto.esce + (s - tratto.da)) - scena.inizio))
  }

  private sincronizza(t: number, suona: boolean): void {
    const dati = this.dati!
    const tratti = dati.risolto.tratti
    this.saltiVisti = this.trasporto.salti()
    this.daRifare = false
    const k = Math.max(trattoA(dati.risolto, t), t >= dati.risolto.durata ? tratti.length - 1 : 0)
    const tratto = tratti[k]!
    const s = tratto.da + Math.min(Math.max(t - tratto.esce, 0), tratto.durata)
    const a = this.attivo
    const giaLi = suona && this.caricato[a] === k && Math.abs(this.slot[a].girato.currentTime - s) < GIA_LI_S
    if (!giaLi) this.carica(a, k, s)
    const altro: 0 | 1 = a === 0 ? 1 : 0
    if (tratti[k + 1] && this.caricato[altro] !== k + 1) this.carica(altro, k + 1, null)
    for (const el of [this.slot[altro].girato, this.slot[altro].sagoma, this.slot[altro].anim]) el.pause()
    this.slot[a].girato.muted = false
    this.slot[altro].girato.muted = true
    this.sporco = true
  }

  private avviaSlot(slot: Slot): void {
    slot.girato.muted = false
    if (haSorgente(slot.girato) && slot.girato.paused) {
      slot.girato.play().catch(() => {
        this.trasporto.ferma()
      })
    }
  }

  private passa(k: number): void {
    const dati = this.dati!
    const tratti = dati.risolto.tratti
    const prossimo = tratti[k + 1]
    const vecchio = this.slot[this.attivo]
    for (const el of [vecchio.girato, vecchio.sagoma, vecchio.anim]) el.pause()
    if (!prossimo) {
      this.trasporto.avanza(dati.risolto.durata)
      return
    }
    const altro: 0 | 1 = this.attivo === 0 ? 1 : 0
    if (this.caricato[altro] !== k + 1) this.carica(altro, k + 1, null)
    vecchio.girato.muted = true
    this.attivo = altro
    this.avviaSlot(this.slot[altro])
    this.trasporto.avanza(prossimo.esce)
    const dopo = tratti[k + 2]
    if (dopo) this.carica(this.attivo === 0 ? 1 : 0, k + 2, null)
    this.sporco = true
  }

  private giro = (ora: number) => {
    this.cornice = requestAnimationFrame(this.giro)
    const dati = this.dati
    if (!dati) return
    const tratti = dati.risolto.tratti
    const trasporto = this.trasporto
    const suona = trasporto.inRiproduzione()
    if (tratti.length === 0) {
      this.disegnaVuoto()
      return
    }
    let t = trasporto.t()
    if (this.saltiVisti !== trasporto.salti() || this.daRifare) this.sincronizza(t, suona)
    const k = this.caricato[this.attivo]
    const tratto = tratti[k]
    if (!tratto) return
    const slot = this.slot[this.attivo]
    const scena = dati.risolto.scene[tratto.scena]
    const durataTratto = tratto.durata

    if (suona) {
      this.sporco = true
      if (!this.suonava) this.orologio = ora
      if (haSorgente(slot.girato)) {
        this.avviaSlot(slot)
        const s = slot.girato.currentTime
        if (s >= tratto.da + durataTratto - FINE_TRATTO_S || slot.girato.ended) {
          this.passa(k)
          this.orologio = ora
          return
        }
        t = tratto.esce + Math.max(s - tratto.da, 0)
        trasporto.avanza(Math.min(t, tratto.esce + durataTratto))
      } else {
        t += (ora - this.orologio) / 1000
        if (t >= tratto.esce + durataTratto) {
          this.passa(k)
          this.orologio = ora
          return
        }
        trasporto.avanza(t)
      }
      this.seguiAltri(slot, this.secondoNelFileDiSagoma(tratto, tratto.da + (t - tratto.esce)), scena ? tempoDiScena(scena.ancore, t - scena.inizio) : 0, true)
    } else {
      for (const el of [slot.girato, slot.sagoma, slot.anim]) if (!el.paused) el.pause()
      const s = tratto.da + Math.min(Math.max(t - tratto.esce, 0), durataTratto)
      posiziona(slot.girato, s)
      this.seguiAltri(slot, this.secondoNelFileDiSagoma(tratto, s), scena ? tempoDiScena(scena.ancore, t - scena.inizio) : 0, false)
    }
    this.orologio = ora
    this.suonava = suona
    if (this.sporco) this.sporco = !this.disegna(k, trasporto.t())
  }

  private seguiAltri(slot: Slot, secondoSagoma: number, secondoScena: number, suona: boolean): void {
    const segui = (el: HTMLVideoElement, voluto: number) => {
      if (!haSorgente(el)) return
      if (!suona) {
        if (!el.paused) el.pause()
        posiziona(el, voluto)
        return
      }
      const passo = inseguimento({ attuale: el.currentTime, voluto, cercando: el.seeking, ritardoSalto: this.ritardo.valore })
      if (passo.salto !== null) el.currentTime = passo.salto
      el.playbackRate = passo.velocita
      if (el.paused) void el.play().catch(() => undefined)
    }
    segui(slot.sagoma, secondoSagoma)
    // Un'animazione che aspetta un'ancora sta ferma: non la si fa correre per poi tirarla indietro.
    const anim = slot.anim
    if (!haSorgente(anim)) return
    const ferma = Math.abs(secondoScena - this.ultimoScena) < 1e-4
    this.ultimoScena = secondoScena
    if (suona && ferma) {
      if (!anim.paused) anim.pause()
      posiziona(anim, secondoScena)
      return
    }
    segui(anim, secondoScena)
  }

  private disegnaVuoto(): void {
    const ctx = this.canvas.getContext("2d")
    if (!ctx || !this.dati) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = colore(this.dati.stile, "carta")
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private disegna(k: number, secondo: number): boolean {
    const ctx = this.canvas.getContext("2d")
    const dati = this.dati
    if (!ctx || !dati) return true
    const { risolto, stile, piano } = dati
    const tratto = risolto.tratti[k]
    const scena = tratto ? risolto.scene[tratto.scena] : undefined
    const quadro = scena ? stile.quadri[scena.quadro] : undefined
    if (!tratto || !scena || !quadro) return true
    const slot = this.slot[this.attivo]
    const info = dellaSorgente(dati.sorgenti, tratto)
    const pronto = (el: HTMLVideoElement) => haSorgente(el) && el.readyState >= 2 && el.videoWidth > 0
    // Finché il video del tratto non ha un fotogramma si lascia quello di prima: niente lampi.
    if (haSorgente(slot.girato) && !pronto(slot.girato)) return false

    const palco = { larghezza: risolto.formato.largo, altezza: risolto.formato.alto }
    const scala = this.canvas.width / palco.larghezza
    ctx.setTransform(scala, 0, 0, scala, 0, 0)
    ctx.fillStyle = colore(stile, quadro.fondo)
    ctx.fillRect(0, 0, palco.larghezza, palco.altezza)

    const sorgente = dellaSorgente(piano.sorgenti, tratto)
    const vista = tratto.vista ? sorgente?.viste?.[tratto.vista] : undefined
    const zoom = this.zoomProvvisorio?.tratto === k ? this.zoomProvvisorio.zoom : tratto.zoom
    const avanzamento = avanzamentoDelPezzo(risolto, k, secondo)
    const misure = info?.larghezza && info.altezza ? { larghezza: info.larghezza, altezza: info.altezza } : null
    const disegnaPosa = (el: HTMLVideoElement, posa: Posa, copia: Rett | null) => disegnaPosaSu(ctx, el, posa, copia)
    const interoOriginale: Rett | null = misure ? { x: 0, y: 0, w: misure.larghezza, h: misure.altezza } : null
    let areaGirato: Rett | null = null

    for (const strato of quadro.strati) {
      if (strato.tipo === "animazione") {
        const area = comeRett(strato.area)
        if (pronto(slot.anim)) ctx.drawImage(slot.anim, area.x, area.y, area.w, area.h)
        else this.segnaposto(ctx, quadro.fascia_animazione ? comeRett(quadro.fascia_animazione) : area, scena.animazione ? t("Animazione «{nome}»: non ancora resa", "Animation «{nome}»: not rendered yet", { nome: scena.animazione }) : t("Scena «{nome}»: senza animazione", "Scene «{nome}»: no animation", { nome: scena.nome }), stile)
        continue
      }
      if (strato.tipo === "girato") {
        const area = comeRett(strato.area)
        areaGirato = area
        if (!misure || !interoOriginale || !pronto(slot.girato)) {
          this.segnaposto(ctx, area, t("Il file va preparato", "The file needs to be prepared"), stile)
          continue
        }
        const contieni = contieniLaVista(strato, vista !== undefined)
        const f = finestraGirato({ sorgente: misure, vista: vista?.taglio ?? null, area, centro: strato.centro ?? [0.5, 0.5], zoom, avanzamento, contieni })
        ctx.save()
        ctx.beginPath()
        ctx.rect(area.x, area.y, area.w, area.h)
        ctx.clip()
        disegnaPosa(slot.girato, posaNellArea(area, f, contieni), interoOriginale)
        ctx.restore()
        continue
      }
      if (strato.tipo === "sagoma") {
        if (!pronto(slot.sagoma)) continue
        this.disegnaSagoma(ctx, strato, tratto, slot.sagoma, palco)
        continue
      }
      if (strato.tipo === "riquadro") {
        const rettangolo = sorgente?.riquadri?.[strato.nome]
        if (!rettangolo || !interoOriginale || !pronto(slot.girato)) continue
        const posa = posaRiquadro(strato, rettangolo, palco)
        const d = posa.destinazione
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(d.x, d.y, d.w, d.h, strato.raggio)
        ctx.clip()
        disegnaPosa(slot.girato, posa, interoOriginale)
        ctx.restore()
        continue
      }
      if (strato.tipo === "viso") {
        const rettangolo = sorgente?.riquadri?.[strato.nome]
        if (!rettangolo || !interoOriginale || !pronto(slot.girato)) continue
        const posa = posaViso(strato, rettangolo, palco)
        const d = posa.destinazione
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(d.x, d.y, d.w, d.h, strato.raggio)
        ctx.clip()
        disegnaPosa(slot.girato, posa, interoOriginale)
        ctx.restore()
        continue
      }
      const rettangolo = vista?.inserto
      if (!rettangolo || !areaGirato || !interoOriginale || !pronto(slot.girato)) continue
      disegnaPosa(slot.girato, posaInserto(strato, areaGirato, rettangolo), interoOriginale)
    }
    this.testi.disegna(ctx, dati, secondo)
    return true
  }

  // La scala della sagoma è una per video: la decide la ripresa con la testa più in basso fra tutti i tratti che usano questo strato.
  private scalaSagoma(strato: Extract<Strato, { tipo: "sagoma" }>, dati: DatiPiano, palco: Misure): number | null {
    const chiave = JSON.stringify(strato)
    const trovata = this.scale.get(chiave)
    if (trovata !== undefined) return trovata
    const teste: MisuraTesta[] = []
    let tutte = true
    for (const t of dati.risolto.tratti) {
      const quadro = dati.stile.quadri[dati.risolto.scene[t.scena]?.quadro ?? ""]
      const nome = t.sagoma?.sorgente ?? t.sorgente
      if (!quadro || nome === null || JSON.stringify(stratoDi(quadro, "sagoma")) !== chiave) continue
      const testa = dati.teste[nome]
      if (testa) teste.push(testa)
      else tutte = false
    }
    const scala = tutte ? scalaDellaSagoma(strato, palco, teste) : null
    this.scale.set(chiave, scala)
    return scala
  }

  private disegnaSagoma(ctx: CanvasRenderingContext2D, strato: Extract<Strato, { tipo: "sagoma" }>, tratto: Tratto, el: HTMLVideoElement, palco: Misure): void {
    const dati = this.dati!
    const nome = tratto.sagoma?.sorgente ?? tratto.sorgente
    const testa = nome === null ? undefined : dati.teste[nome]
    const scala = testa ? this.scalaSagoma(strato, dati, palco) : null
    const intera: Rett = { x: 0, y: 0, w: el.videoWidth, h: el.videoHeight }
    if (!testa || scala === null) {
      disegnaPosaSu(ctx, el, posaSagoma(strato, { larghezza: el.videoWidth, altezza: el.videoHeight }, palco), intera)
      return
    }
    const posa = posaSagomaMisurata(strato, scala, testa, palco)
    if (posa.sfuma <= 0) {
      disegnaPosaSu(ctx, el, posa, { x: 0, y: 0, w: palco.larghezza, h: palco.altezza })
      return
    }
    // Il bordo destro, che è quello dritto del girato, svanisce nel sotto: la sagoma si compone a parte e si toglie la rampa.
    const lavagna = this.lavagna ?? (this.lavagna = document.createElement("canvas"))
    if (lavagna.width !== this.canvas.width || lavagna.height !== this.canvas.height) {
      lavagna.width = this.canvas.width
      lavagna.height = this.canvas.height
    }
    const l = lavagna.getContext("2d")
    if (!l) return
    l.setTransform(1, 0, 0, 1, 0, 0)
    l.clearRect(0, 0, lavagna.width, lavagna.height)
    l.setTransform(this.canvas.width / palco.larghezza, 0, 0, this.canvas.width / palco.larghezza, 0, 0)
    disegnaPosaSu(l, el, posa, { x: 0, y: 0, w: palco.larghezza, h: palco.altezza })
    const { x, w } = posa.destinazione
    const rampa = l.createLinearGradient(x + w - posa.sfuma, 0, x + w - 1, 0)
    rampa.addColorStop(0, "rgba(0, 0, 0, 1)")
    rampa.addColorStop(1, "rgba(0, 0, 0, 0)")
    l.globalCompositeOperation = "destination-in"
    l.fillStyle = rampa
    l.fillRect(0, 0, palco.larghezza, palco.altezza)
    l.globalCompositeOperation = "source-over"
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(lavagna, 0, 0)
    ctx.restore()
  }

  private segnaposto(ctx: CanvasRenderingContext2D, area: Rett, testo: string, stile: Stile): void {
    ctx.save()
    ctx.globalAlpha = 0.1
    ctx.fillStyle = colore(stile, "inchiostro")
    ctx.fillRect(area.x, area.y, area.w, area.h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = colore(stile, "inchiostro")
    ctx.lineWidth = 3
    ctx.setLineDash([16, 12])
    ctx.strokeRect(area.x + 1.5, area.y + 1.5, area.w - 3, area.h - 3)
    ctx.setLineDash([])
    ctx.fillStyle = colore(stile, "inchiostro")
    ctx.font = "500 46px 'Instrument Sans', sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(testo, area.x + area.w / 2, area.y + area.h / 2, area.w - 40)
    ctx.restore()
  }
}
