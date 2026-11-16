import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const APP = join(import.meta.dir, "..")
const configurazione = JSON.parse(readFileSync(join(APP, "tauri.installer.conf.json"), "utf8"))
const ganci = (): string => readFileSync(join(APP, configurazione.bundle.windows.nsis.installerHooks), "utf8")

/** Il corpo di una macro dei ganci, senza i commenti. */
const corpo = (testo: string, macro: string): string => {
  const trovata = new RegExp(`!macro ${macro}\\r?\\n([\\s\\S]*?)!macroend`).exec(testo)
  if (!trovata) throw new Error(`manca la macro ${macro}`)
  return trovata[1].split(/\r?\n/).filter((riga) => !riga.trim().startsWith(";")).join("\n")
}

test("l'installatore ha un file di ganci, e il file esiste", () => {
  const percorso = configurazione.bundle.windows.nsis.installerHooks
  expect(percorso).toBeString()
  expect(existsSync(join(APP, percorso))).toBe(true)
})

test("dopo la disinstallazione si toglie tutta la cartella del codice, tranne quando l'installatore aggiorna", () => {
  const macro = corpo(ganci(), "NSIS_HOOK_POSTUNINSTALL")
  expect(macro).toMatch(/\$\{If\} \$UpdateMode <> 1/)
  const dentro = macro.slice(macro.indexOf("$UpdateMode"), macro.indexOf("${EndIf}"))
  expect(dentro).toContain('RMDir /r "$INSTDIR\\codice"')
  expect(macro.indexOf('RMDir /r "$INSTDIR\\codice"')).toBeGreaterThan(macro.indexOf("$UpdateMode"))
  expect(macro.indexOf('RMDir /r "$INSTDIR\\codice"')).toBeLessThan(macro.indexOf("${EndIf}"))
})

test("la cartella dell'app si toglie solo se è rimasta vuota, e mai i dati dell'app", () => {
  const macro = corpo(ganci(), "NSIS_HOOK_POSTUNINSTALL")
  expect(macro).toContain('RMDir "$INSTDIR"')
  expect(macro).not.toMatch(/RMDir \/r "\$INSTDIR"/)
  expect(macro).not.toMatch(/APPDATA|BUNDLEID|dev\.mango\.animation/)
})

test("i ganci sono solo quelli che servono", () => {
  expect([...ganci().matchAll(/!macro (\w+)/g)].map((m) => m[1])).toEqual(["NSIS_HOOK_POSTUNINSTALL"])
})
