import { describe, expect, it } from "vitest"
import * as r from "../src/montaggio/ritocchi"
import type { Esito } from "../src/montaggio/ritocchi"
import type { Piano } from "../src/tipi"
import { contestoDiProva, contestoSenzaVoce } from "./fixture"

function piano(esito: Esito): Piano {
  if (!esito.ok) throw new Error(`atteso ok, ricevuto: ${esito.motivo}`)
  return esito.piano
}
function motivo(esito: Esito): string {
  if (esito.ok) throw new Error("atteso un rifiuto")
  return esito.motivo
}

describe("bordo di un pezzo a tempo", () => {
  it("il primo tratto muove `da`", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 0, "inizio", 0.8)).scene![0]!.pezzi[0]!.da).toBe(0.8)
  })

  it("non va sotto zero né oltre la fine della sorgente", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 0, "inizio", -3)).scene![0]!.pezzi[0]!.da).toBe(0)
    expect(piano(r.bordo(ctx, 1, "fine", 99, { durataSorgente: 9.4 })).scene![0]!.pezzi[0]!.a).toBe(9.4)
  })

  it("l'ultimo tratto muove `a`", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 1, "fine", 9.4)).scene![0]!.pezzi[0]!.a).toBe(9.4)
  })

  it("non lascia un tratto più corto del minimo", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 0, "inizio", 3, { minimo: 0.3 })).scene![0]!.pezzi[0]!.da).toBe(2.7)
    expect(piano(r.bordo(ctx, 0, "fine", 0, { minimo: 0.3 })).scene![0]!.pezzi[0]!.via).toBeDefined()
  })

  it("un bordo fra due tratti riscrive il vuoto fra loro in `via`", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 0, "fine", 3.2)).scene![0]!.pezzi[0]!.via).toEqual([[3.2, 3.5]])
    expect(piano(r.bordo(ctx, 1, "inizio", 3.3)).scene![0]!.pezzi[0]!.via).toEqual([[3, 3.3]])
    expect(piano(r.bordo(ctx, 0, "fine", 2.5)).scene![0]!.pezzi[0]!.via).toEqual([[2.5, 3.5]])
  })

  it("richiudere il vuoto toglie `via`", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 1, "inizio", 3)).scene![0]!.pezzi[0]!.via).toBeUndefined()
    expect(piano(r.bordo(ctx, 0, "fine", 3.6)).scene![0]!.pezzi[0]!.via).toBeUndefined()
  })

  it("un bordo interno non attraversa il tratto vicino", () => {
    const ctx = contestoDiProva()
    expect(piano(r.bordo(ctx, 0, "fine", 7)).scene![0]!.pezzi[0]!.via).toBeUndefined()
    expect(piano(r.bordo(ctx, 1, "inizio", 1)).scene![0]!.pezzi[0]!.via).toBeUndefined()
  })

  it("non tocca l'argomento", () => {
    const ctx = contestoDiProva()
    const prima = structuredClone(ctx.proprio)
    r.bordo(ctx, 0, "inizio", 0.5)
    expect(ctx.proprio).toEqual(prima)
  })

  it("un tratto che non c'è dà un motivo", () => {
    expect(motivo(r.bordo(contestoDiProva(), 99, "inizio", 1))).toMatch(/non c'è più/)
  })
})

