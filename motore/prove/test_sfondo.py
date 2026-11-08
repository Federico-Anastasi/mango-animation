import json

import pytest

from motore.errori import Errore
from motore.risolvi import risolvi

from .aiuti import audio, energia_a, fotogramma, monta_con_animazioni, vicino
from .conftest import PAROLE_PAROLE, PAROLE_TEMPO

GIALLO, ROSSO = (230, 230, 0), (255, 0, 0)


def piano(voce, larga, fermo):
    return {"quadro": "girato-pieno", "sorgenti": {"v": {"file": voce}, "l": {"file": larga}}, "sottotitoli": {"modo": "nessuno"},
            "scene": [{"nome": "s", "pezzi": [{"sorgente": "v", "da": 0.6, "a": 2.4, "girato": {"sorgente": "l", "fermo": fermo}}]}]}


def test_il_girato_puo_essere_un_fotogramma_fermo_di_un_altra_ripresa(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    voce = prepara_sintetico("tempo", PAROLE_TEMPO)
    larga = prepara_sintetico("larga", PAROLE_TEMPO)
    scrivi_piano("s", piano(voce, larga, 1.0))
    file, montato = monta_con_animazioni(archivio, "s", tmp_path)
    [tratto] = json.loads((archivio.lavoro("s") / "risolto.json").read_text(encoding="utf-8"))["tratti"]
    assert tratto["sorgente"] == "v" and tratto["girato"] == {"sorgente": "l", "fermo": 1.0}
    # «tempo» è rosso a sinistra; «larga» ha il riquadro giallo al centro, che riempie la parte alta del verticale.
    for t in (0.2, montato["durata"] - 0.2):
        assert vicino(fotogramma(file, t)[1000, 300], GIALLO)
    assert not vicino(fotogramma(file, 0.2)[1000, 300], ROSSO)
    assert energia_a(audio(file, 0.3, 0.5), 440) > 1


def test_un_girato_fermo_fuori_dalla_ripresa_e_un_errore(archivio, scrivi_piano, prepara_sintetico):
    voce = prepara_sintetico("parole", PAROLE_PAROLE)
    larga = prepara_sintetico("larga", PAROLE_TEMPO)
    scrivi_piano("s", piano(voce, larga, 30.0))
    with pytest.raises(Errore, match="fuori"):
        risolvi(archivio, "s")
