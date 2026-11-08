import { curve, decimali, tra, type Curva, type Scena, type ScenaProps, type Video } from "../../impianto";
import { Misura } from "../../standard/barra";
import { Velocita } from "../../standard/corsia";
import { Appare } from "../../standard/entrate";
import { Avanzamento, doveIlPuntatore, Finestra, Pulsante, Puntatore } from "../../standard/finestra";
import { Numero } from "../../standard/numero";
import { Campo, CAMPO, Scatola } from "../../standard/palco";
import { Collegamento, fra, Nodo, Pacchetto, Utente, vaEViene } from "../../standard/schema";
import { FASCIA, FORMATO } from "../../standard/stile";
import { Titolo } from "../../standard/titolo";

// Un'anteprima per ogni elemento standard, tutte con qualcosa che si muove fino in fondo: lo sfondo non resta mai fermo.

function Palco({ t }: ScenaProps) {
  const giro = vaEViene(t / 2.4);
  return (
    <>
      <div style={{ position: "absolute", ...CAMPO, border: "3px solid var(--filo)" }} />
      <Campo>
        <Appare t={t} da={0.2} className="an-etichetta" style={{ fontSize: 40 }}>
          palco
        </Appare>
        <Appare t={t} da={0.4}>
          <Numero testo={`${FORMATO.largo} × ${FORMATO.alto}`} unita="px" corpo={72} />
        </Appare>
        <Appare t={t} da={1.4} className="an-etichetta" style={{ fontSize: 40, marginTop: 36 }}>
          fascia utile
        </Appare>
        <Appare t={t} da={1.6}>
          <Numero testo={`${FASCIA.x1 - FASCIA.x0} × ${FASCIA.y1 - FASCIA.y0}`} unita="px" corpo={72} rosso />
        </Appare>
        <Appare t={t} da={2.6} sposta={[0, 0]} style={{ marginTop: 36 }}>
          <Scatola style={{ width: 200, height: 100, marginLeft: giro * (CAMPO.width - 200) }} />
        </Appare>
      </Campo>
    </>
  );
}

const MODI: readonly (readonly [nome: string, curva: Curva])[] = [
  ["entra", curve.entra],
  ["dolce", curve.dolce],
  ["lineare", curve.lineare],
];

function Entrate({ t }: ScenaProps) {
  return (
    <Campo>
      <Appare t={t} da={0.2} className="an-display" style={{ fontSize: 64, marginBottom: 40 }}>
        come entra
      </Appare>
      {MODI.map(([nome, curva], i) => (
        <Appare key={nome} t={t} da={0.9 + i * 0.5} style={{ marginBottom: 34 }}>
          <div className="an-etichetta" style={{ fontSize: 40, marginBottom: 8 }}>
            {nome}
          </div>
          <div style={{ position: "relative", height: 56, borderBottom: "5px solid var(--filo)" }}>
            <div style={{ position: "absolute", top: 0, width: 56, height: 56, background: "var(--inchiostro)", left: tra(t % 3.6, 0.3, 2.4, 0, CAMPO.width - 56, curva) }} />
          </div>
        </Appare>
      ))}
    </Campo>
  );
}

function Numeri({ t }: ScenaProps) {
  return (
    <Campo>
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <Appare t={t} da={0.3}>
          <Numero testo={decimali(tra(t, 0.5, 1.2, 0, 1.3, curve.dolce), 1)} unita="GB/s" corpo={130} />
        </Appare>
        <Appare t={t} da={1.8}>
          <Numero testo={decimali(tra(t, 2, 1.2, 0, 0.2, curve.dolce), 1)} unita="token/s" corpo={130} rosso />
        </Appare>
        <Appare t={t} da={3.4}>
          <Numero testo={decimali(Math.max(0, t - 3.4) * 7.3, 2)} unita="token scritti" corpo={84} />
        </Appare>
      </div>
    </Campo>
  );
}

