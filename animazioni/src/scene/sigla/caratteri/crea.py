"""Il carattere della sigla in formato typeface di three.js, dal pacchetto @fontsource di animazioni/node_modules.

    python animazioni/src/scene/sigla/caratteri/crea.py

Scrive qui accanto space-grotesk.typeface.json, solo con le lettere di «mango animation» (più, per ogni lettera,
y_min e y_max: servono all'impaginazione).
"""
import json
import pathlib

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

QUI = pathlib.Path(__file__).resolve().parent
PACCHETTI = QUI.parents[3] / "node_modules" / "@fontsource"
famiglia, peso = "space-grotesk", 700
LETTERE = "mangoit"


class Contorno(BasePen):
    """Un contorno come lo scrive il formato typeface: m/l/q/b e coordinate intere, y verso l'alto."""

    def __init__(self, glifi):
        super().__init__(glifi)
        self.o = []

    def _moveTo(self, p):
        self.o += ["m", *map(round, p)]

    def _lineTo(self, p):
        self.o += ["l", *map(round, p)]

    def _curveToOne(self, c1, c2, p):
        self.o += ["b", *map(round, p), *map(round, c1), *map(round, c2)]

    def _qCurveToOne(self, c, p):
        self.o += ["q", *map(round, p), *map(round, c)]

    def _closePath(self):
        pass


font = TTFont(PACCHETTI / famiglia / "files" / f"{famiglia}-latin-{peso}-normal.woff2")
glifi = font.getGlyphSet()
mappa = font.getBestCmap()
risultato = {}
for lettera in LETTERE:
    nome = mappa[ord(lettera)]
    contorno = Contorno(glifi)
    glifi[nome].draw(contorno)
    margini = BoundsPen(glifi)
    glifi[nome].draw(margini)
    x0, y0, x1, y1 = margini.bounds
    risultato[lettera] = {
        "ha": glifi[nome].width,
        "x_min": round(x0),
        "x_max": round(x1),
        "y_min": round(y0),
        "y_max": round(y1),
        "o": " ".join(map(str, contorno.o)),
    }
dati = {
    "glyphs": risultato,
    "familyName": famiglia,
    "ascender": font["hhea"].ascent,
    "descender": font["hhea"].descent,
    "underlinePosition": 0,
    "underlineThickness": 0,
    "boundingBox": {"yMin": font["head"].yMin, "xMin": font["head"].xMin, "yMax": font["head"].yMax, "xMax": font["head"].xMax},
    "resolution": font["head"].unitsPerEm,
    "original_font_information": {},
}
(QUI / f"{famiglia}.typeface.json").write_text(json.dumps(dati, separators=(",", ":")), encoding="utf-8")
print(famiglia, peso, len(risultato), "lettere")
