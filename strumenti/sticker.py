"""Uno sticker del creator: il busto da un fotogramma della sagoma, con un bordo bianco pieno, in archivio/sticker/<nome>.png.
Uso: python -m strumenti.sticker <giorno/file del girato> <istante in secondi> <nome>
     python -m strumenti.sticker --provini [giorno]   (i fogli da cui scegliere l'espressione, in archivio/sticker/provini/)"""
import argparse, io, json, math, os, subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from motore.archivio import VARIABILE_LAVORO, archivio_di_lavoro, leggi_stile
from motore.errori import Errore
from motore.sagoma import pezzi_della_sagoma, pezzo_della_sagoma

REPO = Path(__file__).resolve().parent.parent
# I provini: quanti per foglio e su quante colonne, e quanto è grande ognuno (lato lungo).
PER_FOGLIO = 24
COLONNE = 6
CELLA = 300


def misure_dello_sticker():
    """La sezione `sticker` dello stile: `bordo` in pixel; `altezza_busto` e `lati` in frazioni della larghezza del fotogramma (quanto busto sotto la cima della testa, e quanto si toglie ai lati: le mani che entrano dai bordi); `per_ripresa`, quanti provini per ripresa."""
    return leggi_stile(REPO, os.environ.get(VARIABILE_LAVORO))["sticker"]


def sticker(fotogramma, misure):
    largo, alto = fotogramma.size
    spessore, busto, lati = misure["bordo"], misure["altezza_busto"], misure["lati"]
    # Il bordo segue la forma: i ciuffi isolati e le sfumature dello scontorno non contano.
    sagoma = fotogramma.getchannel("A").point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    cima = sagoma.getbbox()[1]
    taglio = (round(largo * lati), max(cima - 10, 0), round(largo * (1 - lati)), min(cima + round(largo * busto), alto))
    persona, sagoma = fotogramma.crop(taglio), sagoma.crop(taglio)
    sinistra, _, destra, _ = sagoma.getbbox()
    persona, sagoma = persona.crop((sinistra, 0, destra, persona.height)), sagoma.crop((sinistra, 0, destra, sagoma.height))

    misura = (persona.width + 2 * spessore, persona.height + 2 * spessore)
    bordo = Image.new("L", misura, 0)
    bordo.paste(sagoma, (spessore, spessore))
    for _ in range(6):
        bordo = bordo.filter(ImageFilter.MaxFilter(9))
    bordo = bordo.filter(ImageFilter.GaussianBlur(9)).point(lambda v: 255 if v > 110 else 0)

    risultato = Image.new("RGBA", misura, (0, 0, 0, 0))
    risultato.paste(Image.new("RGBA", misura, (255, 255, 255, 255)), (0, 0), bordo)
    sopra = Image.new("RGBA", misura, (0, 0, 0, 0))
    sopra.paste(persona, (spessore, spessore))
    risultato = Image.alpha_composite(risultato, sopra)
    risultato.putalpha(bordo)
    return risultato


def salva(fotogramma, nome, archivio, origine):
    cartella = Path(archivio) / "sticker"
    cartella.mkdir(parents=True, exist_ok=True)
    destinazione = cartella / f"{nome}.png"
    sticker(fotogramma, misure_dello_sticker()).save(destinazione)
    (cartella / f"{nome}.json").write_text(json.dumps(origine, ensure_ascii=False), encoding="utf-8")
    return destinazione


class SenzaFotogramma(Exception):
    pass


def fotogramma_della_sagoma(file, istante, archivio):
    trovato = pezzo_della_sagoma(Path(archivio) / "preparati" / file, istante, istante, 0.0)
    if not trovato:
        raise SenzaFotogramma(f"Nella sagoma di {file} non c'è niente a {istante} s: la sagoma copre solo i tratti montati (sagoma.json).")
    sagoma, nel_file = trovato
    # Il decodificatore VP9 esplicito: quello predefinito di ffmpeg perde la trasparenza.
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-c:v", "libvpx-vp9", "-ss", str(nel_file), "-i", str(sagoma), "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                           capture_output=True, check=True)
    if not esito.stdout:
        raise SenzaFotogramma(f"Nella sagoma di {file} non c'è niente a {istante} s: la sagoma copre solo i tratti montati (sagoma.json).")
    return Image.open(io.BytesIO(esito.stdout)).convert("RGBA")


