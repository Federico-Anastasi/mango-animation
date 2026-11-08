import json
import math
import subprocess
import sys
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress

import numpy as np

from .archivio import leggi_json, scrivi_con, scrivi_json
from .dispositivo import dispositivo
from .errori import Errore, dice
from .foto import e_foto, prepara_foto
from .media import ffmpeg, info, pcm_16k
from .persona import Visi
from .profilo import attiva, motore, richiedi
from .sagoma import copre, pezzi_della_sagoma
from .voce import leggi_onda, scrivi_onda

_voci = {}


def _lato_lungo(lato):
    return f"scale='if(gt(iw,ih),{lato},-2)':'if(gt(iw,ih),-2,{lato})':flags=lanczos"


def modello_voce(stile):
    """Il modello che sente le parole, caricato una volta sola per processo, sulla scheda 0 o sul processore. Modello e calcolo sono quelli di `motori.trascrizione`
    del profilo, se li dice, altrimenti quelli dello stile."""
    dove = dispositivo("trascrizione")
    if dove not in _voci:
        if dove == "cuda" and any(attiva(f) for f in ("sagoma", "allineamento")):
            import torch  # noqa: F401  deve caricarsi prima di ctranslate2, o la sua libreria cuDNN prende il posto di quella di torch e lo scontorno cade

        from faster_whisper import WhisperModel

        p, m = stile["preparati"], motore("trascrizione")
        nome, calcolo = m.get("modello", p["modello_trascrizione"]), m.get("calcolo", p["calcolo_trascrizione"][dove])
        try:
            _voci[dove] = WhisperModel(nome, device=dove, device_index=0, compute_type=calcolo)
        except ValueError as e:
            raise Errore(f"la trascrizione non può usare il calcolo {calcolo} su {'questa scheda' if dove == 'cuda' else 'questo processore'} ({e}): cambia motori.trascrizione.calcolo nel profilo",
                         f"the transcription cannot use the computation {calcolo} on {'this card' if dove == 'cuda' else 'this processor'} ({e}): change motori.trascrizione.calcolo in the profile") from e
        except OSError as e:
            raise Errore(f"il modello di trascrizione «{nome}» non si trova e non si riesce a scaricarlo (la prima volta serve la rete): {e}",
                         f"the transcription model «{nome}» cannot be found and cannot be downloaded (the first time the network is needed): {e}") from e
    return _voci[dove]


def tratti_di_voce(x, stile):
    """I tratti di voce di un audio a 16 kHz, in campioni: [(inizio, fine)]."""
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    v = stile["preparati"]["tratti_di_voce"]
    opzioni = VadOptions(min_silence_duration_ms=round(v["silenzio_minimo"] * 1000), speech_pad_ms=round(v["margine"] * 1000), onset=v["soglia"])
    return [(t["start"], t["end"]) for t in get_speech_timestamps(x, opzioni)]


def trascrivi(sorgente, stile, nomi=(), lingua=None):
    """Le parole coi tempi del file e le righe col minuto, una per tratto di voce. Ogni tratto si trascrive da solo e senza il testo di
    prima: su un file lungo whisper altrimenti cade in loop, e fonde le false partenze in una frase sola. `nomi` gli dice come si scrivono;
    `lingua` è quella del file, se non è quella dello stile. Una parola più lunga di `parola_lunga` si ritrascrive da sola: è spesso una falsa
    partenza che whisper ha fuso con la frase ridetta, e da sola si separa; se ne esce ancora una parola sola, resta com'era."""
    p = stile["preparati"]
    x = pcm_16k(sorgente)
    modello, suggerimento = modello_voce(stile), (", ".join(nomi) + ".") if nomi else None

    def ascolta(inizio, fine):
        scarto = inizio / 16000
        segmenti, _ = modello.transcribe(x[inizio:fine], language=lingua or p["lingua"], word_timestamps=True, vad_filter=False, condition_on_previous_text=False,
                                         initial_prompt=suggerimento, beam_size=p["fasci_trascrizione"], temperature=0.0)
        return [{"p": w.word.strip(), "da": round(w.start + scarto, 2), "a": round(w.end + scarto, 2)} for s in segmenti for w in s.words]

    def separata(w):
        if w["a"] - w["da"] <= p["parola_lunga"]:
            return [w]
        rilette = ascolta(round(w["da"] * 16000), round(w["a"] * 16000))
        return rilette if len(rilette) > 1 else [w]

    parole, righe = [], []
    for inizio, fine in tratti_di_voce(x, stile):
        trovate = [n for w in ascolta(inizio, fine) for n in separata(w)]
        if trovate:
            parole += trovate
            righe.append(f"{int(trovate[0]['da'] // 60):02d}:{int(trovate[0]['da'] % 60):02d} {' '.join(w['p'] for w in trovate)}")
    return parole, righe


