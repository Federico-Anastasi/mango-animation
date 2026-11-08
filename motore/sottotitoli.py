import re

from PIL import Image, ImageDraw, ImageFont

from .errori import Errore

PUNTEGGIATURA = r"[?.,!:;]"


def secondi(minuto):
    m, s = minuto.split(":")
    return int(m) * 60 + int(s)


def chiave(testo):
    return re.sub(r"[\W_]", "", testo.lower())


def _unisci_apostrofi(grezze):
    """La trascrizione stacca l'apostrofo e le sigle: «l», «'altro»."""
    unite = []
    for p in grezze:
        if p["p"].startswith(("'", "-")) and unite:
            unite[-1] = {"p": unite[-1]["p"] + p["p"], "da": unite[-1]["da"], "a": p["a"]}
            continue
        unite.append({"p": p["p"], "da": p["da"], "a": p["a"]})
    return unite


def _cerca_ritocco(unite, ritocco, stile):
    dal = secondi(ritocco["minuto"]) - stile["taglio"]["a_parole"]["minuto_prima"]
    vecchie = [chiave(v) for v in ritocco["sentito"].split()]
    k = next((k for k in range(len(unite)) if unite[k]["da"] >= dal and [chiave(p["p"]) for p in unite[k:k + len(vecchie)]] == vecchie), None)
    if k is None or unite[k]["da"] > dal + stile["taglio"]["a_parole"]["ricerca"]:
        raise Errore(f"dal minuto {ritocco['minuto']} la trascrizione non dice: {ritocco['sentito']}",
                     f"from minute {ritocco['minuto']} the transcript does not say: {ritocco['sentito']}")
    return k, len(vecchie)


def _correggi(unite, correzione):
    sentite = [chiave(s) for s in correzione["sentite"]]
    giuste = correzione["giuste"]
    if isinstance(giuste, list) and len(giuste) != len(sentite):
        raise Errore(f"la correzione di «{' '.join(correzione['sentite'])}» ha {len(giuste)} parole giuste per {len(sentite)} sentite: devono essere altrettante, o una stringa sola",
                     f"the correction of «{' '.join(correzione['sentite'])}» has {len(giuste)} right words for {len(sentite)} heard: they must be equal in number, or a single string")
    k = 0
    while k <= len(unite) - len(sentite):
        if [p["chiave"] for p in unite[k:k + len(sentite)]] != sentite:
            k += 1
            continue
        if isinstance(giuste, str):
            unite[k:k + len(sentite)] = [{**unite[k], "p": giuste, "chiave": "".join(sentite), "a": unite[k + len(sentite) - 1]["a"]}]
            k += 1
            continue
        for p, g in zip(unite[k:k + len(sentite)], giuste):
            p["p"] = g if re.search(PUNTEGGIATURA + "$", g) else g + re.search(PUNTEGGIATURA + "*$", p["p"]).group()
        k += len(sentite)


def parole_pulite(grezze, nome, sottotitoli, stile):
    """Le parole di una sorgente come si leggono: apostrofi riuniti, ritocchi, maiuscole, correzioni.
    Ognuna ha `p` (come si scrive), `chiave` (come la sente la trascrizione, per cercare il `dice`), `da` e `a` della trascrizione."""
    unite = _unisci_apostrofi(grezze)
    for ritocco in sottotitoli.get("ritocchi", []):
        if ritocco["sorgente"] != nome:
            continue
        k, n = _cerca_ritocco(unite, ritocco, stile)
        da, a, nuove = unite[k]["da"], unite[k + n - 1]["a"], ritocco["detto"].split()
        unite[k:k + n] = [{"p": p, "da": da + (a - da) * m / len(nuove), "a": da + (a - da) * (m + 1) / len(nuove)} for m, p in enumerate(nuove)]
    nomi = set(sottotitoli.get("nomi", []))
    minuscola = sottotitoli.get("scrittura", stile["sottotitoli"]["scrittura"]) == "minuscola"
    for p in unite:
        p["chiave"] = chiave(p["p"])
        if minuscola and p["p"].strip("?.,!") not in nomi:
            p["p"] = p["p"].lower()
    for correzione in sottotitoli.get("correzioni", []):
        if correzione.get("sorgente", nome) == nome:
            _correggi(unite, correzione)
    return unite


