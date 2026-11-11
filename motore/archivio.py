import copy
import json
import os
from functools import cached_property
from pathlib import Path

from jsonschema import Draft202012Validator

from .errori import Errore, FormatiMescolati, Frase

REPO = Path(__file__).resolve().parent.parent
VARIABILE_LAVORO = "MANGO_ANIMATION_LAVORO"


def cartella_di_lavoro():
    """La cartella dei dati di chi usa Mango Animation (`docs/ARCHITETTURA.md`, «La cartella di lavoro»): l'unico punto del motore e degli strumenti che la cerca."""
    indicata = os.environ.get(VARIABILE_LAVORO)
    if not indicata:
        raise Errore(f"manca la cartella di lavoro: indicala con la variabile {VARIABILE_LAVORO} (l'app la sceglie al primo avvio e la passa da sola)",
                     f"the working folder is missing: set it with the variable {VARIABILE_LAVORO} (the app chooses it at first start and passes it itself)")
    cartella = Path(indicata)
    if not cartella.is_dir():
        raise Errore(f"la cartella di lavoro «{indicata}» ({VARIABILE_LAVORO}) non c'è: crea la cartella o correggi la variabile",
                     f"the working folder «{indicata}» ({VARIABILE_LAVORO}) does not exist: create the folder or fix the variable")
    return cartella.resolve()


def ambiente_di_lavoro(archivio):
    """L'ambiente dei programmi che il motore lancia (bun, per le animazioni): la cartella di lavoro di questo archivio, anche dove la variabile non c'era."""
    return {**os.environ, VARIABILE_LAVORO: str(archivio.radice.parent)}


def archivio_di_lavoro():
    return cartella_di_lavoro() / "archivio"


