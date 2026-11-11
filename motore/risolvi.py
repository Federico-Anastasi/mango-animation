import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np

from .archivio import scrivi_json, senza_voce
from .errori import Errore, Frase
from .sorgenti import Sorgente
from .sottotitoli import battute, chiave, parole_tradotte
from .taglio import a_parole, a_tempo, durata_en, durata_scritta, quadri


def _avviso(tratto, cosa):
    return {"tratto": tratto, "cosa": str(cosa), "cosa_en": cosa.en}


def nel_video(tratti, t):
    """Il secondo del video in cui cade il secondo `t` della sorgente, dentro questi tratti, anche se la scena li prende fuori dall'ordine della
    sorgente; in una pausa tolta, l'inizio del tratto che nella sorgente viene subito dopo; oltre tutti, la fine del tratto che finisce per ultimo."""
    dentro = next((p for p in tratti if p["da"] <= t < p["da"] + p["durata"]), None)
    if dentro:
        return dentro["esce"] + t - dentro["da"]
    dopo = min((p for p in tratti if p["da"] > t), key=lambda p: p["da"], default=None)
    if dopo:
        return dopo["esce"]
    ultimo = max(tratti, key=lambda p: p["da"] + p["durata"])
    return ultimo["esce"] + ultimo["durata"]


def detta(sorgente, t, stile):
    """Il primo istante di voce da `t` in poi: la trascrizione mette l'inizio di una parola anche nel silenzio prima."""
    parla, n = sorgente.voce, round(t * 100)
    while n < len(parla) and not parla[n]:
        n += 1
    return n / 100 + stile["taglio"]["a_tempo"]["detta"]


def silenzio_dopo(sorgente, fine, stile):
    """Quanti secondi si possono tenere dopo `fine` (secondi della sorgente) senza sentire la voce che segue, che si lascia a `voce.margine` di distanza;
    None se dopo non c'è più voce."""
    dopo = np.flatnonzero(sorgente.voce[round(fine * 100):])
    return None if not len(dopo) else max(0.0, (round(fine * 100) + dopo[0]) / 100 - stile["voce"]["margine"] - fine)


def picco_db(file):
    esito = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(file), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, encoding="utf-8", errors="replace")
    trovato = re.search(r"max_volume: (-?[\d.]+) dB", esito.stderr)
    if esito.returncode != 0 or not trovato:
        raise Errore(f"non riesco a misurare il suono {file}: {esito.stderr.strip()[-300:]}",
                     f"I cannot measure the sound {file}: {esito.stderr.strip()[-300:]}")
    return float(trovato.group(1))


def file_del_suono(archivio, slug, nome):
    """Il file di un suono: `materiali/` del video, poi quelli dei video da cui parte (`base`, così una versione tradotta non ricopia i suoni)."""
    assoluto = Path(nome)
    candidati = [assoluto] if assoluto.is_absolute() else []
    visto, qui = set(), slug
    while qui and qui not in visto:
        visto.add(qui)
        candidati.append(archivio.video(qui) / "materiali" / nome)
        qui = archivio.piano_scritto(qui).get("base")
    for candidato in candidati:
        if candidato.is_file():
            return candidato
    raise Errore(f"il suono «{nome}» non c'è: mettilo in materiali/ del video, o in materiali/ del video da cui parte",
                 f"the sound «{nome}» does not exist: put it in materiali/ of the video, or in materiali/ of the video it starts from")


