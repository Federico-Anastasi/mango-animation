// I campi del profilo come li scrive chi li corregge a mano (testi e liste di righe) e come li vuole `PUT /api/profilo` (`docs/PROFILO.md`).
import type { ProfiloDelCreator, SezioniDelProfilo } from "../tipi"

export interface CanaleScritto {
  piattaforma: string
  nome: string
  formato: string
}

export interface ProfiloScritto {
  nome: string
  lingua: string
  livello: string
  linguaPubblico: string
  /** Le testate separate da virgole. */
  testate: string
  canali: CanaleScritto[]
  /** Una cosa per riga. */
  nonSiDice: string
}

export const FORMATI = ["verticale", "orizzontale"] as const

const righe = (testo: string): string[] => testo.split("\n").map((r) => r.trim()).filter((r) => r !== "")

export function daProfilo(p: ProfiloDelCreator): ProfiloScritto {
  const testate = p.pubblico?.testate
  return {
    nome: p.creator?.nome ?? "",
    lingua: p.creator?.lingua ?? "",
    livello: p.pubblico?.livello ?? "",
    linguaPubblico: p.pubblico?.lingua ?? "",
    testate: Array.isArray(testate) ? testate.join(", ") : (testate ?? ""),
    canali: (p.canali ?? []).map((c) => ({ piattaforma: c.piattaforma, nome: c.nome ?? "", formato: c.formato ?? "" })),
    nonSiDice: (p.non_si_dice ?? []).join("\n"),
  }
}

const senzaVuoti = <T extends Record<string, string | string[]>>(campi: T): Partial<T> => Object.fromEntries(Object.entries(campi).filter(([, v]) => v.length > 0)) as Partial<T>

/**
 * Le quattro sezioni come le vuole il server: una sezione senza niente dentro è `null` e il server la toglie dal file.
 * Un nome vuoto parte com'è, e il controllo dello schema dice che manca.
 */
export function inSezioni(s: ProfiloScritto): SezioniDelProfilo {
  const testate = s.testate.split(",").map((r) => r.trim()).filter((r) => r !== "")
  const pubblico = senzaVuoti({ livello: s.livello.trim(), lingua: s.linguaPubblico, testate })
  const canali = s.canali.map((c) => ({ piattaforma: c.piattaforma, ...senzaVuoti({ nome: c.nome.trim(), formato: c.formato }) }))
  const nonSiDice = righe(s.nonSiDice)
  return {
    creator: { nome: s.nome.trim(), ...senzaVuoti({ lingua: s.lingua }) },
    pubblico: Object.keys(pubblico).length > 0 ? pubblico : null,
    canali: canali.length > 0 ? canali : null,
    non_si_dice: nonSiDice.length > 0 ? nonSiDice : null,
  }
}
