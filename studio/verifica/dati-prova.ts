// I tre file di girato dell'archivio di prova: dove sono le parole, cioè quando c'è voce e quando silenzio.
// L'audio sintetico segue queste stesse parole, così onda, trascrizione e suono dicono la stessa cosa.
export interface ParolaProva {
  p: string
  da: number
  a: number
}

export interface FileProva {
  file: string
  tipo: "ripresa" | "diretta"
  largo: number
  alto: number
  durata: number
  tono: number
  frasi: string[]
  parole: ParolaProva[]
  /** Un rettangolo del fotogramma con un altro contenuto (la webcam di una diretta), se c'è. */
  webcam?: [number, number, number, number]
}

function paroleDa(frasi: string[]): { parole: ParolaProva[]; fine: number } {
  const parole: ParolaProva[] = []
  let t = 0.2
  for (const frase of frasi) {
    for (const p of frase.split(" ")) {
      parole.push({ p, da: Math.round(t * 100) / 100, a: Math.round((t + 0.38) * 100) / 100 })
      t += 0.45
    }
    t += 0.75
  }
  return { parole, fine: t }
}

function file(f: Omit<FileProva, "parole" | "durata">): FileProva {
  const { parole, fine } = paroleDa(f.frasi)
  return { ...f, parole, durata: Math.ceil(fine + 0.4) }
}

export const FILE_PROVA: FileProva[] = [
  file({
    file: "2026-10-06/20261006-222801-prova-a.mp4",
    tipo: "ripresa",
    largo: 540,
    alto: 960,
    tono: 440,
    frasi: ["ciao a tutti oggi vi mostro un impasto semplice", "che batte il mio vecchio pane", "tre ingredienti e niente magia", "solo farina fatta bene"],
  }),
  file({
    file: "2026-10-06/20261006-223540-prova-b.mp4",
    tipo: "ripresa",
    largo: 540,
    alto: 960,
    tono: 330,
    frasi: ["il segreto è la pazienza", "un impasto da zero", "lievita in frigorifero", "provalo e dimmi com'è andata"],
  }),
  file({
    file: "2026-10-08/diretta-prova-cucina.mp4",
    tipo: "diretta",
    largo: 1280,
    alto: 720,
    tono: 220,
    frasi: ["allora ragazzi guardiamo il forno", "si è bruciato di nuovo", "ma stavolta di pochissimo", "ora vi spiego come ho fatto"],
    webcam: [880, 24, 360, 200],
  }),
]
