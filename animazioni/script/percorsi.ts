import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { leggiStile } from "../../strumenti/stile.mjs";
import type StileDiSerie from "../../stile.json";

export type Stile = typeof StileDiSerie;

export const ANIMAZIONI = fileURLToPath(new URL("../", import.meta.url));
export const CODICE = resolve(ANIMAZIONI, "..");
export const SRC = join(ANIMAZIONI, "src");

/** La cartella dei dati di chi usa il prodotto, se la variabile la indica (`docs/ARCHITETTURA.md`, «La cartella di lavoro»). */
export const lavoroDa = (ambiente: Record<string, string | undefined> = process.env): string | undefined => ambiente["MANGO_ANIMATION_LAVORO"] || undefined;

/** Le scene del creator: `<lavoro>/animazioni/scene/<slug>/scene.tsx`. */
export const sceneDelCreator = (lavoro: string | undefined): string | undefined => (lavoro ? join(lavoro, "animazioni", "scene") : undefined);

/** Lo stile di serie con sopra quello del creator, come lo vede la pagina. */
export const stileUnito = (lavoro: string | undefined = lavoroDa()): Stile => leggiStile(CODICE, lavoro) as Stile;

const chiave = (percorso: string): string => {
  const dritto = resolve(percorso).replaceAll("\\", "/");
  return process.platform === "win32" ? dritto.toLowerCase() : dritto;
};

/** Il file sta dentro la cartella (Windows non distingue maiuscole e minuscole, e i percorsi arrivano con l'una o l'altra barra). */
export const dentro = (cartella: string, file: string): boolean => chiave(file).startsWith(chiave(cartella) + "/");
