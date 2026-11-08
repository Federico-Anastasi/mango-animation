import { useEffect } from "react"
import type { RefObject } from "react"

/** Un pannello che scende da un bottone si chiude con Esc o toccando fuori dal bottone e dal pannello (il loro contenitore comune). */
export function useChiudiFuori(riquadro: RefObject<HTMLElement | null>, onChiudi: () => void): void {
  useEffect(() => {
    const fuori = (e: PointerEvent) => {
      if (riquadro.current && !riquadro.current.parentElement?.contains(e.target as Node)) onChiudi()
    }
    const tasto = (e: KeyboardEvent) => e.key === "Escape" && onChiudi()
    document.addEventListener("pointerdown", fuori)
    document.addEventListener("keydown", tasto)
    return () => {
      document.removeEventListener("pointerdown", fuori)
      document.removeEventListener("keydown", tasto)
    }
  }, [riquadro, onChiudi])
}
