// Un montaggio piccolo e coerente per le prove: due scene, tre pezzi, quattro tratti, otto parole.
import type { DettaglioVideo, ParolaRisolta, PianoCompleto, Piano, Risolto, Stile, Tratto } from "../src/tipi"
import type { Contesto } from "../src/montaggio/ritocchi"

export function pianoDiProva(): PianoCompleto {
  return {
    quadro: "sagoma-su-animazione",
    sorgenti: {
      a: { file: "2026-10-06/a.mp4" },
      b: { file: "2026-10-08/b.mp4", riquadri: { webcam: [1244, 26, 432, 246] }, viste: { gara: { taglio: [720, 280, 960, 720], inserto: [10, 105, 482, 250] } } },
    },
    scene: [
      { nome: "c1", animazione: "c1", pezzi: [{ sorgente: "a", da: 1, a: 9, via: [[3, 3.5]] }] },
      { nome: "gara", quadro: "schermo-e-viso", vista: "gara", pezzi: [{ sorgente: "b", minuto: "0:10", dice: "uno due tre quattro" }] },
    ],
    sottotitoli: { modo: "parola per parola", nomi: [], correzioni: [], ritocchi: [] },
    titolo: { testo: "Un titolo di prova" },
    coda: 0.7,
  }
}

const tratto = (scena: number, pezzo: number, sorgente: string | null, da: number, durata: number, esce: number): Tratto => ({
  scena,
  pezzo,
  sorgente,
  da,
  durata,
  esce,
  vista: null,
  zoom: null,
  legato: [null, null],
  sagoma: null,
})

const parola = (p: string, tr: number, nella: number, da: number, a: number): ParolaRisolta => ({ p, tratto: tr, nella_sorgente: nella, da, a, voto: 0.9 })

export function risoltoDiProva(): Risolto {
  return {
    impronta: "abc",
    formato: { largo: 1080, alto: 1920, fps: 30 },
    durata: 10.5,
    scene: [
      { nome: "c1", quadro: "sagoma-su-animazione", inizio: 0, durata: 7.5, animazione: "c1", ancore: [], tempi: {} },
      { nome: "gara", quadro: "schermo-e-viso", inizio: 7.5, durata: 3, animazione: null, ancore: [], tempi: {} },
    ],
    tratti: [tratto(0, 0, "a", 1, 2, 0), tratto(0, 0, "a", 3.5, 5.5, 2), tratto(1, 0, "b", 10, 1.5, 7.5), tratto(1, 0, "b", 12, 1.5, 9)],
    parole: [
      parola("ciao", 0, 1.2, 0.2, 0.5),
      parola("mondo", 0, 2.0, 1.0, 1.4),
      parola("ancora", 1, 3.6, 2.1, 2.5),
      parola("una", 1, 5.0, 3.5, 3.9),
      parola("uno", 2, 10.1, 7.6, 7.9),
      parola("due", 2, 10.8, 8.3, 8.7),
      parola("tre", 3, 12.1, 9.1, 9.4),
      parola("quattro", 3, 12.8, 9.8, 10.3),
    ],
    battute: [
      { da: 0.2, a: 1.4, testo: "ciao mondo", istanti: [0.2, 1.0] },
      { da: 2.1, a: 3.9, testo: "ancora una", istanti: [2.1, 3.5] },
    ],
    titolo: { testo: "Un titolo di prova", da: 0, a: 10.5 },
    suoni: [],
    avvisi: [],
  }
}

/** Un montaggio con pezzi senza voce (solo `durata`) fra un pezzo con la voce: apertura, parlato, chiusa in due pezzi. */
export function pianoSenzaVoce(): PianoCompleto {
  return {
    quadro: "solo-animazione",
    sorgenti: { a: { file: "2026-10-06/a.mp4" } },
    scene: [
      { nome: "apertura", animazione: "c1", pezzi: [{ durata: 4 }] },
      { nome: "parlato", quadro: "sagoma-su-animazione", animazione: "c2", pezzi: [{ sorgente: "a", da: 1, a: 3 }] },
      { nome: "chiusa", animazione: "c3", pezzi: [{ durata: 3 }, { durata: 2 }] },
    ],
    sottotitoli: { modo: "parola per parola", nomi: [], correzioni: [], ritocchi: [] },
    suoni: [{ file: "disco.wav", scena: "apertura", t: 1, picco: -16 }],
    coda: 0,
  }
}

