import { useEffect, useLayoutEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { curve, limita } from "../impianto";
import { C, H, TESSERA_TOKEN, W } from "./aspetto3d";
import { analizza, MATEMATICO, TESSERA } from "./notazione";

// Il palco 3D dei film: una scena three.js che si ridisegna, tutta, per ogni istante t. Niente stato che si accumula fra un
// fotogramma e l'altro: chi aggiorna imposta ogni proprietà a partire da t.

/** La nebbia del palco: abbastanza leggera da non spegnere una veduta larga, abbastanza da far sparire ciò che è molto in fondo.
 * Una ripresa che la cambia la riporta qui prima di chiudere, perché la successiva riparte da questa. */
export const NEBBIA = 0.008;

const FONT = { mono: '"Chivo Mono"', display: '"Archivo"' } as const;
const PESO = { mono: 600, display: 700 } as const;
const FACCE = [
  ["Chivo Mono", String(PESO.mono), "normal"],
  ["Archivo", String(PESO.display), "normal"],
  [MATEMATICO.famiglia, String(MATEMATICO.peso), "normal"],
  [MATEMATICO.famiglia, String(MATEMATICO.peso), "italic"],
] as const;
/** I file dei caratteri sono arrivati: la risposta di `document.fonts.check` non basta, può dire sì prima che comincino a caricarsi. */
const caratteriPronti = () => FACCE.every(([famiglia, peso, stile]) => [...document.fonts].some((f) => f.family === famiglia && f.weight === peso && f.style === stile && f.status === "loaded"));
type Font = keyof typeof FONT;

/** Una scritta su un piano, anche in notazione (`notazione.ts`): si ridisegna quando i caratteri sono arrivati, così non resta col carattere di riserva. */
export class Scritta {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly tela = document.createElement("canvas");
  private texture: CanvasTexture;
  private static readonly tutte = new Set<Scritta>();
  private static cotteColCarattere = false;

  /** Appena i caratteri sono arrivati si ridisegnano tutte, una volta: quelle fatte prima avevano il carattere di riserva. */
  static ricuoci() {
    if (Scritta.cotteColCarattere || !caratteriPronti()) return;
    for (const s of Scritta.tutte) s.cuoci();
    Scritta.cotteColCarattere = true;
  }

  constructor(
    private testo: string,
    private readonly alto: number,
    private colore: string = C.testo,
    private readonly font: Font = "mono",
    private readonly ancora: "sinistra" | "centro" | "destra" = "centro",
  ) {
    Scritta.tutte.add(this);
    this.texture = Scritta.textureDi(this.tela);
    this.mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }));
    this.cuoci();
  }

  private static textureDi(tela: HTMLCanvasElement) {
    const texture = new CanvasTexture(tela);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    return texture;
  }

  private cuoci() {
    const px = 96;
    const g = this.tela.getContext("2d")!;
    const base = `${PESO[this.font]} ${px}px ${FONT[this.font]}`;
    const m = MATEMATICO;
    // Ogni pezzo: il carattere, di quanto scende dalla riga del testo, e la tessera se è un token.
    const pezzi = analizza(this.testo).map((p) => {
      if (p.tipo === "tessera") return { ...p, carattere: `${PESO.mono} ${px * TESSERA.corpo}px ${FONT.mono}`, scende: 0 };
      if (p.tipo === "testo") return { ...p, carattere: p.matematico ? `italic ${m.peso} ${px * m.corpo}px "${m.famiglia}"` : base, scende: 0 };
      const quanto = p.tipo === "pedice" ? m.pedice : m.apice;
      const stile = p.corsivo ? "italic" : "normal";
      return { ...p, carattere: `${stile} ${m.peso} ${px * m.corpo * quanto.corpo}px "${m.famiglia}"`, scende: px * quanto.sposta };
    });
    const larghezze = pezzi.map((p) => {
      g.font = p.carattere;
      return g.measureText(p.testo).width + (p.tipo === "tessera" ? 2 * px * TESSERA.aria : 0);
    });
    const largo = Math.ceil(larghezze.reduce((a, b) => a + b, 0)) + 8;
    // Una texture già mandata alla scheda video tiene le sue misure: se cambiano, se ne fa una nuova.
    if (largo !== this.tela.width) {
      this.texture.dispose();
      this.tela.width = largo;
      this.texture = Scritta.textureDi(this.tela);
      this.mesh.material.map = this.texture;
      this.mesh.material.needsUpdate = true;
    }
    this.tela.width = largo;
    this.tela.height = Math.ceil(px * 1.3);
    g.font = base;
    g.textBaseline = "middle";
    // La riga su cui poggiano le lettere: dove la mette `middle` per il carattere del testo.
    const riga = this.tela.height / 2 - g.measureText("x").alphabeticBaseline;
    g.textBaseline = "alphabetic";
    let x = 4;
    pezzi.forEach((p, i) => {
      g.font = p.carattere;
      if (p.tipo === "tessera") {
        g.fillStyle = TESSERA_TOKEN.fondo;
        g.strokeStyle = TESSERA_TOKEN.filo;
        g.lineWidth = px * 0.03;
        g.beginPath();
        g.roundRect(x + g.lineWidth, riga - px * 0.86, larghezze[i]! - 2 * g.lineWidth, px, px * 0.2);
        g.fill();
        g.stroke();
        g.fillStyle = C.token;
        g.fillText(p.testo, x + px * TESSERA.aria, riga);
      } else {
        g.fillStyle = this.colore;
        g.fillText(p.testo, x, riga + p.scende);
      }
      x += larghezze[i]!;
    });
    this.texture.needsUpdate = true;
    const scala = this.alto / this.tela.height;
    this.mesh.scale.set(this.tela.width * scala, this.alto, 1);
    this.mesh.geometry.dispose();
    const piano = new PlaneGeometry(1, 1);
    piano.translate(this.ancora === "sinistra" ? 0.5 : this.ancora === "destra" ? -0.5 : 0, 0, 0);
    this.mesh.geometry = piano;
  }

  /** Cambia testo o colore; ridisegna solo se serve. */
  imposta(testo: string, colore = this.colore) {
    if (testo === this.testo && colore === this.colore) return;
    this.testo = testo;
    this.colore = colore;
    this.cuoci();
  }

  colora(colore: string) {
    this.imposta(this.testo, colore);
  }

  get largo() {
    return this.mesh.scale.x;
  }
}

