"""Il carosello: le slide di `materiali/carosello.html` in `uscite/slide-<n>.png` (`strumenti/carosello.mjs`), con i controlli."""
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import quote

from .archivio import leggi_json
from .errori import Errore, dice
from .pagina import node_con_pacchetti

FRASI = {
    "lato sinistro": lambda a, m: dice(f"«{a['testo']}» nel lato sinistro, che il telefono taglia", f"«{a['testo']}» in the left side, which the phone crops"),
    "lato destro": lambda a, m: dice(f"«{a['testo']}» nel lato destro, sotto i bottoni di TikTok", f"«{a['testo']}» in the right side, under TikTok's buttons"),
    "didascalia": lambda a, m: dice(f"«{a['testo']}» nella zona della didascalia", f"«{a['testo']}» in the caption area"),
    "immagine": lambda a, m: dice(f"«{a['testo']}» non si carica", f"«{a['testo']}» does not load"),
    "carattere": lambda a, m: dice(f"«{a['testo']}» non si carica", f"«{a['testo']}» does not load"),
    "piccolo": lambda a, m: dice(f"«{a['testo']}» è troppo piccolo per il telefono: {a['dettaglio']} px, ne servono almeno {m['testo_minimo']}",
                                 f"«{a['testo']}» is too small for the phone: {a['dettaglio']} px, at least {m['testo_minimo']} needed"),
    "tagliato": lambda a, m: dice(f"«{a['testo']}» non si vede intero: esce dal suo riquadro o dalla slide", f"«{a['testo']}» is not fully visible: it goes outside its box or the slide"),
    "accavallato": lambda a, m: dice(f"«{a['testo']}» e «{a['dettaglio']}» si sovrappongono", f"«{a['testo']}» and «{a['dettaglio']}» overlap"),
    "vuota": lambda a, m: dice(f"quasi vuota: solo il {a['dettaglio']}% è di un colore diverso dallo sfondo", f"almost empty: only {a['dettaglio']}% is a different colour from the background"),
}


def _cartella(archivio, slug):
    cartella = archivio.video(slug)
    scheda = leggi_json(cartella / "scheda.json", "la scheda", "the card") if (cartella / "scheda.json").exists() else {}
    if scheda.get("formato") != "carosello":
        raise Errore(f"«{slug}» non è un carosello: nella scheda manca \"formato\": \"carosello\"",
                     f"«{slug}» is not a carousel: the card lacks \"formato\": \"carosello\"")
    return cartella


def _da(pagina, file):
    """Come la pagina raggiunge un file: il percorso relativo, o l'indirizzo intero se sta su un altro disco."""
    try:
        return quote(Path(os.path.relpath(file, pagina.parent)).as_posix(), safe="/.")
    except ValueError:
        return file.as_uri()


def nuovo(archivio, slug, avanza=print):
    """Scrive `materiali/carosello.html` con il sistema del primo carosello e tre slide d'esempio, dove non c'è già una pagina."""
    cartella = _cartella(archivio, slug)
    pagina = cartella / "materiali" / "carosello.html"
    if pagina.exists():
        raise Errore(f"{pagina} c'è già: la base si scrive solo dove non c'è niente, le slide si cambiano in quel file",
                     f"{pagina} already exists: the base is written only where there is nothing, the slides are changed in that file")
    stile = archivio.stile["carosello"]
    variabili = [f"  --{nome}: {valore};" for nome, valore in stile["colori"].items()]
    variabili += [f"  --{nome.replace('_', '-')}: {valore}px;" for nome, valore in stile["base"].items()]
    stickers = sorted((archivio.radice / "sticker").glob("*.png"))
    sticker = (f'  <img src="{_da(pagina, stickers[0])}" alt="" style="position:absolute; left:60px; top:950px; width:580px; transform:rotate(-5deg)">'
               if stickers else "")
    modello = (Path(__file__).parent / "carosello-base.html").read_text(encoding="utf-8")
    testo = (modello.replace("@@VARIABILI@@", "\n".join(variabili)).replace("@@FONT@@", _da(pagina, archivio.font("titoli")))
             .replace("@@STICKER@@", sticker))
    pagina.parent.mkdir(parents=True, exist_ok=True)
    pagina.write_text(testo, encoding="utf-8")
    avanza(dice(f"scritta materiali/carosello.html con tre slide d'esempio ({'con' if stickers else 'senza'} sticker del creator): si sostituiscono, poi `python -m motore carosello {slug}`",
                f"written materiali/carosello.html with three example slides ({'with' if stickers else 'without'} the creator's sticker): replace them, then `python -m motore carosello {slug}`"))


def carosello(archivio, slug, avanza=print):
    """Rende le slide e dice cosa non va; toglie le slide vecchie oltre l'ultima. Restituisce gli avvisi."""
    cartella = _cartella(archivio, slug)
    pagina = cartella / "materiali" / "carosello.html"
    if not pagina.exists():
        raise Errore(f"manca {pagina}: le slide si scrivono lì, una <section class=\"slide\"> ciascuna (docs/MOTORE.md, «Il carosello»)",
                     f"{pagina} is missing: the slides are written there, one <section class=\"slide\"> each (docs/MOTORE.md, «Il carosello»)")
    node = node_con_pacchetti(archivio)
    uscite = archivio.uscite(slug)
    uscite.mkdir(parents=True, exist_ok=True)
    esito = subprocess.run([node, archivio.repo / "strumenti" / "carosello.mjs", pagina, uscite], cwd=archivio.repo,
                           capture_output=True, encoding="utf-8", errors="replace")
    if esito.returncode != 0:
        raise Errore(f"le slide non sono state rese: {esito.stderr.strip()[-500:]}",
                     f"the slides were not rendered: {esito.stderr.strip()[-500:]}")
    dati = json.loads(esito.stdout.strip().splitlines()[-1])
    if dati["slide"] == 0:
        raise Errore("in materiali/carosello.html non c'è nessuna <section class=\"slide\">: ogni slide è una section con quella classe",
                     "materiali/carosello.html has no <section class=\"slide\">: each slide is a section with that class")
    for vecchia in uscite.glob("slide-*.png"):
        numero = vecchia.stem.removeprefix("slide-")
        if numero.isdigit() and int(numero) > dati["slide"]:
            vecchia.unlink()
    for a in dati["avvisi"]:
        dove = f"slide {a['slide']}" if a["slide"] else dice("pagina", "page")
        avanza(f"{dice('attenzione', 'warning')}: {dove}: {FRASI[a['cosa']](a, archivio.stile['carosello'])}")
    avanza(dice(f"{dati['slide']} slide in uscite/, avvisi: {len(dati['avvisi'])}", f"{dati['slide']} slides in uscite/, warnings: {len(dati['avvisi'])}"))
    return dati["avvisi"]
