"""Le pagine vere dei video di notizia: la cattura in formato telefono (`strumenti/pagina.mjs`) e i ritagli per le scene."""
import os
import shutil
import subprocess
import sys

from PIL import Image

from .archivio import leggi_json, scrivi_con, scrivi_json
from .errori import Errore, dice

ESEMPIO = '{ "articolo": { "url": "https://esempio.it/articolo", "intera": true, "frasi": { "titolo": "Il titolo dell articolo" } } }'


def _cattura(archivio, elenco, nomi, visibile):
    """Prende le pagine col browser; False se qualcuna non è stata presa (il perché lo scrive lo script)."""
    node = shutil.which("node")
    if node is None:
        raise Errore("per prendere le pagine serve Node (il comando `node`): installalo da nodejs.org",
                     "capturing the pages needs Node (the `node` command): install it from nodejs.org")
    ambiente = {**os.environ, "PAGINA_VISIBILE": "1"} if visibile else None
    sys.stdout.flush()
    esito = subprocess.run([node, archivio.repo / "strumenti" / "pagina.mjs", elenco, *nomi], cwd=archivio.repo, env=ambiente)
    return esito.returncode == 0


def _dentro(riquadro, x, y, largo, alto):
    fx, fy, fw, fh = riquadro
    return fx >= x and fy >= y and fx + fw <= x + largo and fy + fh <= y + alto


def _ritaglia(archivio, materiali, nome, voce):
    cattura = materiali / f"screen-{nome}.png"
    misure = leggi_json(materiali / f"screen-{nome}.json", f"le misure della pagina «{nome}»", f"the measurements of the page «{nome}»")
    if not {"larghezza", "altezza", "frasi"} <= misure.keys():
        raise Errore(f"screen-{nome}.json non dice larghezza, altezza e frasi: è una cattura di prima, riprendi la pagina",
                     f"screen-{nome}.json does not give larghezza, altezza and frasi: it is an old capture, capture the page again")
    largo, alto = misure["larghezza"], misure["altezza"]
    sotto = archivio.stile["pagina"]["sotto_le_frasi"]
    for chiave, riquadro in misure["frasi"].items():
        if not _dentro(riquadro, 0, 0, largo, alto):
            print(dice(f"attenzione: {nome}: «{chiave}» sta fuori dalla cattura ({riquadro}): è un testo nascosto, scegline un'altra occorrenza",
                       f"warning: {nome}: «{chiave}» is outside the capture ({riquadro}): it is hidden text, pick another occurrence"))
        elif alto - (riquadro[1] + riquadro[3]) < sotto:
            px = alto - riquadro[1] - riquadro[3]
            print(dice(f"attenzione: {nome}: sotto «{chiave}» restano {px} px di pagina, ne servono {sotto} perché la telecamera la porti nella metà alta",
                       f"warning: {nome}: under «{chiave}» only {px} px of page remain, {sotto} are needed for the camera to bring it to the upper half"))
    ritagli = voce.get("ritagli", {})
    if not ritagli:
        return
    immagine = Image.open(cattura).convert("RGB")
    for chiave, ritaglio in ritagli.items():
        x, y, w, h = (0, 0, immagine.width, immagine.height) if ritaglio == "tutta" else ritaglio
        if x + w > immagine.width or y + h > immagine.height:
            raise Errore(f"il ritaglio «{chiave}» di «{nome}» ({ritaglio}) esce dalla cattura, che è {immagine.width}×{immagine.height}: correggilo in materiali/pagine.json",
                         f"the crop «{chiave}» of «{nome}» ({ritaglio}) goes outside the capture, which is {immagine.width}×{immagine.height}: fix it in materiali/pagine.json")
        pezzo = immagine.crop((x, y, x + w, y + h))
        uscita = materiali / "ritagli" / f"{nome}-{chiave}.jpg"
        scrivi_con(uscita, lambda dest: pezzo.save(dest, "JPEG", quality=archivio.stile["pagina"]["qualita"]))
        frasi = {k: [r[0] - x, r[1] - y, r[2], r[3]] for k, r in misure["frasi"].items() if _dentro(r, x, y, w, h)}
        scrivi_json(uscita.with_suffix(".json"), {"larghezza": w, "altezza": h, "frasi": frasi})
        print(dice(f"ritagli/{uscita.name}: {w}×{h}, {len(frasi)} frasi", f"ritagli/{uscita.name}: {w}×{h}, {len(frasi)} sentences"))


def pagina(archivio, slug, nomi=(), solo_ritagli=False, visibile=False):
    """Prende le pagine di `materiali/pagine.json` (tutte, o quelle nominate) e ne fa i ritagli; con `solo_ritagli` rifà solo questi."""
    materiali = archivio.video(slug) / "materiali"
    elenco = materiali / "pagine.json"
    if not elenco.exists():
        raise Errore(f"manca {elenco}: scrivi lì le pagine da prendere, per esempio {ESEMPIO} (le chiavi in docs/MOTORE.md, «Le pagine vere»)",
                     f"{elenco} is missing: write the pages to capture there, for example {ESEMPIO} (the keys in docs/MOTORE.md, «Le pagine vere»)")
    pagine = leggi_json(elenco, "l'elenco delle pagine", "the list of pages")
    archivio.controlla_schema(pagine, "pagine", "materiali/pagine.json", "materiali/pagine.json")
    for nome, voce in pagine.items():
        if "filmato" in voce and voce["filmato"][1] <= voce["filmato"][0]:
            raise Errore(f"in materiali/pagine.json il filmato di «{nome}» finisce prima di cominciare ({voce['filmato']}): scrivi [da, a] con a dopo da",
                         f"in materiali/pagine.json the film of «{nome}» ends before it starts ({voce['filmato']}): write [da, a] with a after da")
        if "filmato" in voce and voce.get("intera"):
            raise Errore(f"in materiali/pagine.json «{nome}» ha sia `filmato` sia `intera`: un filmato è grande quanto lo schermo del telefono, togli `intera`",
                         f"in materiali/pagine.json «{nome}» has both `filmato` and `intera`: a film is as large as the phone screen, remove `intera`")
    sconosciute = [n for n in nomi if n not in pagine]
    if sconosciute:
        raise Errore(f"in materiali/pagine.json non c'è «{'», «'.join(sconosciute)}»: ci sono {', '.join(pagine)}",
                     f"materiali/pagine.json has no «{'», «'.join(sconosciute)}»: it has {', '.join(pagine)}")
    scelte = list(nomi) or list(pagine)
    prese = solo_ritagli or _cattura(archivio, elenco, scelte, visibile)
    for nome in scelte:
        if not (materiali / f"screen-{nome}.png").exists():
            if solo_ritagli:
                raise Errore(f"la pagina «{nome}» non è ancora stata presa: lancia `python -m motore pagina {slug} {nome}`",
                             f"the page «{nome}» has not been captured yet: run `python -m motore pagina {slug} {nome}`")
            continue
        _ritaglia(archivio, materiali, nome, pagine[nome])
    if not prese:
        raise Errore("non tutte le pagine sono state prese (il perché è sopra); i loro file di prima restano com'erano. "
                     f"Un sito che blocca il browser senza finestra si prende con `python -m motore pagina {slug} <nome> --visibile`",
                     "not all the pages were captured (the reason is above); their earlier files are left as they were. "
                     f"A site that blocks the browser without a window is captured with `python -m motore pagina {slug} <nome> --visibile`")
