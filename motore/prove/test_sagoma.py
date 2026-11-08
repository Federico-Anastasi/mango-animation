import json
import subprocess

import numpy as np
import pytest

from motore import prepara
from motore.errori import Errore
from motore.media import info
from motore.risolvi import risolvi

from .aiuti import fotogramma, monta_con_animazioni, vicino
from .conftest import PAROLE_TEMPO

PERSONA = (slice(600, 1900), slice(300, 800))


@pytest.fixture
def scontornatore_finto(monkeypatch):
    """Lo scontorno senza la rete: la persona è sempre lo stesso rettangolo. Conta i fotogrammi che gli passano."""
    conta = {"aperto": 0, "fotogrammi": 0}

    class Finto:
        def intervallo(self, fotogrammi):
            for rgb in fotogrammi:
                conta["fotogrammi"] += 1
                # Come il vero: un array permutato, non contiguo.
                rgba = np.zeros((4, *rgb.shape[:2]), dtype=np.uint8).transpose(1, 2, 0)
                rgba[PERSONA] = (0, 0, 255, 255)
                yield rgba

    def apri(stile):
        conta["aperto"] += 1
        return Finto()

    monkeypatch.setattr(prepara, "scontornatore", apri)
    return conta


def alfa(file, t):
    esito = subprocess.run(["ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-ss", f"{t:.3f}", "-i", str(file), "-frames:v", "1", "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True)
    return np.frombuffer(esito.stdout, dtype=np.uint8).reshape(1920, 1080)


def piano(file, *pezzi):
    return {"quadro": "sagoma-su-animazione", "sorgenti": {"t": {"file": file}}, "sottotitoli": {"modo": "nessuno"},
            "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "t", "da": da, "a": a} for da, a in pezzi]}]}


def fotogrammi(file):
    esito = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(file)], capture_output=True, text=True, check=True)
    return int(esito.stdout.strip())


def pezzi(archivio, file):
    return json.loads((archivio.preparati(file) / "sagoma.json").read_text(encoding="utf-8"))["pezzi"]


def file_del_pezzo(archivio, file, pezzo):
    return archivio.preparati(file) / pezzo["file"]


def avviati(monkeypatch):
    """Le righe di comando di tutti i processi che il motore avvia."""
    righe = []
    vero = subprocess.Popen

    def spia(comando, *a, **k):
        righe.append(list(map(str, comando)))
        return vero(comando, *a, **k)

    monkeypatch.setattr(prepara.subprocess, "Popen", spia)
    return righe


def test_si_scontornano_solo_i_tratti_montati(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (0.6, 2.4)))
    monta_con_animazioni(archivio, "s", tmp_path)
    margine, fps = archivio.stile["sagoma"]["margine"], archivio.stile["formato"]["fps"]
    [pezzo] = pezzi(archivio, file)
    da, a = pezzo["da"], pezzo["a"]
    assert da == pytest.approx(max(0.0, 0.6 - margine), abs=0.05) and a < 2.4 + margine + 0.1 and pezzo["inizio"] == da
    assert scontornatore_finto["fotogrammi"] == pytest.approx((a - da) * fps, abs=2)
    sagoma = file_del_pezzo(archivio, file, pezzo)
    assert fotogrammi(sagoma) == pytest.approx((a - da) * fps, abs=1) and info(sagoma)["durata"] < 8 / 2
    assert alfa(sagoma, 1.0 - da)[1000, 500] > 200
    assert not (archivio.preparati(file) / "sagoma.webm").exists()


