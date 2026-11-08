"""L'anteprima di una proposta: il titolo e una riga su una carta nello stile, in `materiali/anteprima.png`. È ciò che l'elenco dei video
mostra finché non c'è niente di meglio (`docs/ARCHIVIO.md`); una foto o un disegno si salvano sullo stesso nome."""

from PIL import Image, ImageDraw

from .archivio import scrivi_con
from .errori import Errore
from .sottotitoli import cartello


def _testo(archivio, spec, testo, a, corpo):
    """Un testo a capo dentro la colonna dell'anteprima: l'immagine, larga quanto le sue righe più i margini."""
    scheda = {"corpo": corpo, "corpo_minimo": spec.get("corpo_minimo", corpo), "passo_corpo": spec.get("passo_corpo", 1), "interlinea": spec["interlinea"],
              "margine": a["margine"], "largo": a["largo"], "margine_alto": 0, "margine_basso": 0, "fondo": None,
              "colore": archivio.colore(spec["colore"]), "colore_correzione": archivio.colore(spec["colore"])}
    return cartello(testo, scheda, archivio.font(a["carattere"]))[0]


def anteprima_proposta(archivio, slug, riga=None, avanza=print):
    """Scrive `materiali/anteprima.png` del video: una barra, il titolo della scheda e, sotto, `riga` (se c'è), al centro del riquadro.
    Il titolo si rimpicciolisce finché il tutto sta; se non ci sta nemmeno al corpo minimo è un errore. Rifatta, sostituisce la precedente."""
    titolo = archivio.scheda(slug)["titolo"]
    a = archivio.stile["anteprima"]
    filo, t, r = a["filo"], a["titolo"], a["riga"]
    disponibile = a["alto"] - 2 * a["margine"]
    sotto = _testo(archivio, r, riga, a, r["corpo"]) if riga else None
    corpo = t["corpo"]
    while True:
        sopra = _testo(archivio, t, titolo, a, corpo)
        blocco = filo["spessore"] + filo["stacco"] + sopra.height + (r["stacco"] + sotto.height if sotto else 0)
        if sopra.width <= a["largo"] and (sotto is None or sotto.width <= a["largo"]) and blocco <= disponibile:
            break
        if corpo <= t["corpo_minimo"]:
            raise Errore("il titolo e la riga non stanno nell'anteprima: accorcia la riga o il titolo",
                         "the title and the line do not fit in the preview: shorten the line or the title")
        corpo -= t["passo_corpo"]
    carta = Image.new("RGBA", (a["largo"], a["alto"]), archivio.colore(a["fondo"]))
    y = (a["alto"] - blocco) // 2
    ImageDraw.Draw(carta).rectangle((a["margine"], y, a["margine"] + filo["largo"] - 1, y + filo["spessore"] - 1), fill=archivio.colore(filo["colore"]))
    y += filo["spessore"] + filo["stacco"]
    carta.alpha_composite(sopra, (0, y))
    if sotto:
        carta.alpha_composite(sotto, (0, y + sopra.height + r["stacco"]))
    destinazione = archivio.video(slug) / "materiali" / "anteprima.png"
    scrivi_con(destinazione, lambda dest: carta.convert("RGB").save(dest, format="PNG"))
    avanza(str(destinazione))
