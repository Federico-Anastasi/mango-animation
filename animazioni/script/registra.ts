// Rende le scene fotogramma per fotogramma (30 al secondo) e le unisce in un mp4 per scena.
// Uso: bun run registra -- --tempi <tempi.json> --uscita <cartella>   i tempi del montaggio (docs/MOTORE.md)
//      bun run registra -- [--uscita <cartella>] [sigla ...]          i tempi propri delle scene (senza sigle: tutte)
//      bun run registra -- --tempi <tempi.json> --uscita <cartella> --foto <secondo>   un solo fotogramma per scena, al secondo del video nella scena: <sigla>.foto.png
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { caricaRegistro } from "./catalogo";
import { aGruppi, apri, assicuraCostruita, FPS, PARALLELE, palcoDellaScena, RADICE } from "./comune";
import { giaReso, improntaDi, invalida, segnaReso, type VoceTempi } from "./impronta";
import type { Registro } from "../src/registro";
import { nellaScena } from "./tempo";
import { dice } from "./lingua";

/** L'ultima riga di ciò che un programma ha scritto: è quella che dice perché si è fermato. */
const ultimaRiga = (testo: string): string => testo.trim().split("\n").pop()?.trim() ?? "";

const FISSI = [...["registra.ts", "comune.ts", "tempo.ts", "impronta.ts", "percorsi.ts"].map((f) => join(RADICE, "script", f)), join(RADICE, "index.html"), join(RADICE, "vite.config.ts")];

function leggiArgomenti(argomenti: readonly string[]) {
  let tempi: string | undefined;
  let uscita = join(RADICE, "video");
  let foto: number | undefined;
  const sigle: string[] = [];
  for (let i = 0; i < argomenti.length; i++) {
    const a = argomenti[i] ?? "";
    if (a === "--tempi" || a === "--uscita" || a === "--foto") {
      const valore = argomenti[++i];
      if (!valore) throw new Error(dice(`Manca il valore dopo ${a}.`, `The value after ${a} is missing.`));
      if (a === "--tempi") tempi = resolve(valore);
      else if (a === "--uscita") uscita = resolve(valore);
      else if (Number.isFinite(Number(valore)) && Number(valore) >= 0) foto = Number(valore);
      else throw new Error(dice(`Dopo --foto ci vuole un secondo (un numero da 0 in su), non «${valore}».`, `--foto needs a second (a number from 0 up), not «${valore}».`));
    } else if (a.startsWith("--")) throw new Error(dice(`Opzione sconosciuta: ${a}. Si usa: registra [--tempi <file>] [--uscita <cartella>] [--foto <secondo>] [sigla ...]`, `Unknown option: ${a}. Usage: registra [--tempi <file>] [--uscita <folder>] [--foto <second>] [code ...]`));
    else sigle.push(a);
  }
  return { tempi, uscita, sigle, foto };
}

function vociDalMontaggio(file: string): Record<string, VoceTempi> {
  if (!existsSync(file)) throw new Error(dice(`Il file di tempi «${file}» non c'è.`, `The timing file «${file}» does not exist.`));
  let dati: unknown;
  try {
    dati = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(dice(`Il file di tempi «${file}» non è un JSON valido.`, `The timing file «${file}» is not valid JSON.`));
  }
  if (typeof dati !== "object" || dati === null) throw new Error(dice(`«${file}» non è un file di tempi: ci vuole un oggetto con una voce per scena.`, `«${file}» is not a timing file: it needs an object with one entry per scene.`));
  for (const [sigla, voce] of Object.entries(dati)) {
    if (typeof voce?.durata !== "number" || !Array.isArray(voce.ancore)) throw new Error(dice(`Nei tempi la scena «${sigla}» non ha una durata e una lista di ancore.`, `In the timings, scene «${sigla}» has no duration and no list of anchors.`));
  }
  return dati as Record<string, VoceTempi>;
}

