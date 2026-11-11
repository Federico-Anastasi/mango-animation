// Le regole del metodo: quelle di ogni passo si caricano sempre, quelle che servono a pochi passi le legge la skill di quei passi.
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dir, "..", "..")
const leggi = (relativo: string): string => readFileSync(join(REPO, relativo), "utf8")
const skill = (nome: string): string => leggi(join(".claude", "skills", nome, "SKILL.md"))
const skills = readdirSync(join(REPO, ".claude", "skills"))
const metodo = readdirSync(join(REPO, ".claude", "metodo"))
const regole = readdirSync(join(REPO, ".claude", "rules"))
/** Tutto ciò che Claude legge come istruzioni: ciò che cita deve esistere. */
const istruzioni = (): Record<string, string> => ({
  "CLAUDE.md": leggi("CLAUDE.md"),
  ...Object.fromEntries(skills.map((s) => [`.claude/skills/${s}/SKILL.md`, skill(s)])),
  ...Object.fromEntries(metodo.map((f) => [`.claude/metodo/${f}`, leggi(join(".claude", "metodo", f))])),
  ...Object.fromEntries(regole.map((f) => [`.claude/rules/${f}`, leggi(join(".claude", "rules", f))])),
})

describe("le regole del metodo", () => {
  test("sempre caricate solo quelle di ogni passo; quella di chi sviluppa solo sui file del codice", () => {
    expect(readdirSync(join(REPO, ".claude", "rules")).sort()).toEqual(["codice.md", "processo.md"])
    const codice = leggi(join(".claude", "rules", "codice.md"))
    const percorsi = /^---\npaths:\n((?:  - "[^"]+"\n)+)---\n/.exec(codice.replaceAll("\r\n", "\n"))?.[1]
    expect(percorsi?.match(/"([^"]+)"/g)?.map((p) => p.slice(1, -1))).toEqual(["motore/**", "animazioni/**", "server/**", "studio/**", "app/**", "strumenti/**", "docs/**"])
  })

  test("quelle di un passo solo le legge la skill di quel passo", () => {
    const chiLegge = (file: string) => skills.filter((s) => skill(s).includes(`.claude/metodo/${file}`)).sort()
    expect(metodo.sort()).toEqual(["animazioni.md", "contenuto.md", "montaggio.md", "quadro-e-sagoma.md", "taglio-e-voce.md", "tiktok.md", "youtube.md"])
    expect(chiLegge("montaggio.md")).toEqual(["controlla", "copione", "monta", "proponi", "scena"])
    expect(chiLegge("contenuto.md")).toEqual(["carosello", "copione", "proponi", "pubblicazione", "testo"])
    expect(chiLegge("taglio-e-voce.md")).toEqual(["controlla", "monta", "testo"])
    expect(chiLegge("quadro-e-sagoma.md")).toEqual(["controlla", "monta"])
    expect(chiLegge("animazioni.md")).toEqual(["scena"])
    expect(chiLegge("tiktok.md")).toEqual(["controlla", "copertina", "copione", "monta", "scena"])
    expect(chiLegge("youtube.md")).toEqual(["copione", "monta", "proponi", "pubblicazione"])
  })

  test("ogni passo del processo ha la sua skill, e ogni skill del processo è in un passo", () => {
    const tabella = leggi(join(".claude", "rules", "processo.md"))
    const dellaTabella = new Set([...tabella.matchAll(/^\| \d\. [^|]+\|[^|]+\|([^|]+)\|$/gm)].flatMap((m) => [...m[1]!.matchAll(/`([a-z-]+)`/g)].map((n) => n[1]!)))
    expect([...dellaTabella].sort()).toEqual(["controlla", "copertina", "copione", "monta", "proponi", "prova", "pubblicazione", "scena", "testo"])
    for (const nome of dellaTabella) expect(skills).toContain(nome)
  })

  test("ogni skill, file del metodo, regola e documento citati dalle istruzioni esistono, e le sezioni citate sono titoli di quel file", () => {
    const mancanti: string[] = []
    for (const [dove, grezzo] of Object.entries(istruzioni())) {
      const testo = grezzo.replace(/\s+/g, " ")
      for (const m of testo.matchAll(/skills? `([a-z-]+)`/g)) if (!skills.includes(m[1]!)) mancanti.push(`${dove}: la skill ${m[1]}`)
      for (const m of testo.matchAll(/`((?:docs|animazioni|strumenti|motore|\.claude\/(?:rules|metodo))\/[A-Za-z0-9\/-]+\.md)`(?:,| \()? ?«([^»]+)»/g)) {
        const [, file, sezione] = m
        if (!existsSync(join(REPO, file!))) continue
        const contenuto = leggi(file!)
        const titoli = [...contenuto.matchAll(/^#+ (.+)$/gm), ...contenuto.matchAll(/\*\*([^*]+?)\.?\*\*/g)].map((t) => t[1]!.replace(/`/g, "").toLowerCase())
        if (!titoli.some((t) => t.includes(sezione!.toLowerCase()))) mancanti.push(`${dove}: la sezione «${sezione}» di ${file}`)
      }
      for (const m of testo.matchAll(/`((?:docs|animazioni|strumenti|\.claude\/(?:rules|metodo))\/[A-Za-z0-9\/-]+\.md)`/g)) if (!existsSync(join(REPO, m[1]!))) mancanti.push(`${dove}: il file ${m[1]}`)
    }
    expect(mancanti).toEqual([])
  })

  test("ogni regola citata da skill, regole e CLAUDE.md esiste", () => {
    const testi = [leggi("CLAUDE.md"), ...skills.map(skill), ...readdirSync(join(REPO, ".claude", "rules")).map((f) => leggi(join(".claude", "rules", f)))]
    const citate = new Set(testi.flatMap((t) => [...t.matchAll(/\.claude\/(?:rules|metodo)\/[a-z-]+\.md/g)].map((m) => m[0])))
    expect([...citate]).toEqual(expect.arrayContaining([".claude/metodo/montaggio.md", ".claude/metodo/taglio-e-voce.md", ".claude/metodo/youtube.md"]))
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

/** Ogni file di testo e di codice del repo, senza ciò che non è nostro (dipendenze, costruzioni, copie di lavoro). */
const fileDelRepo = (): string[] => {
  const escluse = /(^|\/)(node_modules|target|dist|\.git|worktrees|__pycache__|foto)\//
  const estensioni = /\.(md|ts|tsx|rs|py|mjs|js|yml|toml|html)$/
  return [...new Bun.Glob("**/*").scanSync({ cwd: REPO, onlyFiles: true, dot: true })].map((f) => f.replaceAll("\\", "/")).filter((f) => !escluse.test(f) && estensioni.test(f))
}

describe("i rimandi ai documenti", () => {
  const titoliDi = (file: string): string[] => {
    const contenuto = leggi(file)
    return [...contenuto.matchAll(/^#+ (.+)$/gm), ...contenuto.matchAll(/\*\*([^*]+?)\.?\*\*/g)].map((t) => t[1]!.replace(/`/g, "").toLowerCase())
  }
  /** Una riga a capo dentro un commento o un elenco non spezza un rimando. */
  const unita = (grezzo: string): string => grezzo.replace(/\s*\n\s*(?:\/\/[\/!]?\s*|#\s+|\*\s+)?/g, " ")

  test("ogni documento citato con la sua sezione (o il suo paragrafo) esiste, e la sezione è un titolo di quel file", () => {
    const rotti: string[] = []
    let controllati = 0
    for (const dove of fileDelRepo()) {
      const testo = unita(leggi(dove))
      for (const m of testo.matchAll(/(?<![\w\/.-])`?(docs\/[A-Za-z0-9_\/-]+\.md)`?[,:]?\s?\(?(?:«([^»]+)»|§(\d+))/g)) {
        const [, file, sezione, numero] = m
        controllati++
        if (!existsSync(join(REPO, file!))) {
          rotti.push(`${dove}: manca il file ${file}`)
          continue
        }
        if (sezione !== undefined && !titoliDi(file!).some((t) => t.includes(sezione.toLowerCase()))) rotti.push(`${dove}: la sezione «${sezione}» non è in ${file}`)
        if (numero !== undefined && !new RegExp(`^#+ ${numero}\\. `, "m").test(leggi(file!))) rotti.push(`${dove}: la sezione §${numero} non è in ${file}`)
      }
    }
    expect(controllati).toBeGreaterThan(100)
    expect(rotti).toEqual([])
  })

  test("ogni documento nominato fra apici esiste", () => {
    const mancanti: string[] = []
    for (const dove of fileDelRepo()) {
      for (const m of leggi(dove).matchAll(/(?<![\w\/.-])`(docs\/[A-Za-z0-9_\/-]+\.md)`(?!\]\(http)/g)) if (!existsSync(join(REPO, m[1]!))) mancanti.push(`${dove}: ${m[1]}`)
    }
    expect(mancanti).toEqual([])
  })
})
