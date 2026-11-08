type Oggetto = Record<string, unknown>

const eOggetto = (v: unknown): v is Oggetto => typeof v === "object" && v !== null && !Array.isArray(v)

/** Lo stile del creator da scrivere perché, sovrapposto a quello di serie, dia `completo`: solo ciò che differisce. Una chiave che `completo` non ha non si toglie, resta quella di serie. */
export function differenza(serie: unknown, completo: unknown): unknown {
  if (!eOggetto(serie) || !eOggetto(completo)) return completo
  const diverse = Object.entries(completo).flatMap(([chiave, valore]): [string, unknown][] => {
    const di = serie[chiave]
    if (!(chiave in serie)) return [[chiave, valore]]
    if (Bun.deepEquals(di, valore)) return []
    const d = differenza(di, valore)
    return eOggetto(d) && eOggetto(di) && Object.keys(d).length === 0 ? [] : [[chiave, d]]
  })
  return Object.fromEntries(diverse)
}
