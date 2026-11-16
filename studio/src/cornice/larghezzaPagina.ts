import { useLayoutEffect, type RefObject } from "react"

/**
 * Scrive in `--larghezza-pagina`, sulla radice, quanto è largo il posto in cui la pagina si centra (l'area accanto alla chat, senza i suoi margini
 * e senza la barra di scorrimento): con la chat aperta la barra in alto va da bordo a bordo e con questa misura si allinea alla pagina.
 */
export function useLarghezzaPagina(radice: RefObject<HTMLElement | null>, corpo: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const [r, c] = [radice.current, corpo.current]
    if (!r || !c) return
    const misura = () => {
      const stile = getComputedStyle(c)
      r.style.setProperty("--larghezza-pagina", `${c.clientWidth - parseFloat(stile.paddingLeft) - parseFloat(stile.paddingRight)}px`)
    }
    misura()
    const osserva = new ResizeObserver(misura)
    osserva.observe(c)
    return () => osserva.disconnect()
  }, [radice, corpo])
}