def leggi_json(percorso, cosa, cosa_en):
    try:
        return json.loads(Path(percorso).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise Errore(f"manca {cosa}: {percorso}",
                     f"{cosa_en} is missing: {percorso}")
    except json.JSONDecodeError as e:
        raise Errore(f"{cosa} non è un JSON valido ({percorso}, riga {e.lineno}): {e.msg}",
                     f"{cosa_en} is not valid JSON ({percorso}, line {e.lineno}): {e.msg}")


def scrivi_con(destinazione, scrivi):
    """Scrive in un file accanto, con la stessa estensione, e lo mette a posto alla fine: chi osserva la cartella non vede mai un file a metà, e un lavoro che fallisce non ne lascia uno."""
    destinazione = Path(destinazione)
    destinazione.parent.mkdir(parents=True, exist_ok=True)
    parziale = destinazione.with_name(f".{destinazione.stem}.parziale{destinazione.suffix}")
    try:
        scrivi(parziale)
    except BaseException:
        parziale.unlink(missing_ok=True)
        raise
    os.replace(parziale, destinazione)


def scrivi_json(percorso, dati, **opzioni):
    scrivi_con(percorso, lambda dest: dest.write_text(json.dumps(dati, ensure_ascii=False, **opzioni), encoding="utf-8"))


def descrivi(errore):
    """Un errore di schema come lo leggerebbe chi scrive il piano."""
    percorso = "".join(f"[{p}]" if isinstance(p, int) else f".{p}" for p in errore.absolute_path).lstrip(".")
    dove, where = percorso or "il piano", percorso or "the plan"
    if errore.validator == "required":
        chiave = errore.message.split("'")[1]
        return Frase(f"{dove}: manca «{chiave}»", f"{where}: «{chiave}» is missing")
    if errore.validator == "additionalProperties":
        chiave = errore.message.split("'")[1]
        return Frase(f"{dove}: «{chiave}» non è una chiave che il piano conosce", f"{where}: «{chiave}» is not a key the plan knows")
    if errore.validator == "enum":
        valori = ", ".join(map(str, errore.validator_value))
        return Frase(f"{dove}: il valore dev'essere uno fra {valori}", f"{where}: the value must be one of {valori}")
    if errore.validator == "type":
        return Frase(f"{dove}: il tipo dev'essere {errore.validator_value}", f"{where}: the type must be {errore.validator_value}")
    if errore.validator == "pattern":
        return Frase(f"{dove}: «{errore.instance}» non ha la forma giusta", f"{where}: «{errore.instance}» does not have the right form")
    if errore.validator == "oneOf" and isinstance(errore.instance, dict):
        chiavi = ", ".join(sorted(errore.instance))
        return Frase(f"{dove}: va scritto in una sola delle sue forme (docs/PIANO.md), e ha {chiavi or 'nessuna chiave'}",
                     f"{where}: it must be written in exactly one of its forms (docs/PIANO.md), and it has {chiavi or 'no keys'}")
    return Frase(f"{dove}: {errore.message}", f"{where}: {errore.message}")


def unisci_stile(serie, creator):
    """Lo stile del creator sovrapposto a quello di serie (`docs/ARCHITETTURA.md`, «Lo stile»): gli oggetti si fondono chiave per chiave, ogni altro valore (numero, testo, lista, null) del creator sostituisce quello di serie."""
    if isinstance(serie, dict) and isinstance(creator, dict):
        return {**{k: unisci_stile(v, creator[k]) if k in creator else copy.deepcopy(v) for k, v in serie.items()},
                **{k: copy.deepcopy(v) for k, v in creator.items() if k not in serie}}
    return copy.deepcopy(creator)


def leggi_stile(repo, lavoro=None):
    """Lo stile di serie del prodotto (`<repo>/stile.json`) con sopra quello del creator (`<lavoro>/stile.json`), se la cartella di lavoro ne ha uno."""
    serie = leggi_json(Path(repo) / "stile.json", "lo stile (stile.json)", "the style (stile.json)")
    del_creator = Path(lavoro) / "stile.json" if lavoro else None
    if del_creator is None or not del_creator.is_file():
        return serie
    sopra = leggi_json(del_creator, "lo stile del creator", "the creator's style")
    if not isinstance(sopra, dict):
        raise Errore(f"lo stile del creator ({del_creator}) dev'essere un oggetto JSON",
                     f"the creator's style ({del_creator}) must be a JSON object")
    return unisci_stile(serie, sopra)


def unisci(base, piano):
    """Il piano con la sua `base` applicata: ciò che il piano non dichiara viene dalla base (docs/PIANO.md, `base`)."""
    fuori = {**copy.deepcopy(base), **{k: copy.deepcopy(v) for k, v in piano.items() if k not in ("base", "sorgenti", "scene", "sottotitoli")}}
    sorgenti = copy.deepcopy(base.get("sorgenti", {}))
    for nome, s in piano.get("sorgenti", {}).items():
        vecchia = sorgenti.get(nome, {})
        sorgenti[nome] = {**vecchia, **copy.deepcopy(s), **{k: {**vecchia.get(k, {}), **s.get(k, {})} for k in ("viste", "riquadri") if k in s or k in vecchia}}
    fuori["sorgenti"] = sorgenti
    scene = copy.deepcopy(base.get("scene", []))
    for scena in piano.get("scene", []):
        posto = next((n for n, v in enumerate(scene) if v["nome"] == scena["nome"]), None)
        if posto is None:
            scene.append(copy.deepcopy(scena))
        else:
            scene[posto] = copy.deepcopy(scena)
    fuori["scene"] = scene
    if "sottotitoli" in base or "sottotitoli" in piano:
        vecchi, nuovi = base.get("sottotitoli", {}), piano.get("sottotitoli", {})
        fuori["sottotitoli"] = {**copy.deepcopy(vecchi), **{k: copy.deepcopy(v) for k, v in nuovi.items()},
                                **{k: [*vecchi.get(k, []), *nuovi.get(k, [])] for k in ("nomi", "correzioni", "ritocchi") if k in vecchi or k in nuovi}}
    fuori.pop("base", None)
    return fuori


class Archivio:
    def __init__(self, radice=None, repo=None):
        self.repo = Path(repo) if repo else REPO
        self.radice = Path(radice).resolve() if radice else archivio_di_lavoro()

    def stile_su_disco(self):
        return leggi_stile(self.repo, self.radice.parent)

    @cached_property
    def stile(self):
        return self.stile_su_disco()

    def rileggi_stile(self):
        self.__dict__.pop("stile", None)

    def formato_di(self, quadro):
        """Il formato (largo, alto, fps) di un quadro: `verticale` se non dice altro."""
        nome = quadro.get("formato", "verticale")
        formato = self.stile["formati"].get(nome)
        if formato is None:
            raise Errore(f"il formato «{nome}» non c'è in stile.json: i formati sono {', '.join(self.stile['formati'])}",
                         f"the format «{nome}» is not in stile.json: the formats are {', '.join(self.stile['formati'])}")
        return formato

    def formato_del_piano(self, piano):
        """Il formato di un video: quello dei quadri delle sue scene, che dev'essere uno solo."""
        formati = {}
        for scena in piano["scene"]:
            nome_quadro = scena.get("quadro", piano.get("quadro"))
            quadro = self.stile["quadri"].get(nome_quadro)
            if quadro is None:
                raise Errore(f"il quadro «{nome_quadro}» (della scena «{scena['nome']}») non c'è in stile.json: i quadri sono {', '.join(self.stile['quadri'])}",
                             f"the frame «{nome_quadro}» (of scene «{scena['nome']}») is not in stile.json: the frames are {', '.join(self.stile['quadri'])}")
            formati.setdefault(quadro.get("formato", "verticale"), []).append(f"«{scena['nome']}» ({nome_quadro})")
        if len(formati) > 1:
            raise FormatiMescolati("le scene mescolano formati: " + "; ".join(f"{nome}: {', '.join(scene)}" for nome, scene in formati.items()) + ". Tutte le scene di un video hanno lo stesso formato: scegli quadri dello stesso formato",
                         "the scenes mix formats: " + "; ".join(f"{nome}: {', '.join(scene)}" for nome, scene in formati.items()) + ". All the scenes of a video have the same format: choose frames of the same format")
        nome = next(iter(formati))
        return {**self.formato_di({"formato": nome}), "nome": nome}

    def colore(self, nome):
        esadecimale = self.stile["colori"].get(nome)
        if esadecimale is None:
            raise Errore(f"lo stile non ha il colore «{nome}»: aggiungilo a `colori` in stile.json",
                         f"the style has no color «{nome}»: add it to `colori` in stile.json")
        return tuple(int(esadecimale[k:k + 2], 16) for k in (1, 3, 5))

    def font(self, nome):
        """Il file di un carattere dello stile: prima nella cartella di lavoro del creator (dove finiscono quelli che aggiunge), poi in quella del prodotto."""
        percorso = self.stile["caratteri"].get(nome)
        if percorso is None:
            raise Errore(f"lo stile non ha il carattere «{nome}»: aggiungilo a `caratteri` in stile.json",
                         f"the style has no font «{nome}»: add it to `caratteri` in stile.json")
        for cartella in (self.radice.parent, self.repo):
            if (cartella / percorso).is_file():
                return cartella / percorso
        raise Errore(f"il file del carattere «{nome}» ({percorso}) non c'è: rimettilo nella cartella `font` o scegli un altro carattere in stile.json",
                     f"the file of the font «{nome}» ({percorso}) is not there: put it back in the `font` folder or choose another font in stile.json")

    def schema(self, nome):
        return leggi_json(Path(__file__).parent / "schemi" / f"{nome}.schema.json", f"lo schema {nome}", f"the schema {nome}")

    def video(self, slug):
        cartella = self.radice / "video" / slug
        if not cartella.is_dir():
            raise Errore(f"il video «{slug}» non esiste in {self.radice / 'video'}",
                         f"the video «{slug}» does not exist in {self.radice / 'video'}")
        return cartella

    def lavoro(self, slug):
        return self.video(slug) / "lavoro"

    def uscite(self, slug):
        return self.video(slug) / "uscite"

    def grezzo(self, file):
        return self.radice / "grezzo" / file

    def preparati(self, file):
        giorno, _, nome = file.rpartition("/")
        return self.radice / "preparati" / giorno / nome

    def controlla_schema(self, dati, nome, cosa, cosa_en):
        errori = sorted(Draft202012Validator(self.schema(nome)).iter_errors(dati), key=lambda e: list(map(str, e.absolute_path)))
        if errori:
            raise Errore(f"{cosa} non è valido:\n" + "\n".join(f"  {descrivi(e)}" for e in errori),
                         f"{cosa_en} is not valid:\n" + "\n".join(f"  {descrivi(e).en}" for e in errori))

    def scheda(self, slug):
        dati = leggi_json(self.video(slug) / "scheda.json", f"la scheda di «{slug}»", f"the card of «{slug}»")
        self.controlla_schema(dati, "scheda", f"la scheda di «{slug}»", f"the card of «{slug}»")
        return dati

    def piano_scritto(self, slug):
        dati = leggi_json(self.video(slug) / "piano.json", f"il piano di «{slug}»", f"the plan of «{slug}»")
        self.controlla_schema(dati, "piano", f"il piano di «{slug}»", f"the plan of «{slug}»")
        return dati

    def piano(self, slug, _vista=()):
        """Il piano di un video con la sua `base` già applicata."""
        if slug in _vista:
            raise Errore(f"i piani si richiamano in cerchio: {' → '.join([*_vista, slug])}",
                         f"the plans call each other in a circle: {' → '.join([*_vista, slug])}")
        scritto = self.piano_scritto(slug)
        if "base" not in scritto:
            return scritto
        try:
            base = self.piano(scritto["base"], (*_vista, slug))
        except Errore as e:
            raise Errore(f"il piano di «{slug}» parte da «{scritto['base']}», che non va: {e.it}",
                         f"the plan of «{slug}» starts from «{scritto['base']}», which is not valid: {e.en}")
        return unisci(base, scritto)


def _animazioni_note(archivio):
    """Le sigle delle scene di `animazioni/`, o None se non si riesce a chiederle."""
    import shutil
    import subprocess

    bun = shutil.which("bun")
    if bun is None or not (archivio.repo / "animazioni" / "package.json").is_file():
        return None
    esito = subprocess.run([bun, "run", "--cwd", "animazioni", "elenco"], cwd=archivio.repo, env=ambiente_di_lavoro(archivio), capture_output=True, encoding="utf-8", errors="replace")
    if esito.returncode != 0:
        return None
    try:
        return {scena["sigla"] for scene in json.loads(esito.stdout.strip().splitlines()[-1]).values() for scena in scene}
    except (json.JSONDecodeError, KeyError, IndexError):
        return None


def senza_voce(girato, strati, nome_quadro):
    """Perché un pezzo senza voce (`durata`, col suo `girato` o senza) non può stare nel quadro che mostra questi `strati` oltre l'animazione; None se può."""
    if not girato and strati:
        return Frase(f"un pezzo senza voce (`durata`) non ha girato, e il quadro «{nome_quadro}» lo mostra: dagli un `girato` o scegli un quadro con la sola animazione",
                     f"a piece without voice (`durata`) has no footage, and the frame «{nome_quadro}» shows it: give it a `girato` or choose a frame with the animation only")
    if girato and "girato" not in strati:
        return Frase(f"un pezzo senza voce prende il girato da «{girato['sorgente']}», ma il quadro «{nome_quadro}» non mostra un girato",
                     f"a piece without voice takes the footage from «{girato['sorgente']}», but the frame «{nome_quadro}» does not show footage")
    if girato and "sagoma" in strati:
        return Frase(f"un pezzo senza voce (`durata`) non ha la ripresa di chi parla, e il quadro «{nome_quadro}» mostra la sagoma: scegli un quadro senza sagoma (come girato-pieno)",
                     f"a piece without voice (`durata`) has no shot of the speaker, and the frame «{nome_quadro}» shows the silhouette: choose a frame without silhouette (like girato-pieno)")
    return None


def valida(archivio, slug, controlla_animazioni=True):
    """Schema e riferimenti del piano: (errori, avvisi), ognuno una frase che dice cosa correggere."""
    from .risolvi import file_del_suono
    from .sorgenti import Sorgente

    try:
        piano = archivio.piano(slug)
    except Errore as e:
        return [Frase(e.it, e.en)], []
    errori, avvisi, stile = [], [], archivio.stile
    quadri = stile["quadri"]
    sorgenti = {}
    for nome, spec in piano["sorgenti"].items():
        try:
            sorgenti[nome] = Sorgente(archivio, slug, nome, spec, piano.get("sottotitoli", {}))
        except Errore as e:
            errori.append(Frase(e.it, e.en))
    if piano["quadro"] not in quadri:
        errori.append(Frase(f"il quadro «{piano['quadro']}» non c'è in stile.json: i quadri sono {', '.join(quadri)}",
                            f"the frame «{piano['quadro']}» is not in stile.json: the frames are {', '.join(quadri)}"))
    usate, animazioni = set(), {}
    for scena in piano["scene"]:
        nome_quadro = scena.get("quadro", piano["quadro"])
        dove = f"la scena «{scena['nome']}»"
        dove_en = f"scene «{scena['nome']}»"
        quadro = quadri.get(nome_quadro)
        if quadro is None:
            errori.append(Frase(f"{dove} usa il quadro «{nome_quadro}», che non c'è in stile.json: i quadri sono {', '.join(quadri)}",
                                f"{dove_en} uses the frame «{nome_quadro}», which is not in stile.json: the frames are {', '.join(quadri)}"))
            continue
        strati = [s["tipo"] for s in quadro["strati"]]
        if "animazione" in strati and not scena.get("animazione"):
            errori.append(Frase(f"{dove} usa il quadro «{nome_quadro}», che mostra un'animazione, ma non ne dichiara una (`animazione`)",
                                f"{dove_en} uses the frame «{nome_quadro}», which shows an animation, but it declares none (`animazione`)"))
        if scena.get("animazione") and "animazione" not in strati:
            errori.append(Frase(f"{dove} ha un'animazione ma il quadro «{nome_quadro}» non ne mostra: scegli un quadro con lo strato `animazione`",
                                f"{dove_en} has an animation but the frame «{nome_quadro}» shows none: choose a frame with the `animazione` layer"))
        if "inserto" in strati and "girato" not in strati:
            errori.append(Frase(f"il quadro «{nome_quadro}» ha un `inserto` ma nessuno strato `girato`: l'inserto sta nell'angolo del girato",
                                f"the frame «{nome_quadro}» has an `inserto` but no `girato` layer: the inset sits in the corner of the footage"))
        if scena.get("animazione"):
            animazioni.setdefault(scena["animazione"], []).append(scena["nome"])
        di_scena = {p.get("sorgente") for p in scena["pezzi"]}
        for ancora in scena.get("ancore", []):
            if ancora[0] not in di_scena:
                errori.append(Frase(f"{dove} ha un'ancora su «{ancora[0]}», che nessun suo pezzo usa",
                                    f"{dove_en} has an anchor on «{ancora[0]}», which none of its pieces uses"))
        for parola, (nome_sorgente, _) in scena.get("parole", {}).items():
            if nome_sorgente not in di_scena:
                errori.append(Frase(f"{dove} dice la parola «{parola}» su «{nome_sorgente}», che nessun suo pezzo usa",
                                    f"{dove_en} says the word «{parola}» on «{nome_sorgente}», which none of its pieces uses"))
        for numero, pezzo in enumerate(scena["pezzi"], 1):
            qui = f"{dove}, pezzo {numero}"
            qui_en = f"{dove_en}, piece {numero}"
            if "durata" in pezzo:
                muto = pezzo.get("girato")
                problema = senza_voce(muto, set(strati) - {"animazione"}, nome_quadro)
                if problema:
                    errori.append(Frase(f"{qui}: {problema}", f"{qui_en}: {problema.en}"))
                elif muto and muto["sorgente"] not in piano["sorgenti"]:
                    errori.append(Frase(f"{qui} prende il girato da «{muto['sorgente']}», che il piano non dichiara fra le `sorgenti`",
                                        f"{qui_en} takes the footage from «{muto['sorgente']}», which the plan does not declare among the `sorgenti`"))
                elif muto:
                    usate.add(muto["sorgente"])
                    vista, viste = pezzo.get("vista", scena.get("vista")), piano["sorgenti"][muto["sorgente"]].get("viste", {})
                    if vista and vista not in viste:
                        errori.append(Frase(f"{qui} chiede la vista «{vista}», che la sorgente «{muto['sorgente']}» non ha: ci sono {', '.join(viste) or 'nessuna'}",
                                            f"{qui_en} asks for the view «{vista}», which the source «{muto['sorgente']}» does not have: there are {', '.join(viste) or 'none'}"))
                    if "a" in muto and muto["a"] <= muto["da"]:
                        errori.append(Frase(f"{qui}: il girato va da {muto['da']} a {muto['a']} s di «{muto['sorgente']}»: `a` dev'essere dopo `da`",
                                            f"{qui_en}: the footage goes from {muto['da']} to {muto['a']} s of «{muto['sorgente']}»: `a` must come after `da`"))
                continue
            nome_sorgente = pezzo["sorgente"]
            usate.add(nome_sorgente)
            if nome_sorgente not in piano["sorgenti"]:
                errori.append(Frase(f"{qui} usa la sorgente «{nome_sorgente}», che il piano non dichiara fra le `sorgenti`",
                                    f"{qui_en} uses the source «{nome_sorgente}», which the plan does not declare among the `sorgenti`"))
                continue
            spec = piano["sorgenti"][nome_sorgente]
            vista = pezzo.get("vista", scena.get("vista"))
            # La vista inquadra ciò che lo strato `girato` mostra: la ripresa del pezzo o quella di `girato`.
            inquadrata = pezzo.get("girato", {}).get("sorgente", nome_sorgente)
            viste = piano["sorgenti"].get(inquadrata, {}).get("viste", {})
            if vista and inquadrata in piano["sorgenti"] and vista not in viste:
                errori.append(Frase(f"{qui} chiede la vista «{vista}», che la sorgente «{inquadrata}» non ha: ci sono {', '.join(viste) or 'nessuna'}",
                                    f"{qui_en} asks for the view «{vista}», which the source «{inquadrata}» does not have: there are {', '.join(viste) or 'none'}"))
            altrove = pezzo.get("sagoma", {}).get("sorgente")
            if altrove and altrove not in piano["sorgenti"]:
                errori.append(Frase(f"{qui} prende la sagoma da «{altrove}», che il piano non dichiara fra le `sorgenti`",
                                    f"{qui_en} takes the silhouette from «{altrove}», which the plan does not declare among the `sorgenti`"))
            elif altrove and not any(s["tipo"] == "sagoma" for s in quadro["strati"]):
                errori.append(Frase(f"{qui} prende la sagoma da «{altrove}», ma il quadro «{nome_quadro}» non mostra una sagoma",
                                    f"{qui_en} takes the silhouette from «{altrove}», but the frame «{nome_quadro}» does not show a silhouette"))
            elif altrove:
                usate.add(altrove)
            dietro = pezzo.get("girato", {}).get("sorgente")
            if dietro and dietro not in piano["sorgenti"]:
                errori.append(Frase(f"{qui} prende il girato da «{dietro}», che il piano non dichiara fra le `sorgenti`",
                                    f"{qui_en} takes the footage from «{dietro}», which the plan does not declare among the `sorgenti`"))
            elif dietro and not any(s["tipo"] == "girato" for s in quadro["strati"]):
                errori.append(Frase(f"{qui} prende il girato da «{dietro}», ma il quadro «{nome_quadro}» non mostra un girato",
                                    f"{qui_en} takes the footage from «{dietro}», but the frame «{nome_quadro}» does not show footage"))
            elif dietro:
                usate.add(dietro)
            girato = pezzo.get("girato", {})
            if "a" in girato and girato["a"] <= girato["da"]:
                errori.append(Frase(f"{qui}: il girato va da {girato['da']} a {girato['a']} s di «{dietro}»: `a` dev'essere dopo `da`",
                                    f"{qui_en}: the footage goes from {girato['da']} to {girato['a']} s of «{dietro}»: `a` must come after `da`"))
            for strato in quadro["strati"]:
                if strato["tipo"] == "riquadro" and strato["nome"] not in spec.get("riquadri", {}):
                    errori.append(Frase(f"{qui}: il quadro «{nome_quadro}» mostra il riquadro «{strato['nome']}», che la sorgente «{nome_sorgente}» non dichiara in `riquadri`",
                                        f"{qui_en}: the frame «{nome_quadro}» shows the box «{strato['nome']}», which the source «{nome_sorgente}» does not declare in `riquadri`"))
                if strato["tipo"] == "viso":
                    altra = spec.get("viso", {}).get("sorgente")
                    if strato["nome"] not in spec.get("riquadri", {}) and not altra:
                        errori.append(Frase(f"{qui}: il quadro «{nome_quadro}» mostra il viso, che la sorgente «{nome_sorgente}» non ha: dichiara un riquadro «{strato['nome']}» in `riquadri` o una seconda sorgente in `viso`",
                                            f"{qui_en}: the frame «{nome_quadro}» shows the face, which the source «{nome_sorgente}» does not have: declare a box «{strato['nome']}» in `riquadri` or a second source in `viso`"))
                    elif altra and altra not in piano["sorgenti"]:
                        errori.append(Frase(f"{qui}: il viso di «{nome_sorgente}» è la sorgente «{altra}», che il piano non dichiara fra le `sorgenti`",
                                            f"{qui_en}: the face of «{nome_sorgente}» is the source «{altra}», which the plan does not declare among the `sorgenti`"))
                    elif altra:
                        usate.add(altra)
            if "da" in pezzo and "a" in pezzo and pezzo["a"] <= pezzo["da"]:
                errori.append(Frase(f"{qui}: `a` ({pezzo['a']}) viene prima di `da` ({pezzo['da']})",
                                    f"{qui_en}: `a` ({pezzo['a']}) comes before `da` ({pezzo['da']})"))
            if "dice" in pezzo and nome_sorgente in sorgenti:
                try:
                    sorgenti[nome_sorgente].scegli(pezzo["minuto"], pezzo["dice"])
                except Errore as e:
                    errori.append(Frase(f"{qui}: {e.it}",
                                        f"{qui_en}: {e.en}"))
    try:
        archivio.formato_del_piano(piano)
    except FormatiMescolati as e:
        errori.append(Frase(e.it, e.en))
    except Errore:
        pass  # un quadro o un formato che non c'è lo ha già detto il controllo dei quadri, qui sopra
    for sigla, nomi in animazioni.items():
        if len(nomi) > 1:
            errori.append(Frase(f"le scene {', '.join(nomi)} usano la stessa animazione «{sigla}»: ognuna deve avere la sua",
                                f"scenes {', '.join(nomi)} use the same animation «{sigla}»: each must have its own"))
    note = _animazioni_note(archivio) if animazioni and controlla_animazioni else None
    if animazioni and controlla_animazioni and note is None:
        avvisi.append(Frase("non ho potuto chiedere ad `animazioni/` quali scene esistono: le sigle non sono controllate",
                            "I could not ask `animazioni/` which scenes exist: the codes are not checked"))
    for sigla in animazioni:
        if note is not None and sigla not in note:
            errori.append(Frase(f"l'animazione «{sigla}» non esiste fra le scene di `animazioni/`: ci sono {', '.join(sorted(note))}",
                                f"the animation «{sigla}» is not among the scenes of `animazioni/`: there are {', '.join(sorted(note))}"))
    for nome in piano["sorgenti"]:
        if nome not in usate:
            avvisi.append(Frase(f"la sorgente «{nome}» è dichiarata ma nessun pezzo la usa",
                                f"the source «{nome}» is declared but no piece uses it"))
    titolo = piano.get("titolo")
    if titolo and "da" in titolo and "a" in titolo and titolo["a"] <= titolo["da"]:
        errori.append(Frase("il titolo finisce prima di cominciare: `a` dev'essere dopo `da`",
                            "the title ends before it starts: `a` must come after `da`"))
    nomi_scene = [s["nome"] for s in piano["scene"]]
    for suono in piano.get("suoni", []):
        if "scena" in suono and suono["scena"] not in nomi_scene:
            errori.append(Frase(f"il suono «{suono['file']}» parte nella scena «{suono['scena']}», che il piano non ha: le scene sono {', '.join(nomi_scene)}",
                                f"the sound «{suono['file']}» starts in the scene «{suono['scena']}», which the plan does not have: the scenes are {', '.join(nomi_scene)}"))
        elif "sorgente" in suono and suono["sorgente"] not in usate:
            errori.append(Frase(f"il suono «{suono['file']}» parte su «{suono['sorgente']}», che nessuna scena usa",
                                f"the sound «{suono['file']}» starts on «{suono['sorgente']}», which no scene uses"))
        try:
            file_del_suono(archivio, slug, suono["file"])
        except Errore as e:
            errori.append(Frase(e.it, e.en))
    return errori, avvisi
