// Ciò che le pagine del ricevitore hanno in comune: l'escape del testo, lo stile di base (colori, carattere, margini) e la lingua.
import { join } from "node:path"
import type { Lingua } from "../lingua"

export const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Un valore da mettere dentro uno `<script>`: JSON in cui `<` non può chiudere il tag. */
export const inScript = (valore: unknown): string => JSON.stringify(valore).replace(/</g, "\u003c")

/** Per le date e i numeri che la pagina scrive. */
export const localeDi = (lingua: Lingua): string => (lingua === "en" ? "en-GB" : "it-IT")

// I colori e le misure sono quelli di `suite/tokens.css`, letti una volta all'avvio; i file dei caratteri non si servono qui, e le pagine usano quelli del sistema.
const FILE_DEI_NOMI = join(import.meta.dir, "..", "..", "..", "suite", "tokens.css")
export const TOKENS = (await Bun.file(FILE_DEI_NOMI).text())
  .replace(/@font-face\s*\{[^}]*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .trim()

const CARATTERE = "-apple-system,system-ui,sans-serif"

export const STILE_BASE = `${TOKENS}
*{box-sizing:border-box}
body{margin:0;background:var(--mango-ground);color:var(--mango-text);font:16px/1.5 ${CARATTERE};padding:20px 16px 48px;max-width:640px;margin-inline:auto}
h1{font:700 23px/1.25 ${CARATTERE};letter-spacing:-.01em;margin:0 0 12px}
h2{font:700 17px/1.3 ${CARATTERE};margin:24px 0 8px}
p{margin:8px 0}
a{color:var(--mango-action-text)}
code{font-family:ui-monospace,monospace;font-size:.9em;background:var(--mango-raised);padding:2px 6px;border-radius:4px}
.piccolo{color:var(--mango-text-muted);font-size:14px}
:focus-visible{outline:2px solid var(--mango-action-text);outline-offset:2px}
.bottone{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--mango-line);border-radius:var(--mango-radius-control);background:var(--mango-raised);color:var(--mango-text);font:600 16px/1 ${CARATTERE};cursor:pointer;white-space:nowrap}
.bottone.principale{border-color:transparent;background:linear-gradient(to right,var(--mango-action),var(--mango-action-end));color:var(--mango-on-action)}
.bottone.fatto{color:var(--mango-ready)}`
