import datetime
import difflib
import re
import subprocess
import time
from collections import deque

import numpy as np

from . import allinea, prepara
from .allinea import suoni
from .profilo import attiva
from .archivio import leggi_json, scrivi_json
from .errori import Errore, dice
from .media import FREQUENZA, info, pcm_16k
from .monta import Fasi
from .sottotitoli import chiave
from .voce import PASSO, livello, serie


def sente(x, stile, lingua):
    segmenti, _ = prepara.modello_voce(stile).transcribe(x, language=lingua, condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segmenti)


def per_lingua(archivio, slug, risolto):
    """Il montato a tratti della stessa lingua, di fila: [(lingua, da, a, indici dei tratti)], secondi del montato, da 0 alla fine.
    La lingua di un tratto è quella del suo girato (la scheda del file nel grezzo), altrimenti quella dello stile; un pezzo senza voce
    sta con quelli prima."""
    base = archivio.stile["preparati"]["lingua"]
    lingue = {nome: prepara.lingua_del_file(archivio.grezzo(spec["file"])) or base for nome, spec in archivio.piano(slug)["sorgenti"].items()}
    gruppi = []
    for k, t in enumerate(risolto["tratti"]):
        lingua = lingue[t["sorgente"]] if t["sorgente"] else (gruppi[-1][0] if gruppi else base)
        if gruppi and gruppi[-1][0] == lingua:
            gruppi[-1][3].append(k)
        else:
            gruppi.append((lingua, t["esce"] if gruppi else 0.0, None, [k]))
    fine = [g[1] for g in gruppi[1:]] + [risolto["durata"]]
    return [(lingua, da, a, set(tratti)) for (lingua, da, _, tratti), a in zip(gruppi, fine)]


def _dal_fotogramma(salta):
    """Il filtro che butta i primi `salta` fotogrammi (la copertina in testa), e il suo posto davanti a un altro filtro."""
    return f"trim=start_frame={salta},setpts=PTS-STARTPTS," if salta else ""


def lampi(finale, c, salta=0):
    """I fotogrammi isolati del montato (dopo i primi `salta`, la copertina): diversi da quello prima e da quello dopo, che fra loro si somigliano. È il lampo di un tratto che parte o finisce senza un suo strato."""
    i = info(finale)
    largo = c["lato"]
    alto = round(i["alto"] * largo / i["largo"] / 2) * 2
    esito = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(finale), "-an", "-vf", f"{_dal_fotogramma(salta)}scale={largo}:{alto}", "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True)
    if esito.returncode != 0:
        raise Errore(f"non riesco a leggere i fotogrammi di {finale}: {esito.stderr.decode(errors='replace').strip()[-300:]}",
                     f"I cannot read the frames of {finale}: {esito.stderr.decode(errors='replace').strip()[-300:]}")
    f = np.frombuffer(esito.stdout, dtype=np.uint8).reshape(-1, alto, largo).astype(np.int16)
    if len(f) < 3:
        return []
    vicini, alterni = np.abs(f[1:] - f[:-1]).mean(axis=(1, 2)), np.abs(f[2:] - f[:-2]).mean(axis=(1, 2))
    return [{"a": round(n / i["fps"], 2), "salto": round(float(min(vicini[n - 1], vicini[n])), 1)} for n in range(1, len(f) - 1)
            if min(vicini[n - 1], vicini[n]) > c["salto"] and alterni[n - 1] < c["ritorno"] * min(vicini[n - 1], vicini[n])]


def fotogrammi(file, lato, primo=False, salta=0):
    """I fotogrammi di un video in grigio, larghi `lato` pixel, uno alla volta (righe × colonne), dopo i primi `salta`; con `primo` solo il primo."""
    i = info(file)
    alto = round(i["alto"] * lato / i["largo"] / 2) * 2
    processo = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-i", str(file), "-an", *(["-frames:v", "1"] if primo else []), "-vf", f"{_dal_fotogramma(salta)}scale={lato}:{alto}", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    with processo:
        while len(dati := processo.stdout.read(alto * lato)) == alto * lato:
            yield np.frombuffer(dati, dtype=np.uint8).reshape(alto, lato)
        errore = processo.stderr.read()
    if processo.returncode != 0:
        raise Errore(f"non riesco a leggere i fotogrammi di {file}: {errore.decode(errors='replace').strip()[-300:]}",
                     f"I cannot read the frames of {file}: {errore.decode(errors='replace').strip()[-300:]}")