/** Un solo fotogramma di ogni scena, `secondo` dopo il suo inizio nel video: `<sigla>.foto.png`. Niente scena intera, niente impronta: serve a vedere il fotogramma composto. */
async function fotogrammi(registro: Registro, sigle: readonly string[], dalMontaggio: Record<string, VoceTempi> | null, uscita: string, secondo: number) {
  const trasparenti = sigle.filter((s) => registro.scene[s]?.scena.trasparente === true);
  if (trasparenti.length) throw new Error(dice(`La scena «${trasparenti.join("», «")}» è trasparente: il suo fotogramma ha bisogno della maschera, e un fotogramma solo non la dà. Per guardarla c'è l'anteprima della scena.`, `Scene «${trasparenti.join("», «")}» is transparent: its frame needs the mask, and a single frame does not give it. To look at it, use the scene preview.`));
  await assicuraCostruita();
  const { scena: apriScena, errori, chiudi } = await apri(registro);
  try {
    for (const sigla of sigle) {
      const { scena } = registro.scene[sigla]!;
      const voce: VoceTempi = dalMontaggio?.[sigla] ?? { durata: scena.durata, ancore: [], tempi: scena.tempi };
      const pagina = await apriScena(sigla);
      await pagina.evaluate((d) => window.animazione?.imposta(d), { tempi: voce.tempi ?? {}, durata: voce.durata, lingua: voce.lingua, fascia: voce.fascia });
      await pagina.evaluate((s) => window.animazione?.vai(s), nellaScena(voce.ancore, secondo));
      writeFileSync(join(uscita, `${sigla}.foto.png`), await pagina.screenshot());
      await pagina.close();
      console.log(dice(`${sigla}: fotogramma a ${secondo} s → ${sigla}.foto.png`, `${sigla}: frame at ${secondo} s → ${sigla}.foto.png`));
    }
    if (errori.length) throw new Error(dice(`La pagina ha dato errore: ${errori.join("; ")}`, `The page gave an error: ${errori.join("; ")}`));
  } finally {
    await chiudi();
  }
  console.log(dice(`animazioni: fotogrammi ${sigle.length}`, `animations: frames ${sigle.length}`));
}

