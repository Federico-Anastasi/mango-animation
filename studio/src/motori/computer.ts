// Cosa ha il computer, per la pagina «Motori»: il ponte che l'app mette nella pagina (`window.__MANGO_ANIMATION__.computer`, `app/src/computer/ponte.rs`) e il giudizio,
// per ogni funzione, su dove può girare. Nel browser senza l'app il ponte non c'è: la pagina non può dire se una scelta è possibile.
import { t } from "../lingua"
import { peso } from "../testo"
import type { NomeMotore } from "../tipi"

export interface SchedaDelComputer {
  /** L'indice di `nvidia-smi`: quello di `macchina.scheda_video` del profilo. */
  indice: number
  nome: string
  memoria_mb: number
  libera_mb: number
  capacita: string | null
}

export interface ComputerLetto {
  schede: SchedaDelComputer[]
  processore: string
  thread: number
  ram_mb: number
  disco_libero_mb: number
}

export interface PonteComputer {
  leggi: () => Promise<ComputerLetto>
}

/** La sezione `macchina` del profilo, per ciò che qui serve. */
export interface MacchinaDelProfilo {
  scheda_video?: number | null
}

export const ponteComputer = (): PonteComputer | null => window.__MANGO_ANIMATION__?.computer ?? null

export interface Giudizio {
  stato: "ok" | "avviso" | "no"
  frase: string
}

const MB = 1024 * 1024
const memoria = (mb: number): string => peso(mb * MB)

// I modelli girano su una scheda NVIDIA con capacità di calcolo 5.0 o più (i pacchetti dell'app); le altre soglie sono quelle di `docs/MOTORI.md`, §2.
const CAPACITA_MINIMA = 5
const CAPACITA_SAGOMA_PROVATA = 7
const MEMORIA_LIBERA_DELLA_SCHEDA_MB: Partial<Record<NomeMotore, number>> = { trascrizione: 2048, allineamento: 2048, dettatura: 2048, sagoma: 6144 }
const RAM_PER_IL_MODELLO_GRANDE_MB = 4096
const THREAD_PER_LA_SAGOMA = 8

const capacitaDi = (scheda: SchedaDelComputer): number | null => {
  const n = Number(scheda.capacita)
  return scheda.capacita !== null && Number.isFinite(n) ? n : null
}

/** Se la funzione gira sulla scheda che il profilo indica (senza indicazione, la prima NVIDIA). */
export function dellaScheda(funzione: NomeMotore, computer: ComputerLetto, macchina: MacchinaDelProfilo): Giudizio {
  if (macchina.scheda_video === null) return { stato: "no", frase: t("Il profilo di questo computer esclude la scheda video: da qui non si può scegliere.", "This computer's profile rules out the video card: it cannot be chosen from here.") }
  if (computer.schede.length === 0) return { stato: "no", frase: t("In questo computer non c'è una scheda NVIDIA.", "This computer has no NVIDIA card.") }
  const scheda = typeof macchina.scheda_video === "number" ? computer.schede.find((s) => s.indice === macchina.scheda_video) : computer.schede[0]
  if (!scheda) {
    return {
      stato: "no",
      frase: t("La scheda {indice} che il profilo indica non c'è: le schede trovate sono {elenco}.", "The card {indice} that the profile names is not there: the cards found are {elenco}.", {
        indice: macchina.scheda_video ?? "",
        elenco: computer.schede.map((s) => `${s.indice} (${s.nome})`).join(", "),
      }),
    }
  }
  const capacita = capacitaDi(scheda)
  if (capacita !== null && capacita < CAPACITA_MINIMA) {
    return {
      stato: "no",
      frase: t("La scheda {nome} è troppo vecchia per i modelli (capacità di calcolo {capacita}: ne serve {minima} o più).", "The card {nome} is too old for the models (compute capability {capacita}: {minima} or more is needed).", {
        nome: scheda.nome,
        capacita: scheda.capacita ?? "",
        minima: CAPACITA_MINIMA.toFixed(1),
      }),
    }
  }
  const serve = MEMORIA_LIBERA_DELLA_SCHEDA_MB[funzione] ?? 0
  if (scheda.libera_mb < serve) {
    return {
      stato: "avviso",
      frase: t("Sulla scheda {nome} ci sono liberi {liberi} e di solito ne servono {serve}: se un altro programma la occupa, il lavoro si ferma.", "The card {nome} has {liberi} free and usually {serve} are needed: if another program is using it, the job stops.", {
        nome: scheda.nome,
        liberi: memoria(scheda.libera_mb),
        serve: memoria(serve),
      }),
    }
  }
  if (funzione === "sagoma" && capacita !== null && capacita < CAPACITA_SAGOMA_PROVATA) {
    return {
      stato: "avviso",
      frase: t("Sulle schede con capacità di calcolo sotto {soglia} (la {nome} ha {capacita}) la sagoma non è ancora provata.", "On cards with compute capability under {soglia} (the {nome} has {capacita}) the silhouette is not tested yet.", {
        soglia: CAPACITA_SAGOMA_PROVATA.toFixed(1),
        nome: scheda.nome,
        capacita: scheda.capacita ?? "",
      }),
    }
  }
  return { stato: "ok", frase: t("Gira sulla scheda {nome}, con {liberi} liberi.", "It runs on the card {nome}, with {liberi} free.", { nome: scheda.nome, liberi: memoria(scheda.libera_mb) }) }
}

export function delProcessore(funzione: NomeMotore, computer: ComputerLetto): Giudizio {
  if (funzione === "sagoma" && computer.thread < THREAD_PER_LA_SAGOMA) {
    return {
      stato: "avviso",
      frase: t("Sul processore la sagoma è lenta: questo ha {thread} thread e ne servono {serve} o più per tempi ragionevoli.", "On the processor the silhouette is slow: this one has {thread} threads and {serve} or more are needed for reasonable times.", {
        thread: computer.thread,
        serve: THREAD_PER_LA_SAGOMA,
      }),
    }
  }
  const conModello = funzione === "trascrizione" || funzione === "allineamento" || funzione === "dettatura"
  if (conModello && computer.ram_mb < RAM_PER_IL_MODELLO_GRANDE_MB) {
    return { stato: "avviso", frase: t("Con {ram} di memoria il modello grande non ci sta: resta quello piccolo, meno preciso.", "With {ram} of memory the large model does not fit: only the small one is left, less accurate.", { ram: memoria(computer.ram_mb) }) }
  }
  return { stato: "ok", frase: t("Gira sul processore ({thread} thread).", "It runs on the processor ({thread} threads).", { thread: computer.thread }) }
}

/** Dove va una funzione senza scelta: la scheda se il profilo non la esclude e una ce n'è che i modelli possono usare, altrimenti il processore. */
export function sceltoDalComputer(funzione: NomeMotore, computer: ComputerLetto, macchina: MacchinaDelProfilo): Giudizio {
  const scheda = dellaScheda(funzione, computer, macchina)
  const giudizio = scheda.stato === "no" ? delProcessore(funzione, computer) : scheda
  return { ...giudizio, frase: t("Decide il computer. {frase}", "The computer decides. {frase}", { frase: giudizio.frase }) }
}

export function giudizioDi(funzione: NomeMotore, dove: "scheda" | "processore" | undefined, computer: ComputerLetto, macchina: MacchinaDelProfilo): Giudizio {
  if (dove === "scheda") return dellaScheda(funzione, computer, macchina)
  if (dove === "processore") return delProcessore(funzione, computer)
  return sceltoDalComputer(funzione, computer, macchina)
}
