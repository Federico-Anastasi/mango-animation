// La notazione delle scritte del film, una sola per le didascalie (HTML) e per le scritte sul palco (canvas):
//   W_{Q}  K^{T}   pedice e apice; la lettera davanti diventa corsivo matematico
//   $Q · K$        corsivo matematico sulle lettere fra i dollari
//   [?]            un token: una tessera scura con la scritta ambra
// Un pedice di una lettera è in corsivo, uno più lungo («gate») e ogni apice sono in tondo, come in LaTeX.

export type Pezzo =
  | { tipo: "testo"; testo: string; matematico: boolean }
  | { tipo: "pedice" | "apice"; testo: string; corsivo: boolean }
  | { tipo: "tessera"; testo: string };

const SEGNI = /\[([^\]]+)\]|([_^])\{([^}]*)\}/g;
const LETTERE = /([A-Za-z]+)|([^A-Za-z]+)/g;

/** Il testo scritto in notazione, spezzato nei pezzi da disegnare uno dopo l'altro. */
export function analizza(testo: string): Pezzo[] {
  const pezzi: Pezzo[] = [];
  const aggiungi = (blocco: string, matematico: boolean) => {
    if (!blocco) return;
    if (!matematico) return void pezzi.push({ tipo: "testo", testo: blocco, matematico: false });
    for (const [parte, lettere] of blocco.matchAll(LETTERE)) pezzi.push({ tipo: "testo", testo: parte, matematico: lettere !== undefined });
  };
  const segmenti = testo.split(/\$([^$]*)\$/);
  segmenti.forEach((segmento, s) => {
    const matematico = s % 2 === 1;
    let fine = 0;
    for (const m of segmento.matchAll(SEGNI)) {
      const prima = segmento.slice(fine, m.index);
      fine = m.index + m[0].length;
      if (m[1] !== undefined) {
        aggiungi(prima, matematico);
        pezzi.push({ tipo: "tessera", testo: m[1] });
        continue;
      }
      // La lettera davanti a un pedice o a un apice è il nome della cosa: corsivo matematico.
      const base = /[A-Za-z]$/.test(prima) ? prima.slice(-1) : "";
      aggiungi(prima.slice(0, prima.length - base.length), matematico);
      if (base) pezzi.push({ tipo: "testo", testo: base, matematico: true });
      const apice = m[2] === "^";
      pezzi.push({ tipo: apice ? "apice" : "pedice", testo: m[3]!, corsivo: !apice && m[3]!.length === 1 });
    }
    aggiungi(segmento.slice(fine), matematico);
  });
  return pezzi;
}

/** Il carattere delle formule e le proporzioni dei pezzi, in frazioni del corpo del testo attorno. */
export const MATEMATICO = {
  famiglia: "STIX Two Text",
  peso: 700,
  /** Le lettere con le grazie paiono più piccole di quelle del testo: si alzano un poco. */
  corpo: 1.1,
  /** `sposta` è positivo verso il basso. */
  pedice: { corpo: 0.76, sposta: 0.2 },
  apice: { corpo: 0.76, sposta: -0.28 },
} as const;

/** La tessera del token: un po' più stretta del testo attorno, con aria ai lati. */
export const TESSERA = { corpo: 0.88, aria: 0.2 } as const;
