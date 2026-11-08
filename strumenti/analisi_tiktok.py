"""I rapporti e le statistiche di visione dei video del canale TikTok, ricavati dalle letture in archivio.

Uso: python -m strumenti.analisi_tiktok [--lettura NOME] [--giorni N] [--json] [--scrivi FILE]

Senza `--lettura` prende l'ultima lettura di `ultima.json`. Stampa in markdown il profilo, una tabella per video
e i totali; i rapporti sono per 1000 visualizzazioni. `--giorni` tiene solo i video pubblicati negli ultimi N giorni
rispetto alla lettura. Con `--scrivi` mette il markdown in un file invece che a schermo."""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

from motore.archivio import archivio_di_lavoro
from motore.errori import Errore

RAPPORTI = ("mi_piace", "commenti", "condivisioni", "salvati", "nuovi_follower")


def cartella_del_canale(archivio=None):
    return Path(archivio or archivio_di_lavoro()) / "canali" / "tiktok"


def ultima_lettura(archivio=None):
    """Il nome dell'ultima lettura riuscita, da `ultima.json`."""
    return json.loads((cartella_del_canale(archivio) / "ultima.json").read_text(encoding="utf-8"))["lettura"]


def leggi(archivio=None, nome=None):
    """Il nome, il profilo e i video di una lettura. Senza nome, l'ultima."""
    nome = nome or ultima_lettura(archivio)
    cartella = cartella_del_canale(archivio) / "letture" / nome
    profilo = json.loads((cartella / "profilo.json").read_text(encoding="utf-8"))
    video = json.loads((cartella / "video.json").read_text(encoding="utf-8"))
    return nome, profilo, video["video"], video["quando"]


def per_mille(valore, visualizzazioni):
    """Quante volte `valore` ogni 1000 visualizzazioni. None se non c'è né il valore né il divisore."""
    if valore is None or not visualizzazioni:
        return None
    return valore * 1000 / visualizzazioni


def con_numeri(video):
    """I video di cui la lettura ha davvero le visualizzazioni (gli altri restano nella lettura, ma non si contano)."""
    return [v for v in video if v.get("visualizzazioni")]


def pubblicati_negli_ultimi(video, quando, giorni):
    """I video pubblicati negli ultimi `giorni` giorni, contati dalla data della lettura."""
    da = datetime.fromisoformat(quando).date() - timedelta(days=giorni)
    return [v for v in video if v.get("pubblicato") and datetime.fromisoformat(v["pubblicato"]).date() >= da]


def rapporti(v):
    """I rapporti per 1000 visualizzazioni di un video, più la frazione di durata guardata in media."""
    vis = v.get("visualizzazioni")
    fuori = {campo + "_per_mille": per_mille(v.get(campo), vis) for campo in RAPPORTI}
    if v.get("tempo_medio") is not None and v.get("durata"):
        fuori["visto_in_frazione"] = v["tempo_medio"] / v["durata"]
    return fuori


def _somma(video, campo):
    return sum(v[campo] for v in video if v.get(campo) is not None) or None


def _media(video, campo):
    valori = [v[campo] for v in video if v.get(campo) is not None]
    return sum(valori) / len(valori) if valori else None


def totali(video):
    """I totali di un gruppo di video.

    `tempo_medio_pesato` sono i secondi di visione divisi per le visualizzazioni, sui soli video che dichiarano il
    tempo di riproduzione: è la media che conta, perché pesa i video che hanno portato più pubblico."""
    vis = _somma(video, "visualizzazioni")
    fuori = {"video": len(video), "visualizzazioni": vis}
    for campo in RAPPORTI:
        fuori[campo] = _somma(video, campo)
        fuori[campo + "_per_mille"] = per_mille(fuori[campo], vis)
    secondi = sum(v.get("tempo_riproduzione_s") or 0 for v in video)
    visti = sum(v["visualizzazioni"] for v in video if v.get("tempo_riproduzione_s") is not None)
    fuori["ore"] = secondi / 3600 if secondi else None
    fuori["tempo_medio_pesato"] = secondi / visti if visti else None
    fuori["tempo_medio"] = _media(video, "tempo_medio")
    fuori["visti_fino_in_fondo"] = _media(video, "visti_fino_in_fondo")
    fuori["da_per_te"] = _media(video, "da_per_te")
    fuori["durata"] = _media(video, "durata")
    return fuori


def it(valore, dec=0):
    """Un numero scritto all'italiana: 4.112, 35,0."""
    if valore is None:
        return "—"
    return f"{valore:,.{dec}f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def mmss(secondi):
    """I secondi come minuti e secondi, arrotondati al secondo: `28,96` → «0:29»."""
    if secondi is None:
        return "—"
    s = round(secondi)
    return f"{s // 60}:{s % 60:02d}"


def _tabella(intestazioni, righe):
    fuori = ["| " + " | ".join(intestazioni) + " |", "|" + "|".join("---" for _ in intestazioni) + "|"]
    fuori += ["| " + " | ".join(r) + " |" for r in righe]
    return "\n".join(fuori)


