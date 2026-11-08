import { curve, decimali, tra, type Scena, type ScenaProps, type Video } from "../../impianto";
import { Appare } from "../../standard/entrate";
import { Numero } from "../../standard/numero";
import { Scatola } from "../../standard/palco";
import { passi } from "./dati";

// Un video orizzontale (`formato: "orizzontale"`): la scena ha tutto il fotogramma, 1920 × 1080, e niente fascia da rispettare.

const TOTALE = passi.reduce((somma, p) => somma + p.ms, 0);
const BARRA = { left: 160, top: 560, width: 1600, height: 90 };

function IlViaggio({ t }: ScenaProps) {
  const corsa = tra(t, 3.2, 3.2, 0, 1, curve.dolce);
  let da = 0;
  return (
    <>
      <Appare t={t} da={0.3} className="an-display" style={{ position: "absolute", left: 160, top: 150, fontSize: 96 }}>
        dalla ripresa allo schermo
      </Appare>
      <Appare t={t} da={1} style={{ position: "absolute", left: 160, top: 300 }}>
        <Numero testo={decimali(TOTALE * corsa, 0)} unita="ms in tutto" corpo={120} rosso />
      </Appare>
      <Scatola style={{ position: "absolute", ...BARRA, background: "var(--filo)", borderColor: "var(--filo)" }} />
      {passi.map((p, i) => {
        const largo = (p.ms / TOTALE) * BARRA.width;
        const sinistra = BARRA.left + (da / TOTALE) * BARRA.width;
        da += p.ms;
        const riempito = Math.max(0, Math.min(1, (corsa * TOTALE - (da - p.ms)) / p.ms));
        return (
          <Appare key={p.nome} t={t} da={1.6 + i * 0.5} sposta={[0, 0]} style={{ position: "absolute", left: sinistra, top: BARRA.top, width: largo, height: BARRA.height }}>
            <div style={{ position: "absolute", inset: 0, width: `${riempito * 100}%`, background: i === 1 ? "var(--rosso)" : "var(--blu)" }} />
            <span className="an-testo" style={{ position: "absolute", left: 0, top: BARRA.height + 20, fontSize: 48, whiteSpace: "nowrap" }}>
              {p.nome}
            </span>
          </Appare>
        );
      })}
    </>
  );
}

const scene: Record<string, Scena> = {
  o1: {
    titolo: "O1 · Dalla ripresa allo schermo",
    voce: "Dalla ripresa allo schermo passano cinquanta millisecondi: la parte lunga è la codifica.",
    parole: ["tre passi", "cinquanta millisecondi", "la parte lunga: la codifica"],
    durata: 7.6,
    fotogrammi: [1.4, 2.6, 4.4, 7.5],
    Componente: IlViaggio,
  },
};

export const video: Video = { titolo: "Esempio · video orizzontale", formato: "orizzontale", scene };