def _zona(quadro):
    """La fascia sopra la sagoma, [x0, y0, x1, y1]: quella dell'animazione, o il girato dove il quadro non ha animazione."""
    if "fascia_animazione" in quadro:
        return quadro["fascia_animazione"]
    x, y, w, h = next(s["area"] for s in quadro["strati"] if s["tipo"] == "girato")
    return [x, y, x + w, y + h]


def _ritaglio(zona, k):
    x0, y0, x1, y1 = (round(v * k) for v in zona)
    return slice(y0, y1), slice(x0, x1)


def _occupata(pixel, c):
    """Quanta parte della fascia ha qualcosa sopra: le celle di una griglia (`griglia`: colonne, righe) in cui più di `piena` dei pixel si stacca
    di oltre `soglia` dal colore di fondo (il valore di mezzo). Un colore solo, o una scritta piccola in mezzo, la lasciano quasi vuota."""
    staccati = np.abs(pixel.astype(np.int16) - int(np.median(pixel))) > c["soglia"]
    colonne, righe = c["griglia"]
    celle = [cella.mean() > c["piena"] for fascia in np.array_split(staccati, righe, axis=0) for cella in np.array_split(fascia, colonne, axis=1)]
    return sum(celle) / len(celle)


def zona_alta(finale, fps, risolto, stile, salta=0):
    """La fascia sopra la sagoma ferma o quasi vuota per più di `secondi`, nei quadri di `zona_alta.quadri`: anche fra due scene e su uno
    schermo registrato fermo. Ferma: fra un fotogramma e quello `distanza` secondi prima cambia meno di `mosso` dei pixel. Si guarda il montato
    largo `lato` pixel, un fotogramma alla volta."""
    c = stile["controllo"]["zona_alta"]
    k, d = c["lato"] / risolto["formato"]["largo"], round(c["distanza"] * fps)
    intervalli = [(round(s["inizio"] * fps), round((s["inizio"] + s["durata"]) * fps), _ritaglio(_zona(stile["quadri"][s["quadro"]]), k)) for s in risolto["scene"] if s["quadro"] in c["quadri"]]
    if not intervalli:
        return []
    vuota, ferma, recenti = [], [], deque(maxlen=d)
    for n, fotogramma in enumerate(fotogrammi(finale, c["lato"], salta=salta)):
        z = next((z for da, a, z in intervalli if da <= n < a), None)
        pezzo = fotogramma[z].astype(np.int16) if z else None
        prima_z, prima = recenti[0] if len(recenti) == d else (None, None)
        vuota.append(z is not None and _occupata(pezzo, c) < c["occupata"])
        ferma.append(z is not None and prima_z == z and np.mean(np.abs(pezzo - prima) > c["soglia"]) < c["mosso"])
        recenti.append((z, pezzo))
    fuori = [{"a": round(a / fps, 2), "dura": round((b - a) / fps, 2), "cosa": "vuota"} for a, b in serie(np.array(vuota)) if (b - a) / fps > c["secondi"]]
    fuori += [{"a": round((a - d) / fps, 2), "dura": round((b - a + d) / fps, 2), "cosa": "ferma"} for a, b in serie(np.array(ferma)) if (b - a + d) / fps > c["secondi"]]
    return sorted(fuori, key=lambda z: z["a"])


def copertina(uscite, risolto, stile):
    """`con-copertina.mp4` che manca, più vecchio del montato, o col primo fotogramma quasi vuoto (nella fascia sopra la sagoma, se il
    quadro della prima scena ne ha una in `zona_alta.quadri`, altrimenti tutto)."""
    c = stile["controllo"]["zona_alta"]
    file = uscite / "con-copertina.mp4"
    if not file.exists():
        return [{"cosa": "manca"}]
    fuori = [{"cosa": "vecchia"}] if file.stat().st_mtime < (uscite / "finale.mp4").stat().st_mtime else []
    primo = list(fotogrammi(file, c["lato"], primo=True))[0]
    quadro = risolto["scene"][0]["quadro"]
    pixel = primo[_ritaglio(_zona(stile["quadri"][quadro]), primo.shape[1] / risolto["formato"]["largo"])] if quadro in c["quadri"] else primo
    occupata = _occupata(pixel, c)
    return fuori + ([{"cosa": "vuota", "occupata": round(occupata, 2)}] if occupata < c["occupata"] else [])


