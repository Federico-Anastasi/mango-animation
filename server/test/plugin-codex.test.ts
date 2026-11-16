// Il metodo per Codex dal terminale (`docs/METODO.md`): gli argomenti, le skill collegate, il programma. Con il vero `codex`, se c'è, senza mai un giro col modello e con una cartella `CODEX_HOME` sua.
import { afterAll, describe, expect, test } from "bun:test"
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { argomentiDiCodex, collegaLeSkill, skillDaCollegare, trovaCodex } from "../../plugin/codex"
import { regoleDelCreator } from "../../plugin/metodo"

const REPO = resolve(import.meta.dir, "..", "..")

const temporanee: string[] = []
afterAll(() => temporanee.forEach((c) => rmSync(c, { recursive: true, force: true })))
const nuova = (): string => {
  const c = mkdtempSync(join(tmpdir(), "plugin-codex-"))
  temporanee.push(c)
  return c
}

/** Una cartella di lavoro con il `CLAUDE.md` del creator, una sua regola, una regola di sviluppo (con `paths:`) e una sua skill. */
function lavoroDelCreator(): string {
  const lavoro = nuova()
  mkdirSync(join(lavoro, "archivio"))
  mkdirSync(join(lavoro, ".claude", "rules"), { recursive: true })
  mkdirSync(join(lavoro, ".claude", "skills", "saluta"), { recursive: true })
  writeFileSync(join(lavoro, "CLAUDE.md"), "Il creator si chiama Prova.\n")
  writeFileSync(join(lavoro, ".claude", "rules", "voce.md"), "Parla in modo semplice.\n")
  writeFileSync(join(lavoro, ".claude", "rules", "solo-codice.md"), '---\npaths:\n  - "x/**"\n---\n\nSolo per chi sviluppa.\n')
  writeFileSync(join(lavoro, ".claude", "skills", "saluta", "SKILL.md"), "---\nname: saluta\ndescription: Saluta il creator.\n---\n\nDi ciao.\n")
  return lavoro
}

describe("le regole del creator", () => {
  test("sono quelle sempre attive della sua cartella, col testo intero", () => {
    expect(regoleDelCreator(lavoroDelCreator())).toEqual(["Contents of .claude/rules/voce.md (the creator's rule):\n\nParla in modo semplice."])
  })

  test("una cartella senza regole non ne ha", () => {
    expect(regoleDelCreator(nuova())).toEqual([])
  })
})

describe("gli argomenti per Codex", () => {
  const ambiente = { MANGO_ANIMATION_PORTA: "47999", PYTHONPATH: "D:/altro", PATH: "x", HOME: "y" }

  test("sono coppie `-c chiave=valore`", () => {
    const argomenti = argomentiDiCodex(REPO, lavoroDelCreator(), ambiente)
    expect(argomenti.length % 2).toBe(0)
    argomenti.forEach((a, i) => i % 2 === 0 && expect(a).toBe("-c"))
  })

  test("troppe regole del creator per la riga di comando sono un errore che lo dice, non istruzioni tagliate", () => {
    const lavoro = lavoroDelCreator()
    writeFileSync(join(lavoro, ".claude", "rules", "lunga.md"), "x".repeat(30_000))
    expect(() => argomentiDiCodex(REPO, lavoro, ambiente)).toThrow("accorcia le regole del creator")
  })

  test("nella cartella del codice le regole del creator sono quelle del metodo, già date: non si ripetono", () => {
    expect(argomentiDiCodex(REPO, REPO, ambiente).join(" ")).not.toContain("(the creator's rule)")
  })
})