def test_rimontare_non_rifa_e_un_tratto_nuovo_scontorna_solo_il_nuovo(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (0.6, 2.4)))
    monta_con_animazioni(archivio, "s", tmp_path)
    [primo] = pezzi(archivio, file)
    prima = dict(scontornatore_finto)
    data = file_del_pezzo(archivio, file, primo).stat().st_mtime_ns
    monta_con_animazioni(archivio, "s", tmp_path)
    assert scontornatore_finto == prima
    scrivi_piano("s", piano(file, (0.6, 2.4), (6.0, 7.0)))
    monta_con_animazioni(archivio, "s", tmp_path)
    fps = archivio.stile["formato"]["fps"]
    vecchio, nuovo = pezzi(archivio, file)
    assert vecchio == primo and file_del_pezzo(archivio, file, vecchio).stat().st_mtime_ns == data
    assert scontornatore_finto["aperto"] == prima["aperto"] + 1 and nuovo["da"] < 6.0 < 7.0 < nuovo["a"]
    assert scontornatore_finto["fotogrammi"] - prima["fotogrammi"] == pytest.approx((nuovo["a"] - nuovo["da"]) * fps, abs=2)
    sagoma = file_del_pezzo(archivio, file, nuovo)
    assert alfa(sagoma, 6.5 - nuovo["inizio"])[1000, 500] > 200 and fotogrammi(sagoma) == pytest.approx((nuovo["a"] - nuovo["da"]) * fps, abs=2)


def test_un_tratto_che_esce_dal_pezzo_ne_vuole_uno_suo_che_parte_prima(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (0.6, 2.4)))
    monta_con_animazioni(archivio, "s", tmp_path)
    [primo] = pezzi(archivio, file)
    data = file_del_pezzo(archivio, file, primo).stat().st_mtime_ns
    scrivi_piano("s", piano(file, (0.6, 4.4)))
    monta_con_animazioni(archivio, "s", tmp_path)
    vecchio, nuovo = pezzi(archivio, file)
    margine = archivio.stile["sagoma"]["margine"]
    assert vecchio == primo and file_del_pezzo(archivio, file, vecchio).stat().st_mtime_ns == data
    # Solo il tratto che esce dal primo pezzo (quello sulla parola «tre», a 3,5 s) si scontorna, e parte `margine` prima di sé.
    assert nuovo["da"] == pytest.approx(3.5 - margine, abs=0.1) and nuovo["a"] > 4.4


def test_un_tratto_dentro_un_pezzo_con_il_margine_prima_non_scontorna_niente(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (3.0, 7.0)))
    monta_con_animazioni(archivio, "s", tmp_path)
    prima = dict(scontornatore_finto)
    scrivi_piano("s", piano(file, (3.5, 4.5)))
    monta_con_animazioni(archivio, "s", tmp_path)
    assert scontornatore_finto == prima and len(pezzi(archivio, file)) == 1


def test_i_parametri_della_codifica_vengono_dallo_stile(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path, monkeypatch):
    archivio.stile["sagoma"]["codifica"].update(deadline="good", cpu_used=5, crf=33)
    righe = avviati(monkeypatch)
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (0.6, 2.4)))
    monta_con_animazioni(archivio, "s", tmp_path)
    [codifica] = [r for r in righe if "libvpx-vp9" in r and "rawvideo" in r]
    assert codifica[codifica.index("-deadline") + 1] == "good" and codifica[codifica.index("-cpu-used") + 1] == "5" and codifica[codifica.index("-crf") + 1] == "33"


