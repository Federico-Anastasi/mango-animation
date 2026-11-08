import json

import pytest

from motore.errori import Errore
from motore.profilo import leggi_profilo, macchina_di_lavoro


def test_senza_profilo_non_c_e_niente(tmp_path, monkeypatch):
    assert leggi_profilo(tmp_path) == {}
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    assert macchina_di_lavoro() == {}
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert macchina_di_lavoro() == {}


def test_la_macchina_viene_dal_profilo_della_cartella_di_lavoro(tmp_path, monkeypatch):
    macchina = {"scheda_video": 0, "scheda_registrazione": None, "profilo_chrome": "D:/Chrome", "disco_quasi_pieno": True}
    (tmp_path / "profilo.json").write_text(json.dumps({"creator": {"nome": "Ada"}, "macchina": macchina}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    assert macchina_di_lavoro() == macchina


def test_un_profilo_rotto_dice_dove_e_cosa(tmp_path):
    (tmp_path / "profilo.json").write_text("{", encoding="utf-8")
    with pytest.raises(Errore, match="profilo.*non è un JSON valido"):
        leggi_profilo(tmp_path)
    (tmp_path / "profilo.json").write_text(json.dumps({"macchina": {"scheda_vidoe": 1, "scheda_registrazione": "due"}}), encoding="utf-8")
    with pytest.raises(Errore) as e:
        leggi_profilo(tmp_path)
    assert "macchina: «scheda_vidoe» non è una chiave" in str(e.value) and "macchina.scheda_registrazione" in str(e.value)


def test_i_motori_ammettono_solo_le_funzioni_e_le_scelte_dello_schema(tmp_path):
    giusti = {"trascrizione": {"attiva": True, "dove": "scheda", "modello": "large-v3-turbo", "calcolo": "int8"}, "allineamento": {"dove": "processore"},
              "sagoma": {"attiva": False}, "segui": {"attiva": False}, "pulizia_voce": {"attiva": False}, "dettatura": {"dove": "processore"}}
    (tmp_path / "profilo.json").write_text(json.dumps({"motori": giusti}), encoding="utf-8")
    assert leggi_profilo(tmp_path)["motori"] == giusti
    for sbagliato in ({"trascrizioni": {}}, {"sagoma": {"dove": "online"}}, {"trascrizione": {"modello": "base"}}, {"pulizia_voce": {"dove": "processore"}}, {"allineamento": {"modello": "large-v3"}}):
        (tmp_path / "profilo.json").write_text(json.dumps({"motori": sbagliato}), encoding="utf-8")
        with pytest.raises(Errore, match="motori"):
            leggi_profilo(tmp_path)