def colpi(x, risolto, stile):
    """I colpi di tasto dopo l'ultima parola di ogni tratto: un attacco secco, sopra il silenzio di prima di `salto_db`, che dopo `durata` è già
    tornato sotto di altrettanto. Lo scoppio di una consonante (la «t» di «otto») è seguito dalla voce, e non conta."""
    c = stile["controllo"]["colpi"]
    campioni = round(c["passo"] * FREQUENZA)
    n = len(x) // campioni
    db = 10 * np.log10((x[:n * campioni].reshape(n, campioni) ** 2).mean(axis=1) + 1e-10)
    minimo = np.percentile(db, stile["controllo"]["percentile"]) - c["sotto_voce_db"]
    prima, dura = round(c["prima"] / c["passo"]), round(c["durata"] / c["passo"])
    ultime = {w["tratto"]: w for w in risolto["parole"]}
    trovati = []
    for k, w in sorted(ultime.items()):
        t = risolto["tratti"][k]
        i, fine = round(w["da"] / c["passo"]), min(n, round((t["esce"] + t["durata"]) / c["passo"]))
        # Il silenzio dopo il colpo deve stare tutto nel tratto: al bordo comincia il tratto dopo, che non è un silenzio.
        while i + dura + prima <= fine:
            prima_di, dopo = db[max(0, i - prima):max(0, i - 1)], db[i + dura:i + dura + prima]
            if db[i] >= minimo and len(prima_di) and max(prima_di.max(), dopo.max()) <= db[i] - c["salto_db"]:
                trovati.append({"tratto": k, "a": round(i * c["passo"], 2), "dopo": w["p"]})
                i += dura
            i += 1
    return trovati


def senza_parole(dette, durata, pausa):
    """Il girato tenuto prima della prima parola e dopo l'ultima, oltre la pausa: i vuoti fra due parole li conta `esitazioni`."""
    lati = ((0.0, dette[0]["da"]), (dette[-1]["a"], durata)) if dette else ((0.0, durata),)
    return [{"a": round(da, 2), "dura": round(a - da, 2)} for da, a in lati if a - da > pausa]


def doppioni(dette, sentito):
    """Una parola o una coppia di parole ripetuta di fila in ciò che si sente («poi poi», «27 miliardi 27 miliardi»), che il testo voluto non ha."""
    voluto = [chiave(w["p"]) for w in dette]
    sentite = [p for p in sentito.split() if chiave(p)]
    ascoltato = [chiave(p) for p in sentite]
    dove = [0] * len(ascoltato)
    for tipo, a1, _, b1, b2 in difflib.SequenceMatcher(None, voluto, ascoltato, autojunk=False).get_opcodes():
        for j in range(b1, b2):
            dove[j] = a1 + (j - b1) if tipo == "equal" else a1
    nel_voluto = lambda g: any(voluto[k:k + 2 * len(g)] == g * 2 for k in range(len(voluto)))
    fuori, j = [], 0
    while j < len(ascoltato):
        n = next((n for n in (1, 2) if j + 2 * n <= len(ascoltato) and ascoltato[j:j + n] == ascoltato[j + n:j + 2 * n] and not nel_voluto(ascoltato[j:j + n])), None)
        if n is None:
            j += 1
            continue
        fuori.append({"a": dette[min(dove[j], len(dette) - 1)]["da"] if dette else 0.0, "parole": " ".join(sentite[j:j + 2 * n])})
        j += 2 * n
    return fuori


