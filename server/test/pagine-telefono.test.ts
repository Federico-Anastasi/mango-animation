// Le pagine che il server manda al telefono prendono colori e raggi dai nomi comuni di `suite/tokens.css`, nei due temi, e hanno controlli da toccare con un dito.
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { senzaChiave } from "../src/accesso"
import { paginaCarica } from "../src/arrivi/carica"
import { paginaGuarda, type VideoDaGuardare } from "../src/arrivi/guarda"
import { paginaInstallazione } from "../src/arrivi/pagina"
import { TOKENS } from "../src/arrivi/pagine"
import { serviStudio } from "../src/media"

const VIDEO: VideoDaGuardare[] = [
  { genere: "montato", slug: "uno", titolo: "Il primo", file: "video/uno/uscite/con-copertina.mp4", cambiato: "2026-10-08T10:00:00" },
  { genere: "prova", slug: "due", titolo: "Il secondo", file: "video/due/uscite/prova.mp4", cambiato: "2026-10-07T10:00:00" },
  { genere: "copione", slug: "due", titolo: "Il secondo", file: "video/due/uscite/copione.html", cambiato: "2026-10-07T09:00:00" },
]

const intestazioniHtml = { headers: { accept: "text/html" } }

async function pagine(): Promise<Array<[string, string]>> {
  const nonCostruito = await serviStudio(new Request("http://127.0.0.1/", intestazioniHtml), join(import.meta.dir, "cartella-che-non-esiste"), "/")
  return [
    ["guarda", paginaGuarda(VIDEO, "chiave-di-prova", "it")],
    ["guarda in inglese", paginaGuarda([], "chiave-di-prova", "en")],
    ["carica", paginaCarica("chiave-di-prova", "it")],
    ["installazione", paginaInstallazione({ indirizzoRicezione: "http://192.0.2.10:47600/arrivi/contenuti-video?chiave=chiave-di-prova", limiteGb: 4 }, "it")],
    ["senza chiave", await senzaChiave(new Request("http://127.0.0.1/", intestazioniHtml)).text()],
    ["studio da costruire", await nonCostruito.text()],
  ]
}

const stile = (html: string): string => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")

describe("le pagine del telefono", () => {
  test("i colori e i raggi vengono dai nomi comuni, per i due temi", async () => {
    for (const [nome, html] of await pagine()) {
      const css = stile(html)
      expect(css, nome).toContain("--mango-ground")
      expect(css, nome).toContain("prefers-color-scheme: dark")
      expect(css, nome).toContain('data-mango-theme="dark"')
      expect(css, nome).toContain("var(--mango-text)")
      expect(css, nome).toContain(TOKENS)
    }
  })

  test("i caratteri restano quelli del sistema: nessun file di carattere da scaricare", async () => {
    for (const [nome, html] of await pagine()) {
      expect(html, nome).not.toContain("@font-face")
      expect(html, nome).not.toContain("fonts/")
    }
  })

  test("l'unico bottone principale è «Carica video»; le altre pagine non ne hanno", async () => {
    const principali = (html: string): number => (html.match(/class="[^"]*\bprincipale\b/g) ?? []).length
    const tutte = new Map(await pagine())
    expect(principali(tutte.get("carica")!)).toBe(1)
    expect(tutte.get("carica")).toMatch(/class="[^"]*bottone principale[^"]*"[^>]*>Carica video/)
    for (const nome of ["guarda", "installazione", "senza chiave", "studio da costruire"]) expect(principali(tutte.get(nome)!), nome).toBe(0)
  })

  test("ciò che si tocca è alto almeno 44 px", async () => {
    const tutte = new Map(await pagine())
    expect(stile(tutte.get("carica")!)).toMatch(/\.bottone\{[^}]*min-height:44px/)
    expect(stile(tutte.get("installazione")!)).toMatch(/\.campo input\{[^}]*min-height:44px/)
    expect(stile(tutte.get("guarda")!)).toMatch(/li a\{[^}]*min-height:44px/)
  })

  test("un errore è rosso e il resto neutro: il rosso non è il bottone", async () => {
    const carica = stile(paginaCarica("chiave-di-prova", "it"))
    expect(carica).toMatch(/\.no \.dati\{[^}]*var\(--mango-error\)/)
    expect(carica).not.toMatch(/\.bottone[^{]*\{[^}]*var\(--mango-error\)/)
  })
})
