// La sagoma preparata di una ripresa (`docs/ARCHIVIO.md`): `sagoma.json` elenca i pezzi, ognuno un file in `sagoma/` che copre un tratto della ripresa.
export interface PezzoSagoma {
  /** I secondi della ripresa che il pezzo copre. */
  da: number
  a: number
  /** Il file del pezzo, relativo all'archivio. */
  file: string
  /** Il secondo della ripresa a cui il file comincia. */
  inizio: number
}

const èNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const èOggetto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** I pezzi che `sagoma.json` dichiara, coi file relativi alla cartella della ripresa (`sagoma/12-345.webm`); una sagoma di prima (`intervalli`) è il suo `sagoma.webm`. Ciò che non ha la forma giusta si scarta. */
export function pezziDichiarati(letto: unknown): PezzoSagoma[] {
  if (!èOggetto(letto)) return []
  if (Array.isArray(letto["pezzi"])) {
    return letto["pezzi"].flatMap((p: unknown) => (èOggetto(p) && èNumero(p["da"]) && èNumero(p["a"]) && typeof p["file"] === "string" && p["file"] !== "" && èNumero(p["inizio"]) ? [{ da: p["da"], a: p["a"], file: p["file"], inizio: p["inizio"] }] : []))
  }
  if (Array.isArray(letto["intervalli"])) {
    return letto["intervalli"].flatMap((i: unknown) => (Array.isArray(i) && èNumero(i[0]) && èNumero(i[1]) ? [{ da: i[0], a: i[1], file: "sagoma.webm", inizio: 0 }] : []))
  }
  return []
}
