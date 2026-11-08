// Le regole del metodo: quelle di ogni passo si caricano sempre, quelle di un passo solo le legge la skill di quel passo.
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dir, "..", "..")
const leggi = (relativo: string): string => readFileSync(join(REPO, relativo), "utf8")
const skill = (nome: string): string => leggi(join(".claude", "skills", nome, "SKILL.md"))
const skills = readdirSync(join(REPO, ".claude", "skills"))

describe("le regole del metodo", () => {
  test("sempre caricate solo quelle di ogni passo; quella di chi sviluppa solo sui file del codice", () => {
    expect(readdirSync(join(REPO, ".claude", "rules")).sort()).toEqual(["codice.md", "contenuto.md", "montaggio.md", "processo.md"])
    const codice = leggi(join(".claude", "rules", "codice.md"))
    const percorsi = /^---\npaths:\n((?:  - "[^"]+"\n)+)---\n/.exec(codice.replaceAll("\r\n", "\n"))?.[1]
    expect(percorsi?.match(/"([^"]+)"/g)?.map((p) => p.slice(1, -1))).toEqual(["motore/**", "animazioni/**", "server/**", "studio/**", "app/**", "strumenti/**", "docs/**"])
  })

  test("quelle di un passo solo le legge la skill di quel passo", () => {
    const chiLegge = (file: string) => skills.filter((s) => skill(s).includes(`.claude/metodo/${file}`)).sort()
    expect(readdirSync(join(REPO, ".claude", "metodo")).sort()).toEqual(["problemi-gia-visti.md", "youtube.md"])
    expect(chiLegge("problemi-gia-visti.md")).toEqual(["controlla", "copertina", "monta", "scena"])
    expect(chiLegge("youtube.md")).toEqual(["monta", "proponi", "pubblicazione"])
  })

  test("ogni regola citata da skill, regole e CLAUDE.md esiste", () => {
    const testi = [leggi("CLAUDE.md"), ...skills.map(skill), ...readdirSync(join(REPO, ".claude", "rules")).map((f) => leggi(join(".claude", "rules", f)))]
    const citate = new Set(testi.flatMap((t) => [...t.matchAll(/\.claude\/(?:rules|metodo)\/[a-z-]+\.md/g)].map((m) => m[0])))
    expect([...citate]).toEqual(expect.arrayContaining([".claude/rules/montaggio.md", ".claude/metodo/problemi-gia-visti.md", ".claude/metodo/youtube.md"]))
    expect([...citate].filter((c) => !existsSync(join(REPO, c)))).toEqual([])
  })
})
