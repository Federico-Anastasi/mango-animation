import math

import numpy as np

from .allinea import suoni
from .errori import Errore, Frase
from .voce import PASSO, serie


def quadri(secondi, fps):
    return round(secondi * fps) / fps


def a_tempo(sorgente, pezzo, stile):
    """I tratti (da, a) della sorgente che restano, a tempo: dalla prima all'ultima voce, senza le pause lunghe e i tratti in `via`."""
    t, v = stile["taglio"]["a_tempo"], stile["voce"]
    parla = sorgente.voce
    sonori = np.flatnonzero(parla)
    if ("da" not in pezzo or "a" not in pezzo) and not len(sonori):
        raise Errore(f"nella sorgente «{sorgente.nome}» non c'è voce: dai un `da` e un `a` al pezzo",
                     f"the source «{sorgente.nome}» has no voice: give the piece a `da` and an `a`")
    # Prima della prima parola e dopo l'ultima c'è il rumore di chi avvia e ferma la ripresa: non è voce.
    if "da" in pezzo:
        da = pezzo["da"]
    else:
        da = max(0.0, sonori[0] / 100 - t["prima"], sorgente.parole[0]["da"] + sorgente.sfasa - t["parola_prima"])
    if "a" in pezzo:
        # Oltre la fine della ripresa non c'è niente: il livello non lo dice silenzio, e diventerebbe una coda muta.
        a = min(pezzo["a"], len(parla) / 100)
    else:
        a = min(len(parla) / 100, sonori[-1] / 100 + t["dopo"], sorgente.parole[-1]["a"] + sorgente.sfasa + t["parola_dopo"])
    pausa = pezzo.get("pausa", t["pausa"])
    buchi = [tuple(b) for b in pezzo.get("via", [])]
    primo, fine, inizio = round(da * 100), round(a * 100), None
    for n in range(primo, fine + 1):
        zitto = n < len(parla) and not parla[n] and n < fine
        if zitto and inizio is None:
            inizio = n
        if not zitto and inizio is not None:
            testa, coda = inizio == primo, n == fine
            # In testa e in coda non si aspetta: lì il silenzio va via tutto, qualunque sia la pausa, e fino al bordo del pezzo
            # (col margine resterebbe un frammento muto).
            b0, b1 = da if testa else inizio / 100 + v["margine"], a if coda else n / 100 - v["margine"]
            if b1 > b0 and (testa or coda or (n - inizio) / 100 >= pausa):
                buchi.append((b0, b1))
            inizio = None
    fuori, parte = [], da
    for b0, b1 in sorted(buchi):
        if b0 <= parte:
            parte = max(parte, b1)
            continue
        b0 = max(b0, parte + t["tratto_minimo"])  # un pezzo più corto di così è un inciampo: si lascia la pausa, ma solo quella che serve
        if b0 < b1:
            fuori.append((parte, b0))
            parte = b1
    fuori.append((parte, a))
    return [(da, a) for da, a in fuori if a > da]


def _bordo(db, forte, primo, ultimo, attacco, stile):
    """Dove tagliare fra due finestre: nel silenzio, tenendo il margine dalla parte della voce; senza silenzio, dove
    il suono è più basso. Torna (finestra, dB del taglio o None se è silenzio)."""
    ap = stile["taglio"]["a_parole"]
    muti = [(a + primo, b + primo) for a, b in serie(~forte[primo:ultimo + 1])]
    lunghi = [m for m in muti if (m[1] - m[0]) * PASSO >= ap["stacco"]]
    margine = round(stile["voce"]["margine"] / PASSO)
    if lunghi:
        a, b = lunghi[-1] if attacco else lunghi[0]
        return (max(a, b - margine) if attacco else min(b, a + margine)), None
    if muti:  # lo stacco più vicino alla parola tenuta: quelli più in là separano suoni che non le appartengono
        a, b = muti[-1] if attacco else muti[0]
        return (a + b) // 2, None
    # Senza silenzio si resta a ridosso della parola tenuta: più in là c'è un suono che non le appartiene.
    vicino = round(ap["vicino"] / PASSO)
    primo, ultimo = (max(primo, ultimo - vicino), ultimo) if attacco else (primo, min(ultimo, primo + vicino))
    k = primo + int(np.argmin(db[primo:ultimo + 1]))
    return (k if attacco else k + 1), float(db[k])


def durata_scritta(x):
    return f"{x:.1f}".replace(".", ",") + " s"


def durata_en(x):
    return f"{x:.1f} s"


def incerta(sorgente, k, veri, stile):
    """L'allineamento della parola `k` non dice dove cade la voce: il voto è basso, oppure il testo non si scrive in lettere (cifre con la virgola,
    sigle, %) e l'allineatore lo copre con «qualunque suono», che si stende anche sul silenzio accanto."""
    return veri[k][2] < stile["taglio"]["a_parole"]["voto_bordo"] or suoni(sorgente.parole[k]["p"]) == "*"