function Barre({ t }: ScenaProps) {
  const respiro = 1 + 0.06 * Math.sin(t * 1.6);
  return (
    <Campo>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        <Misura t={t} da={0.3} nome="il modello" valore={254 * respiro} cifre={0} unita="GB" frazione={respiro / 1.06} barra="var(--inchiostro)" />
        <Misura t={t} da={2.2} nome="la scheda" valore={22} cifre={0} unita="GB" frazione={22 / 254} />
        <Misura t={t} da={4.1} nome="il resto" valore={232} cifre={0} unita="GB" frazione={232 / 254} rosso barra="var(--rosso)">
          <div style={{ position: "absolute", left: `${(22 / 254) * 100}%`, top: -10, bottom: -10, width: 5, background: "var(--inchiostro)", opacity: tra(t, 6, 0.5, 0, 1) }} />
        </Misura>
      </div>
    </Campo>
  );
}

function Corsie({ t }: ScenaProps) {
  return (
    <Campo>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <Velocita t={t} traccia={0.3} numero={0.9} valore={3} cifre={0} nome="piano" rosso />
        <Velocita t={t} traccia={1.8} numero={2.4} valore={12} cifre={0} nome="svelto" />
        <Appare t={t} da={4} className="an-etichetta" style={{ fontSize: 40 }}>
          una cella per ogni token, alla velocità vera
        </Appare>
      </div>
    </Campo>
  );
}

function Finestre({ t }: ScenaProps) {
  const fine = 7;
  return (
    <Campo>
      <div style={{ position: "relative", height: "100%" }}>
        <Finestra titolo="Copia in corso…" style={{ left: 0, top: 0, width: 890 }}>
          <div style={{ padding: "26px 24px 30px" }}>
            <div className="an-testo" style={{ fontSize: 48, color: "#000000", whiteSpace: "nowrap", marginBottom: 24 }}>
              Copia di 254 GB
            </div>
            <Avanzamento parte={tra(t, 0.2, fine - 0.2, 0, 1, curve.lineare)} />
          </div>
        </Finestra>
        {t >= fine && (
          <Finestra titolo="Copia completata" style={{ left: 120, top: 290, width: 650 }}>
            <div className="an-testo" style={{ padding: "34px 28px 28px", fontSize: 52, color: "#000000" }}>
              Tutto copiato.
            </div>
            <Pulsante premuto={t >= fine + 1.8}>OK</Pulsante>
          </Finestra>
        )}
        <Puntatore dove={doveIlPuntatore(t, [640, 80], [[fine + 0.6, [440, 500]]])} />
      </div>
    </Campo>
  );
}

const NODI = [[150, 300], [445, 140], [740, 300]] as const;
const FILI = [[0, 1], [1, 2], [0, 2]] as const;

function Schema({ t }: ScenaProps) {
  return (
    <Campo>
      <div style={{ position: "relative", height: 600 }}>
        <svg width="890" height="600" style={{ position: "absolute", inset: 0 }}>
          {FILI.map(([a, b], k) => (
            <Collegamento key={k} da={NODI[a]} a={NODI[b]} opacita={tra(t, 1.2 + k * 0.4, 0.5, 0, 1)} />
          ))}
          <Collegamento da={NODI[1]} a={[445, 470]} opacita={tra(t, 3, 0.5, 0, 1)} />
        </svg>
        {FILI.map(([a, b], k) => (
          <Pacchetto key={k} dove={fra(NODI[a], NODI[b], vaEViene(t * 0.7 + k * 0.45))} lato={24} opacita={tra(t, 1.8 + k * 0.4, 0.4, 0, 1)} />
        ))}
        <Pacchetto dove={fra(NODI[1], [445, 470], vaEViene(t * 0.9))} lato={24} opacita={tra(t, 3.4, 0.4, 0, 1)} />
        {NODI.map((dove, i) => (
          <Nodo key={i} dove={dove} largo={150} alto={100} visto={tra(t, 0.2 + i * 0.3, 0.5, 0, 1)}>
            <span className="an-display" style={{ fontSize: 48 }}>
              {["A", "B", "C"][i]}
            </span>
          </Nodo>
        ))}
        <Utente x={445} y={460} opacita={tra(t, 3, 0.5, 0, 1)} />
      </div>
    </Campo>
  );
}

