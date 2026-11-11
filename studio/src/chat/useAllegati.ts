import { useCallback, useRef, useState } from "react"
import { caricaAllegato, caricaAllegatoLocale } from "./api"
import { ricordaAnteprima, indirizzoImmagine, nomeDelFile, rilasciaAnteprima } from "./allegati"
import { t } from "../lingua"

export interface AllegatoInCampo {
  chiave: number
  nome: string
  immagine: boolean
  anteprima: string | null
  /** `null` finché il file sale al server. */
  percorso: string | null
  errore: string | null
}

const eImmagine = (nome: string) => /\.(png|jpe?g|gif|webp)$/i.test(nome)

/** Il limite dei caricamenti del server (`docs/CHAT.md`, `POST /api/chat/allegati`). */
const LIMITE_CARICAMENTO_BYTE = 16 * 1024 ** 2
const troppoGrande = (): string =>
  t("è più di 16 MB. Copialo in Esplora risorse e incollalo qui con Ctrl+V: si collega senza copiarlo.", "it is larger than 16 MB. Copy it in File Explorer and paste it here with Ctrl+V: it is linked without being copied.")

/** Gli allegati del messaggio che si sta scrivendo: ognuno sale al server appena arriva e si può togliere. */
export function useAllegati() {
  const [allegati, setAllegati] = useState<AllegatoInCampo[]>([])
  const prossima = useRef(1)
  const correnti = useRef(allegati)
  correnti.current = allegati

  const metti = useCallback((nome: string, immagine: boolean, anteprima: string | null, carica: () => Promise<string>) => {
    const chiave = prossima.current++
    setAllegati((prima) => [...prima, { chiave, nome, immagine, anteprima, percorso: null, errore: null }])
    carica().then(
      (percorso) => {
        if (anteprima) ricordaAnteprima(percorso, anteprima)
        setAllegati((prima) => prima.map((a) => (a.chiave === chiave ? { ...a, percorso, anteprima: a.anteprima ?? (immagine ? indirizzoImmagine(percorso) : null) } : a)))
      },
      (e: unknown) => setAllegati((prima) => prima.map((a) => (a.chiave === chiave ? { ...a, errore: e instanceof Error ? e.message : String(e) } : a))),
    )
  }, [])

  const aggiungi = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const immagine = file.type.startsWith("image/")
        // Un file trascinato arriva senza il suo percorso, quindi si potrebbe solo copiare: uno grande si incolla, e il server lo collega.
        if (file.size > LIMITE_CARICAMENTO_BYTE) {
          metti(file.name || t("allegato", "attachment"), immagine, null, () => Promise.reject(new Error(troppoGrande())))
          continue
        }
        const anteprima = immagine && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null
        metti(file.name || t("allegato", "attachment"), immagine, anteprima, () => caricaAllegato(file))
      }
    },
    [metti],
  )

  /** File del computer, dati per percorso (copiati in Esplora risorse): il server copia quelli piccoli e collega quelli grandi. */
  const aggiungiLocali = useCallback(
    (percorsi: string[]) => {
      for (const percorso of percorsi) metti(nomeDelFile(percorso), eImmagine(percorso), null, () => caricaAllegatoLocale(percorso))
    },
    [metti],
  )

  const togli = useCallback((chiave: number) => {
    const tolto = correnti.current.find((a) => a.chiave === chiave)
    if (tolto?.anteprima?.startsWith("blob:")) rilasciaAnteprima(tolto.percorso, tolto.anteprima)
    setAllegati((prima) => prima.filter((a) => a.chiave !== chiave))
  }, [])
  const svuota = useCallback(() => setAllegati([]), [])
  return { allegati, aggiungi, aggiungiLocali, togli, svuota, staSalendo: allegati.some((a) => a.percorso === null && a.errore === null) }
}
