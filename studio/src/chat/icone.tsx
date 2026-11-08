// Le icone della chat, nello stesso stile di quelle dell'interfaccia: tratti semplici su una griglia 24×24.
import type { ReactNode } from "react"
import { Icona, type NomeIcona } from "../comuni/icone"

const TRATTI = {
  chat: <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H11l-4.5 3.5V16a2 2 0 0 1-2-2z" />,
  invio: <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" />,
  ferma: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  allegato: <path d="m19 11.5-6.6 6.6a4 4 0 0 1-5.7-5.6l7-7a2.7 2.7 0 0 1 3.8 3.8l-7 7a1.3 1.3 0 0 1-1.9-1.9l6.3-6.3" />,
  spegni: <path d="M12 4.5v7M7.3 7.2a6.5 6.5 0 1 0 9.4 0" />,
  elenco: <path d="M8 6.5h11M8 12h11M8 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  pensiero: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M9.5 10a2.6 2.6 0 1 1 3.6 2.4c-.7.4-1.1.8-1.1 1.6M12 16.6h.01" />
    </>
  ),
  libro: <path d="M5 4.5h10a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3zM5 16.5a3 3 0 0 1 3-3h10" />,
  matita: <path d="m5 19 .8-3.8L15.5 5.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8.8 18.2z" />,
  terminale: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="m7.5 10 3 2.5-3 2.5M12.5 15h4" />
    </>
  ),
  globo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.3 3.5 5 3.5 8s-1 5.7-3.5 8c-2.5-2.3-3.5-5-3.5-8s1-5.7 3.5-8" />
    </>
  ),
  agente: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  bacchetta: <path d="m5 19 9.5-9.5M13 4v3M17.5 6.5l-2 2M19 11h-3M8 4.5v2M5 8h2" />,
  domanda: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.6 9.8a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.8-1.1 1.6M12 16.4h.01" />
    </>
  ),
  foto: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
    </>
  ),
  ingranaggio: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M18 6l-2.1 2.1M8.1 15.9 6 18" />
    </>
  ),
  attenzione: <path d="M12 4.5 3.8 19h16.4zM12 10v4M12 16.6h.01" />,
} satisfies Record<string, ReactNode>

/** Quelle che l'interfaccia ha già (con il nome che hanno lì). */
const COMUNI = { nuova: "piu", lente: "cerca", video: "video", su: "su", giu: "giu", sinistra: "sinistra", croce: "croce", spunta: "spunta", file: "file" } as const satisfies Record<string, NomeIcona>

export type NomeIconaChat = keyof typeof TRATTI | keyof typeof COMUNI

export function IconaChat({ nome, dimensione = 18 }: { nome: NomeIconaChat; dimensione?: number }) {
  if (nome in COMUNI) return <Icona nome={COMUNI[nome as keyof typeof COMUNI]} dimensione={dimensione} />
  return (
    <svg viewBox="0 0 24 24" width={dimensione} height={dimensione} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRATTI[nome as keyof typeof TRATTI]}
    </svg>
  )
}