export function risoltoSenzaVoce(): Risolto {
  return {
    impronta: "senza-voce",
    formato: { largo: 1080, alto: 1920, fps: 30 },
    durata: 11,
    scene: [
      { nome: "apertura", quadro: "solo-animazione", inizio: 0, durata: 4, animazione: "c1", ancore: [], tempi: {} },
      { nome: "parlato", quadro: "sagoma-su-animazione", inizio: 4, durata: 2, animazione: "c2", ancore: [], tempi: {} },
      { nome: "chiusa", quadro: "solo-animazione", inizio: 6, durata: 5, animazione: "c3", ancore: [], tempi: {} },
    ],
    tratti: [tratto(0, 0, null, 0, 4, 0), tratto(1, 0, "a", 1, 2, 4), tratto(2, 0, null, 0, 3, 6), tratto(2, 1, null, 0, 2, 9)],
    parole: [parola("ciao", 1, 1.2, 4.2, 4.5), parola("mondo", 1, 2.0, 5.0, 5.4)],
    battute: [{ da: 4.2, a: 5.4, testo: "ciao mondo", istanti: [4.2, 5.0] }],
    titolo: null,
    suoni: [{ file: "disco.wav", esce: 1, guadagno: -3 }],
    avvisi: [],
  }
}

export function contestoSenzaVoce(): Contesto {
  const effettivo = pianoSenzaVoce()
  return { proprio: structuredClone(effettivo) as Piano, effettivo, risolto: risoltoSenzaVoce() }
}

export function contestoDiProva(): Contesto {
  const effettivo = pianoDiProva()
  return { proprio: structuredClone(effettivo) as Piano, effettivo, risolto: risoltoDiProva() }
}

export function stileDiProva(): Stile {
  return {
    formato: { largo: 1080, alto: 1920, fps: 30 },
    formati: { verticale: { largo: 1080, alto: 1920, fps: 30 }, orizzontale: { largo: 1920, alto: 1080, fps: 30 } },
    colori: { carta: "#F1F0EB", inchiostro: "#17171B", rosso: "#E03A1E", blu: "#1F4B99", nero: "#000000", verde: "#00FF18" },
    caratteri: { titoli: "font/Archivo-700.ttf" },
    voce: { lufs: -16, silenzio_db: -39, margine: 0.09 },
    taglio: { a_tempo: { prima: 0.12, dopo: 0.22, pausa: 0.35, tratto_minimo: 0.3 }, a_parole: { pausa: 0.3, stacco: 0.1, vicine: 3 } },
    sottotitoli: { modo: "parola per parola", scrittura: "minuscola", carattere: "titoli", corpo: 58, corpo_minimo: 38, caratteri_per_battuta: 20, stacco: 0.45, fondo: "carta", colore: "inchiostro", colore_correzione: "rosso", bordo: 3, margine: 22, margine_alto: 12, margine_basso: 18, interlinea: 1.18, passo_corpo: 4, rilievo: { corpo: 84, colore: "rosso", salto: 36, salto_durata: 0.36 } },
    titolo: { carattere: "titoli", corpo: 64, corpo_minimo: 38, passo_corpo: 4, fondo: "nero", colore: "verde", margine: 22, margine_alto: 12, margine_basso: 18, interlinea: 1.18, largo: 960, allinea: "centro", maiuscolo: false, parte: { colore: "blu", stacco: 18 } },
    suoni: { fondo_db: -20, accento_db: -14 },
    copertina: { titolo_in_alto: true, sagoma_del_primo_fotogramma: true },
    uscita: { crf: 18, audio_kbit: 192, leggero: { largo: 720, alto: 1280, crf: 23 } },
    quadri: {
      "sagoma-su-animazione": {
        fondo: "carta",
        strati: [
          { tipo: "animazione", area: [0, 0, 1080, 1920] },
          { tipo: "sagoma", scala_minima: 0.6, testa: 905, x: -70, aria: 70, sfuma: 8 },
        ],
        sottotitoli: { x: 520, y: 1235, largo: 440, ancora: "sinistra" },
        titolo: { x: 540, y: 120, ancora: "centro" },
        fascia_animazione: [90, 250, 980, 850],
      },
      "schermo-e-viso": {
        fondo: "carta",
        strati: [
          { tipo: "girato", area: [0, 170, 1080, 810] },
          { tipo: "inserto", largo: 482, bordo: 16 },
          { tipo: "riquadro", nome: "webcam", y: 1170, scala: 2, raggio: 40 },
        ],
        sottotitoli: { x: 540, y: 1075, largo: 960, ancora: "centro" },
        titolo: { x: 540, y: 90, ancora: "centro" },
      },
      "lungo-schermo": {
        formato: "orizzontale",
        fondo: "nero",
        strati: [
          { tipo: "girato", area: [0, 0, 1920, 1080], adatta: "contieni" },
          { tipo: "viso", nome: "viso", angolo: "basso-destra", largo: 420, margine: 36, raggio: 28 },
        ],
        sottotitoli: { x: 810, y: 960, largo: 1200, ancora: "centro", corpo: 64 },
        titolo: { x: 960, y: 90, ancora: "centro", largo: 1500 },
      },
      "solo-animazione": {
        fondo: "carta",
        strati: [{ tipo: "animazione", area: [54, 96, 972, 1728] }],
        sottotitoli: { x: 540, y: 1380, largo: 900, ancora: "centro" },
        titolo: { x: 540, y: 560, ancora: "centro" },
      },
      "girato-pieno": {
        fondo: "nero",
        strati: [{ tipo: "girato", area: [0, 0, 1080, 1920], centro: [0.5, 0.5] }],
        sottotitoli: { x: 540, y: 1320, largo: 900, ancora: "centro" },
        titolo: { x: 540, y: 300, ancora: "centro" },
      },
    },
  }
}

