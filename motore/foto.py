from PIL import Image, ImageOps

from .archivio import scrivi_con

ESTENSIONI = {".heic", ".heif", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff", ".dng", ".bmp"}
_HEIF = {".heic", ".heif"}


def e_foto(sorgente):
    return sorgente.suffix.lower() in ESTENSIONI


def leggi_foto(sorgente):
    """La foto intera, dritta secondo l'EXIF, a colori RGB: una HEIC dell'iPhone è una griglia di riquadri che ffmpeg legge a uno solo."""
    if sorgente.suffix.lower() in _HEIF:
        import pillow_heif

        pillow_heif.register_heif_opener()
    with Image.open(sorgente) as aperta:
        icc = aperta.info.get("icc_profile")
        dritta = ImageOps.exif_transpose(aperta).convert("RGB")
    return dritta, icc


def _ridotta(foto, lato):
    copia = foto.copy()
    copia.thumbnail((lato, lato), Image.LANCZOS)
    return copia


def prepara_foto(sorgente, cartella, stile, avanza=print):
    """`foto.jpg` (intera, lato lungo al più `preparati.lato_foto`) e `miniatura.jpg`; ciò che c'è già non si rifà."""
    p = stile["preparati"]
    mancanti = [(nome, lato, qualita) for nome, lato, qualita in (("foto.jpg", p["lato_foto"], p["qualita_foto"]), ("miniatura.jpg", p["lato_miniatura"], p["qualita_miniatura"]))
                if not (cartella / nome).exists()]
    if not mancanti:
        return
    avanza(f"{sorgente.name}: " + " e ".join(nome.removesuffix(".jpg") for nome, _, _ in mancanti))
    foto, icc = leggi_foto(sorgente)
    for nome, lato, qualita in mancanti:
        resa = _ridotta(foto, lato)
        scrivi_con(cartella / nome, lambda dest, r=resa: r.save(dest, format="JPEG", quality=qualita, icc_profile=icc))
