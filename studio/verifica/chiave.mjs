// Entrare in un server vero dalle prove (`docs/API.md`, «La chiave delle API»): la chiave sta in `archivio/arrivi/chiave-api.json` della cartella
// di lavoro del server (MANGO_ANIMATION_LAVORO), e una pagina del browser la riceve da `/entra`, che la mette in un cookie, come fa l'app.
import { readFileSync } from "node:fs"
import { join } from "node:path"

/** La chiave del server che usa la cartella di lavoro `lavoro`; l'errore dice cosa manca. */
export function chiaveDelServer(lavoro = process.env.MANGO_ANIMATION_LAVORO) {
  if (!lavoro) throw new Error("Manca MANGO_ANIMATION_LAVORO: la cartella di lavoro del server, da cui si legge la chiave.")
  const file = join(lavoro, "archivio", "arrivi", "chiave-api.json")
  try {
    return JSON.parse(readFileSync(file, "utf-8")).chiave
  } catch {
    throw new Error(`Non leggo la chiave del server in ${file}: il server di questa cartella è mai partito?`)
  }
}

/** Le intestazioni da mettere a una richiesta diretta al server (`fetch`, `pagina.request`). */
export const intestazioniDelServer = (lavoro) => ({ "X-Chiave-Api": chiaveDelServer(lavoro) })

/** Apre `/entra` nella pagina: da lì il cookie è del suo contesto e le richieste della pagina passano. */
export async function entra(pagina, origine, lavoro) {
  const risposta = await pagina.goto(`${origine}/entra?chiave=${encodeURIComponent(chiaveDelServer(lavoro))}`)
  if (!risposta?.ok()) throw new Error(`Il server ${origine} non accetta la chiave di ${lavoro ?? process.env.MANGO_ANIMATION_LAVORO}: è il server di un'altra cartella?`)
}