export const tessera = (largo: number, alto: number, spessore: number) => new RoundedBoxGeometry(largo, alto, spessore, 3, Math.min(largo, alto, spessore) * 0.18);
export const materia = (colore: string) => new MeshStandardMaterial({ color: new Color(colore), roughness: 0.55, metalness: 0.15 });

export interface Mondo {
  scena: Scene;
  camera: PerspectiveCamera;
}

/** Quanto si allunga in basso il fotogramma virtuale: il disegno sale di metà dello spazio e si stringe, così il centro dell'azione
 * sta sopra la metà del quadro e le didascalie, al centro-basso, non lo coprono. */
export const SPAZIO_DIDASCALIE = 320;
/** L'angolo verticale della camera, in gradi, su tutto il fotogramma quando non c'è fascia. */
export const CAMPO = 34;

interface Palco3DProps<T> {
  t: number;
  spazioSotto: number;
  crea: (mondo: Mondo) => T;
  aggiorna: (t: number, oggetti: T, mondo: Mondo) => void;
}

export function Palco3D<T>({ t, crea, aggiorna, spazioSotto }: Palco3DProps<T>) {
  const tela = useRef<HTMLCanvasElement>(null);
  const stato = useRef<{ renderer: WebGLRenderer; mondo: Mondo; oggetti: T } | null>(null);
  useLayoutEffect(() => {
    const renderer = new WebGLRenderer({ canvas: tela.current!, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    const scena = new Scene();
    scena.background = new Color(C.fondo);
    scena.fog = new FogExp2(C.fondo, NEBBIA);
    scena.add(new AmbientLight("#9fb3d9", 0.9));
    const chiave = new DirectionalLight("#ffffff", 2.6);
    chiave.position.set(-6, 10, 14);
    scena.add(chiave);
    const controluce = new DirectionalLight("#4ccbff", 0.9);
    controluce.position.set(8, -4, -10);
    scena.add(controluce);
    // Si disegna la parte bassa di un fotogramma virtuale più alto, con l'angolo allargato: la scena si stringe di H / (H + spazio)
    // e il suo centro sale di metà dello spazio.
    const allunga = (H + spazioSotto) / H;
    const campo = (2 * Math.atan(Math.tan((CAMPO * Math.PI) / 360) * allunga * allunga) * 180) / Math.PI;
    const camera = new PerspectiveCamera(campo, W / (H + spazioSotto), 0.1, 400);
    camera.setViewOffset(W, H + spazioSotto, 0, spazioSotto, W, H);
    const mondo = { scena, camera };
    stato.current = { renderer, mondo, oggetti: crea(mondo) };
    return () => {
      renderer.dispose();
      stato.current = null;
    };
  }, [crea, spazioSotto]);
  const disegna = useRef(() => {});
  disegna.current = () => {
    const s = stato.current;
    if (!s) return;
    Scritta.ricuoci();
    aggiorna(t, s.oggetti, s.mondo);
    s.renderer.render(s.mondo.scena, s.mondo.camera);
  };
  useLayoutEffect(() => disegna.current(), [t, aggiorna]);
  // Il primo fotogramma si disegna prima che i caratteri arrivino: appena arrivano si ridisegna, anche se t non è cambiato. Chi
  // registra aspetta `document.fonts.ready`, che aspetta questi caricamenti.
  useEffect(() => {
    let vivo = true;
    void Promise.all(FACCE.map(([famiglia, peso, stile]) => document.fonts.load(`${stile} ${peso} 96px "${famiglia}"`))).then(() => vivo && disegna.current());
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <>
      <canvas ref={tela} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H }} />
      {/* I caratteri si caricano solo se qualcosa nella pagina li usa: queste righe invisibili li chiamano. */}
      <div style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
        <span style={{ fontFamily: FONT.mono, fontWeight: PESO.mono }}>0</span>
        <span style={{ fontFamily: FONT.display, fontWeight: PESO.display }}>0</span>
        <span style={{ fontFamily: `"${MATEMATICO.famiglia}"`, fontWeight: MATEMATICO.peso }}>0</span>
        <span style={{ fontFamily: `"${MATEMATICO.famiglia}"`, fontWeight: MATEMATICO.peso, fontStyle: "italic" }}>0</span>
      </div>
    </>
  );
}

/** Una ripresa: ciò che crea la scena e ciò che la porta all'istante t, legati a un palco. */
export function ripresa<T>(crea: (mondo: Mondo) => T, aggiorna: (t: number, oggetti: T, mondo: Mondo) => void, { spazioSotto = SPAZIO_DIDASCALIE } = {}) {
  return function Ripresa({ t }: { t: number }) {
    return <Palco3D t={t} crea={crea} aggiorna={aggiorna} spazioSotto={spazioSotto} />;
  };
}

/** Un punto del percorso della camera: a quel secondo sta lì e guarda là. */
export type Tappa = readonly [secondo: number, da: readonly [number, number, number], verso: readonly [number, number, number]];

/** La camera lungo le sue tappe: fra una e l'altra parte piano e arriva piano. */
export function inquadra(camera: PerspectiveCamera, tappe: readonly Tappa[], t: number) {
  const i = Math.max(1, Math.min(tappe.length - 1, tappe.findIndex(([s]) => s > t)));
  const [s0, da0, verso0] = tappe[i - 1]!;
  const [s1, da1, verso1] = tappe[t >= tappe[tappe.length - 1]![0] ? tappe.length - 1 : i]!;
  const p = s1 > s0 ? curve.dolce(limita((t - s0) / (s1 - s0), 0, 1)) : 1;
  camera.position.set(...mescola(da0, da1, p));
  camera.lookAt(new Vector3(...mescola(verso0, verso1, p)));
}
const mescola = (a: readonly number[], b: readonly number[], p: number): [number, number, number] => [a[0]! + (b[0]! - a[0]!) * p, a[1]! + (b[1]! - a[1]!) * p, a[2]! + (b[2]! - a[2]!) * p];
