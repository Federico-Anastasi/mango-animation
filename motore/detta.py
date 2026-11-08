import base64
import json
import os
import queue
import sys
import threading

import numpy as np

from .archivio import REPO, VARIABILE_LAVORO, leggi_stile
from .dispositivo import dispositivo_voce
from .errori import Errore, dice
from .profilo import richiedi

CAMPIONI = 16000


class Frasi:
    """Dalla voce che arriva a pezzi alle frasi: la frase in corso si ritrascrive ogni `ogni_parziale` secondi (`parziale`), e dopo
    `silenzio_fine` secondi senza voce si chiude (`definitiva`). Il silenzio lo misura il VAD, solo sulla coda dell'audio: guardare
    tutta la frase a ogni giro costerebbe sempre di più.

    `trascrivi(audio, fasci)` dà il testo di un audio a 16 kHz; `voce(audio, pausa)` i tratti di voce `[(inizio, fine)]` in campioni,
    separati dai silenzi più lunghi di `pausa` secondi."""

    def __init__(self, cfg, trascrivi, voce, emetti):
        self.cfg, self.trascrivi, self.voce, self.emetti = cfg, trascrivi, voce, emetti
        self.nuova(None)

    def nuova(self, id):
        self.id = id
        self.audio = np.zeros(0, np.float32)
        self.in_frase = False
        self.al_parziale = 0
        self.ultimo = ""
        if id is not None:
            self._evento(tipo="ascolto")

    def _evento(self, **evento):
        self.emetti({"id": self.id, **evento})

    def _campioni(self, secondi):
        return int(secondi * CAMPIONI)

    def arriva(self, pezzo):
        self.audio = np.concatenate([self.audio, pezzo])

    def _coda(self):
        """Dove finisce l'ultima voce, in campioni dell'audio intero (`None` se nella coda non ce n'è): si guarda solo la fine dell'audio, lunga
        quanto serve a vedere un silenzio di `silenzio_fine`."""
        lunga = self._campioni(self.cfg["silenzio_fine"] + self.cfg["vad"]["guardia"])
        da = max(0, len(self.audio) - lunga)
        tratti = self.voce(self.audio[da:], self.cfg["vad"]["pausa_fine"])
        return da + tratti[-1][1] if tratti else None

    def passo(self):
        """Dopo ogni arrivo d'audio: aspetta la voce, o segue la frase, la chiude, o ne dà il testo di adesso."""
        if self.in_frase or self._aspetta():
            self._segui()

    def _segui(self):
        cfg = self.cfg
        fine_voce = self._coda()
        silenzio = (len(self.audio) - fine_voce) / CAMPIONI if fine_voce is not None else None
        if silenzio is None or silenzio >= cfg["silenzio_fine"]:
            self._chiudi(len(self.audio))
        elif len(self.audio) >= self._campioni(cfg["massimo_frase"]):
            self._chiudi(self._punto_di_taglio(), tieni_il_resto=True)
        elif len(self.audio) - self.al_parziale >= self._campioni(cfg["ogni_parziale"]):
            self._parziale(fine_voce)

    def _aspetta(self):
        """Prima della voce si tiene solo un po' d'audio, per non perdere l'attacco della prima parola. Vero se la voce è arrivata."""
        cfg = self.cfg
        prima = self._campioni(cfg["prima"])
        tratti = self.voce(self.audio, cfg["vad"]["pausa_fine"])
        if not tratti:
            self.audio = self.audio[-prima:] if prima else self.audio[:0]
            return False
        self.audio = self.audio[max(0, tratti[0][0] - prima):]
        self.in_frase = True
        self.al_parziale = 0
        return True

    def _punto_di_taglio(self):
        """Una frase troppo lunga si taglia nell'ultima pausa che ha; senza pause, dove è arrivata."""
        tratti = self.voce(self.audio, self.cfg["vad"]["pausa_interna"])
        return (tratti[-2][1] + tratti[-1][0]) // 2 if len(tratti) > 1 else len(self.audio)

    def _testo(self, fino, fasci):
        margine = self._campioni(self.cfg["vad"]["margine"])
        return self.trascrivi(self.audio[:min(len(self.audio), fino + margine)], fasci).strip()

    def _parziale(self, fine_voce):
        self.al_parziale = len(self.audio)
        testo = self._testo(fine_voce, self.cfg["fasci_parziale"])
        if testo and testo != self.ultimo:
            self.ultimo = testo
            self._evento(tipo="parziale", testo=testo)

    def _chiudi(self, fino, tieni_il_resto=False):
        """La frase finisce a `fino`. Con `tieni_il_resto` ciò che viene dopo è l'inizio della prossima."""
        tratti = self.voce(self.audio[:fino], self.cfg["vad"]["pausa_fine"])
        testo = self._testo(tratti[-1][1], self.cfg["fasci_definitiva"]) if tratti else ""
        resto = self.audio[fino:] if tieni_il_resto else self.audio[:0]
        self.audio, self.in_frase, self.al_parziale, self.ultimo = resto, False, 0, ""
        if testo:
            self._evento(tipo="definitiva", testo=testo)

    def fine(self):
        """La dettatura è finita: la frase in corso si chiude adesso, senza aspettare il silenzio."""
        if self.in_frase or self._aspetta():
            self._chiudi(len(self.audio))
        self.audio = self.audio[:0]
        self._evento(tipo="chiusa")