def _senza_rumori(db, forte, stile):
    """La voce senza i rumori: ciò che suona poco, molto più piano del resto e staccato dalla voce (un respiro, un fruscio) non è voce."""
    ap = stile["taglio"]["a_parole"]
    gruppi = []
    for a, b in serie(forte):
        if gruppi and (a - gruppi[-1][-1][1]) * PASSO < ap["stacco"]:
            gruppi[-1].append((a, b))
        else:
            gruppi.append([(a, b)])
    pulita = forte.copy()
    for gruppo in gruppi:
        if sum(b - a for a, b in gruppo) * PASSO < ap["colpo"] and db[gruppo[0][0]:gruppo[-1][1]].max() < db.max() - ap["rumore_db"]:
            pulita[gruppo[0][0]:gruppo[-1][1]] = False
    return pulita


def _isola(forte, da, a, silenzio):
    """La prima voce in forte[da:a] e quella che la segue finché i vuoti restano sotto `silenzio` passi: (primo, ultimo + 1),
    o None se non c'è voce o l'isola non si chiude con un silenzio prima di `a`."""
    corse = serie(forte[da:a])
    if not len(corse):
        return None
    primo, ultimo = corse[0]
    for prossima in corse[1:]:
        if prossima[0] - ultimo >= silenzio:
            break
        ultimo = prossima[1]
    else:
        if a - da - ultimo < silenzio:
            return None
    return da + primo, da + ultimo


def _isola_prima(forte, da, fino, silenzio):
    """Come `_isola`, ma all'indietro da `da` (compreso) fino a `fino`: l'indice del primo passo di voce dell'isola."""
    isola = _isola(forte[fino:da + 1][::-1], 0, max(0, da + 1 - fino), silenzio)
    return None if isola is None else da + 1 - isola[1]


def _resto(forte, da, a):
    """Quanti passi di voce continua da `da` verso `a` (anche all'indietro), senza oltrepassare `a`; None se la voce arriva fino ad `a`."""
    passo = 1 if a >= da else -1
    n = 0
    while da + passo * n != a and 0 <= da + passo * n < len(forte) and forte[da + passo * n]:
        n += 1
    return None if da + passo * n == a else n