def fuori_dal_silenzio(parole, db, stile):
    """Le parole che hanno voce sotto di sé: whisper ne inventa nel silenzio («Grazie» in coda a una ripresa). Si guarda fino a un po' dopo la fine,
    perché whisper mette spesso la parola un po' prima della voce."""
    soglia, dopo = stile["voce"]["silenzio_db"], stile["preparati"]["tratti_di_voce"]["dopo_parola"]
    return [w for w in parole if len(finestra := db[int(w["da"] * 100):int((w["a"] + dopo) * 100)]) and finestra.max() >= soglia]


def libera():
    _voci.clear()
    if "torch" in sys.modules:
        sys.modules["torch"].cuda.empty_cache()


def scontornatore(stile):
    from .scontorno import Scontornatore

    return Scontornatore(stile)


def unisci(intervalli, fps):
    """Gli intervalli (secondi) portati sui fotogrammi, in ordine e fusi dove si toccano."""
    fuori = []
    for a, b in sorted((math.floor(a * fps) / fps, math.ceil(b * fps) / fps) for a, b in intervalli):
        if fuori and a <= fuori[-1][1]:
            fuori[-1][1] = max(fuori[-1][1], b)
        else:
            fuori.append([a, b])
    return [[round(a, 4), round(b, 4)] for a, b in fuori]


def _scontorna(sorgente, destinazione, da, quanti, rete, stile):
    """`quanti` fotogrammi della sorgente da `da`, senza sfondo, in un VP9 con alfa grande quanto il fotogramma: il primo fotogramma del file è quello a `da`.
    La codifica gira in un filo a parte, così lo scontorno non aspetta l'encoder."""
    L, A, fps, c = stile["formato"]["largo"], stile["formato"]["alto"], stile["formato"]["fps"], stile["sagoma"]["codifica"]
    scrittore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{L}x{A}", "-r", str(fps), "-i", "-",
                                  "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-deadline", c["deadline"], "-cpu-used", str(c["cpu_used"]), "-row-mt", "1",
                                  "-crf", str(c["crf"]), "-b:v", "0", "-auto-alt-ref", "0", "-f", "webm", str(destinazione)], stdin=subprocess.PIPE)
    lettore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{da:.4f}", "-t", f"{quanti / fps:.4f}", "-i", str(sorgente), "-an",
                                "-vf", f"fps={fps},scale={L}:{A}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    passo, fatti, in_corso = L * A * 3, 0, deque()

    def letti():
        for _ in range(quanti):
            dati = bytearray(passo)
            if lettore.stdout.readinto(dati) != passo:
                return
            yield np.frombuffer(dati, dtype=np.uint8).reshape(A, L, 3)

    try:
        with ThreadPoolExecutor(max_workers=1) as codifica:
            for rgba in rete.intervallo(letti()):
                in_corso.append(codifica.submit(scrittore.stdin.write, rgba.tobytes()))
                fatti += 1
                if len(in_corso) > c["in_coda"]:
                    in_corso.popleft().result()
            # Un intervallo che arriva in fondo alla sorgente può dare un fotogramma in meno: si chiude vuoto, perché i conti tornino.
            vuoto = bytes(L * A * 4)
            in_corso.extend(codifica.submit(scrittore.stdin.write, vuoto) for _ in range(quanti - fatti))
            for scrittura in in_corso:
                scrittura.result()
    except OSError as e:
        raise Errore(f"lo scontorno di {sorgente.name} non è riuscito: la codifica si è fermata ({e})",
                     f"the cutout of {sorgente.name} failed: the encoding stopped ({e})") from e
    finally:
        lettore.stdout.close()
        if lettore.poll() is None:
            lettore.terminate()
        lettore.wait()
        with suppress(OSError):
            scrittore.stdin.close()
        esito = scrittore.wait()
    if esito != 0:
        raise Errore(f"lo scontorno di {sorgente.name} non è riuscito",
                     f"the cutout of {sorgente.name} failed")


