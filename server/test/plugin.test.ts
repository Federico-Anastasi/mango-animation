// Il metodo come plugin di Claude Code (`docs/ARCHITETTURA.md`, «Il plugin»): manifesto, skill, hook di avvio e server MCP «video» fuori dall'app.
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { trovaLavoro } from "../../plugin/lavoro"
import { fileDelMetodo, LIMITE_DI_UN_HOOK, pezziDelMetodo } from "../../plugin/metodo"

const REPO = resolve(import.meta.dir, "..", "..")
const leggiJson = (relativo: string): Record<string, unknown> => JSON.parse(readFileSync(join(REPO, relativo), "utf8")) as Record<string, unknown>
const conLaRadice = (testo: string): string => testo.replaceAll("${CLAUDE_PLUGIN_ROOT}", REPO)
const inShell = (percorso: string): string => percorso.replaceAll("\\", "/")

const temporanee: string[] = []
afterAll(() => temporanee.forEach((c) => rmSync(c, { recursive: true, force: true })))
const cartella = (conArchivio: boolean): string => {
  const c = mkdtempSync(join(tmpdir(), "plugin-lavoro-"))
  temporanee.push(c)
  if (conArchivio) mkdirSync(join(c, "archivio"))
  return c
}

/** L'ambiente di un processo del plugin: quello che serve a Bun per partire, e niente del computer di chi prova. */
const ambienteMinimo = (extra: Record<string, string> = {}): Record<string, string> => ({
  PATH: process.env["PATH"] ?? "",
  SystemRoot: process.env["SystemRoot"] ?? "",
  MANGO_DATA: process.env["MANGO_DATA"] ?? "",
  ...extra,
})

const hookDiAvvio = (): string[] => {
  const gruppi = (leggiJson("plugin/hooks.json")["hooks"] as { SessionStart: { hooks: { type: string; command: string }[] }[] }).SessionStart
  return gruppi.flatMap((g) => g.hooks).map((h) => h.command)
}
const hookDelMetodo = (): string[] => hookDiAvvio().filter((c) => / metodo \d+$/.test(c))
const hookDellAmbiente = (): string => hookDiAvvio().find((c) => c.endsWith(" ambiente"))!

/** Lancia un hook come lo lancia Claude Code (la sua riga, con la cartella del plugin al posto della variabile). */
function eseguiHook(comando: string, cwd: string, extra: Record<string, string> = {}) {
  const [, script, argomenti] = /^bun run "([^"]+)" (.+)$/.exec(conLaRadice(comando))!
  const r = Bun.spawnSync([process.execPath, "run", script!, ...argomenti!.split(" ")], { cwd, env: ambienteMinimo(extra), stdout: "pipe", stderr: "pipe" })
  return { codice: r.exitCode, fuori: r.stdout.toString().replaceAll("\r\n", "\n"), errori: r.stderr.toString() }
}

describe("il manifesto", () => {
  test("ogni percorso che dichiara c'è, dentro la cartella del plugin", () => {
    const m = leggiJson(".claude-plugin/plugin.json") as { name: string; skills: string[]; hooks: string; mcpServers: { video: { args: string[] } } }
    expect(m.name).toBe("mango-animation")
    for (const p of [...m.skills, m.hooks]) {
      expect(p.startsWith("./")).toBe(true)
      expect(existsSync(join(REPO, p))).toBe(true)
    }
    expect(existsSync(conLaRadice(m.mcpServers.video.args[1]!))).toBe(true)
    for (const comando of hookDiAvvio()) expect(existsSync(/"([^"]+)"/.exec(conLaRadice(comando))![1]!)).toBe(true)
  })

  test("le skill sono quelle di `.claude/skills/`, che Mango Code legge: nessuna seconda copia", () => {
    expect(leggiJson(".claude-plugin/plugin.json")["skills"]).toEqual(["./.claude/skills/"])
    expect(existsSync(join(REPO, "skills"))).toBe(false)
  })

  test.skipIf(Bun.which("claude") === null)("`claude plugin validate` lo accetta", () => {
    const r = Bun.spawnSync([Bun.which("claude")!, "plugin", "validate", "."], { cwd: REPO, stdout: "pipe", stderr: "pipe" })
    expect(r.stdout.toString()).toContain("Validation passed")
    expect(r.exitCode).toBe(0)
  }, 60_000)
})

describe("le skill", () => {
  test("ogni cartella ha la sua SKILL.md con nome uguale alla cartella e una descrizione", () => {
    const nomi = readdirSync(join(REPO, ".claude", "skills"))
    expect(nomi.length).toBeGreaterThan(0)
    for (const nome of nomi) {
      const testa = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(REPO, ".claude", "skills", nome, "SKILL.md"), "utf8"))?.[1] ?? ""
      expect(testa).toMatch(new RegExp(`^name: ${nome}\\s*$`, "m"))
      expect(testa).toMatch(/^description: \S/m)
    }
  })
})

