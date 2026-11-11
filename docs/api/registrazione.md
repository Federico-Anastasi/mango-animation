# La registrazione dello schermo

Parte di `docs/API.md` (le regole comuni: la chiave, gli errori, la lingua).
| rotta | cosa fa |
|---|---|
| `GET /api/registrazione` | lo stato della registrazione dello schermo (sotto) |
| `POST /api/registrazione` | `{ modo: "schermo" \| "voce" \| "viso", microfono?, camera? }` → 201 con lo stato; 409 se una è già in corso, se manca ffmpeg o il dispositivo che serve |
| `DELETE /api/registrazione` | la ferma e dà lo stato; 409 se non ce n'è una in corso |
| `POST /api/registrazione/dispositivi` | cerca di nuovo microfoni e webcam e dà lo stato |

**La registrazione.** Registra lo schermo intero con ffmpeg dentro `archivio/grezzo/<giorno di oggi>/`, una
alla volta. I modi: `schermo` (senza audio), `voce` (lo schermo con la voce del microfono, in un file solo),
`viso` (in più la webcam, in un secondo file). I file sono `<AAAAMMGG-HHMMSS>-schermo.mp4` e `-viso.mp4` (mp4 a frammenti: il browser li legge senza preparazione e restano leggibili anche se ffmpeg si interrompe);
la loro scheda nasce all'avvio (`tipo` «schermo» o «ripresa», `origine` «registrazione») e prende durata e
misure quando la registrazione si ferma. `GET /api/registrazione` dà `{ disponibile, motivo, dispositivi,
in_corso, ultima }`:

- `disponibile` è falso se ffmpeg non è installato, e `motivo` lo dice.
- `dispositivi`: `{ microfoni: [nome], camere: [nome] }`, cercati all'avvio e con `POST …/dispositivi`, mai
  dentro la `GET`; `null` finché la prima ricerca non è finita. Senza indicazione si usano il primo microfono e la prima
  webcam che non sia una camera virtuale; `POST /api/registrazione` può nominare `microfono` e `camera`, che devono essere fra i dispositivi
  trovati (anche la camera virtuale, se è lei che si sceglie): uno che non c'è è un `409` che dice di sceglierne un altro, e un nome che non è un testo è un `400`.
- `in_corso`: `{ modo, iniziata, file: [giorno/nome] }` o `null`.
- `ultima`: `{ file, finita, errore }` dell'ultima registrazione chiusa da quando il server è acceso; `errore`
  è l'ultima riga di ffmpeg se si è interrotta da sola (dispositivo occupato, disco pieno), altrimenti `null`.

Fermare il server ferma bene anche la registrazione in corso. L'ingresso dello schermo e la codifica stanno
in `server/src/configurazione.ts`: lo schermo a 30 fotogrammi, codificato dalla scheda di `macchina.scheda_registrazione` del profilo del creator
(l'indice di `nvidia-smi`); senza quel campo, dalla scheda NVIDIA che c'è; con `null`, o senza nessuna scheda, dal processore (`libx264`).
