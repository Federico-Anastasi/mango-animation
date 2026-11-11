// Ogni frase che arriva a chi usa il prodotto nasce con le due lingue: una frase che resta in una lingua sola fa fallire queste prove.
// Leggono i sorgenti di `src/`, non il server in funzione; modello: `app/tests/linguaggio.rs` e `studio/test/linguaggio.ts`.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const SRC = join(import.meta.dirname, "..", "src")

const file = (cartella: string): string[] =>
  readdirSync(cartella).flatMap((nome) => {
    const percorso = join(cartella, nome)
    return statSync(percorso).isDirectory() ? file(percorso) : nome.endsWith(".ts") ? [percorso] : []
  })

/** La fine del testo fra virgolette (o dell'espressione di un modello) che comincia in `i`; `i` punta alla virgoletta di apertura. */
function fineDelTesto(s: string, i: number): number {
  const q = s[i]!
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") j++
    else if (s[j] === q) return j
    else if (q === "`" && s[j] === "$" && s[j + 1] === "{") j = fineDelleGraffe(s, j + 1)
  }
  return s.length
}

/** La graffa che chiude quella aperta in `i`, saltando i testi che contiene. */
function fineDelleGraffe(s: string, i: number): number {
  let profondita = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]!
    if (c === '"' || c === "'" || c === "`") j = fineDelTesto(s, j)
    else if (c === "{") profondita++
    else if (c === "}" && --profondita === 0) return j
  }
  return s.length
}

export interface Chiamata {
  riga: number
  argomenti: string[]
}

/** Le chiamate `nome(…)` del sorgente, con gli argomenti come testo. */
export function chiamate(sorgente: string, nome: string): Chiamata[] {
  const trovate: Chiamata[] = []
  const inizio = new RegExp(`(?<![\\w.$])${nome}\\(`, "g")
  for (const m of sorgente.matchAll(inizio)) {
    const argomenti: string[] = []
    let corrente = ""
    let profondita = 0
    for (let j = m.index + m[0].length; j < sorgente.length; j++) {
      const c = sorgente[j]!
      if (c === '"' || c === "'" || c === "`") {
        const fine = fineDelTesto(sorgente, j)
        corrente += sorgente.slice(j, fine + 1)
        j = fine
      } else if (c === "(" || c === "[" || c === "{") {
        profondita++
        corrente += c
      } else if (c === ")" || c === "]" || c === "}") {
        if (profondita === 0) break
        profondita--
        corrente += c
      } else if (c === "," && profondita === 0) {
        argomenti.push(corrente.trim())
        corrente = ""
      } else corrente += c
    }
    if (corrente.trim() !== "") argomenti.push(corrente.trim())
    trovate.push({ riga: sorgente.slice(0, m.index).split("\n").length, argomenti })
  }
  return trovate
}

const eTesto = (argomento: string | undefined): argomento is string => argomento !== undefined && /^(["'`])[\s\S]*\1$/.test(argomento)
const contenuto = (argomento: string): string => argomento.slice(1, -1)

/** Il testo senza i valori che ci entrano (`${…}`) e senza ciò che è fra «», che è un nome di campo, di file o di cartella. */
const soloParole = (testo: string): string => testo.replace(/\$\{[^}]*\}/g, " ").replace(/«[^»]*»/g, " ").replace(/<[^>]+>/g, " ")

const ACCENTATE = /[àèéìòù]/i
const PAROLE_ITALIANE = /\b(il|lo|gli|di|del|della|dei|che|non(?!-)|con|una|dal|nel|sul|sono|è|ancora|nessun|nessuna|riprova|apri|tocca|scegli|aggiungi|manca|questo|questa)\b/i

export function difettiDiUnaFrase(it: string, en: string): string[] {
  const difetti: string[] = []
  const inglese = soloParole(en)
  const uguale = soloParole(it).replace(/\s+/g, " ").trim() === inglese.replace(/\s+/g, " ").trim()
  if (uguale && /[a-z]/i.test(inglese)) difetti.push("l'inglese è uguale all'italiano")
  if (ACCENTATE.test(inglese)) difetti.push("l'inglese ha lettere accentate")
  const parola = PAROLE_ITALIANE.exec(inglese)?.[0]
  if (parola) difetti.push(`l'inglese ha la parola italiana «${parola}»`)
  return difetti
}

const SORGENTI = file(SRC).map((percorso) => ({ nome: relative(SRC, percorso).replace(/\\/g, "/"), sorgente: readFileSync(percorso, "utf8") }))

describe("le frasi nelle due lingue", () => {
  test("il sorgente ha frasi da controllare", () => {
    const tutte = SORGENTI.flatMap((s) => chiamate(s.sorgente, "frase").filter((c) => eTesto(c.argomenti[0]) && eTesto(c.argomenti[1])))
    expect(tutte.length).toBeGreaterThan(300)
  })

  test("ogni frase ha l'italiano e l'inglese, e l'inglese è inglese", () => {
    const colpevoli = SORGENTI.flatMap(({ nome, sorgente }) =>
      chiamate(sorgente, "frase").flatMap((c) => {
        const [it, en] = c.argomenti
        if (c.argomenti.length !== 2) return [`${nome}:${c.riga}: frase() vuole due testi, ne ha ${c.argomenti.length}`]
        if (!eTesto(it) || !eTesto(en)) return []
        return difettiDiUnaFrase(contenuto(it), contenuto(en)).map((d) => `${nome}:${c.riga}: ${d} («${contenuto(en).slice(0, 60)}»)`)
      }),
    )
    expect(colpevoli).toEqual([])
  })

  for (const costruttore of ["ErroreChat", "ErroreArrivo"]) {
    test(`ogni ${costruttore} nasce con una frase nelle due lingue, mai con un testo solo`, () => {
      const colpevoli = SORGENTI.flatMap(({ nome, sorgente }) =>
        chiamate(sorgente, `new ${costruttore}`).flatMap((c) => (eTesto(c.argomenti[1]) || c.argomenti.length !== 2 ? [`${nome}:${c.riga}: ${c.argomenti.slice(1).join(", ").slice(0, 70)}`] : [])),
      )
      expect(colpevoli).toEqual([])
    })
  }

  test("lo scanner riconosce una frase in una lingua sola e una che l'ha in due", () => {
    expect(difettiDiUnaFrase("Manca il titolo.", "Manca il titolo.")).not.toEqual([])
    expect(difettiDiUnaFrase("Il file è vuoto.", "Il file è vuoto")).not.toEqual([])
    expect(difettiDiUnaFrase("Non c'è niente.", "There is nothing here.")).toEqual([])
    expect(difettiDiUnaFrase("Manca «url».", "«url» is missing.")).toEqual([])
    expect(chiamate('throw new ErroreChat(400, "Manca il titolo.")', "new ErroreChat").map((c) => eTesto(c.argomenti[1]))).toEqual([true])
    expect(chiamate("throw new ErroreChat(400, frase(`Manca ${a(\"x\")}`, `Missing`))", "new ErroreChat").map((c) => eTesto(c.argomenti[1]))).toEqual([false])
    expect(chiamate('frase(`uno ${f(")")}, due`, "three")', "frase").map((c) => c.argomenti.length)).toEqual([2])
  })
})