def battute(parole, inizio, confine, stile, scrittura, rilievo=frozenset()):
    """Le parole di un pezzo (`p`, `esce`, `finisce`: secondi del video) in battute: (da, a, testo, istanti), pochi vocaboli
    alla volta, staccate alla punteggiatura; `istanti` è quando viene detta ogni parola del testo. Le parole senza lettere né cifre
    (i «...» della trascrizione) non si scrivono. Una parola in `rilievo` (chiavi) sta da sola nella sua battuta."""
    s = stile["sottotitoli"]
    gruppi, gruppo = [], []
    for p in (p for p in parole if chiave(p["p"])):
        solo = chiave(p["p"]) in rilievo
        if gruppo and (solo or len(" ".join(x["p"] for x in gruppo)) + len(p["p"]) > s["caratteri_per_battuta"] or p["esce"] - gruppo[-1]["finisce"] > s["stacco"]):
            gruppi.append(gruppo)
            gruppo = []
        gruppo.append(p)
        if solo or re.search(r"[.,?!:]$", p["p"]):
            gruppi.append(gruppo)
            gruppo = []
    if gruppo:
        gruppi.append(gruppo)
    fuori = []
    for k, g in enumerate(gruppi):
        dopo = gruppi[k + 1][0]["esce"] if k + 1 < len(gruppi) else confine
        da = max(g[0]["esce"] - s["anticipo"], inizio)
        a = max(da + s["minimo"], min(dopo - s["anticipo"], g[-1]["finisce"] + s["resta"], confine))
        parole_scritte = [x["p"].rstrip(".,:;") for x in g] if scrittura == "minuscola" else [x["p"] for x in g]
        istanti = [max(x["esce"] + (0 if x.get("insieme") else (x["finisce"] - x["esce"]) * m / n), inizio)
                   for x, scritta in zip(g, parole_scritte) for n in [len(scritta.split())] for m in range(n)]
        fuori.append((da, a, " ".join(parole_scritte).rstrip(","), istanti))
    return fuori


def parole_tradotte(parole, righe, minuscola, nomi):
    """Le parole dette in un'altra lingua sostituite da quelle della traduzione (`p`, `esce`, `finisce`): ogni riga comincia sulla parola
    detta da cui parte (`dalla`, cercata dopo la riga prima) e le sue parole si spargono, per lunghezza, fino alla fine dell'ultima parola
    detta prima della riga dopo. Poi diventano battute come tutte le altre. Una parentesi è una parola sola (`insieme`): entra tutta
    insieme. In `minuscola` si scrivono minuscole tranne i `nomi`."""
    dette = [p for p in parole if chiave(p["p"])]
    inizi, k = [], 0
    for riga in righe:
        cerca = chiave(riga["dalla"])
        k = next((j for j in range(k, len(dette)) if "".join(chiave(p["p"]) for p in dette[j:j + len(riga["dalla"].split()) + 2]).startswith(cerca)), None)
        if k is None:
            raise Errore(f"la riga tradotta «{riga['testo']}» comincia da «{riga['dalla']}», ma il pezzo non lo dice dopo la riga prima",
                         f"the translated line «{riga['testo']}» starts from «{riga['dalla']}», but the piece does not say it after the previous line")
        inizi.append(k)
        k += 1
    fuori = []
    for n, (k, riga) in enumerate(zip(inizi, righe)):
        da, a = dette[k]["esce"], dette[(inizi[n + 1] if n + 1 < len(inizi) else len(dette)) - 1]["finisce"]
        scritte = [" ".join(w if not minuscola or w.strip("?.,!:;()") in nomi else w.lower() for w in t.split())
                   for t in re.findall(r"\([^)]*\)\S*|\S+", riga["testo"])]
        pesi = [len(w) + 1 for w in scritte]
        passo, ora = (a - da) / sum(pesi), da
        for w, peso in zip(scritte, pesi):
            fuori.append({"p": w, "esce": ora, "finisce": ora + peso * passo, "insieme": " " in w})
            ora += peso * passo
    return fuori


