import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"
import { ricordaBozza } from "../src/chat/bozza"
import { scegliLingua } from "../src/lingua"

// Una vista caricata a richiesta (il montaggio) la prima volta si compila: con altre cose in corso sul computer può superare il secondo.
configure({ asyncUtilTimeout: 5000 })

// Le prove leggono i testi in italiano; quelle in inglese lo dicono.
scegliLingua("it")

afterEach(() => {
  cleanup()
  ricordaBozza("")
  scegliLingua("it")
})

class EventSourceFinto {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  close() {}
}
;(globalThis as { EventSource?: unknown }).EventSource = EventSourceFinto

if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  class PointerEventFinto extends MouseEvent {
    readonly pointerId: number
    constructor(tipo: string, init: PointerEventInit = {}) {
      super(tipo, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  ;(globalThis as { PointerEvent?: unknown }).PointerEvent = PointerEventFinto
}

HTMLCanvasElement.prototype.getContext = () => null
HTMLMediaElement.prototype.play = () => Promise.resolve()
HTMLMediaElement.prototype.pause = () => undefined
HTMLMediaElement.prototype.load = () => undefined

class ResizeObserverFinto {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverFinto
