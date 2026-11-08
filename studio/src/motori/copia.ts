import { chiedi } from "../api"
import { creaCopia } from "../dati"
import type { Motori } from "../tipi"
import type { MacchinaDelProfilo } from "./computer"

/** I motori del profilo: si rileggono quando il profilo cambia, anche se l'ha cambiato un altro (Claude da terminale). */
export const motori = creaCopia<Motori>(() => chiedi<Motori>("GET", "/api/motori"), (e) => e.tipo === "profilo")

export const scriviMotori = (nuovi: Motori) => chiedi<Motori>("PUT", "/api/motori", nuovi)

/** La sezione `macchina` del profilo (la scheda che i modelli usano): si rilegge quando il profilo cambia. */
export const macchina = creaCopia<MacchinaDelProfilo>(() => chiedi<MacchinaDelProfilo>("GET", "/api/macchina"), (e) => e.tipo === "profilo")
