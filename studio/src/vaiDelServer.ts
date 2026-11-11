// «Guarda» dell'agente dentro l'app: il server manda `vai` (`docs/API.md`, «Eventi») e la finestra cambia pagina, come un collegamento della chat.
import { useEffect } from "react"
import { ascoltaCanale } from "./canale"
import { schedaDelFile } from "./chat/collegamenti"
import { chiudiChat, SOGLIA_STRETTA } from "./chat/pannello"
import { schedaDelNome, scriviIndirizzo, vai } from "./indirizzo"

type Vai = { video?: string; scheda?: string; percorso?: string }

/** La pagina dello studio per quel che l'agente vuole mostrare; `null` se non ne ha una. */
export function indirizzoDelVai({ video, scheda, percorso }: Vai): string | null {
  if (video !== undefined) return scriviIndirizzo({ vista: "video", slug: video, scheda: schedaDelNome(scheda) })
  const delVideo = /^video\/([^/]+)(\/.*)?$/.exec(percorso ?? "")
  if (delVideo?.[1]) return scriviIndirizzo({ vista: "video", slug: delVideo[1], scheda: schedaDelFile(delVideo[2] ?? "") })
  const delGirato = /^grezzo\/(.+)$/.exec(percorso ?? "")
  return delGirato?.[1] ? scriviIndirizzo({ vista: "girato", parametri: { file: delGirato[1] } }) : null
}

export function useVaiDelServer(): void {
  useEffect(
    () =>
      ascoltaCanale({
        evento: (e) => {
          if (e.tipo !== "vai") return
          const indirizzo = indirizzoDelVai(e)
          if (indirizzo === null) return
          vai(indirizzo)
          if (window.innerWidth <= SOGLIA_STRETTA) chiudiChat()
        },
      }),
    [],
  )
}
