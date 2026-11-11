"""Il riquadro della persona che lo scontorno dà a SAM2: sopra il viso non sale oltre `sopra_il_viso` altezze del viso."""

import types

import numpy as np

from motore.scontorno import Scontornatore

FOTOGRAMMA = np.zeros((1920, 1080, 3), dtype=np.uint8)


def _scontornatore(persona, viso, sopra=0.5):
    """Uno scontornatore senza modelli: il rilevatore e i visi sono finti, lo scontorno lavora a metà scala (540 × 960)."""
    s = object.__new__(Scontornatore)
    s.rilevatore = types.SimpleNamespace(riquadro=lambda rgb: list(persona))
    s.visi = types.SimpleNamespace(riquadro=lambda rgb: viso)
    s.s, s.w, s.h, s.L, s.A = {"sopra_il_viso": sopra}, 540, 960, 1080, 1920
    return s


def test_un_riquadro_che_prende_anche_la_lampada_sopra_la_testa_si_ferma_poco_sopra_il_viso():
    # Il viso, alla scala dello scontorno, comincia a 250 ed è alto 300: il riquadro non sale oltre (250 - 150) × 2 = 200.
    s = _scontornatore([1, -2, 1080, 1918], [270, 250, 230, 300])
    assert s._riquadro(FOTOGRAMMA) == [1, 200, 1080, 1918]


def test_un_riquadro_che_parte_gia_dai_capelli_non_si_tocca():
    s = _scontornatore([1, 400, 1080, 1914], [270, 250, 230, 300])
    assert s._riquadro(FOTOGRAMMA) == [1, 400, 1080, 1914]


def test_una_maschera_spostata_che_salta_di_area_lascia_il_posto_a_quella_di_sam():
    import torch

    s = object.__new__(Scontornatore)
    s.s = {"salto_maschera": 0.2}
    di_sam = torch.full((1, 1, 10, 10), -1.0)
    di_sam[..., :5, :] = 1.0  # metà del fotogramma è la persona
    saltata, mossa = torch.ones(1, 1, 10, 10), di_sam.roll(1, dims=3)
    assert s._senza_salti(saltata, di_sam) is di_sam, "tutta la stanza dentro: si tiene la maschera di SAM2"
    assert s._senza_salti(mossa, di_sam) is mossa, "la stessa area, spostata: si tiene quella spostata"


def test_senza_un_viso_il_riquadro_resta_quello_del_rilevatore():
    s = _scontornatore([1, -2, 1080, 1918], None)
    assert s._riquadro(FOTOGRAMMA) == [1, -2, 1080, 1918]
