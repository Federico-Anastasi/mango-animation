// Le frasi di validazione (schemi, riferimenti del piano, ritocchi, motori) escono nella lingua dello studio.
import { afterEach, describe, expect, test } from "bun:test"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { frase, nellaLingua, type Lingua, type Testo } from "../src/lingua"
import { applicaBase, controllaCompleto, controllaRiferimenti, type Piano } from "../src/piano"
import { applicaRitocchi, ErroreRitocco } from "../src/ritocchi"
import { Schemi } from "../src/schemi"
import { avviaAmbiente, chiama, fermaTutti, piano, scriviGrezzo, scriviVideo } from "./aiuti"

afterEach(fermaTutti)

const SRC = join(import.meta.dir, "..", "src")
const SCHEDA_BUONA = { titolo: "T", stato: "proposta", creato: "2026-10-06" }

/** Le frasi come le scrive una risposta nella lingua `lingua`. */
const come = (lingua: Lingua, frasi: Testo[]): string[] => nellaLingua(lingua, () => JSON.parse(JSON.stringify(frasi)) as string[])

const schemi = await Schemi.carica(join(import.meta.dir, "..", "..", "motore", "schemi"))

describe("lo schema, tradotto dalle frasi di ajv", () => {
  const casi: [string, () => Testo[], string, string][] = [
    ["un campo che manca", () => schemi.scheda({}), "manca «titolo»", "«titolo» is missing"],
    ["un valore fuori dall'elenco", () => schemi.scheda({ ...SCHEDA_BUONA, stato: "boh" }), "stato: deve essere uno fra: proposta, in lavorazione, pronto, pubblicato, scartato", "stato: must be one of: proposta, in lavorazione, pronto, pubblicato, scartato"],
    ["un campo non ammesso", () => schemi.scheda({ ...SCHEDA_BUONA, extra: 1 }), "«extra» non è una chiave ammessa", "«extra» is not an allowed key"],
    ["un tipo sbagliato", () => schemi.scheda({ ...SCHEDA_BUONA, titolo: 5 }), "titolo: deve essere un testo", "titolo: must be text"],
    ["la radice di un altro tipo", () => schemi.scheda(5), "il documento: deve essere un oggetto", "the document: must be an object"],
    ["un testo vuoto", () => schemi.scheda({ ...SCHEDA_BUONA, titolo: "" }), "titolo: non può essere vuoto", "titolo: cannot be empty"],
    ["meno del minimo", () => schemi.scheda({ ...SCHEDA_BUONA, priorita: 0 }), "priorita: non può essere meno di 1", "priorita: cannot be less than 1"],
    ["un formato sbagliato", () => schemi.scheda({ ...SCHEDA_BUONA, creato: "ieri" }), "creato: non ha il formato giusto", "creato: is not in the right format"],
    ["un elenco troppo corto", () => schemi.scheda({ ...SCHEDA_BUONA, canali: [] }), "canali: deve avere almeno 1 elementi", "canali: must have at least 1 items"],
    ["elementi ripetuti", () => schemi.scheda({ ...SCHEDA_BUONA, canali: ["x", "x"] }), "canali: non può avere elementi ripetuti", "canali: cannot have repeated items"],
    ["nessuna delle forme", () => schemi.piano({ ...piano(), scene: [{ nome: "s", pezzi: [{}] }] }), "non ha nessuna delle forme ammesse", "does not match any of the allowed forms"],
    ["un valore che deve essere un altro", () => schemi.profilo({ versione: 2 }), "versione: deve essere 1", "versione: must be 1"],
    ["un valore sopra lo zero", () => schemi.piano({ ...piano(), scene: [{ nome: "s", pezzi: [{ durata: 0 }] }] }), "durata: deve essere più di 0", "durata: must be more than 0"],
  ]

  for (const [nome, chiamata, it, en] of casi) {
    test(nome, () => {
      const problemi = chiamata()
      expect(problemi.length).toBeGreaterThan(0)
      expect(come("it", problemi).join(" | ")).toContain(it)
      expect(come("en", problemi).join(" | ")).toContain(en)
      expect(problemi.map(String).join(" | ")).toContain(it)
    })
  }

  test("oltre sei problemi, gli altri si contano nelle due lingue", () => {
    const extra = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`extra${i}`, i]))
    const problemi = schemi.scheda({ ...SCHEDA_BUONA, ...extra })
    expect(come("it", problemi)).toHaveLength(7)
    expect(come("it", problemi)[6]).toBe("e altri 3 problemi")
    expect(come("en", problemi)[6]).toBe("and 3 more problems")
    expect(come("en", problemi)[0]).toBe("the document: «extra0» is not an allowed key")
  })

  test("senza problemi la lista è vuota", () => {
    expect(schemi.scheda(SCHEDA_BUONA)).toEqual([])
  })
})

