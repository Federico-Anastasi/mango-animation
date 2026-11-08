import { describe, expect, test } from "bun:test"
import { ErroreArrivo, motivoDelRifiuto } from "../src/arrivi/errore"

describe("la frase per chi manda un file che non è stato salvato", () => {
  test("un rifiuto voluto (disco pieno, genere non accettato) tiene la sua frase e il suo stato, senza dettaglio", () => {
    expect(motivoDelRifiuto(new ErroreArrivo(507, "Sul computer non c'è abbastanza spazio libero."))).toEqual({ stato: 507, frase: "Sul computer non c'è abbastanza spazio libero.", dettaglio: null, interrotto: false })
  })

  test("il collegamento chiuso dal telefono, in ogni forma in cui arriva, dice che si è interrotto", () => {
    const chiuso = new DOMException("The connection was closed.", "AbortError")
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
    for (const errore of [chiuso, reset]) {
      const motivo = motivoDelRifiuto(errore)
      expect(motivo.frase).toContain("collegamento")
      expect(motivo.frase).toContain("interrotto")
      expect(motivo).toMatchObject({ stato: 400, interrotto: true })
    }
  })

  test("un file che Windows tiene aperto (antivirus, un altro programma) lo dice, col codice nel dettaglio", () => {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
      const motivo = motivoDelRifiuto(Object.assign(new Error(`${code}: operation not permitted`), { code }))
      expect(motivo.stato).toBe(500)
      expect(motivo.frase).toContain("tiene aperta")
      expect(motivo.dettaglio).toContain(code)
    }
  })

  test("ogni altro errore dice cosa è successo, non solo che qualcosa è andato storto", () => {
    const motivo = motivoDelRifiuto(Object.assign(new Error("ENOTDIR: not a directory, mkdir"), { code: "ENOTDIR" }))
    expect(motivo.stato).toBe(500)
    expect(motivo.frase).toContain("non è riuscito a salvare")
    expect(motivo.frase).toContain("ENOTDIR")
    expect(motivo.dettaglio).toBe("ENOTDIR: not a directory, mkdir")
    expect(motivoDelRifiuto("una stringa lanciata").frase).toContain("una stringa lanciata")
  })
})