describe("bordo di un pezzo a parole", () => {
  it("il primo bordo scrive `rifila` in secondi, negativo = prima", () => {
    expect(piano(r.bordo(contestoDiProva(), 2, "inizio", 9.9)).scene![1]!.pezzi[0]!.rifila).toEqual([-0.1, 0])
  })

  it("l'ultimo bordo scrive la fine, sommando a ciò che c'era", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![1]!.pezzi[0]!.rifila = [-0.1, 0.1]
    expect(piano(r.bordo(ctx, 3, "fine", 13.7)).scene![1]!.pezzi[0]!.rifila).toEqual([-0.1, 0.3])
  })

  describe("il bordo fra due parole del pezzo", () => {
    // La gara: «uno due» nel tratto 2 (fino a 11,5 della sorgente), «tre quattro» nel tratto 3 (da 12): il vuoto fra loro è il bordo.
    const pezzi = (ctx = contestoDiProva()) => ctx.proprio.scene![1]!.pezzi

    it("la fine del primo pezzo di parole divide il pezzo e allunga la fine di quello che resta prima", () => {
      const nuovo = piano(r.bordo(contestoDiProva(), 2, "fine", 11.8))
      expect(nuovo.scene![1]!.pezzi).toEqual([
        { sorgente: "b", minuto: "0:10", dice: "uno due", rifila: [0, 0.3] },
        { sorgente: "b", minuto: "0:12", dice: "tre quattro" },
      ])
    })

    it("l'inizio del secondo anticipa l'inizio di quello che resta dopo", () => {
      const nuovo = piano(r.bordo(contestoDiProva(), 3, "inizio", 11.7))
      expect(nuovo.scene![1]!.pezzi).toEqual([
        { sorgente: "b", minuto: "0:10", dice: "uno due" },
        { sorgente: "b", minuto: "0:12", dice: "tre quattro", rifila: [-0.3, 0] },
      ])
    })

    it("la rifila dei bordi esterni resta ai due estremi", () => {
      const ctx = contestoDiProva()
      pezzi(ctx)[0]!.rifila = [-0.1, 0.1]
      const nuovo = piano(r.bordo(ctx, 2, "fine", 11.8))
      expect(nuovo.scene![1]!.pezzi.map((p) => p.rifila)).toEqual([[-0.1, 0.3], [0, 0.1]])
    })

    it("non va oltre l'inizio del tratto dopo, né sotto il minimo del suo", () => {
      expect(piano(r.bordo(contestoDiProva(), 2, "fine", 99)).scene![1]!.pezzi[0]!.rifila).toEqual([0, 0.5])
      expect(piano(r.bordo(contestoDiProva(), 3, "inizio", 0)).scene![1]!.pezzi[1]!.rifila).toEqual([-0.5, 0])
    })

    it("un bordo che resta dov'è lascia il piano com'è", () => {
      const ctx = contestoDiProva()
      expect(piano(r.bordo(ctx, 2, "fine", 11.5))).toEqual(ctx.proprio)
    })

    it("lo zoom che cresce si divide con il pezzo", () => {
      const ctx = contestoDiProva()
      pezzi(ctx)[0]!.zoom = { da: 1, a: 2 }
      const nuovo = piano(r.bordo(ctx, 2, "fine", 11.8))
      expect(nuovo.scene![1]!.pezzi.map((p) => p.zoom)).toEqual([{ da: 1, a: 1.5 }, { da: 1.5, a: 2 }])
    })
  })
})

describe("pezzo ereditato da base", () => {
  it("una scena non dichiarata dal video non si ritocca", () => {
    const ctx = contestoDiProva()
    ctx.proprio = { base: "madre", scene: [] }
    expect(motivo(r.bordo(ctx, 0, "inizio", 0.5))).toMatch(/video «madre»/)
    expect(motivo(r.dividi(ctx, 4))).toMatch(/stacca il video/)
    expect(motivo(r.togliTratto(ctx, 0))).toMatch(/stacca il video/)
    expect(motivo(r.spostaScena(ctx, 0, 1))).toMatch(/stacca il video/)
  })

  it("una scena che il video dichiara si ritocca nel suo piano, per nome", () => {
    const ctx = contestoDiProva()
    ctx.proprio = { base: "madre", scene: [structuredClone(ctx.effettivo.scene[1]!)] }
    const nuovo = piano(r.bordo(ctx, 2, "inizio", 9.9))
    expect(nuovo.base).toBe("madre")
    expect(nuovo.scene).toHaveLength(1)
    expect(nuovo.scene![0]!.pezzi[0]!.rifila).toEqual([-0.1, 0])
  })

  it("stacca copia le scene e toglie il rimando", () => {
    const ctx = contestoDiProva()
    ctx.proprio = { base: "madre", scene: [] }
    const staccato = piano(r.staccaDallaBase(ctx))
    expect(staccato.base).toBeUndefined()
    expect(staccato.scene).toEqual(ctx.effettivo.scene)
    expect(staccato.sorgenti).toEqual(ctx.effettivo.sorgenti)
  })

  it("senza base non c'è niente da staccare", () => {
    expect(motivo(r.staccaDallaBase(contestoDiProva()))).toMatch(/nessuna base/)
  })

  it("ereditata dice se la scena è della base", () => {
    const ctx = contestoDiProva()
    expect(r.ereditata(ctx.proprio, ctx.effettivo, 0)).toBe(false)
    expect(r.ereditata({ base: "m", scene: [] }, ctx.effettivo, 0)).toBe(true)
    expect(r.ereditata({ base: "m", scene: [ctx.effettivo.scene[0]!] }, ctx.effettivo, 0)).toBe(false)
  })
})

