// Le scene di `animazioni/`, per video: le dice `bun run --cwd animazioni elenco`. Si lancia una volta
// e si rifà quando cambia qualcosa in `animazioni/src/scene/` o nelle scene del creator (`<lavoro>/animazioni/scene/`), annunciando l'elenco
// nuovo se è diverso; se non va, `{}` e l'errore nel log.
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Opzioni } from "./configurazione"
import { jsonDaTesto } from "./disco"
import { osserva } from "./osservatore"

export type ScenePerVideo = Record<string, { sigla: string; titolo: string; durata: number }[]>

async function lancia(comando: string[]): Promise<ScenePerVideo> {
  try {
    const processo = Bun.spawn(comando, { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [uscita, errori, codice] = await Promise.all([new Response(processo.stdout).text(), new Response(processo.stderr).text(), processo.exited])
    if (codice !== 0) throw new Error(errori.trim().split("\n").pop() || `il comando è uscito con codice ${codice}`)
    const letto = jsonDaTesto(uscita.slice(Math.max(0, uscita.indexOf("{"))))?.valore
    if (typeof letto !== "object" || letto === null || Array.isArray(letto) || !Object.values(letto).every(Array.isArray)) {
      throw new Error("l'elenco non è un oggetto di liste di scene")
    }
    return letto as ScenePerVideo
  } catch (errore) {
    console.error(`animazioni: non riesco a leggere l'elenco delle scene (${errore instanceof Error ? errore.message : String(errore)}).`)
    return {}
  }
}

export class Animazioni {
  private risultato: Promise<ScenePerVideo>
  private readonly osservatori: { chiudi: () => void }[]

  constructor(
    private readonly opzioni: Opzioni["animazioni"],
    rimbalzoMs: number,
    sceneDelCreator: string,
    private readonly cambiate: () => void,
  ) {
    this.risultato = lancia(opzioni.comando)
    // La cartella delle scene del creator può nascere dopo l'avvio: se non c'è, nessuno la guarderebbe.
    mkdirSync(sceneDelCreator, { recursive: true })
    this.osservatori = [join(opzioni.cartella, "src", "scene"), sceneDelCreator]
      .filter((cartella) => existsSync(cartella))
      .map((cartella) =>
        osserva(cartella, {
          ricorsivo: true,
          rimbalzoMs,
          ignora: () => false,
          alCambio: async () => {
            const prima = await this.risultato
            const nuovo = lancia(this.opzioni.comando)
            this.risultato = nuovo
            if (JSON.stringify(await nuovo) !== JSON.stringify(prima)) this.cambiate()
          },
        }),
      )
  }

  ottieni(): Promise<ScenePerVideo> {
    return this.risultato
  }

  chiudi(): void {
    this.osservatori.forEach((osservatore) => osservatore.chiudi())
  }
}
