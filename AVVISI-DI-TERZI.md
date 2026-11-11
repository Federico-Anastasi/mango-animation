# Avvisi di terzi

Questo file è generato da `python -m strumenti.avvisi_terzi` (non si scrive a mano): elenca la licenza e la fonte di ciò che il prodotto porta con sé o scarica dalla sua fonte. Il codice del prodotto è sotto AGPL-3.0-or-later (`LICENSE`, `NOTICE.md`); nome e logo seguono `TRADEMARKS.md`. I modelli e i programmi pesanti **non si distribuiscono col prodotto**: l'app li scarica dalla fonte indicata, con la licenza della fonte.

## Ciò che pone limiti

- **L'allineamento delle parole (MMS_FA) è per uso non commerciale** (CC-BY-NC-4.0). I pesi si scaricano dalla fonte, non sono nel prodotto; il prodotto con l'allineamento acceso non si può usare per guadagnare. Si spegne dalle impostazioni (`motori.allineamento`): i pezzi a parole restano, meno precisi.
- **ffmpeg è un programma a parte, in versione GPL-3.0** (la «full build» di gyan.dev): l'app lo scarica dalla sua fonte e lo lancia come processo; non è linkato né incluso nel codice. Chi ridistribuisce quel programma deve darne i sorgenti (la fonte li pubblica).
- **La ruota di pillow-heif (le foto HEIC dell'iPhone) porta x265, GPL-2.0, e libheif e libde265, LGPL-3.0**, come librerie a parte (`LICENSES_bundled.txt` del pacchetto). L'app le scarica da PyPI sul computer del creator e il codice del prodotto non le include; chi ridistribuisse l'ambiente Python già fatto dovrebbe rispettare quelle licenze.
- **Claude Agent SDK** è sotto le condizioni commerciali di Anthropic (`SEE LICENSE`), non una licenza aperta: il server lo usa per la chat, lanciando il `claude` che il creator ha installato: l'accesso lo fa Claude Code da sé, il nostro codice non legge né usa credenziali. Claude Code non è parte del prodotto. Il permesso aggiuntivo dell'AGPL per usarli insieme è in `NOTICE.md`.
- **Pacchetti MPL-2.0** (copyleft sui file): il loro codice non è modificato qui; se un file di quei pacchetti si modifica, quel file resta MPL-2.0 e se ne pubblica il sorgente.
- **Caratteri OFL-1.1** (Archivo in `font/`, i pacchetti `@fontsource/*`): si ridistribuiscono liberamente ma non si vendono da soli.

## Ciò che l'app scarica dalla sua fonte

Da `app/src/computer/manifesto.json`: programmi e modelli, con l'impronta e la dimensione pubblicate dalla fonte.

| Cosa | A cosa serve | Licenza | Fonte |
|---|---|---|---|
| Bun | fa girare il server e le animazioni | MIT | <https://bun.sh> |
| uv | installa Python e i suoi pacchetti | MIT o Apache-2.0 | <https://github.com/astral-sh/uv> |
| ffmpeg | legge e scrive i video | GPL-3.0 (programma a parte, non incluso) | <https://www.gyan.dev/ffmpeg/builds/> |
| DeepFilterNet3 | toglie il rumore dalla voce | MIT o Apache-2.0 | <https://github.com/Rikorose/DeepFilterNet> |
| MMS | trova dove cade ogni parola nell'audio | CC-BY-NC-4.0 (non commerciale) | <https://github.com/facebookresearch/fairseq/tree/main/examples/mms> |
| Whisper large-v3 | trascrive la voce con le parole e i tempi | MIT | <https://huggingface.co/Systran/faster-whisper-large-v3> |
| Whisper large-v3-turbo | trascrive la voce con le parole e i tempi | MIT | <https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo> |
| Whisper small | trascrive la voce con le parole e i tempi | MIT | <https://huggingface.co/Systran/faster-whisper-small> |
| SAM 2.1 | ritaglia la tua sagoma dal video | Apache-2.0 | <https://huggingface.co/facebook/sam2.1-hiera-base-plus> |
| ViTMatte | rifinisce il bordo della sagoma | Apache-2.0 | <https://huggingface.co/hustvl/vitmatte-small-composition-1k> |
| RT-DETR | trova dove sta la persona nel fotogramma | Apache-2.0 | <https://huggingface.co/PekingU/rtdetr_r18vd> |
| YuNet | trova il viso, per le viste che seguono la persona | MIT | <https://huggingface.co/opencv/face_detection_yunet> |

Il browser per le animazioni (Chromium di Playwright) si scarica con `bunx playwright install chromium`: licenza BSD-3-Clause, più quelle dei suoi componenti, <https://playwright.dev>.

## Pacchetti Python del motore

Installati dall'app in un ambiente suo (`app/src/computer/piano.rs`).

| Pacchetto | Versione | Licenza | Fonte |
|---|---|---|---|
| faster-whisper | 1.1.0 | MIT | <https://pypi.org/project/faster-whisper/> |
| huggingface_hub | 1.24.0 | Apache-2.0 | <https://pypi.org/project/huggingface-hub/> |
| jsonschema | 4.26.0 | MIT | <https://pypi.org/project/jsonschema/> |
| numpy | 2.4.3 | BSD-3-Clause (e le licenze di ciò che porta: 0BSD, MIT, Zlib, CC0-1.0) | <https://pypi.org/project/numpy/> |
| nvidia-cublas-cu12 | 12.4.5.8 | Licenza proprietaria di NVIDIA (CUDA Toolkit EULA); l'app lo scarica da PyPI sul computer di chi lo usa, solo per la trascrizione sulla scheda NVIDIA senza PyTorch, e non lo ridistribuisce | <https://pypi.org/project/nvidia-cublas-cu12/> |
| opencv-python-headless | 5.0.0.93 | Apache-2.0 (la ruota porta librerie a parte, FFmpeg fra queste, con le loro licenze LGPL) | <https://pypi.org/project/opencv-python-headless/> |
| Pillow | 12.1.1 | MIT-CMU (HPND) | <https://pypi.org/project/pillow/> |
| pillow-heif | 1.8.1 | BSD-3-Clause (la ruota porta librerie a parte: libheif e libde265 LGPL-3.0, x265 GPL-2.0) | <https://pypi.org/project/pillow-heif/> |
| playwright | 1.62.0 | Apache-2.0 (la ruota porta il driver di Playwright e Node.js, con le loro licenze; i browser non si scaricano: `leggi_tiktok` pilota il Chrome del creator) | <https://pypi.org/project/playwright/> |
| requests | 2.34.2 | Apache-2.0 | <https://pypi.org/project/requests/> |
| torch | 2.6.0 | BSD-3-Clause | <https://pytorch.org> |
| torchaudio | 2.6.0 | BSD-2-Clause | <https://pytorch.org> |
| torchvision | 0.21.0 | BSD-3-Clause | <https://pytorch.org> |
| transformers | 5.14.1 | Apache-2.0 | <https://pypi.org/project/transformers/> |
| yt-dlp | l’ultima, di proposito: i siti cambiano | Unlicense | <https://github.com/yt-dlp/yt-dlp> |

Solo per chi sviluppa o usa gli strumenti: `pytest` (MIT). Non lo installa l'app.

## Caratteri

`font/Archivo-700.ttf`: Archivo, SIL Open Font License 1.1, <https://github.com/Omnibus-Type/Archivo>. `font/Metropolis-Medium.ttf`: Metropolis, Unlicense (pubblico dominio), <https://github.com/dw5/Metropolis>; il testo è in `font/Metropolis-UNLICENSE.txt`. Il carattere della sigla, `animazioni/src/scene/sigla/caratteri/space-grotesk.typeface.json`, è ricavato da Space Grotesk (SIL Open Font License 1.1, <https://github.com/floriankarsten/space-grotesk>); il testo della licenza è accanto, in `OFL-SpaceGrotesk.txt`. Gli altri caratteri arrivano dai pacchetti `@fontsource/*` qui sotto.

## Marchi

I loghi in `animazioni/src/standard/loghi/` (claude, mango-animation, meta, openai) sono marchi dei rispettivi proprietari e non sono coperti dalla licenza del progetto (AGPL-3.0-or-later): compaiono solo per indicare i prodotti di cui un video parla. Accanto a ogni file, un `.txt` dice da dove viene e con quale licenza è pubblicato il disegno; la licenza del disegno non dà alcun diritto sul marchio.

## Pacchetti npm di `server/`

Da `bun.lock`, con la licenza che ogni pacchetto dichiara. Compresi gli strumenti di costruzione e di prova, che `bun install` scarica.

| Pacchetto | Versione | Licenza |
|---|---|---|
| @anthropic-ai/claude-agent-sdk | 0.3.316 | SEE LICENSE IN README.md |
| @anthropic-ai/claude-agent-sdk-win32-x64 | 0.3.316 | SEE LICENSE IN LICENSE.md |
| @anthropic-ai/sdk | 1.3.0 | Apache-2.0 |
| @babel/runtime | 7.29.10 | MIT |
| @hono/node-server | 2.1.5 | MIT |
| @modelcontextprotocol/sdk | 1.32.2 | MIT |
| @opentelemetry/api | 1.10.0 | Apache-2.0 |
| @stablelib/base64 | 1.0.1 | MIT |
| @types/bun | 1.4.2 | MIT |
| @types/node | 26.6.4 | MIT |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 |
| accepts | 2.0.0 | MIT |
| ajv | 8.20.0 | MIT |
| ajv-formats | 3.0.1 | MIT |
| body-parser | 2.4.0 | MIT |
| content-type | 2.1.0 | MIT |
| bun-types | 1.4.2 | MIT |
| bytes | 3.1.2 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| call-bound | 1.0.4 | MIT |
| content-disposition | 2.0.1 | MIT |
| content-type | 1.0.5 | MIT |
| cookie | 0.7.2 | MIT |
| cookie-signature | 1.2.2 | MIT |
| cors | 2.8.6 | MIT |
| cross-spawn | 7.0.6 | MIT |
| debug | 4.4.3 | MIT |
| depd | 2.0.0 | MIT |
| dunder-proto | 1.0.1 | MIT |
| ee-first | 1.1.1 | MIT |
| encodeurl | 2.0.1 | MIT |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| escape-html | 1.0.3 | MIT |
| etag | 1.8.1 | MIT |
| eventsource | 3.0.7 | MIT |
| eventsource-parser | 3.1.1 | MIT |
| express | 5.3.0 | MIT |
| express-rate-limit | 8.7.2 | MIT |
| content-type | 2.1.0 | MIT |
| fast-deep-equal | 3.1.3 | MIT |
| fast-sha256 | 1.3.0 | Unlicense |
| fast-uri | 3.1.8 | BSD-3-Clause |
| finalhandler | 2.1.1 | MIT |
| forwarded | 0.2.0 | MIT |
| fresh | 2.0.0 | MIT |
| function-bind | 1.1.2 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| gopd | 1.2.0 | MIT |
| has-symbols | 1.1.0 | MIT |
| hasown | 2.0.4 | MIT |
| hono | 4.13.16 | MIT |
| http-errors | 2.0.1 | MIT |
| iconv-lite | 0.7.3 | MIT |
| inherits | 2.0.4 | ISC |
| ip-address | 10.7.5 | MIT |
| ipaddr.js | 1.9.1 | MIT |
| is-promise | 4.0.0 | MIT |
| isexe | 2.0.0 | ISC |
| jose | 6.2.14 | MIT |
| json-schema-to-ts | 3.1.1 | MIT |
| json-schema-traverse | 1.0.0 | MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause |
| math-intrinsics | 1.1.0 | MIT |
| media-typer | 1.1.1 | MIT |
| merge-descriptors | 2.0.0 | MIT |
| mime-db | 1.54.0 | MIT |
| mime-types | 3.0.2 | MIT |
| ms | 2.1.3 | MIT |
| negotiator | 1.1.0 | MIT |
| content-type | 2.1.0 | MIT |
| object-assign | 4.1.1 | MIT |
| object-inspect | 1.13.4 | MIT |
| on-finished | 2.4.2 | MIT |
| once | 1.4.0 | ISC |
| parseurl | 1.3.3 | MIT |
| path-key | 3.1.1 | MIT |
| path-to-regexp | 8.4.2 | MIT |
| pkce-challenge | 5.0.1 | MIT |
| proxy-addr | 2.0.8 | MIT |
| qs | 6.17.1 | BSD-3-Clause |
| range-parser | 1.3.0 | MIT |
| raw-body | 3.0.2 | MIT |
| require-from-string | 2.0.2 | MIT |
| router | 2.2.0 | MIT |
| safer-buffer | 2.1.2 | MIT |
| send | 1.2.1 | MIT |
| serve-static | 2.2.1 | MIT |
| setprototypeof | 1.2.0 | ISC |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| side-channel | 1.1.1 | MIT |
| side-channel-list | 1.0.1 | MIT |
| side-channel-map | 1.0.1 | MIT |
| side-channel-weakmap | 1.0.2 | MIT |
| standardwebhooks | 1.1.1 | MIT |
| statuses | 2.0.2 | MIT |
| toidentifier | 1.0.1 | MIT |
| ts-algebra | 2.0.0 | MIT |
| type-is | 2.1.0 | MIT |
| content-type | 2.1.0 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| undici-types | 8.9.0 | MIT |
| unpipe | 1.0.0 | MIT |
| vary | 1.1.2 | MIT |
| which | 2.0.2 | ISC |
| wrappy | 1.0.2 | ISC |
| zod | 4.6.7 | MIT |
| zod-to-json-schema | 3.25.2 | ISC |

## Pacchetti npm di `studio/`

Da `bun.lock`, con la licenza che ogni pacchetto dichiara. Compresi gli strumenti di costruzione e di prova, che `bun install` scarica.

| Pacchetto | Versione | Licenza |
|---|---|---|
| @adobe/css-tools | 4.5.0 | MIT |
| @asamuzakjp/css-color | 3.2.0 | MIT |
| lru-cache | 10.4.3 | ISC |
| @babel/code-frame | 7.29.7 | MIT |
| @babel/compat-data | 7.29.7 | MIT |
| @babel/core | 7.29.13 | MIT |
| @babel/generator | 7.29.13 | MIT |
| @babel/helper-compilation-targets | 7.29.13 | MIT |
| @babel/helper-globals | 7.29.7 | MIT |
| @babel/helper-module-imports | 7.29.7 | MIT |
| @babel/helper-module-transforms | 7.29.13 | MIT |
| @babel/helper-string-parser | 7.29.13 | MIT |
| @babel/helper-validator-identifier | 7.29.7 | MIT |
| @babel/helper-validator-option | 7.29.7 | MIT |
| @babel/helpers | 7.29.13 | MIT |
| @babel/parser | 7.29.13 | MIT |
| @babel/runtime | 7.29.10 | MIT |
| @babel/template | 7.29.7 | MIT |
| @babel/traverse | 7.29.13 | MIT |
| @babel/types | 7.29.11 | MIT |
| @cacheable/memory | 2.2.0 | MIT |
| @cacheable/utils | 2.5.0 | MIT |
| @csstools/color-helpers | 5.1.0 | MIT-0 |
| @csstools/css-calc | 2.1.4 | MIT |
| @csstools/css-color-parser | 3.1.0 | MIT |
| @csstools/css-parser-algorithms | 3.0.5 | MIT |
| @csstools/css-tokenizer | 3.0.4 | MIT |
| @esbuild/win32-x64 | 0.28.2 | MIT |
| @eslint-community/eslint-utils | 4.10.1 | MIT |
| eslint-visitor-keys | 3.4.3 | Apache-2.0 |
| @eslint-community/regexpp | 4.12.3 | MIT |
| @eslint/config-array | 0.23.5 | Apache-2.0 |
| @eslint/config-helpers | 0.7.0 | Apache-2.0 |
| @eslint/core | 1.2.1 | Apache-2.0 |
| @eslint/object-schema | 3.0.5 | Apache-2.0 |
| @eslint/plugin-kit | 0.7.3 | Apache-2.0 |
| @humanfs/core | 0.19.2 | Apache-2.0 |
| @humanfs/node | 0.16.8 | Apache-2.0 |
| @humanfs/types | 0.15.0 | Apache-2.0 |
| @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 |
| @humanwhocodes/retry | 0.4.3 | Apache-2.0 |
| @jridgewell/gen-mapping | 0.3.13 | MIT |
| @jridgewell/remapping | 2.3.5 | MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT |
| @keyv/bigmap | 1.3.1 | MIT |
| @keyv/serialize | 1.1.1 | MIT |
| @oxc-project/types | 0.153.0 | MIT |
| @playwright/test | 1.59.1 | Apache-2.0 |
| @rolldown/binding-win32-x64-msvc | 1.2.13 | MIT |
| @rolldown/pluginutils | 1.0.1 | MIT |
| @rollup/rollup-win32-x64-gnu | 4.64.3 | MIT |
| @rollup/rollup-win32-x64-msvc | 4.64.3 | MIT |
| @testing-library/dom | 10.4.2 | MIT |
| aria-query | 5.3.0 | Apache-2.0 |
| dom-accessibility-api | 0.5.16 | MIT |
| @testing-library/jest-dom | 6.10.0 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| @types/aria-query | 5.0.4 | MIT |
| @types/bun | 1.3.13 | MIT |
| @types/chai | 5.2.3 | MIT |
| @types/deep-eql | 4.0.2 | MIT |
| @types/esrecurse | 4.3.1 | MIT |
| @types/estree | 1.0.9 | MIT |
| @types/json-schema | 7.0.15 | MIT |
| @types/node | 26.6.4 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @typescript-eslint/eslint-plugin | 8.72.2 | MIT |
| ignore | 7.0.14 | MIT |
| @typescript-eslint/parser | 8.72.2 | MIT |
| @typescript-eslint/project-service | 8.72.2 | MIT |
| @typescript-eslint/scope-manager | 8.72.2 | MIT |
| @typescript-eslint/tsconfig-utils | 8.72.2 | MIT |
| @typescript-eslint/type-utils | 8.72.2 | MIT |
| @typescript-eslint/types | 8.72.2 | MIT |
| @typescript-eslint/typescript-estree | 8.72.2 | MIT |
| semver | 7.8.6 | ISC |
| @typescript-eslint/utils | 8.72.2 | MIT |
| @typescript-eslint/visitor-keys | 8.72.2 | MIT |
| @vitejs/plugin-react | 6.1.2 | MIT |
| @vitest/expect | 3.2.7 | MIT |
| @vitest/mocker | 3.2.7 | MIT |
| @vitest/pretty-format | 3.2.7 | MIT |
| @vitest/runner | 3.2.7 | MIT |
| @vitest/snapshot | 3.2.7 | MIT |
| @vitest/spy | 3.2.7 | MIT |
| @vitest/utils | 3.2.7 | MIT |
| acorn | 8.19.0 | MIT |
| acorn-jsx | 5.3.2 | MIT |
| agent-base | 7.1.4 | MIT |
| ajv | 6.15.0 | MIT |
| ansi-regex | 5.0.1 | MIT |
| ansi-styles | 5.2.0 | MIT |
| aria-query | 5.3.2 | Apache-2.0 |
| assertion-error | 2.0.1 | MIT |
| asynckit | 0.4.0 | MIT |
| balanced-match | 4.0.4 | MIT |
| baseline-browser-mapping | 2.11.35 | Apache-2.0 |
| brace-expansion | 5.0.12 | MIT |
| browserslist | 4.29.5 | MIT |
| bun-types | 1.3.13 | MIT |
| cac | 6.7.14 | MIT |
| cacheable | 2.5.0 | MIT |
| call-bind-apply-helpers | 1.0.2 | MIT |
| caniuse-lite | 1.0.30001823 | CC-BY-4.0 |
| chai | 5.3.3 | MIT |
| check-error | 2.1.3 | MIT |
| combined-stream | 1.0.8 | MIT |
| convert-source-map | 2.0.0 | MIT |
| cross-spawn | 7.0.6 | MIT |
| css.escape | 1.5.1 | MIT |
| cssstyle | 4.6.0 | MIT |
| rrweb-cssom | 0.8.0 | MIT |
| csstype | 3.2.3 | MIT |
| data-urls | 5.0.0 | MIT |
| debug | 4.4.3 | MIT |
| decimal.js | 10.6.0 | MIT |
| deep-eql | 5.0.2 | MIT |
| deep-is | 0.1.4 | MIT |
| delayed-stream | 1.0.0 | MIT |
| dequal | 2.0.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| dom-accessibility-api | 0.6.3 | MIT |
| dunder-proto | 1.0.1 | MIT |
| electron-to-chromium | 1.5.479 | ISC |
| entities | 6.0.1 | BSD-2-Clause |
| es-define-property | 1.0.1 | MIT |
| es-errors | 1.3.0 | MIT |
| es-module-lexer | 1.7.0 | MIT |
| es-object-atoms | 1.1.2 | MIT |
| es-set-tostringtag | 2.1.0 | MIT |
| esbuild | 0.28.2 | MIT |
| escalade | 3.2.0 | MIT |
| escape-string-regexp | 4.0.0 | MIT |
| eslint | 10.14.0 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| eslint-scope | 9.1.2 | BSD-2-Clause |
| eslint-visitor-keys | 5.0.1 | Apache-2.0 |
| espree | 11.2.0 | BSD-2-Clause |
| esquery | 1.7.0 | BSD-3-Clause |
| esrecurse | 4.3.0 | BSD-2-Clause |
| estraverse | 5.3.0 | BSD-2-Clause |
| estree-walker | 3.0.3 | MIT |
| esutils | 2.0.3 | BSD-2-Clause |
| expect-type | 1.4.0 | Apache-2.0 |
| fast-deep-equal | 3.1.3 | MIT |
| fast-json-stable-stringify | 2.1.0 | MIT |
| fast-levenshtein | 2.0.6 | MIT |
| fdir | 6.5.0 | MIT |
| file-entry-cache | 11.1.5 | MIT |
| find-up | 5.0.0 | MIT |
| flat-cache | 6.1.23 | MIT |
| flatted | 3.4.4 | ISC |
| form-data | 4.0.6 | MIT |
| function-bind | 1.1.2 | MIT |
| gensync | 1.0.0-beta.2 | MIT |
| get-intrinsic | 1.3.0 | MIT |
| get-proto | 1.0.1 | MIT |
| glob-parent | 6.0.2 | ISC |
| gopd | 1.2.0 | MIT |
| has-symbols | 1.1.0 | MIT |
| has-tostringtag | 1.0.2 | MIT |
| hashery | 1.5.1 | MIT |
| hasown | 2.0.4 | MIT |
| hermes-estree | 0.25.1 | MIT |
| hermes-parser | 0.25.1 | MIT |
| hookified | 1.15.1 | MIT |
| html-encoding-sniffer | 4.0.0 | MIT |
| http-proxy-agent | 7.0.2 | MIT |
| https-proxy-agent | 7.0.6 | MIT |
| iconv-lite | 0.6.3 | MIT |
| ignore | 5.3.2 | MIT |
| imurmurhash | 0.1.4 | MIT |
| indent-string | 4.0.0 | MIT |
| is-extglob | 2.1.1 | MIT |
| is-glob | 4.0.3 | MIT |
| is-potential-custom-element-name | 1.0.1 | MIT |
| isexe | 2.0.0 | ISC |
| js-tokens | 4.0.0 | MIT |
| jsdom | 25.0.1 | MIT |
| jsesc | 3.1.0 | MIT |
| json-schema-traverse | 0.4.1 | MIT |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT |
| json5 | 2.2.3 | MIT |
| keyv | 5.6.0 | MIT |
| levn | 0.4.1 | MIT |
| lightningcss | 1.33.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 |
| locate-path | 6.0.0 | MIT |
| loupe | 3.2.1 | MIT |
| lru-cache | 5.1.1 | ISC |
| lz-string | 1.5.0 | MIT |
| magic-string | 0.30.21 | MIT |
| math-intrinsics | 1.1.0 | MIT |
| mime-db | 1.52.0 | MIT |
| mime-types | 2.1.35 | MIT |
| min-indent | 1.0.1 | MIT |
| minimatch | 10.2.6 | BlueOak-1.0.0 |
| ms | 2.1.3 | MIT |
| nanoid | 3.3.20 | MIT |
| natural-compare | 1.4.0 | MIT |
| node-releases | 2.0.63 | MIT |
| nwsapi | 2.2.28 | MIT |
| optionator | 0.9.4 | MIT |
| p-limit | 3.1.0 | MIT |
| p-locate | 5.0.0 | MIT |
| parse5 | 7.3.0 | MIT |
| path-exists | 4.0.0 | MIT |
| path-key | 3.1.1 | MIT |
| pathe | 2.0.3 | MIT |
| pathval | 2.0.1 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| playwright | 1.59.1 | Apache-2.0 |
| playwright-core | 1.59.1 | Apache-2.0 |
| postcss | 8.5.29 | MIT |
| prelude-ls | 1.2.1 | MIT |
| pretty-format | 27.5.1 | MIT |
| punycode | 2.3.1 | MIT |
| qified | 0.10.1 | MIT |
| hookified | 2.2.0 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-is | 17.0.2 | MIT |
| redent | 3.0.0 | MIT |
| rolldown | 1.2.13 | MIT |
| rollup | 4.64.3 | MIT |
| rrweb-cssom | 0.7.1 | MIT |
| safer-buffer | 2.1.2 | MIT |
| saxes | 6.0.0 | ISC |
| scheduler | 0.28.0 | MIT |
| semver | 6.3.2 | ISC |
| shebang-command | 2.0.0 | MIT |
| shebang-regex | 3.0.0 | MIT |
| siginfo | 2.0.0 | ISC |
| source-map-js | 1.2.2 | BSD-3-Clause |
| stackback | 0.0.2 | MIT |
| std-env | 3.10.0 | MIT |
| strip-indent | 3.0.0 | MIT |
| strip-literal | 3.1.0 | MIT |
| js-tokens | 9.0.1 | MIT |
| symbol-tree | 3.2.4 | MIT |
| tinybench | 2.9.0 | MIT |
| tinyexec | 0.3.2 | MIT |
| tinyglobby | 0.2.17 | MIT |
| tinypool | 1.1.1 | MIT |
| tinyrainbow | 2.0.0 | MIT |
| tinyspy | 4.0.6 | MIT |
| tldts | 6.1.86 | MIT |
| tldts-core | 6.1.86 | MIT |
| tough-cookie | 5.1.2 | BSD-3-Clause |
| tr46 | 5.1.1 | MIT |
| ts-api-utils | 2.5.0 | MIT |
| type-check | 0.4.0 | MIT |
| typescript | 6.0.3 | Apache-2.0 |
| typescript-eslint | 8.72.2 | MIT |
| undici-types | 8.9.0 | MIT |
| update-browserslist-db | 1.3.4 | MIT |
| uri-js | 4.4.1 | BSD-2-Clause |
| vite | 8.3.4 | MIT |
| vite-node | 3.2.4 | MIT |
| vite | 7.3.7 | MIT |
| vitest | 3.2.7 | MIT |
| vite | 7.3.7 | MIT |
| w3c-xmlserializer | 5.0.0 | MIT |
| webidl-conversions | 7.0.0 | BSD-2-Clause |
| whatwg-encoding | 3.1.1 | MIT |
| whatwg-mimetype | 4.0.0 | MIT |
| whatwg-url | 14.2.0 | MIT |
| which | 2.0.2 | ISC |
| why-is-node-running | 2.3.0 | MIT |
| word-wrap | 1.2.5 | MIT |
| ws | 8.22.0 | MIT |
| xml-name-validator | 5.0.0 | Apache-2.0 |
| xmlchars | 2.2.0 | MIT |
| yallist | 3.1.1 | ISC |
| yocto-queue | 0.1.0 | MIT |
| zod | 4.6.7 | MIT |
| zod-validation-error | 4.0.2 | MIT |

## Pacchetti npm di `animazioni/`

Da `bun.lock`, con la licenza che ogni pacchetto dichiara. Compresi gli strumenti di costruzione e di prova, che `bun install` scarica.

| Pacchetto | Versione | Licenza |
|---|---|---|
| @fontsource/archivo | 5.3.0 | OFL-1.1 |
| @fontsource/chivo-mono | 5.3.0 | OFL-1.1 |
| @fontsource/instrument-sans | 5.3.0 | OFL-1.1 |
| @fontsource/space-grotesk | 5.3.0 | OFL-1.1 |
| @fontsource/stix-two-text | 5.3.0 | OFL-1.1 |
| @oxc-project/types | 0.152.0 | MIT |
| @rolldown/binding-win32-x64-msvc | 1.2.12 | MIT |
| @rolldown/pluginutils | 1.0.1 | MIT |
| @tweenjs/tween.js | 23.1.3 | MIT |
| @types/bun | 1.4.2 | MIT |
| @types/node | 26.6.4 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| @types/stats.js | 0.17.4 | MIT |
| @types/three | 0.170.0 | MIT |
| @types/webxr | 0.5.24 | MIT |
| @typescript/typescript-win32-x64 | 7.0.2 | Apache-2.0 |
| @vitejs/plugin-react | 6.1.2 | MIT |
| @webgpu/types | 0.1.74 | BSD-3-Clause |
| bun-types | 1.4.2 | MIT |
| csstype | 3.2.3 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| fdir | 6.5.0 | MIT |
| fflate | 0.8.3 | MIT |
| lightningcss | 1.33.0 | MPL-2.0 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0 |
| meshoptimizer | 0.18.1 | MIT |
| nanoid | 3.3.20 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| playwright | 1.63.0 | Apache-2.0 |
| playwright-core | 1.63.0 | Apache-2.0 |
| postcss | 8.5.29 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| rolldown | 1.2.12 | MIT |
| scheduler | 0.28.0 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| three | 0.170.0 | MIT |
| tinyglobby | 0.2.17 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| undici-types | 8.9.0 | MIT |
| vite | 8.3.3 | MIT |

## Crate Rust dell'app

Da `app/Cargo.lock` (`cargo metadata` per `x86_64-pc-windows-msvc`), con la licenza che ogni crate dichiara.

| Crate | Versione | Licenza |
|---|---|---|
| adler2 | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |
| aho-corasick | 1.1.5 | Unlicense OR MIT |
| alloc-no-stdlib | 3.0.0 | BSD-3-Clause |
| alloc-stdlib | 0.3.0 | BSD-3-Clause |
| anyhow | 1.0.104 | MIT OR Apache-2.0 |
| atomic-waker | 1.1.2 | Apache-2.0 OR MIT |
| autocfg | 1.5.1 | Apache-2.0 OR MIT |
| base64 | 0.22.1 | MIT OR Apache-2.0 |
| base64 | 0.23.1 | MIT OR Apache-2.0 |
| bit-set | 0.8.0 | Apache-2.0 OR MIT |
| bit-vec | 0.8.0 | Apache-2.0 OR MIT |
| bitflags | 1.3.2 | MIT/Apache-2.0 |
| bitflags | 2.13.2 | MIT OR Apache-2.0 |
| block-buffer | 0.10.4 | MIT OR Apache-2.0 |
| brotli | 9.1.1 | BSD-3-Clause AND MIT |
| brotli-decompressor | 6.2.0 | BSD-3-Clause/MIT |
| bs58 | 0.5.1 | MIT/Apache-2.0 |
| bumpalo | 3.20.3 | MIT OR Apache-2.0 |
| byteorder | 1.5.0 | Unlicense OR MIT |
| bytes | 1.12.1 | MIT |
| camino | 1.2.6 | MIT OR Apache-2.0 |
| cargo-platform | 0.1.9 | MIT OR Apache-2.0 |
| cargo_metadata | 0.19.2 | MIT |
| cargo_toml | 1.0.1 | Apache-2.0 OR MIT |
| cc | 1.11.0 | MIT OR Apache-2.0 |
| cfb | 0.14.0 | MIT |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| chrono | 0.4.45 | MIT OR Apache-2.0 |
| clipboard-win | 5.4.3 | BSL-1.0 |
| cookie | 0.18.2 | MIT OR Apache-2.0 |
| cpal | 0.18.2 | Apache-2.0 |
| cpufeatures | 0.2.17 | MIT OR Apache-2.0 |
| crc32fast | 1.5.4 | MIT OR Apache-2.0 |
| crossbeam-channel | 0.5.17 | MIT OR Apache-2.0 |
| crossbeam-utils | 0.8.23 | MIT OR Apache-2.0 |
| crypto-common | 0.1.7 | MIT OR Apache-2.0 |
| cssparser | 0.37.0 | MPL-2.0 |
| cssparser-macros | 0.7.1 | MPL-2.0 |
| ctor | 1.0.13 | Apache-2.0 OR MIT |
| darling | 0.24.1 | MIT |
| darling_core | 0.24.1 | MIT |
| darling_macro | 0.24.1 | MIT |
| dasp_sample | 0.11.0 | MIT OR Apache-2.0 |
| defmt | 1.2.0 | MIT OR Apache-2.0 |
| defmt-macros | 1.2.0 | MIT OR Apache-2.0 |
| defmt-parser | 1.1.0 | MIT OR Apache-2.0 |
| deranged | 0.5.9 | MIT OR Apache-2.0 |
| derive_more | 2.1.1 | MIT |
| derive_more-impl | 2.1.1 | MIT |
| digest | 0.10.7 | MIT OR Apache-2.0 |
| dirs | 7.0.0 | MIT OR Apache-2.0 |
| dirs-sys | 0.5.0 | MIT OR Apache-2.0 |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 |
| dom_query | 0.28.0 | MIT |
| dpi | 0.1.2 | Apache-2.0 AND MIT |
| dtoa | 1.0.11 | MIT OR Apache-2.0 |
| dtoa-short | 0.3.5 | MPL-2.0 |
| dunce | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 |
| dyn-clone | 1.0.20 | MIT OR Apache-2.0 |
| embed-resource | 3.0.12 | MIT |
| equivalent | 1.0.3 | Apache-2.0 OR MIT |
| erased-serde | 0.4.11 | MIT OR Apache-2.0 |
| error-code | 3.4.0 | BSL-1.0 |
| fastrand | 2.5.0 | Apache-2.0 OR MIT |
| fdeflate | 0.3.7 | MIT OR Apache-2.0 |
| find-msvc-tools | 0.1.15 | MIT OR Apache-2.0 |
| flate2 | 1.1.10 | MIT OR Apache-2.0 |
| fnv | 1.0.7 | Apache-2.0 / MIT |
| foldhash | 0.2.0 | Zlib |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 |
| futures-channel | 0.3.34 | MIT OR Apache-2.0 |
| futures-core | 0.3.34 | MIT OR Apache-2.0 |
| futures-io | 0.3.34 | MIT OR Apache-2.0 |
| futures-macro | 0.3.34 | MIT OR Apache-2.0 |
| futures-sink | 0.3.34 | MIT OR Apache-2.0 |
| futures-task | 0.3.34 | MIT OR Apache-2.0 |
| futures-util | 0.3.34 | MIT OR Apache-2.0 |
| generic-array | 0.14.7 | MIT |
| getrandom | 0.2.17 | MIT OR Apache-2.0 |
| getrandom | 0.3.4 | MIT OR Apache-2.0 |
| getrandom | 0.4.3 | MIT OR Apache-2.0 |
| glob | 0.3.4 | MIT OR Apache-2.0 |
| hashbrown | 0.12.3 | MIT OR Apache-2.0 |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 |
| heck | 0.5.0 | MIT OR Apache-2.0 |
| hex | 0.4.3 | MIT OR Apache-2.0 |
| html5ever | 0.39.0 | MIT OR Apache-2.0 |
| http | 1.5.0 | MIT OR Apache-2.0 |
| http-body | 1.1.0 | MIT |
| http-body-util | 0.1.5 | MIT |
| httparse | 1.10.1 | MIT OR Apache-2.0 |
| hyper | 1.12.0 | MIT |
| hyper-rustls | 0.27.10 | Apache-2.0 OR ISC OR MIT |
| hyper-util | 0.1.21 | MIT |
| ico | 0.6.0 | MIT |
| icu_collections | 2.4.0 | Unicode-3.0 |
| icu_locale_core | 2.4.0 | Unicode-3.0 |
| icu_normalizer | 2.4.0 | Unicode-3.0 |
| icu_normalizer_data | 2.4.0 | Unicode-3.0 |
| icu_properties | 2.4.0 | Unicode-3.0 |
| icu_properties_data | 2.4.0 | Unicode-3.0 |
| icu_provider | 2.4.0 | Unicode-3.0 |
| ident_case | 1.0.1 | MIT/Apache-2.0 |
| idna | 1.1.0 | MIT OR Apache-2.0 |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT |
| indexmap | 1.9.3 | Apache-2.0 OR MIT |
| indexmap | 2.14.2 | Apache-2.0 OR MIT |
| infer | 0.22.0 | MIT |
| ipnet | 2.12.2 | MIT OR Apache-2.0 |
| itoa | 1.0.18 | MIT OR Apache-2.0 |
| jiff | 0.2.38 | Unlicense OR MIT |
| jiff-core | 0.1.1 | Unlicense OR MIT |
| jiff-tzdb | 0.1.9 | Unlicense OR MIT |
| jiff-tzdb-platform | 0.1.3 | Unlicense OR MIT |
| json-patch | 4.2.0 | MIT/Apache-2.0 |
| jsonptr | 0.7.1 | MIT OR Apache-2.0 |
| keyboard-types | 0.8.3 | MIT OR Apache-2.0 |
| libc | 0.2.191 | MIT OR Apache-2.0 |
| litemap | 0.8.3 | Unicode-3.0 |
| lock_api | 0.4.14 | MIT OR Apache-2.0 |
| log | 0.4.35 | MIT OR Apache-2.0 |
| markup5ever | 0.39.0 | MIT OR Apache-2.0 |
| memchr | 2.8.3 | Unlicense OR MIT |
| mime | 0.3.17 | MIT OR Apache-2.0 |
| minisign-verify | 0.3.0 | MIT |
| miniz_oxide | 0.8.9 | MIT OR Zlib OR Apache-2.0 |
| miniz_oxide | 0.9.1 | MIT OR Zlib OR Apache-2.0 |
| mio | 1.2.4 | MIT |
| muda | 0.20.0 | Apache-2.0 OR MIT |
| new_debug_unreachable | 1.0.6 | MIT |
| ntapi | 0.4.3 | Apache-2.0 OR MIT |
| num-conv | 0.2.2 | MIT OR Apache-2.0 |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| once_cell | 1.21.4 | MIT OR Apache-2.0 |
| open | 5.4.5 | MIT |
| option-ext | 0.2.0 | MPL-2.0 |
| parking_lot | 0.12.5 | MIT OR Apache-2.0 |
| parking_lot_core | 0.9.12 | MIT OR Apache-2.0 |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 |
| phf | 0.13.1 | MIT |
| phf_codegen | 0.13.1 | MIT |
| phf_generator | 0.13.1 | MIT |
| phf_macros | 0.13.1 | MIT |
| phf_shared | 0.13.1 | MIT |
| pin-project-lite | 0.2.17 | Apache-2.0 OR MIT |
| plist | 1.10.3 | MIT |
| png | 0.18.1 | MIT OR Apache-2.0 |
| potential_utf | 0.1.6 | Unicode-3.0 |
| powerfmt | 0.2.1 | MIT OR Apache-2.0 |
| precomputed-hash | 0.1.1 | MIT |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 |
| quick-xml | 0.42.0 | MIT |
| quote | 1.0.47 | MIT OR Apache-2.0 |
| raw-window-handle | 0.6.2 | MIT OR Apache-2.0 OR Zlib |
| ref-cast | 1.0.27 | MIT OR Apache-2.0 |
| ref-cast-impl | 1.0.27 | MIT OR Apache-2.0 |
| regex | 1.13.1 | MIT OR Apache-2.0 |
| regex-automata | 0.4.18 | MIT OR Apache-2.0 |
| regex-syntax | 0.8.11 | MIT OR Apache-2.0 |
| reqwest | 0.13.5 | MIT OR Apache-2.0 |
| ring | 0.17.14 | Apache-2.0 AND ISC |
| rustc-hash | 2.1.3 | Apache-2.0 OR MIT |
| rustc_version | 0.4.1 | MIT OR Apache-2.0 |
| rustls | 0.23.46 | Apache-2.0 OR ISC OR MIT |
| rustls-pki-types | 1.15.1 | MIT OR Apache-2.0 |
| rustls-platform-verifier | 0.7.1 | MIT OR Apache-2.0 |
| rustls-webpki | 0.103.16 | ISC |
| same-file | 1.0.6 | Unlicense/MIT |
| schemars | 0.8.22 | MIT |
| schemars | 0.9.0 | MIT |
| schemars | 1.2.3 | MIT |
| schemars_derive | 0.8.22 | MIT |
| scopeguard | 1.2.0 | MIT OR Apache-2.0 |
| selectors | 0.38.0 | MPL-2.0 |
| semver | 1.0.28 | MIT OR Apache-2.0 |
| serde | 1.0.229 | MIT OR Apache-2.0 |
| serde-untagged | 0.1.9 | MIT OR Apache-2.0 |
| serde_core | 1.0.229 | MIT OR Apache-2.0 |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 |
| serde_derive_internals | 0.29.1 | MIT OR Apache-2.0 |
| serde_json | 1.0.154 | MIT OR Apache-2.0 |
| serde_repr | 0.1.21 | MIT OR Apache-2.0 |
| serde_spanned | 1.1.2 | MIT OR Apache-2.0 |
| serde_with | 3.24.0 | MIT OR Apache-2.0 |
| serde_with_macros | 3.24.0 | MIT OR Apache-2.0 |
| serialize-to-javascript | 0.1.2 | MIT OR Apache-2.0 |
| serialize-to-javascript-impl | 0.1.2 | MIT OR Apache-2.0 |
| servo_arc | 0.4.3 | MIT OR Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| shlex | 2.0.1 | MIT OR Apache-2.0 |
| simd-adler32 | 0.3.10 | MIT |
| siphasher | 1.0.4 | MIT OR Apache-2.0 |
| slab | 0.4.12 | MIT |
| smallvec | 1.16.4 | MIT OR Apache-2.0 |
| socket2 | 0.6.5 | MIT OR Apache-2.0 |
| softbuffer | 0.4.8 | MIT OR Apache-2.0 |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 |
| static_vcruntime | 3.0.0 | MIT OR Apache-2.0 OR Zlib |
| string_cache | 0.9.0 | MIT OR Apache-2.0 |
| string_cache_codegen | 0.6.1 | MIT OR Apache-2.0 |
| strsim | 0.11.1 | MIT |
| subtle | 2.6.1 | BSD-3-Clause |
| syn | 2.0.119 | MIT OR Apache-2.0 |
| syn | 3.0.9 | MIT OR Apache-2.0 |
| sync_wrapper | 1.0.2 | Apache-2.0 |
| synstructure | 0.14.0 | MIT |
| sysinfo | 0.33.1 | MIT |
| tao | 0.37.2 | Apache-2.0 |
| tauri | 2.12.5 | Apache-2.0 OR MIT |
| tauri-build | 2.7.4 | Apache-2.0 OR MIT |
| tauri-codegen | 2.7.4 | Apache-2.0 OR MIT |
| tauri-macros | 2.7.4 | Apache-2.0 OR MIT |
| tauri-plugin | 2.7.2 | Apache-2.0 OR MIT |
| tauri-plugin-opener | 2.7.2 | Apache-2.0 OR MIT |
| tauri-plugin-single-instance | 2.5.5 | Apache-2.0 OR MIT |
| tauri-plugin-updater | 2.14.1 | Apache-2.0 OR MIT |
| tauri-plugin-window-state | 2.5.0 | Apache-2.0 OR MIT |
| tauri-runtime | 2.12.2 | Apache-2.0 OR MIT |
| tauri-runtime-wry | 2.12.3 | Apache-2.0 OR MIT |
| tauri-utils | 2.10.2 | Apache-2.0 OR MIT |
| tauri-winres | 0.3.7 | MIT |
| tempfile | 3.27.0 | MIT OR Apache-2.0 |
| tendril | 0.5.1 | MIT OR Apache-2.0 |
| thiserror | 2.0.21 | MIT OR Apache-2.0 |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 |
| time | 0.3.55 | MIT OR Apache-2.0 |
| time-core | 0.1.9 | MIT OR Apache-2.0 |
| time-macros | 0.2.32 | MIT OR Apache-2.0 |
| tinystr | 0.8.5 | Unicode-3.0 |
| tinyvec | 1.13.3 | Zlib OR Apache-2.0 OR MIT |
| tokio | 1.54.1 | MIT |
| tokio-rustls | 0.26.6 | MIT OR Apache-2.0 |
| tokio-util | 0.7.20 | MIT |
| toml | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_datetime | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_parser | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 |
| toml_writer | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 |
| tower | 0.5.3 | MIT |
| tower-http | 0.6.11 | MIT |
| tower-layer | 0.3.3 | MIT |
| tower-service | 0.3.3 | MIT |
| tracing | 0.1.44 | MIT |
| tracing-attributes | 0.1.31 | MIT |
| tracing-core | 0.1.36 | MIT |
| tray-icon | 0.25.1 | MIT OR Apache-2.0 |
| try-lock | 0.2.5 | MIT |
| typed-path | 0.13.0 | MIT OR Apache-2.0 |
| typeid | 1.0.3 | MIT OR Apache-2.0 |
| typenum | 1.20.1 | MIT OR Apache-2.0 |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| unicode-segmentation | 1.13.3 | MIT OR Apache-2.0 |
| untrusted | 0.9.0 | ISC |
| ureq | 3.5.0 | MIT OR Apache-2.0 |
| ureq-proto | 0.6.5 | MIT OR Apache-2.0 |
| url | 2.5.8 | MIT OR Apache-2.0 |
| urlpattern | 0.6.0 | MIT |
| utf8-zero | 0.8.1 | MIT OR Apache-2.0 |
| utf8_iter | 1.1.0 | Apache-2.0 OR MIT |
| utf_types | 1.0.0 | Apache-2.0 OR MIT |
| uuid | 1.29.0 | Apache-2.0 OR MIT |
| version_check | 0.9.5 | MIT/Apache-2.0 |
| vswhom | 0.1.0 | MIT |
| vswhom-sys | 0.1.3 | MIT |
| walkdir | 2.5.0 | Unlicense/MIT |
| want | 0.3.2 | MIT |
| web-time | 1.1.0 | MIT OR Apache-2.0 |
| web_atoms | 0.2.6 | MIT OR Apache-2.0 |
| webpki-roots | 1.0.11 | CDLA-Permissive-2.0 |
| webview2-com | 0.39.1 | MIT |
| webview2-com-macros | 0.8.1 | MIT |
| webview2-com-sys | 0.39.1 | MIT |
| winapi | 0.3.9 | MIT/Apache-2.0 |
| winapi-util | 0.1.11 | Unlicense OR MIT |
| window-vibrancy | 0.8.1 | Apache-2.0 OR MIT |
| windows | 0.57.0 | MIT OR Apache-2.0 |
| windows | 0.58.0 | MIT OR Apache-2.0 |
| windows | 0.62.2 | MIT OR Apache-2.0 |
| windows-collections | 0.3.2 | MIT OR Apache-2.0 |
| windows-core | 0.57.0 | MIT OR Apache-2.0 |
| windows-core | 0.58.0 | MIT OR Apache-2.0 |
| windows-core | 0.62.2 | MIT OR Apache-2.0 |
| windows-future | 0.3.2 | MIT OR Apache-2.0 |
| windows-implement | 0.57.0 | MIT OR Apache-2.0 |
| windows-implement | 0.58.0 | MIT OR Apache-2.0 |
| windows-implement | 0.60.2 | MIT OR Apache-2.0 |
| windows-interface | 0.57.0 | MIT OR Apache-2.0 |
| windows-interface | 0.58.0 | MIT OR Apache-2.0 |
| windows-interface | 0.59.3 | MIT OR Apache-2.0 |
| windows-link | 0.2.1 | MIT OR Apache-2.0 |
| windows-numerics | 0.3.1 | MIT OR Apache-2.0 |
| windows-registry | 0.6.1 | MIT OR Apache-2.0 |
| windows-result | 0.1.2 | MIT OR Apache-2.0 |
| windows-result | 0.2.0 | MIT OR Apache-2.0 |
| windows-result | 0.4.1 | MIT OR Apache-2.0 |
| windows-strings | 0.1.0 | MIT OR Apache-2.0 |
| windows-strings | 0.5.1 | MIT OR Apache-2.0 |
| windows-sys | 0.61.2 | MIT OR Apache-2.0 |
| windows-targets | 0.52.6 | MIT OR Apache-2.0 |
| windows-threading | 0.2.1 | MIT OR Apache-2.0 |
| windows-version | 0.1.7 | MIT OR Apache-2.0 |
| windows_x86_64_msvc | 0.52.6 | MIT OR Apache-2.0 |
| winnow | 1.0.4 | MIT |
| winreg | 0.56.0 | MIT |
| writeable | 0.6.4 | Unicode-3.0 |
| wry | 0.57.1 | Apache-2.0 OR MIT |
| yoke | 0.8.4 | Unicode-3.0 |
| yoke-derive | 0.8.4 | Unicode-3.0 |
| zerofrom | 0.1.8 | Unicode-3.0 |
| zerofrom-derive | 0.1.8 | Unicode-3.0 |
| zeroize | 1.9.1 | Apache-2.0 OR MIT |
| zerotrie | 0.2.5 | Unicode-3.0 |
| zerovec | 0.11.9 | Unicode-3.0 |
| zerovec-derive | 0.11.7 | Unicode-3.0 |
| zip | 2.6.1 | MIT |
| zip | 9.4.0 | MIT |
| zlib-rs | 0.6.8 | Zlib |
| zmij | 1.0.23 | MIT |
| zopfli | 0.8.4 | Apache-2.0 |
