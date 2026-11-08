"""Foto vere di oggetti per i caroselli, scontornate, da Wikimedia Commons.
Uso: python -m strumenti.oggetti cerca <slug> <nome> "<parole di ricerca>"
     python -m strumenti.oggetti prendi <slug> <nome> <numero> [--intero]
`cerca` scrive un foglio di provini numerati in materiali/oggetti/; `prendi` scarica quello scelto, lo scontorna e aggiorna fonti.json."""
import argparse, functools, html, io, json, os, re, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from motore import VERSIONE
from motore.archivio import VARIABILE_LAVORO, archivio_di_lavoro, leggi_stile
from motore.errori import Errore

REPO = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = f"mango-animation/{VERSIONE}"
MIME_AMMESSI = {"image/jpeg", "image/png", "image/webp", "image/tiff"}


def stile_degli_oggetti():
    return leggi_stile(REPO, os.environ.get(VARIABILE_LAVORO))["oggetti"]


def richiedi(url, stile):
    """I byte di `url`. Un 429 o una rete che non risponde si aspettano (`attese_429`) e si riprova; poi un errore."""
    for attesa in [*stile["attese_429"], None]:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=stile["timeout"]) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise SystemExit(f"Commons ha risposto {e.code} a {url}")
            motivo = "con troppe richieste (429)"
        except (urllib.error.URLError, TimeoutError) as e:
            motivo = f"con un errore di rete ({getattr(e, 'reason', e)})"
        if attesa is None:
            raise SystemExit(f"Commons risponde {motivo} anche dopo {len(stile['attese_429'])} attese ({url}): riprova fra qualche minuto")
        time.sleep(attesa)


def licenza_libera(nome, stile):
    senza_versione = re.sub(r"\s+\d+(\.\d+)*(\s+[a-z]{2,3})?$", "", nome.strip(), flags=re.I)
    return senza_versione.casefold() in {l.casefold() for l in stile["licenze"]}


def senza_tag(testo):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", testo))).strip()