describe("i riferimenti del piano", () => {
  const QUADRI = new Set(["girato-pieno", "solo-animazione"])

  test("quadro, sorgente, vista e scena che non ci sono", () => {
    const p: Piano = {
      quadro: "inventato",
      sorgenti: { a: { file: "g/a.mp4" } },
      scene: [{ nome: "s", pezzi: [{ sorgente: "b" }, { sorgente: "a", vista: "alta" }] }],
      suoni: [{ scena: "boh" }],
    }
    const problemi = controllaRiferimenti(p, QUADRI)
    expect(come("it", problemi)).toEqual([
      "quadro: il quadro «inventato» non c'è in stile.json (quadri: girato-pieno, solo-animazione).",
      "scene[0] («s»).pezzi[0]: la sorgente «b» non è dichiarata in «sorgenti».",
      "scene[0] («s»).pezzi[1]: la vista «alta» non è dichiarata in «sorgenti.a.viste».",
      "suoni[0]: la scena «boh» non c'è fra le scene del piano.",
    ])
    expect(come("en", problemi)).toEqual([
      "quadro: the layout «inventato» is not in stile.json (layouts: girato-pieno, solo-animazione).",
      "scene[0] («s»).pezzi[0]: the source «b» is not declared in «sorgenti».",
      "scene[0] («s»).pezzi[1]: the view «alta» is not declared in «sorgenti.a.viste».",
      "suoni[0]: the scene «boh» is not among the plan's scenes.",
    ])
  })

  test("un piano senza quadro, sorgenti e scene", () => {
    const problemi = controllaCompleto({})
    expect(come("it", problemi)).toEqual(["manca «quadro», neppure nella base.", "manca «sorgenti», neppure nella base.", "manca «scene», neppure nella base."])
    expect(come("en", problemi)).toEqual(["«quadro» is missing, also from the base.", "«sorgenti» is missing, also from the base.", "«scene» is missing, also from the base."])
  })

  test("una base che non c'è, un video senza piano, una base che fa un giro", () => {
    const piani: Record<string, Piano> = { a: { base: "b" }, b: { base: "a" }, c: { base: "zero" } }
    const trova = (slug: string): Piano | null => piani[slug] ?? null
    const testi = (slug: string): [string, string] => {
      const esito = applicaBase(slug, trova)
      if (!("it" in esito)) throw new Error("ci si aspettava una frase")
      return [esito.it, esito.en]
    }
    expect(testi("zero")).toEqual(["Il video «zero» non ha un piano.", "The video «zero» has no plan."])
    expect(testi("c")).toEqual([
      "La base «zero» di «c» non esiste o non ha un piano: scegli un altro video come base o togli «base».",
      "The base «zero» of «c» does not exist or has no plan: pick another video as the base or remove «base».",
    ])
    expect(testi("a")).toEqual([
      "La base fa un giro: a → b → a. Un piano non può dipendere da sé stesso: cambia o togli «base».",
      "The base goes in a circle: a → b → a. A plan cannot depend on itself: change or remove «base».",
    ])
  })

  test("il file del girato che non c'è e i problemi dello schema di un piano, via rotta, nelle due lingue", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    const mancante = piano("2026-10-06/non-c-e.mp4")
    const it = await chiama<{ errore: string; problemi: string[] }>(a, "PUT", "/api/video/v/piano", mancante)
    const en = await chiama<{ errore: string; problemi: string[] }>(a, "PUT", "/api/video/v/piano", mancante, "en")
    expect([it.stato, en.stato]).toEqual([400, 400])
    expect(it.corpo.problemi).toEqual(["sorgenti.a: il file «2026-10-06/non-c-e.mp4» non c'è in archivio/grezzo/. Controlla il nome (giorno/file) nella pagina Girato."])
    expect(en.corpo.problemi).toEqual(["sorgenti.a: the file «2026-10-06/non-c-e.mp4» is not in archivio/grezzo/. Check the name (day/file) on the Footage page."])
    expect(en.corpo.errore).toStartWith("The plan is not valid: ")

    const dellaForma = await chiama<{ problemi: string[] }>(a, "PUT", "/api/video/v/piano", { ...piano(), inventato: 1 }, "en")
    expect(dellaForma.corpo.problemi).toEqual(["the document: «inventato» is not an allowed key"])
  })
})

