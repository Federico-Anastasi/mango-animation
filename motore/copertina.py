from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .archivio import scrivi_con
from .errori import Errore, dice
from .media import ffmpeg
from .prepara import libera, sagoma_dei_tratti
from .sagoma import formato_della_sagoma, pezzo_della_sagoma
from .quadri import Compositore
from .risolvi import risolvi
from .sottotitoli import cartelli_del_titolo


def _sagoma_a_sinistra(archivio, slug, comp, spec, o, L, A):
    """La sagoma di un'altra ripresa (verticale) a sinistra della copertina di un video lungo: il fotogramma di `spec` (`sorgente` e `istante`, secondi di quella ripresa) senza sfondo,
    ritagliato da `aria` sopra la testa per `righe` righe, alto `altezza`, col bordo bianco di `bordo` pixel (la forma allargata). Se la sagoma di quel fotogramma non c'è, si scontorna solo quello."""
    stile = archivio.stile
    if spec["sorgente"] not in comp.piano["sorgenti"]:
        raise Errore(f"la copertina prende la sagoma dalla sorgente «{spec['sorgente']}», che il piano non dichiara fra le `sorgenti`",
                     f"the cover takes the silhouette from the source «{spec['sorgente']}», which the plan does not declare among the `sorgenti`")
    sorgente, fps = comp.sorgente(spec["sorgente"]), formato_della_sagoma(stile)["fps"]
    da = spec["istante"]
    if pezzo_della_sagoma(sorgente.preparati, da, da + 1 / fps, stile["sagoma"]["margine"]) is None:
        try:
            sagoma_dei_tratti(sorgente.percorso, sorgente.preparati, [(da, da + 1 / fps)], stile)
        finally:
            libera()
    file, nel_file = comp.pezzo_sagoma(spec["sorgente"], da, da)
    foto = archivio.lavoro(slug) / "copertina-sagoma.png"
    ffmpeg("-c:v", "libvpx-vp9", "-ss", f"{nel_file:.4f}", "-i", file, "-frames:v", "1", "-y", foto)
    piena = Image.open(foto).convert("RGBA")
    foto.unlink()
    righe = np.flatnonzero((np.asarray(piena)[..., 3] > stile["sagoma"]["alfa"]).sum(axis=1) > stile["sagoma"]["riga_minima"])
    if not len(righe):
        raise Errore(f"nella sagoma di «{spec['sorgente']}» a {da:g} s non si vede nessuno: scegli un altro istante",
                     f"no one is visible in the silhouette of «{spec['sorgente']}» at {da:g} s: choose another moment")
    testa = max(0, int(righe[0]) - o["aria"])
    ritaglio = piena.crop((0, testa, piena.width, testa + o["righe"]))
    sagoma = ritaglio.resize((round(ritaglio.width * o["altezza"] / o["righe"]), o["altezza"]), Image.LANCZOS)
    bordo = Image.new("RGBA", sagoma.size, (*archivio.colore("bianco"), 0))
    bordo.putalpha(sagoma.getchannel("A").filter(ImageFilter.MaxFilter(o["bordo"] | 1)))
    livello = Image.new("RGBA", (L, A))
    for strato in (bordo, sagoma):
        livello.alpha_composite(strato, (max(0, o["x"]), max(0, o["y"])), (max(0, -o["x"]), max(0, -o["y"])))
    return livello


def _righe_del_titolo(stile, colori, carattere, testo, righe, o, L):
    """Il titolo di un video lungo: una riga per cartello, ognuno col fondo, il colore, gli angoli e il carattere del titolo dello stile, tutti attaccati al margine destro, dall'alto.
    Le righe le dà il piano (`copertina.righe`); senza, si va a capo da soli entro `largo` pixel."""
    t, s = stile["titolo"], o["titolo"]
    font = ImageFont.truetype(str(carattere), s["corpo"])
    scritta = str.upper if t["maiuscolo"] else str
    if not righe:
        righe, riga = [], ""
        for parola in scritta(testo).split():
            prova = f"{riga} {parola}".strip()
            if riga and font.getlength(prova) > s["largo"]:
                righe.append(riga)
                riga = parola
            else:
                riga = prova
        righe.append(riga)
    fuori, y = [], s["y"]
    for riga in righe:
        riga = scritta(riga)
        largo = round(font.getlength(riga)) + 2 * s["margine_laterale"]
        cartello = Image.new("RGBA", (largo, s["altezza_riga"]), (0, 0, 0, 0))
        disegno = ImageDraw.Draw(cartello)
        disegno.rounded_rectangle((0, 0, largo - 1, s["altezza_riga"] - 1), radius=t["raggio"], fill=colori(t["fondo"]))
        disegno.text((s["margine_laterale"], s["altezza_riga"] / 2), riga, font=font, fill=colori(t["colore"]), anchor="lm")
        fuori.append((cartello, L - s["margine_destro"] - largo, y))
        y += s["altezza_riga"] + s["stacco"]
    return fuori