def risultati(risposta, stile):
    """Le foto dell'API con licenza libera, nell'ordine della ricerca, fino a `risultati`."""
    pagine = sorted(json.loads(risposta).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    scelti = []
    for p in pagine:
        info = (p.get("imageinfo") or [{}])[0]
        licenza = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if info.get("mime") not in MIME_AMMESSI or not licenza_libera(licenza, stile):
            continue
        scelti.append({"file": p["title"], "pagina": info["descriptionurl"], "scarico": info["thumburl"],
                       "autore": senza_tag(info["extmetadata"].get("Artist", {}).get("value", "")), "licenza": licenza})
    return scelti[:stile["risultati"]]


def cartella_oggetti(archivio, slug):
    video = Path(archivio) / "video" / slug
    if not video.is_dir():
        raise SystemExit(f"il video «{slug}» non c'è in {Path(archivio) / 'video'}")
    return video / "materiali" / "oggetti"


def foglio(trovati, stile, rete):
    cella, colonne, corpo = stile["cella"], stile["colonne"], stile["corpo_licenza"]
    riga = cella + corpo + 10
    righe = -(-len(trovati) // colonne)
    pagina = Image.new("RGB", (colonne * cella, righe * riga), stile["fondo_provini"])
    d = ImageDraw.Draw(pagina)
    font_numero, font_licenza = ImageFont.load_default(stile["corpo_numero"]), ImageFont.load_default(corpo)
    for n, t in enumerate(trovati, 1):
        x, y = (n - 1) % colonne * cella, (n - 1) // colonne * riga
        foto = ImageOps.exif_transpose(Image.open(io.BytesIO(rete(t["scarico"])))).convert("RGB")
        foto.thumbnail((cella - 8, cella - 8))
        pagina.paste(foto, (x + (cella - foto.width) // 2, y + (cella - foto.height) // 2))
        d.rectangle((x, y, x + stile["corpo_numero"] + 14, y + stile["corpo_numero"] + 8), fill=stile["fondo_provini"])
        d.text((x + 7, y + 2), str(n), fill=stile["testo_provini"], font=font_numero)
        d.text((x + 6, y + cella + 3), t["licenza"], fill=stile["testo_provini"], font=font_licenza)
    return pagina


def cerca(archivio, slug, nome, parole, stile, rete=None):
    rete = rete or functools.partial(richiedi, stile=stile)
    cartella = cartella_oggetti(archivio, slug)
    domanda = urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrsearch": f"{parole} filetype:bitmap", "gsrnamespace": 6,
        "gsrlimit": stile["candidati"], "prop": "imageinfo", "iiprop": "url|mime|extmetadata", "iiurlwidth": stile["lato_scarico"]})
    trovati = risultati(rete(f"{API}?{domanda}"), stile)
    if not trovati:
        raise SystemExit(f"nessuna foto con licenza libera per «{parole}»: prova altre parole")
    cartella.mkdir(parents=True, exist_ok=True)
    immagine = cartella / f"provini-{nome}.jpg"
    foglio(trovati, stile, rete).save(immagine, quality=stile["qualita_provini"])
    elenco = {"ricerca": parole, "risultati": {str(n): t for n, t in enumerate(trovati, 1)}}
    (cartella / f"provini-{nome}.json").write_text(json.dumps(elenco, ensure_ascii=False, indent=1), encoding="utf-8")
    return immagine


def ritaglia(img, stile):
    """L'oggetto stretto, con `margine_ritaglio` pixel di trasparenza intorno."""
    scatola = img.getchannel("A").point(lambda v: 255 if v > stile["soglia_ritaglio"] else 0).getbbox()
    if not scatola:
        raise SystemExit("lo scontorno non ha trovato niente: prova un'altra foto, o `--intero`")
    m = stile["margine_ritaglio"]
    return img.crop((scatola[0] - m, scatola[1] - m, scatola[2] + m, scatola[3] + m))


def prendi(archivio, slug, nome, numero, intero, stile, rete=None, scontorna=None):
    rete = rete or functools.partial(richiedi, stile=stile)
    cartella = cartella_oggetti(archivio, slug)
    provini = cartella / f"provini-{nome}.json"
    if not provini.exists():
        raise SystemExit(f"mancano i provini di «{nome}»: prima `cerca {slug} {nome} \"...\"`")
    elenco = json.loads(provini.read_text(encoding="utf-8"))["risultati"]
    scelto = elenco.get(str(numero))
    if scelto is None:
        raise SystemExit(f"il numero {numero} non c'è: i provini di «{nome}» vanno da 1 a {len(elenco)}")
    foto = ImageOps.exif_transpose(Image.open(io.BytesIO(rete(scelto["scarico"])))).convert("RGB")
    if intero:
        destinazione, altra = cartella / f"{nome}.jpg", cartella / f"{nome}.png"
        foto.save(destinazione, quality=stile["qualita_jpg"])
    else:
        destinazione, altra = cartella / f"{nome}.png", cartella / f"{nome}.jpg"
        ritaglia((scontorna or Scontorno(stile).scontorna)(foto), stile).save(destinazione)
    altra.unlink(missing_ok=True)
    fonti = cartella / "fonti.json"
    tutte = json.loads(fonti.read_text(encoding="utf-8")) if fonti.exists() else {}
    tutte[nome] = {k: scelto[k] for k in ("file", "pagina", "licenza", "autore")}
    fonti.write_text(json.dumps(tutte, ensure_ascii=False, indent=1), encoding="utf-8")
    return destinazione


def isola(dentro, stile):
    """La maschera SAM2 dentro il riquadro (bool) → l'oggetto: se la maschera tocca il bordo del riquadro è lo sfondo e si rovescia; i pezzi
    staccati più piccoli di `area_minima` del più grande si tolgono."""
    import cv2
    import numpy as np

    r = max(1, round(min(dentro.shape) * stile["margine_riquadro"]))
    anello = np.ones(dentro.shape, bool)
    anello[r:-r, r:-r] = False
    if dentro[anello].mean() > stile["soglia_sfondo"]:
        dentro = ~dentro
    n, nomi, misure, _ = cv2.connectedComponentsWithStats(dentro.astype(np.uint8))
    if n < 2:
        raise SystemExit("lo scontorno non ha trovato niente: prova un'altra foto, o `--intero`")
    grandi = [i for i in range(1, n) if misure[i, cv2.CC_STAT_AREA] >= stile["area_minima"] * misure[1:, cv2.CC_STAT_AREA].max()]
    return np.isin(nomi, grandi)


class Scontorno:
    """SAM2 trova l'oggetto (il riquadro è la foto meno un margine), ViTMatte rifà l'alfa nella fascia attorno al bordo. Gli stessi modelli della sagoma."""

    def __init__(self, stile):
        import torch
        from transformers import Sam2Model, Sam2Processor, VitMatteForImageMatting

        from motore.dispositivo import dispositivo
        from motore.scontorno import MATTING, SAM, velocizza_vitmatte

        velocizza_vitmatte()
        torch.set_grad_enabled(False)
        self.torch, self.stile, self.dev = torch, stile, torch.device(dispositivo("sagoma"))
        self.processore = Sam2Processor.from_pretrained(SAM)
        self.sam = Sam2Model.from_pretrained(SAM).to(self.dev).eval()
        self.matting = VitMatteForImageMatting.from_pretrained(MATTING).to(self.dev).eval()

    def maschera(self, foto):
        """L'oggetto per SAM2 sull'immagine PIL (1 dentro, 0 fuori, 1×1×h×w). Con un riquadro che prende quasi tutta la foto SAM2 sceglie spesso lo
        sfondo: `isola` lo capisce e lo rovescia."""
        import numpy as np

        mx, my = round(foto.width * self.stile["margine_riquadro"]), round(foto.height * self.stile["margine_riquadro"])
        riquadro = (mx, my, foto.width - mx, foto.height - my)
        ingresso = self.processore(images=foto, input_boxes=[[list(riquadro)]], return_tensors="pt").to(self.dev)
        uscita = self.sam(**ingresso, multimask_output=False)
        sam = self.processore.post_process_masks(uscita.pred_masks.cpu(), ingresso["original_sizes"])[0][0, 0].numpy()
        oggetto = np.zeros(sam.shape, bool)
        oggetto[riquadro[1]:riquadro[3], riquadro[0]:riquadro[2]] = isola(sam[riquadro[1]:riquadro[3], riquadro[0]:riquadro[2]], self.stile)
        return self.torch.from_numpy(oggetto).float()[None, None].to(self.dev)

    def scontorna(self, foto):
        """Foto RGB → RGBA a grandezza piena."""
        import numpy as np
        from motore.scontorno import MULTIPLO_MATTING, trimap

        torch, F = self.torch, self.torch.nn.functional
        incerta = trimap(self.maschera(foto), self.stile["raggio_trimap"])
        x = torch.from_numpy(np.array(foto)).to(self.dev).permute(2, 0, 1)[None].float() / 255
        h, w = x.shape[2:]
        ingresso = F.pad(torch.cat([(x - 0.5) / 0.5, incerta], 1), (0, -w % MULTIPLO_MATTING, 0, -h % MULTIPLO_MATTING))
        alfa = self.matting(pixel_values=ingresso).alphas[:, :, :h, :w]
        alfa = torch.where(incerta == 0.5, alfa, incerta)
        rgba = np.dstack([np.asarray(foto), (alfa[0, 0].clamp(0, 1) * 255).round().byte().cpu().numpy()])
        return Image.fromarray(rgba, "RGBA")


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    comandi = a.add_subparsers(dest="comando", required=True)
    c = comandi.add_parser("cerca", help="il foglio di provini di una ricerca")
    c.add_argument("slug"), c.add_argument("nome"), c.add_argument("parole")
    p = comandi.add_parser("prendi", help="scarica e scontorna il provino scelto")
    p.add_argument("slug"), p.add_argument("nome"), p.add_argument("numero", type=int)
    p.add_argument("--intero", action="store_true", help="la foto intera in jpg, senza scontorno")
    argomenti = a.parse_args()
    try:
        archivio = archivio_di_lavoro()
    except Errore as e:
        raise SystemExit(str(e))
    stile = stile_degli_oggetti()
    if argomenti.comando == "cerca":
        print(cerca(archivio, argomenti.slug, argomenti.nome, argomenti.parole, stile))
    else:
        inizio = time.time()
        destinazione = prendi(archivio, argomenti.slug, argomenti.nome, argomenti.numero, argomenti.intero, stile)
        print(destinazione, f"({time.time() - inizio:.1f} s)")