def leggi_righe(ingresso, coda):
    for riga in ingresso:
        if riga.strip():
            coda.put(riga)
    coda.put(None)


def servi(ingresso, frasi):
    """Il protocollo a righe JSON: `nuova` (con l'`id`), `audio` (`pcm`, PCM 16 bit a 16 kHz mono in base64) e `fine`. Si legge in un thread
    a parte, così l'audio non resta bloccato mentre si trascrive, e a ogni giro si prende tutto ciò che è arrivato."""
    coda = queue.Queue()
    threading.Thread(target=leggi_righe, args=(ingresso, coda), daemon=True).start()
    while True:
        righe = [coda.get()]
        while righe[-1] is not None and not coda.empty():
            righe.append(coda.get_nowait())
        nuovo_audio = False
        for riga in filter(None, righe):
            messaggio = json.loads(riga)
            if messaggio["tipo"] == "nuova":
                frasi.nuova(messaggio["id"])
            elif messaggio["tipo"] == "audio":
                frasi.arriva(np.frombuffer(base64.b64decode(messaggio["pcm"]), np.int16).astype(np.float32) / 32768)
                nuovo_audio = True
            elif messaggio["tipo"] == "fine":
                frasi.fine()
                nuovo_audio = False
        if nuovo_audio:
            frasi.passo()
        if righe[-1] is None:
            return


def scelta_del_calcolo(preferiti, dove):
    import ctranslate2

    ammessi = ctranslate2.get_supported_compute_types(dove)
    scelto = next((c for c in preferiti if c in ammessi), None)
    if scelto is None:
        raise Errore(f"questo computer non sa fare i calcoli {', '.join(preferiti)} per la dettatura (sa fare: {', '.join(sorted(ammessi))}): cambiali in stile.json, dettatura.dispositivi.{dove}.calcolo",
                     f"this computer cannot do the {', '.join(preferiti)} computations for dictation (it can do: {', '.join(sorted(ammessi))}): change them in stile.json, dettatura.dispositivi.{dove}.calcolo")
    return scelto


def carica(cfg):
    """Il modello della dettatura sulla scheda NVIDIA (quella del profilo, `dispositivo_voce`), o sul processore se non c'è: dice cosa ha scelto."""
    dove = dispositivo_voce()
    d = cfg["dispositivi"][dove]
    calcolo = scelta_del_calcolo(d["calcolo"], dove)
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise Errore("manca il pacchetto Python faster-whisper (pip install faster-whisper)",
                     "the Python package faster-whisper is missing (pip install faster-whisper)")
    try:
        modello = WhisperModel(d["modello"], device=dove, device_index=0, compute_type=calcolo, cpu_threads=d["thread"])
    except RuntimeError as e:
        if "out of memory" in str(e).lower():
            raise Errore(f"la scheda video non ha memoria libera per il modello {d['modello']}: chiudi il lavoro che la usa, oppure metti null in macchina.scheda_video del profilo per dettare col processore",
                         f"the video card has no free memory for the model {d['modello']}: close the job that uses it, or set null in macchina.scheda_video of the profile to dictate with the processor")
        raise
    except OSError as e:
        raise Errore(f"il modello {d['modello']} non si trova e non si riesce a scaricarlo (la prima volta serve la rete): {e}",
                     f"the model {d['modello']} cannot be found and cannot be downloaded (the first time the network is needed): {e}")
    return modello, {"dispositivo": dove, "modello": d["modello"], "calcolo": calcolo}


def funzioni(modello, cfg):
    def trascrivi(audio, fasci):
        segmenti, _ = modello.transcribe(audio, language=cfg["lingua"], beam_size=fasci, temperature=0.0, condition_on_previous_text=False,
                                         vad_filter=False, without_timestamps=True)
        return " ".join(s.text.strip() for s in segmenti)

    def voce(audio, pausa):
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        v = cfg["vad"]
        opzioni = VadOptions(onset=v["soglia"], min_speech_duration_ms=round(v["voce_minima"] * 1000), min_silence_duration_ms=round(pausa * 1000), speech_pad_ms=0)
        return [(t["start"], t["end"]) for t in get_speech_timestamps(audio, opzioni)] if len(audio) else []

    return trascrivi, voce


def detta():
    cfg = leggi_stile(REPO, os.environ.get(VARIABILE_LAVORO))["dettatura"]
    protocollo, sys.stdout = sys.stdout, sys.stderr

    def emetti(evento):
        protocollo.write(json.dumps(evento, ensure_ascii=False) + "\n")
        protocollo.flush()

    try:
        richiedi("dettatura", "la dettatura è chiesta", "dictation is requested")
        modello, scelta = carica(cfg)
    except Exception as e:
        emetti({"tipo": "errore", "messaggio": dice(f"Non riesco a preparare la dettatura: {e}", f"Cannot prepare dictation: {e}"), "fatale": True})
        sys.exit(1)
    print(f"[detta] {scelta['modello']} su {scelta['dispositivo']} ({scelta['calcolo']})", file=sys.stderr, flush=True)
    trascrivi, voce = funzioni(modello, cfg)
    emetti({"tipo": "pronto", **scelta})
    servi(sys.stdin, Frasi(cfg, trascrivi, voce, emetti))
