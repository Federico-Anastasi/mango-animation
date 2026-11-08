import type { Scena, ScenaProps, Video } from "../../impianto";
import { Misura } from "../../standard/barra";
import { Appare } from "../../standard/entrate";
import { Campo } from "../../standard/palco";
import { Collegamento, Nodo, Pacchetto, vaEViene } from "../../standard/schema";
import { fotogrammi, megabyte } from "./dati";

// Scene con ancore: ogni cosa entra a un istante suo, e il montaggio lega le ancore del piano alle parole del parlato.

const PIU_GRANDE = Math.max(...fotogrammi.map(megabyte));

function PesoDiUnFotogramma({ t }: ScenaProps) {
  return (
    <Campo>
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        {fotogrammi.map((f, i) => (
          <Misura key={f.nome} t={t} da={0.3 + i * 1.4} nome={f.nome} valore={megabyte(f)} cifre={1} unita="MB" frazione={megabyte(f) / PIU_GRANDE} rosso={i === fotogrammi.length - 1} barra={i === fotogrammi.length - 1 ? "var(--rosso)" : "var(--blu)"} />
        ))}
      </div>
    </Campo>
  );
}

const NODO = { largo: 240, alto: 130, y: 200 };
const RETE = { ripresa: 120, computer: 445, schermo: 770 } as const;
const BINARIO_Y = 400;
const GIRO_S = 2.4;

function IlGiro({ t }: ScenaProps) {
  const x = RETE.ripresa + (RETE.schermo - RETE.ripresa) * vaEViene(Math.max(0, t - 2) / GIRO_S);
  const visto = (da: number) => Math.min(1, Math.max(0, (t - da) / 0.5));
  return (
    <Campo>
      <div style={{ position: "relative", width: 890, height: 540 }}>
        <svg width={890} height={540} style={{ position: "absolute", inset: 0 }}>
          <Collegamento da={[RETE.ripresa, NODO.y]} a={[RETE.computer, NODO.y]} opacita={visto(0.6)} />
          <Collegamento da={[RETE.computer, NODO.y]} a={[RETE.schermo, NODO.y]} opacita={visto(1.1)} />
          <Collegamento da={[RETE.ripresa, BINARIO_Y]} a={[RETE.schermo, BINARIO_Y]} opacita={visto(1.6)} />
        </svg>
        {(
          [
            ["ripresa", RETE.ripresa, 0.3],
            ["computer", RETE.computer, 0.8],
            ["schermo", RETE.schermo, 1.3],
          ] as const
        ).map(([nome, x0, da]) => (
          <Nodo key={nome} dove={[x0, NODO.y]} largo={NODO.largo} alto={NODO.alto} visto={visto(da)}>
            <span className="an-display" style={{ fontSize: 40 }}>
              {nome}
            </span>
          </Nodo>
        ))}
        <Pacchetto dove={[x, BINARIO_Y]} lato={34} opacita={visto(2)} colore="var(--rosso)" />
        <Appare t={t} da={3.4} className="an-etichetta" style={{ position: "absolute", left: 0, top: 450, fontSize: 40 }}>
          un fotogramma alla volta
        </Appare>
      </div>
    </Campo>
  );
}

const scene: Record<string, Scena> = {
  e1: {
    titolo: "E1 · Il peso di un fotogramma",
    voce: "Un fotogramma non compresso pesa poco più di un megabyte in bassa definizione, sei megabyte in full HD, venticinque in 4K.",
    parole: ["un fotogramma", "pesa quanto la sua risoluzione", "in 4K, venticinque megabyte"],
    durata: 5.6,
    fotogrammi: [0.9, 2.1, 3.5, 5.5],
    Componente: PesoDiUnFotogramma,
  },
  e2: {
    titolo: "E2 · Il giro di un fotogramma",
    voce: "Dalla ripresa al computer, dal computer allo schermo: uno alla volta, avanti e indietro.",
    parole: ["la ripresa", "il computer", "lo schermo"],
    durata: 8,
    fotogrammi: [0.9, 2.4, 3.8, 5, 7.9],
    Componente: IlGiro,
  },
};

export const video: Video = { titolo: "Esempio · scene con le ancore", scene };
