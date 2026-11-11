// Le icone: tratti semplici su una griglia 24×24, nel colore del testo.
import type { ReactNode } from "react"

const TRATTI = {
  video: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m10.5 9.5 4 2.5-4 2.5z" />
    </>
  ),
  girato: (
    <>
      <path d="M4 7h16v12H4z" />
      <path d="M4 7 7 3.5h3L7 7M11 7l3-3.5h3L14 7" />
    </>
  ),
  play: <path d="m8 5.5 11 6.5-11 6.5z" />,
  pausa: <path d="M8 5.5v13M16 5.5v13" />,
  indietro: <path d="m11 6-6 6 6 6M19 6l-6 6 6 6" />,
  avanti: <path d="m13 6 6 6-6 6M5 6l6 6-6 6" />,
  annulla: <path d="M9 7 4.5 11.5 9 16M5 11.5h8.5a5 5 0 0 1 0 10" />,
  rifai: <path d="m15 7 4.5 4.5L15 16M19 11.5h-8.5a5 5 0 0 0 0 10" />,
  dividi: (
    <>
      <path d="M12 3v18" />
      <path d="m8 7-3 5 3 5M16 7l3 5-3 5" />
    </>
  ),
  togli: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5" />,
  copia: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" />
    </>
  ),
  cartella: <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />,
  cerca: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  croce: <path d="M6 6l12 12M18 6 6 18" />,
  spunta: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  su: <path d="m6 14 6-6 6 6" />,
  giu: <path d="m6 10 6 6 6-6" />,
  sinistra: <path d="m14 6-6 6 6 6" />,
  destra: <path d="m10 6 6 6-6 6" />,
  lavori: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  telefono: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  crescita: <path d="m3.5 17.5 5.5-5.5 4 3.5 7-8M15 7.5h5v5" />,
  produzione: <path d="M4 20h16M6 20v-5M10.5 20V9M15 20v-8M19 20V6" />,
  impostazioni: (
    <>
      <path d="M4 8h2.8M11.2 8H20M4 16h8.8M17.2 16H20" />
      <circle cx="9" cy="8" r="2.2" />
      <circle cx="15" cy="16" r="2.2" />
    </>
  ),
  segnala: <path d="M5.5 20.5v-16M5.5 5h12l-2.5 3.75 2.5 3.75h-12" />,
  piu: <path d="M12 5v14M5 12h14" />,
  file: <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4" />,
} satisfies Record<string, ReactNode>

export type NomeIcona = keyof typeof TRATTI

export function Icona({ nome, dimensione = 18 }: { nome: NomeIcona; dimensione?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={dimensione} height={dimensione} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRATTI[nome]}
    </svg>
  )
}
