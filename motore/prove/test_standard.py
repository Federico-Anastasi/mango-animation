import json

import re
from pathlib import Path

CODICE = sorted(p for p in Path(__file__).parent.parent.glob("*.py"))
# Misure e colori dei quadri e dei cartelli: stanno solo in stile.json.
VIETATI = re.compile(r"\b(1080|1920|905|1235|1075|1170|0x[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{6}|-39|0\.09|58)\b")


def test_nessuna_misura_dello_stile_sta_nel_codice():
    trovati = [f"{p.name}:{n}: {riga.strip()}" for p in CODICE for n, riga in enumerate(p.read_text(encoding="utf-8").splitlines(), 1) if VIETATI.search(riga)]
    assert trovati == []


def test_nei_quadri_verticali_il_titolo_sta_sotto_il_quarto_alto():
    stile = json.loads((Path(__file__).parent.parent.parent / "stile.json").read_text(encoding="utf-8"))
    alto = stile["formati"]["verticale"]["alto"]
    fuori = [nome for nome, q in stile["quadri"].items() if q.get("formato", "verticale") == "verticale" and q["titolo"]["y"] - stile["titolo"]["corpo"] < alto / 4]
    assert fuori == []


def test_nei_quadri_verticali_cio_che_si_legge_resta_lontano_dai_lati_che_il_telefono_taglia():
    stile = json.loads((Path(__file__).parent.parent.parent / "stile.json").read_text(encoding="utf-8"))
    L, A = stile["formati"]["verticale"]["largo"], stile["formati"]["verticale"]["alto"]
    m = stile["telefono"]["margine_lati"]

    def lati(nome, q):
        yield "sottotitoli", q["sottotitoli"]["x"] - (q["sottotitoli"]["largo"] / 2 if q["sottotitoli"]["ancora"] == "centro" else 0), q["sottotitoli"]["largo"]
        largo = q["titolo"].get("largo", stile["titolo"]["largo"])
        yield "titolo", q["titolo"]["x"] - largo / 2, largo
        for s in q["strati"]:
            if "area" not in s or s.get("al_vivo"):
                continue
            x, _, w, h = s.get("ritaglio", s["area"])
            if s["tipo"] == "animazione" and "ritaglio" not in s:
                k = min(w / L, h / A)
                x0, _, x1, _ = q.get("fascia_animazione", [0, 0, L, A])
                yield "animazione", x + (w - L * k) / 2 + x0 * k, (x1 - x0) * k
            else:
                yield s["tipo"], x, w

    fuori = [(nome, cosa, x, w) for nome, q in stile["quadri"].items() if q.get("formato", "verticale") == "verticale"
             for cosa, x, w in lati(nome, q) if x < m or x + w > L - m]
    assert fuori == []
