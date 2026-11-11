import shutil
import wave

import numpy as np
import pytest

from motore import pulizia
from motore.errori import Errore
from motore.media import info

from .aiuti import audio, monta_con_animazioni
from .conftest import PAROLE_TEMPO

# Preso prima che le prove lo sostituiscano (`voce_senza_programma` in conftest).
FILTRA_VERO = pulizia.filtra


def _piano(file):
    return {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}},
            "scene": [{"nome": "s", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 4.5}]}], "sottotitoli": {"modo": "nessuno"}}


@pytest.fixture
def filtro(monkeypatch):
    """Al posto di DeepFilterNet: zittisce il primo secondo, abbassa il resto di 6 dB e accorcia di 30 ms (anche il programma vero
    abbassa un po' la voce e la restituisce più corta). Conta le chiamate."""
    chiamate = []

    def finto(grezza, pulita, stile):
        chiamate.append(grezza)
        with wave.open(str(grezza)) as w:
            sr, canali = w.getframerate(), w.getnchannels()
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, canali)
        x = (x[: len(x) - round(0.03 * sr)] * 0.5).astype(np.int16)
        x[:sr] = 0
        with wave.open(str(pulita), "wb") as w:
            w.setnchannels(canali)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(x.tobytes())

    monkeypatch.setattr(pulizia, "filtra", finto)
    return chiamate


def test_la_voce_del_montato_passa_dalla_pulizia_e_resta_lunga_uguale(archivio, scrivi_piano, prepara_sintetico, filtro, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("pv", _piano(file))
    archivio.stile["voce"]["pulizia"]["attiva"] = False
    finale, _ = monta_con_animazioni(archivio, "pv", tmp_path)
    shutil.copy(finale, tmp_path / "sporco.mp4")
    archivio.stile["voce"]["pulizia"]["attiva"] = True
    finale, i = monta_con_animazioni(archivio, "pv", tmp_path)
    assert len(filtro) == 1
    sporco, pulito = audio(tmp_path / "sporco.mp4"), audio(finale)
    assert len(pulito) == pytest.approx(len(sporco), abs=1200) and i["durata"] == pytest.approx(info(tmp_path / "sporco.mp4")["durata"], abs=0.04)
    # La voce è quella uscita dalla pulizia (il primo secondo muto) ma col livello di prima: la pulizia non abbassa il volume del video.
    assert np.abs(sporco[:48000]).max() > 0.05 and np.abs(pulito[2400:45600]).max() < 0.01
    voce = np.abs(sporco[48000:]) > 0.05
    assert np.abs(pulito[48000:][voce]).mean() == pytest.approx(np.abs(sporco[48000:][voce]).mean(), rel=0.1)


def test_la_voce_pulita_non_si_rifa_se_i_tratti_sono_gli_stessi(archivio, scrivi_piano, prepara_sintetico, filtro, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("pv", _piano(file))
    archivio.stile["voce"]["pulizia"]["attiva"] = True
    monta_con_animazioni(archivio, "pv", tmp_path)
    monta_con_animazioni(archivio, "pv", tmp_path)
    assert len(filtro) == 1
    assert len(list((archivio.lavoro("pv") / "voce" / "finale").glob("*.wav"))) == 1


def test_senza_il_programma_lo_dice(archivio, monkeypatch, tmp_path):
    monkeypatch.setattr(pulizia, "PROGRAMMA", tmp_path / "non-c-e.exe")
    with pytest.raises(Errore, match="DeepFilterNet.*«Voce pulita».*voce.pulizia.attiva"):
        FILTRA_VERO(tmp_path / "a.wav", tmp_path / "b.wav", archivio.stile)