describe("le skill che Codex trova", () => {
  test("il prodotto e il creator, ciascuno nel suo collegamento a `.claude/skills/`: nessuna copia", () => {
    const lavoro = lavoroDelCreator()
    collegaLeSkill(REPO, lavoro)
    for (const [nome, destinazione] of Object.entries(skillDaCollegare(REPO, lavoro))) {
      const collegamento = join(lavoro, ".agents", "skills", nome)
      expect(lstatSync(collegamento).isSymbolicLink()).toBe(true)
      expect(resolve(readlinkSync(collegamento))).toBe(resolve(destinazione))
    }
    expect(readdirSync(join(lavoro, ".agents", "skills", "mango-animation"))).toEqual(readdirSync(join(REPO, ".claude", "skills")))
    expect(readdirSync(join(lavoro, ".agents", "skills", "creator"))).toEqual(["saluta"])
  })

  test("senza skill del creator, o nella cartella del codice, c'è solo quella del prodotto", () => {
    expect(Object.keys(skillDaCollegare(REPO, nuova()))).toEqual(["mango-animation"])
    expect(Object.keys(skillDaCollegare(REPO, REPO))).toEqual(["mango-animation"])
  })

  test("un collegamento verso un'altra cartella si rifà; uno giusto non si tocca", () => {
    const lavoro = nuova()
    const collegamento = join(lavoro, ".agents", "skills", "mango-animation")
    mkdirSync(join(lavoro, ".agents", "skills"), { recursive: true })
    symlinkSync(nuova(), collegamento, "junction")
    collegaLeSkill(REPO, lavoro)
    expect(resolve(readlinkSync(collegamento))).toBe(resolve(REPO, ".claude", "skills"))
    const prima = lstatSync(collegamento).ctimeMs
    collegaLeSkill(REPO, lavoro)
    expect(lstatSync(collegamento).ctimeMs).toBe(prima)
  })

  test("una cartella vera con quel nome non si cancella: è un errore che lo dice", () => {
    const lavoro = nuova()
    mkdirSync(join(lavoro, ".agents", "skills", "mango-animation"), { recursive: true })
    expect(() => collegaLeSkill(REPO, lavoro)).toThrow("non è il collegamento")
  })
})

describe("il programma di Codex", () => {
  test("la variabile vince su tutto, e se indica ciò che non c'è è un errore", () => {
    const programma = join(nuova(), "codex.exe")
    writeFileSync(programma, "")
    expect(trovaCodex({ MANGO_ANIMATION_CODEX: programma })).toBe(programma)
    expect(() => trovaCodex({ MANGO_ANIMATION_CODEX: join(nuova(), "manca.exe") })).toThrow("MANGO_ANIMATION_CODEX")
  })
})

const codex = ((): string | null => {
  try {
    return trovaCodex(process.env)
  } catch {
    return null
  }
})()

/** Un comando di Codex che legge la configurazione e non chiama il modello, con una `CODEX_HOME` solo sua. */
function eseguiCodex(lavoro: string, sotto: string[]): string {
  const r = Bun.spawnSync([codex!, ...argomentiDiCodex(REPO, lavoro, { MANGO_ANIMATION_PORTA: "47999" }), ...sotto], {
    cwd: lavoro,
    env: { ...process.env, CODEX_HOME: nuova() },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(r.exitCode).toBe(0)
  return r.stdout.toString()
}

describe.skipIf(codex === null)("con il Codex vero (nessun giro col modello)", () => {
  test("`mcp list`: lo strumento «video» è configurato, con la cartella di lavoro, le variabili del prodotto e i tempi larghi", () => {
    const lavoro = lavoroDelCreator()
    const elenco = JSON.parse(eseguiCodex(lavoro, ["mcp", "list", "--json"])) as { name: string; transport: { command: string; args: string[]; env: Record<string, string> }; tool_timeout_sec: number }[]
    expect(elenco.map((s) => s.name)).toEqual(["video"])
    const server = elenco[0]!
    expect(server.transport.command).toBe(process.execPath)
    expect(server.transport.args).toEqual(["run", "--cwd", join(REPO, "server"), "mcp"])
    expect(server.transport.env).toEqual({ MANGO_ANIMATION_PORTA: "47999", MANGO_ANIMATION_LAVORO: lavoro })
    expect(server.tool_timeout_sec).toBeGreaterThan(300)
  }, 60_000)

  test("`debug prompt-input`: le istruzioni del metodo e del creator, il suo `CLAUDE.md` e tutte le skill", () => {
    const lavoro = lavoroDelCreator()
    collegaLeSkill(REPO, lavoro)
    const voci = JSON.parse(eseguiCodex(lavoro, ["debug", "prompt-input", "ciao"])) as { content?: { text?: string }[] }[]
    const testi = voci.flatMap((v) => (v.content ?? []).map((c) => c.text ?? ""))
    const istruzioni = testi.find((t) => t.includes("Mango Animation method."))!
    expect(istruzioni).toContain(readFileSync(join(REPO, "CLAUDE.md"), "utf8").replaceAll("\r\n", "\n").trimEnd())
    expect(istruzioni).toContain("Parla in modo semplice.")
    expect(istruzioni).not.toContain("Solo per chi sviluppa.")
    expect(testi.some((t) => t.includes("Il creator si chiama Prova."))).toBe(true)
    const skill = testi.find((t) => t.includes("<skills_instructions>"))!
    for (const nome of readdirSync(join(REPO, ".claude", "skills"))) expect(skill).toContain(`- mango-animation:${nome}:`)
    expect(skill).toContain("- saluta:")
  }, 60_000)
})
