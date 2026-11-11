import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { indirizzoImmagine } from "../src/chat/allegati"
import { useAllegati } from "../src/chat/useAllegati"
import { installaRete } from "./rete"

afterEach(() => vi.unstubAllGlobals())

describe("le anteprime delle immagini allegate", () => {
  it("un'immagine tolta prima di mandare rilascia la sua anteprima; una mandata la tiene", async () => {
    const rilasciate: string[] = []
    let n = 0
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:prova/${++n}`, revokeObjectURL: (u: string) => void rilasciate.push(u) }))
    installaRete({ "POST /api/chat/allegati": { percorso: "archivio/chat/tmp/foto.png" } })
    const { result } = renderHook(() => useAllegati())
    act(() => result.current.aggiungi([new File(["x"], "foto.png", { type: "image/png" })]))
    await waitFor(() => expect(result.current.allegati[0]?.percorso).toBe("archivio/chat/tmp/foto.png"))
    expect(indirizzoImmagine("archivio/chat/tmp/foto.png")).toBe("blob:prova/1")

    act(() => result.current.svuota())
    expect(rilasciate).toEqual([])
    expect(indirizzoImmagine("archivio/chat/tmp/foto.png")).toBe("blob:prova/1")

    act(() => result.current.aggiungi([new File(["y"], "altra.png", { type: "image/png" })]))
    await waitFor(() => expect(result.current.allegati[0]?.percorso).toBe("archivio/chat/tmp/foto.png"))
    act(() => result.current.togli(result.current.allegati[0]!.chiave))
    expect(rilasciate).toEqual(["blob:prova/2"])
  })
})
