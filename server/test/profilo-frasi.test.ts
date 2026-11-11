// Gli errori di un profilo non valido sono scritti per chi usa l'app: dicono quale cosa del profilo non va e come deve essere, nelle due lingue, senza nomi di campi né tipi.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { nellaLingua, type Lingua, type Testo } from "../src/lingua"
import { Schemi } from "../src/schemi"

const CARTELLA = join(import.meta.dir, "..", "..", "motore", "schemi")
const schemi = await Schemi.carica(CARTELLA)

const come = (lingua: Lingua, frasi: Testo[]): string[] => nellaLingua(lingua, () => JSON.parse(JSON.stringify(frasi)) as string[])
const BUONO = { versione: 1, creator: { nome: "Anna", lingua: "it" } }

const casi: [string, unknown, string[], string[]][] = [
  ["la scheda video che non è un numero", { macchina: { scheda_video: "due" } }, ["La scheda video del computer deve essere un numero intero, o vuota."], ["The computer's video card must be a whole number, or empty."]],
  ["un numero che non è intero", { macchina: { scheda_registrazione: 1.5 } }, ["La scheda che registra lo schermo deve essere un numero intero, o vuota."], ["The card that records the screen must be a whole number, or empty."]],
  ["un numero sotto zero", { macchina: { scheda_video: -1 } }, ["La scheda video del computer non può essere negativa."], ["The computer's video card cannot be negative."]],
  ["un sì o no che è un testo", { macchina: { disco_quasi_pieno: "sì" } }, ["L'avviso che il disco è quasi pieno deve essere sì o no."], ["The warning that the disk is almost full must be yes or no."]],
  ["il nome che manca", { creator: {} }, ["Manca il nome del creator."], ["The creator's name is missing."]],
  ["il nome vuoto", { creator: { nome: "" } }, ["Il nome del creator non può essere vuoto."], ["The creator's name cannot be empty."]],
  ["la lingua scritta per esteso", { creator: { nome: "Anna", lingua: "italiano" } }, ["La lingua del creator deve essere un codice di due lettere minuscole, per esempio «it» o «en»."], ["The creator's language must be a two-letter code in lowercase, for example «it» or «en»."]],
  ["la piattaforma che manca al secondo canale", { canali: [{ piattaforma: "tiktok" }, { nome: "senza" }] }, ["Manca la piattaforma del canale 2."], ["The platform of channel 2 is missing."]],
  ["una piattaforma che non c'è", { canali: [{ piattaforma: "myspace" }] }, ["La piattaforma del canale 1 non va bene: puoi scegliere «tiktok», «instagram», «youtube» o «x»."], ["The platform of channel 1 is not valid: you can choose «tiktok», «instagram», «youtube» or «x»."]],
  ["i canali che non sono un elenco", { canali: "tiktok" }, ["La parte del profilo sui canali deve essere un elenco."], ["The part of the profile about channels must be a list."]],
  ["una voce di ciò che non si dice, vuota", { non_si_dice: ["parolacce", ""] }, ["La voce 2 di ciò che non si dice non può essere vuota."], ["Entry 2 of what is never said cannot be empty."]],
  ["le testate né testo né elenco", { pubblico: { testate: 5 } }, ["La voce sulle testate del pubblico deve essere un testo, o un elenco di testi."], ["The entry about the audience's publications must be a text, or a list of texts."]],
  ["una cartella delle fonti che manca", { fonti_delle_idee: [{ principali: ["a"] }] }, ["Manca la cartella della fonte 1."], ["The folder of source 1 is missing."]],
  ["un progetto escluso vuoto", { fonti_delle_idee: [{ percorso: "D:\\p", esclusi: ["a", ""] }] }, ["Il progetto escluso 2 della fonte 1 non può essere vuoto."], ["Excluded project 2 of source 1 cannot be empty."]],
  ["la versione", { versione: 2 }, ["La versione del profilo deve essere 1."], ["The profile version must be 1."]],
  ["il posto dove gira un motore", { motori: { sagoma: { dove: "online" } } }, ["Il posto dove gira la sagoma sopra le animazioni non va bene: puoi scegliere «scheda» o «processore»."], ["The place where the silhouette over the animations runs is not valid: you can choose «scheda» or «processore»."]],
  ["il modello della trascrizione", { motori: { trascrizione: { modello: "base" } } }, ["Il modello della trascrizione del parlato non va bene: puoi scegliere «large-v3», «large-v3-turbo» o «small»."], ["The model of the speech transcription is not valid: you can choose «large-v3», «large-v3-turbo» or «small»."]],
  ["un motore acceso con un testo", { motori: { segui: { attiva: "sì" } } }, ["L'interruttore per il tracciamento della persona nelle riprese larghe deve essere sì o no."], ["The switch for tracking the person in wide shots must be yes or no."]],
  ["una voce che il profilo non conosce", { macchina: { gpu: 1 } }, ["Nella parte del profilo sul computer c'è «gpu», che non conosco: toglila."], ["In the part of the profile about the computer there is «gpu», which I do not know: remove it."]],
  ["una funzione che non esiste", { motori: { trascrizioni: {} } }, ["Nella parte del profilo sui motori del computer c'è «trascrizioni», che non conosco: toglila."], ["In the part of the profile about the computer engines there is «trascrizioni», which I do not know: remove it."]],
  ["una voce sconosciuta dentro un motore", { motori: { sagoma: { modello: "x" } } }, ["Nelle impostazioni della sagoma sopra le animazioni c'è «modello», che non conosco: toglila."], ["In the settings of the silhouette over the animations there is «modello», which I do not know: remove it."]],
  ["una sezione che non è un gruppo di voci", { creator: 5 }, ["La parte del profilo sul creator deve essere un gruppo di voci."], ["The part of the profile about the creator must be a group of entries."]],
  ["il profilo che non è un gruppo di voci", 5, ["Il profilo deve essere un gruppo di voci."], ["The profile must be a group of entries."]],
]