def cartello(testo, scheda, carattere, dette=None, colori=None):
    """Un testo come immagine, a capo dentro la sua colonna: (immagine, (largo, alto) del riquadro intero).
    Un asterisco davanti a una parola la scrive nel colore delle correzioni. Con `dette` scrive solo le prime parole,
    ognuna al posto che ha nel testo intero: il riquadro cresce con loro. `colori` dà un colore a ogni parola."""
    corpo, margine = scheda["corpo"], scheda["margine"]
    while True:
        f = ImageFont.truetype(str(carattere), corpo)
        lunga = lambda riga: f.getlength(riga.replace("*", ""))
        righe, riga = [], ""
        for parola in testo.split():
            prova = (riga + " " + parola).strip()
            if riga and lunga(prova) > scheda["largo"] - 2 * margine:
                righe.append(riga)
                riga = parola
            else:
                riga = prova
        righe.append(riga)
        if max(lunga(r) for r in righe) <= scheda["largo"] - 2 * margine or corpo <= scheda["corpo_minimo"]:
            break
        corpo -= scheda["passo_corpo"]
    passo = round(corpo * scheda["interlinea"])
    verticale = scheda["margine_alto"] + scheda["margine_basso"]
    largo, alto = round(max(lunga(r) for r in righe)) + 2 * margine, passo * len(righe) + verticale
    img = Image.new("RGB", (largo, alto), scheda["fondo"]) if scheda["fondo"] else Image.new("RGBA", (largo, alto), (0, 0, 0, 0))
    contorno = {"stroke_width": scheda["contorno"], "stroke_fill": scheda["colore_contorno"]} if scheda.get("contorno") else {}
    disegno = ImageDraw.Draw(img)
    scritte, destra, fondo = 0, 0, 0
    for n, r in enumerate(righe):
        x = margine + ((largo - 2 * margine - lunga(r)) / 2 if scheda.get("allinea") == "centro" else 0)
        for parola in r.split():
            if dette is not None and scritte >= dette:
                break
            nuda = parola.lstrip("*")
            colore = colori[scritte] if colori else scheda["colore_correzione"] if parola.startswith("*") else scheda["colore"]
            disegno.text((x, scheda["margine_alto"] + n * passo), nuda, font=f, fill=colore, **contorno)
            destra, fondo = max(destra, round(x + f.getlength(nuda)) + margine), passo * (n + 1) + verticale
            x += f.getlength(nuda + " ")
            scritte += 1
    img = img.crop((0, 0, destra, fondo))
    if scheda.get("bordo"):
        ImageDraw.Draw(img).rectangle((0, 0, destra - 1, fondo - 1), outline=scheda["colore"], width=scheda["bordo"])
    if scheda.get("raggio") and scheda["fondo"]:
        angoli = Image.new("L", img.size, 0)
        ImageDraw.Draw(angoli).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=scheda["raggio"], fill=255)
        img = img.convert("RGBA")
        img.putalpha(angoli)
    return img, (largo, alto)


def posto(spec, dimensioni):
    """In alto a sinistra di un riquadro che ha `dimensioni` intere: `x` è il bordo sinistro, il centro o il bordo destro, `y` il centro."""
    largo, alto = dimensioni
    x = {"sinistra": spec["x"], "centro": (2 * spec["x"] - largo) // 2, "destra": spec["x"] - largo}[spec["ancora"]]
    return x, spec["y"] - alto // 2


def cartelli_del_titolo(stile, colori, carattere, spec, titolo):
    """Il titolo e, se c'è, la parte nel suo cartello staccato sotto: [(immagine, x, y)] nel posto che dice il quadro.
    La `y` del quadro è il centro della prima riga: un titolo che va a capo cresce verso il basso."""
    scheda = scheda_cartello(stile, "titolo", colori, spec)
    scritta = str.upper if stile["titolo"]["maiuscolo"] else str
    img, pieno = cartello(scritta(titolo["testo"]), scheda, carattere)
    una_riga = round(scheda["corpo"] * scheda["interlinea"]) + scheda["margine_alto"] + scheda["margine_basso"]
    x, y = posto(spec, (pieno[0], una_riga))
    fuori = [(img, x, y)]
    if titolo.get("parte"):
        p = stile["titolo"]["parte"]
        sotto, intero = cartello(scritta(titolo["parte"]), {**scheda, "colore": colori(p["colore"])}, carattere)
        fuori.append((sotto, posto(spec, intero)[0], y + pieno[1] + p["stacco"]))
    return fuori


def scheda_cartello(stile, quale, colori, spec):
    """Le misure di un cartello (sottotitoli o titolo) dallo stile, con i colori già risolti; colonna, corpo e aspetto (fondo, colore, bordo, raggio degli angoli, contorno delle lettere) possono venire dal quadro."""
    s = {**stile[quale], **{k: spec[k] for k in ("corpo", "corpo_minimo", "fondo", "colore", "bordo", "raggio", "contorno", "colore_contorno") if k in spec}}
    return {**s, "fondo": colori(s["fondo"]) if s["fondo"] else None, "colore": colori(s["colore"]), "colore_correzione": colori(s.get("colore_correzione", s["colore"])),
            "colore_contorno": colori(s["colore_contorno"]) if s.get("contorno") else None, "largo": spec.get("largo", s.get("largo"))}
