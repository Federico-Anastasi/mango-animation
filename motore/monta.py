import datetime
import math
import os
import re
import subprocess
import time

import numpy as np
from PIL import Image

from . import animazioni, copertina
from .archivio import leggi_json, scrivi_con, scrivi_json
from .errori import Errore, dice
from .media import ffmpeg, in_parallelo, info
from .profilo import attiva
from .pulizia import voce_pulita
from .quadri import Compositore
from .risolvi import file_del_suono, impronta_su_disco, risolvi
from .sottotitoli import cartelli_del_titolo, cartello, posto, scheda_cartello


def orario(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def scrivi_srt(file, battute):
    testo = "".join(f"{n}\n{orario(b['da'])} --> {orario(b['a'])}\n{b['testo'].replace('*', '')}\n\n" for n, b in enumerate(battute, 1))
    scrivi_con(file, lambda dest: dest.write_text(testo, encoding="utf-8"))


def scrivi_capitoli(file, capitoli):
    """I capitoli come li legge YouTube in descrizione: `0:00 Titolo`, con le ore dal primo capitolo oltre l'ora."""
    if not capitoli:
        file.unlink(missing_ok=True)
        return

    def minuto(s):
        s = int(s)
        return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"

    scrivi_con(file, lambda dest: dest.write_text("".join(f"{minuto(c['da'])} {c['titolo']}\n" for c in capitoli), encoding="utf-8"))


def _scena_a(risolto, t):
    """La scena del secondo `t` del video. Con mezzo fotogramma di tolleranza: una battuta che comincia proprio sul cambio di scena ha
    l'inizio arrotondato al millesimo (41,833 contro 41,8333) e non deve finire nella scena prima, col posto dei sottotitoli di quella."""
    mezzo = 0.5 / risolto["formato"]["fps"]
    return next((n for n, s in enumerate(risolto["scene"]) if t + mezzo < s["inizio"] + s["durata"]), len(risolto["scene"]) - 1)


def sopra(archivio, comp, risolto, piano):
    """Ciò che va sopra il montato, fotogramma per fotogramma: i sottotitoli e il titolo come immagini (immagine, x, y) per ogni fotogramma."""
    stile, risolto_fps = archivio.stile, risolto["formato"]["fps"]
    quadri_fotogrammi = round(risolto["durata"] * risolto_fps)
    sotto = np.full(quadri_fotogrammi, -1, dtype=np.int32)
    immagini = []
    carattere = archivio.font(stile["sottotitoli"]["carattere"])
    modo = piano.get("sottotitoli", {}).get("modo", stile["sottotitoli"]["modo"])
    rilievo = stile["sottotitoli"]["rilievo"]
    for b in risolto["battute"] if modo != "nessuno" else []:
        spec = comp.quadro(_scena_a(risolto, b["da"]))["sottotitoli"]
        if b.get("rilievo"):
            spec = {**spec, "corpo": rilievo["corpo"], "colore": rilievo["colore"]}
        scheda = scheda_cartello(stile, "sottotitoli", archivio.colore, spec)
        pieno = cartello(b["testo"], scheda, carattere)[1]
        x, y = posto(spec, pieno)
        if b.get("rilievo"):
            # La parola in rilievo salta quando viene detta: un arco verso l'alto, un fotogramma alla volta, poi si posa.
            img, passi = cartello(b["testo"], scheda, carattere)[0], max(1, round(rilievo["salto_durata"] * risolto_fps))
            pezzi = [(b["da"] + k / risolto_fps, b["da"] + (k + 1) / risolto_fps, img, y - round(rilievo["salto"] * math.sin(math.pi * (k + 0.5) / passi)))
                     for k in range(passi)] + [(b["da"] + passi / risolto_fps, b["a"], img, y)]
        elif modo == "parola per parola":
            tempi = [*zip(b["istanti"], [*b["istanti"][1:], b["a"]])]
            pezzi = [(da, a, cartello(b["testo"], scheda, carattere, n + 1)[0], y) for n, (da, a) in enumerate(tempi)]
        else:
            pezzi = [(b["da"], b["a"], cartello(b["testo"], scheda, carattere)[0], y)]
        for da, a, img, quota in pezzi:
            immagini.append((img, x, quota))
            primo, ultimo = np.ceil(da * risolto_fps - 0.5), np.ceil(a * risolto_fps - 0.5)
            sotto[int(max(0, primo)):int(max(0, ultimo))] = len(immagini) - 1
    titolo = np.full(quadri_fotogrammi, -1, dtype=np.int32)
    titoli = []
    if risolto["titolo"]:
        t = risolto["titolo"]
        for n, scena in enumerate(risolto["scene"]):
            titoli.append(cartelli_del_titolo(stile, archivio.colore, archivio.font(stile["titolo"]["carattere"]), comp.quadro(n)["titolo"], t))
            primo, ultimo = max(int(np.ceil(scena["inizio"] * risolto_fps - 0.5)), int(np.ceil(t["da"] * risolto_fps - 0.5))), min(int(np.ceil((scena["inizio"] + scena["durata"]) * risolto_fps - 0.5)), int(np.ceil(t["a"] * risolto_fps - 0.5)))
            titolo[primo:max(primo, ultimo)] = n
    return sotto, immagini, titolo, titoli


def _fotogrammi(comandi, passo, attesi):
    """I fotogrammi grezzi di una serie di comandi di ffmpeg, uno dopo l'altro; `attesi` dice quanti ne deve dare ciascuno."""
    for comando, quanti in zip(comandi, attesi):
        lettore = subprocess.Popen(comando, stdout=subprocess.PIPE)
        contati = 0
        try:
            while len(dati := lettore.stdout.read(passo)) == passo:
                contati += 1
                yield dati
        finally:
            lettore.stdout.close()
            if lettore.poll() is None and contati < quanti:
                lettore.terminate()
            lettore.wait()
        if contati != quanti:
            raise Errore(f"un tratto ha dato {contati} fotogrammi invece di {quanti}: guarda l'errore di ffmpeg qui sopra",
                         f"a stretch gave {contati} frames instead of {quanti}: look at the ffmpeg error above")


class Fasi:
    """I tempi delle fasi di un lavoro, i tratti dei due ultimi montaggi e il piano (l'impronta del risolto) da cui viene ogni uscita, in `lavoro/montaggio.json`:
    monta ricomincia le fasi, controlla e copertina aggiungono le loro se il piano è quello del montaggio."""

    def __init__(self, archivio, slug, impronta, avanza, da_capo=False):
        self.file, self.impronta, self.avanza = archivio.lavoro(slug) / "montaggio.json", impronta, avanza
        scritto = leggi_json(self.file, "i tempi del montaggio", "the timing of the edit") if self.file.exists() else {}
        self.fasi = {f["nome"]: f for f in scritto["fasi"]} if not da_capo and scritto.get("impronta") == impronta else {}
        self.tratti, self.tratti_prima = scritto.get("tratti", []), scritto.get("tratti_prima", [])
        self.uscite = scritto.get("uscite", {})

    def segna(self, nome, da, fatti, saltati=0):
        """`da` è l'istante (`time.perf_counter()`) in cui la fase è cominciata."""
        fase = self.fasi[nome] = {"nome": nome, "secondi": round(time.perf_counter() - da, 2), "fatti": fatti, "saltati": saltati}
        quando = datetime.datetime.now().isoformat(timespec="seconds")
        dati = {"impronta": self.impronta, "quando": quando, "fasi": [*self.fasi.values()], "tratti": self.tratti, "tratti_prima": self.tratti_prima, "uscite": self.uscite}
        scrivi_json(self.file, dati, indent=1)
        self.avanza(dice(f"fase {nome}: {fase['secondi']:.1f} s, fatti {fatti}, saltati {saltati}", f"phase {nome}: {fase['secondi']:.1f} s, done {fatti}, skipped {saltati}"))

    def tratti_del_montaggio(self, nomi):
        """I file di `lavoro/tratti/` di questo montaggio; quelli del montaggio con un altro piano passano a «prima», se il piano è lo stesso «prima» resta com'è."""
        nuovi = sorted(set(nomi))
        if nuovi != self.tratti:
            self.tratti_prima = self.tratti
        self.tratti = nuovi


def _date(file_per_nome):
    return {nome: file.stat().st_mtime_ns if file.exists() else None for nome, file in file_per_nome.items()}


def _rifatti(prima, dopo):
    return sum(dopo[nome] != data for nome, data in prima.items())


def _una_volta(funzione, file, avanza, cosa):
    """Compone in parallelo ogni file una volta sola: due lavori sullo stesso nome si pesterebbero il file provvisorio."""
    primi = {}
    for k, f in enumerate(file):
        primi.setdefault(f, k)
    for n, _ in enumerate(in_parallelo(funzione, primi.values()), 1):
        avanza(f"{cosa} {n}/{len(primi)}")


def _ripulisci(lavoro, tratti_tenuti, sigle):
    """Toglie da `lavoro/` ciò che nessun montaggio recente usa: tratti di altri piani, avanzi di lavori interrotti, scene di sigle non più nel piano. Torna i file che non è riuscito a togliere."""
    da_togliere = [f for f in (lavoro / "tratti").glob("*") if f.name not in tratti_tenuti]
    for f in (lavoro / "scene").glob("*"):
        trovata = re.fullmatch(r"(.+?)\.(?:mp4(?:\.impronta)?|alfa\.mkv)", f.name)
        if trovata and trovata.group(1) not in sigle:
            da_togliere.append(f)
    rimasti = []
    for f in da_togliere:
        try:
            f.unlink(missing_ok=True)
        except OSError:
            rimasti.append(f)
    return rimasti


def _peso_mb(cartella):
    return sum(f.stat().st_size for f in cartella.rglob("*") if f.is_file()) / 1e6


GIRI = 3


class _PianoCambiato(Exception):
    pass


def monta(archivio, slug, avanza=print):
    """Monta il video; se il piano o lo stile cambiano sul disco mentre monta, riparte con quelli nuovi, al più `GIRI` volte in tutto."""
    for giro in range(1, GIRI + 1):
        try:
            return _monta(archivio, slug, avanza)
        except _PianoCambiato:
            if giro == GIRI:
                raise Errore(f"il piano è cambiato mentre montavo, per {GIRI} volte di fila: finisci di ritoccarlo e rilancia `python -m motore monta {slug}`",
                             f"the plan changed while I was editing, {GIRI} times in a row: finish adjusting it and run `python -m motore monta {slug}` again")
            avanza(dice("il piano è cambiato mentre montavo: riparto con quello nuovo", "the plan changed while I was editing: starting over with the new one"))
            archivio.rileggi_stile()


def _monta(archivio, slug, avanza):
    atteso = impronta_su_disco(archivio, slug)

    def stesso_piano():
        try:
            ancora = impronta_su_disco(archivio, slug) == atteso
        except Errore:
            ancora = False
        if not ancora:
            raise _PianoCambiato

    piano, stile = archivio.piano(slug), archivio.stile
    risolto = risolvi(archivio, slug)
    fps = risolto["formato"]["fps"]
    avanza(dice(f"risolto: {len(risolto['tratti'])} tratti, {risolto['durata']:.1f} s", f"resolved: {len(risolto['tratti'])} stretches, {risolto['durata']:.1f} s"))
    fasi = Fasi(archivio, slug, risolto["impronta"], avanza, da_capo=True)
    lavoro, uscite = archivio.lavoro(slug), archivio.uscite(slug)
    u, tratti = stile["uscita"], risolto["tratti"]
    scene = {sigla: lavoro / "scene" / f"{sigla}.mp4" for sigla in animazioni.richiesta(risolto, stile)}
    stesso_piano()
    prima, inizio = _date(scene), time.perf_counter()
    animazioni.rendi(archivio, slug, risolto, avanza)
    rese = _rifatti(prima, _date(scene))
    fasi.segna("animazioni", inizio, rese, len(scene) - rese)
    comp = Compositore(archivio, slug, piano, risolto)
    sagome = {nome: comp.sorgente(nome).preparati / "sagoma.json" for nome in {comp.sagoma_del_tratto(t)[0] for t in tratti if comp.sagoma_di(t["scena"])}}
    stesso_piano()
    prima, inizio = _date(sagome), time.perf_counter()
    comp.sagome(avanza)
    fatte = _rifatti(prima, _date(sagome))
    fasi.segna("sagoma", inizio, fatte, len(sagome) - fatte)
    stesso_piano()
    uscite.mkdir(parents=True, exist_ok=True)
    inizio = time.perf_counter()
    # Se i tratti interi non stanno nello spazio concesso si compongono mentre si codifica, e su disco resta solo il suono.
    # `da_fare` prende anche le misure condivise dai tratti (teste, scale), così dopo i tratti si fanno in parallelo.
    file = [comp.file_tratto(k, "mkv") for k in range(len(tratti))]
    da_fare = {f for f in file if not f.exists()}
    in_un_passaggio = bool(da_fare) and comp.stima_mb() > u["tratti_massimo_mb"]
    elenco = lavoro / "tratti.txt"
    (lavoro / "unito.mkv").unlink(missing_ok=True)
    if in_un_passaggio:
        avanza(dice("i tratti occuperebbero troppo spazio: li compongo mentre codifico (il suono si prepara prima, tratto per tratto)",
                    "the stretches would take too much space: I compose them while encoding (the sound is prepared first, stretch by stretch)"))
        file = [comp.file_tratto(k, "wav") for k in range(len(tratti))]
        da_fare = {f for f in file if not f.exists()}
        _una_volta(comp.tratto_audio, file, avanza, dice("suono", "sound"))
        comandi = [comp.comando_video(k) for k in range(len(tratti))]
    else:
        _una_volta(comp.tratto, file, avanza, dice("tratto", "stretch"))
        comandi = [["ffmpeg", "-v", "error", "-nostdin", "-f", "concat", "-safe", "0", "-i", str(elenco), "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]]
    fasi.segna("tratti", inizio, len(da_fare), len(set(file)) - len(da_fare))
    stesso_piano()
    inizio = time.perf_counter()
    elenco.write_text("".join(f"file '{f.as_posix()}'\n" for f in file), encoding="utf-8")
    quanti = [round(sum(t["durata"] for t in tratti) * fps)] if not in_un_passaggio else [round(t["durata"] * fps) for t in tratti]
    parziale = uscite / ".finale.parziale.mp4"
    dichiarata = piano.get("copertina")
    immagine = None
    if dichiarata:
        immagine = copertina.componi(archivio, slug, piano, risolto, comp, dichiarata["disegno"], dichiarata.get("istante", 0.0))
        copertina.scrivi(archivio, slug, immagine)
    n = _codifica(archivio, slug, comp, risolto, piano, comandi, quanti, elenco, parziale, u, primo_fotogramma=immagine)
    try:
        stesso_piano()
    except _PianoCambiato:
        parziale.unlink(missing_ok=True)
        raise
    scrivi_srt(uscite / "finale.srt", risolto["battute"])
    scrivi_capitoli(uscite / "capitoli.txt", risolto["capitoli"])
    os.replace(parziale, uscite / "finale.mp4")
    if immagine:
        # Il video con la copertina è quello stesso file: un secondo nome, nessun'altra codifica.
        collegamento = uscite / ".con-copertina.parziale.mp4"
        collegamento.unlink(missing_ok=True)
        os.link(uscite / "finale.mp4", collegamento)
        os.replace(collegamento, uscite / "con-copertina.mp4")
    fasi.uscite["finale"] = risolto["impronta"]
    fasi.tratti_del_montaggio(f.name for f in file)
    fasi.segna("uscita", inizio, 1)
    rimasti = _ripulisci(lavoro, {*fasi.tratti, *fasi.tratti_prima}, set(scene))
    if rimasti:
        avanza(dice(f"non ho potuto togliere da lavoro/: {', '.join(f.name for f in rimasti)}", f"could not remove from lavoro/: {', '.join(f.name for f in rimasti)}"))
    avanza(f"finale.mp4: {n / fps:.1f} s, lavoro/ {_peso_mb(lavoro):.1f} MB")
    return uscite / "finale.mp4"


def _codifica(archivio, slug, comp, risolto, piano, comandi, quanti, elenco, uscita, codifica, dal=0, quale="finale", primo_fotogramma=None):
    """Scrive in `uscita` i fotogrammi dei `comandi` con sopra sottotitoli e titolo, e la voce dei tratti di `elenco` (pulita, se lo stile
    lo vuole, e tenuta in `lavoro/voce/<quale>/`) coi suoni del piano. `dal` è il fotogramma del video da cui partono i tratti: un'anteprima
    comincia a metà. `primo_fotogramma` (un'immagine: la copertina) è il primo fotogramma, con un fotogramma di silenzio: tutto il resto parte un fotogramma dopo.
    Torna quanti fotogrammi dei tratti ha scritto."""
    stile = archivio.stile
    # Un video senza voce (pezzi senza sorgente, o sorgenti senza traccia audio) non ha niente da pulire: solo silenzio, che la misura del livello della voce non sa trattare.
    if attiva("pulizia_voce", stile["voce"]["pulizia"]["attiva"]) and any(t["sorgente"] and comp.sorgente(t["sorgente"]).info["ha_audio"] for t in risolto["tratti"]):
        voce = ["-i", str(voce_pulita(elenco, archivio.lavoro(slug) / "voce" / quale, stile))]
    else:
        voce = ["-f", "concat", "-safe", "0", "-i", str(elenco)]
    L, A, fps = (risolto["formato"][c] for c in ("largo", "alto", "fps"))
    sotto, immagini, titolo, titoli = sopra(archivio, comp, risolto, piano)
    inizio, durata = dal / fps, sum(quanti) / fps
    scelti = [s for s in risolto["suoni"] if 0 <= s["esce"] - inizio < durata]
    suoni, catena, v = [], "", stile["voce"]
    for n, s in enumerate(scelti):
        suoni += ["-i", file_del_suono(archivio, slug, s["file"])]
        catena += f"[{n + 2}:a]aresample={v['campioni_audio']},aformat=channel_layouts=stereo,volume={s['guadagno']:.1f}dB,adelay={round((s['esce'] - inizio) * 1000)}:all=1[s{n}];"
    mescola = "".join(f"[s{n}]" for n in range(len(scelti))) + f"amix=inputs={len(scelti) + 1}:normalize=0:duration=first," if suoni else ""
    mescola += f"adelay={round(v['campioni_audio'] / fps)}S:all=1," if primo_fotogramma else ""
    scrittore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{L}x{A}", "-r", str(fps), "-i", "-", *voce, *map(str, suoni),
                                  "-filter_complex", f"{catena}[1:a]{mescola}alimiter=limit={v['limite']}:level=0,apad[a]", "-map", "0:v", "-map", "[a]",
                                  "-c:v", "libx264", "-crf", str(codifica["crf"]), "-preset", codifica["preset"], "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{stile['uscita']['audio_kbit']}k",
                                  "-movflags", "+faststart", "-t", f"{(sum(quanti) + bool(primo_fotogramma)) / fps:.6f}", "-f", "mp4", str(uscita)], stdin=subprocess.PIPE)
    n = 0
    try:
        if primo_fotogramma:
            scrittore.stdin.write(primo_fotogramma.tobytes())
        for dati in _fotogrammi(comandi, L * A * 3, quanti):
            k, da_mettere = dal + n, []
            if k < len(sotto) and sotto[k] >= 0:
                da_mettere.append(immagini[sotto[k]])
            if k < len(titolo) and titolo[k] >= 0:
                da_mettere += titoli[titolo[k]]
            if da_mettere:
                quadro = Image.frombuffer("RGB", (L, A), dati, "raw", "RGB", 0, 1).copy()
                for img, x, y in da_mettere:
                    quadro.paste(img, (x, y), img if img.mode == "RGBA" else None)
                dati = quadro.tobytes()
            try:
                scrittore.stdin.write(dati)
            except BrokenPipeError:
                break
            n += 1
    finally:
        scrittore.stdin.close()
        esito = scrittore.wait()
    if esito != 0:
        uscita.unlink(missing_ok=True)
        raise Errore("la codifica del video non è riuscita: guarda l'errore di ffmpeg qui sopra",
                     "the video encoding failed: look at the ffmpeg error above")
    return n


def anteprima(archivio, slug, da=None, a=None, scena=None, avanza=print):
    """Solo un pezzo del video, in fretta, per guardare una correzione senza rimontare tutto: le scene animate e i tratti che toccano
    il pezzo (gli stessi file che poi usa il montaggio), con sottotitoli, titolo e suoni, codificati veloci in `uscite/anteprima.mp4`.
    Il pezzo è una scena (`scena`) o i secondi del video da `da` ad `a`, allargati ai tratti interi che toccano; quali secondi del video
    copre davvero sta accanto, in `uscite/anteprima.json`."""
    piano = archivio.piano(slug)
    risolto = risolvi(archivio, slug)
    tratti, fps = risolto["tratti"], risolto["formato"]["fps"]
    if scena is not None:
        trovata = next((s for s in risolto["scene"] if s["nome"] == scena), None)
        if trovata is None:
            raise Errore(f"il video non ha la scena «{scena}»: le scene sono {', '.join(s['nome'] for s in risolto['scene'])}",
                         f"the video has no scene «{scena}»: the scenes are {', '.join(s['nome'] for s in risolto['scene'])}")
        da, a = trovata["inizio"], trovata["inizio"] + trovata["durata"]
    if da is None or a is None or a <= da:
        raise Errore("dimmi quale pezzo: `--scena <nome>` oppure `--da <secondo> --a <secondo>`, con `a` dopo `da`",
                     "tell me which piece: `--scena <nome>` or `--da <secondo> --a <secondo>`, with `a` after `da`")
    dentro = [k for k, t in enumerate(tratti) if t["esce"] < a and t["esce"] + t["durata"] > da]
    if not dentro:
        raise Errore(f"il video dura {risolto['durata']:.1f} s: fra {da:g} e {a:g} s non c'è niente",
                     f"the video lasts {risolto['durata']:.1f} s: there is nothing between {da:g} and {a:g} s")
    lavoro, uscite = archivio.lavoro(slug), archivio.uscite(slug)
    sigle = {risolto["scene"][tratti[k]["scena"]]["animazione"] for k in dentro} - {None}
    chieste = {sigla: voce for sigla, voce in animazioni.richiesta(risolto, archivio.stile).items() if sigla in sigle}
    ripetute = animazioni.doppie(risolto)
    if any(sigla in ripetute for sigla in chieste):
        raise Errore("due scene usano la stessa animazione: ognuna deve avere la sua, perché ognuna ha i suoi tempi",
                     "two scenes use the same animation: each must have its own, because each has its own timing")
    if chieste:
        animazioni.registra(archivio, chieste, lavoro / "tempi-anteprima.json", lavoro / "scene", avanza)
    comp = Compositore(archivio, slug, piano, risolto)
    comp.sagome(avanza)
    file = [comp.file_tratto(k, "mkv") for k in dentro]
    _una_volta(lambda j: comp.tratto(dentro[j]), file, avanza, dice("tratto", "stretch"))
    elenco = lavoro / "anteprima.txt"
    elenco.write_text("".join(f"file '{f.as_posix()}'\n" for f in file), encoding="utf-8")
    comando = ["ffmpeg", "-v", "error", "-nostdin", "-f", "concat", "-safe", "0", "-i", str(elenco), "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    quanti = round(sum(tratti[k]["durata"] for k in dentro) * fps)
    uscite.mkdir(parents=True, exist_ok=True)
    parziale = uscite / ".anteprima.parziale.mp4"
    dal = round(tratti[dentro[0]]["esce"] * fps)
    n = _codifica(archivio, slug, comp, risolto, piano, [comando], [quanti], elenco, parziale, archivio.stile["uscita"]["anteprima"], dal=dal, quale="anteprima")
    os.replace(parziale, uscite / "anteprima.mp4")
    # Scritto dopo il video: un tratto più vecchio dell'anteprima vuol dire che non è il suo.
    scrivi_json(uscite / "anteprima.json", {"da": round(dal / fps, 3), "a": round((dal + n) / fps, 3)})
    avanza(dice(f"anteprima.mp4: {dal / fps:.1f}-{(dal + n) / fps:.1f} s del video, {len(dentro)} tratti", f"anteprima.mp4: {dal / fps:.1f}-{(dal + n) / fps:.1f} s of the video, {len(dentro)} stretches"))
    return uscite / "anteprima.mp4"


def anteprima_foto(archivio, slug, secondo, avanza=print):
    """Un fotogramma composto del video a `secondo` (secondi del video): il quadro del tratto con la scena, la sagoma, i sottotitoli e il titolo, per vedere un posto, un colore, una posizione
    senza montare né rendere la scena intera (solo il suo fotogramma). Usa ciò che c'è: la sagoma deve esserci già (un `monta` o un'`anteprima` la fa), il resto si compone adesso.
    Scrive `lavoro/foto/composta-<secondo>.jpg`."""
    piano = archivio.piano(slug)
    risolto = risolvi(archivio, slug)
    fps = risolto["formato"]["fps"]
    k = next((k for k, t in enumerate(risolto["tratti"]) if t["esce"] <= secondo < t["esce"] + t["durata"]), None)
    if k is None:
        raise Errore(f"il video dura {risolto['durata']:.1f} s: il secondo {secondo:g} non c'è",
                     f"the video lasts {risolto['durata']:.1f} s: second {secondo:g} is not there")
    tratto, cartella = risolto["tratti"][k], archivio.lavoro(slug) / "foto"
    scena = risolto["scene"][tratto["scena"]]
    cartella.mkdir(parents=True, exist_ok=True)
    comp = Compositore(archivio, slug, piano, risolto)
    animazione = None
    if scena["animazione"] and any(s["tipo"] == "animazione" for s in comp.quadro(tratto["scena"])["strati"]):
        animazione = animazioni.foto(archivio, slug, risolto, scena["animazione"], secondo - scena["inizio"], avanza)
    quadro = comp.fotogramma(k, secondo, animazione, cartella / f"composta-{secondo:g}.png")
    sotto, immagini, titolo, titoli = sopra(archivio, comp, risolto, piano)
    n = round(secondo * fps)
    da_mettere = ([immagini[sotto[n]]] if n < len(sotto) and sotto[n] >= 0 else []) + (titoli[titolo[n]] if n < len(titolo) and titolo[n] >= 0 else [])
    for img, x, y in da_mettere:
        quadro.paste(img, (x, y), img if img.mode == "RGBA" else None)
    file = cartella / f"composta-{secondo:g}.jpg"
    scrivi_con(file, lambda dest: quadro.save(dest, format="JPEG", quality=95))
    (cartella / f"composta-{secondo:g}.png").unlink(missing_ok=True)
    avanza(str(file))
    return file


def leggero(archivio, slug, avanza=print):
    """La copia piccola del video completo, quello con la copertina, da mandare a chi guarda dal telefono: si fa solo quando il creator la chiede."""
    uscite, u = archivio.uscite(slug), archivio.stile["uscita"]
    completo = uscite / "con-copertina.mp4"
    if not (uscite / "finale.mp4").exists():
        raise Errore(f"il video non è ancora montato: lancia `python -m motore monta {slug}`",
                     f"the video is not edited yet: run `python -m motore monta {slug}`")
    if not completo.exists() or completo.stat().st_mtime < (uscite / "finale.mp4").stat().st_mtime:
        raise Errore(f"il video completo è quello con la copertina, e manca o è più vecchio del montato: dichiara `copertina` nel piano e lancia `python -m motore monta {slug}`",
                     f"the complete video is the one with the cover, and it is missing or older than the edited video: declare `copertina` in the plan and run `python -m motore monta {slug}`")
    orizzontale = info(completo)["largo"] > info(completo)["alto"]
    lg = u["leggero_orizzontale" if orizzontale else "leggero"]
    scrivi_con(uscite / "leggero.mp4", lambda dest: ffmpeg("-i", completo, "-vf", f"scale={lg['largo']}:{lg['alto']}", "-crf", lg["crf"], "-c:a", "aac", "-b:a", f"{u['audio_kbit']}k", "-movflags", "+faststart", "-f", "mp4", "-y", dest))
    avanza(str(uscite / "leggero.mp4"))
    return uscite / "leggero.mp4"
