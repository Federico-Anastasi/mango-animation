import argparse
import json
import sys
from pathlib import Path

from . import carosello, controlla, copertina, detta, monta, pagina, prepara, prova, proposta, risolvi
from .archivio import Archivio, leggi_json, valida
from .errori import Errore, dice
from .media import ffmpeg, info, pcm_16k
from .voce import PASSO, livello, serie


def _relativo_a_grezzo(archivio, file):
    percorso = Path(file)
    if percorso.is_absolute():
        try:
            return percorso.resolve().relative_to((archivio.radice / "grezzo").resolve()).as_posix()
        except ValueError:
            pass
    elif ".." not in percorso.parts:
        return percorso.as_posix()
    raise Errore(f"{file} non sta in {archivio.radice / 'grezzo'}: il girato si prepara da lì",
                 f"{file} is not in {archivio.radice / 'grezzo'}: footage is prepared from there")


def _valida(archivio, a):
    errori, avvisi = valida(archivio, a.slug)
    for avviso in avvisi:
        print(f"{dice('attenzione', 'warning')}: {avviso.detta()}")
    if errori:
        raise Errore("il piano non va:\n" + "\n".join(f"  {e}" for e in errori),
                     "the plan is not valid:\n" + "\n".join(f"  {e.en}" for e in errori))
    print(dice("il piano va", "the plan is valid"))


def _risolvi(archivio, a):
    r = risolvi.risolvi(archivio, a.slug)
    print(dice(f"risolto: {len(r['tratti'])} tratti, {r['durata']:.1f} s", f"resolved: {len(r['tratti'])} stretches, {r['durata']:.1f} s"))


def _parole(archivio, a):
    r = risolvi.risolvi(archivio, a.slug, scrivi=False)
    for n, t in enumerate(r["tratti"]):
        scena = r["scene"][t["scena"]]
        dove = f"{t['sorgente']} {t['da']:.2f}-{t['da'] + t['durata']:.2f} s" if t["sorgente"] else dice(f"senza voce, {t['durata']:.2f} s", f"no voice, {t['durata']:.2f} s")
        print(dice(f"tratto {n}: {scena['nome']} · {dove} · nel video {t['esce']:.2f}-{t['esce'] + t['durata']:.2f} s", f"stretch {n}: {scena['nome']} · {dove} · in the video {t['esce']:.2f}-{t['esce'] + t['durata']:.2f} s"))
        parole = [w for w in r["parole"] if w["tratto"] == n]
        if parole:
            print("   " + " ".join(f"{w['p']} ({w['nella_sorgente']:.2f}→{w['da']:.2f})" for w in parole))
    print(dice(f"in tutto {r['durata']:.1f} s", f"{r['durata']:.1f} s in all"))


def _davanti_al_montato(archivio, slug):
    """Quanti secondi ha in più il montato davanti ai tempi del piano: un fotogramma, se il piano mette la copertina."""
    file = archivio.lavoro(slug) / "risolto.json"
    risolto = leggi_json(file, "il risolto", "the resolved plan") if file.exists() else {}
    return 1 / risolto["formato"]["fps"] if risolto.get("copertina") else 0.0


def _fotogrammi(video, secondi, da, fine, cartella, prefisso=""):
    for secondo in secondi:
        if secondo >= fine:
            raise Errore(f"il video dura {fine:.1f} s: non arriva al secondo {secondo:g}",
                         f"the video lasts {fine:.1f} s: it does not reach second {secondo:g}")
    cartella.mkdir(parents=True, exist_ok=True)
    for secondo in secondi:
        file = cartella / f"{prefisso}{secondo:g}.jpg"
        ffmpeg("-ss", secondo - da, "-i", video, "-frames:v", "1", "-q:v", "2", "-y", file)
        print(file)