def scontorna_intervalli(sorgente, cartella, intervalli, stile, scritto):
    """La persona senza sfondo nei soli `intervalli` della sorgente, nell'ordine della ripresa, coi modelli caricati una volta: un file per intervallo
    in `cartella` (`<primo>-<ultimo>.webm`, in fotogrammi). A ogni file finito chiama `scritto` col suo pezzo."""
    fps = stile["formato"]["fps"]
    cartella.mkdir(parents=True, exist_ok=True)
    rete = scontornatore(stile)
    for da, a in intervalli:
        primo, ultimo = round(da * fps), round(a * fps)
        file = cartella / f"{primo}-{ultimo}.webm"
        scrivi_con(file, lambda dest: _scontorna(sorgente, dest, primo / fps, ultimo - primo, rete, stile))
        scritto({"da": da, "a": a, "file": f"{cartella.name}/{file.name}", "inizio": da})


def sagoma_dei_tratti(sorgente, cartella, tratti, stile, avanza=print):
    """La sagoma di una sorgente per i tratti (da, a) che un montaggio mette in sagoma. Un tratto già portato da un pezzo (`motore/sagoma.py`) non
    si rifà; gli altri, ognuno allargato di `sagoma.margine` perché lo scontorno arrivi al suo primo fotogramma con la memoria calda, si scontornano
    in un passaggio solo, un file per intervallo di ripresa continua. `sagoma.json` elenca i pezzi e si aggiorna a ogni file finito."""
    fps, margine, durata = stile["formato"]["fps"], stile["sagoma"]["margine"], info(sorgente)["durata"]
    pezzi = pezzi_della_sagoma(cartella)
    mancanti = unisci([(max(0.0, a - margine), min(durata, b + margine)) for a, b in tratti if not any(copre(p, a, b, margine) for p in pezzi)], fps)
    if not mancanti:
        return
    richiedi("sagoma", f"il video mette in sagoma tratti di {sorgente.name} che non l'hanno", f"the video cuts out stretches of {sorgente.name} that have no silhouette")
    avanza(dice(f"{sorgente.name}: sagoma di {sum(b - a for a, b in mancanti):.0f} s su {durata:.0f}", f"{sorgente.name}: silhouette of {sum(b - a for a, b in mancanti):.0f} s out of {durata:.0f}"))
    elenco = [{**p, "a": min(p["a"], durata)} for p in pezzi]

    def scritto(pezzo):
        elenco[:] = [p for p in elenco if p["file"] != pezzo["file"]] + [pezzo]
        scrivi_json(cartella / "sagoma.json", {"pezzi": elenco})

    scontorna_intervalli(sorgente, cartella / "sagoma", mancanti, stile, scritto)


def misura_persona(sorgente, destinazione, intervalli, stile):
    """Dove sta la testa della persona nei soli `intervalli` (secondi della sorgente), `misure_al_secondo` volte al secondo: il centro del viso più grande, in frazioni
    della larghezza del fotogramma. `x` ha una misura per ogni passo dall'inizio della ripresa, `null` dove non è stato misurato o non si vede nessun viso;
    `misurati` elenca gli intervalli già misurati, a cui si aggiungono i nuovi."""
    s = stile["segui"]
    passo = s["misure_al_secondo"]
    scritto = leggi_json(destinazione, "la persona", "the person") if destinazione.exists() else {}
    if scritto.get("misure_al_secondo") != passo or "misurati" not in scritto:
        scritto = {"misure_al_secondo": passo, "misurati": [], "x": []}
    misure, misurati = scritto["x"], scritto["misurati"]
    visi = Visi(s["soglia_viso"])
    formato, L = info(sorgente), s["lato"]
    A = round(L * formato["alto"] / formato["largo"] / 2) * 2
    for da, a in intervalli:
        primo, quanti = math.floor(da * passo), math.ceil(a * passo) - math.floor(da * passo)
        lettore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-ss", f"{primo / passo:.4f}", "-t", f"{quanti / passo:.4f}", "-i", str(sorgente), "-an",
                                    "-vf", f"fps={passo},scale={L}:{A}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        trovate = []
        while len(dati := lettore.stdout.read(L * A * 3)) == L * A * 3:
            trovate.append(visi.x(np.frombuffer(dati, dtype=np.uint8).reshape(A, L, 3)))
        if lettore.wait() != 0:
            raise Errore(f"la misura della persona in {sorgente.name} non è riuscita",
                         f"measuring the person in {sorgente.name} failed")
        misure += [None] * (primo + len(trovate) - len(misure))
        misure[primo:primo + len(trovate)] = trovate
        misurati.append([primo / passo, (primo + len(trovate)) / passo])
    scrivi_json(destinazione, {"misure_al_secondo": passo, "misurati": unisci(misurati, passo), "x": misure})