describe("dividere", () => {
  it("un pezzo a tempo diventa due, con `via` e `pausa` al loro posto", () => {
    const ctx = contestoDiProva()
    const nuovo = piano(r.dividi(ctx, 4))
    const [uno, due] = nuovo.scene![0]!.pezzi
    expect(nuovo.scene![0]!.pezzi).toHaveLength(2)
    expect(uno).toEqual({ sorgente: "a", da: 1, a: 5.5, via: [[3, 3.5]] })
    expect(due).toEqual({ sorgente: "a", da: 5.5, a: 9 })
  })

  it("nel primo tratto di un pezzo senza `da` scrive i confini veri", () => {
    const ctx = contestoDiProva()
    delete ctx.proprio.scene![0]!.pezzi[0]!.da
    const [uno, due] = piano(r.dividi(ctx, 1)).scene![0]!.pezzi
    expect(uno!.da).toBeUndefined()
    expect(uno!.a).toBe(2)
    expect(due!.da).toBe(2)
    expect(due!.a).toBe(9)
  })

  it("un pezzo a parole diventa due `dice`, il secondo col suo minuto", () => {
    const ctx = contestoDiProva()
    const [uno, due] = piano(r.dividi(ctx, 8.9)).scene![1]!.pezzi
    expect(uno).toMatchObject({ sorgente: "b", minuto: "0:10", dice: "uno due" })
    expect(due).toMatchObject({ sorgente: "b", minuto: "0:12", dice: "tre quattro" })
  })

  it("la rifila resta ai due bordi esterni", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![1]!.pezzi[0]!.rifila = [-0.1, 0.2]
    const [uno, due] = piano(r.dividi(ctx, 8.9)).scene![1]!.pezzi
    expect(uno!.rifila).toEqual([-0.1, 0])
    expect(due!.rifila).toEqual([0, 0.2])
  })

  it("lo zoom che cresce si divide a metà del percorso", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![1]!.pezzi[0]!.zoom = { da: 1, a: 2, centro: [0.5, 0.4] }
    const [uno, due] = piano(r.dividi(ctx, 8.9)).scene![1]!.pezzi
    expect(uno!.zoom!.da).toBe(1)
    expect(uno!.zoom!.a).toBe(due!.zoom!.da)
    expect(due!.zoom!.a).toBe(2)
    expect(uno!.zoom!.a).toBeGreaterThan(1)
    expect(uno!.zoom!.a).toBeLessThan(2)
  })

  it("uno zoom fisso resta uguale in tutti e due", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![0]!.pezzi[0]!.zoom = { scala: 1.4, centro: [0.5, 0.3] }
    const [uno, due] = piano(r.dividi(ctx, 4)).scene![0]!.pezzi
    expect(uno!.zoom).toEqual({ scala: 1.4, centro: [0.5, 0.3] })
    expect(due!.zoom).toEqual({ scala: 1.4, centro: [0.5, 0.3] })
  })

  it("troppo vicino a un bordo o fuori dai tratti si rifiuta", () => {
    const ctx = contestoDiProva()
    expect(motivo(r.dividi(ctx, 2.02))).toBe("La linea rossa è troppo vicina al bordo del tratto: spostala un po' e riprova.")
    expect(motivo(r.dividi(ctx, 50))).toBe("La linea rossa non è su un tratto: portala su un pezzo del montaggio e riprova.")
  })

  it("un pezzo a parole non si divide se da una parte non resta niente", () => {
    expect(motivo(r.dividi(contestoDiProva(), 7.5))).toMatch(/Dividi fra due parole/)
  })
})

