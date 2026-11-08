"""La prova prima di registrare: le scene animate in fila coi tempi stimati del copione e, al posto dei sottotitoli, la frase intera
che il creator legge (la parola da dire ora in rosso, le dette scure, le altre in grigio). Gli spezzoni di un girato che il creator
commenta (un talk, un keynote) passano fra le frasi alla loro durata vera, con la loro voce e la loro traduzione: l'unico audio della prova."""

import html
import os
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

from . import animazioni
from .archivio import scrivi_con
from .errori import Errore, dice
from .media import ffmpeg
from .profilo import leggi_profilo
from .sorgenti import Sorgente
from .sottotitoli import cartelli_del_titolo, cartello, chiave, posto, scheda_cartello
from .taglio import a_parole


def frasi_del_copione(proposta):
    """Il testo da dire, una frase per riga: l'aggancio, le righe del centro, la chiusa; ogni spezzone (un dizionario) sta subito prima
    della frase che comincia con le sue parole `prima`. Se il copione apre con uno spezzone, l'aggancio è lui."""
    if not proposta.get("chiusa"):
        raise Errore("la proposta non ha aggancio e chiusa: la prova legge da lì il testo da dire (nel centro una frase per riga)",
                     "the proposal has no `aggancio` and `chiusa`: the rehearsal reads the text to say from there (in the center one sentence per line)")
    centro = [r.strip() for r in proposta.get("centro", "").splitlines() if r.strip()]
    frasi = [*([proposta["aggancio"].strip()] if proposta.get("aggancio") else []), *centro, proposta["chiusa"].strip()]
    prima = {}
    for s in proposta.get("spezzoni", []):
        k = next((k for k, f in enumerate(frasi) if chiave(f).startswith(chiave(s["prima"]))), None)
        if k is None:
            raise Errore(f"lo spezzone di {s['file']} va prima della frase «{s['prima']}», ma nessuna frase del copione comincia così",
                         f"the clip of {s['file']} goes before the sentence «{s['prima']}», but no sentence of the script starts like that")
        if "da" in s and s["a"] <= s["da"]:
            raise Errore(f"lo spezzone di {s['file']} prima di «{s['prima']}» finisce ({s['a']}) prima di cominciare ({s['da']})",
                         f"the clip of {s['file']} before «{s['prima']}» ends ({s['a']}) before it starts ({s['da']})")
        prima.setdefault(k, []).append(s)
    if not proposta.get("aggancio") and 0 not in prima:
        raise Errore("la proposta non ha aggancio: o la prima frase da dire, o uno spezzone prima di tutte le frasi",
                     "the proposal has no `aggancio`: either the first sentence to say, or a clip before all the sentences")
    return [v for k, f in enumerate(frasi) for v in (*prima.get(k, []), f)]


def tratti_dello_spezzone(archivio, slug, spezzone):
    """I tratti (da, a), in secondi del file, che lo spezzone fa sentire: quelli scritti, o, con `minuto` e `dice`, la voce di quelle
    parole trovata come per un pezzo del piano, con le pause in mezzo tolte."""
    if "dice" not in spezzone:
        return [(spezzone["da"], spezzone["a"])]
    sorgente = Sorgente(archivio, slug, f"lo spezzone di {spezzone['file']}", {"file": spezzone["file"]}, {})
    ij = sorgente.scegli(spezzone["minuto"], spezzone["dice"])
    return [(g["da"], round(g["da"] + g["durata"], 3)) for g in a_parole(sorgente, spezzone, ij, sorgente.veri([ij])[0], archivio.stile)]


def copione(archivio, slug, proposta):
    """Le frasi e gli spezzoni del copione in fila, ogni spezzone coi suoi `tratti`."""
    return [v if isinstance(v, str) else {**v, "tratti": tratti_dello_spezzone(archivio, slug, v)} for v in frasi_del_copione(proposta)]