def _immagini(tratti, sorgenti, misure):
    """Per le sorgenti con `immagine: "continua"` (uno schermo, senza labbra da seguire) l'immagine non salta a ogni taglio della voce:
    corre fino all'inizio del tratto dopo; dove il salto è vero, un'immagine più breve di `minimo` sarebbe un lampo e continua quella di prima."""
    for t in tratti:
        t["immagine"] = None
    serie, continua = [], lambda t: t["sorgente"] is not None and sorgenti[t["sorgente"]].get("immagine") == "continua"
    for k, t in enumerate(tratti):
        if not continua(t):
            continue
        prima = tratti[k - 1] if k else None
        vicino = prima is not None and serie and serie[-1][-1] == k - 1 and prima["sorgente"] == t["sorgente"] and 0 <= t["da"] - prima["da"] - prima["durata"] <= misure["salto"]
        if vicino:
            serie[-1].append(k)
        else:
            serie.append([k])
    for fila in serie:
        for k, dopo in zip(fila, fila[1:]):
            passo = round((tratti[dopo]["da"] - tratti[k]["da"]) / tratti[k]["durata"], 5)
            tratti[k]["immagine"] = {"da": tratti[k]["da"], "passo": min(passo, misure["passo_massimo"])}
        tratti[fila[-1]]["immagine"] = {"da": tratti[fila[-1]]["da"], "passo": 1.0}
    for fila in serie:
        prima = tratti[fila[0] - 1] if fila[0] else None
        if sum(tratti[k]["durata"] for k in fila) >= misure["minimo"] or prima is None or prima["immagine"] is None or prima["sorgente"] != tratti[fila[0]]["sorgente"]:
            continue
        for k in fila:
            prima = tratti[k - 1]
            tratti[k]["immagine"] = {"da": round(prima["immagine"]["da"] + prima["durata"] * prima["immagine"]["passo"], 4), "passo": 1.0}


def _girati(tratti, pezzi, sorgente, piano):
    """Ciò che lo strato `girato` mostra nei tratti di un pezzo che lo prende da un'altra ripresa: il fotogramma `fermo`, oppure la ripresa
    che corre da `da` per tutto il pezzo, di seguito anche sopra le pause tolte alla voce (a velocità vera, o al passo che la porta ad `a`)."""
    for (n, _), (a, b) in pezzi.items():
        voluto = tratti[a]["girato"]
        if not voluto:
            continue
        dove, nome = f"il girato della scena «{piano['scene'][n]['nome']}»", voluto["sorgente"]
        dove_en = f"the footage of scene «{piano['scene'][n]['nome']}»"
        durata = sorgente(nome).info["durata"]
        if "fermo" in voluto:
            if voluto["fermo"] >= durata:
                raise Errore(f"{dove} è fermo a {voluto['fermo']:.2f} s di «{nome}», fuori dalla ripresa, che dura {durata:.2f} s",
                             f"{dove_en} is frozen at {voluto['fermo']:.2f} s of «{nome}», outside the shot, which lasts {durata:.2f} s")
            continue
        suoi = tratti[a:b]
        lungo = suoi[-1]["esce"] + suoi[-1]["durata"] - suoi[0]["esce"]
        fine = voluto.get("a", voluto["da"] + lungo)
        if fine <= voluto["da"]:
            raise Errore(f"{dove} va da {voluto['da']:.2f} a {fine:.2f} s di «{nome}»: `a` dev'essere dopo `da`",
                         f"{dove_en} goes from {voluto['da']:.2f} to {fine:.2f} s of «{nome}»: `a` must come after `da`")
        if fine > durata:
            raise Errore(f"{dove} corre da {voluto['da']:.2f} a {fine:.2f} s di «{nome}», oltre la fine della ripresa, che dura {durata:.2f} s: "
                         "anticipa `da` o dai un `a` dentro la ripresa",
                         f"{dove_en} runs from {voluto['da']:.2f} to {fine:.2f} s of «{nome}», beyond the end of the shot, which lasts {durata:.2f} s: "
                         "move `da` earlier or give an `a` inside the shot")
        passo = round((fine - voluto["da"]) / lungo, 5)
        for t in suoi:
            t["girato"] = {"sorgente": nome, "da": round(voluto["da"] + (t["esce"] - suoi[0]["esce"]) * passo, 4), "passo": passo}


SEZIONI_FUORI_DAL_MONTATO = frozenset({"anteprima", "ascolta", "carosello", "controllo", "dettatura", "oggetti", "pagina", "parallelismo", "preparati", "prova", "scarico", "sticker"})


