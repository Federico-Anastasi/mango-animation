// Il nome di un file che arriva dal telefono e il suo genere. Il nome lo scrive chi manda:
// mai un percorso, mai un nome che Windows non accetta.
export type TipoArrivo = "video" | "immagine" | "audio" | "documento"

export const ESTENSIONI: Record<TipoArrivo, string[]> = {
  video: ["mov", "mp4", "m4v", "hevc", "avi", "mkv", "webm", "3gp", "mts", "mpg", "mpeg"],
  immagine: ["heic", "heif", "jpg", "jpeg", "png", "gif", "webp", "tif", "tiff", "dng", "bmp"],
  audio: ["m4a", "mp3", "wav", "aac", "caf", "aif", "aiff", "flac", "ogg", "opus"],
  documento: ["pdf", "txt", "md", "rtf", "csv", "json", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pages", "numbers", "key"],
}

const ESTENSIONE_DA_MIME: Record<string, string> = {
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf",
}

const RISERVATI = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_NOME = 120
const MAX_NOME_DA_TITOLO = 60

/** Solo il nome del file, senza cartelle, caratteri di controllo o simboli vietati su Windows. */
export function nomePulito(grezzo: string, mime?: string | null): string {
  const ultimo = grezzo.normalize("NFC").split(/[\\/]/).pop() ?? ""
  let nome = ultimo
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
  if (/^\.+$/.test(nome)) nome = ""
  if (!nome) nome = `arrivo${estensioneDaMime(mime) ? `.${estensioneDaMime(mime)}` : ""}`
  const punto = nome.lastIndexOf(".")
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const estensione = punto > 0 ? nome.slice(punto) : ""
  const baseCorta = Array.from(base).slice(0, Math.max(1, MAX_NOME - estensione.length)).join("")
  return RISERVATI.test(baseCorta) ? `_${baseCorta}${estensione}` : `${baseCorta}${estensione}`
}

function estensioneDaMime(mime?: string | null): string | undefined {
  return mime ? ESTENSIONE_DA_MIME[mime.split(";")[0]!.trim().toLowerCase()] : undefined
}

/** Il genere accettato a cui il file appartiene, dall'estensione e, se manca, dal tipo dichiarato. */
export function tipoDi(nome: string, mime?: string | null): TipoArrivo | null {
  const estensione = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : ""
  const daEstensione = (Object.keys(ESTENSIONI) as TipoArrivo[]).find((t) => ESTENSIONI[t].includes(estensione))
  if (daEstensione) return daEstensione
  const m = mime?.split(";")[0]?.trim().toLowerCase() ?? ""
  if (m.startsWith("video/")) return "video"
  if (m.startsWith("image/")) return "immagine"
  if (m.startsWith("audio/")) return "audio"
  return null
}

const due = (n: number): string => String(n).padStart(2, "0")

/** `AAAAMMGG-HHMMSS-<nome>`, all'ora di questo computer. */
export function nomeDestinazione(quando: Date, nome: string): string {
  const data = `${quando.getFullYear()}${due(quando.getMonth() + 1)}${due(quando.getDate())}`
  return `${data}-${due(quando.getHours())}${due(quando.getMinutes())}${due(quando.getSeconds())}-${nome}`
}

/** Un nome di file da un titolo: minuscolo, senza accenti, con i trattini; `null` se non resta niente. */
export function nomeDaTitolo(titolo: string): string | null {
  const base = titolo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NOME_DA_TITOLO)
    .replace(/-+$/, "")
  return base === "" ? null : base
}