def tempi(voci, stile):
    """Quando si dice ogni frase e ogni parola, prima che esista la voce: le parole durano quanto le loro lettere, uno spezzone quanto i suoi
    tratti, e fra l'una e l'altra c'è una pausa."""
    p = stile["prova"]
    fuori, t = [], 0.0
    for voce in voci:
        if not isinstance(voce, str):
            fuori.append({"spezzone": voce, "da": round(t, 3), "a": round(t + sum(b - a for a, b in voce["tratti"]), 3)})
            t = fuori[-1]["a"] + p["pausa"]
            continue
        parole, ora = [], t
        for w in voce.split():
            dura = (len(re.sub(r"\W", "", w)) + 1) / p["caratteri_al_secondo"]
            parole.append({"p": w, "da": round(ora, 3), "a": round(ora + dura, 3)})
            ora += dura
        fuori.append({"testo": voce, "da": round(t, 3), "a": parole[-1]["a"], "parole": parole})
        t = ora + p["pausa"]
    return fuori


def sequenze(frasi, scene):
    """Le frasi raggruppate per scena: ogni scena comincia alla frase che inizia con le sue parole `dalla` e dura fino alla scena dopo.
    Le frasi prima della prima scena e quelle di una scena senza animazione sono del creator a tutto fotogramma."""
    inizi, scena_di = {}, {}
    for s in scene:
        k = next((k for k, f in enumerate(frasi) if chiave(f["testo"]).startswith(chiave(s["dalla"]))), None)
        if k is None:
            raise Errore(f"la scena «{s['animazione'] or 'senza animazione'}» comincia «{s['dalla']}», ma nessuna frase del copione comincia così",
                         f"the scene «{s['animazione'] or 'without animation'}» starts «{s['dalla']}», but no sentence of the script starts like that")
        if inizi and k <= max(inizi):
            raise Errore(f"le scene della proposta vanno in ordine di copione: «{s['dalla']}» viene prima della scena che la precede",
                         f"the scenes of the proposal go in script order: «{s['dalla']}» comes before the scene that precedes it")
        inizi[k], scena_di[k] = s["animazione"], s
    gruppi = []
    for k, f in enumerate(frasi):
        if not gruppi or k in inizi:
            gruppi.append({"animazione": inizi.get(k), "parole": scena_di.get(k, {}).get("parole", {}), "frasi": []})
        gruppi[-1]["frasi"].append(f)
    for n, g in enumerate(gruppi):
        g["da"] = g["frasi"][0]["da"]
        g["a"] = gruppi[n + 1]["frasi"][0]["da"] if n + 1 < len(gruppi) else g["frasi"][-1]["a"]
        g["tempi"] = _istanti(g)
    return gruppi


def _istanti(gruppo):
    """Per ogni parola che la scena aspetta (`parole` della proposta: nome → parole del copione), il secondo, dall'inizio della scena, in cui il copione stimato la dice."""
    dette = [w for f in gruppo["frasi"] for w in f["parole"]]
    tempi = {}
    for nome, testo in gruppo["parole"].items():
        cerca = [chiave(p) for p in testo.split()]
        k = next((k for k in range(len(dette) - len(cerca) + 1) if [chiave(w["p"]) for w in dette[k:k + len(cerca)]] == cerca), None)
        if k is None:
            raise Errore(f"la scena «{gruppo['animazione']}» aspetta «{testo}», che il copione non dice dalla sua frase in poi",
                         f"the scene «{gruppo['animazione']}» waits for «{testo}», which the script does not say from its sentence onward")
        tempi[nome] = round(dette[k]["da"] - gruppo["da"], 3)
    return tempi


def _esadecimale(archivio, nome):
    r, g, b = archivio.colore(nome)
    return f"0x{r:02X}{g:02X}{b:02X}"