def componi(archivio, slug, piano, risolto, comp, disegno, istante=0.0):
    """Il disegno a tutto fotogramma con sopra la sagoma del primo fotogramma, messa dove sta nel video, se quel quadro ha una sagoma
    (un video di solo schermo non ne ha), e il titolo con la sua parte, se lo stile lo vuole.
    `disegno` è un percorso, o un file nella cartella del video (`materiali/x.png`). `istante` (secondi del video) prende la sagoma da un altro momento: quando nel primo fotogramma il creator ha gli occhi chiusi."""
    stile = archivio.stile
    L, A = risolto["formato"]["largo"], risolto["formato"]["alto"]
    file_disegno = next((p for p in (Path(disegno), archivio.video(slug) / disegno) if p.is_file()), None)
    if file_disegno is None:
        raise Errore(f"il disegno «{disegno}» non c'è: né come percorso, né nella cartella del video ({archivio.video(slug)})",
                     f"the drawing «{disegno}» does not exist: neither as a path nor in the video's folder ({archivio.video(slug)})")
    img = Image.open(file_disegno).convert("RGBA")
    if img.size != (L, A):
        raise Errore(f"il disegno è {img.width}×{img.height}: la copertina dev'essere {L}×{A}",
                     f"the drawing is {img.width}×{img.height}: the cover must be {L}×{A}")
    primo = risolto["tratti"][0]
    scelto = next((t for t in reversed(risolto["tratti"]) if t["esce"] <= istante), primo)
    quadro, cop = comp.quadro(primo["scena"]), stile["copertina"]
    if L > A:
        # Un video orizzontale non mostra il creator: la sagoma viene da un'altra ripresa e il titolo sta a destra, a righe.
        dichiarata, o = piano.get("copertina", {}), cop["orizzontale"]
        if dichiarata.get("sagoma"):
            img.alpha_composite(_sagoma_a_sinistra(archivio, slug, comp, dichiarata["sagoma"], o["sagoma"], L, A))
        if cop["titolo_in_alto"] and risolto["titolo"]:
            for cartello, x, y in _righe_del_titolo(stile, archivio.colore, archivio.font(stile["titolo"]["carattere"]), risolto["titolo"]["testo"], dichiarata.get("righe"), o, L):
                img.alpha_composite(cartello, (x, y))
        return img.convert("RGB")
    strato = comp.sagoma_di(scelto["scena"])
    if cop["sagoma_del_primo_fotogramma"] and strato:
        nome, da = comp.sagoma_del_tratto(scelto)
        da += istante - scelto["esce"]
        g = comp.geometria_sagoma(nome, strato)
        foto = archivio.lavoro(slug) / "copertina-sagoma.png"
        file, nel_file = comp.pezzo_sagoma(nome, da, da)
        ffmpeg("-c:v", "libvpx-vp9", "-ss", f"{nel_file:.4f}", "-i", file, "-frames:v", "1", "-y", foto)
        sagoma = Image.open(foto).convert("RGBA").crop((0, g["taglio"], L, g["taglio"] + g["righe"])).resize((g["largo"], g["alto"]), Image.LANCZOS)
        foto.unlink()
        livello = Image.new("RGBA", (L, A))
        livello.paste(sagoma, (g["x"], g["y"]))
        img.alpha_composite(livello)
    if cop["titolo_in_alto"] and risolto["titolo"]:
        for riquadro, x, y in cartelli_del_titolo(stile, archivio.colore, archivio.font(stile["titolo"]["carattere"]), quadro["titolo"], risolto["titolo"]):
            img.paste(riquadro, (x, y), riquadro if riquadro.mode == "RGBA" else None)
    return img.convert("RGB")


def scrivi(archivio, slug, img):
    file = archivio.uscite(slug) / "copertina.png"
    file.parent.mkdir(parents=True, exist_ok=True)
    scrivi_con(file, lambda dest: img.save(dest, format="PNG"))
    return file


def copertina(archivio, slug, disegno=None, istante=None, avanza=print):
    """L'immagine della copertina, per guardarla prima di montare: `uscite/copertina.png`. Il disegno e l'istante sono quelli dati, o quelli di `copertina` nel piano.
    Nel video la copertina la mette `monta`, come primo fotogramma, se il piano la dichiara."""
    piano = archivio.piano(slug)
    dichiarata = piano.get("copertina", {})
    disegno = disegno or dichiarata.get("disegno")
    if not disegno:
        raise Errore(f"dì quale disegno: `python -m motore copertina {slug} <disegno>`, oppure dichiara `copertina` nel piano (`{{\"disegno\": \"materiali/x.png\"}}`)",
                     f"say which drawing: `python -m motore copertina {slug} <disegno>`, or declare `copertina` in the plan (`{{\"disegno\": \"materiali/x.png\"}}`)")
    istante = dichiarata.get("istante", 0.0) if istante is None else istante
    risolto = risolvi(archivio, slug)
    img = componi(archivio, slug, piano, risolto, Compositore(archivio, slug, piano, risolto), disegno, istante)
    avanza(str(scrivi(archivio, slug, img)))
    if dichiarata.get("disegno") != disegno or dichiarata.get("istante", 0.0) != istante:
        avanza(dice("nel video la copertina entra quando il piano dichiara `copertina` (disegno e istante) e si rimonta",
                    "the cover enters the video when the plan declares `copertina` (drawing and moment) and the video is edited again"))
