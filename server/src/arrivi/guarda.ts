// I video da guardare sul telefono, nel Wi-Fi di casa: una pagina con l'elenco e il file di ognuno, sul ricevitore degli arrivi e con la
// sua chiave. I montati: il file completo, con la copertina se c'è, altrimenti il montato. Le prove (`uscite/prova.mp4`, quelle da guardare
// prima di registrare): in una sezione a parte, anche per i video che non sono ancora montati.
import type { VoceVideo } from "../indice"
import { montatoDi } from "../montato"
import { esc, STILE_BASE } from "./pagine"

export interface VideoDaGuardare {
  /** «montato» è il video finito; «prova» è la prova prima di registrare; «copione» è la pagina da leggere mentre si registra. */
  genere: "montato" | "prova" | "copione"
  slug: string
  titolo: string
  /** Relativo all'archivio. */
  file: string
  cambiato: string
}

const PROVA = "prova.mp4"
const COPIONE = "copione.html"

export function videoDaGuardare(voci: Iterable<VoceVideo>): VideoDaGuardare[] {
  return [...voci]
    .flatMap((v) => {
      const trova = (nomi: string[]) => nomi.map((nome) => v.uscite.find((u) => u.file === `video/${v.slug}/uscite/${nome}`)).find((u) => u !== undefined)
      const voce = (genere: VideoDaGuardare["genere"], uscita: { file: string; cambiato: string } | undefined): VideoDaGuardare[] =>
        uscita ? [{ genere, slug: v.slug, titolo: v.scheda?.titolo ?? v.slug, file: uscita.file, cambiato: uscita.cambiato }] : []
      return [...voce("montato", montatoDi(v.uscite) ?? undefined), ...voce("prova", trova([PROVA])), ...voce("copione", trova([COPIONE]))]
    })
    .sort((a, b) => b.cambiato.localeCompare(a.cambiato))
}

const QUANDO = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })

export function paginaGuarda(video: VideoDaGuardare[], chiave: string): string {
  const k = encodeURIComponent(chiave)
  const elenco = (genere: VideoDaGuardare["genere"]) =>
    video
      .filter((v) => v.genere === genere)
      .map((v) => `<li><a href="/guarda/${genere === "montato" ? "" : `${genere}/`}${encodeURIComponent(v.slug)}.${genere === "copione" ? "html" : "mp4"}?chiave=${k}"><b>${esc(v.titolo)}</b><span>${esc(QUANDO.format(new Date(v.cambiato)))}</span></a></li>`)
      .join("")
  const righe = elenco("montato")
  const prove = elenco("prova")
  const copioni = elenco("copione")
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>I video di base</title>
<style>
${STILE_BASE}
h1{font-size:26px;margin:0 0 12px}ul{list-style:none;margin:0;padding:0}
li a{display:flex;flex-direction:column;gap:2px;padding:14px 0;border-top:1px solid var(--filo);color:inherit;text-decoration:none}
li span,p{color:var(--grigio);font-size:15px}
</style></head><body>
<h1>I video montati</h1>
${righe ? `<ul>${righe}</ul>` : "<p>Non c'è ancora nessun video montato.</p>"}
${copioni ? `<h1>Da registrare</h1><p>Le frasi da dire, da leggere sul telefono.</p><ul>${copioni}</ul>` : ""}
${prove ? `<h1>Le prove</h1><p>Prima di registrare: il copione e le animazioni.</p><ul>${prove}</ul>` : ""}
</body></html>`
}
