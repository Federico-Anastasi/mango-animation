/** `[secondo del video nella scena, secondo della scena]`. */
export type Ancora = readonly [number, number];

/** Dove sta la scena quando il video è a `secondo`. Fra due ancore la scena scorre al suo passo e poi aspetta la parola dopo; se il parlato è più svelto, si stringe. */
export function nellaScena(ancore: readonly Ancora[], secondo: number): number {
  const punti: readonly Ancora[] = [[0, 0], ...ancore];
  let i = punti.length - 1;
  while (i > 0 && (punti[i]?.[0] ?? 0) > secondo) i--;
  const [r0, s0] = punti[i] ?? [0, 0];
  const dopo = punti[i + 1];
  if (!dopo) return s0 + (secondo - r0);
  const [r1, s1] = dopo;
  return r1 - r0 >= s1 - s0 ? s0 + Math.min(secondo - r0, s1 - s0) : s0 + ((secondo - r0) * (s1 - s0)) / (r1 - r0);
}