def _foto(archivio, a):
    """I fotogrammi del montato, o dell'anteprima, ai secondi del video montato; o della prova, ai suoi secondi."""
    uscite, cartella = archivio.uscite(a.slug), archivio.lavoro(a.slug) / "foto"
    if a.prova:
        video = uscite / "prova.mp4"
        if not video.exists():
            raise Errore(f"non c'è la prova: lancia il lavoro `prova` (`python -m motore prova {a.slug}`)",
                         f"there is no rehearsal: run the `prova` job (`python -m motore prova {a.slug}`)")
        return _fotogrammi(video, a.secondi, 0.0, info(video)["durata"], cartella, "prova-")
    if a.anteprima:
        video, tratto = uscite / "anteprima.mp4", uscite / "anteprima.json"
        rifalla = f"`python -m motore anteprima {a.slug} --scena <nome>` (o `--da <s> --a <s>`)"
        if not video.exists():
            raise Errore(f"non c'è un'anteprima: lancia {rifalla}", f"there is no preview: run {rifalla}")
        if not tratto.exists() or tratto.stat().st_mtime_ns < video.stat().st_mtime_ns:
            raise Errore(f"non so quale tratto del video copre l'anteprima: rifai l'anteprima con {rifalla}",
                         f"I do not know which stretch of the video the preview covers: redo the preview with {rifalla}")
        copre = leggi_json(tratto, "il tratto dell'anteprima", "the stretch of the preview")
        da, fine, prefisso = copre["da"], copre["a"], "anteprima-"
        for secondo in a.secondi:
            if not da <= secondo < fine:
                raise Errore(f"l'anteprima copre il video da {da:.1f} a {fine:.1f} s: il secondo {secondo:g} è fuori; guardalo nel montato o rifai l'anteprima su quel pezzo",
                             f"the preview covers the video from {da:.1f} to {fine:.1f} s: second {secondo:g} is outside it; look at it in the edited video or redo the preview on that piece")
    else:
        video, prefisso = uscite / "finale.mp4", ""
        if not video.exists():
            raise Errore(f"il video non è ancora montato: lancia `python -m motore monta {a.slug}`",
                         f"the video is not edited yet: run `python -m motore monta {a.slug}`")
        da = -_davanti_al_montato(archivio, a.slug)
        fine = info(video)["durata"] + da
    _fotogrammi(video, a.secondi, da, fine, cartella, prefisso)


def _ascolta(archivio, a):
    """Il livello della voce di un pezzo, ogni centesimo, i suoi tratti di voce e lo spettrogramma: per trovare dove finisce una parola,
    un colpo di tasto, un respiro. Da un file del girato (secondi del file) o dal montato (secondi del video)."""
    if a.a <= a.da:
        raise Errore(f"la fine ({a.a:g}) deve venire dopo l'inizio ({a.da:g})", f"the end ({a.a:g}) must come after the start ({a.da:g})")
    if a.file:
        file = _relativo_a_grezzo(archivio, a.file)
        sorgente, cartella = archivio.grezzo(file), archivio.preparati(file) / "ascolta"
        if not sorgente.is_file():
            raise Errore(f"«{file}» non c'è in {archivio.radice / 'grezzo'}", f"«{file}» is not in {archivio.radice / 'grezzo'}")
    else:
        sorgente, cartella = archivio.uscite(a.video) / "finale.mp4", archivio.lavoro(a.video) / "foto"
        if not sorgente.exists():
            raise Errore(f"il video non è ancora montato: lancia `python -m motore monta {a.video}`",
                         f"the video is not edited yet: run `python -m motore monta {a.video}`")
    davanti = 0.0 if a.file else _davanti_al_montato(archivio, a.video)
    durata = min(a.a, info(sorgente)["durata"] - davanti) - a.da
    if durata <= 0:
        raise Errore(f"il file dura {info(sorgente)['durata']:.1f} s: non arriva al secondo {a.da:g}",
                     f"the file lasts {info(sorgente)['durata']:.1f} s: it does not reach second {a.da:g}")
    db = livello(pcm_16k(sorgente, a.da + davanti, durata))
    s = archivio.stile
    voce = [[round(a.da + i * PASSO, 2), round(a.da + j * PASSO, 2)] for i, j in serie(db >= s["voce"]["silenzio_db"])]
    cartella.mkdir(parents=True, exist_ok=True)
    spettrogramma = cartella / f"ascolta-{a.da:g}-{a.a:g}.png"
    ffmpeg("-ss", f"{a.da + davanti:.3f}", "-t", f"{durata:.3f}", "-i", sorgente, "-lavfi", f"aresample=16000,showspectrumpic=s={s['ascolta']['largo']}x{s['ascolta']['alto']}:legend=1", "-y", spettrogramma)
    print(json.dumps({"da": a.da, "passo": PASSO, "silenzio_db": s["voce"]["silenzio_db"], "livello": [round(float(v)) for v in db], "voce": voce,
                      "spettrogramma": str(spettrogramma)}, ensure_ascii=False))


