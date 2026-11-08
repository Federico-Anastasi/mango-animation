import { curve, decimali, tra, type Scena, type ScenaProps, type Video } from "../../impianto";
import { Appare } from "../../standard/entrate";
import { Numero } from "../../standard/numero";
import { Campo } from "../../standard/palco";
import { cadenze, millisecondi } from "./dati";

// Scene al passo del video: gli istanti delle parole arrivano dal montaggio (`tempi`); qui i valori di partenza, per guardarle da sole.
// Ogni cosa entra sulla parola che la nomina.

const CELLE = { lato: 21, passo: 29, perRiga: 30 };

/** Una riga di celle che si riempie alla cadenza vera: una cella a fotogramma. */
function Cadenza({ t, fotogrammiAlSecondo }: { t: number; fotogrammiAlSecondo: number }) {
  const fatte = Math.floor(fotogrammiAlSecondo * t) % (CELLE.perRiga + 1);
  return (
    <div style={{ position: "relative", height: CELLE.lato, width: CELLE.perRiga * CELLE.passo }}>
      {Array.from({ length: fatte }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: i * CELLE.passo, width: CELLE.lato, height: CELLE.lato, background: "var(--inchiostro)" }} />
      ))}
    </div>
  );
}

const TEMPI_CADENZA = { trenta: 1.2, trentatre: 2.8, sessanta: 5.2, sedici: 6.8 };

function UnFotogrammaOgniTanto({ t, tempi }: ScenaProps<typeof TEMPI_CADENZA>) {
  return (
    <Campo>
      {(
        [
          [cadenze.lenta, tempi.trenta, tempi.trentatre, false],
          [cadenze.veloce, tempi.sessanta, tempi.sedici, true],
        ] as const
      ).map(([fps, parlato, risultato, rosso]) => (
        <div key={fps} style={{ marginBottom: 56 }}>
          <Appare t={t} da={parlato} durata={0.4} style={{ marginBottom: 14, minHeight: 80 }}>
            <Numero testo={decimali(fps, 0)} unita="fotogrammi al secondo" corpo={64} />
          </Appare>
          <Cadenza t={t} fotogrammiAlSecondo={fps} />
          <Appare t={t} da={risultato} durata={0.4} style={{ marginTop: 14, minHeight: 80 }}>
            <Numero testo={decimali(millisecondi(fps) * tra(t, risultato, 0.8, 0, 1, curve.dolce), 1)} unita="ms ciascuno" corpo={64} rosso={rosso} />
          </Appare>
        </div>
      ))}
    </Campo>
  );
}

const TEMPI_SCRITTA = { ciascuno: 0.6 };
const FASCIA_SCRITTA = [220, 800, 860, 940] as const;

/** Una scritta sopra il girato, senza sfondo: nel montaggio, fuori da ciò che disegna, resta visibile la ripresa. */
function Scritta({ t, tempi }: ScenaProps<typeof TEMPI_SCRITTA>) {
  return (
    <Appare
      t={t}
      da={tempi.ciascuno}
      durata={0.2}
      sposta={[0, 0]}
      className="an-display"
      style={{ position: "absolute", left: FASCIA_SCRITTA[0], top: FASCIA_SCRITTA[1], width: FASCIA_SCRITTA[2] - FASCIA_SCRITTA[0], height: FASCIA_SCRITTA[3] - FASCIA_SCRITTA[1], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 84, whiteSpace: "nowrap", color: "var(--rosso)", WebkitTextStroke: "12px var(--nero)", paintOrder: "stroke fill" }}
    >
      33,3 ms
    </Appare>
  );
}

const scene: Record<string, Scena> = {
  p1: {
    titolo: "P1 · Un fotogramma ogni tanto",
    voce: "A trenta fotogrammi al secondo, ognuno dura trentatré millisecondi. A sessanta, la metà: sedici.",
    parole: ["trenta al secondo", "ognuno trentatré millisecondi", "a sessanta, sedici"],
    durata: 9.4,
    tempi: TEMPI_CADENZA,
    fotogrammi: [TEMPI_CADENZA.trenta + 1.1, TEMPI_CADENZA.trentatre + 1.1, TEMPI_CADENZA.sessanta + 1.1, 9.35],
    Componente: UnFotogrammaOgniTanto,
  },
  p2: {
    titolo: "P2 · La scritta sopra la ripresa",
    voce: "Ciascuno dura trentatré millisecondi.",
    parole: ["ciascuno", "dura", "trentatré millisecondi"],
    durata: 2.4,
    tempi: TEMPI_SCRITTA,
    fascia: FASCIA_SCRITTA,
    trasparente: true,
    fotogrammi: [TEMPI_SCRITTA.ciascuno + 0.3, 2.3],
    Componente: Scritta,
  },
};

export const video: Video = { titolo: "Esempio · scene al passo del video", scene };
