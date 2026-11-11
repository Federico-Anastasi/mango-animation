import os
import re
import shutil
import subprocess

from .archivio import ambiente_di_lavoro, scrivi_json
from .errori import Errore, dice

# Le righe di avanzamento di `registra` cominciano così, nella lingua del lavoro (`animazioni/script/lingua.ts`).
PREFISSI_RIGHE = ("animazioni:", "animations:")
RIASSUNTO = re.compile(r"animazioni: rese (\d+), già rese (\d+)|animations: rendered (\d+), already rendered (\d+)")


def richiesta(risolto, stile):
    """Ciò che le animazioni devono sapere di ogni scena: quanto dura, dove sono le ancore, in che secondo viene detta ogni parola, di che misura è il fotogramma, in che lingua scrivere i suoi testi,
    e la fascia utile del quadro della scena nel piano (un quadro senza fascia non la dice: la scena usa quella di serie)."""
    formato = {"largo": risolto["formato"]["largo"], "alto": risolto["formato"]["alto"]}
    lingua = risolto.get("lingua", "it")
    fuori = {}
    for s in risolto["scene"]:
        if s["animazione"]:
            fuori[s["animazione"]] = {"durata": s["durata"], "ancore": s["ancore"], "tempi": s["tempi"], "formato": formato, "lingua": lingua,
                                      **({"fascia": f} if (f := stile["quadri"][s["quadro"]].get("fascia_animazione")) else {})}
    return fuori


def doppie(risolto):
    viste = {}
    for s in risolto["scene"]:
        if s["animazione"]:
            viste.setdefault(s["animazione"], []).append(s["nome"])
    return {sigla: nomi for sigla, nomi in viste.items() if len(nomi) > 1}


def rendi(archivio, slug, risolto, avanza=print):
    """Chiede a `registra` tutte le scene coi loro tempi: lui salta quelle già rese con gli stessi tempi e gli stessi sorgenti (l'impronta accanto al file)."""
    chieste = richiesta(risolto, archivio.stile)
    ripetute = doppie(risolto)
    if ripetute:
        sigla, nomi = next(iter(ripetute.items()))
        raise Errore(f"le scene {', '.join(nomi)} usano la stessa animazione «{sigla}»: ognuna deve avere la sua, perché ognuna ha i suoi tempi",
                     f"scenes {', '.join(nomi)} use the same animation «{sigla}»: each must have its own, because each has its own timing")
    if not chieste:
        avanza(dice("animazioni: nessuna scena", "animations: no scenes"))
        return
    lavoro = archivio.lavoro(slug)
    registra(archivio, chieste, lavoro / "tempi.json", lavoro / "scene", avanza)


def _in_proprio(cartella, sigle):
    """I file delle scene `sigle` collegati a quelli di un altro video (un collegamento fisico: due nomi, un file solo) diventano copie: `registra` li riscrive
    sul posto, e l'altro video li vedrebbe cambiare."""
    for sigla in sigle:
        for nome in (f"{sigla}.mp4", f"{sigla}.mp4.impronta", f"{sigla}.alfa.mkv"):
            file = cartella / nome
            if file.exists() and file.stat().st_nlink > 1:
                copia = file.with_name(f".{file.name}.copia")
                shutil.copy2(file, copia)
                os.replace(copia, file)


def foto(archivio, slug, risolto, sigla, secondo, avanza=print):
    """Il fotogramma di una scena `secondo` dopo il suo inizio nel video, senza rendere la scena intera: `lavoro/foto/<sigla>.foto.png`."""
    cartella = archivio.lavoro(slug) / "foto"
    cartella.mkdir(parents=True, exist_ok=True)
    file_tempi = cartella / "tempi-foto.json"
    scrivi_json(file_tempi, {sigla: richiesta(risolto, archivio.stile)[sigla]}, indent=1)
    comando = shutil.which("bun")
    if comando is None:
        raise Errore("per rendere le animazioni serve bun, che non trovo: installalo o mettilo nel PATH",
                     "rendering the animations needs bun, which I cannot find: install it or add it to the PATH")
    esito = subprocess.run([comando, "run", "--cwd", "animazioni", "registra", "--", "--tempi", str(file_tempi), "--uscita", str(cartella), "--foto", f"{secondo:.4f}"],
                           cwd=archivio.repo, env=ambiente_di_lavoro(archivio), capture_output=True, encoding="utf-8", errors="replace")
    if esito.returncode != 0:
        raise Errore(f"il fotogramma dell'animazione non è stato reso: {(esito.stderr or esito.stdout).strip()[-600:]}",
                     f"the animation frame was not rendered: {(esito.stderr or esito.stdout).strip()[-600:]}")
    for riga in esito.stdout.splitlines():
        if riga.startswith(PREFISSI_RIGHE):
            avanza(riga)
    file = cartella / f"{sigla}.foto.png"
    if not file.exists():
        raise Errore(f"le animazioni hanno finito senza scrivere «{file.name}» in {cartella}",
                     f"the animations finished without writing «{file.name}» in {cartella}")
    return file


def registra(archivio, chieste, file_tempi, cartella, avanza=print):
    """Fa rendere ad `animazioni/` le scene `chieste` ({sigla: durata, ancore, tempi, formato, lingua}) in `cartella`: salta quelle già rese uguali."""
    cartella.mkdir(parents=True, exist_ok=True)
    _in_proprio(cartella, chieste)
    scrivi_json(file_tempi, chieste, indent=1)
    comando = shutil.which("bun")
    if comando is None:
        raise Errore("per rendere le animazioni serve bun, che non trovo: installalo o mettilo nel PATH",
                     "rendering the animations needs bun, which I cannot find: install it or add it to the PATH")
    esito = subprocess.run([comando, "run", "--cwd", "animazioni", "registra", "--", "--tempi", str(file_tempi), "--uscita", str(cartella)],
                           cwd=archivio.repo, env=ambiente_di_lavoro(archivio), capture_output=True, encoding="utf-8", errors="replace")
    if esito.returncode != 0:
        raise Errore(f"le animazioni non sono state rese: {(esito.stderr or esito.stdout).strip()[-600:]}",
                     f"the animations were not rendered: {(esito.stderr or esito.stdout).strip()[-600:]}")
    riassunto = None
    for riga in esito.stdout.splitlines():
        if riga.startswith(PREFISSI_RIGHE):
            avanza(riga)
            riassunto = RIASSUNTO.fullmatch(riga) or riassunto
    if riassunto is None:
        raise Errore("le animazioni non hanno detto quante scene hanno reso: `registra` doveva stampare «animazioni: rese N, già rese M»",
                     "the animations did not say how many scenes they rendered: `registra` was supposed to print «animations: rendered N, already rendered M»")
    for sigla in chieste:
        if not (cartella / f"{sigla}.mp4").exists():
            raise Errore(f"le animazioni hanno finito senza scrivere «{sigla}.mp4» in {cartella}",
                         f"the animations finished without writing «{sigla}.mp4» in {cartella}")
