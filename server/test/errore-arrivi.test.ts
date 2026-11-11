import { describe, expect, test } from "bun:test"
import { ErroreArrivo, grandezza, motivoDelRifiuto } from "../src/arrivi/errore"
import { frase } from "../src/lingua"

describe("la frase per chi manda un file che non è stato salvato", () => {
  test("un rifiuto voluto (disco pieno, genere non accettato) tiene la sua frase e il suo stato, senza dettaglio", () => {
    const voluto = frase("Sul computer non c'è abbastanza spazio libero.", "There is not enough free space on the computer.")
    expect(motivoDelRifiuto(new ErroreArrivo(507, voluto))).toEqual({ stato: 507, frase: voluto, dettaglio: null, interrotto: false })
  })

  test("il collegamento chiuso dal telefono, in ogni forma in cui arriva, dice che si è interrotto", () => {
    const chiuso = new DOMException("The connection was closed.", "AbortError")
    const reset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })
    for (const errore of [chiuso, reset]) {
      const motivo = motivoDelRifiuto(errore)
      expect(motivo.frase.it).toContain("collegamento")
      expect(motivo.frase.it).toContain("interrotto")
      expect(motivo.frase.en).toContain("connection with the phone broke")
      expect(motivo).toMatchObject({ stato: 400, interrotto: true })
    }
  })

  test("un file che Windows tiene aperto (antivirus, un altro programma) lo dice, col codice nel dettaglio", () => {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
      const motivo = motivoDelRifiuto(Object.assign(new Error(`${code}: operation not permitted`), { code }))
      expect(motivo.stato).toBe(500)
      expect(motivo.frase.it).toContain("tiene aperta")
      expect(motivo.frase.en).toContain("has the arrivals folder open")
      expect(motivo.dettaglio).toContain(code)
    }
  })

  test("ogni altro errore dice cosa è successo, non solo che qualcosa è andato storto", () => {
    const motivo = motivoDelRifiuto(Object.assign(new Error("ENOTDIR: not a directory, mkdir"), { code: "ENOTDIR" }))
    expect(motivo.stato).toBe(500)
    expect(motivo.frase.it).toContain("non è riuscito a salvare")
    expect(motivo.frase.it).toContain("ENOTDIR")
    expect(motivo.frase.en).toBe("The computer could not save the file (ENOTDIR). The details are in archivio/arrivi/registro.jsonl.")
    expect(motivo.dettaglio).toBe("ENOTDIR: not a directory, mkdir")
    expect(motivoDelRifiuto("una stringa lanciata").frase.it).toContain("una stringa lanciata")
  })

  test("la grandezza usa la virgola in italiano e il punto in inglese", () => {
    expect(grandezza(3.25 * 1024 ** 3)).toBe("3,3 GB")
    expect(grandezza(3.25 * 1024 ** 3, "en")).toBe("3.3 GB")
    expect(grandezza(850 * 1024 ** 2, "en")).toBe("850 MB")
  })
})
