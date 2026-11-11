(() => {
  if (window.top !== window) return;
  const chiama = (comando, lingua) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation|" + comando, { lingua });
  // La dettatura: il microfono sta nell'app, il testo lo dà un motore locale; la pagina chiede e ascolta.
  // stato(lingua): { disponibile, messaggio?, in_ascolto }  (disponibile: il comando del motore si è trovato)
  // avvia(lingua), ferma(lingua): rifiutano con { code, message }
  // `lingua` è "it" o "en": quella delle frasi di errore, anche del motore se questa dettatura lo accende.
  // su(f): riceve gli eventi { tipo: "preparo" | "ascolto" | "livello" | "parziale" | "definitiva" | "errore" | "fine", … }
  // e restituisce la funzione che smette di ascoltare. «fine» arriva sempre dopo ferma(), con le ultime parole già consegnate.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...window.__MANGO_ANIMATION__,
    voce: Object.freeze({
      stato: (lingua) => chiama("voce_stato", lingua),
      avvia: (lingua) => chiama("voce_avvia", lingua),
      ferma: (lingua) => chiama("voce_ferma", lingua),
      su: (f) => {
        const ascolta = (e) => f(e.detail);
        window.addEventListener("mango-voce", ascolta);
        return () => window.removeEventListener("mango-voce", ascolta);
      },
    }),
  });
})();
