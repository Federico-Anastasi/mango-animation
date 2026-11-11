// Come un video che suona sotto il girato gli sta dietro senza saltare a ogni fotogramma.

/** Oltre questo scarto un video che segue salta; sotto, accelera o rallenta finché non ci è sopra. */
const SALTO_S = 1
/** Di quanto al più cambia la velocità mentre rincorre: metà in più o in meno. */
const RINCORSA = 0.5
const IN_PARI_S = 0.02

/** Cosa fa un video che deve stare a `voluto` mentre suona. Un salto che ci mette più di un fotogramma,
 * rifatto a ogni fotogramma, lascerebbe il video fermo sull'ultima immagine decodificata: mentre salta non
 * si tocca, e salta avanti di quanto ci ha messo l'ultima volta. */
export function inseguimento(stato: { attuale: number; voluto: number; cercando: boolean; ritardoSalto: number }): { salto: number | null; velocita: number } {
  const { attuale, voluto, cercando, ritardoSalto } = stato
  if (cercando) return { salto: null, velocita: 1 }
  const scarto = voluto - attuale
  if (Math.abs(scarto) > SALTO_S) return { salto: voluto + ritardoSalto, velocita: 1 }
  if (Math.abs(scarto) < IN_PARI_S) return { salto: null, velocita: 1 }
  return { salto: null, velocita: 1 + Math.min(Math.max(scarto, -RINCORSA), RINCORSA) }
}
