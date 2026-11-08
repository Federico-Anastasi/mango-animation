// I processi che gli strumenti lanciano (il motore, le foto delle scene, ffmpeg) con un tempo massimo.
import { resolve } from "node:path"
import { ErroreStrumento } from "./api"

/** Le foto che tornano al modello hanno il lato lungo di questa misura: leggibili (i sottotitoli restano nitidi) senza riempire il contesto. */
const LATO_FOTO = 960

interface Esito {
  codice: number
  stdout: string
  stderr: string
}

/** Lancia `comando`; se non finisce in `secondi` lo ferma per PID con i suoi figli. */
export async function lancia(comando: string[], opzioni: { cwd: string; env: Record<string, string>; secondi: number }): Promise<Esito> {
  const nome = comando.slice(0, 4).join(" ")
  let processo: Bun.Subprocess<"ignore", "pipe", "pipe">
  try {
    processo = Bun.spawn(comando, { cwd: opzioni.cwd, env: { ...process.env, ...opzioni.env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  } catch (causa) {
    throw new ErroreStrumento(`Non riesco ad avviare «${comando[0]}»: controlla che sia installato e nel PATH (${causa instanceof Error ? causa.message : String(causa)}).`)
  }
  let scaduto = false
  const timer = setTimeout(() => {
    scaduto = true
    Bun.spawn(["taskkill", "/PID", String(processo.pid), "/T", "/F"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" })
  }, opzioni.secondi * 1000)
  const [stdout, stderr, codice] = await Promise.all([new Response(processo.stdout).text(), new Response(processo.stderr).text(), processo.exited])
  clearTimeout(timer)
  if (scaduto) throw new ErroreStrumento(`«${nome}» non ha finito entro ${opzioni.secondi} secondi e l'ho fermato.`)
  // Su Windows Python va a capo con CR+LF: al modello arriva il testo con il solo LF.
  return { codice, stdout: stdout.replace(/\r\n/g, "\n"), stderr: stderr.replace(/\r\n/g, "\n") }
}

/** L'errore da dare al modello per un comando uscito con un codice diverso da 0: la frase che ha scritto, o il suo codice. */
export function erroreDi(comando: string, { codice, stderr }: Esito): ErroreStrumento {
  return new ErroreStrumento(stderr.trim() || `«${comando}» è uscito con codice ${codice} senza dire perché.`)
}

/** Un'immagine rimpicciolita (JPEG, in base64), pronta per il contenuto MCP. */
export async function rimpicciolisci(ffmpeg: string | null, file: string): Promise<{ type: "image"; data: string; mimeType: "image/jpeg" }> {
  if (!ffmpeg) throw new ErroreStrumento("ffmpeg non è installato (o non è nel PATH): serve per rimpicciolire le foto prima di mandarle.")
  const filtro = `scale=w=${LATO_FOTO}:h=${LATO_FOTO}:force_original_aspect_ratio=decrease`
  const processo = Bun.spawn([ffmpeg, "-v", "error", "-nostdin", "-i", resolve(file), "-vf", filtro, "-frames:v", "1", "-q:v", "5", "-f", "mjpeg", "-"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [immagine, errori, codice] = await Promise.all([new Response(processo.stdout).arrayBuffer(), new Response(processo.stderr).text(), processo.exited])
  if (codice !== 0) throw new ErroreStrumento(`Non riesco a rimpicciolire «${file}»: ${errori.trim().split("\n").pop() || `ffmpeg è uscito con codice ${codice}`}.`)
  return { type: "image", data: Buffer.from(immagine).toString("base64"), mimeType: "image/jpeg" }
}
