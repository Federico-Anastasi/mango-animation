// Salva i fotogrammi chiave delle scene in foto/ e ne controlla testo, fascia, lati e sfondo. Esce con 1 se qualcosa non va.
// Uso: bun run foto -- [sigla ...]   (senza sigle: tutte)
// Rapporto su stdout: una riga col percorso di ogni fotogramma e, se qualcosa non va, la riga `@controlli` seguita da una riga `- …` per segnalazione,
// nella lingua di chi ha chiesto il lavoro. Chi legge il rapporto (il server) lo riconosce da `@controlli`, mai dalle frasi.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { FASCIA } from "../src/standard/stile";
import { caricaRegistro } from "./catalogo";
import { apri, assicuraCostruita, palcoDellaScena, RADICE } from "./comune";
import { dice } from "./lingua";
import { stileUnito } from "./percorsi";

const stile = stileUnito();
const uscita = join(RADICE, "foto");
const MINIMO_TESTO = 40;
/** Il controllo dello sfondo confronta due fotogrammi a questa distanza, ogni PASSO secondi. */
const DISTANZA = 1;
const PASSO = 0.5;

const quadro = stile.quadri["sagoma-su-animazione"];
const sagoma = quadro.strati.find((strato) => strato.tipo === "sagoma");
const RIQUADRI = [
  { nome: "testa", x0: 0, y0: sagoma?.testa ?? 0, x1: quadro.sottotitoli.x, y1: stile.formati.verticale.alto },
  { nome: "sottotitoli", x0: quadro.sottotitoli.x, y0: quadro.sottotitoli.y - stile.sottotitoli.corpo * 1.5, x1: quadro.sottotitoli.x + quadro.sottotitoli.largo, y1: quadro.sottotitoli.y + stile.sottotitoli.corpo * 1.5 },
];

/** Ciò che non va in un fotogramma chiave, com'è misurato nella pagina: la frase si fa fuori, nella lingua in uso. */
export type Problema =
  | { tipo: "manca-il-palco" }
  | { tipo: "testo-tagliato" | "testo-fuori-fascia" | "testo-nei-lati" | "testo-esce"; misure: string; testo: string }
  | { tipo: "testo-piccolo"; misure: string; testo: string; corpo: string; minimo: number }
  | { tipo: "disegno-fuori-fascia" | "disegno-nei-lati"; misure: string };

/** Il marcatore che apre le segnalazioni nel rapporto: non è una frase e non cambia con la lingua. */
export const RIGA_DEI_CONTROLLI = "@controlli";

const arrotondato = (t: number) => String(Math.round(t * 100) / 100);
/** Il secondo nel nome di un file, sempre con la virgola. */
const nelNome = (t: number) => arrotondato(t).replace(".", ",");
/** Il secondo in una frase, scritto come la lingua in uso. */
const secondi = (t: number) => dice(nelNome(t), arrotondato(t));

export function fraseDelProblema(p: Problema): string {
  switch (p.tipo) {
    case "manca-il-palco":
      return dice("manca il palco", "the stage is missing");
    case "testo-tagliato":
      return dice(`testo tagliato da ciò che lo contiene (${p.misure}): «${p.testo}»`, `text cut off by what contains it (${p.misure}): «${p.testo}»`);
    case "testo-piccolo":
      return dice(`testo sotto i ${p.minimo} px (${p.corpo}): «${p.testo}»`, `text under ${p.minimo} px (${p.corpo}): «${p.testo}»`);
    case "testo-fuori-fascia":
      return dice(`testo fuori fascia (${p.misure}): «${p.testo}»`, `text outside the band (${p.misure}): «${p.testo}»`);
    case "testo-nei-lati":
      return dice(`testo nei lati che il telefono taglia (${p.misure}): «${p.testo}»`, `text in the sides the phone cuts off (${p.misure}): «${p.testo}»`);
    case "testo-esce":
      return dice(`testo che esce dal suo riquadro: «${p.testo}»`, `text that overflows its box: «${p.testo}»`);
    case "disegno-fuori-fascia":
      return dice(`disegno fuori fascia (${p.misure})`, `drawing outside the band (${p.misure})`);
    case "disegno-nei-lati":
      return dice(`disegno nei lati che il telefono taglia (${p.misure})`, `drawing in the sides the phone cuts off (${p.misure})`);
  }
}