def battute_fissate(md):
    """Le battute della tabella di `materiali/testo-registrato.md`, di fila: la colonna «battuta», senza i segni delle cuciture (`|`)."""
    battute = []
    for riga in md.splitlines():
        if not riga.strip().startswith("|"):
            continue
        celle = [c.strip() for c in re.split(r"(?<!\\)\|", riga.strip().strip("|"))]
        if celle[0].isdigit() and len(celle) >= 4:
            battute.append(" ".join(" ".join(celle[1:-2]).replace("\\|", " ").split()))
    return " ".join(battute)


def _segni(testo):
    """Le parole (come le confronta la trascrizione) e i «?» e «!»: i soli segni che i sottotitoli tengono. Accanto, com'erano scritti."""
    segni = []
    for p in testo.split():
        segni += [(chiave(p), re.sub(r"[?!]", "", p))] if chiave(p) else []
        segni += [(m, m) for m in re.findall(r"[?!]", p)]
    return segni


def contro_il_testo(battute, testo):
    """I sottotitoli del montato contro il testo fissato: parole diverse, mancanti o in più, e «?» o «!» persi."""
    scritti = [(segno, b["da"]) for b in battute for segno in _segni(b["testo"].replace("*", ""))]
    voluti = _segni(testo)
    fuori = []
    for tipo, a1, a2, b1, b2 in difflib.SequenceMatcher(None, [s[0] for s in voluti], [s[0][0] for s in scritti], autojunk=False).get_opcodes():
        if tipo == "equal":
            continue
        dove = b1 if b2 > b1 else max(b1 - 1, 0)
        fuori.append({"a": scritti[min(dove, len(scritti) - 1)][1] if scritti else 0.0, "voluto": " ".join(s[1] for s in voluti[a1:a2]), "scritto": " ".join(s[0][1] for s in scritti[b1:b2])})
    return fuori


def _quieto_da(quieto, verso_coda):
    """Quanto dura il silenzio dal bordo di un tratto verso l'interno, in secondi."""
    pezzo = quieto[::-1] if verso_coda else quieto
    return (len(pezzo) if pezzo.all() else int(np.argmin(pezzo))) * PASSO


def bordi(quieto, risolto, stile):
    """I bordi dei tratti che non vanno: silenzio oltre `muto` in testa o in coda, suono oltre `rumore` fra il bordo e la parola sicura più vicina,
    taglio nella voce (il livello a cui ha tagliato `risolvi` è sopra `voce_db`). Il silenzio in fondo al video lo decide il piano (`coda`): non conta."""
    c, ap = stile["controllo"]["bordi"], stile["taglio"]["a_parole"]
    sicura = lambda w: w["voto"] is not None and w["voto"] >= ap["voto_bordo"] and suoni(w["p"]) != "*"
    di_tratto = {}
    for w in risolto["parole"]:
        di_tratto.setdefault(w["tratto"], []).append(w)
    fuori = []
    for k, t in enumerate(risolto["tratti"]):
        da, a = t["esce"], t["esce"] + t["durata"]
        mio = quieto[round(da / PASSO):round(a / PASSO)]
        parole = di_tratto.get(k, [])
        primo, ultimo = (parole[0] if parole and sicura(parole[0]) else None), (parole[-1] if parole and sicura(parole[-1]) else None)
        lati = (("testa", da, _quieto_da(mio, False), False, t["legato"][0], primo and (da, primo["da"])),
                ("coda", a, _quieto_da(mio, True), k == len(risolto["tratti"]) - 1, t["legato"][1], ultimo and (ultimo["a"], a)))
        for lato, quando, muto, voluto, db, tra in lati:
            if muto > c["muto"] and not voluto:
                fuori.append({"tratto": k, "lato": lato, "a": round(quando, 2), "cosa": "muto", "dura": round(muto, 2)})
            elif tra and tra[1] - tra[0] > c["rumore"] and not quieto[round(tra[0] / PASSO):round(tra[1] / PASSO)].all():
                fuori.append({"tratto": k, "lato": lato, "a": round(quando, 2), "cosa": "rumore", "dura": round(tra[1] - tra[0], 2)})
            if db is not None and db >= c["voce_db"]:
                fuori.append({"tratto": k, "lato": lato, "a": round(quando, 2), "cosa": "voce", "db": round(db, 1)})
    return fuori


