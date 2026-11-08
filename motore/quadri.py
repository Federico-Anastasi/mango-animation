import hashlib
import json
import re
import subprocess

import numpy as np
from PIL import Image, ImageDraw

from .archivio import leggi_json, scrivi_json
from .errori import Errore, dice
from .media import ffmpeg, ffmpeg_su
from .prepara import misura_persona, sagoma_dei_tratti
from .profilo import richiedi
from .sagoma import pezzi_della_sagoma, pezzo_della_sagoma
from .segui import espressione, liscia
from .sorgenti import Sorgente

# Il filtro cambia quando cambia questo numero: i tratti già resi con una versione vecchia non servono più.
VERSIONE = 1
# Fotogrammi di coda tenuti uguali all'ultimo se l'animazione finisce un soffio prima del suo tratto.
CODA_ANIMAZIONE = 2
TIPI_DI_STRATO = ("animazione", "girato", "sagoma", "riquadro", "inserto", "viso")
# Un pezzo di sagoma più corto di così non porta una testa nuova.
PEZZO_MINIMO = 0.01


def esadecimale(rgb):
    return "0x{:02X}{:02X}{:02X}".format(*rgb)


def _tra(x, minimo, massimo):
    return max(minimo, min(massimo, x))


def inquadra(largo, alto, taglio, area, adatta, centro=None, scala=1.0, centro_zoom=None):
    """Quale rettangolo del fotogramma si vede in un'`area` [largo, alto]: ((x, y, w, h) del fotogramma, (w, h) con cui sta nell'area, centro dello zoom nel rettangolo).
    `taglio` è la vista (o il fotogramma intero); `riempi` toglie il di più tenendo il `centro`, `contieni` lascia tutto e centra."""
    aw, ah = area
    x, y, w, h = taglio or (0, 0, largo, alto)
    cx, cy = (centro[0] * largo, centro[1] * alto) if centro else (x + w / 2, y + h / 2)
    if adatta == "riempi":
        nw, nh = (h * aw / ah, h) if w / h > aw / ah else (w, w * ah / aw)
        x, y = _tra(cx - nw / 2, x, x + w - nw), _tra(cy - nh / 2, y, y + h - nh)
        w, h = nw, nh
    fra = ((centro_zoom[0] * largo - x) / w, (centro_zoom[1] * alto - y) / h) if centro_zoom else (0.5, 0.5)
    fra = (_tra(fra[0], 0, 1), _tra(fra[1], 0, 1))
    if scala != 1:
        zw, zh = w / scala, h / scala
        x, y = _tra(x + fra[0] * w - zw / 2, x, x + w - zw), _tra(y + fra[1] * h - zh / 2, y, y + h - zh)
        w, h = zw, zh
        fra = (0.5, 0.5)
    s = min(aw / w, ah / h) if adatta == "contieni" else 1.0
    misure = (aw, ah) if adatta == "riempi" else (round(w * s / 2) * 2, round(h * s / 2) * 2)
    return (round(x), round(y), round(w), round(h)), misure, fra


def maschera(cartella, largo, alto, raggio):
    file = cartella / f"maschera-{largo}x{alto}-{raggio}.png"
    if not file.exists():
        cartella.mkdir(parents=True, exist_ok=True)
        img = Image.new("L", (largo, alto), 0)
        ImageDraw.Draw(img).rounded_rectangle((0, 0, largo - 1, alto - 1), radius=raggio, fill=255)
        img.save(file)
    return file


def rampa(cartella, largo, alto, sfuma):
    """Quanto resta della sagoma, colonna per colonna: tutta, tranne le ultime `sfuma` a destra, dove il bordo dritto del girato
    svanisce in ciò che sta sotto."""
    file = cartella / f"sfuma-{largo}x{alto}-{sfuma}.png"
    if not file.exists():
        cartella.mkdir(parents=True, exist_ok=True)
        r = np.full((alto, largo), 255, dtype=np.uint8)
        r[:, largo - sfuma:] = np.linspace(255, 0, sfuma).round().astype(np.uint8)[None, :]
        Image.fromarray(r, "L").save(file)
    return file


def misura_lufs(sorgente, intervalli):
    """Il volume (LUFS) della voce di una sorgente, misurato solo su ciò che se ne usa."""
    ingressi = [x for da, durata in intervalli for x in ("-ss", f"{da:.4f}", "-t", f"{durata:.4f}", "-i", str(sorgente.percorso))]
    elenco = "".join(f"[{k}:a]" for k in range(len(intervalli)))
    esito = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", *ingressi, "-filter_complex", f"{elenco}concat=n={len(intervalli)}:v=0:a=1,loudnorm=print_format=json", "-f", "null", "-"],
                           capture_output=True, encoding="utf-8", errors="replace")
    trovato = re.search(r'"input_i"\s*:\s*"(-?[\d.]+)"', esito.stderr)
    if esito.returncode != 0 or not trovato:
        raise Errore(f"non riesco a misurare il volume di «{sorgente.nome}» (la voce è muta?): {esito.stderr.strip()[-300:]}",
                     f"I cannot measure the volume of «{sorgente.nome}» (is the voice mute?): {esito.stderr.strip()[-300:]}")
    return float(trovato.group(1))