async function main() {
  const { tempi: fileTempi, uscita, sigle, foto } = leggiArgomenti(Bun.argv.slice(2));
  const registro = await caricaRegistro();
  const dalMontaggio = fileTempi ? vociDalMontaggio(fileTempi) : null;
  const richieste = sigle.length ? sigle : dalMontaggio ? Object.keys(dalMontaggio) : Object.keys(registro.scene);
  const mancanti = richieste.filter((s) => !registro.scene[s]);
  if (mancanti.length) throw new Error(dice(`Non esiste una scena «${mancanti.join("», «")}» in animazioni/. Le sigle sono: ${Object.keys(registro.scene).join(", ")}.`, `There is no scene «${mancanti.join("», «")}» in animazioni/. The codes are: ${Object.keys(registro.scene).join(", ")}.`));
  const nonDate = dalMontaggio ? richieste.filter((s) => !dalMontaggio[s]) : [];
  if (nonDate.length) throw new Error(dice(`I tempi non dicono nulla della scena «${nonDate.join("», «")}».`, `The timings say nothing about scene «${nonDate.join("», «")}».`));

  for (const sigla of richieste) {
    const chiesto = dalMontaggio?.[sigla]?.formato;
    const palco = palcoDellaScena(registro, sigla);
    if (chiesto && (chiesto.largo !== palco.width || chiesto.alto !== palco.height))
      throw new Error(dice(`Il montaggio chiede la scena «${sigla}» a ${chiesto.largo}×${chiesto.alto}, ma è disegnata per ${palco.width}×${palco.height}: il quadro della scena nel piano non è del formato del suo video in animazioni/.`, `The edit asks for scene «${sigla}» at ${chiesto.largo}×${chiesto.alto}, but it is drawn for ${palco.width}×${palco.height}: the frame of the scene in the plan does not have the format of its video in animazioni/.`));
  }

  mkdirSync(uscita, { recursive: true });
  if (foto !== undefined) {
    await fotogrammi(registro, richieste, dalMontaggio, uscita, foto);
    return;
  }
  const lavori = await Promise.all(
    richieste.map(async (sigla, i) => {
      const { slug, scena } = registro.scene[sigla]!;
      const palco = palcoDellaScena(registro, sigla);
      const base: VoceTempi = dalMontaggio?.[sigla] ?? { durata: scena.durata, ancore: [], tempi: scena.tempi };
      const voce: VoceTempi = { ...base, formato: { largo: palco.width, alto: palco.height } };
      const file = join(uscita, `${sigla}.mp4`);
      const { valore: impronta, largo } = await improntaDi(RADICE, slug, sigla, voce, FISSI);
      if (largo) console.log(dice(`animazioni: ${sigla}: impronta sull'intera cartella del video, non su ciò che la scena importa (${largo})`, `animations: ${sigla}: fingerprint of the whole video folder, not of what the scene imports (${largo})`));
      const alfa = join(uscita, `${sigla}.alfa.mkv`);
      const trasparente = scena.trasparente === true;
      const resa = (await giaReso(file, impronta)) && existsSync(alfa) === trasparente;
      return { prefisso: `[${i + 1}/${richieste.length}] ${sigla}`, sigla, voce, file, alfa, trasparente, impronta, resa };
    }),
  );
  const daRendere = lavori.filter((l) => !l.resa);
  for (const l of lavori) if (l.resa) console.log(dice(`${l.prefisso}: già resa con questi tempi e questi sorgenti`, `${l.prefisso}: already rendered with these timings and these sources`));

  if (daRendere.length) {
    await assicuraCostruita();
    const { scena: apriScena, errori, chiudi } = await apri(registro);
    try {
      // Le scene si rendono più d'una alla volta, ognuna nella sua pagina e col suo ffmpeg.
      await aGruppi(daRendere, PARALLELE, async ({ prefisso, sigla, voce, file, alfa, trasparente, impronta }) => {
        await invalida(file);
        rmSync(alfa, { force: true });

        const pagina = await apriScena(sigla);
        // Una scena trasparente esce in due file: i colori e, accanto, la maschera di ciò che disegna (bianco pieno, nero vuoto).
        if (trasparente) await pagina.addStyleTag({ content: "html, body, #radice, .pagina, .area, .cornice, .palco { background: transparent !important; }" });
        await pagina.evaluate((d) => window.animazione?.imposta(d), { tempi: voce.tempi ?? {}, durata: voce.durata, lingua: voce.lingua, fascia: voce.fascia });
        const totale = Math.round(voce.durata * FPS) + 1;
        const ffmpeg = Bun.spawn(
          [
            ...["ffmpeg", "-y", "-loglevel", "error", "-framerate", String(FPS), "-f", "image2pipe", "-c:v", "png", "-i", "-"],
            ...(trasparente ? ["-filter_complex", "[0:v]split[c][m];[c]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[colori];[m]alphaextract,format=gray[alfa]", "-map", "[colori]"] : ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p"]),
            ...["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", file],
            ...(trasparente ? ["-map", "[alfa]", "-c:v", "ffv1", alfa] : []),
          ],
          { stdin: "pipe", stdout: "inherit", stderr: "pipe" },
        );
        for (let i = 0; i < totale; i++) {
          await pagina.evaluate((s) => window.animazione?.vai(s), nellaScena(voce.ancore, i / FPS));
          ffmpeg.stdin.write(await pagina.screenshot({ omitBackground: trasparente }));
          await ffmpeg.stdin.flush();
        }
        await ffmpeg.stdin.end();
        await pagina.close();
        const messaggioFfmpeg = await new Response(ffmpeg.stderr).text();
        if ((await ffmpeg.exited) !== 0) throw new Error(dice(`ffmpeg non è riuscito a unire i fotogrammi di «${sigla}»: ${ultimaRiga(messaggioFfmpeg)}`, `ffmpeg could not join the frames of «${sigla}»: ${ultimaRiga(messaggioFfmpeg)}`));
        if (errori.length) throw new Error(dice(`La pagina ha dato errore nella scena «${sigla}»: ${errori.join("; ")}`, `The page gave an error in scene «${sigla}»: ${errori.join("; ")}`));
        await segnaReso(file, impronta);
        console.log(dice(`${prefisso}: ${totale} fotogrammi, ${voce.durata} s → ${file}`, `${prefisso}: ${totale} frames, ${voce.durata} s → ${file}`));
      });
    } finally {
      await chiudi();
    }
  }
  console.log(dice(`animazioni: rese ${daRendere.length}, già rese ${lavori.length - daRendere.length}`, `animations: rendered ${daRendere.length}, already rendered ${lavori.length - daRendere.length}`));
}

main().catch((errore: unknown) => {
  console.error(errore instanceof Error ? errore.message : String(errore));
  process.exit(1);
});
