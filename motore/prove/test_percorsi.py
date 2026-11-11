import subprocess

import pytest

from motore.archivio import Archivio
from motore.media import ffmpeg, scrivi_elenco
from motore.monta import anteprima

from .aiuti import monta_con_animazioni
from .conftest import PAROLE_TEMPO

CARTELLA = "L'archivio di D'Angelo è così"


@pytest.fixture
def archivio(tmp_path):
    return Archivio(radice=tmp_path / CARTELLA / "archivio")


def _piano(file):
    return {"quadro": "girato-pieno", "sorgenti": {"t": {"file": file}},
            "scene": [{"nome": "uno", "pezzi": [{"sorgente": "t", "da": 0.6, "a": 2.5}]},
                      {"nome": "due", "pezzi": [{"sorgente": "t", "da": 3.5, "a": 7.0}]}],
            "sottotitoli": {"modo": "parola per parola"}}


def test_l_elenco_per_ffmpeg_regge_apostrofi_spazi_e_accenti(tmp_path):
    cartella = tmp_path / CARTELLA / "con spazi"
    cartella.mkdir(parents=True)
    pezzi = [cartella / f"{nome}.mkv" for nome in ("uno", "l'altro")]
    for pezzo in pezzi:
        ffmpeg("-f", "lavfi", "-i", "color=c=red:s=64x64:r=10:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", pezzo)
    elenco = cartella / "elenco.txt"
    scrivi_elenco(elenco, pezzi)
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-f", "concat", "-safe", "0", "-i", str(elenco), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    assert esito.returncode == 0, esito.stderr.decode()
    assert len(esito.stdout) == 10 * 64 * 64 * 3


def test_montare_e_fare_l_anteprima_in_una_cartella_di_lavoro_con_apostrofo(archivio, scrivi_piano, prepara_sintetico, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("ap", _piano(file))
    finale, formato = monta_con_animazioni(archivio, "ap", tmp_path)
    assert "'" in str(finale) and formato["durata"] > 2
    assert anteprima(archivio, "ap", scena="due", avanza=lambda *_: None).is_file()