def markdown(profilo, video, quando, titolo_lettura):
    """La lettura di un canale in markdown: profilo, cosa fa il pubblico, quanto si guarda, i totali."""
    vis = [v for v in con_numeri(video)]
    nome_video = lambda v: v.get("slug") or (v.get("didascalia") or v.get("id"))[:40]
    pezzi = [f"# Analisi TikTok — lettura {titolo_lettura} ({quando})", ""]
    righe_profilo = [f"{it(profilo.get('follower'))} follower", f"{it(profilo.get('seguiti'))} seguiti",
                     f"{it(profilo.get('mi_piace'))} mi piace", f"{it(profilo.get('video'))} video"]
    pezzi += ["Profilo: " + " · ".join(righe_profilo), ""]
    if sette := profilo.get("ultimi_7_giorni"):
        etichette = {"visualizzazioni": "visualizzazioni", "visite_al_profilo": "visite al profilo", "mi_piace": "mi piace",
                     "commenti": "commenti", "condivisioni": "condivisioni", "da_per_te": "da «Per te»"}
        parti = []
        for chiave, etichetta in etichette.items():
            if chiave in sette:
                dec = 1 if chiave == "da_per_te" else 0
                parti.append(f"{etichetta} {it(sette[chiave], dec)}" + ("%" if chiave == "da_per_te" else ""))
        pezzi += ["Ultimi 7 giorni: " + " · ".join(parti), ""]

    pezzi += [f"## Cosa fa il pubblico ({len(vis)} video, per 1000 visualizzazioni)", ""]
    intestazioni = ["video", "visite", "mi piace", "/1000", "commenti", "/1000", "condivisioni", "/1000", "salvati", "/1000", "nuovi follower", "/1000"]
    righe = []
    for v in vis:
        r = rapporti(v)
        righe.append([nome_video(v), it(v.get("visualizzazioni")), it(v.get("mi_piace")), it(r["mi_piace_per_mille"], 1),
                      it(v.get("commenti")), it(r["commenti_per_mille"], 1), it(v.get("condivisioni")), it(r["condivisioni_per_mille"], 1),
                      it(v.get("salvati")), it(r["salvati_per_mille"], 1), it(v.get("nuovi_follower")), it(r["nuovi_follower_per_mille"], 1)])
    pezzi += [_tabella(intestazioni, righe), ""]

    pezzi += ["## Quanto si guarda", ""]
    intestazioni = ["video", "durata", "tempo medio", "guardato in media", "fino in fondo", "ore viste", "da Per te", "ricerche"]
    righe = []
    for v in vis:
        r = rapporti(v)
        righe.append([nome_video(v), mmss(v.get("durata")), mmss(v.get("tempo_medio")), it(100 * r.get("visto_in_frazione", 0) if r.get("visto_in_frazione") is not None else None, 1) + "%" if r.get("visto_in_frazione") is not None else "—",
                      it(v.get("visti_fino_in_fondo"), 1) + "%" if v.get("visti_fino_in_fondo") is not None else "—",
                      it((v.get("tempo_riproduzione_s") or 0) / 3600, 0) if v.get("tempo_riproduzione_s") else "—",
                      it(v.get("da_per_te"), 1) + "%" if v.get("da_per_te") is not None else "—",
                      it(len(v.get("ricerche", []))) if v.get("ricerche") else "—"])
    pezzi += [_tabella(intestazioni, righe), ""]

    t = totali(vis)
    pezzi += ["## Totali", ""]
    pezzi += [f"- {t['video']} video, {it(t['visualizzazioni'])} visualizzazioni",
              f"- {it(t['mi_piace'])} mi piace ({it(t['mi_piace_per_mille'], 1)} per 1000), {it(t['commenti'])} commenti ({it(t['commenti_per_mille'], 1)} per 1000)",
              f"- {it(t['condivisioni'])} condivisioni ({it(t['condivisioni_per_mille'], 1)} per 1000), {it(t['salvati'])} salvati ({it(t['salvati_per_mille'], 1)} per 1000)",
              f"- {it(t['nuovi_follower'])} nuovi follower ({it(t['nuovi_follower_per_mille'], 1)} per 1000)",
              f"- {it(t['ore'], 0)} ore viste, tempo medio {mmss(t['tempo_medio_pesato'])} per visualizzazione ({it(t['tempo_medio'], 1)} s la media dei video)",
              f"- visto fino in fondo in media il {it(t['visti_fino_in_fondo'], 1)}%, da «Per te» il {it(t['da_per_te'], 1)}%"]
    return "\n".join(pezzi).rstrip() + "\n"


def main(argv=None):
    p = argparse.ArgumentParser(description="Rapporti e statistiche di visione delle letture TikTok")
    p.add_argument("--lettura", help="il nome della lettura (predefinito: l'ultima di ultima.json)")
    p.add_argument("--giorni", type=int, help="solo i video pubblicati negli ultimi N giorni, dalla data della lettura")
    p.add_argument("--json", action="store_true", help="i numeri in JSON invece che in markdown")
    p.add_argument("--scrivi", help="scrive il markdown in questo file")
    p.add_argument("--archivio", help="l'archivio da leggere (predefinito: quello della cartella di lavoro)")
    a = p.parse_args(argv)
    try:
        nome, profilo, video, quando = leggi(a.archivio, a.lettura)
    except Errore as e:
        raise SystemExit(str(e))
    if a.giorni is not None:
        video = pubblicati_negli_ultimi(video, quando, a.giorni)
    vis = con_numeri(video)
    if a.json:
        testo = json.dumps({"lettura": nome, "profilo": profilo, "totali": totali(vis),
                            "video": [{**{k: v.get(k) for k in ("slug", "pubblicato", "durata", "visualizzazioni")}, **rapporti(v)} for v in vis]},
                           ensure_ascii=False, indent=2) + "\n"
    else:
        testo = markdown(profilo, video, quando, nome)
    if a.scrivi:
        Path(a.scrivi).write_text(testo, encoding="utf-8")
        print(a.scrivi)
    else:
        print(testo, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())