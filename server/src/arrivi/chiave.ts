// Le chiavi segrete: una per scopo e per archivio, generate la prima volta e salvate in `arrivi/<file>`. Chi conosce la chiave degli
// arrivi può mandare file, chi conosce quella delle API può comandare il server; si confrontano a tempo costante.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { jsonDaTesto, leggiTesto } from "../disco"

/** La chiave scritta in `file`, o `null` se il file non c'è o non porta una chiave. */
export async function leggiChiave(cartella: string, file: string): Promise<string | null> {
  const valore = (jsonDaTesto((await leggiTesto(join(cartella, file))) ?? "")?.valore as { chiave?: unknown } | undefined)?.chiave
  return typeof valore === "string" && valore.length >= 32 ? valore : null
}

async function chiaveDelFile(cartella: string, file: string): Promise<string> {
  const esistente = await leggiChiave(cartella, file)
  if (esistente) return esistente
  await mkdir(cartella, { recursive: true })
  const chiave = randomBytes(24).toString("base64url")
  // `wx`: due avvii insieme non si sovrascrivono la chiave a vicenda.
  try {
    await writeFile(join(cartella, file), JSON.stringify({ chiave, creata: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 })
  } catch (errore) {
    const letta = await leggiChiave(cartella, file)
    if (!letta) throw errore
    return letta
  }
  return chiave
}

export const chiaveArrivi = (cartella: string): Promise<string> => chiaveDelFile(cartella, "chiave.json")
export const chiaveApi = (cartella: string): Promise<string> => chiaveDelFile(cartella, "chiave-api.json")
export const chiaveApp = (cartella: string): Promise<string> => chiaveDelFile(cartella, "chiave-app.json")
export const leggiChiaveApi = (cartella: string): Promise<string | null> => leggiChiave(cartella, "chiave-api.json")

const impronta = (testo: string): Buffer => createHash("sha256").update(testo).digest()

export const chiaveGiusta = (chiave: string, candidata: string | null | undefined): boolean => !!candidata && timingSafeEqual(impronta(candidata), impronta(chiave))