export function dettaglioDiProva(): DettaglioVideo {
  return dettaglioCon(pianoDiProva(), risoltoDiProva())
}

export function dettaglioSenzaVoce(): DettaglioVideo {
  return dettaglioCon(pianoSenzaVoce(), risoltoSenzaVoce())
}

function dettaglioCon(piano: PianoCompleto, risolto: Risolto): DettaglioVideo {
  return {
    slug: "prova",
    cartella: "C:\\archivio\\video\\prova",
    scheda: { titolo: "Un video di prova", stato: "in lavorazione", creato: "2026-10-06" },
    piano: structuredClone(piano),
    problemi: { scheda: [], piano: [] },
    piano_risolto_da_base: structuredClone(piano),
    risolto,
    risolto_aggiornato: true,
    controllo: null,
    uscite: [],
    montato: null,
    materiali: [],
    puo_annullare: false,
    puo_rifare: false,
    lavoro: null,
    montaggio_superato: false,
    piano_cambiato: null,
    piano_dopo_montato: false,
    fotogrammi: [],
  }
}

export interface UscitaDiProva {
  file: string
  byte: number
  cambiato: string
  stesso_file?: string | null
}

/** Le uscite di un video e il montato che il server ne ricava: la copertina se è lo stesso file o non è più vecchia del finale, altrimenti il finale. */
export function conUscite(uscite: UscitaDiProva[]): Pick<DettaglioVideo, "uscite" | "montato"> {
  const complete = uscite.map((u) => ({ ...u, stesso_file: u.stesso_file ?? null }))
  const nome = (n: string) => complete.find((u) => u.file.endsWith(`/${n}`))
  const finale = nome("finale.mp4")
  const copertina = nome("con-copertina.mp4")
  const scelto = !finale ? copertina : copertina && (copertina.stesso_file === finale.file || finale.stesso_file === copertina.file || Date.parse(copertina.cambiato) >= Date.parse(finale.cambiato)) ? copertina : finale
  return { uscite: complete, montato: scelto ? { file: scelto.file, quando: scelto.cambiato } : null }
}
