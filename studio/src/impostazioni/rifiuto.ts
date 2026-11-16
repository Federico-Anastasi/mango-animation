// La frase di un rifiuto dell'app: rifiuta con un testo, un errore o `{ message }`; se non dice niente vale `scorta`.
export function fraseDi(e: unknown, scorta: string): string {
  const m = typeof e === "object" && e !== null ? (e as { message?: unknown }).message : e
  return typeof m === "string" && m !== "" ? m : scorta
}
