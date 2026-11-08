from PIL import Image

from strumenti import immagini


def _pdf(cartella):
    """Un PDF di una pagina 300×200 con due righe di testo, scritto a mano: nessuna libreria che lo crei."""
    contenuto = b"BT /F1 12 Tf 20 160 Td (Board report on the theory) Tj 0 -80 Td (the recent board report on it) Tj ET"
    oggetti = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(contenuto)).encode() + b" >>\nstream\n" + contenuto + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    corpo, posizioni = b"%PDF-1.4\n", []
    for numero, oggetto in enumerate(oggetti, 1):
        posizioni.append(len(corpo))
        corpo += f"{numero} 0 obj\n".encode() + oggetto + b"\nendobj\n"
    inizio = len(corpo)
    corpo += f"xref\n0 {len(oggetti) + 1}\n0000000000 65535 f \n".encode()
    corpo += b"".join(f"{p:010d} 00000 n \n".encode() for p in posizioni)
    corpo += f"trailer\n<< /Size {len(oggetti) + 1} /Root 1 0 R >>\nstartxref\n{inizio}\n%%EOF\n".encode()
    file = cartella / "nota.pdf"
    file.write_bytes(corpo)
    return file


def test_una_frase_che_torna_si_sceglie_per_occorrenza(tmp_path, monkeypatch):
    """La stessa frase torna nel titolo e nel testo: `[frase, 2]` prende la seconda riga in cui sta, senza unirla alla prima."""
    monkeypatch.setattr(immagini, "REPO", tmp_path)
    _pdf(tmp_path)
    voce = {"file": "nota.pdf", "pagine": [1], "scala": 1, "frasi": {"1": {"prima": "Board report", "seconda": ["board report", 2]}}}
    esito = immagini.pdf(voce, tmp_path / "nota.jpg")
    x, y, largo, alto = esito["frasi"]["seconda"]
    assert 100 < y < 125 and alto < 20
    assert esito["frasi"]["prima"][1] < 40


def test_la_pagina_si_rende_alla_scala_chiesta_e_il_riquadro_segue_la_scala(tmp_path, monkeypatch):
    monkeypatch.setattr(immagini, "REPO", tmp_path)
    _pdf(tmp_path)
    voce = {"file": "nota.pdf", "pagine": [1], "scala": 2, "frasi": {"1": {"titolo": "the theory"}}}
    esito = immagini.pdf(voce, tmp_path / "nota.png")
    assert (esito["larghezza"], esito["altezza"]) == (600, 400) and Image.open(tmp_path / "nota.png").size == (600, 400)
    x, y, largo, alto = esito["frasi"]["titolo"]
    assert 100 < x < 300 and 40 < y < 80 and 0 < largo < 300 and alto < 40
