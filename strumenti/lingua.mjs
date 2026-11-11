// La lingua delle frasi degli strumenti: quella di chi ha chiesto il lavoro (`MANGO_ANIMATION_LINGUA`, che mette il server), italiano senza.

/** La frase nella lingua in uso. */
export const dice = (it, en) => (process.env.MANGO_ANIMATION_LINGUA === "en" ? en : it);
