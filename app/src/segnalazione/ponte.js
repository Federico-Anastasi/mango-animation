(() => {
  if (window.top !== window) return;
  const invoca = (comando, argomenti) => window.__TAURI_INTERNALS__.invoke("plugin:mango-animation-segnalazione|" + comando, argomenti);

  // Ciò che va storto nella pagina finisce in logs\ui.log: gli errori non gestiti, i console.error e le chiamate all'app più lente di 1 s o senza risposta.
  // Il tetto di righe al minuto lo mette l'app.
  const scrivi = (livello, testo) => {
    invoca("scrivi_ui_log", { livello, testo: String(testo).slice(0, 4000), pagina: location.pathname + location.hash }).catch(() => {});
  };
  const descrivi = (v) => {
    if (v instanceof Error) return v.stack || String(v);
    if (typeof v !== "object" || v === null) return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };
  addEventListener("error", (e) => {
    // L'avviso del browser su un ResizeObserver che ridimensiona ciò che osserva: innocuo, e riempirebbe il registro.
    if (!e.error && String(e.message).startsWith("ResizeObserver loop")) return;
    scrivi("error", e.error ? descrivi(e.error) : `${e.message} (${e.filename}:${e.lineno})`);
  });
  addEventListener("unhandledrejection", (e) => scrivi("error", "unhandled rejection: " + descrivi(e.reason)));
  const consoleError = console.error.bind(console);
  console.error = (...argomenti) => {
    consoleError(...argomenti);
    scrivi("console", argomenti.map(descrivi).join(" "));
  };

  // Le chiamate all'app dei ponti già definiti (dettatura, cartella dei dati, computer, appunti). Quelle che aspettano il creator (una finestra di scelta) non contano.
  const ATTESE = new Set(["cartellaDati.sposta"]);
  const misurata = (nome, f) => (...argomenti) => {
    const inizio = performance.now();
    const risultato = f(...argomenti);
    if (typeof risultato?.then !== "function") return risultato;
    let risposto = false;
    const tardi = setTimeout(() => risposto || scrivi("slow", `${nome}: no answer after 5 s`), 5000);
    const fine = () => {
      risposto = true;
      clearTimeout(tardi);
      const ms = Math.round(performance.now() - inizio);
      if (ms > 1000) scrivi("slow", `${nome}: ${ms} ms`);
    };
    risultato.then(fine, fine);
    return risultato;
  };
  const ponti = Object.fromEntries(
    Object.entries(window.__MANGO_ANIMATION__ ?? {}).map(([ponte, voci]) => [
      ponte,
      Object.freeze(Object.fromEntries(Object.entries(voci).map(([voce, f]) => [voce, typeof f === "function" && !ATTESE.has(`${ponte}.${voce}`) ? misurata(`${ponte}.${voce}`, f) : f]))),
    ]),
  );

  // segnalazione.invioAttivo(): vero se questa costruzione manda le segnalazioni a Sentry; solo allora la schermata della finestra si prende, e l'interruttore ha senso.
  // segnalazione.invia({ errore?, nota?, schermata }): manda la segnalazione (anonimizzata) e risponde { inviata, file? }; senza l'indirizzo di Sentry nella costruzione
  // il testo resta in un file nei registri e si apre la pagina «nuova issue» di GitHub: { inviata: false, file }. Rifiuta con la frase di cosa non è andato.
  window.__MANGO_ANIMATION__ = Object.freeze({
    ...ponti,
    segnalazione: Object.freeze({
      invioAttivo: () => invoca("segnalazione_invio_attivo"),
      invia: (o) => invoca("segnala_problema", { errore: o?.errore ?? null, nota: o?.nota ?? null, schermata: !!o?.schermata, pagina: location.pathname + location.hash }),
    }),
  });
})();