def _foto_girato(archivio, a):
    """I fotogrammi di un file del girato ai suoi secondi, nei suoi preparati."""
    file = _relativo_a_grezzo(archivio, a.file)
    video = archivio.grezzo(file)
    if not video.is_file():
        raise Errore(f"«{file}» non c'è in {archivio.radice / 'grezzo'}", f"«{file}» is not in {archivio.radice / 'grezzo'}")
    _fotogrammi(video, a.secondi, 0.0, info(video)["durata"], archivio.preparati(file) / "foto")


COMANDI = {
    "prova": (lambda archivio, a: prova.prova(archivio, a.slug), "il video per registrare: le scene e il copione a frase intera"),
    "valida": (_valida, "schema e riferimenti del piano"),
    "prepara": (lambda archivio, a: prepara.prepara_piano(archivio, a.slug), "prepara le sorgenti del piano"),
    "prepara-file": (lambda archivio, a: prepara.prepara_file(archivio, _relativo_a_grezzo(archivio, a.file), ritrascrivi=a.ritrascrivi), "prepara un file grezzo"),
    "risolvi": (_risolvi, "il piano in tempi veri"),
    "monta": (lambda archivio, a: monta.monta(archivio, a.slug), "risolve, rende le animazioni, monta"),
    "anteprima": (lambda archivio, a: monta.anteprima_foto(archivio, a.slug, a.foto) if a.foto is not None else monta.anteprima(archivio, a.slug, a.da, a.a, a.scena),
                  "solo un pezzo del video, in fretta, per guardare una correzione; con --foto un solo fotogramma composto"),
    "leggero": (lambda archivio, a: monta.leggero(archivio, a.slug), "la copia piccola del montato, quando il creator la chiede"),
    "controlla": (lambda archivio, a: controlla.controlla(archivio, a.slug), "riascolta il montato"),
    "parole": (_parole, "ogni tratto con le sue parole e i loro istanti"),
    "foto": (_foto, "fotogrammi del montato (o dell'anteprima) a quei secondi del video, o della prova ai suoi"),
    "foto-girato": (_foto_girato, "fotogrammi di un file del girato a quei suoi secondi"),
    "ascolta": (_ascolta, "il livello della voce, i tratti di voce e lo spettrogramma di un pezzo del girato o del montato"),
    "anteprima-proposta": (lambda archivio, a: proposta.anteprima_proposta(archivio, a.slug, a.riga), "l'anteprima di una proposta: il titolo e una riga su una carta, in materiali/anteprima.png"),
    "copertina": (lambda archivio, a: copertina.copertina(archivio, a.slug, a.disegno, a.istante), "l'immagine della copertina, per guardarla (nel video la mette monta)"),
    "carosello": (lambda archivio, a: carosello.nuovo(archivio, a.slug) if a.nuovo else carosello.carosello(archivio, a.slug), "le slide di materiali/carosello.html in uscite/, coi controlli; con --nuovo scrive la base da cui partire"),
    "detta": (lambda archivio, a: detta.detta(), "la dettatura: resta acceso col modello caricato e parla a righe JSON su stdin e stdout (docs/MOTORE.md)"),
    "pagina": (lambda archivio, a: pagina.pagina(archivio, a.slug, a.nomi, a.solo_ritagli, a.visibile), "le pagine vere di materiali/pagine.json, in formato telefono, e i loro ritagli"),
}


