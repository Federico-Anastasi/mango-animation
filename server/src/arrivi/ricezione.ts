// La ricezione dal telefono: spenta finché chi usa il computer non collega un telefono (Impostazioni › Telefono, «Collega un telefono»). Finché è spenta
// il computer non ascolta la rete per gli arrivi. La scelta resta in `arrivi/ricezione.json`: un telefono collegato continua a mandare dopo un riavvio.
import { join } from "node:path"
import { jsonDaTesto, leggiTesto, scrivi, testoJson } from "../disco"

export class Ricezione {
  private constructor(
    private readonly file: string,
    private accesa: boolean,
  ) {}

  /** Il file si scrive al primo cambio: finché nessuno collega un telefono, l'archivio non si tocca. */
  static async carica(cartella: string): Promise<Ricezione> {
    const file = join(cartella, "ricezione.json")
    const testo = await leggiTesto(file)
    const letta = testo === null ? false : (jsonDaTesto(testo)?.valore as { acceso?: unknown } | undefined)?.acceso
    if (testo !== null && typeof letta !== "boolean") console.error("arrivi: ricezione.json non si legge: la ricezione dal telefono riparte spenta.")
    return new Ricezione(file, letta === true)
  }

  get acceso(): boolean {
    return this.accesa
  }

  async imposta(acceso: boolean): Promise<void> {
    if (acceso === this.accesa) return
    await scrivi(this.file, testoJson({ acceso }))
    this.accesa = acceso
  }
}
