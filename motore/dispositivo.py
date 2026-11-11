import ctypes
import os
import re
import sys
from functools import cache
from importlib.util import find_spec
from pathlib import Path

import numpy as np

from .errori import Errore, dice
from .profilo import macchina_di_lavoro, motore

CUBLAS = "cublas64_12.dll"
# Dove sta la cublas di CUDA 12 fra i pacchetti Python: dentro torch (che l'ha portata con sé) o nel pacchetto nvidia-cublas-cu12 (che l'app installa dove torch non c'è).
POSTI_DELLA_CUBLAS = (("torch", "lib"), ("nvidia", "cublas", "bin"))


def _ctranslate2_vede_una_scheda():
    import ctranslate2

    return ctranslate2.get_cuda_device_count() > 0


def cuda_disponibile():
    """Se c'è una scheda NVIDIA che il motore può usare. Lo dice torch; dove torch non c'è (l'app lo installa solo con l'allineamento o la sagoma) lo dice ctranslate2, che è ciò che trascrive."""
    if find_spec("torch") is None:
        return _ctranslate2_vede_una_scheda()
    import torch

    return torch.cuda.is_available()


def librerie_cuda():
    """Rende trovabile la cublas di CUDA 12, che ctranslate2 (faster-whisper) cerca per nome sulla scheda: Windows non la trova da sé se CUDA non è installato a parte, e la trascrizione
    muore alla prima frase. Si carica per percorso, e da lì in poi la trova per nome; si guarda dove l'hanno portata torch o il pacchetto nvidia-cublas-cu12, senza importare torch (costa secondi e
    memoria). Va chiamata prima di caricare il modello. Dove non c'è, non fa niente: lo dice `prova_della_scheda` alla prima trascrizione."""
    for posto in POSTI_DELLA_CUBLAS:
        for cartella in sys.path:
            file = Path(cartella, *posto, CUBLAS)
            if file.is_file():
                ctypes.CDLL(str(file))
                return


def prova_della_scheda(modello, lingua):
    """Trascrive mezzo secondo (8000 campioni a 16 kHz) di silenzio: i guai della scheda (una libreria che manca, la memoria che non basta per il primo calcolo) vengono fuori adesso e non alla prima frase di chi parla."""
    segmenti, _ = modello.transcribe(np.zeros(8000, np.float32), language=lingua, beam_size=1, vad_filter=False, without_timestamps=True)
    list(segmenti)


def errore_di_libreria_cuda(guasto):
    """L'`Errore` da dire se `guasto` (un RuntimeError di ctranslate2) è una libreria di CUDA che non si carica; `None` per ogni altro guasto."""
    trovata = re.search(r"[Ll]ibrary (\S+\.dll)", str(guasto))
    if not trovata:
        return None
    libreria = trovata.group(1)
    return Errore(f"alla scheda video manca la libreria di calcolo {libreria} (CUDA 12): metti null in macchina.scheda_video del profilo per lavorare col processore",
                  f"the video card is missing the computing library {libreria} (CUDA 12): set null in macchina.scheda_video of the profile to work with the processor")


def errore_di_memoria(guasto, cosa, cosa_en):
    """L'`Errore` da dire se `guasto` (un RuntimeError di CUDA o di torch) è la memoria della scheda che non basta per `cosa`; `None` per ogni altro guasto."""
    if "out of memory" not in str(guasto).lower():
        return None
    return Errore(f"la scheda video non ha memoria libera per {cosa}: chiudi il lavoro che la usa, oppure metti null in macchina.scheda_video del profilo per lavorare col processore",
                  f"the video card has no free memory for {cosa_en}: close the job that uses it, or set null in macchina.scheda_video of the profile to work with the processor")


