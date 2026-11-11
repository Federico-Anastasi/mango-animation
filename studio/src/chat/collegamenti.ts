// Nelle risposte, il nome di un video e i percorsi della sua cartella diventano collegamenti che aprono la vista nello studio.
import { scriviIndirizzo, type SchedaVideo } from "../indirizzo"

export type Pezzo = string | { testo: string; href: string }

const sfuggi = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Una parola sola e corta ("ai") nel discorso non è quasi mai il video: il nome da solo si collega se è lungo o ha un trattino. */
const nomeRiconoscibile = (slug: string) => slug.length >= 5 || slug.includes("-")

export function schedaDelFile(resto: string): SchedaVideo | undefined {
  if (resto === "/uscite/prova.mp4") return "prova"
  if (resto === "/uscite/finale.mp4") return "montaggio"
  if (/^\/uscite\/slide-\d+\.\w+$/.test(resto)) return "slide"
  if (/^\/materiali\/copertina/.test(resto) || /con-copertina/.test(resto)) return "copertina"
  if (/^\/(piano|lavoro\/|storia\/)/.test(resto)) return "montaggio"
  if (/^\/scheda\.json/.test(resto)) return "scheda"
  if (/^\/(uscite|materiali)(\/|$)/.test(resto)) return "file"
  return undefined
}

export function creaCollegatore(slugs: readonly string[]): (testo: string) => Pezzo[] {
  const noti = [...new Set(slugs)].sort((a, b) => b.length - a.length)
  if (noti.length === 0) return (testo) => [testo]
  const alternativa = noti.map(sfuggi).join("|")
  const bare = noti.filter(nomeRiconoscibile).map(sfuggi).join("|")
  const percorso = String.raw`archivio/video/(${alternativa})((?:/[^\s"'\x60)\]]*)?)`
  const re = new RegExp(String.raw`(?<![\w/-])(?:${percorso}${bare ? `|(${bare})` : ""})(?![\w-])`, "g")
  return (testo) => {
    const pezzi: Pezzo[] = []
    let ultimo = 0
    for (const m of testo.matchAll(re)) {
      const slug = m[1] ?? m[3]
      if (slug === undefined) continue
      // Un punto o una virgola in fondo al percorso sono della frase.
      const trovato = m[0].replace(/[.,;:]+$/, "")
      if (m.index > ultimo) pezzi.push(testo.slice(ultimo, m.index))
      pezzi.push({ testo: trovato, href: scriviIndirizzo({ vista: "video", slug, scheda: m[1] === undefined ? undefined : schedaDelFile(m[2] ?? "") }) })
      ultimo = m.index + trovato.length
    }
    if (ultimo < testo.length) pezzi.push(testo.slice(ultimo))
    return pezzi
  }
}
