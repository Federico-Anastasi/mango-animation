// I numeri sono in mono, ma la virgola decimale resta in proporzione: nella cella fissa del mono aprirebbe un buco.
export function Cifre({ testo }: { testo: string }) {
  return (
    <span className="num">
      {testo.split(/([,.])/).map((pezzo, i) => (i % 2 ? <i key={i} className="sep">{pezzo}</i> : pezzo))}
    </span>
  );
}

interface NumeroProps {
  /** Il testo già formattato (`decimali`): le cifre fisse non cambiano larghezza mentre il numero conta. */
  testo: string;
  unita: string;
  corpo?: number;
  rosso?: boolean;
  opacita?: number;
}

/** Il numero che conta: cifre in mono, l'unità accanto, in rosso quando è il segno della scena. */
export function Numero({ testo, unita, corpo = 84, rosso = false, opacita }: NumeroProps) {
  return (
    <span style={{ color: rosso ? "var(--rosso)" : "var(--inchiostro)", whiteSpace: "nowrap", opacity: opacita }}>
      <span className="an-num" style={{ fontSize: corpo }}>
        <Cifre testo={testo} />
      </span>
      <span className="an-testo" style={{ fontSize: 44, marginLeft: 12 }}>
        {unita}
      </span>
    </span>
  );
}
