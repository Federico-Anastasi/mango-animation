// I controlli che l'interfaccia fa prima di mandare lo stile: ognuno dice nella lingua in uso cosa non va. Il server
// ne fa di suoi (per esempio che i quadri usati dai video restino): quelli arrivano come errore del salvataggio.
import { formatoDelQuadro } from "../montaggio/composizione"
import { t } from "../lingua"
import { nomeQuadro } from "../testo"
import { nomeStrato } from "./nomeStrato"
import type { Formato, Rettangolo, Stile } from "../tipi"

const ESADECIMALE = /^#[0-9a-fA-F]{6}$/

export function controllaStile(s: Stile): string[] {
  const errori: string[] = []
  const nota = (frase: string) => errori.push(frase)
  const positivo = (valore: number, nome: string) => valore > 0 || nota(t("{nome} deve essere maggiore di zero.", "{nome} must be greater than zero.", { nome }))
  const nonNegativo = (valore: number, nome: string) => valore >= 0 || nota(t("{nome} non può essere negativo.", "{nome} cannot be negative.", { nome }))
  const intero = (valore: number, nome: string) => Number.isInteger(valore) || nota(t("{nome} deve essere un numero intero.", "{nome} must be a whole number.", { nome }))
  const decibel = (valore: number, nome: string) => valore <= 0 || nota(t("{nome} è un livello in decibel: zero o negativo, per esempio -16.", "{nome} is a level in decibels: zero or negative, for example -16.", { nome }))
  const crf = (valore: number, nome: string) => (valore >= 0 && valore <= 51) || nota(t("{nome} va da 0 a 51: più è basso, più la qualità è alta.", "{nome} goes from 0 to 51: the lower it is, the higher the quality.", { nome }))
  const colore = (nome: string, dove: string) => nome in s.colori || nota(t("{dove}: il colore «{nome}» non è fra i colori dello stile.", "{dove}: the color «{nome}» is not among the style's colors.", { dove, nome }))

  positivo(s.formato.largo, t("La larghezza del fotogramma", "The frame width"))
  positivo(s.formato.alto, t("L'altezza del fotogramma", "The frame height"))
  positivo(s.formato.fps, t("I fotogrammi al secondo", "The frames per second"))
  for (const [nome, valore] of Object.entries(s.colori)) ESADECIMALE.test(valore) || nota(t("Il colore «{nome}» si scrive come #RRGGBB, per esempio #17171B.", "The color «{nome}» is written as #RRGGBB, for example #17171B.", { nome }))

  decibel(s.voce.lufs, t("Il volume della voce", "The voice volume"))
  decibel(s.voce.silenzio_db, t("La soglia del silenzio", "The silence threshold"))
  nonNegativo(s.voce.margine, t("Il margine della voce", "The voice margin"))

  const tg = s.taglio
  nonNegativo(tg.a_tempo.prima, t("Il margine prima, nei tagli a tempo", "The margin before, in timed cuts"))
  nonNegativo(tg.a_tempo.dopo, t("Il margine dopo, nei tagli a tempo", "The margin after, in timed cuts"))
  nonNegativo(tg.a_tempo.pausa, t("La pausa, nei tagli a tempo", "The pause, in timed cuts"))
  positivo(tg.a_tempo.tratto_minimo, t("Il tratto minimo", "The minimum segment"))
  nonNegativo(tg.a_parole.pausa, t("La pausa, nei tagli a parole", "The pause, in word cuts"))
  nonNegativo(tg.a_parole.stacco, t("Lo stacco, nei tagli a parole", "The gap, in word cuts"))
  nonNegativo(tg.a_parole.vicine, t("Le parole vicine", "The close words"))
  intero(tg.a_parole.vicine, t("Le parole vicine", "The close words"))

  const b = s.sottotitoli
  positivo(b.corpo, t("Il corpo dei sottotitoli", "The subtitle size"))
  positivo(b.corpo_minimo, t("Il corpo minimo dei sottotitoli", "The minimum subtitle size"))
  b.corpo_minimo <= b.corpo || nota(t("Il corpo minimo dei sottotitoli non può superare il corpo.", "The minimum subtitle size cannot exceed the size."))
  b.caratteri_per_battuta >= 1 || nota(t("Le battute hanno almeno un carattere.", "Lines have at least one character."))
  intero(b.caratteri_per_battuta, t("I caratteri per battuta", "The characters per line"))
  nonNegativo(b.stacco, t("Lo stacco dei sottotitoli", "The subtitle gap"))
  nonNegativo(b.bordo, t("Il bordo dei sottotitoli", "The subtitle border"))
  if (b.fondo !== null) colore(b.fondo, t("Sottotitoli, fondo", "Subtitles, background"))
  if (b.contorno !== undefined) nonNegativo(b.contorno, t("Il contorno dei sottotitoli", "The subtitle outline"))
  if (b.colore_contorno !== undefined) colore(b.colore_contorno, t("Sottotitoli, colore del contorno", "Subtitles, outline color"))
  colore(b.colore, t("Sottotitoli, colore", "Subtitles, color"))
  colore(b.colore_correzione, t("Sottotitoli, colore delle correzioni", "Subtitles, corrections color"))

  positivo(s.titolo.corpo, t("Il corpo del titolo", "The title size"))
  nonNegativo(s.titolo.margine, t("Il margine del titolo", "The title margin"))
  positivo(s.titolo.largo, t("La larghezza del titolo", "The title width"))
  s.titolo.largo <= Math.max(s.formato.largo, ...Object.values(s.formati ?? {}).map((f) => f.largo)) || nota(t("Il titolo non può essere più largo del fotogramma.", "The title cannot be wider than the frame."))
  colore(s.titolo.fondo, t("Titolo, fondo", "Title, background"))
  colore(s.titolo.colore, t("Titolo, colore", "Title, color"))

  decibel(s.suoni.fondo_db, t("Il livello dei suoni di fondo", "The level of the background sounds"))
  decibel(s.suoni.accento_db, t("Il livello dei suoni d'accento", "The level of the accent sounds"))

  crf(s.uscita.crf, t("La qualità del video", "The video quality"))
  positivo(s.uscita.audio_kbit, t("La qualità dell'audio", "The audio quality"))
  positivo(s.uscita.leggero.largo, t("La larghezza della copia leggera", "The light copy width"))
  positivo(s.uscita.leggero.alto, t("L'altezza della copia leggera", "The light copy height"))
  crf(s.uscita.leggero.crf, t("La qualità della copia leggera", "The light copy quality"))

  for (const [nome, f] of Object.entries(s.formati ?? {})) {
    positivo(f.largo, t("La larghezza del formato {nome}", "The width of format {nome}", { nome }))
    positivo(f.alto, t("L'altezza del formato {nome}", "The height of format {nome}", { nome }))
  }
  const dentroIlFotogramma = (r: Rettangolo, dove: string, formato: Formato) => {
    const [x, y, l, a] = r
    if (l <= 0 || a <= 0) nota(t("{dove}: larghezza e altezza devono essere maggiori di zero.", "{dove}: width and height must be greater than zero.", { dove }))
    else if (x < 0 || y < 0 || x + l > formato.largo || y + a > formato.alto) nota(t("{dove}: l'area esce dal fotogramma di {largo}×{alto}.", "{dove}: the area goes outside the {largo}×{alto} frame.", { dove, largo: formato.largo, alto: formato.alto }))
  }
  for (const [nome, q] of Object.entries(s.quadri)) {
    const dove = t("Quadro «{nome}»", "Layout «{nome}»", { nome: nomeQuadro(nome) })
    if (q.formato !== undefined && !s.formati?.[q.formato]) {
      nota(t("{dove}: il formato «{formato}» non è fra i formati dello stile.", "{dove}: the format «{formato}» is not among the style's formats.", { dove, formato: q.formato }))
      continue
    }
    const formato = formatoDelQuadro(s, q)
    colore(q.fondo, t("{dove}, fondo", "{dove}, background", { dove }))
    for (const strato of q.strati) {
      if (strato.tipo === "animazione" || strato.tipo === "girato") dentroIlFotogramma(strato.area, `${dove}, ${nomeStrato(strato.tipo)}`, formato)
      if (strato.tipo === "sagoma") positivo(strato.scala_minima, t("{dove}, la scala della sagoma", "{dove}, the silhouette scale", { dove }))
      if (strato.tipo === "riquadro") positivo(strato.scala, t("{dove}, la scala del riquadro", "{dove}, the box scale", { dove }))
      if (strato.tipo === "inserto") positivo(strato.largo, t("{dove}, la larghezza dell'inserto", "{dove}, the inset width", { dove }))
      if (strato.tipo === "viso") positivo(strato.largo, t("{dove}, la larghezza del viso", "{dove}, the face width", { dove }))
    }
    positivo(q.sottotitoli.largo, t("{dove}, la larghezza dei sottotitoli", "{dove}, the subtitle width", { dove }))
    if (q.fascia_animazione) dentroIlFotogramma(q.fascia_animazione, t("{dove}, la fascia dell'animazione", "{dove}, the animation band", { dove }), formato)
  }
  return errori
}
