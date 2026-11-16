// Il ponte che l'app Mango Animation mette nella pagina (`window.__MANGO_ANIMATION__.aiuto`): la versione, il controllo degli aggiornamenti e i registri.
// Nel browser non c'è: di «Aiuto» restano la guida e ciò che non chiede l'app.

export interface PonteAiuto {
  leggi: () => Promise<{ versione: string; aggiornaDaSolo: boolean }>
  /** `nuova` è la versione uscita, o `null` se si ha l'ultima; rifiuta con una frase se non riesce a controllare. */
  controlla: () => Promise<{ nuova: string | null }>
  aggiornaDaSolo: (acceso: boolean) => Promise<void>
  /** Chiude e riapre l'app, che all'avvio propone la versione nuova. */
  riavviaEAggiorna: () => Promise<void>
  apriRegistri: () => Promise<void>
}

export const ponteAiuto = (): PonteAiuto | null => window.__MANGO_ANIMATION__?.aiuto ?? null
