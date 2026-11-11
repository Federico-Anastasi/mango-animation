// Le regole del metodo: quelle di ogni passo si caricano sempre, quelle che servono a pochi passi le legge la skill di quei passi.
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dir, "..", "..")
const leggi = (relativo: string): string => readFileSync(join(REPO, relativo), "utf8")
const skill = (nome: string): string => leggi(join(".claude", "skills", nome, "SKILL.md"))
const skills = readdirSync(join(REPO, ".claude", "skills"))

describe("le regole del metodo", () => {
  test("sempre caricate solo quelle di ogni passo; quella di chi sviluppa solo sui file del codice", () => {
    expect(readdirSync(join(REPO, ".claude", "rules")).sort()).toEqual(["codice.md", "processo.md"])
    const codice = leggi(join(".claude", "rules", "codice.md"))
    const percorsi = /^---\npaths:\n((?:  - "[^"]+"\n)+)---\n/.exec(codice.replaceAll("\r\n", "\n"))?.[1]
    expect(percorsi?.match(/"([^"]+)"/g)?.map((p) => p.slice(1, -1))).toEqual(["motore/**", "animazioni/**", "server/**", "studio/**", "app/**", "strumenti/**", "docs/**"])
  })

  test("quelle di un passo solo le legge la skill di quel passo", () => {
    const chiLegge = (file: string) => skills.filter((s) => skill(s).includes(`.claude/metodo/${file}`)).sort()
    expect(readdirSync(join(REPO, ".claude", "metodo")).sort()).toEqual(["contenuto.md", "montaggio.md", "problemi-gia-visti.md", "youtube.md"])
    expect(chiLegge("montaggio.md")).toEqual(["controlla", "monta", "proponi", "scena"])
    expect(chiLegge("contenuto.md")).toEqual(["carosello", "proponi", "pubblicazione", "testo"])
    expect(chiLegge("problemi-gia-visti.md")).toEqual(["controlla", "copertina", "monta", "scena"])
    expect(chiLegge("youtube.md")).toEqual(["monta", "proponi", "pubblicazione"])
  })

  test("ogni regola citata da skill, regole e CLAUDE.md esiste", () => {
    const testi = [leggi("CLAUDE.md"), ...skills.map(skill), ...readdirSync(join(REPO, ".claude", "rules")).map((f) => leggi(join(".claude", "rules", f)))]
    const citate = new Set(testi.flatMap((t) => [...t.matchAll(/\.claude\/(?:rules|metodo)\/[a-z-]+\.md/g)].map((m) => m[0])))
    expect([...citate]).toEqual(expect.arrayContaining([".claude/metodo/montaggio.md", ".claude/metodo/problemi-gia-visti.md", ".claude/metodo/youtube.md"]))
    expect([...citate].filter((c) => !existsSync(join(REPO, c)))).toEqual([])
  })

  test("la skill welcome rimanda agli stili di partenza di un file solo, e alle cartoline della pagina Stile, senza ripeterli", () => {
    const welcome = skill("welcome")
    expect(existsSync(join(REPO, "stili-di-partenza.json"))).toBe(true)
    expect(welcome).toContain("stili-di-partenza.json")
    expect(welcome).toContain("[Stile](#/impostazioni/stile)")
    expect(welcome.slice(welcome.indexOf("## 4. The style"), welcome.indexOf("## 5."))).not.toMatch(/#[0-9A-Fa-f]{6}/)
    expect(welcome).not.toContain("(#/stile)")
  })

  test("nessuna skill né regola nomina le voci di barra che non ci sono più", () => {
    const testi = [leggi("CLAUDE.md"), ...skills.map(skill), ...readdirSync(join(REPO, ".claude", "rules")).map((f) => leggi(join(".claude", "rules", f)))].join(" ")
    expect(testi).not.toMatch(/top bar|\*\*Motori\*\*|\*\*Stile\*\*/)
  })
})
