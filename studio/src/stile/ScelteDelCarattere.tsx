// Il carattere dei sottotitoli e delle animazioni, quello del titolo, e «Aggiungi un carattere»: un file .ttf, .otf o .woff2 dal computer.
import { useRef, useState } from "react"
import { api } from "../api"
import { Bottone } from "../comuni/Bottone"
import { caratteri as copiaCaratteri, useCopia } from "../dati"
import { t } from "../lingua"
import type { Stile } from "../tipi"
import styles from "./ScelteDelCarattere.module.css"

/** Lo stesso limite del server (`MASSIMO_BYTE` in `server/src/caratteri.ts`): un file più grosso non si manda nemmeno. */
const MASSIMO_BYTE = 5 * 1024 ** 2

const base64Di = (file: File): Promise<string> =>
  new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader()
    lettore.onload = () => risolvi(String(lettore.result).split(",")[1] ?? "")
    lettore.onerror = () => rifiuta(new Error(t("Non riesco a leggere questo file: riprova, o scegline un altro.", "I cannot read this file: try again, or choose another one.")))
    lettore.readAsDataURL(file)
  })

function Scelta({ etichetta, file, elenco, onCambia }: { etichetta: string; file: string; elenco: Array<{ file: string; nome: string }>; onCambia: (file: string) => void }) {
  // Un carattere che lo stile nomina e l'elenco non ha (il file non si legge): si vede com'è scritto, e resta finché non se ne sceglie un altro.
  const opzioni = elenco.some((c) => c.file === file) ? elenco : [...elenco, { file, nome: file }]
  return (
    <label className={styles.scelta}>
      <span>{etichetta}</span>
      <select value={file} onChange={(e) => onCambia(e.target.value)}>
        {opzioni.map((c) => (
          <option key={c.file} value={c.file}>
            {c.nome}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ScelteDelCarattere({ stile, modifica }: { stile: Stile; modifica: (fn: (s: Stile) => void) => void }) {
  const elenco = useCopia(copiaCaratteri).dato ?? []
  const campo = useRef<HTMLInputElement>(null)
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(null)
  const [invio, setInvio] = useState(false)

  const aggiungi = async (file: File) => {
    setEsito(null)
    if (file.size > MASSIMO_BYTE) {
      setEsito({ ok: false, testo: t("Il file è troppo grande (oltre {mb} MB): un carattere di solito pesa meno di 1 MB. Scegline un altro.", "The file is too big (over {mb} MB): a font usually weighs less than 1 MB. Choose another one.", { mb: MASSIMO_BYTE / 1024 ** 2 }) })
      return
    }
    setInvio(true)
    try {
      const aggiunto = await api.aggiungiCarattere(file.name, await base64Di(file))
      await copiaCaratteri.rileggi()
      setEsito({ ok: true, testo: t("«{nome}» è tra i caratteri: sceglilo qui sopra.", "\"{nome}\" is among the fonts: choose it above.", { nome: aggiunto.nome }) })
    } catch (e) {
      setEsito({ ok: false, testo: e instanceof Error ? e.message : String(e) })
    } finally {
      setInvio(false)
    }
  }

  return (
    <div className={styles.gruppo}>
      <h3>{t("Carattere", "Font")}</h3>
      <div className={styles.scelte}>
        <Scelta etichetta={t("Dei sottotitoli e delle animazioni", "Of the subtitles and animations")} file={stile.caratteri[stile.sottotitoli.carattere] ?? ""} elenco={elenco} onCambia={(file) => modifica((s) => { s.caratteri["titoli"] = file; s.sottotitoli.carattere = "titoli" })} />
        <Scelta etichetta={t("Del titolo", "Of the title")} file={stile.caratteri[stile.titolo.carattere] ?? ""} elenco={elenco} onCambia={(file) => modifica((s) => { s.caratteri["titolo"] = file; s.titolo.carattere = "titolo" })} />
        <div className={styles.aggiungi}>
          <input
            ref={campo}
            type="file"
            accept=".ttf,.otf,.woff2"
            hidden
            aria-label={t("File del carattere", "Font file")}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void aggiungi(file)
            }}
          />
          <Bottone variante="vuoto" disabled={invio} onClick={() => campo.current?.click()}>
            {invio ? t("Aggiungo…", "Adding…") : t("Aggiungi un carattere", "Add a font")}
          </Bottone>
        </div>
      </div>
      {esito && (
        <p className={esito.ok ? styles.ok : styles.errore} role={esito.ok ? "status" : "alert"}>
          {esito.testo}
        </p>
      )}
    </div>
  )
}
