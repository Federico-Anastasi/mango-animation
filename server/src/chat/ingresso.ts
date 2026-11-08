import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"

/** I messaggi del creator verso Claude Code: una coda che l'SDK legge man mano, così si scrive anche mentre Claude lavora. */
export class IngressoDiMessaggi implements AsyncIterable<SDKUserMessage> {
  private readonly attesi: SDKUserMessage[] = []
  private chi: ((risultato: IteratorResult<SDKUserMessage>) => void) | null = null
  private chiuso = false

  metti(messaggio: SDKUserMessage): void {
    if (this.chiuso) return
    if (this.chi) {
      const consegna = this.chi
      this.chi = null
      consegna({ value: messaggio, done: false })
    } else {
      this.attesi.push(messaggio)
    }
  }

  chiudi(): void {
    this.chiuso = true
    this.chi?.({ value: undefined, done: true })
    this.chi = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const primo = this.attesi.shift()
        if (primo) return Promise.resolve({ value: primo, done: false })
        if (this.chiuso) return Promise.resolve({ value: undefined, done: true })
        return new Promise((risolvi) => {
          this.chi = risolvi
        })
      },
    }
  }
}
