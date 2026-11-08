// Numeri, tempi e date nella lingua in uso (italiana: «1,5 s», «7 ott 2026»; inglese: «1.5 s», «7 Oct 2026»): ogni cifra a schermo
// passa di qui, mai da `toFixed`, `String(n)` o una data ISO.
import { lingua, localeInUso, t } from "./lingua"

/** `pluralizza(1, "file", "file")` → «1 file»; `pluralizza(3, "tratto", "tratti")` → «3 tratti». */
export function pluralizza(quantita: number, singolare: string, plurale: string): string {
  return `${quantita} ${quantita === 1 ? singolare : plurale}`
}

/** «152,5», «12.345,60» (in inglese «152.5», «12,345.60»): con `cifre` i decimali sono sempre quelli; senza, al massimo due. */
export function numero(n: number, cifre?: number): string {
  if (cifre === undefined) return n.toLocaleString(localeInUso(), { maximumFractionDigits: 2, useGrouping: "always" })
  return n.toLocaleString(localeInUso(), { minimumFractionDigits: cifre, maximumFractionDigits: cifre, useGrouping: "always" })
}

/** Un conteggio grosso a parole: «820», «5.240», «234 mila», «1,2 milioni», «130 milioni», «1,3 miliardi» (in inglese «234 thousand», «1.2 million»). */
export function quantitaGrossa(n: number): string {
  // I confini sono quelli dopo l'arrotondamento: 999.600 è «1,0 milioni», non «1.000 mila».
  if (n < 9_999.5) return numero(Math.round(n))
  if (n < 999_500) return t("{n} mila", "{n} thousand", { n: numero(Math.round(n / 1000)) })
  if (n < 9_950_000) return t("{n} milioni", "{n} million", { n: numero(n / 1_000_000, 1) })
  if (n < 999_500_000) return t("{n} milioni", "{n} million", { n: numero(Math.round(n / 1_000_000)) })
  return t("{n} miliardi", "{n} billion", { n: numero(n / 1_000_000_000, 1) })
}

/** «1,5 s», «2 min 5 s», «1 h 2 min». */
export function durata(secondi: number): string {
  if (secondi < 60) return `${numero(secondi, secondi < 10 ? 1 : 0)} s`
  const s = Math.round(secondi)
  if (s < 3600) return s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)} min ${s % 60} s`
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}

/** Come `durata`, ma ai secondi interi: per ciò che si aggiorna ogni secondo («3 s», non «3,0 s»). */
export const durataAlSecondo = (secondi: number): string => secondi < 60 ? `${Math.floor(secondi)} s` : durata(secondi)

/** Una durata stimata, al minuto: «meno di un minuto», «circa 4 min», «circa 1 h 2 min». */
export function durataCirca(secondi: number): string {
  const minuti = Math.round(secondi / 60)
  if (minuti < 1) return t("meno di un minuto", "less than a minute")
  return t("circa {durata}", "about {durata}", { durata: durata(minuti * 60) })
}

/** Un tempo come lo legge chi monta: «0:12,4», «1:02:05,0»; senza decimali «0:12». */
export function tempoLeggibile(secondi: number, decimi = true): string {
  const s = decimi ? Math.round(Math.max(secondi, 0) * 10) / 10 : Math.floor(Math.max(secondi, 0))
  const ore = Math.floor(s / 3600)
  const minuti = Math.floor((s % 3600) / 60)
  const resto = s % 60
  const sec = decimi ? numero(resto, 1).padStart(4, "0") : String(Math.floor(resto)).padStart(2, "0")
  return ore > 0 ? `${ore}:${String(minuti).padStart(2, "0")}:${sec}` : `${minuti}:${sec}`
}

/** Un tempo al centesimo, per i bordi di un tratto: «12,43». */
export const centesimi = (secondi: number): string => numero(secondi, 2)

export function peso(byte: number): string {
  if (byte < 1024) return `${byte} B`
  if (byte < 1024 * 1024) return `${numero(byte / 1024, 0)} KB`
  if (byte < 1024 ** 3) return `${numero(byte / 1024 ** 2, 1)} MB`
  return `${numero(byte / 1024 ** 3, 2)} GB`
}

function comeData(quando: string | number): Date | null {
  const inSecondi = typeof quando === "number" || /^\d+(\.\d+)?$/.test(quando)
  const d = inSecondi ? new Date(Number(quando) * 1000) : new Date(quando)
  return Number.isNaN(d.getTime()) ? null : d
}

const formattatori = new Map<string, Intl.DateTimeFormat>()

/** I formattatori si fanno una volta per lingua e per forma. */
function formattatore(forma: string, opzioni: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const chiave = `${localeInUso()}|${forma}`
  const trovato = formattatori.get(chiave)
  if (trovato) return trovato
  const nuovo = new Intl.DateTimeFormat(localeInUso(), opzioni)
  formattatori.set(chiave, nuovo)
  return nuovo
}

const FORMA_DATA_ORA: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
const FORMA_DATA: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
const FORMA_ORA: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" }
const FORMA_ORA_MINUTI: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }

/** «7 ott 2026, 13:15». Un'istante non leggibile si scrive «data non valida», non si nasconde. */
export function dataOra(quando: string | number): string {
  const d = comeData(quando)
  return d ? formattatore("dataOra", FORMA_DATA_ORA).format(d) : t("data non valida", "invalid date")
}

/** «7 ott 2026». */
export function data(quando: string | number): string {
  const d = comeData(quando)
  return d ? formattatore("data", FORMA_DATA).format(d) : t("data non valida", "invalid date")
}

/** «13:15:02». */
export function ora(quando: string | number): string {
  const d = comeData(quando)
  return d ? formattatore("ora", FORMA_ORA).format(d) : t("ora non valida", "invalid time")
}

/** «13:15». */
export function oraMinuti(quando: string | number): string {
  const d = comeData(quando)
  return d ? formattatore("oraMinuti", FORMA_ORA_MINUTI).format(d) : t("ora non valida", "invalid time")
}

/** «2026-10-07T13:15», l'ora di casa di un istante, come la vuole un campo di giorno e ora; vuoto se non si legge. */
export function perCampoDataOra(quando: string | number): string {
  const d = comeData(quando)
  if (!d) return ""
  const due = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}`
}

