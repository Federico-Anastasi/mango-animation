// L'orologio finto per filmare una pagina che si muove (`filmato` in `materiali/pagine.json`, docs/MOTORE.md, «Le pagine vere»).
//
// Entra nella pagina prima dei suoi script e le toglie il tempo vero: `performance.now`, `Date`, `requestAnimationFrame`,
// `setTimeout`, `setInterval` e le animazioni CSS vanno avanti solo quando chi filma chiama `window.__orologio.avanza(ms)`. Così ogni
// fotogramma è l'istante giusto anche se la pagina ci mette più di un trentesimo a disegnarlo (una scena 3D, una cattura grande), e il
// filmato scorre liscio come nel browser di chi guarda.

/** Lo script da dare a `addInitScript`: è una funzione che il browser esegue nella pagina, senza niente da fuori. */
export function orologio() {
  let adesso = 0;
  const partenza = Date.now();
  const inizi = new WeakMap();
  /** Le animazioni ancora da portare in fondo: le si tiene qui perché il browser smette di elencarle (`getAnimations`) quando sono
   * ferme sul bordo della fine, e quelle non riceverebbero più né il tempo né la chiusura. */
  const vive = new Set();
  const cicli = new Map();
  const timer = new Map();
  let numero = 0;

  const DataVera = Date;
  class DataFinta extends DataVera {
    constructor(...valori) {
      if (valori.length === 0) super(partenza + adesso);
      else super(...valori);
    }
    static now() {
      return partenza + adesso;
    }
  }
  window.Date = DataFinta;
  performance.now = () => adesso;

  // Un'animazione nasce ferma (a velocità zero) all'istante finto in cui compare: quelle di `animate()` subito, quelle dei CSS al primo
  // fotogramma vero (finché la pagina carica, il tempo vero passa e le farebbe correre).
  const ferma = (animazione) => {
    if (inizi.has(animazione)) return;
    inizi.set(animazione, adesso);
    vive.add(animazione);
    animazione.playbackRate = 0;
    animazione.currentTime = 0;
  };
  const animaVero = Element.prototype.animate;
  Element.prototype.animate = function (...argomenti) {
    const animazione = animaVero.apply(this, argomenti);
    ferma(animazione);
    return animazione;
  };
  const fotogrammaVero = window.requestAnimationFrame.bind(window);
  const sorveglia = () => {
    for (const animazione of document.getAnimations()) ferma(animazione);
    fotogrammaVero(sorveglia);
  };
  fotogrammaVero(sorveglia);

  window.requestAnimationFrame = (richiamo) => {
    cicli.set(++numero, richiamo);
    return numero;
  };
  window.cancelAnimationFrame = (id) => cicli.delete(id);
  const programma = (ripeti) => (richiamo, ms = 0, ...argomenti) => {
    const passo = Math.max(Number(ms) || 0, ripeti ? 1 : 0);
    timer.set(++numero, { quando: adesso + passo, richiamo, argomenti, ogni: ripeti ? passo : null });
    return numero;
  };
  window.setTimeout = programma(false);
  window.setInterval = programma(true);
  window.clearTimeout = window.clearInterval = (id) => timer.delete(id);

  const esegui = (richiamo, argomenti) => {
    try {
      if (typeof richiamo === "function") richiamo(...argomenti);
    } catch (errore) {
      console.error(errore);
    }
  };

  window.__orologio = {
    /** Porta il tempo avanti di `ms`: i timer scattano in ordine, ognuno al suo istante, poi un giro di `requestAnimationFrame` e le
     * animazioni all'istante nuovo (ognuna dal momento in cui è comparsa). Torna quando la pagina ha ricevuto la fine delle animazioni
     * chiuse in questo passo: chi ne fa partire un'altra la fa partire adesso, non quando capita. */
    async avanza(ms) {
      const fine = adesso + ms;
      for (;;) {
        let prossimo = null;
        for (const [id, t] of timer) if (t.quando <= fine && (!prossimo || t.quando < prossimo[1].quando)) prossimo = [id, t];
        if (!prossimo) break;
        const [id, t] = prossimo;
        adesso = Math.max(adesso, t.quando);
        if (t.ogni === null) timer.delete(id);
        else t.quando += t.ogni;
        esegui(t.richiamo, t.argomenti);
      }
      adesso = fine;
      const giro = [...cicli.values()];
      cicli.clear();
      for (const richiamo of giro) esegui(richiamo, [adesso]);
      let chiuse = 0;
      for (const animazione of document.getAnimations()) ferma(animazione);
      for (const animazione of vive) {
        // Tolta o chiusa dalla pagina stessa: non è più affar nostro.
        if (animazione.playState === "idle" || animazione.playState === "finished") {
          vive.delete(animazione);
          continue;
        }
        const tempo = adesso - inizi.get(animazione);
        // Arrivata in fondo si chiude davvero, a velocità normale, così la pagina riceve la fine (`onfinish`, `animationend`) e può far
        // partire la successiva. Il margine assorbe gli arrotondamenti dei trentesimi sommati: 200 ms che diventano 199,99999.
        if (tempo >= animazione.effect.getComputedTiming().endTime - 1e-3) {
          animazione.playbackRate = 1;
          animazione.finish();
          vive.delete(animazione);
          chiuse++;
        } else animazione.currentTime = tempo;
      }
      // Il browser manda gli eventi di fine al suo prossimo fotogramma vero: si aspetta quello, e un giro dopo per chi risponde.
      if (chiuse > 0) await new Promise((fatto) => fotogrammaVero(() => fotogrammaVero(() => fatto())));
    },
  };
}
