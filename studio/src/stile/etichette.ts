// Le etichette dei quadri disegnati in scala stanno al centro della loro area: dove due aree coincidono (la persona sopra l'animazione,
// il titolo sopra il girato) si sovrapporrebbero. Qui si cerca a ciascuna il posto più vicino che non ne copra un'altra.

/** Una scritta al centro di un'area che va da `sopra` a `sotto` (in unità del quadro). */
export type Etichetta = { x: number; y: number; testo: string; sopra: number; sotto: number }

/** Alto di una riga, e largo di un carattere medio, in corpi del carattere. */
const ALTEZZA_DELLA_RIGA = 1.4
const LARGHEZZA_DEL_CARATTERE = 0.6

function siCopre(a: { x: number; y: number; testo: string }, b: { x: number; y: number; testo: string }, corpo: number): boolean {
  const larghi = ((a.testo.length + b.testo.length) / 2) * corpo * LARGHEZZA_DEL_CARATTERE
  return Math.abs(a.y - b.y) < corpo * ALTEZZA_DELLA_RIGA && Math.abs(a.x - b.x) < larghi
}

/** Le etichette nello stesso ordine, ognuna con la `y` dove si può scrivere. La prima in ordine non si sposta mai; le altre, solo di righe intere, prima verso
 * il basso poi verso l'alto: dentro la propria area se ci stanno, altrimenti dove c'è posto nel quadro. */
export function disponiEtichette(etichette: Etichetta[], corpo: number, quadro: { largo: number; alto: number }): Etichetta[] {
  const poste: Etichetta[] = []
  const riga = corpo * ALTEZZA_DELLA_RIGA
  const libera = (candidata: Etichetta) => !poste.some((p) => siCopre(p, candidata, corpo))
  const dentro = (y: number, da: number, a: number) => y - corpo / 2 >= da && y + corpo / 2 <= a
  for (const e of etichette) {
    const tentativi = Array.from({ length: Math.ceil(quadro.alto / riga) * 2 }, (_, i) => ({ ...e, y: e.y + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * riga }))
    const scelta =
      [e, ...tentativi].find((c) => libera(c) && dentro(c.y, e.sopra, e.sotto)) ??
      [e, ...tentativi].find((c) => libera(c) && dentro(c.y, 0, quadro.alto)) ??
      e
    poste.push(scelta)
  }
  return poste
}