def impronta_di(piano, stile):
    """Dello stile contano le sezioni che cambiano il montato: quelle di altri lavori (la prova, le anteprime, il carosello…) no, e una sezione nuova conta finché non è qui."""
    del_montato = {k: v for k, v in stile.items() if k not in SEZIONI_FUORI_DAL_MONTATO}
    return hashlib.sha1(json.dumps({"piano": piano, "stile": del_montato}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def impronta_su_disco(archivio, slug):
    """L'impronta di `risolto["impronta"]` ricavata dai file di adesso (piano con la sua base, stile), senza risolvere."""
    return impronta_di(archivio.piano(slug), archivio.stile_su_disco())


def _traduci(frasi, sott, stile):
    """I sottotitoli in un'altra lingua: a ogni battuta la sua riga tradotta, coi tempi che ha già.
    In inglese le parole non sono quelle dette, quindi non si può andare «parola per parola»: le battute restano intere."""
    traduzione = sott.get("traduzione")
    if not traduzione:
        raise Errore("un piano in un'altra lingua vuole i suoi sottotitoli in `sottotitoli.traduzione`: una riga per battuta",
                     "a plan in another language wants its subtitles in `sottotitoli.traduzione`: one line per spoken line")
    if sott.get("modo", stile["sottotitoli"]["modo"]) == "parola per parola":
        raise Errore("coi sottotitoli tradotti non si va «parola per parola»: le parole inglesi non sono quelle dette. Metti `modo: \"a battute\"`",
                     "with translated subtitles you cannot go «parola per parola»: the English words are not the ones said. Set `modo: \"a battute\"`")
    if len(traduzione) != len(frasi):
        raise Errore(f"la traduzione ha {len(traduzione)} righe per {len(frasi)} battute: ne serve una per battuta, nell'ordine",
                     f"the translation has {len(traduzione)} lines for {len(frasi)} spoken lines: one is needed per spoken line, in order")
    for n, (b, riga) in enumerate(zip(frasi, traduzione), 1):
        if riga["it"] != b["testo"]:
            raise Errore(f"la traduzione alla riga {n} è per «{riga['it']}», ma la battuta {n} dice «{b['testo']}»: vanno rimesse in pari",
                         f"the translation at line {n} is for «{riga['it']}», but spoken line {n} says «{b['testo']}»: they must be realigned")
        b["testo"] = riga["en"]


def risolvi(archivio, slug, scrivi=True):
    piano, stile = archivio.piano(slug), archivio.stile
    formato = archivio.formato_del_piano(piano)
    fps = formato["fps"]
    sott = piano.get("sottotitoli", {})
    lingua = piano.get("lingua", "it")
    if lingua not in ("it", "en"):
        raise Errore(f"il motore sa fare i video in due lingue sole, «it» o «en»: la lingua «{lingua}» del piano non si può tradurre",
                     f"the engine makes videos in two languages only, «it» or «en»: the plan's language «{lingua}» cannot be translated")
    scrittura = sott.get("scrittura", stile["sottotitoli"]["scrittura"])
    sorgenti = {}

    def sorgente(nome):
        if nome not in sorgenti:
            if nome not in piano["sorgenti"]:
                raise Errore(f"il piano usa la sorgente «{nome}», che non dichiara fra le `sorgenti`",
                             f"the plan uses the source «{nome}», which it does not declare among the `sorgenti`")
            sorgenti[nome] = Sorgente(archivio, slug, nome, piano["sorgenti"][nome], sott)
        return sorgenti[nome]

    scelte, da_allineare = {}, {}
    for n, scena in enumerate(piano["scene"]):
        for m, pezzo in enumerate(scena["pezzi"]):
            if "dice" in pezzo:
                scelte[(n, m)] = sorgente(pezzo["sorgente"]).scegli(pezzo["minuto"], pezzo["dice"])
                da_allineare.setdefault(pezzo["sorgente"], []).append((n, m))
    veri = {}
    for nome, posti in da_allineare.items():
        for posto, v in zip(posti, sorgenti[nome].veri([scelte[p] for p in posti])):
            veri[posto] = v

    # Il tempo del video si conta in fotogrammi interi: sommando secondi arrotondati l'errore crescerebbe a ogni tratto.
    tratti, pezzi, fotogrammi, specifici = [], {}, 0, {}
    for n, scena in enumerate(piano["scene"]):
        nome_quadro = scena.get("quadro", piano.get("quadro"))
        # Ciò che il quadro mostra oltre l'animazione viene da un girato: un pezzo senza immagine non lo può dare.
        con_girato = {s["tipo"] for s in stile["quadri"].get(nome_quadro, {}).get("strati", [])} - {"animazione"}
        for m, pezzo in enumerate(scena["pezzi"]):
            if "durata" in pezzo:
                muto = pezzo.get("girato")
                problema = senza_voce(muto, con_girato, nome_quadro)
                if problema:
                    raise Errore(f"la scena «{scena['nome']}», pezzo {m + 1}: {problema}", f"scene «{scena['nome']}», piece {m + 1}: {problema.en}")
                pezzi[(n, m)], specifici[len(tratti)] = (len(tratti), len(tratti) + 1), {}
                # Senza voce ma con un `girato`, il pezzo mostra quella ripresa muta, inquadrata come un pezzo con la voce.
                tratti.append({"scena": n, "pezzo": m, "sorgente": None, "da": 0.0, "durata": quadri(pezzo["durata"], fps), "esce": round(fotogrammi / fps, 4),
                               "vista": pezzo.get("vista", scena.get("vista")) if muto else None, "zoom": pezzo.get("zoom"), "evidenzia": pezzo.get("evidenzia"),
                               "legato": [None, None], "sagoma": None, "girato": muto})
                fotogrammi += round(pezzo["durata"] * fps)
                continue
            s = sorgente(pezzo["sorgente"])
            if not s.info["ha_video"] and not pezzo.get("girato") and con_girato:
                raise Errore(f"la scena «{scena['nome']}», pezzo {m + 1}: «{pezzo['sorgente']}» è solo audio, e il pezzo vuole `girato` (la foto o la ripresa da mostrare)",
                             f"scene «{scena['nome']}», piece {m + 1}: «{pezzo['sorgente']}» is audio only, and the piece wants `girato` (the photo or footage to show)")
            if (n, m) in scelte:
                grezzi = a_parole(s, pezzo, scelte[(n, m)], veri[(n, m)], stile, fps)
            else:
                grezzi = [{"da": round(da, 3), "durata": quadri(a - da, fps), "legato": [None, None], "avvisi": {}} for da, a in a_tempo(s, pezzo, stile)]
            primo, altrove = len(tratti), pezzo.get("sagoma")
            for g in grezzi:
                specifici[len(tratti)] = g["avvisi"]
                sagoma = {"sorgente": altrove["sorgente"], "da": round(g["da"] + altrove["scarto"], 3)} if altrove else None
                tratti.append({"scena": n, "pezzo": m, "sorgente": pezzo["sorgente"], "da": g["da"], "durata": g["durata"], "esce": round(fotogrammi / fps, 4),
                               "vista": pezzo.get("vista", scena.get("vista")), "zoom": pezzo.get("zoom"), "evidenzia": pezzo.get("evidenzia"), "legato": g["legato"], "sagoma": sagoma,
                               "girato": pezzo.get("girato")})
                fotogrammi += round(g["durata"] * fps)
            pezzi[(n, m)] = (primo, len(tratti))
    if not tratti:
        raise Errore("il piano non tiene nessun tratto: ogni pezzo risulta vuoto",
                     "the plan keeps no stretch: every piece turns out empty")
    if piano.get("coda"):
        aggiunta = quadri(piano["coda"], fps)
        ultimo = tratti[-1]["sorgente"]
        libero = silenzio_dopo(sorgente(ultimo), tratti[-1]["da"] + tratti[-1]["durata"], stile) if ultimo else None
        if libero is not None:
            aggiunta = min(aggiunta, math.floor(libero * fps + 1e-6) / fps)
        tratti[-1]["durata"] = round(tratti[-1]["durata"] + aggiunta, 4)
        fotogrammi += round(aggiunta * fps)
    _girati(tratti, pezzi, sorgente, piano)
    for t in tratti:
        if t["sagoma"]:
            nome, da = t["sagoma"]["sorgente"], t["sagoma"]["da"]
            durata = sorgente(nome).info["durata"]
            if da < 0 or da + t["durata"] > durata:
                raise Errore(f"la sagoma della scena «{piano['scene'][t['scena']]['nome']}» cade fuori da «{nome}»: servirebbe da {da:.2f} a {da + t['durata']:.2f} s, "
                             f"e la ripresa dura {durata:.2f} s. Correggi `scarto` del pezzo",
                             f"the silhouette of scene «{piano['scene'][t['scena']]['nome']}» falls outside «{nome}»: it would need from {da:.2f} to {da + t['durata']:.2f} s, "
                             f"and the shot lasts {durata:.2f} s. Fix `scarto` of the piece")

    orologio = round(fotogrammi / fps, 4)
    _immagini(tratti, piano["sorgenti"], stile["immagine"])

    scene = []
    for n, scena in enumerate(piano["scene"]):
        suoi = [p for p in tratti if p["scena"] == n]
        if not suoi:
            raise Errore(f"la scena «{scena['nome']}» non tiene nessun tratto",
                         f"the scene «{scena['nome']}» keeps no stretch")
        inizio = suoi[0]["esce"]
        voce = {"nome": scena["nome"], "quadro": scena.get("quadro", piano.get("quadro")), "inizio": inizio, "durata": round(sum(p["durata"] for p in suoi), 4),
                "animazione": scena.get("animazione"), "ancore": [], "tempi": {}}
        di = lambda nome_sorgente: [p for p in suoi if p["sorgente"] == nome_sorgente]
        for nome_sorgente, t, in_scena in scena.get("ancore", []):
            if not di(nome_sorgente):
                raise Errore(f"la scena «{scena['nome']}» ha un'ancora su «{nome_sorgente}», che non usa",
                             f"the scene «{scena['nome']}» has an anchor on «{nome_sorgente}», which it does not use")
            voce["ancore"].append([round(nel_video(di(nome_sorgente), t) - inizio, 3), in_scena])
        voce["ancore"].sort()
        for nome, (nome_sorgente, t) in scena.get("parole", {}).items():
            if not di(nome_sorgente):
                raise Errore(f"la scena «{scena['nome']}» dice la parola «{nome}» su «{nome_sorgente}», che non usa",
                             f"the scene «{scena['nome']}» says the word «{nome}» on «{nome_sorgente}», which it does not use")
            voce["tempi"][nome] = round(nel_video(di(nome_sorgente), detta(sorgente(nome_sorgente), t, stile)) - inizio, 2)
        scene.append(voce)

    parole, avvisi = [], []
    for (n, m), (a, b) in pezzi.items():
        if tratti[a]["sorgente"] is None:
            continue
        suoi, s = tratti[a:b], sorgente(tratti[a]["sorgente"])
        di_questo = []
        if (n, m) in scelte:
            for k in range(*scelte[(n, m)]):
                da, fine, voto = veri[(n, m)][k]
                di_questo.append((s.parole[k]["p"], da, fine, voto))
            incerte = [f"«{p}» ({voto:.0%})" for p, _, _, voto in di_questo if voto < stile["taglio"]["a_parole"]["voto_bordo"]]
            if incerte:
                avvisi.append(_avviso(a, Frase("parole poco sicure, da riascoltare: " + ", ".join(incerte),
                                               "uncertain words, listen again: " + ", ".join(incerte))))
        else:
            tolleranza = stile["taglio"]["a_tempo"]["parola_dentro"]
            dentro = lambda t: any(p["da"] - tolleranza <= t < p["da"] + p["durata"] for p in suoi)
            for k, p in enumerate(s.parole):
                da, fine = p["da"] + s.sfasa, p["a"] + s.sfasa
                # La prima parola di una ripresa la trascrizione la mette a zero: vale la sua fine, e comincia col suo tratto.
                if dentro(fine if k == 0 else (da + fine) / 2):
                    di_questo.append((p["p"], da, fine, None))
        for p, da, fine, voto in di_questo:
            esce = nel_video(suoi, da)
            dove = max((k for k, t in enumerate(suoi) if t["esce"] <= esce + 1e-6), default=0)
            parole.append({"p": p, "da": round(esce, 3), "a": round(nel_video(suoi, fine), 3), "tratto": a + dove, "nella_sorgente": round(da, 3), "voto": voto,
                           "pezzo": (n, m)})
    for k, t in enumerate(tratti):
        prima = tratti[k - 1] if k and t["sorgente"] else None
        comune = max(prima["da"], t["da"]) if prima and prima["sorgente"] == t["sorgente"] else 0
        doppio = min(prima["da"] + prima["durata"], t["da"] + t["durata"]) - comune if prima and prima["sorgente"] == t["sorgente"] else 0
        if doppio > 1 / fps:
            avvisi.append(_avviso(k, Frase(f"si accavalla col tratto prima: {durata_scritta(doppio)} della sorgente «{t['sorgente']}» si sentono due volte (da {durata_scritta(comune)})",
                                           f"overlaps the previous stretch: {durata_en(doppio)} of the source «{t['sorgente']}» are heard twice (from {durata_en(comune)})")))
        for lato, (nome, nome_en, db) in enumerate(zip(("all'inizio", "alla fine"), ("at the start", "at the end"), t["legato"])):
            if lato in specifici[k]:
                avvisi.append(_avviso(k, specifici[k][lato]))
            elif db is not None:
                avvisi.append(_avviso(k, Frase(f"il taglio {nome} cade nella voce ({db:.0f} dB)",
                                               f"the cut {nome_en} falls in the voice ({db:.0f} dB)")))

    frasi, rilievo = [], frozenset(chiave(w) for w in sott.get("rilievo", []))
    for (n, m), (a, b) in pezzi.items():
        suoi = tratti[a:b]
        dette = [{"p": w["p"], "esce": w["da"], "finisce": w["a"]} for w in parole if w["pezzo"] == (n, m)]
        tradotte = piano["scene"][n]["pezzi"][m].get("sottotitoli_tradotti")
        if dette and tradotte:
            dette = parole_tradotte(dette, tradotte, scrittura == "minuscola", set(sott.get("nomi", [])))
        if dette:
            frasi += [{"da": round(da, 3), "a": round(fine, 3), "testo": testo, "istanti": [round(i, 3) for i in istanti], **({"rilievo": True} if chiave(testo) in rilievo else {})}
                      for da, fine, testo, istanti in battute(dette, suoi[0]["esce"], round(suoi[-1]["esce"] + suoi[-1]["durata"], 4), stile, scrittura, rilievo)]
    if lingua != "it":
        _traduci(frasi, sott, stile)
    for w in parole:
        del w["pezzo"]

    suoni = []
    for suono in piano.get("suoni", []):
        if "scena" in suono:
            voce = next((s for s in scene if s["nome"] == suono["scena"]), None)
            if voce is None:
                raise Errore(f"il suono «{suono['file']}» parte nella scena «{suono['scena']}», che il piano non ha: le scene sono {', '.join(s['nome'] for s in scene)}",
                             f"the sound «{suono['file']}» starts in the scene «{suono['scena']}», which the plan does not have: the scenes are {', '.join(s['nome'] for s in scene)}")
            esce = voce["inizio"] + suono["t"]
        else:
            scena = next((s for s in piano["scene"] if any(p.get("sorgente") == suono["sorgente"] for p in s["pezzi"])), None)
            if scena is None:
                raise Errore(f"il suono «{suono['file']}» parte su «{suono['sorgente']}», che nessuna scena usa",
                             f"the sound «{suono['file']}» starts on «{suono['sorgente']}», which no scene uses")
            n = piano["scene"].index(scena)
            esce = nel_video([p for p in tratti if p["scena"] == n and p["sorgente"] == suono["sorgente"]], suono["t"])
        file = file_del_suono(archivio, slug, suono["file"])
        suoni.append({"file": suono["file"], "esce": round(esce, 3), "guadagno": round(suono["picco"] - picco_db(file), 1)})

    titolo = None
    if piano.get("titolo"):
        da = piano["titolo"].get("da", 0)
        titolo = {"testo": piano["titolo"]["testo"], "parte": piano["titolo"].get("parte"), "da": da, "a": piano["titolo"].get("a", min(da + stile["titolo"]["durata"], orologio))}
    risolto = {
        "impronta": impronta_di(piano, stile), "lingua": lingua,
        "formato": formato, "durata": orologio, "capitoli": [{"titolo": piano["scene"][n]["capitolo"], "da": voce["inizio"]} for n, voce in enumerate(scene) if piano["scene"][n].get("capitolo")], "scene": scene, "tratti": tratti, "parole": parole, "battute": frasi, "titolo": titolo,
        "copertina": piano.get("copertina"), "suoni": suoni, "avvisi": avvisi,
    }
    if scrivi:
        scrivi_json(archivio.lavoro(slug) / "risolto.json", risolto, indent=1)
    return risolto
