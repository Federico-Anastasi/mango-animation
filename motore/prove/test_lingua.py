import ast
import json
import re
from pathlib import Path

import pytest

from motore import errori
from motore.__main__ import main
from motore.archivio import valida
from motore.errori import Errore, Frase, dice, lingua

MOTORE = Path(errori.__file__).parent


def _chiamate_a_errore():
    for file in sorted(MOTORE.glob("*.py")):
        for nodo in ast.walk(ast.parse(file.read_text(encoding="utf-8"))):
            if isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Name) and nodo.func.id == "Errore":
                yield file.name, nodo


def _frasi_di_avanzamento():
    """Le chiamate che scrivono una riga all'utente (`avanza`, `print`) con del testo scritto a mano: devono passare da `dice`."""
    for file in sorted(MOTORE.glob("*.py")):
        if file.name == "detta.py":
            continue
        for nodo in ast.walk(ast.parse(file.read_text(encoding="utf-8"))):
            if not isinstance(nodo, ast.Call) or not nodo.args or (isinstance(nodo.func, ast.Attribute) and len(nodo.args) > 1):
                continue
            nome = nodo.func.id if isinstance(nodo.func, ast.Name) else nodo.func.attr if isinstance(nodo.func, ast.Attribute) else None
            if nome not in ("avanza", "print"):
                continue
            primo = nodo.args[0]
            pezzi = primo.values if isinstance(primo, ast.JoinedStr) else [primo]
            if any(isinstance(p, ast.Constant) and isinstance(p.value, str) and re.search(r"(?<![./\w])[A-Za-zÀ-ÿ]{3,}(?![./\w])", p.value) for p in pezzi):
                yield f"{file.name}:{nodo.lineno}"


def test_ogni_riga_di_avanzamento_del_motore_passa_da_dice():
    senza = list(_frasi_di_avanzamento())
    assert senza == [], "riga scritta a mano senza dice(italiano, inglese) in " + ", ".join(senza)


def test_un_errore_dice_la_frase_nella_lingua_in_uso(monkeypatch):
    e = Errore("manca il file", "the file is missing")
    monkeypatch.delenv("MANGO_ANIMATION_LINGUA", raising=False)
    assert (lingua(), str(e)) == ("it", "manca il file")
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    assert (lingua(), str(e)) == ("en", "the file is missing")
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "fr")
    assert (lingua(), str(e)) == ("it", "manca il file")


def test_un_errore_senza_la_frase_inglese_non_si_costruisce():
    with pytest.raises(TypeError):
        Errore("solo italiano")


def test_ogni_errore_del_motore_ha_le_due_frasi():
    senza = [f"{file}:{nodo.lineno}" for file, nodo in _chiamate_a_errore() if len(nodo.args) + len(nodo.keywords) != 2]
    assert senza == [], "Errore(italiano, inglese): manca una delle due lingue in " + ", ".join(senza)


def test_una_frase_si_legge_in_italiano_e_porta_l_inglese(monkeypatch):
    f = Frase("manca il file", "the file is missing")
    assert f == "manca il file" and f.en == "the file is missing"
    monkeypatch.delenv("MANGO_ANIMATION_LINGUA", raising=False)
    assert (f.detta(), dice("a", "b")) == ("manca il file", "a")
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    assert (f.detta(), dice("a", "b")) == ("the file is missing", "b")


def test_un_comando_che_fallisce_stampa_l_errore_nella_lingua_del_lavoro(monkeypatch, capsys):
    monkeypatch.delenv("MANGO_ANIMATION_LAVORO", raising=False)
    monkeypatch.delenv("MANGO_ANIMATION_LINGUA", raising=False)
    assert main(["valida", "base"]) == 1
    assert "manca la cartella di lavoro" in capsys.readouterr().err
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    assert main(["valida", "base"]) == 1
    err = capsys.readouterr().err
    assert "the working folder is missing" in err and "manca" not in err


def test_un_video_che_non_c_e_si_dice_in_inglese(tmp_path, monkeypatch, capsys):
    (tmp_path / "archivio" / "video").mkdir(parents=True)
    monkeypatch.setenv("MANGO_ANIMATION_LAVORO", str(tmp_path))
    monkeypatch.setenv("MANGO_ANIMATION_LINGUA", "en")
    assert main(["valida", "assente"]) == 1
    err = capsys.readouterr().err
    assert "the video «assente» does not exist in" in err


def test_i_problemi_di_valida_portano_le_due_lingue(archivio, scrivi_piano, prepara_sintetico):
    prepara_sintetico("tempo", [{"p": "ciao", "da": 0.5, "a": 0.9}])
    scrivi_piano("v", {"quadro": "girato-pieno", "sorgenti": {"d": {"file": "2026-10-09/tempo.mp4"}, "sola": {"file": "2026-10-09/tempo.mp4"}},
                       "scene": [{"nome": "s", "pezzi": [{"sorgente": "d", "minuto": "00:00", "dice": "ciao"}]},
                                 {"nome": "t", "quadro": "inventato", "pezzi": [{"sorgente": "d"}]}]})
    errori_valida, avvisi = valida(archivio, "v", controlla_animazioni=False)
    assert [(str(e), e.en) for e in errori_valida] == [
        ("la scena «t» usa il quadro «inventato», che non c'è in stile.json: i quadri sono " + ", ".join(archivio.stile["quadri"]),
         "scene «t» uses the frame «inventato», which is not in stile.json: the frames are " + ", ".join(archivio.stile["quadri"]))]
    assert [(str(a), a.en) for a in avvisi] == [("la sorgente «sola» è dichiarata ma nessun pezzo la usa", "the source «sola» is declared but no piece uses it")]


def test_un_piano_che_non_va_ha_il_suo_inglese(archivio):
    cartella = archivio.radice / "video" / "v"
    cartella.mkdir(parents=True)
    (cartella / "piano.json").write_text(json.dumps({"quadro": "girato-pieno", "voce": 3}), encoding="utf-8")
    with pytest.raises(Errore) as dentro:
        archivio.piano("v")
    assert dentro.value.it.startswith("il piano di «v» non è valido:\n") and "«voce» non è una chiave che il piano conosce" in dentro.value.it
    assert dentro.value.en.startswith("the plan of «v» is not valid:\n") and "«voce» is not a key the plan knows" in dentro.value.en