describe("togliere un tratto", () => {
  it("il primo di un pezzo a tempo sposta `da` alla sua fine, e `via` non esce dal pezzo", () => {
    const pezzo = piano(r.togliTratto(contestoDiProva(), 0)).scene![0]!.pezzi[0]!
    expect(pezzo.da).toBe(3)
    expect(pezzo.via).toEqual([[3, 3.5]])
  })

  it("l'ultimo sposta `a` al suo inizio", () => {
    const pezzo = piano(r.togliTratto(contestoDiProva(), 1)).scene![0]!.pezzi[0]!
    expect(pezzo.a).toBe(3.5)
    expect(pezzo.via).toEqual([[3, 3.5]])
  })

  it("uno in mezzo aggiunge un tratto in `via`", () => {
    const ctx = contestoDiProva()
    ctx.risolto.tratti.splice(1, 1, { ...ctx.risolto.tratti[1]!, durata: 1 }, { ...ctx.risolto.tratti[1]!, da: 6, durata: 3, esce: 3 })
    ctx.risolto.parole.forEach((p) => {
      if (p.tratto >= 2) p.tratto += 1
    })
    const nuovo = piano(r.togliTratto(ctx, 1))
    expect(nuovo.scene![0]!.pezzi[0]!.via).toEqual([[3, 4.5]])
  })

  it("se è tutto il pezzo, toglie il pezzo e la scena che resta vuota", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![0]!.pezzi[0] = { sorgente: "a", da: 1, a: 3 }
    ctx.risolto.tratti = [ctx.risolto.tratti[0]!, ctx.risolto.tratti[2]!, ctx.risolto.tratti[3]!]
    ctx.risolto.parole = []
    const nuovo = piano(r.togliTratto(ctx, 0))
    expect(nuovo.scene!.map((s) => s.nome)).toEqual(["gara"])
  })

  it("l'unico pezzo del video non si toglie", () => {
    const solo = contestoDiProva()
    solo.proprio.scene = [solo.proprio.scene![1]!]
    solo.effettivo.scene = [solo.effettivo.scene[1]!]
    solo.risolto.tratti = solo.risolto.tratti.slice(2).map((t) => ({ ...t, scena: 0 }))
    solo.risolto.parole = []
    solo.proprio.scene[0]!.pezzi[0] = { sorgente: "b", da: 10, a: 13.5 }
    solo.risolto.tratti = [solo.risolto.tratti[0]!]
    solo.risolto.tratti[0]!.durata = 3.5
    expect(motivo(r.togliTratto(solo, 0))).toMatch(/unico pezzo/)
  })

  it("in un pezzo a parole toglie le parole di quel tratto", () => {
    const nuovo = piano(r.togliTratto(contestoDiProva(), 2))
    expect(nuovo.scene![1]!.pezzi).toHaveLength(1)
    expect(nuovo.scene![1]!.pezzi[0]).toMatchObject({ dice: "tre quattro", minuto: "0:12" })
  })

  it("il tratto che toglie l'intero pezzo a parole toglie anche la scena", () => {
    const ctx = contestoDiProva()
    ctx.risolto.parole = ctx.risolto.parole.filter((p) => p.tratto === 2)
    ctx.risolto.tratti = ctx.risolto.tratti.slice(0, 3)
    ctx.proprio.scene![1]!.pezzi[0]!.dice = "uno due"
    const nuovo = piano(r.togliTratto(ctx, 2))
    expect(nuovo.scene).toHaveLength(1)
  })
})

