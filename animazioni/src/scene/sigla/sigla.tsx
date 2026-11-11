import { Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PlaneGeometry, PointLight } from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { type FontData, FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { limita } from "../../impianto";
import { C, dolce } from "../../standard/aspetto3d";
import { CAMPO, inquadra, type Mondo, ripresa, type Tappa } from "../../standard/palco3d";
import carattere from "./caratteri/space-grotesk.typeface.json";
import { ASPETTO_MANGO, creaMango } from "./mango";
import TEMPI from "./sigla.json";

// La sigla «mango animation», uguale in tutti i film animati: il mango cade da sopra il quadro, tocca, e l'urto corre verso destra
// come un'onda: le lettere di «mango», stese a terra, si rialzano una dopo l'altra, poi quelle di «animation» sotto; passa una luce
// calda e il quadro va al nero. Alla fine il mango sta a sinistra, «mango» a destra e «animation» sotto, larga come «mango».
// Carattere: Space Grotesk bold, in formato three.js (`caratteri/space-grotesk.typeface.json`). I tempi sono in `sigla.json`.

export const DURATA_SIGLA = TEMPI.fine;
export const FOTOGRAMMI_SIGLA = [0.4, 0.66, 0.8, 0.95, 1.15, 1.35, 1.7, 2.1, 2.45, 2.95];

// ───────────── l'impaginazione ─────────────

/** Il blocco è largo quanto il quadro: tre quarti e un poco, con margini ampi anche su un telefono. */
const LARGHEZZA = 4.4;
const QUOTA_QUADRO = 0.78;
const DISTANZA = LARGHEZZA / QUOTA_QUADRO / (2 * Math.tan((CAMPO / 2) * (Math.PI / 180)) * (1080 / 1920));
/** Spaziatura fra le lettere, in corpi. */
const ARIA = 0.03;
/** Il vuoto fra «mango» e «animation», in corpi di «mango». */
const VUOTO = 0.16;
/** Dal mango al testo, in altezze del blocco. */
const STACCO = 0.3;
const PAROLA = "mango";
const SOTTO = "animation";

/** Un glifo come lo scrive `caratteri/crea.py`: avanzo e margini dell'inchiostro, in unità del carattere. */
interface Glifo {
  ha: number;
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
}

interface Posto {
  carattere: string;
  /** Il centro della cella della lettera. */
  x: number;
  /** La larghezza della cella: l'avanzo del carattere, senza la spaziatura. */
  largo: number;
}

interface Riga {
  corpo: number;
  /** La linea di base. */
  y: number;
  posti: Posto[];
}

function impagina(font: Font) {
  const glifi = font.data.glyphs as unknown as Record<string, Glifo>;
  const em = (n: number) => n / font.data.resolution;
  const avanzo = (c: string) => em(glifi[c]!.ha);
  // Il bordo sinistro di una riga sta sull'inchiostro della prima lettera, il destro su quello dell'ultima.
  const larghezzaRiga = (testo: string) => {
    const l = [...testo];
    const tra = l.slice(0, -1).reduce((somma, c) => somma + avanzo(c) + ARIA, 0);
    return tra + em(glifi[l[l.length - 1]!]!.x_max) - em(glifi[l[0]!]!.x_min);
  };
  const inchiostro = (testo: string, chiave: "y_max" | "y_min") => [...testo].map((c) => em(glifi[c]![chiave]));
  // «animation» è scritta più piccola, fino ad avere la larghezza di «mango». Tutto con «mango» di corpo 1; si scala alla fine.
  const corpoSotto = larghezzaRiga(PAROLA) / larghezzaRiga(SOTTO);
  const yParola = corpoSotto * Math.max(...inchiostro(SOTTO, "y_max")) + VUOTO - Math.min(0, ...inchiostro(PAROLA, "y_min"));
  const alto = yParola + Math.max(...inchiostro(PAROLA, "y_max"));
  const largoLogo = alto * ASPETTO_MANGO;
  const s = LARGHEZZA / (largoLogo + alto * STACCO + larghezzaRiga(PAROLA));
  const sinistra = -LARGHEZZA / 2;
  const xTesto = sinistra + (largoLogo + alto * STACCO) * s;
  const riga = (testo: string, corpoRel: number, y: number): Riga => {
    const corpo = corpoRel * s;
    const l = [...testo];
    let x = xTesto - em(glifi[l[0]!]!.x_min) * corpo;
    const posti = l.map((c) => {
      const largo = avanzo(c) * corpo;
      const posto = { carattere: c, x: x + largo / 2, largo };
      x += (avanzo(c) + ARIA) * corpo;
      return posto;
    });
    return { corpo, y: (y - alto / 2) * s, posti };
  };
  return {
    logo: { x: sinistra + (largoLogo * s) / 2, alto: alto * s },
    parola: riga(PAROLA, 1, yParola),
    sotto: riga(SOTTO, corpoSotto, 0),
  };
}

// ───────────── i movimenti ─────────────

/** Quando nasce ogni lettera: «mango» dal mango verso destra, a passo di sigla.json; «animation» quando sale. */
const nascitaParola = (i: number) => TEMPI.lettere + i * TEMPI.passoLettera;
const nascitaSotto = (i: number) => TEMPI.animation + i * TEMPI.passoAnimation;

/** La risposta di una molla smorzata a un gradino da 0 a 1 (ζ sotto 1: supera di poco il bersaglio e si posa). `tau` sono i secondi dal gradino. */
function molla(tau: number, omega: number, zeta = 0.7) {
  if (tau <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * tau) * (Math.cos(wd * tau) + ((zeta * omega) / wd) * Math.sin(wd * tau));
}

/** Lo schiacciamento di un appoggio: breve, forte quanto il colpo. */
const urto = (t: number, quando: number, forza: number) => forza * Math.exp(-(((t - quando - 0.03) / 0.045) ** 2));

const SPESSORE = 0.22;
const SMUSSO = 0.018;

/** Le lettere di una riga: ognuna estrusa, con il suo pivot al centro della cella sulla linea di base. */
function lettere(font: Font, riga: Riga, colore: string, scena: Mondo["scena"]) {
  const materiale = new MeshPhysicalMaterial({ color: colore, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  return riga.posti.map((posto) => {
    const geometria = new TextGeometry(posto.carattere, {
      font,
      size: riga.corpo,
      depth: SPESSORE * riga.corpo,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: SMUSSO * riga.corpo,
      bevelSize: SMUSSO * 0.8 * riga.corpo,
      bevelSegments: 4,
    });
    geometria.translate(-posto.largo / 2, 0, (-SPESSORE * riga.corpo) / 2);
    const pivot = new Group();
    pivot.position.set(posto.x, riga.y, 0);
    pivot.add(new Mesh(geometria, materiale));
    scena.add(pivot);
    return pivot;
  });
}

/** Una lettera si rialza: dal piano (−90°) all'ingresso in piedi, con la molla. */
function rialza(lettera: Group, tau: number, omega: number) {
  lettera.visible = tau > 0;
  lettera.rotation.x = -(Math.PI / 2) * (1 - molla(tau, omega));
}

const font = new FontLoader().parse(carattere as FontData);
const lay = impagina(font);
const TAPPE: readonly Tappa[] = [
  [0, [0, 0.1, DISTANZA * 1.05], [0, 0, 0]],
  [TEMPI.fine, [0, -0.02, DISTANZA * 0.97], [0, 0, 0]],
];

interface Oggetti {
  mango: Group;
  parola: Group[];
  sotto: Group[];
  luce: PointLight;
  velo: Mesh<PlaneGeometry, MeshBasicMaterial>;
}

function crea({ scena, camera }: Mondo): Oggetti {
  const mango = creaMango(lay.logo.alto);
  scena.add(mango);
  const parola = lettere(font, lay.parola, C.testo, scena);
  const sotto = lettere(font, lay.sotto, C.token, scena);
  const luce = new PointLight("#FFD9A0", 0, 12, 2);
  scena.add(luce);
  // Il nero finale è un velo davanti alla camera, dello stesso colore del fondo: l'ultimo fotogramma è il fondo pieno.
  const velo = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ color: C.fondo, transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
  velo.renderOrder = 10;
  velo.position.set(0, 0, -1);
  camera.add(velo);
  scena.add(camera);
  return { mango, parola, sotto, luce, velo };
}

function aggiorna(t: number, o: Oggetti, { camera }: Mondo) {
  inquadra(camera, TAPPE, t);

  // Il mango cade da sopra il quadro, tocca, fa un piccolo salto e si posa al suo posto.
  const cade = limita((t - TEMPI.cade) / (TEMPI.atterra - TEMPI.cade), 0, 1);
  const salto = limita((t - TEMPI.atterra) / (TEMPI.posa - TEMPI.atterra), 0, 1);
  const alto = t < TEMPI.atterra ? 5.6 * (1 - cade * cade) : 0.22 * lay.logo.alto * 4 * salto * (1 - salto);
  const schiaccia = urto(t, TEMPI.atterra, 0.24) + urto(t, TEMPI.posa, 0.1);
  o.mango.visible = t >= TEMPI.cade;
  o.mango.position.set(lay.logo.x, alto - (lay.logo.alto / 2) * schiaccia, 0);
  o.mango.scale.set(1 + 0.55 * schiaccia, 1 - schiaccia, 1 + 0.55 * schiaccia);
  const passa = dolce(t, TEMPI.luce, TEMPI.passa);
  o.mango.rotation.y = -1.3 * (1 - dolce(t, TEMPI.cade, TEMPI.posa - TEMPI.cade)) + 0.22 * Math.sin(Math.PI * passa);
  o.mango.rotation.z = 0.25 * (1 - cade) - 0.06 * Math.sin(Math.PI * salto);

  o.parola.forEach((l, i) => rialza(l, t - nascitaParola(i), 26));
  o.sotto.forEach((l, i) => rialza(l, t - nascitaSotto(i), 34));

  // Una luce calda vera passa davanti, da sinistra a destra, e accende i riflessi.
  o.luce.position.set(-LARGHEZZA / 2 - 1.5 + (LARGHEZZA + 3) * passa, 0.4, 2.8);
  o.luce.intensity = 80 * Math.sin(Math.PI * limita((t - TEMPI.luce + 0.1) / (TEMPI.passa + 0.2), 0, 1));
  o.velo.material.opacity = dolce(t, TEMPI.spegne, TEMPI.nero - TEMPI.spegne);
}

export const Sigla = ripresa(crea, aggiorna, { spazioSotto: 0 });

/** Il logo in coda a un film: la posa della sigla, ferma, prima che si spenga. Entra in dissolvenza negli ultimi secondi. */
export const CODA_LOGO = TEMPI.coda.entra + TEMPI.coda.resta;
export function LogoInCoda({ t, durata }: { t: number; durata: number }) {
  const da = durata - CODA_LOGO;
  if (t < da) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: dolce(t, da, TEMPI.coda.entra) }}>
      <Sigla t={TEMPI.spegne} />
    </div>
  );
}