describe("i ritocchi rifiutati", () => {
  const base = (): Piano => ({ quadro: "girato-pieno", sorgenti: { a: { file: "g/a.mp4" } }, scene: [{ nome: "s", pezzi: [{ sorgente: "a" }] }] })

  const casi: [unknown, string, string][] = [
    [[{ op: "replace", path: "", value: {} }], "ritocco 1: il percorso vuoto è il piano intero; per sostituirlo usa piano_scrivi (PUT del piano).", "tweak 1: the empty path is the whole plan; to replace it use piano_scrivi (PUT of the plan)."],
    [[{ op: "replace", path: "scene/0", value: 1 }], "ritocco 1: il percorso comincia con «/», come «/scene/0/pezzi/1/dice».", "tweak 1: the path starts with «/», like «/scene/0/pezzi/1/dice»."],
    [[{ op: "remove", path: "/scene/0/pezzi/7" }], "ritocco 1: in «/scene/0/pezzi/7» l'indice «7» non c'è: la lista ha 1 elementi (da 0).", "tweak 1: in «/scene/0/pezzi/7» the index «7» does not exist: the list has 1 items (from 0)."],
    [[], "I ritocchi sono una lista non vuota di { op, path, value }.", "The tweaks are a non-empty list of { op, path, value }."],
    [[1], "ritocco 1: è un oggetto { op, path, value }.", "tweak 1: it is an object { op, path, value }."],
    [[{ op: "move", path: "/quadro" }], "ritocco 1: «op» è uno fra replace, add, remove, test.", "tweak 1: «op» is one of replace, add, remove, test."],
    [[{ op: "replace", path: "/quadro" }], "ritocco 1: «replace» vuole «value».", "tweak 1: «replace» needs «value»."],
    [
      [{ op: "add", path: "/scene/0/pezzi/0/via/0", value: [1, 2] }],
      "ritocco 1: «/scene/0/pezzi/0/via/0» non c'è nel piano: manca «via». Per crearlo: { op: \"add\", path: \"/scene/0/pezzi/0/via\", value: <il valore intero> }.",
      "tweak 1: «/scene/0/pezzi/0/via/0» is not in the plan: «via» is missing. To create it: { op: \"add\", path: \"/scene/0/pezzi/0/via\", value: <the whole value> }.",
    ],
    [[{ op: "replace", path: "/quadro/x/y", value: 1 }], "ritocco 1: «/quadro/x/y» non c'è nel piano: «quadro» non contiene altro.", "tweak 1: «/quadro/x/y» is not in the plan: «quadro» holds nothing else."],
    [[{ op: "replace", path: "/inventata", value: 1 }], "ritocco 1: «/inventata» non c'è nel piano (manca «inventata»).", "tweak 1: «/inventata» is not in the plan («inventata» is missing)."],
  ]

  for (const [ritocchi, it, en] of casi) {
    test(JSON.stringify(ritocchi), () => {
      const errore = (() => {
        try {
          applicaRitocchi(base(), ritocchi)
        } catch (e) {
          return e
        }
        throw new Error("il ritocco doveva essere rifiutato")
      })()
      expect(errore).toBeInstanceOf(ErroreRitocco)
      const testo = (errore as ErroreRitocco).testo
      expect(come("it", [testo])[0]).toBe(it)
      expect(come("en", [testo])[0]).toBe(en)
      expect((errore as ErroreRitocco).message).toBe(it)
    })
  }

  test("via rotta, il rifiuto è nella lingua della richiesta", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviGrezzo(c, "2026-10-06/a.mp4")
      await scriviVideo(c, "v", undefined, piano())
    })
    const ritocchi = [{ op: "replace", path: "/inventata", value: 1 }]
    expect((await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", ritocchi)).corpo.errore).toBe("ritocco 1: «/inventata» non c'è nel piano (manca «inventata»).")
    expect((await chiama<{ errore: string }>(a, "PATCH", "/api/video/v/piano", ritocchi, "en")).corpo.errore).toBe("tweak 1: «/inventata» is not in the plan («inventata» is missing).")
  })
})