describe("togliere parole", () => {
  it("in un pezzo a tempo scrive i secondi della sorgente in `via`", () => {
    const nuovo = piano(r.togliParole(contestoDiProva(), 1, 1))
    expect(nuovo.scene![0]!.pezzi[0]!.via).toEqual([[2, 2.4], [3, 3.5]])
  })

  it("più parole di seguito diventano un tratto solo", () => {
    const nuovo = piano(r.togliParole(contestoDiProva(), 2, 3))
    expect(nuovo.scene![0]!.pezzi[0]!.via).toEqual([[3, 3.5], [3.6, 5.4]])
  })

  it("una parola a cavallo di due tratti: i suoi due pezzi stanno in un solo tratto tolto", () => {
    const ctx = contestoDiProva()
    ctx.risolto.parole.splice(1, 1, { ...ctx.risolto.parole[1]!, p: "mon", nella_sorgente: 2.8, da: 1.8, a: 2 }, { ...ctx.risolto.parole[1]!, p: "do", tratto: 1, nella_sorgente: 3.5, da: 2, a: 2.2 })
    const nuovo = piano(r.togliParole(ctx, 1, 2))
    expect(nuovo.scene![0]!.pezzi[0]!.via).toEqual([[2.8, 3.7]])
  })

  it("togliere tutto il parlato di un pezzo lo toglie", () => {
    const ctx = contestoDiProva()
    const nuovo = piano(r.togliParole(ctx, 4, 7))
    expect(nuovo.scene).toHaveLength(1)
    expect(nuovo.scene![0]!.nome).toBe("c1")
  })

  it("in un pezzo a parole divide il `dice`", () => {
    const nuovo = piano(r.togliParole(contestoDiProva(), 5, 5))
    expect(nuovo.scene![1]!.pezzi).toMatchObject([
      { dice: "uno", minuto: "0:10" },
      { dice: "tre quattro", minuto: "0:12" },
    ])
  })

  it("la prima parola sposta l'inizio: il pezzo riparte dalla seconda", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![1]!.pezzi[0]!.rifila = [-0.2, 0.3]
    const nuovo = piano(r.togliParole(ctx, 4, 4))
    expect(nuovo.scene![1]!.pezzi).toHaveLength(1)
    expect(nuovo.scene![1]!.pezzi[0]).toMatchObject({ dice: "due tre quattro", minuto: "0:10", rifila: [0, 0.3] })
  })

  it("l'ultima parola lascia la rifila d'inizio", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![1]!.pezzi[0]!.rifila = [-0.2, 0.3]
    const nuovo = piano(r.togliParole(ctx, 7, 7))
    expect(nuovo.scene![1]!.pezzi[0]).toMatchObject({ dice: "uno due tre", minuto: "0:10", rifila: [-0.2, 0] })
  })

  it("una scelta a cavallo di due scene agisce su tutte e due", () => {
    const nuovo = piano(r.togliParole(contestoDiProva(), 3, 5))
    expect(nuovo.scene![0]!.pezzi[0]!.via).toEqual([[3, 3.5], [5, 5.4]])
    expect(nuovo.scene![1]!.pezzi).toMatchObject([{ dice: "tre quattro" }])
  })

  it("senza parole scelte si rifiuta", () => {
    expect(motivo(r.togliParole(contestoDiProva(), 20, 25))).toMatch(/Scegli prima/)
  })
})

