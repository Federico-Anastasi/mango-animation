# Animazioni: le scene del creator

## Le scene del creator

Una cartella dei dati (`MANGO_ANIMATION_LAVORO`, `../docs/ARCHITETTURA.md`) può avere le sue scene: `<lavoro>/animazioni/scene/<slug>/scene.tsx`, con i file che la scena importa accanto, come in `src/scene/<slug>/`. Il registro (la pagina, `elenco`, `registra`, `foto`, `mappa`, l'impronta) le mette accanto a quelle del prodotto: la sigla è unica fra tutti i video e uno slug non può stare in due cartelle.

- **Cosa importano dal prodotto**: `@animazioni/impianto`, `@animazioni/standard/<elemento>`, `@animazioni/scene/sigla/sigla`, e lo stile unito con `import stile from "virtual:stile"`. I pacchetti (`react`, `three`…) si risolvono sempre da `animazioni/`, anche se il file sta altrove; `../` verso il prodotto non vale, perché la cartella dei dati non sta in un posto fisso.
- **Come**: nella pagina, il plugin di `vite.config.ts` (alias `@animazioni`, `@scene-del-creator`, modulo `virtual:stile`, risoluzione dei pacchetti, accesso ai file della cartella dei dati); per Bun (`elenco`, `registra`, `foto`, `mappa`, le prove) `script/plugin-bun.ts`, che carica i file del creator con gli import già riscritti. La variabile arriva dal server e dal motore (che la passano ai programmi che lanciano).
- **Rifare**: la pagina costruita (`dist/`) sa per quale cartella di lavoro è fatta e si ricostruisce se cambia, o se cambiano le scene o lo stile del creator. L'impronta di una scena resa conta i file della scena nella cartella dei dati con i file del prodotto che importa, per nome relativo alla cartella delle scene: spostare la cartella non rifà niente.
- **Le prove di una cartella dei dati** stanno in `<lavoro>/animazioni/test/` e si lanciano da `animazioni/` col percorso: `MANGO_ANIMATION_LAVORO=<lavoro> bun test <lavoro>/animazioni/test`.