describe("i problemi mostrati dallo studio", () => {
  test("la scheda di un video che non passa lo schema o non si legge", async () => {
    const a = await avviaAmbiente({}, async (c) => {
      await scriviVideo(c, "senza-stato", { titolo: "T" } as never)
      await scriviVideo(c, "rotto")
      await writeFile(join(c.archivio, "video", "rotto", "scheda.json"), "{non json")
    })
    type Dettaglio = { errore: string; problemi: string[] }
    const senza = (lingua?: Lingua) => chiama<Dettaglio>(a, "GET", "/api/video/senza-stato", undefined, lingua)
    expect((await senza()).corpo.problemi).toEqual(["manca «stato»", "manca «creato»"].map((m) => `il documento: ${m}`))
    expect((await senza("en")).corpo.problemi).toEqual(["the document: «stato» is missing", "the document: «creato» is missing"])
    const rotto = (lingua?: Lingua) => chiama<Dettaglio>(a, "GET", "/api/video/rotto", undefined, lingua)
    expect((await rotto()).corpo.problemi).toEqual(["il file è scritto male e non si legge"])
    expect((await rotto("en")).corpo.problemi).toEqual(["the file is badly written and cannot be read"])
  })

  test("la scheda di un file del girato", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviGrezzo(c, "2026-10-06/a.mp4", "x", { tipo: "ripresa", origine: "telefono", durata: 2, soggetto: "orto" }))
    const problemi = async (lingua?: Lingua) => (await chiama<{ file: { scheda_problemi: string[] }[] }[]>(a, "GET", "/api/grezzo", undefined, lingua)).corpo[0]!.file[0]!.scheda_problemi
    expect(await problemi()).toEqual(["il documento: «soggetto» non è una chiave ammessa"])
    expect(await problemi("en")).toEqual(["the document: «soggetto» is not an allowed key"])
  })

  test("una scheda salvata che non passa lo schema", async () => {
    const a = await avviaAmbiente({}, async (c) => scriviVideo(c, "v"))
    const chiamata = (lingua?: Lingua) => chiama<{ errore: string; problemi: string[] }>(a, "PATCH", "/api/video/v/scheda", { stato: "inventato" }, lingua)
    expect((await chiamata()).corpo.problemi).toEqual(["stato: deve essere uno fra: proposta, in lavorazione, pronto, pubblicato, scartato"])
    expect((await chiamata("en")).corpo.problemi).toEqual(["stato: must be one of: proposta, in lavorazione, pronto, pubblicato, scartato"])
  })
})

