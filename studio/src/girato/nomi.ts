import { t } from "../lingua"
import type { OrigineGrezzo, TipoGrezzo } from "../tipi"

export const TIPI: readonly TipoGrezzo[] = ["ripresa", "diretta", "schermo", "altro"]
export const ORIGINI: readonly OrigineGrezzo[] = ["telefono", "registrazione", "scaricato", "altro"]

export function nomeTipo(tipo: TipoGrezzo): string {
  const nomi: Record<TipoGrezzo, string> = {
    ripresa: t("Ripresa", "Shot"),
    diretta: t("Diretta", "Live"),
    schermo: t("Schermo", "Screen"),
    altro: t("Altro", "Other"),
  }
  return nomi[tipo]
}

/** Le estensioni delle immagini, le stesse di `server/src/arrivi/nomi.ts` e `motore/foto.py`. */
const IMMAGINI = ["heic", "heif", "jpg", "jpeg", "png", "gif", "webp", "tif", "tiff", "dng", "bmp"]
/** Quelle che un browser apre da sé: le altre si guardano nella foto che prepara il motore. */
const IMMAGINI_DEL_BROWSER = ["jpg", "jpeg", "png", "gif", "webp", "bmp"]

const estensione = (nome: string): string => nome.slice(nome.lastIndexOf(".") + 1).toLowerCase()

export const eFoto = (nome: string): boolean => IMMAGINI.includes(estensione(nome))
export const siApreNelBrowser = (nome: string): boolean => IMMAGINI_DEL_BROWSER.includes(estensione(nome))

export function nomeOrigine(origine: OrigineGrezzo): string {
  const nomi: Record<OrigineGrezzo, string> = {
    telefono: t("Telefono", "Phone"),
    registrazione: t("Registrazione", "Recording"),
    scaricato: t("Scaricato", "Downloaded"),
    altro: t("Altro", "Other"),
  }
  return nomi[origine]
}