NUMERO = re.compile(r"\d|%|[A-Z]{2}")


def esitazioni(dette, pausa):
    """I vuoti fra due parole oltre la pausa. `numero` se una delle due è un numero o una sigla («67», «10,5 GB», «7%»): l'allineamento
    non sa quanto dura detta a voce, e il vuoto è spesso la parola stessa; si riascolta prima di tagliare."""
    return [{"a": round(w["a"], 2), "dura": round(dopo["da"] - w["a"], 2), "fra": [w["p"], dopo["p"]], "numero": bool(NUMERO.search(w["p"] + " " + dopo["p"]))}
            for w, dopo in zip(dette, dette[1:]) if dopo["da"] - w["a"] > pausa]


def controlla(archivio, slug, avanza=print, allineatore=None, trascrittore=None):
    """Il montato riascoltato e riguardato: i fotogrammi che lampeggiano, i silenzi rimasti, i vuoti fra due parole (esitazioni che la trascrizione non scrive), il girato senza parole
    in testa e in coda, i colpi di tasto dopo l'ultima parola, ogni parola ritrovata dove dovrebbe stare, i tagli dentro il parlato, ciò che ci sente la trascrizione e i suoi doppioni, le parole troppo lunghe,
    i sottotitoli contro il testo fissato, la fascia sopra la sagoma ferma o vuota, la copertina.
    `allineatore` e `trascrittore` sono quelli veri salvo nelle prove."""
    stile = archivio.stile
    c = stile["controllo"]
    file_risolto, finale = archivio.lavoro(slug) / "risolto.json", archivio.uscite(slug) / "finale.mp4"
    if not file_risolto.exists() or not finale.exists():
        raise Errore(f"per controllare servono il risolto e il montato: lancia `python -m motore monta {slug}`",
                     f"checking needs the resolved plan and the edited video: run `python -m motore monta {slug}`")
    risolto = leggi_json(file_risolto, "il risolto", "the resolved plan")
    fasi = Fasi(archivio, slug, risolto["impronta"], avanza)
    video = info(finale)
    montato_da = fasi.uscite.get("finale")
    diverso = montato_da != risolto["impronta"] if montato_da else abs(video["durata"] - risolto["durata"]) > c["scarto_montato"]
    if diverso:
        raise Errore(f"il montato non è del piano di adesso (dura {video['durata']:.1f} s, il piano {risolto['durata']:.1f} s): lancia `python -m motore monta {slug}`",
                     f"the edited video is not from the current plan (it lasts {video['durata']:.1f} s, the plan {risolto['durata']:.1f} s): run `python -m motore monta {slug}`")
    avanza(dice("ascolto il montato", "listening to the edit"))
    inizio = time.perf_counter()
    # Con la copertina il montato comincia con un fotogramma in più: i tempi del piano partono dal secondo.
    salta, durata = (1 if risolto.get("copertina") else 0), video["durata"]
    durata -= salta / video["fps"]
    x = pcm_16k(finale, salta / video["fps"], durata) if salta else pcm_16k(finale)
    db = livello(x)
    dette = risolto["parole"]
    fine_parlato = dette[-1]["a"] if dette else risolto["durata"]
    pausa = max(stile["taglio"]["a_tempo"]["pausa"], stile["taglio"]["a_parole"]["pausa"]) + c["pausa_oltre"]
    quieto = db < np.percentile(db, c["percentile"]) - c["calo_db"]
    silenzi = [{"a": round(a * PASSO, 2), "dura": round((b - a) * PASSO, 2)} for a, b in serie(quieto)
               if 0 < a and b * PASSO < fine_parlato and (b - a) * PASSO > pausa]
    ai_bordi = bordi(quieto, risolto, stile)
    vuoti_fra = esitazioni(dette, pausa)
    vuoti = senza_parole(dette, durata, pausa)
    tasti = colpi(x, risolto, stile)
    fasi.segna("ascolto", inizio, 1)
    misurate = dette
    fuori = []
    inizio = time.perf_counter()
    riascolta = trascrittore is not None or attiva("trascrizione")
    cerca = allineatore is not None or attiva("allineamento")
    spente = [f for f, accesa in (("allineamento", cerca), ("trascrizione", riascolta)) if not accesa]
    if spente:
        voci = ", ".join("motori." + f + ".attiva" for f in spente)
        avanza(dice(f"spente nel profilo ({voci}): ne salto i controlli (`spente` in controllo.json)", f"turned off in the profile ({voci}): skipping their checks (`spente` in controllo.json)"))
    if misurate and cerca:
        avanza(dice("cerco le parole", "looking for the words"))
        # A pezzi: l'allineamento di un montato intero di qualche minuto non sta nella scheda video.
        trovate, primo, al_secondo = [], 0, FREQUENZA
        while primo < len(misurate):
            ultimo = primo
            while ultimo + 1 < len(misurate) and misurate[ultimo + 1]["a"] - misurate[primo]["da"] <= c["finestra"]:
                ultimo += 1
            da = (misurate[primo - 1]["a"] + misurate[primo]["da"]) / 2 if primo else 0.0
            a = (misurate[ultimo]["a"] + misurate[ultimo + 1]["da"]) / 2 if ultimo + 1 < len(misurate) else len(x) / al_secondo
            pezzo = (allineatore or allinea.apri()).allinea(x[round(da * al_secondo):round(a * al_secondo)], [w["p"] for w in misurate[primo:ultimo + 1]])
            trovate += [(da + i, da + f, voto) for i, f, voto in pezzo]
            primo = ultimo + 1
        for w, (da, a, voto) in zip(misurate, trovate):
            # Un pezzo a tempo ha i tempi della trascrizione, senza il confine vero: della sua parola si guarda solo se si ritrova.
            sposta = w["voto"] is not None and (abs(da - w["da"]) > c["tolleranza"] or abs(a - w["a"]) > c["tolleranza"])
            if sposta or voto < c["voto_minimo"]:
                fuori.append({"parola": w["p"], "attesa": [w["da"], w["a"]], "trovata": [round(da, 2), round(a, 2)], "voto": voto})
        # Su un montato di qualche minuto l'allineamento tiene quasi tutta la scheda: va liberata prima di caricare la trascrizione.
        if allineatore is None:
            allinea.chiudi()
    fasi.segna("parole", inizio, len(misurate))
    if riascolta:
        avanza(dice("riascolto con la trascrizione", "listening again with the transcription"))
    inizio = time.perf_counter()
    # Ogni tratto si riascolta nella lingua del suo girato: un keynote in inglese ascoltato in italiano sembrerebbe tutto perso.
    ascolta = trascrittore or (lambda audio, lingua: sente(audio, stile, lingua))
    al_secondo, sentiti, differenze, doppi, lingua_del_tratto = FREQUENZA, [], [], [], {}
    for lingua, da, a, suoi in per_lingua(archivio, slug, risolto) if riascolta else []:
        lingua_del_tratto |= dict.fromkeys(suoi, lingua)
        testo = ascolta(x[round(da * al_secondo):round(a * al_secondo)], lingua)
        sentiti.append(testo)
        di_qui = [w for w in dette if w["tratto"] in suoi]
        voluto, ascoltato = [chiave(w["p"]) for w in di_qui], [chiave(p) for p in testo.split()]
        differenze += [{"a": di_qui[min(a1, len(di_qui) - 1)]["da"], "voluto": " ".join(voluto[a1:a2]), "sentito": " ".join(ascoltato[b1:b2])}
                       for tipo, a1, a2, b1, b2 in difflib.SequenceMatcher(None, voluto, ascoltato, autojunk=False).get_opcodes() if tipo != "equal" and di_qui]
        doppi += doppioni(di_qui, testo)
    sentito = " ".join(t for t in sentiti if t)
    # Riascoltato intero, il montato fonde di nuovo una falsa partenza con la frase ridetta: la finestra di una parola troppo lunga si riascolta da sola.
    lunghe = [{"a": round(w["da"], 2), "parola": w["p"], "dura": round(w["a"] - w["da"], 2),
               "sentito": ascolta(x[round(w["da"] * al_secondo):round(w["a"] * al_secondo)], lingua_del_tratto[w["tratto"]])}
              for w in dette if riascolta and w["a"] - w["da"] > stile["preparati"]["parola_lunga"]]
    tagli =[{"a": round(t["esce"] if lato == 0 else t["esce"] + t["durata"], 2), "db": round(db_taglio, 1)}
             for t in risolto["tratti"] for lato, db_taglio in enumerate(t["legato"]) if db_taglio is not None]
    file_testo = archivio.video(slug) / "materiali" / "testo-registrato.md"
    sottotitoli = contro_il_testo(risolto["battute"], battute_fissate(file_testo.read_text(encoding="utf-8"))) if file_testo.exists() else None
    if sottotitoli is None:
        avanza(dice("il testo fissato (materiali/testo-registrato.md) non c'è: i sottotitoli non si confrontano", "the fixed text (materiali/testo-registrato.md) is missing: the subtitles are not compared"))
    fasi.segna("trascrizione", inizio, 1)
    avanza(dice("guardo i fotogrammi", "looking at the frames"))
    inizio = time.perf_counter()
    isolati, alta = lampi(finale, c["lampo"], salta), zona_alta(finale, video["fps"], risolto, stile, salta)
    cop = copertina(archivio.uscite(slug), risolto, stile)
    fasi.segna("fotogrammi", inizio, 1)
    esito = {"quando": datetime.datetime.now().isoformat(timespec="seconds"), "del_finale": datetime.datetime.fromtimestamp(finale.stat().st_mtime).isoformat(timespec="seconds"),
             "durata": round(durata, 2), "silenzi": silenzi, "esitazioni": vuoti_fra, "senza_parole": vuoti, "colpi": tasti, "parole_fuori_posto": fuori, "sentito": sentito,
             "differenze": differenze, "doppioni": doppi, "parole_lunghe": lunghe, "sottotitoli": sottotitoli, "tagli_nel_parlato": tagli, "lampi": isolati, "bordi": ai_bordi, "zona_alta": alta, "copertina": cop, "spente": spente}
    scrivi_json(archivio.lavoro(slug) / "controllo.json", esito, indent=1)
    muti, rumorosi, nella_voce = (sum(b["cosa"] == c for b in ai_bordi) for c in ("muto", "rumore", "voce"))
    fra, durata_fra, con_numero = len(vuoti_fra), sum(e["dura"] for e in vuoti_fra), sum(e["numero"] for e in vuoti_fra)
    confronto = "-" if sottotitoli is None else len(sottotitoli)
    avanza(dice(f"silenzi oltre la pausa: {len(silenzi)}; vuoti fra due parole: {fra} ({durata_fra:.1f} s, accanto a un numero o una sigla {con_numero}); parole fuori posto: {len(fuori)} su {len(misurate)}; differenze con la trascrizione: {len(differenze)}; tagli nel parlato: {len(tagli)}; lampi: {len(isolati)}; bordi: {len(ai_bordi)} ({muti} muti, {rumorosi} con rumore, {nella_voce} nella voce)"
                f"; senza parole in testa e in coda: {len(vuoti)}; colpi di tasto: {len(tasti)}; doppioni: {len(doppi)}; parole troppo lunghe: {len(lunghe)}; sottotitoli diversi dal testo fissato: {confronto}"
                f"; fascia sopra la sagoma ferma o vuota: {len(alta)}; copertina: {', '.join(v['cosa'] for v in cop) or 'a posto'}",
                f"silences beyond the pause: {len(silenzi)}; gaps between two words: {fra} ({durata_fra:.1f} s, next to a number or an acronym {con_numero}); misplaced words: {len(fuori)} of {len(misurate)}; differences from the transcription: {len(differenze)}; cuts in speech: {len(tagli)}; flashes: {len(isolati)}; edges: {len(ai_bordi)} ({muti} silent, {rumorosi} with noise, {nella_voce} in the voice)"
                f"; no words at head and tail: {len(vuoti)}; key clicks: {len(tasti)}; duplicates: {len(doppi)}; words too long: {len(lunghe)}; subtitles different from the fixed text: {confronto}"
                f"; band above the silhouette still or empty: {len(alta)}; cover: {', '.join(v['cosa'] for v in cop) or 'fine'}"))
    return esito
