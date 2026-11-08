import json

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


def test_chi_ha_gia_scelto_le_schede_visibili_non_viene_scavalcato(tmp_path, monkeypatch):
    profilo(tmp_path, monkeypatch, {"scheda_video": 2})
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "1")
    con_scheda(monkeypatch, True)
    modulo.dispositivo("trascrizione")
    import os
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "1"


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