def _unisci(intervalli):
    uniti = []
    for da, a in sorted(intervalli):
        if uniti and da <= uniti[-1][1]:
            uniti[-1][1] = max(uniti[-1][1], a)
        else:
            uniti.append([da, a])
    return uniti


def _scoperti(voluti, coperti):
    """I pezzi degli intervalli `voluti` che nessuno dei `coperti` ricopre."""
    pezzi = []
    for da, a in voluti:
        dove = da
        for c_da, c_a in coperti:
            if c_a <= dove:
                continue
            if c_da >= a:
                break
            if c_da - dove > PEZZO_MINIMO:
                pezzi.append([dove, c_da])
            dove = max(dove, c_a)
        if a - dove > PEZZO_MINIMO:
            pezzi.append([dove, a])
    return pezzi


def _istante(pezzi, x):
    """L'istante a `x` secondi dall'inizio dei `pezzi` messi uno dopo l'altro."""
    for da, a in pezzi:
        if x <= a - da:
            return da + x
        x -= a - da
    return pezzi[-1][1]


class Compositore:
    """Ogni tratto del risolto diventa un file: il quadro della sua scena composto con gli strati dello stile."""

    def __init__(self, archivio, slug, piano, risolto):
        self.archivio, self.slug, self.piano, self.risolto, self.stile = archivio, slug, piano, risolto, archivio.stile
        self.lavoro = archivio.lavoro(slug)
        self.sorgenti = {}
        self._guadagni, self._cime, self._scale, self._centri, self._teste = {}, {}, {}, {}, {}
        self._foto_animazione = None
        for t in risolto["tratti"]:
            if t["sorgente"]:
                self.sorgente(t["sorgente"])
                self.sorgente(self.sagoma_del_tratto(t)[0])

    def sorgente(self, nome):
        if nome not in self.sorgenti:
            self.sorgenti[nome] = Sorgente(self.archivio, self.slug, nome, self.piano["sorgenti"][nome], self.piano.get("sottotitoli", {}))
        return self.sorgenti[nome]

    def quadro(self, scena):
        nome = self.risolto["scene"][scena]["quadro"]
        quadro = self.stile["quadri"].get(nome)
        if quadro is None:
            raise Errore(f"il quadro «{nome}» non c'è in stile.json: i quadri sono {', '.join(self.stile['quadri'])}",
                         f"the frame «{nome}» is not in stile.json: the frames are {', '.join(self.stile['quadri'])}")
        for strato in quadro["strati"]:
            if strato["tipo"] not in TIPI_DI_STRATO:
                raise Errore(f"il quadro «{nome}» ha uno strato «{strato['tipo']}», che il motore non conosce: gli strati sono {', '.join(TIPI_DI_STRATO)}",
                             f"the frame «{nome}» has a layer «{strato['tipo']}», which the engine does not know: the layers are {', '.join(TIPI_DI_STRATO)}")
        return quadro

    # ------------------------------------------------------------------ misure per sorgente
    def guadagno(self, nome):
        """Di quanti dB alzare una sorgente perché la voce stia a `voce.lufs`, misurato su tutto ciò che se ne usa."""
        if nome not in self._guadagni:
            sorgente = self.sorgente(nome)
            if not sorgente.info["ha_audio"]:
                self._guadagni[nome] = 0.0
                return 0.0
            usi = [(t["da"], t["durata"]) for t in self.risolto["tratti"] if t["sorgente"] == nome]
            file = self.lavoro / "misure.json"
            misure = leggi_json(file, "le misure", "the measurements") if file.exists() else {}
            chiave = hashlib.md5(json.dumps([sorgente.file, sorgente.percorso.stat().st_size, usi]).encode()).hexdigest()[:16]
            if chiave not in misure:
                misure[chiave] = misura_lufs(sorgente, usi)
                scrivi_json(file, misure)
            self._guadagni[nome] = self.stile["voce"]["lufs"] - misure[chiave]
        return self._guadagni[nome]

    def centri(self, nome):
        """Dove tenere il centro di una vista che segue la persona, misura per misura (`segui` di stile.json)."""
        if nome not in self._centri:
            file = self.sorgente(nome).preparati / "persona.json"
            if not file.exists():
                raise Errore(f"la sorgente «{nome}» ha una vista che segue la persona, ma non è stata misurata: lancia `python -m motore monta {self.slug}`, che la misura dei tratti montati",
                             f"the source «{nome}» has a view that follows the person, but it has not been measured: run `python -m motore monta {self.slug}`, which measures it from the edited stretches")
            misure = leggi_json(file, "la persona", "the person")
            self._centri[nome] = (liscia(misure, self.stile["segui"]["morbido"]), misure["misure_al_secondo"])
        return self._centri[nome]

    def cima(self, nome, strato):
        """La riga più alta a cui arriva la testa della sagoma, una per sorgente: `teste.json` tiene gli intervalli già guardati e la cima
        più alta vista, e si guardano solo gli intervalli nuovi, così un taglio non sposta la scala degli altri tratti."""
        if nome not in self._cime:
            sorgente = self.sorgente(nome)
            if not pezzi_della_sagoma(sorgente.preparati):
                raise Errore(f"la sorgente «{nome}» non ha la sagoma: lancia `python -m motore monta {self.slug}`, che la fa dei tratti montati",
                             f"the source «{nome}» has no silhouette: run `python -m motore monta {self.slug}`, which makes it from the edited stretches")
            voluti = _unisci([round(da, 3), round(da + t["durata"], 3)] for t in self.risolto["tratti"] if self.sagoma_di(t["scena"]) for n, da in [self.sagoma_del_tratto(t)] if n == nome)
            cache = self.lavoro / "teste.json"
            teste = leggi_json(cache, "le teste", "the heads") if cache.exists() else {}
            s, visto = {k: v for k, v in self.stile["sagoma"].items() if k != "codifica"}, teste.get(sorgente.file)
            if not visto or visto["sagoma"] != s:
                visto = {"sagoma": s, "intervalli": [], "cima": None, "centri": []}
            nuovi = _scoperti(voluti, visto["intervalli"])
            if nuovi:
                foto, cime, centri = self.lavoro / "alfa.png", [], []
                totale = sum(a - da for da, a in nuovi)
                self.lavoro.mkdir(parents=True, exist_ok=True)
                for n in range(s["campioni"]):
                    istante = _istante(nuovi, totale * (n + 0.5) / s["campioni"])
                    file, nel_file = self.pezzo_sagoma(nome, istante, istante)
                    ffmpeg("-c:v", "libvpx-vp9", "-ss", nel_file, "-i", file, "-frames:v", "1", "-vf", "alphaextract", "-y", foto)
                    alfa = np.asarray(Image.open(foto).convert("L")) > s["alfa"]
                    righe = np.where(alfa.sum(axis=1) > s["riga_minima"])[0]
                    if not len(righe):
                        raise Errore(f"nella sagoma di «{nome}» non si vede nessuno: guarda il girato di quei tratti, poi togli `sagoma.json`, `sagoma.webm` e la cartella `sagoma` da {sorgente.preparati} e rimonta",
                                     f"no one is visible in the silhouette of «{nome}»: look at the footage of those stretches, then remove `sagoma.json`, `sagoma.webm` and the `sagoma` folder from {sorgente.preparati} and edit again")
                    cime.append(int(righe[0]))
                    # Il centro della testa: la media delle colonne piene nella fascia che parte dalla sua cima.
                    centri.append(float(np.where(alfa[righe[0]:righe[0] + s["testa_alta"]])[1].mean()))
                foto.unlink()
                visto = {"sagoma": s, "intervalli": _unisci(visto["intervalli"] + voluti), "cima": min([*cime, *([] if visto["cima"] is None else [visto["cima"]])]),
                         "centri": visto.get("centri", []) + centri}
                teste[sorgente.file] = visto
                scrivi_json(cache, teste)
            self._cime[nome] = visto["cima"]
            self._teste[nome] = float(np.median(visto["centri"]))
        return self._cime[nome]

    def pezzo_sagoma(self, nome, da, a):
        """(file, secondo del file) da cui leggere la sagoma di `nome` per i secondi `da`-`a` della sua ripresa."""
        sorgente = self.sorgente(nome)
        trovato = pezzo_della_sagoma(sorgente.preparati, da, a, self.stile["sagoma"]["margine"])
        if not trovato:
            raise Errore(f"la sagoma di «{nome}» non porta i secondi {da:.2f}-{a:.2f}: lancia `python -m motore monta {self.slug}`, che la fa dei tratti montati",
                         f"the silhouette of «{nome}» does not cover seconds {da:.2f}-{a:.2f}: run `python -m motore monta {self.slug}`, which makes it from the edited stretches")
        return trovato

    def centro_testa(self, nome, strato):
        """La colonna del centro della testa nella sagoma, una per sorgente come la cima: la testa non salta fra un taglio e l'altro."""
        self.cima(nome, strato)
        return self._teste[nome]

    def sagome(self, avanza=print):
        """Lo scontorno dei soli tratti che il montaggio mette in sagoma, sorgente per sorgente, e dove sta la persona nei soli tratti che la seguono: mai la ripresa intera."""
        usi = {}
        for t in self.risolto["tratti"]:
            if self.sagoma_di(t["scena"]):
                nome, da = self.sagoma_del_tratto(t)
                usi.setdefault(nome, []).append((da, da + t["durata"]))
        for nome, tratti in usi.items():
            sorgente = self.sorgente(nome)
            sagoma_dei_tratti(sorgente.percorso, sorgente.preparati, tratti, self.stile, avanza)
        self.persone(avanza)

    def immagine_del_tratto(self, t):
        """(sorgente, da, passo): quale ripresa mostra lo strato `girato` di un tratto, da che secondo e a che passo corre (0: un fotogramma fermo)."""
        altro = t.get("girato")
        if altro:
            return altro["sorgente"], altro.get("fermo", altro.get("da")), 0 if "fermo" in altro else altro["passo"]
        immagine = t.get("immagine") or {"da": t["da"], "passo": 1}
        return t["sorgente"], immagine["da"], immagine["passo"]

    def persone(self, avanza=print):
        """Dove sta la testa nei soli tratti che stanno in una vista che segue la persona (`segui`): ogni tratto allargato di tre volte `segui.morbido`, perché la
        levigatura ai bordi non senta il vuoto accanto."""
        margine, usi = 3 * self.stile["segui"]["morbido"], {}
        for t in self.risolto["tratti"]:
            if not t["vista"] or not any(s["tipo"] == "girato" for s in self.quadro(t["scena"])["strati"]):
                continue
            nome, da, passo = self.immagine_del_tratto(t)
            if self.sorgente(nome).spec.get("viste", {}).get(t["vista"], {}).get("segui"):
                usi.setdefault(nome, []).append([max(0.0, round(da - margine, 3)), round(da + t["durata"] * passo + margine, 3)])
        for nome, voluti in usi.items():
            sorgente = self.sorgente(nome)
            file = sorgente.preparati / "persona.json"
            fatti = leggi_json(file, "la persona", "the person").get("misurati", []) if file.exists() else []
            mancanti = _scoperti(_unisci(voluti), fatti)
            if mancanti:
                richiedi("segui", f"una vista segue la persona in {sorgente.file}", f"a view follows the person in {sorgente.file}")
                avanza(dice(f"{sorgente.file}: dove sta la persona, {sum(a - da for da, a in mancanti):.0f} s", f"{sorgente.file}: where the person is, {sum(a - da for da, a in mancanti):.0f} s"))
                misura_persona(sorgente.percorso, file, mancanti, self.stile)

    def sagoma_di(self, scena):
        return next((s for s in self.quadro(scena)["strati"] if s["tipo"] == "sagoma"), None)

    def sagoma_del_tratto(self, t):
        """(sorgente, secondo) da cui viene la sagoma di un tratto: la sua ripresa, o l'altra che il pezzo dichiara in `sagoma`."""
        altrove = t.get("sagoma")
        return (altrove["sorgente"], altrove["da"]) if altrove else (t["sorgente"], t["da"])

    def sagoma(self, strato):
        """Le misure della sagoma: la scala è una per video, la più piccola per cui il girato, da sopra la testa, arriva al fondo."""
        chiave = json.dumps(strato, sort_keys=True)
        if chiave not in self._scale:
            L, A = self.stile["formato"]["largo"], self.stile["formato"]["alto"]
            nomi = {self.sagoma_del_tratto(t)[0] for t in self.risolto["tratti"] if self.sagoma_di(t["scena"]) == strato}
            scale = [(A - strato["testa"]) / (A - max(0, self.cima(n, strato) - strato["aria"]) - strato["aria"]) + strato["scala_margine"] for n in nomi]
            if strato["x"] == "testa":
                # Con la testa al centro la sagoma si sposta di lato: si ingrandisce quanto basta perché copra ancora tutta la larghezza.
                scale += [L / (2 * min(c, L - c)) + strato["scala_margine"] for c in (self.centro_testa(n, strato) for n in nomi)]
            self._scale[chiave] = max(strato["scala_minima"], *scale)
        return self._scale[chiave]

    def geometria_sagoma(self, nome, strato):
        L, A = self.stile["formato"]["largo"], self.stile["formato"]["alto"]
        s = self.sagoma(strato)
        taglio, y = max(0, self.cima(nome, strato) - strato["aria"]), round(strato["testa"] - strato["aria"] * s)
        righe = min(A - taglio, round((A - y) / s) + 2)
        x = round(L / 2 - self.centro_testa(nome, strato) * s) if strato["x"] == "testa" else strato["x"]
        return {"taglio": taglio, "y": y, "x": x, "righe": righe, "largo": round(L * s / 2) * 2, "alto": round(righe * s / 2) * 2}

    # ------------------------------------------------------------------ un tratto
    def tratto(self, k):
        """Il tratto `k` del risolto reso in `lavoro/tratti/`, video e suono non compresso; se c'è già con gli stessi ingredienti non si rifà."""
        uscita = self.file_tratto(k, "mkv")
        if uscita.exists():
            return uscita
        uscita.parent.mkdir(parents=True, exist_ok=True)
        ingressi, filtri, audio, _ = self._del_tratto(k)
        self._codifica_tratto(k, ingressi, ";".join([*filtri, audio]), uscita, self.risolto["tratti"][k]["durata"])
        return uscita

    def fotogramma(self, k, istante, animazione=None, uscita=None):
        """Il fotogramma del tratto `k` all'`istante` (secondi del video) col solo quadro, senza sottotitoli né titolo: ffmpeg legge il tratto fino a lì e si ferma, non lo scrive.
        L'animazione è il suo fotogramma `animazione` (un'immagine) al posto del file della scena; torna l'immagine."""
        t = self.risolto["tratti"][k]
        n = round((istante - t["esce"]) * self.risolto["formato"]["fps"])
        self._foto_animazione = animazione
        try:
            ingressi, filtri, _, _ = self._del_tratto(k)
        finally:
            self._foto_animazione = None
        ffmpeg(*[x for i in ingressi for x in i], "-filter_complex", ";".join([*filtri, f"[v]select='eq(n\\,{n})'[f]"]), "-map", "[f]", "-frames:v", "1", "-y", uscita)
        return Image.open(uscita).convert("RGB")

    def _codifica_tratto(self, k, ingressi, grafo, uscita, durata):
        ffmpeg_su(uscita, *[x for i in ingressi for x in i], "-filter_complex", grafo, "-map", "[v]", "-map", "[a]", "-t", f"{durata:.4f}", "-r", self.risolto["formato"]["fps"],
                  "-c:v", "libx264", "-crf", self.stile["uscita"]["crf_tratti"], "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-ar", self.stile["voce"]["campioni_audio"])

    def file_tratto(self, k, estensione):
        ingressi, filtri, audio, ingredienti = self._del_tratto(k)
        impronta = hashlib.md5(json.dumps([VERSIONE, ";".join([*filtri, audio]), [list(map(str, i)) for i in ingressi], ingredienti], sort_keys=True, default=str).encode()).hexdigest()[:12]
        return self.lavoro / "tratti" / f"{impronta}.{estensione}"

    def _del_tratto(self, k):
        t = self.risolto["tratti"][k]
        return self._grafo(k, t, self.risolto["scene"][t["scena"]], self.quadro(t["scena"]), self.sorgente(t["sorgente"]) if t["sorgente"] else None)

    def tratto_audio(self, k):
        """Solo il suono del tratto `k`, non compresso, in `lavoro/tratti/`: per montare senza tenere i tratti interi su disco."""
        uscita = self.file_tratto(k, "wav")
        if uscita.exists():
            return uscita
        uscita.parent.mkdir(parents=True, exist_ok=True)
        ingressi, _, audio, _ = self._del_tratto(k)
        voce = ingressi[0] if self.risolto["tratti"][k]["sorgente"] else []
        ffmpeg_su(uscita, *voce, "-filter_complex", audio, "-map", "[a]", "-t", f"{self.risolto['tratti'][k]['durata']:.4f}", "-c:a", "pcm_s16le", "-ar", self.stile["voce"]["campioni_audio"])
        return uscita

    def comando_video(self, k):
        """Il comando di ffmpeg che compone i fotogrammi del tratto `k` e li scrive RGB grezzi su stdout, senza passare dal disco."""
        ingressi, filtri, _, _ = self._del_tratto(k)
        return ["ffmpeg", "-v", "error", "-nostdin", *map(str, (x for i in ingressi for x in i)), "-filter_complex", ";".join(filtri), "-map", "[v]", "-t", f"{self.risolto['tratti'][k]['durata']:.4f}",
                "-r", str(self.risolto["formato"]["fps"]), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]

    def stima_mb(self):
        """Quanto occuperebbero tutti i tratti su disco: se ne codificano i primi secondi di tre tratti sparsi nel video e si moltiplica."""
        s, tratti = self.stile["uscita"]["campione"], self.risolto["tratti"]
        scelti = sorted({next(k for k, t in enumerate(tratti) if t["esce"] + t["durata"] >= self.risolto["durata"] * frazione) for frazione in (0.2, 0.5, 0.8)})
        prova = self.lavoro / "tratti" / ".campione.mkv"
        prova.parent.mkdir(parents=True, exist_ok=True)
        byte, secondi = 0, 0.0
        for k in scelti:
            durata = min(tratti[k]["durata"], s)
            ingressi, filtri, audio, _ = self._del_tratto(k)
            self._codifica_tratto(k, ingressi, ";".join([*filtri, audio]), prova, durata)
            byte, secondi = byte + prova.stat().st_size, secondi + durata
        prova.unlink()
        return byte / 1e6 / secondi * self.risolto["durata"]

    def _grafo(self, k, t, scena, quadro, sorgente):
        stile = self.stile
        L, A, fps = (self.risolto["formato"][c] for c in ("largo", "alto", "fps"))
        durata = t["durata"]
        # Un tratto senza voce (pezzo con `durata`) non legge nessuna sorgente: solo l'animazione, e il silenzio.
        ingressi = [["-ss", f"{t['da']:.4f}", "-t", f"{durata:.4f}", "-i", sorgente.percorso]] if sorgente else []
        ingredienti = {"file": [self._impronta_file(sorgente.percorso)] if sorgente else []}
        # Ciò che lo strato `girato` mostra: la ripresa del tratto, o un'altra (`girato` del pezzo), ferma o che scorre.
        altro = t.get("girato")
        visto = self.sorgente(altro["sorgente"]) if altro else sorgente
        vista = visto.spec.get("viste", {}).get(t["vista"]) if t["vista"] else None
        if t["vista"] and vista is None:
            raise Errore(f"la vista «{t['vista']}» non c'è nella sorgente «{visto.nome}»: ci sono {', '.join(visto.spec.get('viste', {})) or 'nessuna'}",
                         f"the view «{t['vista']}» is not in the source «{visto.nome}»: there are {', '.join(visto.spec.get('viste', {})) or 'none'}")

        def ingresso(*argomenti, file=None):
            ingressi.append(list(argomenti))
            if file is not None:
                ingredienti["file"].append(self._impronta_file(file))
            return len(ingressi) - 1

        consumatori = sum(1 for s in quadro["strati"] if s["tipo"] in ("girato", "riquadro") or (s["tipo"] == "inserto" and vista and "inserto" in vista)
                          or (s["tipo"] == "viso" and s["nome"] in visto.spec.get("riquadri", {})))
        # Il fondo con la stessa conversione di colore delle animazioni (bt709), o dove si toccano si vede una riga.
        filtri = [f"color=c={esadecimale(self.archivio.colore(quadro['fondo']))}:s={L}x{A}:r={fps},format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[b0]"]
        if consumatori:
            immagine = t.get("immagine")
            video = f"[0:v]fps={fps}:start_time=0"
            if altro and "fermo" in altro:
                # Su una foto JPEG anche «-ss 0» fa perdere a ffmpeg l'unico fotogramma.
                salto = ["-ss", f"{altro['fermo']:.4f}"] if altro["fermo"] else []
                i = ingresso(*salto, "-t", "1", "-an", "-i", visto.percorso, file=visto.percorso)
                video = f"[{i}:v]trim=end_frame=1,setpts=PTS-STARTPTS,fps={fps},tpad=stop_mode=clone:stop_duration={durata + 1 / fps:.4f}"
            elif altro:
                i = ingresso("-ss", f"{altro['da']:.4f}", "-t", f"{durata * altro['passo'] + 1 / fps:.4f}", "-an", "-i", visto.percorso, file=visto.percorso)
                video = f"[{i}:v]setpts=(PTS-STARTPTS)/{altro['passo']},fps={fps},tpad=stop_mode=clone:stop_duration={CODA_ANIMAZIONE}"
            elif immagine:
                i = ingresso("-ss", f"{immagine['da']:.4f}", "-t", f"{durata * immagine['passo'] + 1 / fps:.4f}", "-an", "-i", sorgente.percorso)
                video = f"[{i}:v]setpts=(PTS-STARTPTS)/{immagine['passo']},fps={fps},tpad=stop_mode=clone:stop_duration={CODA_ANIMAZIONE}"
            filtri.append(f"{video},setsar=1," + (f"split={consumatori}" + "".join(f"[v{n}]" for n in range(consumatori)) if consumatori > 1 else "null[v0]"))
        corrente, usate, girato = "b0", 0, None
        for n, strato in enumerate(quadro["strati"], 1):
            tipo = strato["tipo"]
            dove = f"b{n}"
            if tipo == "animazione":
                if not scena["animazione"]:
                    raise Errore(f"la scena «{scena['nome']}» usa il quadro «{scena['quadro']}», che mostra un'animazione, ma non ne dichiara una (`animazione`)",
                                 f"the scene «{scena['nome']}» uses the frame «{scena['quadro']}», which shows an animation, but it declares none (`animazione`)")
                file = self.lavoro / "scene" / f"{scena['animazione']}.mp4"
                if not file.exists() and not self._foto_animazione:
                    raise Errore(f"l'animazione «{scena['animazione']}» non è stata resa: lancia `python -m motore monta {self.slug}`",
                                 f"the animation «{scena['animazione']}» has not been rendered: run `python -m motore monta {self.slug}`")
                # Mezzo fotogramma prima: l'istante arrotondato non deve cadere dopo il fotogramma che gli spetta, o il primo resta senza animazione.
                inizio = f"{max(0.0, t['esce'] - scena['inizio'] - 0.5 / fps):.4f}"
                if self._foto_animazione:
                    i = ingresso("-loop", "1", "-i", self._foto_animazione, file=self._foto_animazione)
                else:
                    i = ingresso("-ss", inizio, "-t", f"{durata:.4f}", "-i", file, file=file)
                x, y, w, h = strato["area"]
                if "ritaglio" in strato:
                    rx, ry, fw, fh = strato["ritaglio"]
                    scala = f",crop={fw}:{fh}:{rx}:{ry}"
                else:
                    _, (fw, fh), _ = inquadra(L, A, None, (w, h), "contieni")
                    scala = "" if (fw, fh) == (L, A) else f",scale={fw}:{fh}:flags=lanczos"
                passo = f"fps={fps}:start_time=0,tpad=stop_mode=clone:stop_duration={CODA_ANIMAZIONE},setsar=1"
                filtri.append(f"[{i}:v]{passo}{scala}[a{n}]")
                animazione = f"a{n}"
                # Una scena trasparente ha accanto la sua maschera: fuori da ciò che disegna resta visibile lo strato sotto.
                alfa = file.with_name(f"{scena['animazione']}.alfa.mkv")
                if alfa.exists():
                    m = ingresso("-ss", inizio, "-t", f"{durata:.4f}", "-i", alfa, file=alfa)
                    filtri += [f"[{m}:v]{passo},format=gray{scala}[ma{n}]", f"[a{n}]format=yuva420p[ac{n}]", f"[ac{n}][ma{n}]alphamerge[at{n}]"]
                    animazione = f"at{n}"
                filtri.append(f"[{corrente}][{animazione}]overlay={x + (w - fw) // 2}:{y + (h - fh) // 2}[{dove}]")
            elif tipo == "girato":
                filtri += self._girato(t, strato, vista, visto, f"v{usate}", f"g{n}", corrente, dove, k)
                usate += 1
                girato = strato
            elif tipo == "inserto":
                if not (vista and "inserto" in vista):
                    continue
                if girato is None:
                    raise Errore(f"il quadro «{scena['quadro']}» ha un `inserto` ma nessuno strato `girato` sotto: l'inserto sta nell'angolo del girato",
                                 f"the frame «{scena['quadro']}» has an `inserto` but no `girato` layer below: the inset sits in the corner of the footage")
                ix, iy, il, ia = vista["inserto"]
                gx, gy = girato["area"][:2]
                filtri += [f"[v{usate}]crop={il}:{ia}:{ix}:{iy},scale={strato['largo']}:-2:flags=lanczos[i{n}]", f"[{corrente}][i{n}]overlay={gx + strato['bordo']}:{gy + strato['bordo']}[{dove}]"]
                usate += 1
            elif tipo == "riquadro":
                r = visto.spec.get("riquadri", {}).get(strato["nome"])
                if r is None:
                    raise Errore(f"la sorgente «{t['sorgente']}» non ha il riquadro «{strato['nome']}», che il quadro «{scena['quadro']}» mostra: dichiaralo in `riquadri` della sorgente",
                                 f"the source «{t['sorgente']}» has no box «{strato['nome']}», which the frame «{scena['quadro']}» shows: declare it in `riquadri` of the source")
                rx, ry, rw, rh = r
                vw, vh = round(rw * strato["scala"]), round(rh * strato["scala"])
                m = ingresso("-loop", "1", "-i", maschera(self.lavoro / "maschere", vw, vh, strato["raggio"]))
                filtri += [f"[v{usate}]crop={rw}:{rh}:{rx}:{ry},scale={vw}:{vh}:flags=lanczos,format=rgba[w{n}]", f"[{m}:v]format=gray[m{n}]", f"[w{n}][m{n}]alphamerge[r{n}]",
                           f"[{corrente}][r{n}]overlay={(L - vw) // 2}:{strato['y']}[{dove}]"]
                usate += 1
            elif tipo == "viso":
                r, altra = visto.spec.get("riquadri", {}).get(strato["nome"]), sorgente.spec.get("viso")
                if r is not None:
                    rx, ry, rw, rh = r
                    entrata, taglio = f"v{usate}", f"crop={rw}:{rh}:{rx}:{ry},"
                    usate += 1
                elif altra:
                    compagno = self.sorgente(altra["sorgente"])
                    i = ingresso("-ss", f"{max(0.0, t['da'] + altra.get('scarto', 0.0)):.4f}", "-t", f"{durata:.4f}", "-i", compagno.percorso, file=compagno.percorso)
                    rw, rh = compagno.info["largo"], compagno.info["alto"]
                    filtri.append(f"[{i}:v]fps={fps}:start_time=0,setsar=1[c{n}]")
                    entrata, taglio = f"c{n}", ""
                else:
                    raise Errore(f"la sorgente «{t['sorgente']}» non ha il viso «{strato['nome']}», che il quadro «{scena['quadro']}» mostra: dichiaralo in `riquadri` o in `viso` della sorgente",
                                 f"the source «{t['sorgente']}» has no face «{strato['nome']}», which the frame «{scena['quadro']}» shows: declare it in `riquadri` or in `viso` of the source")
                vw = strato["largo"]
                vh = round(rh * vw / rw / 2) * 2
                m = ingresso("-loop", "1", "-i", maschera(self.lavoro / "maschere", vw, vh, strato["raggio"]))
                ox = strato["margine"] if "sinistra" in strato["angolo"] else L - vw - strato["margine"]
                oy = strato["margine"] if "alto" in strato["angolo"] else A - vh - strato["margine"]
                filtri += [f"[{entrata}]{taglio}scale={vw}:{vh}:flags=lanczos,format=rgba[w{n}]", f"[{m}:v]format=gray[m{n}]", f"[w{n}][m{n}]alphamerge[r{n}]", f"[{corrente}][r{n}]overlay={ox}:{oy}[{dove}]"]
            else:
                nome, da = self.sagoma_del_tratto(t)
                g = self.geometria_sagoma(nome, strato)
                file, nel_file = self.pezzo_sagoma(nome, da, da + durata)
                i = ingresso("-c:v", "libvpx-vp9", "-ss", f"{nel_file:.4f}", "-t", f"{durata:.4f}", "-i", file, file=file)
                m = ingresso("-loop", "1", "-i", rampa(self.lavoro / "maschere", g["largo"], g["alto"], strato["sfuma"]))
                filtri += [f"[{i}:v]fps={fps}:start_time=0,crop={L}:{g['righe']}:0:{g['taglio']},scale={g['largo']}:{g['alto']}:flags=lanczos,format=yuva420p,split[s{n}][q{n}]",
                           f"[q{n}]alphaextract[al{n}]", f"[{m}:v]format=gray[m{n}]", f"[al{n}][m{n}]blend=all_mode=multiply:shortest=1[am{n}]", f"[s{n}][am{n}]alphamerge[sm{n}]",
                           f"[{corrente}][sm{n}]overlay={g['x']}:{g['y']}:eof_action=pass[{dove}]"]
            corrente = dove
        filtri.append(f"[{corrente}]format=yuv420p[v]")
        v = stile["voce"]
        if sorgente and sorgente.info["ha_audio"]:
            filtri.append(f"[0:a]highpass=f={v['taglio_basso']},volume={self.guadagno(t['sorgente']):.1f}dB,afade=t=in:d={v['entra']},afade=t=out:st={durata - v['esce']:.4f}:d={v['esce']},"
                          f"aresample={v['campioni_audio']}:first_pts=0,aformat=channel_layouts=stereo,apad[a]")
        else:
            filtri.append(f"anullsrc=r={v['campioni_audio']}:cl=stereo,atrim=duration={durata:.4f}[a]")
        # Sottotitoli e titolo si mettono sul video intero: non fanno parte del tratto.
        ingredienti["quadro"] = {k: v for k, v in quadro.items() if k not in ("sottotitoli", "titolo")}
        ingredienti["zoom"] = [t["zoom"], t["vista"], vista, self._tempo_nel_pezzo(k), t.get("evidenzia")]
        return ingressi, filtri[:-1], filtri[-1], ingredienti

    def _impronta_file(self, file):
        stat = file.stat()
        return [str(file), stat.st_size, stat.st_mtime_ns]

    def _tempo_nel_pezzo(self, k):
        """Dove sta il tratto `k` dentro il suo pezzo: (secondi dall'inizio del pezzo, durata del pezzo), per lo zoom che cresce."""
        t = self.risolto["tratti"][k]
        suoi = [p for p in self.risolto["tratti"] if p["scena"] == t["scena"] and p["pezzo"] == t["pezzo"]]
        return round(t["esce"] - suoi[0]["esce"], 4), round(suoi[-1]["esce"] + suoi[-1]["durata"] - suoi[0]["esce"], 4)

    def _girato(self, t, strato, vista, sorgente, entrata, nome, corrente, dove, k):
        fps = self.stile["formato"]["fps"]
        taglio = vista["taglio"] if vista else None
        adatta = strato.get("adatta", "contieni" if taglio else "riempi")
        zoom = t["zoom"] or {}
        x, y, w, h = strato["area"]
        info = sorgente.info
        rect, (fw, fh), fra = inquadra(info["largo"], info["alto"], taglio, (w, h), adatta, strato.get("centro"), zoom.get("scala", 1.0), zoom.get("centro"))
        rx, ry, rw, rh = rect
        taglia = f"crop={rw}:{rh}:{rx}:{ry}"
        if vista and vista.get("segui"):
            centro, misure = self.centri(sorgente.nome)
            altro = t.get("girato")
            _, da, passo = self.immagine_del_tratto(t)
            segue = espressione(centro, misure, da, passo, t["durata"], info["largo"], taglio[2], rx - taglio[0])
            taglia = f"crop={rw}:{rh}:'{segue}':{ry}"
        if t.get("evidenzia"):
            e, (ex, ey, el, ea) = self.stile["evidenzia"], t["evidenzia"]
            taglia = f"drawbox=x={ex}:y={ey}:w={el}:h={ea}:color={esadecimale(self.archivio.colore(e['colore']))}:t={e['spessore']}," + taglia
        if "da" in zoom:
            sov = self.stile["zoom"]["sovracampionamento"]
            t0, dur = self._tempo_nel_pezzo(k)
            z = f"{zoom['da']}+({zoom['a']}-{zoom['da']})*min(1,({t0}+on/{fps})/{dur})"
            catena = (f"{taglia},scale={fw * sov}:{fh * sov}:flags=lanczos,zoompan=z='{z}':x='iw*{fra[0]:.5f}-iw/zoom/2':y='ih*{fra[1]:.5f}-ih/zoom/2':d=1:s={fw}x{fh}:fps={fps},"
                      f"setpts=PTS-STARTPTS")
        else:
            catena = f"{taglia},scale={fw}:{fh}:flags=lanczos"
        return [f"[{entrata}]{catena}[{nome}]", f"[{corrente}][{nome}]overlay={x + (w - fw) // 2}:{y + (h - fh) // 2}[{dove}]"]
