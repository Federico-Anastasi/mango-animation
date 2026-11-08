declare module "virtual:stile" {
  /** Lo stile di serie con sopra quello del creator: lo fornisce il plugin di `vite.config.ts` e, per gli script, `script/plugin-bun.ts`. */
  const stile: typeof import("../../stile.json");
  export default stile;
}

/** Gli SVG letti come testo (`?raw`): Vite e Bun li danno così; qui lo sanno anche le prove, che non caricano `vite/client`. */
declare module "*.svg?raw" {
  const svg: string;
  export default svg;
}