/** L'istante come numero di millisecondi, o `null` se non si legge. */
export function istante(quando: string | number): number | null {
  return comeData(quando)?.getTime() ?? null
}

/** «23 giu 2026» da «2026-06-23» (giorni dell'archivio, senza fuso). */
export function giorno(aaaammgg: string): string {
  const [a, m, g] = aaaammgg.split("-").map(Number)
  if (!a || !m || !g) return aaaammgg
  return formattatore("data", FORMA_DATA).format(new Date(a, m - 1, g))
}

/** I nomi inglesi dei quadri dello stile di serie (`stile.json`): i quadri si chiamano per il loro nome italiano, che è anche quello che i piani scrivono. */
const QUADRI_IN_INGLESE: Record<string, string> = {
  "sagoma-su-animazione": "silhouette over animation",
  "sagoma-al-centro": "centered silhouette",
  "girato-e-sagoma": "footage and silhouette",
  "sagoma-sul-girato": "silhouette over footage",
  "sagoma-sul-girato-con-scena": "silhouette over footage with scene",
  "schermo-e-viso": "screen and face",
  "schermo-e-viso-scuro": "screen and face, dark",
  "girato-pieno": "full footage",
  "solo-animazione": "animation only",
  "lungo-girato": "long-form footage",
  "lungo-schermo": "long-form screen",
  "lungo-animazione": "long-form animation",
  "schermo-con-scheda": "screen with card",
  "schermo-pieno": "full screen",
  "schermo-pieno-scuro": "full screen, dark",
  "girato-con-scritte": "footage with overlays",
  "girato-con-animazione": "footage with animation",
}

const COLORI_IN_INGLESE: Record<string, string> = {
  carta: "paper",
  carta_scura: "dark paper",
  grigio: "grey",
  filo: "hairline",
  inchiostro: "ink",
  rosso: "red",
  blu: "blue",
  nero: "black",
  bianco: "white",
  giallo: "yellow",
  verde: "green",
}

const FORMATI_IN_INGLESE: Record<string, string> = { verticale: "vertical", orizzontale: "horizontal" }

/** Il nome di un colore dello stile di serie: in inglese quello inglese; un colore del creator resta col suo nome. */
export const nomeColore = (nome: string): string => (lingua() === "en" ? COLORI_IN_INGLESE[nome] : undefined) ?? nome

/** Il nome di un formato dello stile di serie (verticale, orizzontale), come i colori. */
export const nomeFormato = (nome: string): string => (lingua() === "en" ? FORMATI_IN_INGLESE[nome] : undefined) ?? nome

/** Il nome di un quadro come lo dice una persona: «sagoma-su-animazione» → «Sagoma su animazione» (in inglese «Silhouette over animation»). Un quadro del creator, che non è nell'elenco, resta col suo nome. */
export function nomeQuadro(nome: string): string {
  const parole = (lingua() === "en" ? QUADRI_IN_INGLESE[nome] : undefined) ?? nome.replace(/-/g, " ")
  return parole.charAt(0).toUpperCase() + parole.slice(1)
}
