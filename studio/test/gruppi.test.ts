import { describe, expect, it } from "vitest"
import { durataDelGruppo, raggruppaPassi } from "../src/chat/gruppi"
import type { Parte } from "../src/chat/tipi"

const passo = (id: string, extra: Record<string, unknown> = {}): Parte => ({ tipo: "strumento", id, nome: "Bash", ingresso: { command: id }, esito: "ok", ...extra }) as Parte
const forma = (parti: Parte[]) => raggruppaPassi(parti).map((v) => (v.tipo === "gruppo" ? `[${v.passi.map((p) => p.id).join(",")}]` : v.parte.tipo === "strumento" ? v.parte.id : v.parte.tipo))

describe("i passi di fila", () => {
  it("due o più strumenti finiti di fila si raccolgono in un gruppo; uno solo resta com'è", () => {
    expect(forma([passo("a"), passo("b"), passo("c")])).toEqual(["[a,b,c]"])
    expect(forma([passo("a")])).toEqual(["a"])
    expect(forma([passo("a"), { tipo: "testo", testo: "ecco" }, passo("b")])).toEqual(["a", "testo", "b"])
    expect(forma([passo("a"), passo("b"), { tipo: "testo", testo: "ecco" }, passo("c"), passo("d")])).toEqual(["[a,b]", "testo", "[c,d]"])
  })

  it("uno strumento in corso e uno fallito restano in vista e interrompono la fila", () => {
    expect(forma([passo("a"), passo("b"), passo("c", { esito: undefined }), passo("d"), passo("e")])).toEqual(["[a,b]", "c", "[d,e]"])
    expect(forma([passo("a"), passo("b"), passo("x", { esito: undefined, errore: "negato" }), passo("c")])).toEqual(["[a,b]", "x", "c"])
  })

  it("una domanda, il piano proposto, un lavoro e uno strumento con immagini non si nascondono mai nel gruppo", () => {
    const fuori = [passo("q", { nome: "AskUserQuestion" }), passo("p", { nome: "ExitPlanMode" }), passo("l", { nome: "mcp__video__lavoro" }), passo("f", { immagini: [{ media_type: "image/png", data: "x" }] })]
    expect(forma([passo("a"), passo("b"), ...fuori, passo("c"), passo("d")])).toEqual(["[a,b]", "q", "p", "l", "f", "[c,d]"])
  })

  it("un pensiero fra due strumenti va nel gruppo; uno prima o dopo resta fuori, nel suo posto", () => {
    const pensiero: Parte = { tipo: "pensiero", testo: "vediamo" }
    const voci = raggruppaPassi([pensiero, passo("a"), pensiero, passo("b"), pensiero, { tipo: "testo", testo: "fatto" }])
    expect(voci.map((v) => v.tipo)).toEqual(["parte", "gruppo", "parte", "parte"])
    const gruppo = voci[1]!
    expect(gruppo.tipo === "gruppo" && gruppo.dentro.map((p) => p.tipo)).toEqual(["strumento", "pensiero", "strumento"])
  })

  it("la durata va dall'inizio del primo passo alla fine dell'ultimo; senza gli orari non c'è", () => {
    const gruppo = raggruppaPassi([passo("a", { iniziato: "2026-11-02T10:00:00.000Z", finito: "2026-11-02T10:00:05.000Z" }), passo("b", { iniziato: "2026-11-02T10:00:20.000Z", finito: "2026-11-02T10:01:08.000Z" })])[0]!
    expect(gruppo.tipo === "gruppo" && durataDelGruppo(gruppo.passi)).toBe(68)
    const senza = raggruppaPassi([passo("a"), passo("b")])[0]!
    expect(senza.tipo === "gruppo" && durataDelGruppo(senza.passi)).toBeNull()
  })
})
