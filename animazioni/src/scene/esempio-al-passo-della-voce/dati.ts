/** Il tempo di un fotogramma è 1000 / fotogrammi al secondo, in millisecondi. È un conto, senza fonte esterna né data. */
export const cadenze = { lenta: 30, veloce: 60 } as const;

export const millisecondi = (fotogrammiAlSecondo: number): number => 1000 / fotogrammiAlSecondo;
