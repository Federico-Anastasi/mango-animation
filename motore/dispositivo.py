import os
import sys
from functools import cache

from .errori import Errore, dice
from .profilo import macchina_di_lavoro, motore


def cuda_disponibile():
    import torch

    return torch.cuda.is_available()


def _vincola_la_scheda(macchina):
    """Dopo questo, la scheda del profilo è la 0 per tutti i programmi del processo (torch, ctranslate2); chi ha già scelto le schede visibili non viene scavalcato."""
    indice = macchina.get("scheda_video")
    if indice is not None:
        os.environ.setdefault("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
        os.environ.setdefault("CUDA_VISIBLE_DEVICES", str(indice))


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
        raise Errore(f"il profilo vuole la scheda video {macchina['scheda_video']} (macchina.scheda_video), ma non c'è una scheda NVIDIA che il motore possa usare: correggi il numero, oppure metti null per lavorare sul processore",
                     f"the profile wants the video card {macchina['scheda_video']} (macchina.scheda_video), but there is no NVIDIA card the engine can use: fix the number, or set null to work on the processor")
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
    def scheda_c_e():
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0

    scelto = _scelta("dettatura", scheda_c_e)
    if scelto:
        return scelto
    macchina = macchina_di_lavoro()
    if macchina.get("scheda_video", 0) is None:
        return "cpu"
    _vincola_la_scheda(macchina)
    return "cuda" if scheda_c_e() else "cpu"
