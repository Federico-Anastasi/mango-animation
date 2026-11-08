import { describe, expect, it } from "vitest"
import { dividiStime } from "../src/chat/stime"

const evidenziate = (testo: string): string[] => dividiStime(testo).flatMap((f) => (f.stima ? [f.testo] : []))

describe("le stime di tempo nel testo di Claude", () => {
  it.each([
    ["Ci vorranno circa 3 minuti.", ["circa 3 minuti"]],
    ["Il montaggio dura ~40 s e poi controllo.", ["~40 s"]],
    ["Finisce verso le 15:42, poi lo guardo.", ["verso le 15:42"]],
    ["Finisce alle 15:42.", ["alle 15:42"]],
    ["Dovrebbe essere pronto tra 2 minuti.", ["2 minuti"]],
    ["Ci vogliono 90 secondi.", ["90 secondi"]],
    ["Mancano ancora 4 min per finire.", ["4 min"]],
    ["Servono 2-3 minuti.", ["2-3 minuti"]],
    ["Tra 5 e 10 minuti è pronto.", ["5 e 10 minuti"]],
    ["Ci vorrà qualche minuto.", ["qualche minuto"]],
    ["Un paio di minuti e ho finito.", ["Un paio di minuti"]],
    ["Ci metto mezz'ora.", ["mezz'ora"]],
    ["Ci vorrà un quarto d'ora.", ["un quarto d'ora"]],
    ["Ci vorrà meno di un minuto.", ["meno di un minuto"]],
    ["Tra un'ora è fatto.", ["un'ora"]],
    ["Ci vorrà circa 1 h 2 min.", ["circa 1 h 2 min"]],
    ["Ci vorranno 3 minuti circa.", ["3 minuti circa"]],
    ["Stima: 4 min.", ["4 min"]],
    ["It should take about 5 minutes.", ["about 5 minutes"]],
    ["This will take 40 seconds.", ["40 seconds"]],
    ["Done around 15:42.", ["around 15:42"]],
    ["ETA 2 hours.", ["2 hours"]],
    ["It will be ready in a few minutes.", ["a few minutes"]],
    ["Half an hour or so.", ["Half an hour or so"]],
    ["Entro le 16.30 è pronto.", ["Entro le 16.30"]],
  ])("riconosce %j", (testo, atteso) => {
    expect(evidenziate(testo)).toEqual(atteso)
  })

  it.each([
    "Ho trovato 3 video e 9 slide.",
    "Il carosello ha 4 slide da controllare.",
    "Fatto in 6 minuti.",
    "Il video dura 40 secondi.",
    "Un video di 12 secondi con la sagoma.",
    "L'ho fatto 3 minuti fa.",
    "It finished 5 minutes ago.",
    "Il tratto va da 0:12 a 0:19.",
    "Alla scena 15:42 c'è un taglio.",
    "Il secondo passaggio è pronto.",
    "Un minuto di silenzio nel girato.",
    "Ci sono 3 sono di troppo.",
    "Sono le slide 10 e 20 sopra.",
    "La riga 12 contiene 5 file.",
  ])("non tocca %j", (testo) => {
    expect(evidenziate(testo)).toEqual([])
  })

  it("rimette insieme il testo senza perdere niente", () => {
    const testo = "Ci vorranno circa 3 minuti, poi verso le 15:42 guardo i risultati."
    const pezzi = dividiStime(testo)
    expect(pezzi.map((f) => f.testo).join("")).toBe(testo)
    expect(pezzi.filter((f) => f.stima).map((f) => f.testo)).toEqual(["circa 3 minuti", "verso le 15:42"])
  })

  it("un testo senza stime è un frammento solo, e uno vuoto non ne ha", () => {
    expect(dividiStime("Niente da segnare.")).toEqual([{ testo: "Niente da segnare.", stima: false }])
    expect(dividiStime("")).toEqual([])
  })
})