def _cartello_del_creator(archivio, L, A, file):
    """Il fondo delle frasi senza scena: dice che lì il creator parla a tutto fotogramma."""
    p = archivio.stile["prova"]
    img = Image.new("RGB", (L, A), archivio.colore(p["fondo_senza_scena"]))
    f = ImageFont.truetype(str(archivio.font(archivio.stile["titolo"]["carattere"])), p["corpo_scritta_senza_scena"])
    ImageDraw.Draw(img).text((L / 2, p["y_scritta_senza_scena"]), p["scritta_senza_scena"], font=f, fill=archivio.colore(p["colori"]["da_dire"]), anchor="mm")
    img.save(file)


def _pezzo(archivio, gruppo, quadro, area, formato, cartella, n):
    """Il fondo di una sequenza, lungo quanto lei: la scena resa nella sua area sul fondo del quadro, o il cartello del creator. Dove il quadro
    mette la ripresa del creator c'è un riquadro che lo dice; una scena trasparente lo lascia vedere dove non disegna."""
    p, uscita = archivio.stile["prova"], cartella / f"pezzo-{n:02d}.mp4"
    L, A, fps = formato["largo"], formato["alto"], formato["fps"]
    durata = gruppo["a"] - gruppo["da"]
    codifica = ["-t", f"{durata:.3f}", "-r", fps, "-c:v", "libx264", "-preset", p["preset"], "-crf", p["crf"], "-pix_fmt", "yuv420p", "-an", "-y", uscita]
    if gruppo["animazione"] is None:
        ffmpeg("-loop", "1", "-framerate", fps, "-i", cartella / "creator.png", *codifica)
        return uscita
    x, y, largo, alto = area
    riprese = "".join(f",drawbox=x={g[0]}:y={g[1]}:w={g[2]}:h={g[3]}:color={_esadecimale(archivio, p['fondo_senza_scena'])}:t=fill"
                      for g in (s["area"] for s in quadro["strati"] if s["tipo"] == "girato"))
    scena, maschera = cartella / f"{gruppo['animazione']}.mp4", cartella / f"{gruppo['animazione']}.alfa.mkv"
    ingressi, grafo = ["-i", scena], f"[0:v]fps={fps},scale={largo}:{alto}"
    if maschera.exists():
        ingressi += ["-i", maschera]
        grafo = f"[1:v]fps={fps},scale={largo}:{alto},format=gray[m];{grafo},format=yuva420p[c];[c][m]alphamerge"
    ffmpeg(*ingressi, "-filter_complex",
           f"color=c={_esadecimale(archivio, quadro['fondo'])}:s={L}x{A}:r={fps}{riprese}[f];{grafo},tpad=stop_mode=clone:stop_duration={durata:.3f}[s];"
           f"[f][s]overlay={x}:{y},trim=duration={durata:.3f}", *codifica)
    return uscita


