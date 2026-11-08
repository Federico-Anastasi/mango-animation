import stile from "virtual:stile";

export const FORMATO = stile.formato;

export const FORMATI = stile.formati;

const fascia = stile.quadri["sagoma-su-animazione"].fascia_animazione;
if (fascia.length !== 4) throw new Error("stile.json: fascia_animazione vuole quattro numeri [x0, y0, x1, y1]");

/** La fascia utile dell'animazione: sotto entrano la testa e i sottotitoli, e da `y1` in giù non si disegna niente. */
export const FASCIA = { x0: fascia[0]!, y0: fascia[1]!, x1: fascia[2]!, y1: fascia[3]! };

/** La fascia utile del quadro `nome` (la scena nel video ha il quadro del suo piano, non sempre quello di serie). */
export function fasciaDi(nome: string): typeof FASCIA {
  const f = (stile.quadri as Record<string, { fascia_animazione?: number[] }>)[nome]?.fascia_animazione;
  if (!f || f.length !== 4) throw new Error(`stile.json: il quadro «${nome}» non ha una fascia_animazione di quattro numeri [x0, y0, x1, y1]`);
  return { x0: f[0]!, y0: f[1]!, x1: f[2]!, y1: f[3]! };
}

export const TITOLO = { ...stile.titolo, ...stile.quadri["sagoma-su-animazione"].titolo } as const;