def istanti_da_provare(pezzi, quanti):
    """`quanti` istanti distribuiti uniformi sui tratti scontornati, al centro di passi uguali; un pezzo senza fine non si sa quanto copre."""
    finiti = [p for p in pezzi if math.isfinite(p["a"])]
    passo = sum(p["a"] - p["da"] for p in finiti) / quanti
    istanti, x = [], passo / 2
    for p in finiti:
        while x < p["a"] - p["da"] and len(istanti) < quanti:
            istanti.append(round(p["da"] + x, 1))
            x += passo
        x -= p["a"] - p["da"]
    return istanti


def provini(archivio, giorno=None, per_ripresa=None):
    """Per ogni ripresa scontornata (o solo quelle di `giorno`), `per_ripresa` (di serie quelli dello stile) sticker di prova numerati, in fogli
    `sticker/provini/provini-<n>.jpg`; `provini.json` dice di ogni numero ripresa e istante, da dare al comando dello sticker."""
    archivio, misure = Path(archivio), misure_dello_sticker()
    per_ripresa = per_ripresa or misure["per_ripresa"]
    cartella = archivio / "sticker" / "provini"
    cartella.mkdir(parents=True, exist_ok=True)
    for vecchio in cartella.glob("provini-*.jpg"):
        vecchio.unlink()
    elenco, celle = {}, []
    for preparato in sorted(p for p in (archivio / "preparati").glob("*/*") if p.is_dir() and (giorno is None or p.parent.name == giorno)):
        pezzi = pezzi_della_sagoma(preparato)
        file = preparato.relative_to(archivio / "preparati").as_posix()
        for istante in istanti_da_provare(pezzi, per_ripresa) if pezzi else []:
            try:
                prova = sticker(fotogramma_della_sagoma(file, istante, archivio), misure)
            except SenzaFotogramma:
                # sagoma.json promette più di quanto il webm porta: quell'istante si salta
                continue
            prova.thumbnail((CELLA, CELLA))
            celle.append(prova)
            elenco[str(len(celle))] = {"file": file, "istante": istante}
    if not celle:
        raise SystemExit(f"Nessuna ripresa scontornata{f' del {giorno}' if giorno else ''} in {archivio / 'preparati'}: la sagoma la fa `monta`, dei tratti montati.")
    carattere = ImageFont.load_default(size=CELLA // 8)
    fogli = []
    for inizio in range(0, len(celle), PER_FOGLIO):
        gruppo = celle[inizio:inizio + PER_FOGLIO]
        righe = math.ceil(len(gruppo) / COLONNE)
        foglio = Image.new("RGB", (COLONNE * CELLA, righe * CELLA), (38, 38, 45))
        disegno = ImageDraw.Draw(foglio)
        for i, prova in enumerate(gruppo):
            x, y = (i % COLONNE) * CELLA, (i // COLONNE) * CELLA
            foglio.paste(prova, (x + (CELLA - prova.width) // 2, y + CELLA - prova.height), prova)
            disegno.text((x + 8, y + 4), str(inizio + i + 1), fill=(255, 220, 0), font=carattere, stroke_width=3, stroke_fill=(0, 0, 0))
        fogli.append(cartella / f"provini-{len(fogli) + 1}.jpg")
        foglio.save(fogli[-1], quality=85)
    (cartella / "provini.json").write_text(json.dumps(elenco, ensure_ascii=False), encoding="utf-8")
    return fogli


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("--provini", nargs="?", const="", metavar="GIORNO", help="i fogli dei provini, di tutte le riprese scontornate o di un giorno")
    a.add_argument("file", nargs="?")
    a.add_argument("istante", nargs="?", type=float)
    a.add_argument("nome", nargs="?")
    argomenti = a.parse_args()
    try:
        archivio = archivio_di_lavoro()
    except Errore as e:
        raise SystemExit(str(e))
    if argomenti.provini is not None:
        for foglio in provini(archivio, argomenti.provini or None):
            print(foglio)
        print(archivio / "sticker" / "provini" / "provini.json")
    elif None in (argomenti.file, argomenti.istante, argomenti.nome):
        a.error("servono il file del girato, l'istante e il nome dello sticker (oppure --provini)")
    else:
        try:
            print(salva(fotogramma_della_sagoma(argomenti.file, argomenti.istante, archivio), argomenti.nome, archivio, {"file": argomenti.file, "istante": argomenti.istante}))
        except SenzaFotogramma as e:
            raise SystemExit(str(e))
