/** Peso di un fotogramma non compresso: larghezza × altezza × 3 byte (rosso, verde e blu a 8 bit). È un conto, senza fonte esterna né data. */
export const fotogrammi = [
  { nome: "480p", larghezza: 854, altezza: 480 },
  { nome: "1080p", larghezza: 1920, altezza: 1080 },
  { nome: "4K", larghezza: 3840, altezza: 2160 },
] as const;

export const megabyte = (fotogramma: (typeof fotogrammi)[number]): number => (fotogramma.larghezza * fotogramma.altezza * 3) / 1e6;