/**
 * Dove sta ciò che si legge, in x, perché il telefono non lo tagli. Una scena trasparente il montaggio la mette sopra il girato a tutto
 * fotogramma senza rimpicciolirla (`girato-con-animazione`, `girato-con-scritte`): deve stare lei dentro i lati. Le altre il quadro le stringe
 * dentro i lati (`sagoma-al-centro`, `solo-animazione`: l'`area` dell'animazione) o le tiene nella fascia; in orizzontale non si taglia niente.
 */
export function latiDaControllare(scena: { trasparente?: boolean }, palco: { width: number; height: number }): [number, number] | null {
  if (scena.trasparente !== true || palco.width >= palco.height) return null;
  return [stile.telefono.margine_lati, palco.width - stile.telefono.margine_lati];
}

async function main() {
  const registro = await caricaRegistro();
  const richieste = Bun.argv.slice(2);
  const mancanti = richieste.filter((s) => !registro.scene[s]);
  if (mancanti.length) throw new Error(dice(`Non esiste una scena «${mancanti.join("», «")}» in animazioni/. Le sigle sono: ${Object.keys(registro.scene).join(", ")}.`, `There is no scene «${mancanti.join("», «")}» in animazioni/. The codes are: ${Object.keys(registro.scene).join(", ")}.`));
  await assicuraCostruita();
  mkdirSync(uscita, { recursive: true });

  const { scena: apriScena, errori, chiudi } = await apri(registro);
  const segnalazioni: string[] = [];
  try {
    for (const id of richieste.length ? richieste : Object.keys(registro.scene)) {
      const pagina = await apriScena(id);
      const { istanti, fascia, durata } = await pagina.evaluate(() => {
        const a = window.animazione;
        return { istanti: [...(a?.fotogrammi ?? [])], fascia: a?.fascia ? [...a.fascia] : null, durata: a?.durata ?? 0 };
      });
      const palco = palcoDellaScena(registro, id);
      // In verticale sotto la fascia entrano testa e sottotitoli; in orizzontale la scena ha tutto il fotogramma.
      const verticale = palco.height > palco.width;
      const dentro = fascia ?? (verticale ? [FASCIA.x0, FASCIA.y0, FASCIA.x1, FASCIA.y1] : [0, 0, palco.width, palco.height]);
      const lati = latiDaControllare(registro.scene[id]?.scena ?? {}, palco);
      if (!istanti.length) segnalazioni.push(dice(`${id}: nessun fotogramma chiave`, `${id}: no key frame`));

      for (const t of istanti) {
        await pagina.evaluate((s) => window.animazione?.vai(s), t);
        const problemi = await pagina.evaluate(
          ([minimo, [fx0, fy0, fx1, fy1], lati]) => {
            const out: Problema[] = [];
            const palco = document.querySelector<HTMLElement>(".palco");
            if (!palco) return [{ tipo: "manca-il-palco" } satisfies Problema];
            const origine = palco.getBoundingClientRect();
            const k = origine.width / palco.offsetWidth;
            const opacita = (el: Element) => {
              let o = 1;
              for (let e: Element | null = el; e && e !== palco; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
              return o;
            };
            // La parte che si vede: il riquadro tagliato dai contenitori che nascondono ciò che esce (una pagina ingrandita oltre il fotogramma).
            const riquadro = (el: Element) => {
              let { left, right, top, bottom } = el.getBoundingClientRect();
              for (let e = el.parentElement; e && e !== palco; e = e.parentElement) {
                if (getComputedStyle(e).overflow === "visible") continue;
                const c = e.getBoundingClientRect();
                [left, right, top, bottom] = [Math.max(left, c.left), Math.min(right, c.right), Math.max(top, c.top), Math.min(bottom, c.bottom)];
              }
              return [(left - origine.left) / k, (right - origine.left) / k, (top - origine.top) / k, (bottom - origine.top) / k].map(Math.round) as [number, number, number, number];
            };
            const fuori = ([x0, x1, y0, y1]: [number, number, number, number]) => x0 < fx0! - 1 || x1 > fx1! + 1 || y0 < fy0! - 1 || y1 > fy1! + 1;
            const neiLati = ([x0, x1]: [number, number, number, number]) => lati !== null && (x0 < lati[0] - 1 || x1 > lati[1] + 1);
            // Un fondo da un bordo all'altro non si legge: che il telefono ne tagli un pezzo non conta.
            const fondo = ([x0, x1]: [number, number, number, number]) => x0 <= 0 && x1 >= palco.offsetWidth;
            for (const el of palco.querySelectorAll("*")) {
              if (opacita(el) < 0.5) continue;
              const cs = getComputedStyle(el);
              const r = riquadro(el);
              const misure = `${r[0]}-${r[1]} × ${r[2]}-${r[3]}`;
              if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) {
                const testo = (el.textContent ?? "").trim().slice(0, 30);
                const pieno = el.getBoundingClientRect();
                if ((pieno.right - pieno.left) / k - (r[1] - r[0]) > 2 || (pieno.bottom - pieno.top) / k - (r[3] - r[2]) > 2) out.push({ tipo: "testo-tagliato", misure, testo });
                if (parseFloat(cs.fontSize) < minimo! - 0.1) out.push({ tipo: "testo-piccolo", misure, testo, corpo: cs.fontSize, minimo: minimo! });
                if (fuori(r)) out.push({ tipo: "testo-fuori-fascia", misure, testo });
                if (neiLati(r)) out.push({ tipo: "testo-nei-lati", misure, testo });
                // Solo per i riquadri html: su un <text> svg scrollWidth non misura il testo (raddoppia con textAnchor="middle").
                if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1) out.push({ tipo: "testo-esce", misure, testo });
              } else if ((cs.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(cs.borderTopWidth) > 0) && r[1] > r[0] && r[3] > r[2]) {
                if (fuori(r)) out.push({ tipo: "disegno-fuori-fascia", misure });
                if (neiLati(r) && !fondo(r)) out.push({ tipo: "disegno-nei-lati", misure });
              }
            }
            return out;
          },
          [MINIMO_TESTO, dentro, lati] as const,
        );
        segnalazioni.push(...problemi.map((p) => dice(`${id} a ${secondi(t)} s: ${fraseDelProblema(p)}`, `${id} at ${secondi(t)} s: ${fraseDelProblema(p)}`)));
        const file = join(uscita, `${id}-${nelNome(t)}s.png`);
        await pagina.screenshot({ path: file });
        console.log(file);
      }

      // Lo sfondo non resta mai fermo: due fotogrammi a un secondo di distanza, prima dell'ultimo secondo, non sono identici.
      // Una scena trasparente non è uno sfondo: sotto scorre il girato.
      const trasparente = registro.scene[id]?.scena.trasparente === true;
      const ferme: number[] = [];
      const visti = new Map<number, Buffer>();
      const vedi = async (t: number) => {
        const gia = visti.get(t);
        if (gia) return gia;
        await pagina.evaluate((s) => window.animazione?.vai(s), t);
        const foto = await pagina.screenshot();
        visti.set(t, foto);
        return foto;
      };
      for (let t = 0; !trasparente && t + DISTANZA <= durata - 1 + 1e-9; t += PASSO) {
        if ((await vedi(t)).equals(await vedi(t + DISTANZA))) ferme.push(t);
      }
      for (let i = 0; i < ferme.length; ) {
        let j = i;
        while (j + 1 < ferme.length && Math.abs((ferme[j + 1] ?? 0) - (ferme[j] ?? 0) - PASSO) < 1e-9) j++;
        segnalazioni.push(dice(`${id} da ${secondi(ferme[i] ?? 0)} s a ${secondi((ferme[j] ?? 0) + DISTANZA)} s: lo sfondo resta fermo`, `${id} from ${secondi(ferme[i] ?? 0)} s to ${secondi((ferme[j] ?? 0) + DISTANZA)} s: the background stays still`));
        i = j + 1;
      }

      if (!verticale) {
        await pagina.close();
        continue;
      }
      // In più, l'ultimo fotogramma con i riquadri dove nel montato entrano la testa e i sottotitoli.
      await pagina.evaluate((s) => window.animazione?.vai(s), durata);
      await pagina.evaluate((riquadri) => {
        const palco = document.querySelector(".palco");
        for (const { nome, x0, y0, x1, y1 } of riquadri) {
          const d = document.createElement("div");
          d.style.cssText = `position:absolute;left:${x0}px;width:${x1 - x0}px;top:${y0}px;height:${y1 - y0}px;border:4px dashed #5F5D56;box-sizing:border-box;color:#5F5D56;font:600 40px Instrument Sans,sans-serif;padding:12px 20px`;
          d.textContent = nome;
          palco?.appendChild(d);
        }
      }, RIQUADRI);
      await pagina.screenshot({ path: join(uscita, `${id}-riquadri.png`) });
      await pagina.close();
    }
  } finally {
    await chiudi();
  }

  segnalazioni.push(...errori);
  if (segnalazioni.length) {
    console.log(`${RIGA_DEI_CONTROLLI}\n- ${segnalazioni.join("\n- ")}`);
    process.exitCode = 1;
  }
}

if (import.meta.main)
  main().catch((errore: unknown) => {
    console.error(errore instanceof Error ? errore.message : String(errore));
    process.exit(1);
  });