describe("gli errori del profilo, scritti per chi usa l'app", () => {
  for (const [nome, profilo, it, en] of casi) {
    test(nome, () => {
      const problemi = schemi.profilo(typeof profilo === "object" && profilo !== null && !Array.isArray(profilo) ? { ...BUONO, ...profilo } : profilo)
      expect(come("it", problemi)).toEqual(it)
      expect(come("en", problemi)).toEqual(en)
    })
  }

  test("nessun problema porta un nome di campo, un tipo dello schema o un percorso", () => {
    const profili = casi.map(([, profilo]) => profilo).map((p) => (typeof p === "object" && p !== null && !Array.isArray(p) ? { ...BUONO, ...p } : p))
    const tecnici = /[a-z]+_[a-z_]+|\b(integer|string|boolean|array|object|null|undefined)\b|\w\.\w|\[\d+\]|\bJSON\b/i
    for (const lingua of ["it", "en"] as const) {
      for (const frasi of profili.map((p) => come(lingua, schemi.profilo(p)))) {
        for (const f of frasi) expect(f.replace(/«[^»]*»/g, "")).not.toMatch(tecnici)
      }
    }
  })

  test("più problemi insieme: uno per frase, con i canali contati da uno", () => {
    const problemi = schemi.profilo({ ...BUONO, canali: [{ piattaforma: "tiktok" }, {}, { piattaforma: "mastodon", formato: "quadrato" }], macchina: { scheda_video: "x" } })
    expect(come("it", problemi)).toEqual([
      "Manca la piattaforma del canale 2.",
      "La piattaforma del canale 3 non va bene: puoi scegliere «tiktok», «instagram», «youtube» o «x».",
      "Il formato del canale 3 non va bene: puoi scegliere «verticale» o «orizzontale».",
      "La scheda video del computer deve essere un numero intero, o vuota.",
    ])
  })

  test("un profilo buono non ha problemi", () => {
    expect(schemi.profilo({ ...BUONO, macchina: { scheda_video: null, disco_quasi_pieno: false }, pubblico: { testate: ["Il Corriere"] }, motori: { allineamento: { attiva: false } } })).toEqual([])
  })

  test("ogni voce che lo schema ammette ha il suo nome nelle due lingue", () => {
    type Sub = { type?: unknown; properties?: Record<string, Sub>; items?: Sub; $ref?: string; anyOf?: unknown }
    const schema = JSON.parse(readFileSync(join(CARTELLA, "profilo.schema.json"), "utf8")) as Sub & { $defs: Record<string, Sub>; "x-nomi": Record<string, { it: string; en: string }> }
    const chiavi: string[] = [""]
    const visita = (sub: Sub, percorso: string): void => {
      const reale = sub.$ref ? schema.$defs[sub.$ref.split("/").pop()!]! : sub
      if (reale.anyOf) return
      for (const [nome, figlio] of Object.entries(reale.properties ?? {})) {
        const chiave = percorso ? `${percorso}/${nome}` : nome
        chiavi.push(chiave)
        visita(figlio, chiave)
      }
      if (reale.items) {
        chiavi.push(`${percorso}/*`)
        visita(reale.items, `${percorso}/*`)
      }
    }
    visita(schema, "")
    const nomi = schema["x-nomi"]
    expect(chiavi.filter((k) => nomi[k] === undefined)).toEqual([])
    expect(Object.keys(nomi).filter((k) => !chiavi.includes(k) && !k.startsWith("pubblico/testate"))).toEqual([])
    for (const [k, v] of Object.entries(nomi)) expect([k, v.it !== "" && v.en !== "" && v.it !== v.en]).toEqual([k, true])
  })
})