def lingua_del_file(sorgente):
    """La lingua scritta nella scheda del file nel grezzo (un keynote in inglese); None se non c'è."""
    scheda = sorgente.with_name(sorgente.name + ".scheda.json")
    return json.loads(scheda.read_text(encoding="utf-8")).get("lingua") if scheda.is_file() else None


def prepara_file(archivio, file, avanza=print, nomi=(), ritrascrivi=False):
    """Ciò che il motore ricava da un file grezzo, una volta sola: livello della voce, miniatura, copia leggera, parole (e il parlato col minuto
    se il file è lungo). Di una foto: la foto intera e la miniatura. Ciò che c'è già non si rifà, salvo le
    parole con `ritrascrivi` (dopo aver cambiato la lingua nella scheda del file). La sagoma e dove sta la persona no: le fa `monta`, dei soli tratti montati.
    `nomi` dice alla trascrizione come si scrivono i nomi propri."""
    stile = archivio.stile
    sorgente = archivio.grezzo(file)
    if not sorgente.is_file():
        raise Errore(f"il file «{file}» non c'è in {archivio.radice / 'grezzo'}: mettilo lì (o dai il percorso relativo a grezzo/)",
                     f"the file «{file}» is not in {archivio.radice / 'grezzo'}: put it there (or give the path relative to grezzo/)")
    cartella = archivio.preparati(file)
    cartella.mkdir(parents=True, exist_ok=True)
    if ritrascrivi:
        for vecchio in ("parole.json", "trascrizione.txt"):
            (cartella / vecchio).unlink(missing_ok=True)
    if e_foto(sorgente):
        prepara_foto(sorgente, cartella, stile, avanza)
        return cartella
    p, formato = stile["preparati"], info(sorgente)
    if formato["ha_audio"] and not (cartella / "onda.bin").exists():
        avanza(dice(f"{file}: livello della voce", f"{file}: voice level"))
        scrivi_con(cartella / "onda.bin", lambda dest: scrivi_onda(sorgente, dest))
    if formato["ha_video"] and not (cartella / "miniatura.jpg").exists():
        avanza(dice(f"{file}: miniatura", f"{file}: thumbnail"))
        scrivi_con(cartella / "miniatura.jpg", lambda dest: ffmpeg("-ss", f"{formato['durata'] * p['miniatura_al']:.2f}", "-i", sorgente, "-frames:v", "1", "-vf", _lato_lungo(p["lato_miniatura"]), "-f", "image2", "-y", dest))
    if formato["ha_video"] and not (cartella / "leggero.mp4").exists():
        avanza(dice(f"{file}: copia leggera", f"{file}: light copy"))
        scrivi_con(cartella / "leggero.mp4", lambda dest: ffmpeg("-i", sorgente, "-vf", _lato_lungo(p["lato_leggero"]), "-c:v", "libx264", "-preset", "veryfast", "-crf", p["crf_leggero"],
                                                                 "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "-f", "mp4", "-y", dest))
    if formato["ha_audio"] and not attiva("trascrizione") and not (cartella / "parole.json").exists():
        avanza(dice(f"{file}: trascrizione spenta nel profilo (motori.trascrizione.attiva): niente parole", f"{file}: transcription turned off in the profile (motori.trascrizione.attiva): no words"))
    elif formato["ha_audio"] and not (cartella / "parole.json").exists():
        avanza(dice(f"{file}: trascrizione", f"{file}: transcription"))
        parole, righe = trascrivi(sorgente, stile, nomi, lingua=lingua_del_file(sorgente))
        if formato["durata"] > p["trascrizione_oltre"]:
            (cartella / "trascrizione.txt").write_text("\n".join(righe) + "\n", encoding="utf-8")
        scrivi_json(cartella / "parole.json", fuori_dal_silenzio(parole, leggi_onda(cartella / "onda.bin"), stile))
    return cartella


def prepara_piano(archivio, slug, avanza=print):
    piano = archivio.piano(slug)
    usate = {nome for scena in piano["scene"] for pezzo in scena["pezzi"] for nome in (pezzo.get("sorgente"), pezzo.get("sagoma", {}).get("sorgente"), pezzo.get("girato", {}).get("sorgente")) if nome}
    mancanti = sorted(usate - piano["sorgenti"].keys())
    if mancanti:
        raise Errore(f"il piano usa la sorgente «{mancanti[0]}», che non dichiara fra le `sorgenti`",
                     f"the plan uses the source «{mancanti[0]}», which it does not declare among the `sorgenti`")
    try:
        for nome in sorted(piano["sorgenti"]):
            prepara_file(archivio, piano["sorgenti"][nome]["file"], avanza, piano.get("sottotitoli", {}).get("nomi", ()))
    finally:
        libera()
