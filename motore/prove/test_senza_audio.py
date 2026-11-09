"""Un video senza traccia audio (una registrazione dello schermo dell'iPhone) è un caso normale: passa dalla preparazione al montaggio,
con l'audio muto e senza parole, e dove serve la voce il rifiuto dice la ragione."""
import numpy as np
import pytest

from motore import monta as modulo_monta
from motore import prepara
from motore.archivio import valida
from motore.errori import Errore
from motore.media import info, pcm_16k
from motore.risolvi import risolvi

from .aiuti import audio, fotogramma, monta_con_animazioni, vicino
from .conftest import GIORNO, _ffmpeg

ROSSO, BLU = (255, 0, 0), (0, 0, 255)


@pytest.fixture
def senza_audio(archivio):
    """Otto secondi di schermo, rosso per i primi quattro e blu per gli altri, senza nessuna traccia audio."""
    file = f"{GIORNO}/schermo.mp4"
    archivio.grezzo(file).parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=30:d=8,drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable='gte(t,4)'",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-g", "10", "-an", archivio.grezzo(file))
    return file


def piano(file, pezzo, **altro):
    return {"quadro": "girato-pieno", "sorgenti": {"s": {"file": file}}, "sottotitoli": {"modo": "nessuno"}, "scene": [{"nome": "uno", "pezzi": [pezzo]}], **altro}


def test_la_preparazione_di_un_video_senza_audio_non_cerca_la_voce(archivio, senza_audio, monkeypatch):
    assert not info(archivio.grezzo(senza_audio))["ha_audio"]
    monkeypatch.setattr(prepara, "trascrivi", lambda *a, **k: pytest.fail("un video senza audio non ha niente da trascrivere"))
    cartella = prepara.prepara_file(archivio, senza_audio, avanza=lambda *_: None)
    assert (cartella / "miniatura.jpg").exists() and (cartella / "leggero.mp4").exists()
    assert not (cartella / "onda.bin").exists() and not (cartella / "parole.json").exists()


def test_un_video_senza_audio_si_taglia_a_tempo_e_si_monta_muto(archivio, scrivi_piano, senza_audio, tmp_path, monkeypatch):
    # Senza audio non c'è silenzio da togliere né voce da pulire: si tiene da `da` ad `a`, e la voce pulita non si chiama.
    monkeypatch.setattr(modulo_monta, "voce_pulita", lambda *a, **k: pytest.fail("la pulizia della voce non ha niente da pulire"))
    scrivi_piano("muto", piano(senza_audio, {"sorgente": "s", "da": 2.0, "a": 6.0}))
    assert valida(archivio, "muto", controlla_animazioni=False) == ([], [])
    r = risolvi(archivio, "muto")
    assert [(t["sorgente"], t["da"]) for t in r["tratti"]] == [("s", 2.0)] and abs(r["durata"] - 4.0) < 0.05 and r["parole"] == []

    file, montato = monta_con_animazioni(archivio, "muto", tmp_path)
    assert abs(montato["durata"] - 4.0) < 0.1 and montato["ha_audio"]
    assert vicino(fotogramma(file, 0.3)[300, 540], ROSSO) and vicino(fotogramma(file, 3.7)[300, 540], BLU)
    assert np.abs(audio(file)).max() < 0.01


def test_un_video_senza_audio_tiene_una_coda_per_intero(archivio, scrivi_piano, senza_audio):
    scrivi_piano("coda", piano(senza_audio, {"sorgente": "s", "da": 1.0, "a": 3.0}, coda=1.0))
    assert abs(risolvi(archivio, "coda")["durata"] - 3.0) < 0.05


def test_senza_il_tempo_un_video_senza_audio_dice_di_darlo(archivio, scrivi_piano, senza_audio):
    scrivi_piano("senza", piano(senza_audio, {"sorgente": "s"}))
    with pytest.raises(Errore, match="non ha una traccia audio.*`da` e un `a`"):
        risolvi(archivio, "senza")


def test_le_parole_di_un_video_senza_audio_non_ci_sono_e_il_pezzo_a_parole_lo_dice(archivio, scrivi_piano, senza_audio):
    scrivi_piano("parole", piano(senza_audio, {"sorgente": "s", "minuto": "00:00", "dice": "ciao a tutti"}))
    errori, _ = valida(archivio, "parole", controlla_animazioni=False)
    assert len(errori) == 1 and "non ha una traccia audio" in errori[0] and "lancia" not in errori[0], errori
    with pytest.raises(Errore, match="non ha una traccia audio"):
        risolvi(archivio, "parole")


def test_leggere_l_audio_di_un_file_che_non_ne_ha_dice_che_non_ne_ha(archivio, senza_audio):
    with pytest.raises(Errore, match="non ha una traccia audio"):
        pcm_16k(archivio.grezzo(senza_audio))