describe("i motori", () => {
  test("ciò che lo schema non ammette e ciò che non è un oggetto, nelle due lingue", async () => {
    const a = await avviaAmbiente()
    await chiama(a, "PUT", "/api/motori", { sagoma: { dove: "scheda" } })
    const prima = await readFile(join(a.radice, "profilo.json"), "utf-8")
    type Rifiuto = { errore: string; problemi: string[] }
    const it = await chiama<Rifiuto>(a, "PUT", "/api/motori", { inventata: { attiva: true } })
    const en = await chiama<Rifiuto>(a, "PUT", "/api/motori", { inventata: { attiva: true } }, "en")
    expect(it.corpo.problemi).toEqual(["motori: «inventata» non è una chiave ammessa"])
    expect(en.corpo.problemi).toEqual(["motori: «inventata» is not an allowed key"])
    expect(it.corpo.errore).toBe("I motori non sono validi: motori: «inventata» non è una chiave ammessa")
    expect(en.corpo.errore).toBe("The engines are not valid: motori: «inventata» is not an allowed key")

    expect((await chiama<Rifiuto>(a, "PUT", "/api/motori", [1])).corpo.errore).toBe("I motori devono essere un oggetto JSON: una voce per funzione.")
    expect((await chiama<Rifiuto>(a, "PUT", "/api/motori", [1], "en")).corpo.errore).toBe("The engines must be a JSON object: one entry per function.")
    expect(await readFile(join(a.radice, "profilo.json"), "utf-8")).toBe(prima)
  })
})

// --- Nessuna frase italiana nuda nei sorgenti ------------------------------------------------

const PAROLE_ITALIANE = /(^|[^\p{L}])(non|il|la|manca|deve|può|è|c'è|nella|della|sono|per|di|un)([^\p{L}]|$)/iu

/** Le stringhe con parole italiane che stanno fuori da una chiamata `frase(...)`. Commenti e contenuto di `frase(...)` sono saltati. */
function frasiNude(sorgente: string): string[] {
  const nude: string[] = []
  const aperte: number[] = []
  let profondita = 0
  let i = 0
  while (i < sorgente.length) {
    const c = sorgente[i]!
    if (sorgente.startsWith("//", i)) {
      i = sorgente.indexOf("\n", i)
      if (i < 0) break
      continue
    }
    if (sorgente.startsWith("/*", i)) {
      i = sorgente.indexOf("*/", i) + 2
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1
      while (j < sorgente.length && sorgente[j] !== c) j += sorgente[j] === "\\" ? 2 : 1
      const testo = sorgente.slice(i + 1, j)
      if (aperte.length === 0 && PAROLE_ITALIANE.test(testo)) nude.push(testo)
      i = j + 1
      continue
    }
    if (c === "(" && /\bfrase$/.test(sorgente.slice(Math.max(0, i - 6), i)) && aperte.length === 0) aperte.push(profondita)
    if (c === "(") profondita++
    if (c === ")") {
      profondita--
      if (aperte.length > 0 && aperte[aperte.length - 1] === profondita) aperte.pop()
    }
    i++
  }
  return nude
}

describe("nessuna frase italiana senza inglese", () => {
  test("la scansione riconosce una frase nuda e lascia stare quelle nelle due lingue", () => {
    expect(frasiNude("throw new E(`Manca il titolo «${x}».`)")).toEqual(["Manca il titolo «${x}»."])
    expect(frasiNude('problemi.push(frase("Manca il titolo.", "The title is missing."))')).toEqual([])
    expect(frasiNude("// non è una frase\nconst a = 1 /* manca il resto */")).toEqual([])
    expect(frasiNude(frase("a", "b").it)).toEqual([])
  })

  for (const file of ["schemi.ts", "piano.ts", "ritocchi.ts", "motori.ts"]) {
    test(file, async () => {
      expect(frasiNude(await readFile(join(SRC, file), "utf-8"))).toEqual([])
    })
  }
})
