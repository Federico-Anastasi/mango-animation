import type { Video } from "../../impianto";
import { DURATA_SIGLA, FOTOGRAMMI_SIGLA, Sigla } from "./sigla";

// La sigla di tutti i film animati: un film che la apre usa la scena `sigla`.

export const video: Video = {
  titolo: "Sigla",
  scene: {
    sigla: {
      titolo: "Sigla · mango animation",
      voce: "",
      parole: ["il mango cade", "le lettere si alzano a onda", "passa la luce"],
      durata: DURATA_SIGLA,
      fotogrammi: FOTOGRAMMI_SIGLA,
      fascia: [0, 0, 1080, 1920],
      Componente: Sigla,
    },
  },
};