def test_una_sagoma_di_prima_resta_leggibile_e_il_nuovo_si_aggiunge_senza_toccarla(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    vecchia = archivio.preparati(file) / "sagoma.webm"
    (archivio.preparati(file) / "sagoma.json").write_text(json.dumps({"intervalli": [[0.0, 3.0]]}), encoding="utf-8")
    data = vecchia.stat().st_mtime_ns
    scrivi_piano("s", piano(file, (0.6, 2.4), (6.0, 7.0)))
    monta_con_animazioni(archivio, "s", tmp_path)
    antico, nuovo = pezzi(archivio, file)
    assert antico == {"da": 0.0, "a": 3.0, "file": "sagoma.webm", "inizio": 0.0} and nuovo["file"].startswith("sagoma/") and nuovo["da"] < 6.0
    assert vecchia.stat().st_mtime_ns == data and scontornatore_finto["aperto"] == 1


def test_una_sagoma_di_prima_senza_elenco_copre_tutta_la_ripresa(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    file = prepara_sintetico("tempo", PAROLE_TEMPO)
    scrivi_piano("s", piano(file, (0.6, 2.4), (6.0, 7.0)))
    monta_con_animazioni(archivio, "s", tmp_path)
    assert scontornatore_finto["aperto"] == 0


def test_un_pezzo_comincia_da_zero_e_il_montato_lo_legge_al_suo_istante(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    # Il file del pezzo non ha niente prima del suo primo fotogramma: il tratto lo cerca a `da - inizio`, non a `da`.
    file = prepara_sintetico("tempo", PAROLE_TEMPO, sagoma=False)
    scrivi_piano("s", piano(file, (6.0, 7.0)))
    montato, _ = monta_con_animazioni(archivio, "s", tmp_path)
    [pezzo] = pezzi(archivio, file)
    sagoma = file_del_pezzo(archivio, file, pezzo)
    esito = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=start_time", "-of", "csv=p=0", str(sagoma)], capture_output=True, text=True, check=True)
    assert float(esito.stdout.strip()) == pytest.approx(0, abs=0.001) and pezzo["inizio"] == pezzo["da"] > 4.0
    assert alfa(sagoma, 6.5 - pezzo["inizio"])[1000, 500] > 200
    assert vicino(fotogramma(montato, 0.4)[1000, 500], (0, 0, 255), 60)


def test_la_sagoma_puo_venire_da_un_altra_ripresa(archivio, scrivi_piano, prepara_sintetico, scontornatore_finto, tmp_path):
    voce = prepara_sintetico("parole", PAROLE_TEMPO, sagoma=False)
    muta = prepara_sintetico("tempo", PAROLE_TEMPO, come="muta", sagoma=False)
    scrivi_piano("s", {"quadro": "sagoma-su-animazione", "sorgenti": {"v": {"file": voce}, "m": {"file": muta}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "v", "da": 0.6, "a": 2.4, "sagoma": {"sorgente": "m", "scarto": 3.0}}]}]})
    _, montato = monta_con_animazioni(archivio, "s", tmp_path)
    [tratto] = json.loads((archivio.lavoro("s") / "risolto.json").read_text(encoding="utf-8"))["tratti"]
    assert tratto["sorgente"] == "v" and tratto["sagoma"] == {"sorgente": "m", "da": pytest.approx(tratto["da"] + 3.0, abs=0.001)}
    margine = archivio.stile["sagoma"]["margine"]
    [pezzo] = pezzi(archivio, muta)
    da, a = pezzo["da"], pezzo["a"]
    assert da == pytest.approx(tratto["da"] + 3.0 - margine, abs=0.05) and a == pytest.approx(tratto["da"] + tratto["durata"] + 3.0 + margine, abs=0.1)
    assert not (archivio.preparati(voce) / "sagoma.json").exists()
    assert montato["durata"] == pytest.approx(tratto["durata"], abs=0.1)


def test_una_sagoma_fuori_dalla_ripresa_muta_e_un_errore(archivio, scrivi_piano, prepara_sintetico):
    voce = prepara_sintetico("parole", PAROLE_TEMPO, sagoma=False)
    muta = prepara_sintetico("tempo", PAROLE_TEMPO, come="muta", sagoma=False)
    scrivi_piano("s", {"quadro": "sagoma-su-animazione", "sorgenti": {"v": {"file": voce}, "m": {"file": muta}}, "sottotitoli": {"modo": "nessuno"},
                       "scene": [{"nome": "s", "animazione": "uno", "pezzi": [{"sorgente": "v", "da": 0.6, "a": 2.4, "sagoma": {"sorgente": "m", "scarto": 7.0}}]}]})
    with pytest.raises(Errore, match="fuori"):
        risolvi(archivio, "s")