def _pezzo_di_spezzone(archivio, quadro, area, formato, cartella, n, durata, file, inizio, fermo):
    """Un tratto col girato di uno spezzone intero dentro l'area del girato, sul fondo del quadro: lo spezzone che scorre con la sua voce,
    o (`fermo`) il suo fotogramma al secondo `inizio`, muto, mentre parla il creator. Il resto del quadro, il posto del creator, resta vuoto."""
    p, uscita = archivio.stile["prova"], cartella / f"pezzo-{n:02d}.mp4"
    L, A, fps = formato["largo"], formato["alto"], formato["fps"]
    x, y, largo, alto = area
    if fermo:
        ingressi = ["-ss", f"{inizio:.3f}", "-i", archivio.grezzo(file), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        video, audio = f"[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,fps={fps},tpad=stop_mode=clone:stop_duration={durata:.3f}", "[1:a]anull"
    else:
        ingressi = ["-ss", f"{inizio:.3f}", "-t", f"{durata:.3f}", "-i", archivio.grezzo(file)]
        video, audio = f"[0:v]setpts=PTS-STARTPTS,fps={fps}", "[0:a]aresample=48000,aformat=channel_layouts=stereo,apad"
    ffmpeg(*ingressi, "-filter_complex",
           f"color=c={_esadecimale(archivio, quadro['fondo'])}:s={L}x{A}:r={fps}[f];{video},scale={largo}:{alto}:force_original_aspect_ratio=decrease[g];"
           f"[f][g]overlay=x={x}+({largo}-overlay_w)/2:y={y}+({alto}-overlay_h)/2,trim=duration={durata:.3f}[v];{audio}[a]",
           "-map", "[v]", "-map", "[a]", "-t", f"{durata:.3f}", "-r", fps, "-c:v", "libx264", "-preset", p["preset"], "-crf", p["crf"], "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-ar", 48000, "-ac", 2, "-y", uscita)
    return uscita


def _pezzi_con_spezzoni(archivio, quadro, formato, cartella, spezzoni, fine):
    """Il fondo di una prova con gli spezzoni: ognuno coi suoi tratti, uno dopo l'altro, e, fra uno spezzone e l'altro, mentre parla il creator,
    il girato fermo sull'ultimo fotogramma dello spezzone prima (prima del primo, sul primo fotogramma di quello dopo)."""
    area = next((s["area"] for s in quadro["strati"] if s["tipo"] == "girato"), None)
    if area is None:
        raise Errore("il quadro della proposta non ha uno strato `girato`: gli spezzoni non avrebbero dove stare",
                     "the frame of the proposal has no `girato` layer: the clips would have nowhere to go")
    fps, pezzi, t, prima = formato["fps"], [], 0.0, None
    for s in [*spezzoni, None]:
        fino = s["da"] if s else fine
        if fino - t > 0.5 / fps:
            fermo = (prima["file"], prima["tratti"][-1][1] - 1 / fps) if prima else (s["spezzone"]["file"], s["spezzone"]["tratti"][0][0])
            pezzi.append(_pezzo_di_spezzone(archivio, quadro, area, formato, cartella, len(pezzi), fino - t, *fermo, fermo=True))
        if s:
            for da, a in s["spezzone"]["tratti"]:
                pezzi.append(_pezzo_di_spezzone(archivio, quadro, area, formato, cartella, len(pezzi), a - da, s["spezzone"]["file"], da, fermo=False))
            t, prima = s["a"], s["spezzone"]
    return pezzi


def _disegnatore(archivio, quadro):
    """Disegna un testo intero nel posto delle frasi, un colore per parola, in un riquadro che si legge su qualunque fondo: (immagine, x, y).
    La prima riga sta dove stanno i sottotitoli e le altre scendono: una frase lunga non risale sul titolo."""
    stile, p = archivio.stile, archivio.stile["prova"]
    spec = {**quadro["sottotitoli"], "fondo": p["fondo_frase"], "contorno": 0}
    scheda = scheda_cartello(stile, "sottotitoli", archivio.colore, spec)
    carattere = archivio.font(stile["sottotitoli"]["carattere"])
    una_riga = round(scheda["corpo"] * scheda["interlinea"]) + scheda["margine_alto"] + scheda["margine_basso"]

    def disegna(testo, colori):
        img, pieno = cartello(testo, scheda, carattere, colori=colori)
        return img, posto(spec, pieno)[0], spec["y"] - una_riga // 2

    return disegna


def _frasi_disegnate(archivio, quadro, frasi):
    """Per ogni frase, un'immagine per parola: la frase intera con quella parola in corso, e il suo posto."""
    p, disegna = archivio.stile["prova"], _disegnatore(archivio, quadro)
    detta, ora, da_dire = (archivio.colore(p["colori"][k]) for k in ("detta", "ora", "da_dire"))
    return [[disegna(f["testo"], [detta] * k + [ora] + [da_dire] * (len(f["parole"]) - k - 1)) for k in range(len(f["parole"]))] for f in frasi]


def _cosa_a(frasi, t):
    """(frase, parola) da mostrare al secondo `t`: una frase resta finché non comincia la dopo, una parola finché non comincia la sua seguente."""
    i = max((k for k, f in enumerate(frasi) if f["da"] <= t), default=0)
    return i, max((k for k, w in enumerate(frasi[i]["parole"]) if w["da"] <= t), default=0)


def scrivi_copione(archivio, slug, titolo, voci):
    """`uscite/copione.html`: le frasi da dire, una per riga e grandi, da leggere sul telefono mentre si registra (`/guarda`); uno spezzone è la sua traduzione in grigio. Una pagina sola, senza niente di esterno."""
    stile = archivio.stile
    p, c = stile["prova"], stile["prova"]["copione"]
    colori = stile["colori"]
    lingua = leggi_profilo(archivio.radice.parent).get("creator", {}).get("lingua")
    righe = [f'<p class="spezzone">{html.escape(v["spezzone"].get("testo") or v["spezzone"]["file"])}</p>' if "spezzone" in v else f'<p>{html.escape(v["testo"])}</p>' for v in voci]
    pagina = f"""<!doctype html>
<html{f' lang="{lingua}"' if lingua else ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(titolo)}</title>
<style>
body {{ margin: 0; padding: {c["margine"]}px; background: {colori[p["fondo_frase"]]}; color: {colori[p["colori"]["detta"]]}; font: {c["corpo"]}px/{c["interlinea"]} sans-serif; }}
h1 {{ margin: 0 0 {c["distanza"]}px; font-size: {c["corpo_titolo"]}px; font-weight: 400; color: {colori[p["colori"]["da_dire"]]}; }}
p {{ margin: 0 0 {c["distanza"]}px; }}
.spezzone {{ color: {colori[p["colori"]["da_dire"]]}; }}
</style>
</head>
<body>
<h1>{html.escape(titolo)}</h1>
{chr(10).join(righe)}
</body>
</html>
"""
    scrivi_con(archivio.uscite(slug) / "copione.html", lambda dest: dest.write_text(pagina, encoding="utf-8"))


def prova(archivio, slug, avanza=print):
    """`uscite/prova.mp4` dalla proposta della scheda: il copione, il quadro e le scene con la frase da cui comincia ognuna."""
    stile = archivio.stile
    scheda = archivio.scheda(slug)
    proposta = scheda.get("proposta", {})
    voci = tempi(copione(archivio, slug, proposta), stile)
    scrivi_copione(archivio, slug, scheda["titolo"], voci)
    frasi, spezzoni = [v for v in voci if "testo" in v], [v for v in voci if "spezzone" in v]
    gruppi = sequenze(frasi, proposta.get("scene", []))
    nome = proposta.get("quadro", stile["prova"]["quadro"])
    quadro = stile["quadri"].get(nome)
    if quadro is None:
        raise Errore(f"il quadro «{nome}» della proposta non c'è in stile.json: i quadri sono {', '.join(stile['quadri'])}",
                     f"the frame «{nome}» of the proposal is not in stile.json: the frames are {', '.join(stile['quadri'])}")
    formato = archivio.formato_di(quadro)
    L, A, fps = formato["largo"], formato["alto"], formato["fps"]
    area = next((s["area"] for s in quadro["strati"] if s["tipo"] == "animazione"), None)
    sigle = [g["animazione"] for g in gruppi if g["animazione"]]
    if len(set(sigle)) < len(sigle):
        raise Errore("la stessa animazione compare in due scene della proposta: ogni scena ha la sua",
                     "the same animation appears in two scenes of the proposal: each scene has its own")
    if sigle and spezzoni:
        raise Errore("la prova mette gli spezzoni fra frasi senza scena animata: una proposta ha o le scene o gli spezzoni",
                     "the rehearsal puts clips between sentences without an animated scene: a proposal has either the scenes or the clips")
    if sigle and area is None:
        raise Errore(f"il quadro «{nome}» non ha uno strato `animazione`: le scene della proposta non avrebbero dove stare",
                     f"the frame «{nome}» has no `animazione` layer: the scenes of the proposal would have nowhere to go")
    cartella = archivio.lavoro(slug) / "prova"
    cartella.mkdir(parents=True, exist_ok=True)
    if sigle:
        chieste = {g["animazione"]: {"durata": round(g["a"] - g["da"], 3), "ancore": [], "tempi": g["tempi"], "formato": {"largo": L, "alto": A}, "lingua": "it", **({"fascia": quadro["fascia_animazione"]} if "fascia_animazione" in quadro else {})} for g in gruppi if g["animazione"]}
        animazioni.registra(archivio, chieste, cartella / "tempi.json", cartella, avanza)
    if spezzoni:
        pezzi = _pezzi_con_spezzoni(archivio, quadro, formato, cartella, spezzoni, voci[-1]["a"])
    else:
        _cartello_del_creator(archivio, L, A, cartella / "creator.png")
        pezzi = [_pezzo(archivio, g, quadro, area, formato, cartella, n) for n, g in enumerate(gruppi)]
    (cartella / "pezzi.txt").write_text("".join(f"file '{f.as_posix()}'\n" for f in pezzi), encoding="utf-8")
    disegni = _frasi_disegnate(archivio, quadro, frasi)
    disegna, colore_spezzone, pausa = _disegnatore(archivio, quadro), archivio.colore(stile["prova"]["colori"]["spezzone"]), stile["prova"]["pausa"]
    tradotti = [(s["da"], s["a"] + pausa, [disegna(s["spezzone"]["testo"], [colore_spezzone] * len(s["spezzone"]["testo"].split()))] if s["spezzone"].get("testo") else [])
                for s in spezzoni]
    titolo = cartelli_del_titolo(stile, archivio.colore, archivio.font(stile["titolo"]["carattere"]), quadro["titolo"], {"testo": scheda["titolo"]})
    fine_titolo = round(stile["prova"]["secondi_titolo"] * fps)

    uscite = archivio.uscite(slug)
    uscite.mkdir(parents=True, exist_ok=True)
    parziale = uscite / ".prova.parziale.mp4"
    lettore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-f", "concat", "-safe", "0", "-i", str(cartella / "pezzi.txt"), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    voce = ["-f", "concat", "-safe", "0", "-i", str(cartella / "pezzi.txt"), "-map", "0:v", "-map", "1:a", "-c:a", "aac"] if spezzoni else []
    scrittore = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{L}x{A}", "-r", str(fps), "-i", "-", *voce,
                                  "-c:v", "libx264", "-preset", stile["prova"]["preset"], "-crf", str(stile["prova"]["crf"]), "-pix_fmt", "yuv420p",
                                  "-movflags", "+faststart", "-f", "mp4", str(parziale)], stdin=subprocess.PIPE)
    n = 0
    try:
        while len(dati := lettore.stdout.read(L * A * 3)) == L * A * 3:
            quadro_ora = Image.frombuffer("RGB", (L, A), dati, "raw", "RGB", 0, 1).copy()
            t = n / fps
            sotto = next((d for da, a, d in tradotti if da <= t < a), None)
            if sotto is None:
                i, k = _cosa_a(frasi, t)
                sotto = [disegni[i][k]]
            for img, x, y in [*sotto, *(titolo if n < fine_titolo else [])]:
                quadro_ora.paste(img, (x, y), img if img.mode == "RGBA" else None)
            scrittore.stdin.write(quadro_ora.tobytes())
            n += 1
    finally:
        lettore.stdout.close()
        lettore.wait()
        scrittore.stdin.close()
        esito = scrittore.wait()
    if esito != 0 or lettore.returncode != 0:
        parziale.unlink(missing_ok=True)
        raise Errore("la prova non è riuscita: guarda l'errore di ffmpeg qui sopra",
                     "the rehearsal failed: look at the ffmpeg error above")
    os.replace(parziale, uscite / "prova.mp4")
    avanza(dice(f"prova.mp4: {n / fps:.1f} s, {len(frasi)} frasi, {len(sigle)} scene, {len(spezzoni)} spezzoni", f"prova.mp4: {n / fps:.1f} s, {len(frasi)} sentences, {len(sigle)} scenes, {len(spezzoni)} pieces"))
    return uscite / "prova.mp4"
