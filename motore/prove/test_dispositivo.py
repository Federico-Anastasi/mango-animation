import json
import sys
import types

import pytest

from motore import dispositivo as modulo
from motore.errori import Errore


@pytest.fixture(autouse=True)
def senza_memoria(monkeypatch):
    for nome in ("CUDA_VISIBLE_DEVICES", "CUDA_DEVICE_ORDER"):
        monkeypatch.setenv(nome, "")
        monkeypatch.delenv(nome)


def profilo(tmp_path, monkeypatch, macchina):
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": macchina}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))


def con_scheda(monkeypatch, c):
    monkeypatch.setattr(modulo, "cuda_disponibile", lambda: c)


def test_senza_profilo_i_modelli_vanno_sulla_scheda_se_c_e(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    con_scheda(monkeypatch, True)
    assert modulo.dispositivo("trascrizione") == "cuda"
    assert capsys.readouterr().err == ""


def test_senza_profilo_e_senza_scheda_vanno_sul_processore_e_lo_dicono_una_volta_sola(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    con_scheda(monkeypatch, False)
    assert modulo.dispositivo("trascrizione") == "cpu" and modulo.dispositivo("trascrizione") == "cpu"
    detto = capsys.readouterr().err
    assert detto.count("nessuna scheda NVIDIA") == 1 and "processore" in detto


def test_il_profilo_sceglie_la_scheda_per_il_motore_e_per_l_ordine_di_nvidia_smi(tmp_path, monkeypatch):
    profilo(tmp_path, monkeypatch, {"scheda_video": 2})
    con_scheda(monkeypatch, True)
    assert modulo.dispositivo("trascrizione") == "cuda"
    import os
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "2" and os.environ["CUDA_DEVICE_ORDER"] == "PCI_BUS_ID"


def test_senza_profilo_le_schede_sono_numerate_come_per_nvidia_smi(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("CUDA_DEVICE_ORDER", "FASTEST_FIRST")
    con_scheda(monkeypatch, True)
    modulo.dispositivo("trascrizione")
    import os
    assert os.environ["CUDA_DEVICE_ORDER"] == "PCI_BUS_ID" and "CUDA_VISIBLE_DEVICES" not in os.environ


@pytest.mark.parametrize("ereditata", ["0,1,2", "1", "2,3"])
def test_la_scheda_del_profilo_vince_su_un_elenco_ereditato_dall_ambiente_utente(tmp_path, monkeypatch, ereditata):
    # il caso vero: nell'ambiente di Windows c'era CUDA_VISIBLE_DEVICES=0,1,2, il profilo vuole la 0
    profilo(tmp_path, monkeypatch, {"scheda_video": 0})
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", ereditata)
    con_scheda(monkeypatch, True)
    assert modulo.dispositivo("trascrizione") == "cuda"
    import os
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0" and os.environ["CUDA_DEVICE_ORDER"] == "PCI_BUS_ID"


def test_una_funzione_che_vuole_la_scheda_applica_il_profilo_anche_con_un_elenco_ereditato(tmp_path, monkeypatch):
    profilo(tmp_path, monkeypatch, {"scheda_video": 2})
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0,1,2")
    monkeypatch.setattr(modulo, "motore", lambda funzione: {"dove": "scheda"})
    monkeypatch.setattr(modulo, "cuda_disponibile", lambda: True)
    assert modulo.dispositivo("trascrizione") == "cuda"
    import os
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "2"


def test_senza_scheda_nel_profilo_l_elenco_ereditato_resta(tmp_path, monkeypatch):
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0,1,2")
    con_scheda(monkeypatch, True)
    assert modulo.dispositivo("trascrizione") == "cuda"
    import os
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0,1,2"


def test_schede_visibili_uguali_al_profilo_vanno_bene(tmp_path, monkeypatch):
    profilo(tmp_path, monkeypatch, {"scheda_video": 2})
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "2")
    con_scheda(monkeypatch, True)
    assert modulo.dispositivo("trascrizione") == "cuda"


def test_il_profilo_puo_chiedere_il_processore(tmp_path, monkeypatch, capsys):
    profilo(tmp_path, monkeypatch, {"scheda_video": None})
    monkeypatch.setattr(modulo, "cuda_disponibile", lambda: pytest.fail("non serve chiedere se c'è una scheda"))
    assert modulo.dispositivo("trascrizione") == "cpu"
    assert "macchina.scheda_video" in capsys.readouterr().err


def test_una_scheda_del_profilo_che_non_c_e_e_un_errore_non_un_ripiego(tmp_path, monkeypatch):
    profilo(tmp_path, monkeypatch, {"scheda_video": 3})
    con_scheda(monkeypatch, False)
    with pytest.raises(Errore, match="scheda video 3.*macchina.scheda_video"):
        modulo.dispositivo("trascrizione")


# ---------------------------------------------------------------- le librerie di CUDA

def pacchetti(tmp_path, *posti):
    """Un site-packages con la cublas dove la mettono torch (`torch/lib`) e il pacchetto nvidia-cublas-cu12 (`nvidia/cublas/bin`)."""
    for posto in posti:
        cartella = tmp_path.joinpath(*posto)
        cartella.mkdir(parents=True)
        (cartella / "cublas64_12.dll").write_bytes(b"")
    return str(tmp_path)


@pytest.fixture
def caricate(monkeypatch):
    elenco = []
    monkeypatch.setattr(modulo.ctypes, "CDLL", lambda percorso: elenco.append(percorso))
    return elenco


def test_la_cublas_di_torch_si_carica_per_percorso_senza_importare_torch(tmp_path, monkeypatch, caricate):
    monkeypatch.setitem(sys.modules, "torch", None)
    monkeypatch.setattr(sys, "path", ["", str(tmp_path / "vuoto"), pacchetti(tmp_path, ("torch", "lib"), ("nvidia", "cublas", "bin"))])
    modulo.librerie_cuda()
    assert caricate == [str(tmp_path / "torch" / "lib" / "cublas64_12.dll")], "quella di torch viene prima: se torch si importa dopo, trova la sua"


def test_senza_torch_la_cublas_e_quella_del_pacchetto_nvidia(tmp_path, monkeypatch, caricate):
    monkeypatch.setattr(sys, "path", [pacchetti(tmp_path, ("nvidia", "cublas", "bin"))])
    modulo.librerie_cuda()
    assert caricate == [str(tmp_path / "nvidia" / "cublas" / "bin" / "cublas64_12.dll")]


def test_dove_la_cublas_non_c_e_non_si_carica_niente_e_l_errore_lo_dira_la_prima_trascrizione(tmp_path, monkeypatch, caricate):
    monkeypatch.setattr(sys, "path", [str(tmp_path)])
    modulo.librerie_cuda()
    assert caricate == []


def test_senza_torch_la_scheda_la_dice_ctranslate2(monkeypatch):
    monkeypatch.setitem(sys.modules, "torch", None)
    monkeypatch.setitem(sys.modules, "ctranslate2", types.SimpleNamespace(get_cuda_device_count=lambda: 1))
    assert modulo.cuda_disponibile() is True
    monkeypatch.setitem(sys.modules, "ctranslate2", types.SimpleNamespace(get_cuda_device_count=lambda: 0))
    assert modulo.cuda_disponibile() is False


def test_solo_la_memoria_della_scheda_che_non_basta_e_detta_come_tale():
    assert "memoria libera" in modulo.errore_di_memoria(RuntimeError("CUDA out of memory"), "x", "x").it
    assert modulo.errore_di_memoria(RuntimeError("CUDA failed with error unknown error"), "x", "x") is None
