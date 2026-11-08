"""Le immagini vere dei video: pagine di PDF rese a immagine (e dove stanno le frasi) e foto portate alla misura che serve.

Uso, dalla radice del repo: python -m strumenti.immagini <immagini.json> [nome …]

`immagini.json` sta in `materiali/` del video. Due sezioni, una voce per immagine:

    "pdf":  { "rapporto": { "file": "archivio/video/<slug>/materiali/rapporto.pdf", "pagine": [1],
                        "scala": 2, "larghezza": 1080, "qualita": 88,
                        "in": "animazioni/src/scene/<slug>/img/rapporto.jpg",
                        "frasi": { "1": { "firma": "MARIA ROSSI E LUCA BIANCHI", "seconda": ["revisione del comitato", 2] } } } }
    "foto": { "ritratto": { "file": "archivio/video/<slug>/materiali/foto/ritratto.jpg", "larghezza": 1000,
                          "in": "animazioni/src/scene/<slug>/img/ritratto.jpg" } }

Le pagine di un PDF finiscono una sotto l'altra in un'immagine sola, così la telecamera ci scorre sopra senza cambi di
pagina. La ricerca non bada alle maiuscole e unisce tutte le volte che la frase compare; `[frase, n]` prende solo la n-esima
riga in cui compare (una frase su una riga sola). Accanto all'immagine scrive `<nome>.json` con `larghezza`, `altezza` e i riquadri delle frasi, `[x, y, largo,
alto]` in px dell'immagine. I percorsi sono dalla radice del repo; `in` è dove scrivere.
"""
import json
import sys
from pathlib import Path

import pypdfium2
from PIL import Image

REPO = Path(__file__).parent.parent


def _percorso(voce: str) -> Path:
    return (REPO / voce).resolve()


def _scrivi(immagine: Image.Image, uscita: Path, qualita: int) -> None:
    uscita.parent.mkdir(parents=True, exist_ok=True)
    if uscita.suffix.lower() == ".png":
        immagine.save(uscita, optimize=True)
    else:
        immagine.save(uscita, quality=qualita, optimize=True)


def _riquadri_della_frase(pagina_testo, frase: str, altezza_pagina: float) -> list[tuple[float, float, float, float]]:
    """Una volta per ogni punto in cui la frase compare: `(x0, y0, x1, y1)` in punti della pagina, con y dall'alto."""
    trovate, ricerca = [], pagina_testo.search(frase)
    while (hit := ricerca.get_next()) is not None:
        da, quanti = hit
        caselle = [pagina_testo.get_charbox(i) for i in range(da, da + quanti)]
        trovate.append((min(c[0] for c in caselle), altezza_pagina - max(c[3] for c in caselle), max(c[2] for c in caselle), altezza_pagina - min(c[1] for c in caselle)))
    return trovate


def pdf(voce: dict, uscita: Path) -> dict:
    """Le pagine del PDF una sotto l'altra, larghe quanto `larghezza`; i riquadri delle frasi trovati nel testo, pagina per pagina
    (`"frasi": { "1": { "chiave": "testo" } }`)."""
    documento = pypdfium2.PdfDocument(_percorso(voce["file"]))
    scala = voce.get("scala", 2)
    pezzi, riquadri, scarto = [], {}, 0
    for numero in voce["pagine"]:
        pagina = documento[numero - 1]
        immagine_pagina = pagina.render(scale=scala).to_pil().convert("RGB")
        pezzi.append(immagine_pagina)
        testo = pagina.get_textpage()
        for chiave, richiesta in voce.get("frasi", {}).get(str(numero), {}).items():
            frase, indice = richiesta if isinstance(richiesta, list) else (richiesta, None)
            trovate = _riquadri_della_frase(testo, frase, pagina.get_height())
            if indice is not None:
                trovate = trovate[indice - 1:indice]
            if not trovate:
                print(f"  non trovo «{frase}»{f' per la {indice}ª volta' if indice else ''} a pagina {numero}", file=sys.stderr)
                continue
            x0 = min(r[0] for r in trovate)
            y0 = min(r[1] for r in trovate)
            x1 = max(r[2] for r in trovate)
            y1 = max(r[3] for r in trovate)
            riquadri[chiave] = [x0 * scala, y0 * scala + scarto, (x1 - x0) * scala, (y1 - y0) * scala]
        scarto += immagine_pagina.height
    for numero in voce.get("frasi", {}):
        if numero not in [str(n) for n in voce["pagine"]]:
            print(f"  la pagina {numero} delle frasi non è fra quelle rese", file=sys.stderr)
    alto = sum(p.height for p in pezzi)
    intera = Image.new("RGB", (pezzi[0].width, alto), "white")
    y = 0
    for pezzo in pezzi:
        intera.paste(pezzo, (0, y))
        y += pezzo.height
    largo = voce.get("larghezza")
    if largo and intera.width != largo:
        fattore = largo / intera.width
        intera = intera.resize((largo, round(intera.height * fattore)), Image.LANCZOS)
        riquadri = {k: [v[0] * fattore, v[1] * fattore, v[2] * fattore, v[3] * fattore] for k, v in riquadri.items()}
    _scrivi(intera, uscita, voce.get("qualita", 88))
    return {
        "larghezza": intera.width,
        "altezza": intera.height,
        "frasi": {k: [round(c) for c in v] for k, v in riquadri.items()},
    }


def foto(voce: dict, uscita: Path) -> dict:
    immagine = Image.open(_percorso(voce["file"])).convert("RGB")
    largo = voce.get("larghezza")
    if largo and immagine.width != largo:
        immagine = immagine.resize((largo, round(immagine.height * largo / immagine.width)), Image.LANCZOS)
    _scrivi(immagine, uscita, voce.get("qualita", 88))
    return {"larghezza": immagine.width, "altezza": immagine.height}


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    specifica = Path(argv[1]).resolve()
    voci = json.loads(specifica.read_text(encoding="utf-8"))
    nomi = argv[2:] or [f"{sezione}:{nome}" for sezione in voci for nome in voci[sezione]]
    for richiesta in nomi:
        sezione, _, nome = richiesta.partition(":")
        voce = voci.get(sezione, {}).get(nome)
        if voce is None:
            print(f"non conosco «{richiesta}»", file=sys.stderr)
            continue
        uscita = _percorso(voce["in"])
        esito = (pdf if sezione == "pdf" else foto)(voce, uscita)
        (uscita.parent / f"{nome}.json").write_text(json.dumps(esito) + "\n", encoding="utf-8")
        print(f"{nome}: {esito['larghezza']}×{esito['altezza']} → {voce['in']}" + (f", {len(esito['frasi'])} frasi" if esito.get("frasi") else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))