def a_parole(sorgente, pezzo, ij, veri, stile):
    """Il pezzo a parole (le parole i..j-1 della sorgente, coi confini veri dell'allineamento) diventa i suoi tratti di voce:
    [{da, durata, legato: [db o None, db o None], avvisi: {0: inizio, 1: fine}}], secondi del contenitore arrotondati al fotogramma; `avvisi` dice
    dove una `rifila` taglia la voce."""
    ap, fps = stile["taglio"]["a_parole"], stile["formato"]["fps"]
    i, j = ij
    comincia, finisce = veri[i][0], veri[j - 1][1]
    prima = max(veri[i - 1][1], comincia - ap["cerca_prima"]) if i - 1 in veri else comincia - ap["cerca_prima"]
    dopo = min(veri[j][0], finisce + ap["cerca_dopo"]) if j in veri else finisce + ap["cerca_dopo"]
    # Ai bordi dove l'allineamento non è sicuro la voce si cerca più in là, e la parola accanto, se è sicura, è il limite.
    sicura = lambda k: k in veri and not incerta(sorgente, k, veri, stile)
    inizio_incerto, fine_incerta = incerta(sorgente, i, veri, stile), incerta(sorgente, j - 1, veri, stile)
    pavimento = (max(veri[i - 1][1], comincia - ap["cerca_incerta"]) if sicura(i - 1) else comincia - ap["cerca_incerta"]) if inizio_incerto else prima
    tetto = (min(veri[j][0], finisce + ap["cerca_incerta"]) if sicura(j) else finisce + ap["cerca_incerta"]) if fine_incerta else dopo
    zero = max(0.0, min(prima, pavimento) - ap["rincalzo"])
    db = sorgente.livello(zero, max(dopo, tetto) + ap["ascolta_oltre"] - zero)
    if len(db) < 2:
        raise Errore(f"il pezzo «{' '.join(p['p'] for p in sorgente.parole[i:j])}» cade oltre la fine di «{sorgente.nome}»",
                     f"the piece «{' '.join(p['p'] for p in sorgente.parole[i:j])}» falls beyond the end of «{sorgente.nome}»")
    forte = db >= stile["voce"]["silenzio_db"]
    f = lambda t: min(len(db) - 1, max(0, round((t - zero) / PASSO)))
    inizio, legato_prima = _bordo(db, forte, f(prima - ap["bordo"]), f(comincia + ap["parola"]), True, stile)
    # Senza silenzio dopo l'ultima parola si taglia entro pochi decimi, prima che la parola seguente prenda corpo.
    ultimo = f(dopo + ap["bordo"]) if not forte[f(finisce - ap["parola"]):f(dopo + ap["bordo"]) + 1].all() else f(min(dopo + ap["bordo"], finisce + ap["chiusa_senza_silenzio"]))
    fine, legato_dopo = _bordo(db, forte, f(finisce - ap["parola"]), ultimo, False, stile)
    margine = round(stile["voce"]["margine"] / PASSO)
    silenzio = round(ap["silenzio_bordo"] / PASSO)
    pulita = _senza_rumori(db, forte, stile) if inizio_incerto or fine_incerta else forte
    if inizio_incerto and (voce := _isola_prima(pulita, f(veri[i][1]), f(pavimento), silenzio)) is not None:
        inizio, legato_prima = max(0, voce - margine), None
    if fine_incerta and (voce := _isola(pulita, f(veri[j - 1][0]), f(tetto), silenzio)):
        fine, legato_dopo = min(len(db) - 1, voce[1] + margine), None
    avvisi = {}
    if "rifila" in pezzo:
        inizio = max(0, inizio + round(pezzo["rifila"][0] / PASSO))
        fine = min(len(db) - 1, fine + round(pezzo["rifila"][1] / PASSO))
        if fine <= inizio:
            raise Errore(f"`rifila` toglie tutto il pezzo «{pezzo['dice']}»: i due bordi si incrociano",
                         f"`rifila` removes the whole piece «{pezzo['dice']}»: the two edges cross")
        legato_prima = float(db[inizio]) if forte[inizio] else None
        legato_dopo = float(db[fine - 1]) if forte[fine - 1] else None
        # Una rifila che cade dentro la voce non si corregge da sola: potrebbe essere voluta (il bordo della parola accanto), si dice.
        voce_tagliata = ap["voce_tagliata"] / PASSO
        dopo_il_taglio = _resto(forte, fine, f(tetto)) if legato_dopo is not None else None
        if dopo_il_taglio is not None and dopo_il_taglio >= voce_tagliata:
            avvisi[1] = Frase(f"la fine cade nella voce a {legato_dopo:.0f} dB, {durata_scritta(dopo_il_taglio * PASSO)} prima che la voce finisca (sorgente {durata_scritta(zero + fine * PASSO)})",
                              f"the end falls in the voice at {legato_dopo:.0f} dB, {durata_en(dopo_il_taglio * PASSO)} before the voice ends (source {durata_en(zero + fine * PASSO)})")
        prima_del_taglio = _resto(forte, inizio - 1, f(pavimento) - 1) if legato_prima is not None else None
        if prima_del_taglio is not None and prima_del_taglio >= voce_tagliata:
            avvisi[0] = Frase(f"l'inizio cade nella voce a {legato_prima:.0f} dB, {durata_scritta(prima_del_taglio * PASSO)} dopo che la voce è cominciata (sorgente {durata_scritta(zero + inizio * PASSO)})",
                              f"the start falls in the voice at {legato_prima:.0f} dB, {durata_en(prima_del_taglio * PASSO)} after the voice started (source {durata_en(zero + inizio * PASSO)})")
    # Dentro il tratto: un colpo di tastiera o un respiro (voce breve, fuori da ogni parola) è silenzio.
    dentro = forte[inizio:fine].copy()
    tolleranza = round(ap["parola"] / PASSO)
    parole = [(f(veri[k][0]) - inizio, f(veri[k][1]) - inizio) for k in range(i, j)]
    for a, b in serie(dentro):
        if (b - a) * PASSO < ap["colpo"] and not any(a < pb + tolleranza and pa - tolleranza < b for pa, pb in parole):
            dentro[a:b] = False
    # Fra due parole trovate bene, un vuoto oltre la pausa è un'esitazione anche se suona: la trascrizione non la scrive.
    for k, (prima_parola, (pa, _)) in enumerate(zip(parole, parole[1:]), i):
        if (pa - prima_parola[1]) * PASSO > ap["pausa"] and min(veri[k][2], veri[k + 1][2]) >= ap["voto_esitazione"]:
            dentro[max(0, prima_parola[1]):max(0, pa)] = False
    tagli = [(a + margine, b - margine) for a, b in serie(~dentro) if 0 < a and b < len(dentro) and (b - a) * PASSO > ap["pausa"]]
    confini = [inizio, *(k + inizio for taglio in tagli for k in taglio), fine]
    fuori = []
    for n, (a, b) in enumerate(zip(confini[::2], confini[1::2])):
        # Al fotogramma si arrotonda verso il silenzio; un taglio dentro il parlato verso la parola tenuta.
        legato = (legato_prima if n == 0 else None, legato_dopo if 2 * n + 2 == len(confini) else None)
        arrotonda_da = math.ceil if legato[0] is not None else math.floor
        da = arrotonda_da((zero + a * PASSO) * fps + (1e-6 if legato[0] is None else -1e-6)) / fps
        arrotonda_a = math.floor if legato[1] is not None else math.ceil
        durata = max(ap["fotogrammi_minimi"], arrotonda_a((zero + b * PASSO - da) * fps + (1e-6 if legato[1] is not None else -1e-6))) / fps
        fuori.append({"da": float(da), "durata": float(durata), "legato": list(legato), "avvisi": {}})
    if 0 in avvisi:
        fuori[0]["avvisi"][0] = avvisi[0]
    if 1 in avvisi:
        fuori[-1]["avvisi"][1] = avvisi[1]
    return fuori