describe("spostare", () => {
  it("un pezzo si muove dentro la sua scena", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![0]!.pezzi.push({ sorgente: "a", da: 20, a: 22 })
    const nuovo = piano(r.muoviPezzo(ctx, 0, 1, 0))
    expect(nuovo.scene![0]!.pezzi.map((p) => p.da)).toEqual([20, 1])
  })

  it("ai bordi della scena si rifiuta", () => {
    const ctx = contestoDiProva()
    expect(motivo(r.muoviPezzo(ctx, 0, 0, -1))).toMatch(/già il primo/)
    expect(motivo(r.muoviPezzo(ctx, 0, 0, 1))).toMatch(/già l'ultimo/)
  })

  describe("un pezzo in un'altra scena", () => {
    const aTutti = { soloAnimazione: (quadro: string) => quadro === "solo-animazione" }
    const dueInOgni = () => {
      const ctx = contestoDiProva()
      ctx.proprio.scene![0]!.pezzi.push({ sorgente: "a", da: 20, a: 22 })
      ctx.proprio.scene![1]!.pezzi.push({ sorgente: "b", minuto: "0:11", dice: "tre quattro" })
      return ctx
    }

    it("in una scena che viene dopo va in testa, in una che viene prima va in fondo: resta dov'era nel video", () => {
      const avanti = piano(r.portaPezzoInScena(dueInOgni(), 0, 1, 1, aTutti))
      expect(avanti.scene![0]!.pezzi.map((p) => p.da)).toEqual([1])
      expect(avanti.scene![1]!.pezzi.map((p) => p.sorgente + ":" + (p.da ?? p.minuto))).toEqual(["a:20", "b:0:10", "b:0:11"])
      const indietro = piano(r.portaPezzoInScena(dueInOgni(), 1, 0, 0, aTutti))
      expect(indietro.scene![0]!.pezzi.map((p) => p.sorgente + ":" + (p.da ?? p.minuto))).toEqual(["a:1", "a:20", "b:0:10"])
    })

    it("con la posizione si sceglie il posto fra i pezzi della scena", () => {
      const nuovo = piano(r.portaPezzoInScena(dueInOgni(), 0, 1, 1, { ...aTutti, posizione: 1 }))
      expect(nuovo.scene![1]!.pezzi.map((p) => p.sorgente + ":" + (p.da ?? p.minuto))).toEqual(["b:0:10", "a:20", "b:0:11"])
      expect(piano(r.portaPezzoInScena(dueInOgni(), 0, 1, 1, { ...aTutti, posizione: 99 })).scene![1]!.pezzi).toHaveLength(3)
    })

    it("tiene la vista della scena da cui viene, se nell'altra non è la stessa", () => {
      const nuovo = piano(r.portaPezzoInScena(dueInOgni(), 1, 1, 0, aTutti))
      expect(nuovo.scene![0]!.pezzi.at(-1)!.vista).toBe("gara")
      const conVista = dueInOgni()
      conVista.proprio.scene![1]!.pezzi[1]!.vista = "altra"
      expect(piano(r.portaPezzoInScena(conVista, 1, 1, 0, aTutti)).scene![0]!.pezzi.at(-1)!.vista).toBe("altra")
    })

    it("l'unico pezzo di una scena non si sposta, e nemmeno dentro la stessa scena o in una che non c'è", () => {
      const ctx = contestoDiProva()
      expect(motivo(r.portaPezzoInScena(ctx, 0, 0, 1, aTutti))).toMatch(/unico pezzo della sua scena/)
      expect(motivo(r.portaPezzoInScena(dueInOgni(), 0, 0, 0, aTutti))).toMatch(/già in questa scena/)
      expect(motivo(r.portaPezzoInScena(dueInOgni(), 0, 0, 9, aTutti))).toMatch(/non c'è più/)
    })

    it("un pezzo con un'ancora dell'animazione non si sposta, gli altri della scena sì", () => {
      const ctx = dueInOgni()
      ctx.effettivo.scene[0]!.ancore = [["a", 2.2, 1.2]]
      expect(motivo(r.portaPezzoInScena(ctx, 0, 0, 1, aTutti))).toMatch(/ancora o una parola/)
      expect(piano(r.portaPezzoInScena(ctx, 0, 1, 1, aTutti)).scene![1]!.pezzi).toHaveLength(3)
      const conParola = dueInOgni()
      conParola.effettivo.scene[0]!.parole = { ciao: ["a", 1.5] }
      expect(motivo(r.portaPezzoInScena(conParola, 0, 0, 1, aTutti))).toMatch(/ancora o una parola/)
    })

    it("una scena della base non riceve pezzi", () => {
      const ctx = dueInOgni()
      ctx.proprio = { base: "madre", scene: [structuredClone(ctx.effettivo.scene[0]!)] }
      expect(motivo(r.portaPezzoInScena(ctx, 0, 1, 1, aTutti))).toMatch(/video «madre»/)
    })

    it("un pezzo senza voce va solo dove il quadro mostra la sola animazione", () => {
      const ctx = contestoSenzaVoce()
      const nuovo = piano(r.portaPezzoInScena(ctx, 2, 1, 0, aTutti))
      expect(nuovo.scene![0]!.pezzi).toEqual([{ durata: 4 }, { durata: 2 }])
      expect(motivo(r.portaPezzoInScena(ctx, 2, 1, 1, aTutti))).toMatch(/sola animazione/)
    })
  })

  it("le scene si scambiano; ai bordi no", () => {
    const ctx = contestoDiProva()
    expect(piano(r.spostaScena(ctx, 0, 1)).scene!.map((s) => s.nome)).toEqual(["gara", "c1"])
    expect(motivo(r.spostaScena(ctx, 0, -1))).toMatch(/già la prima/)
    expect(motivo(r.spostaScena(ctx, 1, 1))).toMatch(/già l'ultima/)
  })
})

describe("zoom", () => {
  it("scrive scala e centro del pezzo", () => {
    const nuovo = piano(r.zoomPezzo(contestoDiProva(), 0, 0, { scala: 1.234, centro: [0.5, 0.35] }))
    expect(nuovo.scene![0]!.pezzi[0]!.zoom).toEqual({ scala: 1.23, centro: [0.5, 0.35] })
  })

  it("lo zoom che cresce scrive da e a", () => {
    expect(piano(r.zoomPezzo(contestoDiProva(), 0, 0, { da: 1, a: 1.5 })).scene![0]!.pezzi[0]!.zoom).toEqual({ da: 1, a: 1.5 })
  })

  it("fuori da 1-4 o con il centro fuori dal fotogramma si rifiuta", () => {
    expect(motivo(r.zoomPezzo(contestoDiProva(), 0, 0, { scala: 5 }))).toMatch(/da 1 a 4/)
    expect(motivo(r.zoomPezzo(contestoDiProva(), 0, 0, { scala: 0.5 }))).toMatch(/da 1 a 4/)
    expect(motivo(r.zoomPezzo(contestoDiProva(), 0, 0, { scala: 2, centro: [1.2, 0.5] }))).toMatch(/fra 0 e 1/)
  })

  it("null lo toglie", () => {
    const ctx = contestoDiProva()
    ctx.proprio.scene![0]!.pezzi[0]!.zoom = { scala: 2 }
    expect(piano(r.zoomPezzo(ctx, 0, 0, null)).scene![0]!.pezzi[0]!.zoom).toBeUndefined()
  })
})

describe("correggere una parola", () => {
  it("aggiunge una voce per la sorgente di quella parola", () => {
    const nuovo = piano(r.correggiParola(contestoDiProva(), 4, "Uno!", false))
    expect(nuovo.sottotitoli!.correzioni).toEqual([{ sorgente: "b", sentite: ["uno"], giuste: "Uno!" }])
  })

  it("in rosso mette l'asterisco", () => {
    const nuovo = piano(r.correggiParola(contestoDiProva(), 0, "Ciao", true))
    expect(nuovo.sottotitoli!.correzioni![0]!.giuste).toBe("*Ciao")
  })

  it("una correzione già fatta si aggiorna e non si raddoppia", () => {
    const ctx = contestoDiProva()
    ctx.proprio.sottotitoli = { correzioni: [{ sorgente: "a", sentite: ["ciao"], giuste: "Ciao" }] }
    const nuovo = piano(r.correggiParola(ctx, 0, "Ciaone", false))
    expect(nuovo.sottotitoli!.correzioni).toEqual([{ sorgente: "a", sentite: ["ciao"], giuste: "Ciaone" }])
  })

  it("vuoto o uguale a prima si rifiuta", () => {
    expect(motivo(r.correggiParola(contestoDiProva(), 0, "   ", false))).toMatch(/Scrivi come va/)
    expect(motivo(r.correggiParola(contestoDiProva(), 0, "ciao", false))).toMatch(/già scritta così/)
  })
})

describe("vista del pezzo", () => {
  it("sceglie una vista dichiarata dal file e torna a quella della scena", () => {
    const ctx = contestoDiProva()
    expect(piano(r.vistaDelPezzo(ctx, 1, 0, "gara")).scene![1]!.pezzi[0]!.vista).toBe("gara")
    ctx.proprio.scene![1]!.pezzi[0]!.vista = "gara"
    expect(piano(r.vistaDelPezzo(ctx, 1, 0, null)).scene![1]!.pezzi[0]!.vista).toBeUndefined()
  })

  it("una vista che il file non ha si rifiuta", () => {
    expect(motivo(r.vistaDelPezzo(contestoDiProva(), 1, 0, "altra"))).toMatch(/non ha una vista/)
  })
})

describe("il resto del piano", () => {
  it("quadro, modo, titolo, coda e animazione", () => {
    const ctx = contestoDiProva()
    expect(piano(r.quadroDelVideo(ctx, "girato-pieno")).quadro).toBe("girato-pieno")
    expect(piano(r.modoSottotitoli(ctx, "a battute")).sottotitoli!.modo).toBe("a battute")
    expect(piano(r.testoTitolo(ctx, "  Nuovo  ")).titolo).toEqual({ testo: "Nuovo" })
    expect(piano(r.testoTitolo(ctx, "")).titolo).toBeUndefined()
    expect(piano(r.codaDelVideo(ctx, 1.234)).coda).toBe(1.23)
    expect(motivo(r.codaDelVideo(ctx, -1))).toMatch(/zero o più/)
    expect(piano(r.cambiaAnimazione(ctx, 0, "c2")).scene![0]!.animazione).toBe("c2")
    expect(piano(r.cambiaAnimazione(ctx, 0, null)).scene![0]!.animazione).toBeUndefined()
    expect(piano(r.quadroDellaScena(ctx, 1, "girato-pieno")).scene![1]!.quadro).toBe("girato-pieno")
  })

  it("trattoA trova il tratto e l'ultimo secondo", () => {
    const { risolto } = contestoDiProva()
    expect(r.trattoA(risolto, 0)).toBe(0)
    expect(r.trattoA(risolto, 2)).toBe(1)
    expect(r.trattoA(risolto, 10.5)).toBe(3)
    expect(r.trattoA(risolto, 11)).toBe(-1)
  })

  it("mmss", () => {
    expect(r.mmss(0)).toBe("0:00")
    expect(r.mmss(755.9)).toBe("12:35")
  })
})

describe("pezzi senza voce", () => {
  // Nel risolto: 0 apertura (4 s), 1 parlato, 2-3 i due pezzi della chiusa (3 s e 2 s).
  it("i bordi non si trascinano: il pezzo ha solo la durata", () => {
    const ctx = contestoSenzaVoce()
    expect(motivo(r.bordo(ctx, 0, "fine", 3))).toMatch(/senza voce/)
    expect(motivo(r.bordo(ctx, 2, "inizio", 1))).toMatch(/senza voce/)
  })

  it("non si divide, non ha zoom né vista", () => {
    const ctx = contestoSenzaVoce()
    expect(motivo(r.dividi(ctx, 2))).toMatch(/senza voce/)
    expect(motivo(r.zoomPezzo(ctx, 0, 0, { scala: 1.5 }))).toMatch(/senza voce/)
    expect(motivo(r.vistaDelPezzo(ctx, 0, 0, "gara"))).toMatch(/senza voce/)
  })

  it("togliere il tratto toglie il pezzo", () => {
    const ctx = contestoSenzaVoce()
    expect(piano(r.togliTratto(ctx, 2)).scene![2]!.pezzi).toEqual([{ durata: 2 }])
    expect(piano(r.togliTratto(ctx, 0)).scene!.map((s) => s.nome)).toEqual(["parlato", "chiusa"])
  })

  it("si sposta dentro la scena come un altro pezzo", () => {
    const ctx = contestoSenzaVoce()
    expect(piano(r.muoviPezzo(ctx, 2, 0, 1)).scene![2]!.pezzi).toEqual([{ durata: 2 }, { durata: 3 }])
  })

  it("le sue scene si ritoccano come le altre", () => {
    const ctx = contestoSenzaVoce()
    expect(piano(r.cambiaAnimazione(ctx, 0, "c9")).scene![0]!.animazione).toBe("c9")
  })

  it("il pezzo con la voce accanto si ritocca com'è sempre", () => {
    const ctx = contestoSenzaVoce()
    expect(piano(r.bordo(ctx, 1, "fine", 2.8)).scene![1]!.pezzi[0]!.a).toBe(2.8)
  })
})