# la dettatura non tocca i dati di nessuno: gira anche prima che esista una cartella di lavoro
SENZA_ARCHIVIO = {"detta"}


def costruisci():
    p = argparse.ArgumentParser(prog="python -m motore", description="Il motore di Mango Animation.")
    sub = p.add_subparsers(dest="comando", required=True)
    for nome, (_, aiuto) in COMANDI.items():
        c = sub.add_parser(nome, help=aiuto)
        if nome == "prepara-file":
            c.add_argument("file", help="relativo a archivio/grezzo/")
            c.add_argument("--ritrascrivi", action="store_true", help="rifà le parole (dopo aver cambiato la lingua nella scheda del file)")
        elif nome == "ascolta":
            c.add_argument("da", type=float, help="il secondo da cui ascoltare")
            c.add_argument("a", type=float, help="il secondo a cui fermarsi")
            dove = c.add_mutually_exclusive_group(required=True)
            dove.add_argument("--file", help="un file del girato, relativo a archivio/grezzo/ (secondi del file)")
            dove.add_argument("--video", help="lo slug di un video montato (secondi del video)")
        elif nome == "foto-girato":
            c.add_argument("file", help="relativo a archivio/grezzo/")
            c.add_argument("secondi", nargs="+", type=float, help="secondi del file")
        elif nome != "detta":
            c.add_argument("slug")
            if nome == "foto":
                c.add_argument("secondi", nargs="+", type=float, help="secondi del video montato")
                quale = c.add_mutually_exclusive_group()
                quale.add_argument("--anteprima", action="store_true", help="dall'anteprima (uscite/anteprima.mp4) invece che dal montato")
                quale.add_argument("--prova", action="store_true", help="dalla prova (uscite/prova.mp4), coi suoi secondi")
            elif nome == "anteprima":
                c.add_argument("--scena", help="il nome di una scena del piano")
                c.add_argument("--da", type=float, help="secondo del video da cui partire")
                c.add_argument("--a", type=float, help="secondo del video a cui arrivare")
                c.add_argument("--foto", type=float, help="un solo fotogramma composto, a questo secondo del video (lavoro/foto/composta-<secondo>.jpg)")
            elif nome == "anteprima-proposta":
                c.add_argument("--riga", help="una riga che dice di cosa parla il video, sotto il titolo")
            elif nome == "copertina":
                c.add_argument("disegno", nargs="?", help="un'immagine grande quanto il fotogramma: un percorso, o un file nella cartella del video (materiali/x.png); senza, quello di `copertina` nel piano")
                c.add_argument("--istante", type=float, help="il secondo del video da cui prendere la sagoma (di solito il primo); senza, quello di `copertina` nel piano")
            elif nome == "carosello":
                c.add_argument("--nuovo", action="store_true", help="scrive materiali/carosello.html con la base da cui partire (solo se non c'è) invece di rendere le slide")
            elif nome == "pagina":
                c.add_argument("nomi", nargs="*", help="le pagine di materiali/pagine.json da prendere (tutte, se nessuna)")
                c.add_argument("--solo-ritagli", action="store_true", help="rifà solo i ritagli, dalle catture che ci sono")
                c.add_argument("--visibile", action="store_true", help="col Chrome visibile, per i siti che bloccano il browser senza finestra")
    return p


def main(argv=None):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    a = costruisci().parse_args(argv)
    try:
        COMANDI[a.comando][0](None if a.comando in SENZA_ARCHIVIO else Archivio(), a)
    except Errore as e:
        print(str(e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
