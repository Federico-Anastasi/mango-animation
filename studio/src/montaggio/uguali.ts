/** Due valori JSON uguali nel contenuto, qualunque sia l'ordine delle chiavi. */
export function uguali(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => uguali(x, b[i]))
  const [ka, kb] = [Object.entries(a), Object.entries(b)]
  return ka.length === kb.length && ka.every(([k, v]) => k in b && uguali(v, (b as Record<string, unknown>)[k]))
}
