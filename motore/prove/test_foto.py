import pytest
from PIL import Image

from motore import prepara

GIORNO = "2026-11-02"


def _con_orientazione(valore):
    exif = Image.Exif()
    exif[0x0112] = valore
    return exif.tobytes()


def _foto(percorso, formato, largo=400, alto=300, orientazione=1):
    """A sinistra rosso, a destra blu: da come si ruota si vede se è dritta."""
    immagine = Image.new("RGB", (largo, alto), (0, 0, 255))
    immagine.paste((255, 0, 0), (0, 0, largo // 2, alto))
    percorso.parent.mkdir(parents=True, exist_ok=True)
    if formato == "HEIF":
        import pillow_heif

        pillow_heif.register_heif_opener()
    immagine.save(percorso, formato, exif=_con_orientazione(orientazione), quality=95)
    return percorso


def _vicino(pixel, atteso, tolleranza=40):
    return all(abs(a - b) <= tolleranza for a, b in zip(pixel, atteso))


@pytest.fixture
def heic(archivio):
    file = f"{GIORNO}/IMG_0001.heic"
    _foto(archivio.grezzo(file), "HEIF", orientazione=6)
    return file


def test_una_foto_heic_esce_intera_e_dritta(archivio, heic):
    cartella = prepara.prepara_file(archivio, heic, avanza=lambda *_: None)
    assert sorted(f.name for f in cartella.iterdir()) == ["foto.jpg", "miniatura.jpg"]
    foto = Image.open(cartella / "foto.jpg").convert("RGB")
    assert foto.size == (300, 400)
    assert _vicino(foto.getpixel((150, 10)), (255, 0, 0)) and _vicino(foto.getpixel((150, 390)), (0, 0, 255))


def test_la_rotazione_dell_exif_si_applica(archivio):
    file = f"{GIORNO}/IMG_0002.jpg"
    _foto(archivio.grezzo(file), "JPEG", orientazione=3)
    foto = Image.open(prepara.prepara_file(archivio, file, avanza=lambda *_: None) / "foto.jpg").convert("RGB")
    assert foto.size == (400, 300) and _vicino(foto.getpixel((10, 150)), (0, 0, 255)) and _vicino(foto.getpixel((390, 150)), (255, 0, 0))


def test_il_lato_lungo_e_la_miniatura_vengono_dallo_stile_e_non_ingrandiscono(archivio, heic):
    archivio.stile["preparati"]["lato_foto"] = 200
    archivio.stile["preparati"]["lato_miniatura"] = 100
    cartella = prepara.prepara_file(archivio, heic, avanza=lambda *_: None)
    assert Image.open(cartella / "foto.jpg").size == (150, 200)
    assert Image.open(cartella / "miniatura.jpg").size == (75, 100)
    (cartella / "foto.jpg").unlink()
    archivio.stile["preparati"]["lato_foto"] = 5000
    assert Image.open(prepara.prepara_file(archivio, heic, avanza=lambda *_: None) / "foto.jpg").size == (300, 400)


def test_di_una_foto_non_si_fa_niente_da_video(archivio, heic, monkeypatch):
    def vietato(*_, **__):
        raise AssertionError("una foto non passa da ffprobe, ffmpeg né dalla trascrizione")

    for nome in ("info", "ffmpeg", "trascrivi"):
        monkeypatch.setattr(prepara, nome, vietato)
    cartella = prepara.prepara_file(archivio, heic, avanza=lambda *_: None)
    assert sorted(f.name for f in cartella.iterdir()) == ["foto.jpg", "miniatura.jpg"]


def test_cio_che_c_e_gia_non_si_rifa(archivio, heic):
    cartella = prepara.prepara_file(archivio, heic, avanza=lambda *_: None)
    visti = {f.name: f.stat().st_mtime_ns for f in cartella.iterdir()}
    righe = []
    prepara.prepara_file(archivio, heic, avanza=righe.append)
    assert righe == [] and {f.name: f.stat().st_mtime_ns for f in cartella.iterdir()} == visti
    (cartella / "miniatura.jpg").unlink()
    prepara.prepara_file(archivio, heic, avanza=righe.append)
    assert len(righe) == 1 and "miniatura" in righe[0] and "foto" not in righe[0]
    assert {f.name: f.stat().st_mtime_ns for f in cartella.iterdir()}["foto.jpg"] == visti["foto.jpg"]


def test_una_foto_rotta_lo_dice_e_non_lascia_file_a_meta(archivio):
    file = f"{GIORNO}/rotta.heic"
    archivio.grezzo(file).parent.mkdir(parents=True, exist_ok=True)
    archivio.grezzo(file).write_bytes(b"non e una foto")
    with pytest.raises(Exception):
        prepara.prepara_file(archivio, file, avanza=lambda *_: None)
    assert list(archivio.preparati(file).iterdir()) == []