describe("le regole che il plugin dà a Claude all'avvio", () => {
  test("sono il CLAUDE.md del metodo e le regole sempre caricate, non quelle di chi sviluppa il codice", () => {
    expect(fileDelMetodo(REPO)).toEqual(["CLAUDE.md", ".claude/rules/contenuto.md", ".claude/rules/montaggio.md", ".claude/rules/processo.md"])
  })

  test("c'è un hook per ogni pezzo, e nessun pezzo passa il limite di un hook", () => {
    const pezzi = pezziDelMetodo(REPO, "C:/lavoro")
    expect(hookDelMetodo().map((c) => Number(/(\d+)$/.exec(c)![1]))).toEqual(pezzi.map((_, i) => i + 1))
    for (const pezzo of pezzi) expect(pezzo.length).toBeLessThan(LIMITE_DI_UN_HOOK)
  })

  test("in una cartella di lavoro ogni hook scrive il suo pezzo, e tutti insieme le regole intere", () => {
    const lavoro = cartella(true)
    const uscite = hookDelMetodo().map((c) => eseguiHook(c, lavoro))
    for (const u of uscite) {
      expect(u.codice).toBe(0)
      expect(u.fuori.length).toBeLessThan(LIMITE_DI_UN_HOOK)
      expect(u.fuori).toContain(`The working folder is ${resolve(lavoro)}.`)
    }
    const tutto = uscite.map((u) => u.fuori).join("\n")
    for (const file of fileDelMetodo(REPO)) {
      const testo = readFileSync(join(REPO, file), "utf8").replaceAll("\r\n", "\n").trimEnd()
      expect(tutto).toContain(testo.slice(0, 200))
      expect(tutto).toContain(testo.slice(-200))
    }
  })

  test("in una cartella che non è di lavoro nessun hook dice o cambia niente", () => {
    const altrove = cartella(false)
    const file = join(altrove, "env.sh")
    for (const comando of hookDiAvvio()) expect(eseguiHook(comando, altrove, { CLAUDE_ENV_FILE: file })).toEqual({ codice: 0, fuori: "", errori: "" })
    expect(existsSync(file)).toBe(false)
  })

  test("`ambiente` dà alla shell di Claude la cartella di lavoro e il codice per Python", () => {
    const lavoro = cartella(true)
    const file = join(cartella(false), "env.sh")
    expect(eseguiHook(hookDellAmbiente(), lavoro, { CLAUDE_ENV_FILE: file, PYTHONPATH: "D:/altro" }).codice).toBe(0)
    expect(readFileSync(file, "utf8").trim().split("\n")).toEqual([
      `export MANGO_ANIMATION_LAVORO='${inShell(resolve(lavoro))}'`,
      `export PYTHONPATH='${inShell([REPO, "D:/altro"].join(delimiter))}'`,
    ])
  })

  test("`ambiente` non ripete il codice se Python già lo trova (la chat dell'app lo passa da sé)", () => {
    const lavoro = cartella(true)
    const file = join(cartella(false), "env.sh")
    eseguiHook(hookDellAmbiente(), lavoro, { CLAUDE_ENV_FILE: file, PYTHONPATH: REPO, MANGO_ANIMATION_LAVORO: lavoro })
    expect(readFileSync(file, "utf8").trim().split("\n")).toEqual([`export MANGO_ANIMATION_LAVORO='${inShell(resolve(lavoro))}'`])
  })
})

describe("dove sta la cartella di lavoro", () => {
  test("vale la variabile; senza, la cartella in cui Claude è aperto se ha `archivio/`", () => {
    const lavoro = cartella(true)
    const altra = cartella(true)
    expect(trovaLavoro({ MANGO_ANIMATION_LAVORO: altra }, lavoro, REPO)).toBe(resolve(altra))
    expect(trovaLavoro({}, lavoro, REPO)).toBe(resolve(lavoro))
    expect(trovaLavoro({ CLAUDE_PROJECT_DIR: lavoro }, cartella(false), REPO)).toBe(resolve(lavoro))
  })

  test("una cartella senza `archivio/` e la cartella del codice non sono di lavoro", () => {
    expect(trovaLavoro({}, cartella(false), REPO)).toBeNull()
    expect(trovaLavoro({}, REPO, REPO)).toBeNull()
  })

  test("una variabile che indica una cartella che non c'è è un errore, non un ripiego", () => {
    expect(() => trovaLavoro({ MANGO_ANIMATION_LAVORO: join(cartella(false), "manca") }, cartella(true), REPO)).toThrow("non c'è")
  })
})

describe("il server MCP «video» del plugin", () => {
  const clienti: Client[] = []
  afterAll(async () => {
    await Promise.all(clienti.map((c) => c.close()))
  })
  const apri = (cwd: string, extra: Record<string, string>) => {
    const trasporto = new StdioClientTransport({ command: process.execPath, args: ["run", join(REPO, "plugin", "mcp.ts")], cwd, env: ambienteMinimo(extra), stderr: "pipe" })
    const client = new Client({ name: "prova", version: "1" })
    clienti.push(client)
    return { client, trasporto }
  }
  const nomiDegliStrumenti = async (client: Client): Promise<string[]> => (await client.listTools()).tools.map((t) => t.name)

  test("con la variabile parte da qualunque cartella ed elenca gli strumenti, senza scheda video né server acceso", async () => {
    const { client, trasporto } = apri(cartella(false), { MANGO_ANIMATION_LAVORO: cartella(true) })
    await client.connect(trasporto)
    expect(await nomiDegliStrumenti(client)).toContain("video_elenco")
  })

  test("senza la variabile trova la cartella di lavoro in quella in cui Claude è aperto", async () => {
    const { client, trasporto } = apri(cartella(true), {})
    await client.connect(trasporto)
    expect(await nomiDegliStrumenti(client)).toContain("video_elenco")
  })

  test("fuori da una cartella di lavoro non parte e dice cosa fare", async () => {
    const { client, trasporto } = apri(cartella(false), {})
    let errori = ""
    trasporto.stderr?.on("data", (pezzo: Buffer) => (errori += pezzo.toString()))
    await expect(client.connect(trasporto)).rejects.toThrow()
    expect(errori).toContain("archivio/")
    expect(errori).toContain("MANGO_ANIMATION_LAVORO")
  })
})
