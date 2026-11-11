import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DA_PORTARE, ELENCO, escluso, prepara } from "./prepara"

const temporanee: string[] = []
afterEach(async () => {
  for (const t of temporanee.splice(0)) await rm(t, { recursive: true, force: true })
})

async function repoFinto(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "repo-finto-"))
  temporanee.push(repo)
  const file = async (relativo: string) => {
    await mkdir(join(repo, relativo, ".."), { recursive: true })
    await writeFile(join(repo, relativo), "x")
  }
  for (const f of [
    "CLAUDE.md", "LEGGIMI.md", "LICENSE", "NOTICE.md", "TRADEMARKS.md", "AVVISI-DI-TERZI.md", "stile.json", "stili-di-partenza.json", "font/a.ttf", "motore/__main__.py", "motore/monta.py", "motore/__pycache__/monta.pyc", "motore/prove/test_monta.py",
    "strumenti/x.py", "server/package.json", "server/src/avvia.ts", "server/node_modules/z/i.js", "server/test/chat.test.ts", "animazioni/package.json", "animazioni/dist/index.html",
    "animazioni/node_modules/q/i.js", "animazioni/foto/f.png", "animazioni/test/t.ts", "studio/dist/index.html", "studio/src/App.tsx", ".claude/rules/montaggio.md", ".claude/skills/monta/SKILL.md",
    ".claude/metodo/problemi.md", ".claude/settings.local.json", ".claude/worktrees/a/x", "docs/APP.md", "appunti/piano.md", "app/Cargo.toml", "archivio/video/a/scheda.json",
    ".claude-plugin/plugin.json", "plugin/hooks.json", "plugin/mcp.ts",
  ]) await file(f)
  return repo
}

const tutti = async (cartella: string, base = ""): Promise<string[]> =>
  (await Promise.all((await readdir(join(cartella, base), { withFileTypes: true })).map(async (v) => (v.isDirectory() ? tutti(cartella, `${base}${v.name}/`) : [`${base}${v.name}`])))).flat().sort()

describe("il codice che l'installatore porta", () => {
  test("ci sono il metodo, il motore, il server, le animazioni e lo studio costruito; non ci sono i pacchetti, le prove, i dati né le impostazioni di nessuno", async () => {
    const repo = await repoFinto()
    const destinazione = await mkdtemp(join(tmpdir(), "codice-"))
    temporanee.push(destinazione)
    await prepara(repo, destinazione)
    expect(await tutti(destinazione)).toEqual([
      ".mango-elenco.json", ".claude-plugin/plugin.json", "plugin/hooks.json", "plugin/mcp.ts",
      ".claude/metodo/problemi.md", ".claude/rules/montaggio.md", ".claude/skills/monta/SKILL.md", "AVVISI-DI-TERZI.md", "CLAUDE.md", "LEGGIMI.md", "LICENSE", "NOTICE.md", "TRADEMARKS.md", "animazioni/dist/index.html", "animazioni/package.json",
      "docs/APP.md", "font/a.ttf", "motore/__main__.py", "motore/monta.py", "server/package.json", "server/src/avvia.ts", "strumenti/x.py", "studio/dist/index.html", "stile.json", "stili-di-partenza.json",
    ].sort())
  })

  test("ciò che il metodo sa trovare nel codice sta nella lista, e il codice trovato dall'app (CLAUDE.md e server/) c'è", async () => {
    const repo = await repoFinto()
    const destinazione = await mkdtemp(join(tmpdir(), "codice-"))
    temporanee.push(destinazione)
    await prepara(repo, destinazione)
    expect((await stat(join(destinazione, "CLAUDE.md"))).isFile() && (await stat(join(destinazione, "server"))).isDirectory()).toBe(true)
    expect((await stat(join(destinazione, "motore", "__main__.py"))).isFile()).toBe(true)
    expect(DA_PORTARE).toContain("AVVISI-DI-TERZI.md")
  })

  test("ogni file e cartella di primo livello del repo o si porta o è detto qui che resta fuori: uno nuovo non si dimentica", () => {
    const repo = join(import.meta.dir, "..", "..")
    const git = Bun.spawnSync(["git", "ls-tree", "--name-only", "HEAD"], { cwd: repo })
    expect(git.exitCode).toBe(0)
    // Di `.claude` e di `studio` si porta solo una parte, scritta in DA_PORTARE.
    const fuori = [".gitattributes", ".github", ".gitignore", "CONTRIBUTING.md", "README.md", "SECURITY.md", "app", "interni"]
    const portati = new Set(DA_PORTARE.map((voce) => voce.split("/")[0]))
    const dimenticati = git.stdout.toString().split("\n").filter((voce) => voce !== "" && !portati.has(voce) && !fuori.includes(voce))
    expect(dimenticati).toEqual([])
  })

  test("l'elenco dice le cartelle del prodotto, tutti i file portati (non se stesso) e ciò che non è del prodotto e resta dov'è", async () => {
    const repo = await repoFinto()
    const destinazione = await mkdtemp(join(tmpdir(), "codice-"))
    temporanee.push(destinazione)
    await prepara(repo, destinazione)
    const elenco = JSON.parse(await readFile(join(destinazione, ELENCO), "utf8"))
    expect(Object.keys(elenco).sort()).toEqual(["conservati_per_nome", "conservati_per_percorso", "file", "radici"])
    expect(elenco.radici).toEqual(DA_PORTARE)
    expect(elenco.file).toEqual((await tutti(destinazione)).filter((f) => f !== ELENCO))
    expect(elenco.file).toContain(".claude/skills/monta/SKILL.md")
    expect(elenco.conservati_per_nome).toEqual(expect.arrayContaining(["node_modules", "__pycache__"]))
    expect(elenco.conservati_per_percorso).toEqual(expect.arrayContaining(["animazioni/foto", "motore/prove", "animazioni/dist", "animazioni/dist.lock", "animazioni/dist.nuova", "animazioni/dist.vecchia"]))
  })

  test("una cartella di destinazione già piena si rifà da capo", async () => {
    const repo = await repoFinto()
    const destinazione = await mkdtemp(join(tmpdir(), "codice-"))
    temporanee.push(destinazione)
    await writeFile(join(destinazione, "vecchio.txt"), "di una volta")
    await prepara(repo, destinazione)
    expect(await tutti(destinazione)).not.toContain("vecchio.txt")
  })

  test("le esclusioni guardano le cartelle intere, non i nomi che le contengono", () => {
    expect(escluso("server/node_modules")).toBe(true)
    expect(escluso("animazioni/test/uno.test.ts")).toBe(true)
    expect(escluso("motore/prove")).toBe(true)
    expect(escluso("server/src/test-utili.ts")).toBe(false)
    expect(escluso("motore/proveniente.py")).toBe(false)
    expect(escluso("motore/monta.pyc")).toBe(true)
    expect(escluso("docs/images/banner.png")).toBe(true)
    expect(escluso("docs/guida/english.md")).toBe(false)
  })
})
