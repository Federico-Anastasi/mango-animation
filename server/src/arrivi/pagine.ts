// Ciò che le pagine del ricevitore hanno in comune: l'escape del testo, lo stile di base (colori, carattere, margini) e la lingua.
import type { Lingua } from "../lingua"

export const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Un valore da mettere dentro uno `<script>`: JSON in cui `<` non può chiudere il tag. */
export const inScript = (valore: unknown): string => JSON.stringify(valore).replace(/</g, "\u003c")

/** Per le date e i numeri che la pagina scrive. */
export const localeDi = (lingua: Lingua): string => (lingua === "en" ? "en-GB" : "it-IT")

export const STILE_BASE = `:root{--carta:#F1F0EB;--scura:#E4E2D9;--inchiostro:#17171B;--rosso:#E03A1E;--grigio:#5F5D56;--filo:#CBC8BD}
@media (prefers-color-scheme:dark){:root{--carta:#17171B;--scura:#232328;--inchiostro:#F1F0EB;--grigio:#A8A69D;--filo:#3A3A40}}
*{box-sizing:border-box}
body{margin:0;background:var(--carta);color:var(--inchiostro);font:17px/1.45 -apple-system,system-ui,sans-serif;padding:20px 16px 48px;max-width:640px;margin-inline:auto}`