const TITOLI = ["Il mio gatto batte il robot", "Tre prove, un solo vincitore", "Ho acceso la lampada"];

function TitoloDelVideo({ t }: ScenaProps) {
  const quale = Math.floor(t / 2.5) % TITOLI.length;
  return (
    <>
      <Titolo testo={TITOLI[quale] ?? ""} />
      <div style={{ position: "absolute", left: 0, top: 220, height: 6, width: `${tra(t, 0, 7.5, 0, 100, curve.lineare)}%`, background: "var(--inchiostro)" }} />
    </>
  );
}

const scene: Record<string, Scena> = {
  "std-palco": {
    titolo: "STD · Il palco e la fascia",
    voce: "Il palco è il fotogramma intero; la scena disegna nella fascia, e sotto entrano la testa e i sottotitoli.",
    parole: ["il palco", "la fascia utile", "sotto: testa e sottotitoli"],
    durata: 8,
    fotogrammi: [0.9, 2.2, 3.4, 7.9],
    Componente: Palco,
  },
  "std-entrate": {
    titolo: "STD · I modi di entrare",
    voce: "Ciò che compare parte deciso e si posa piano; ciò che si sposta parte piano e arriva piano.",
    parole: ["entra", "dolce", "lineare"],
    durata: 8,
    fotogrammi: [1.0, 1.7, 2.3, 3.1, 7.9],
    Componente: Entrate,
  },
  "std-numero": {
    titolo: "STD · Il numero che conta",
    voce: "Il numero conta fino al suo valore; l’unità gli sta accanto, e il rosso è il segno della scena.",
    parole: ["il numero", "l’unità", "il rosso"],
    durata: 9,
    fotogrammi: [1.0, 2.5, 4.4, 8.9],
    Componente: Numeri,
  },
  "std-barra": {
    titolo: "STD · La barra",
    voce: "Ogni misura ha il nome, il numero che conta e una barra che cresce insieme al numero.",
    parole: ["il nome", "il numero", "la barra"],
    durata: 10,
    fotogrammi: [1.6, 3.6, 6.2, 9.9],
    Componente: Barre,
  },
  "std-corsia": {
    titolo: "STD · La corsia di token",
    voce: "Una cella per ogni token, alla velocità vera: chi è lento si vede riempire piano.",
    parole: ["una cella a token", "la velocità vera", "piena, ricomincia"],
    durata: 10,
    fotogrammi: [1.4, 3.4, 5.0, 9.9],
    Componente: Corsie,
  },
  "std-finestra": {
    titolo: "STD · La finestra da vecchio computer",
    voce: "Per un attimo la scena si veste da vecchio computer: la finestra, la barra, il bottone e il puntatore.",
    parole: ["la finestra", "la barra", "il bottone"],
    durata: 12,
    fotogrammi: [1.0, 4.0, 7.5, 9.5, 11.9],
    Componente: Finestre,
  },
  "std-schema": {
    titolo: "STD · Lo schema a nodi e fili",
    voce: "I nodi, i fili fra loro e i pacchetti che corrono; chi usa la rete parla con un nodo solo.",
    parole: ["i nodi", "i fili", "chi la usa"],
    durata: 9,
    fotogrammi: [1.0, 2.6, 4.2, 8.9],
    Componente: Schema,
  },
  "std-titolo": {
    titolo: "STD · Il titolo",
    voce: "Il titolo del video: scritta verde su fondo nero, nel posto che dice il quadro.",
    parole: ["fondo nero", "scritta verde", "per tutto il video"],
    durata: 8,
    fotogrammi: [0.5, 3.0, 5.5, 7.9],
    fascia: [0, 0, FORMATO.largo, 250],
    Componente: TitoloDelVideo,
  },
};

export const video: Video = { titolo: "Gli elementi standard", scene };
