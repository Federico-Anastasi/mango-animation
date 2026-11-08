// I sottotitoli VTT di un video in rete come testo col minuto: una riga per frase nuova, «mm:ss testo».

const TEMPO = /^(\d+):(\d{2}):(\d{2})\.\d{3} -->/
const ENTITA: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"', "&#39;": "'" }

const minuto = (ore: number, minuti: number, secondi: number): string => `${String(ore * 60 + minuti).padStart(2, "0")}:${String(secondi).padStart(2, "0")}`

const pulita = (riga: string): string =>
  riga
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/g, (e) => ENTITA[e] ?? e)
    .replace(/\s+/g, " ")
    .trim()

/** Le righe dei sottotitoli col minuto in cui cominciano. Si legge riga per riga: un blocco può avere righe vuote dopo l'orario, e la riga
 * subito prima di un orario è il nome del blocco. I sottotitoli automatici di YouTube ripetono in ogni blocco la riga del blocco prima: quella
 * non si riscrive (la stessa frase detta più avanti sì). */
export function righeDaVtt(vtt: string): string[] {
  const righe = vtt.replace(/\r\n/g, "\n").split("\n")
  const blocchi: { inizio: string; testo: string[] }[] = []
  righe.forEach((riga, i) => {
    const tempo = TEMPO.exec(riga)
    if (tempo) {
      const [, ore = "0", minuti = "0", secondi = "0"] = tempo
      blocchi.push({ inizio: minuto(Number(ore), Number(minuti), Number(secondi)), testo: [] })
      return
    }
    const testo = pulita(riga)
    if (testo.length > 0 && !TEMPO.test(righe[i + 1] ?? "")) blocchi.at(-1)?.testo.push(testo)
  })
  return blocchi.flatMap(({ inizio, testo }, k) => {
    const prima = new Set(blocchi[k - 1]?.testo ?? [])
    const nuove = testo.filter((r) => !prima.has(r))
    return nuove.length > 0 ? [`${inizio} ${nuove.join(" ")}`] : []
  })
}
