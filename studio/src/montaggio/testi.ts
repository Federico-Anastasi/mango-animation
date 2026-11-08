// Sottotitoli e titolo disegnati sulla tela dell'anteprima «Piano», con lo stesso carattere (il file del motore), gli
// stessi a capo e gli stessi istanti del montato: la scelta di cosa si vede è di `cartelli.ts`, qui si misura e si disegna.
import type { Stile } from "../tipi"
import { cartelliDelTitolo, disponi, fotogrammaA, misureVisibili, postoDelCartello, schedaCartello, sottotitoloAl, titoloAl, type Disposizione, type Misura, type Scheda } from "./cartelli"
import type { DatiPiano } from "./motore"

export class Testi {
  private readonly caricati = new Set<string>()
  private readonly inCarico = new Set<string>()
  private readonly disposizioni = new Map<string, Disposizione>()

  constructor(private readonly alCambio: () => void) {}

  /** La famiglia da usare per un carattere dello stile: il suo file, servito dal server, appena è arrivato; prima, un carattere qualunque. */
  private famiglia(stile: Stile, chiave: string): string {
    const file = stile.caratteri[chiave]
    if (file === undefined) throw new Error(`Il carattere «${chiave}» non è nello stile.`)
    const nome = `mango:${file}`
    if (this.caricati.has(nome)) return `"${nome}"`
    if (!this.inCarico.has(nome)) {
      this.inCarico.add(nome)
      const carattere = new FontFace(nome, `url("/font/${encodeURI(file.replace(/^font\//, ""))}")`)
      carattere
        .load()
        .then(() => {
          document.fonts.add(carattere)
          this.caricati.add(nome)
          this.disposizioni.clear()
          this.alCambio()
        })
        .catch((e: unknown) => console.warn(`Il carattere «${file}» dei testi non si è caricato:`, e))
    }
    return "sans-serif"
  }

  private disposizione(ctx: CanvasRenderingContext2D, famiglia: string, testo: string, scheda: Scheda): Disposizione {
    const chiave = `${famiglia}|${testo}|${JSON.stringify(scheda)}`
    const trovata = this.disposizioni.get(chiave)
    if (trovata) return trovata
    const d = disponi(testo, scheda, misuraCon(ctx, famiglia))
    this.disposizioni.set(chiave, d)
    return d
  }

  /** I sottotitoli e il titolo al secondo `t`, sopra tutto il resto, nelle misure del palco (la tela è già in scala). */
  disegna(ctx: CanvasRenderingContext2D, dati: DatiPiano, t: number): void {
    const { risolto, stile, piano } = dati
    const f = fotogrammaA(t, risolto.formato.fps)
    const modo = piano.sottotitoli?.modo ?? stile.sottotitoli.modo
    const sott = sottotitoloAl(risolto, stile, modo, f)
    if (sott) {
      const famiglia = this.famiglia(stile, stile.sottotitoli.carattere)
      const scheda = schedaCartello(stile, "sottotitoli", sott.spec)
      const d = this.disposizione(ctx, famiglia, sott.battuta.testo, scheda)
      const { x, y } = postoDelCartello(sott.spec, d.largo, d.alto)
      disegnaCartello(ctx, famiglia, d, scheda, x, y - sott.sopra, sott.dette)
    }
    const quadro = titoloAl(risolto, stile, f)
    if (quadro && risolto.titolo) {
      const famiglia = this.famiglia(stile, stile.titolo.carattere)
      for (const c of cartelliDelTitolo(stile, quadro, risolto.titolo, misuraCon(ctx, famiglia))) disegnaCartello(ctx, famiglia, c.disposizione, c.scheda, c.x, c.y, null)
    }
  }
}

const misuraCon =
  (ctx: CanvasRenderingContext2D, famiglia: string): Misura =>
  (testo, corpo) => {
    ctx.font = `${corpo}px ${famiglia}`
    ctx.fontKerning = "none"
    return ctx.measureText(testo).width
  }

/** Un cartello con le prime `dette` parole (tutte se `null`), con l'angolo in alto a sinistra in (`x`, `y`): il riquadro, il bordo, poi le parole col filo. */
function disegnaCartello(ctx: CanvasRenderingContext2D, famiglia: string, d: Disposizione, scheda: Scheda, x: number, y: number, dette: number | null): void {
  const visibile = misureVisibili(d, scheda, dette)
  if (!visibile) return
  ctx.save()
  ctx.translate(x, y)
  if (scheda.fondo !== null) {
    ctx.fillStyle = scheda.fondo
    ctx.fillRect(0, 0, visibile.largo, visibile.alto)
  }
  ctx.font = `${d.corpo}px ${famiglia}`
  // Il motore scrive senza la spaziatura fra coppie di lettere: le parole sono larghe come le ha misurate.
  ctx.fontKerning = "none"
  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"
  ctx.lineJoin = "round"
  const sopraLaRiga = ctx.measureText("Ag").fontBoundingBoxAscent
  for (const p of visibile.parole) {
    const base = scheda.margine_alto + p.riga * d.passo + sopraLaRiga
    if (scheda.colore_contorno !== null) {
      ctx.lineWidth = scheda.contorno * 2
      ctx.strokeStyle = scheda.colore_contorno
      ctx.strokeText(p.testo, p.x, base)
    }
    ctx.fillStyle = p.correzione ? scheda.colore_correzione : scheda.colore
    ctx.fillText(p.testo, p.x, base)
  }
  if (scheda.bordo > 0) {
    ctx.lineWidth = scheda.bordo
    ctx.strokeStyle = scheda.colore
    ctx.strokeRect(scheda.bordo / 2, scheda.bordo / 2, visibile.largo - scheda.bordo, visibile.alto - scheda.bordo)
  }
  ctx.restore()
}
