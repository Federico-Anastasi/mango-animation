// Il video montato completo (`docs/MOTORE.md`, «La copertina»): `monta` scrive `finale.mp4` e, se il piano dichiara la copertina, ne fa un secondo nome dello stesso file
// (`con-copertina.mp4`, un collegamento). Chi vuole guardare il montato prende quello con la copertina se è dello stesso montaggio, altrimenti `finale.mp4`.
import type { Uscita } from "./indice"

const nomeDi = (file: string): string => file.split("/").pop() ?? file

export const eLoStessoFile = (a: Uscita, b: Uscita): boolean => a.stesso_file === b.file || b.stesso_file === a.file || (a.stesso_file !== null && a.stesso_file === b.stesso_file)

/** Il file da guardare come montato: `con-copertina.mp4` se è lo stesso file di `finale.mp4` o non è più vecchio (una copertina fatta a parte dopo il montato), altrimenti `finale.mp4`; `null` senza nessuno dei due. */
export function montatoDi(uscite: readonly Uscita[]): Uscita | null {
  const finale = uscite.find((u) => nomeDi(u.file) === "finale.mp4")
  const conCopertina = uscite.find((u) => nomeDi(u.file) === "con-copertina.mp4")
  if (!finale) return conCopertina ?? null
  if (!conCopertina) return finale
  return eLoStessoFile(finale, conCopertina) || Date.parse(conCopertina.cambiato) >= Date.parse(finale.cambiato) ? conCopertina : finale
}

/** Ciò che dice quale file è sul disco, o `null` se il disco non lo sa dire. Numeri interi esatti: Windows numera i file anche oltre 2^53, dove due file vicini letti come numeri normali diventano uguali. */
export const idDelFile = (stato: { dev: bigint; ino: bigint }): string | null => (stato.ino === 0n ? null : `${stato.dev}:${stato.ino}`)

/** I file che sono lo stesso file sul disco (stesso collegamento, `id` uguale): il primo per nome è il file, degli altri si dice qual è. */
export function segnaGliStessiFile(voci: ReadonlyArray<{ file: string; id: string | null }>): Map<string, string | null> {
  const primo = new Map<string, string>()
  const risultato = new Map<string, string | null>()
  for (const { file, id } of [...voci].sort((a, b) => a.file.localeCompare(b.file))) {
    const gia = id === null ? undefined : primo.get(id)
    risultato.set(file, gia ?? null)
    if (id !== null && gia === undefined) primo.set(id, file)
  }
  return risultato
}

const testoDi = (valore: unknown): string | null => (typeof valore === "string" && valore !== "" ? valore : null)

interface ConfrontoDelPiano {
  conMontato: boolean
  /** `lavoro/montaggio.json`: `uscite.finale` è l'impronta del risolto da cui viene `finale.mp4` (`docs/MOTORE.md`). */
  montaggio: unknown
  /** `lavoro/risolto.json`: porta l'impronta del piano e dello stile da cui è stato risolto. */
  risolto: unknown
  /** Il risolto non è rimasto indietro rispetto al piano e allo stile. */
  risoltoAggiornato: boolean
  /** La data del piano è più recente di quella di `finale.mp4`. */
  pianoPiuNuovoDelFinale: boolean
}

/**
 * Il montato non segue il piano di adesso. Con il risolto di adesso e l'impronta con cui il montaggio è stato fatto decide l'impronta (un piano
 * risalvato uguale non cambia niente, uno stile cambiato sì); un montato di prima dell'impronta o un risolto da rifare si confrontano per data.
 */
export function pianoDopoIlMontato({ conMontato, montaggio, risolto, risoltoAggiornato, pianoPiuNuovoDelFinale }: ConfrontoDelPiano): boolean {
  if (!conMontato) return false
  const montatoDa = testoDi((montaggio as { uscite?: { finale?: unknown } } | null)?.uscite?.finale)
  const impronta = testoDi((risolto as { impronta?: unknown } | null)?.impronta)
  return montatoDa !== null && impronta !== null && risoltoAggiornato ? montatoDa !== impronta : pianoPiuNuovoDelFinale
}
