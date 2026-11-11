"""Gli strumenti trovano i dati nella cartella di lavoro, che sta altrove rispetto al codice."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

CODICE = Path(__file__).resolve().parent.parent.parent


def lancia(lavoro, *argomenti):
    ambiente = {**{k: v for k, v in os.environ.items() if k != "MANGO_ANIMATION_LAVORO"}, "PYTHONIOENCODING": "utf-8"}
    if lavoro is not None:
        ambiente["MANGO_ANIMATION_LAVORO"] = str(lavoro)
    return subprocess.run([sys.executable, "-m", "strumenti." + argomenti[0], *argomenti[1:]], cwd=CODICE, env=ambiente,
                          capture_output=True, text=True, encoding="utf-8")


@pytest.fixture
def lavoro(tmp_path):
    cartella = tmp_path / "lavoro"
    (cartella / "archivio" / "video" / "caro").mkdir(parents=True)
    return cartella


def test_gli_sticker_scrivono_nella_cartella_di_lavoro(lavoro):
    esito = lancia(lavoro, "sticker", "--provini")
    assert str(lavoro / "archivio" / "preparati") in esito.stderr


def test_gli_oggetti_cercano_il_video_nella_cartella_di_lavoro(lavoro):
    esito = lancia(lavoro, "oggetti", "prendi", "non-c-e", "x", "1")
    assert str(lavoro / "archivio" / "video") in esito.stderr
    esito = lancia(lavoro, "oggetti", "prendi", "caro", "x", "1")
    assert "mancano i provini" in esito.stderr


@pytest.mark.parametrize("strumento,argomenti", [("sticker", ["--provini"]), ("oggetti", ["prendi", "a", "b", "1"])])
def test_senza_cartella_di_lavoro_l_errore_lo_dice(strumento, argomenti):
    esito = lancia(None, strumento, *argomenti)
    assert esito.returncode != 0
    assert "MANGO_ANIMATION_LAVORO" in esito.stderr
    assert "Traceback" not in esito.stderr


def test_la_lettura_di_tiktok_parte_dai_video_della_cartella_di_lavoro(lavoro, monkeypatch):
    from strumenti import leggi_tiktok

    canale = lavoro / "archivio" / "canali" / "tiktok"
    lettura = canale / "letture" / "x"
    lettura.mkdir(parents=True)
    (lettura / "video.json").write_text(json.dumps({"video": [{"id": "1", "url": "u", "pubblicato": "2026-10-01T10:00"}]}), encoding="utf-8")
    (canale / "ultima.json").write_text(json.dumps({"lettura": "x"}), encoding="utf-8")
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(lavoro))
    assert [v["id"] for v in leggi_tiktok.voci_dall_archivio()] == ["1"]