def _vincola_la_scheda(macchina):
    """Dopo questo, le schede sono numerate come le elenca `nvidia-smi` (anche per `animazioni/`) e quella del profilo è la 0 per tutti i programmi del processo (torch, ctranslate2).
    La scheda la decide il profilo: un `CUDA_VISIBLE_DEVICES` ereditato da chi ha lanciato il motore (l'ambiente dell'utente, l'app) non si rispetta né si rifiuta, si sostituisce."""
    os.environ["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"
    indice = macchina.get("scheda_video")
    if indice is not None:
        os.environ["CUDA_VISIBLE_DEVICES"] = str(indice)


@cache
def _della_macchina():
    macchina = macchina_di_lavoro()
    if "scheda_video" in macchina and macchina["scheda_video"] is None:
        print(dice("motore: il profilo esclude la scheda video (macchina.scheda_video): i modelli lavorano sul processore, più lento",
                   "engine: the profile excludes the video card (macchina.scheda_video): the models run on the processor, slower"), file=sys.stderr)
        return "cpu"
    _vincola_la_scheda(macchina)
    if cuda_disponibile():
        return "cuda"
    if "scheda_video" in macchina:
        raise Errore(f"il profilo vuole la scheda video {macchina['scheda_video']} (macchina.scheda_video), ma non c'è una scheda NVIDIA con quel numero (i numeri sono quelli di nvidia-smi): correggi il numero, oppure metti null per lavorare sul processore",
                     f"the profile wants the video card {macchina['scheda_video']} (macchina.scheda_video), but there is no NVIDIA card with that number (the numbers are those of nvidia-smi): fix the number, or set null to work on the processor")
    print(dice("motore: nessuna scheda NVIDIA: i modelli lavorano sul processore, più lento (una scheda si indica in profilo.json, macchina.scheda_video)",
               "engine: no NVIDIA card: the models run on the processor, slower (a card is set in profilo.json, macchina.scheda_video)"), file=sys.stderr)
    return "cpu"


def _scelta(funzione, scheda_c_e):
    """"cuda" o "cpu" per la funzione: `motori.<funzione>.dove` del profilo se c'è, se no la regola della macchina. `scheda_c_e()` dice se il motore può usare una scheda."""
    dove = motore(funzione).get("dove")
    if dove == "processore":
        return "cpu"
    if dove == "scheda":
        macchina = macchina_di_lavoro()
        if "scheda_video" in macchina and macchina["scheda_video"] is None:
            raise Errore(f"«{funzione}» vuole la scheda video (motori.{funzione}.dove), ma il profilo la esclude (macchina.scheda_video è null): togli uno dei due",
                         f"«{funzione}» wants the video card (motori.{funzione}.dove), but the profile rules it out (macchina.scheda_video is null): remove one of the two")
        _vincola_la_scheda(macchina)
        if not scheda_c_e():
            raise Errore(f"«{funzione}» vuole la scheda video (motori.{funzione}.dove), ma non c'è una scheda NVIDIA che il motore possa usare: libera quella che c'è, oppure metti \"processore\"",
                         f"«{funzione}» wants the video card (motori.{funzione}.dove), but there is no NVIDIA card the engine can use: free the one there is, or set \"processore\"")
        return "cuda"
    return None


@cache
def dispositivo(funzione):
    """Dove gira una funzione pesante (`trascrizione`, `allineamento`, `sagoma`, `segui`): "cuda" o "cpu". Lo dice `motori.<funzione>.dove` del profilo; senza, la scheda del
    profilo (`macchina.scheda_video`; senza, la scheda NVIDIA che c'è) o, se non c'è scheda o il profilo la esclude con null, il processore."""
    return _scelta(funzione, cuda_disponibile) or _della_macchina()


def dispositivo_voce():
    """Dove gira la dettatura: `motori.dettatura.dove` del profilo; senza, la scheda NVIDIA se c'è (quella del profilo, se la indica), altrimenti il processore."""
    scelto = _scelta("dettatura", _ctranslate2_vede_una_scheda)
    if scelto:
        return scelto
    macchina = macchina_di_lavoro()
    if macchina.get("scheda_video", 0) is None:
        return "cpu"
    _vincola_la_scheda(macchina)
    return "cuda" if _ctranslate2_vede_una_scheda() else "cpu"
