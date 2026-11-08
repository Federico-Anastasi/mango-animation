import { Color, CubicBezierCurve3, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, Shape, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { limita } from "../../impianto";

// Il mango del marchio, estruso, con la sua sfumatura e il suo riflesso.

/** La sagoma nelle coordinate del suo riquadro 200 × 200 (y verso il basso, come nell'svg). */
const SAGOMA: readonly (readonly [number, number])[][] = [
  [[96, 52]],
  [[142, 40], [182, 78], [176, 126]],
  [[171, 166], [134, 190], [94, 184]],
  [[66, 180], [44, 172], [24, 150]],
  [[34, 150], [42, 144], [44, 132]],
  [[46, 92], [62, 60], [96, 52]],
];
const RIFLESSO = [[78, 78], [62, 90], [56, 108], [56, 126]] as const;
/** La sfumatura del marchio: lungo la diagonale del riquadro del mango, da (0,15; 0,1) a (0,85; 0,95). */
const SFUMATURA = { da: [0.15, 0.1], a: [0.85, 0.95], colori: ["#FFD84A", "#FFA61F", "#F0532B"] } as const;
const BOX = { x0: 24, x1: 180, y0: 46, y1: 187 } as const;
/** Larghezza su altezza del mango. */
export const ASPETTO_MANGO = (BOX.x1 - BOX.x0) / (BOX.y1 - BOX.y0);
const CX = (BOX.x0 + BOX.x1) / 2;
const CY = (BOX.y0 + BOX.y1) / 2;
/** Spessore e smusso del mango in parti della sua altezza. */
const SPESSORE = 0.2;
const SMUSSO = 0.064;

/** Un mango alto `alto`, centrato sull'origine. */
export function creaMango(alto: number) {
  const scala = alto / (BOX.y1 - BOX.y0);
  const daSvg = (x: number, y: number) => [(x - CX) * scala, -(y - CY) * scala] as const;
  const forma = new Shape();
  forma.moveTo(...daSvg(...SAGOMA[0]![0]!));
  for (const [c1, c2, p] of SAGOMA.slice(1) as [number, number][][]) forma.bezierCurveTo(...daSvg(...c1!), ...daSvg(...c2!), ...daSvg(...p!));
  const geometria = new ExtrudeGeometry(forma, {
    depth: SPESSORE * alto,
    curveSegments: 64,
    bevelEnabled: true,
    bevelThickness: SMUSSO * alto,
    bevelSize: SMUSSO * 0.9 * alto,
    bevelSegments: 10,
  });
  geometria.translate(0, 0, (-SPESSORE * alto) / 2);
  // La sfumatura del marchio, vertice per vertice: la posizione nel riquadro dell'svg dice a che punto della diagonale si è.
  const p = geometria.attributes.position!;
  const [g0, g1, g2] = SFUMATURA.colori.map((c) => new Color(c));
  const dx = SFUMATURA.a[0] - SFUMATURA.da[0];
  const dy = SFUMATURA.a[1] - SFUMATURA.da[1];
  const colori: number[] = [];
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) / scala + CX - BOX.x0) / (BOX.x1 - BOX.x0);
    const v = (-p.getY(i) / scala + CY - BOX.y0) / (BOX.y1 - BOX.y0);
    const s = limita(((u - SFUMATURA.da[0]) * dx + (v - SFUMATURA.da[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    if (s < 0.5) c.copy(g0!).lerp(g1!, s / 0.5);
    else c.copy(g1!).lerp(g2!, (s - 0.5) / 0.5);
    colori.push(c.r, c.g, c.b);
  }
  geometria.setAttribute("color", new Float32BufferAttribute(colori, 3));
  const frutto = new Mesh(geometria, new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }));
  // Il riflesso del marchio: un tratto chiaro in rilievo sulla faccia davanti, coi capi tondi.
  const davanti = (SPESSORE / 2 + SMUSSO) * alto + 0.004;
  const [a, b, d, e] = RIFLESSO.map(([x, y]) => new Vector3(...daSvg(x, y), davanti));
  const raggio = 3.5 * scala;
  const crema = new MeshPhysicalMaterial({ color: "#FFF3B0", roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0.75, emissive: "#FFF3B0", emissiveIntensity: 0.15 });
  const tratto = new Mesh(new TubeGeometry(new CubicBezierCurve3(a!, b!, d!, e!), 48, raggio, 12), crema);
  const capi = [a!, e!].map((punto) => {
    const capo = new Mesh(new SphereGeometry(raggio, 12, 8), crema);
    capo.position.copy(punto);
    return capo;
  });
  const mango = new Group();
  mango.add(frutto, tratto, ...capi);
  return mango;
}
