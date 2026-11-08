import type { Tempi } from "./impianto";

/** Ciò che un montaggio dà a una scena: i secondi delle sue parole, quanto dura nel video e in che lingua scrivere i testi. */
export interface DalMontaggio {
  tempi: Tempi;
  durata: number;
  lingua?: string;
  /** La fascia utile del quadro della scena nel video, [x0, y0, x1, y1]; senza, quella di serie. */
  fascia?: readonly [number, number, number, number];
}

declare global {
  interface Window {
    /** Per chi registra: porta la scena a un istante e torna quando il fotogramma è disegnato, filmati compresi (`standard/filmato.tsx`). */
    animazione?: {
      vai: (t: number) => Promise<void>;
      imposta: (dati: DalMontaggio) => void;
      durata: number;
      fotogrammi: readonly number[];
      fascia: readonly number[] | undefined;
    };
  }
}
