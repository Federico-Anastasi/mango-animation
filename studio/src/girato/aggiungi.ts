// Aggiungere al girato i video che il creator ha sul computer (`docs/API.md`, «Aggiungere un file dal computer»): quelli scelti con la finestra di scelta o
// lasciati sulla pagina nel browser partono col loro contenuto, uno dopo l'altro; nell'app un file lasciato sulla finestra arriva col suo percorso e il server lo collega.
import { useCallback, useEffect, useRef, useState } from "react"
import { api, ErroreApi, fraseDelServer, leggiRisposta, serverSpento } from "../api"
import { ponteTrascinamento } from "../chat/trascinamento"
import { grezzo } from "../dati"
import { lingua } from "../lingua"

export type StatoVoce = "attesa" | "invio" | "salvo" | "fatto" | "errore"

export interface Voce {
  id: number
  nome: string
  stato: StatoVoce
  /** Quanto è partito, 0-100; `null` quando non si può dire (un file collegato per percorso). */
  percento: number | null
  caricati: number
  totale: number
  /** Con `errore`: perché, nella lingua dello studio. */
  errore?: string
}

const nomeDelPercorso = (percorso: string): string => percorso.split(/[\\/]/).pop() ?? percorso

/** Il file parte nel corpo della richiesta; `avanza` riceve i byte partiti (con `fetch` non si vedrebbero). */
function invia(file: File, avanza: (caricati: number, totale: number) => void): Promise<void> {
  return new Promise((risolvi, rifiuta) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/grezzo/aggiungi")
    xhr.setRequestHeader("X-Lingua", lingua())
    xhr.setRequestHeader("X-Nome-File", encodeURIComponent(file.name))
    if (file.type) xhr.setRequestHeader("Content-Type", file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) avanza(e.loaded, e.total)
    }
    xhr.onload = () => {
      try {
        const dati = leggiRisposta(xhr.responseText, xhr.status)
        if (xhr.status < 200 || xhr.status >= 300) throw new ErroreApi(fraseDelServer(dati, xhr.status), xhr.status)
        risolvi()
      } catch (errore) {
        rifiuta(errore)
      }
    }
    xhr.onerror = xhr.ontimeout = xhr.onabort = () => rifiuta(new ErroreApi(serverSpento(), 0))
    xhr.send(file)
  })
}

/** I file da aggiungere uno dopo l'altro, e a che punto sono. */
export function useAggiunte() {
  const [voci, setVoci] = useState<Voce[]>([])
  const fila = useRef<Promise<void>>(Promise.resolve())
  const prossimo = useRef(0)

  const cambia = useCallback((id: number, modifica: Partial<Voce>) => setVoci((v) => v.map((x) => (x.id === id ? { ...x, ...modifica } : x))), [])

  const aggiungi = useCallback(
    (da: readonly (File | string)[]) => {
      const nuove = da.map((origine): { voce: Voce; origine: File | string } => ({
        origine,
        voce: { id: prossimo.current++, nome: typeof origine === "string" ? nomeDelPercorso(origine) : origine.name, stato: "attesa", percento: typeof origine === "string" ? null : 0, caricati: 0, totale: typeof origine === "string" ? 0 : origine.size },
      }))
      if (nuove.length === 0) return
      setVoci((v) => [...v, ...nuove.map((n) => n.voce)])
      for (const { voce, origine } of nuove) {
        fila.current = fila.current.then(async () => {
          cambia(voce.id, { stato: "invio" })
          try {
            if (typeof origine === "string") await api.aggiungiAlGirato(origine)
            else {
              await invia(origine, (caricati, totale) => {
                cambia(voce.id, { caricati, totale, percento: Math.floor((caricati / totale) * 100), stato: caricati >= totale ? "salvo" : "invio" })
              })
            }
            cambia(voce.id, { stato: "fatto", percento: 100 })
          } catch (errore) {
            cambia(voce.id, { stato: "errore", errore: errore instanceof Error ? errore.message : String(errore) })
          }
          await grezzo.rileggi()
        })
      }
    },
    [cambia],
  )

  /** Toglie dall'elenco ciò che è finito, bene o male. */
  const chiudi = useCallback(() => setVoci((v) => v.filter((x) => x.stato === "attesa" || x.stato === "invio" || x.stato === "salvo")), [])

  return { voci, aggiungi, chiudi }
}

/**
 * Dei file si trascinano sopra la pagina: `area` è dove cade il rilascio (la zona della vista, non la chat), `null` se niente si trascina.
 * Al rilascio `alRilascio` riceve i file (nel browser) o i loro percorsi (nell'app).
 */
export function useRilascio(radice: HTMLElement | null, alRilascio: (da: (File | string)[]) => void): DOMRect | null {
  const [area, setArea] = useState<DOMRect | null>(null)
  const ultimo = useRef(alRilascio)
  useEffect(() => {
    ultimo.current = alRilascio
  })

  useEffect(() => {
    const zona = radice?.closest("main") ?? radice
    if (!zona) return
    let dentro = 0
    const conFile = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files")
    const entra = (e: DragEvent) => {
      if (!conFile(e)) return
      e.preventDefault()
      dentro += 1
      setArea(zona.getBoundingClientRect())
    }
    const sopra = (e: DragEvent) => {
      if (!conFile(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
    }
    const esce = (e: DragEvent) => {
      if (!conFile(e)) return
      dentro = Math.max(0, dentro - 1)
      if (dentro === 0) setArea(null)
    }
    const lascia = (e: DragEvent) => {
      if (!conFile(e)) return
      e.preventDefault()
      dentro = 0
      setArea(null)
      ultimo.current([...(e.dataTransfer?.files ?? [])])
    }
    zona.addEventListener("dragenter", entra)
    zona.addEventListener("dragover", sopra)
    zona.addEventListener("dragleave", esce)
    zona.addEventListener("drop", lascia)
    const smetti = ponteTrascinamento()?.su((e) => {
      if (e.tipo === "esce") return setArea(null)
      const sopraLaZona = zona.contains(document.elementFromPoint(e.x, e.y))
      setArea(sopraLaZona && e.tipo !== "lascia" ? zona.getBoundingClientRect() : null)
      if (e.tipo === "lascia" && sopraLaZona && e.percorsi?.length) ultimo.current(e.percorsi)
    })
    return () => {
      zona.removeEventListener("dragenter", entra)
      zona.removeEventListener("dragover", sopra)
      zona.removeEventListener("dragleave", esce)
      zona.removeEventListener("drop", lascia)
      smetti?.()
    }
  }, [radice])

  return area
}
