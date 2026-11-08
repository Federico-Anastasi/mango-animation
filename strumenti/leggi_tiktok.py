r"""Il giro su TikTok del canale del creator pilotando il suo Chrome (Playwright, via CDP), in sola lettura.

Chrome dev'essere aperto col collegamento acceso (`chrome://inspect/#remote-debugging`): la porta la scrive in
`<profilo>\DevToolsActivePort`, e a ogni giro chiede al creator di consentirlo. Il modulo apre una scheda propria e non
tocca quelle aperte: non mette mi piace, non commenta, non segue, non cambia impostazioni, e apre solo le conversazioni
cambiate dalla lettura di prima (aprirne una la segna come letta).

    python -m strumenti.leggi_tiktok [--da AAAA-MM-GG] [--profilo-chrome PERCORSO] [--uscita CARTELLA] [--grezzi CARTELLA] [--prova]
                                     [--preferiti N] [--solo-preferiti]

Scrive una lettura nuova in `archivio/canali/tiktok/letture/<AAAA-MM-GG-HHMM>/` — `profilo.json`, `video.json`,
`commenti/<id>.json` (man mano), `messaggi.json`, `esito.json`, nella forma di `docs/ARCHIVIO.md` — e aggiorna `ultima.json`. Con `--uscita` scrive lì e non tocca
`ultima.json`; con `--prova` non scrive niente e stampa quello che ha letto; con `--grezzi` salva anche il testo
delle pagine, che serve quando TikTok cambia le sue pagine e le espressioni qui sotto non leggono più.

I Preferiti (i video che il creator ha salvato, dal più recente) li legge ogni giro, i primi `--preferiti` (10; 0 li salta), e li scrive
interi in `archivio/canali/tiktok/preferiti.json`: non fanno parte di una lettura del canale. Con `--solo-preferiti` fa solo questo, senza
profilo, elenco e analisi, e non ha bisogno di una lettura precedente. Se non ne legge nessuno non riscrive il file.

Un limite da conoscere: l'elenco dei contenuti di TikTok Studio carica solo le prime righe, quindi i video si
enumerano dagli id dell'ultima lettura più quelli nuovi che l'elenco mostra. Se un video esce e l'elenco non lo
mostra nel primo schermo, non entra.
"""
import argparse
import json
import os
import random
import re
from datetime import datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path

from playwright.sync_api import TimeoutError as TempoScaduto
from playwright.sync_api import sync_playwright

from motore.archivio import archivio_di_lavoro
from motore.errori import Errore
from motore.profilo import leggi_profilo as profilo_del_creator
from motore.profilo import macchina_di_lavoro

MESI = {"gen": 1, "feb": 2, "mar": 3, "apr": 4, "mag": 5, "giu": 6, "lug": 7, "ago": 8, "set": 9, "ott": 10, "nov": 11, "dic": 12}
MEDAGLIE = {"K": 1000, "M": 1000000, "B": 1000000000}
RIGA_ELENCO = re.compile(
    r"(?P<durata>\d{1,2}:\d{2})\n(?P<didascalia>.+?)\n(?:Fissato\n)?(?P<data>\d{1,2} \w{3} \d{2}:\d{2})\n"
    r"(?P<privacy>[^\n]+)\n(?P<visite>[^\n]+)\n(?P<piacciono>[^\n]+)\n(?P<commenti>[^\n]+)(?:\n|$)")


def profilo_chrome():
    """Il profilo di Chrome con la porta di debug: `macchina.profilo_chrome` del profilo del creator, altrimenti quello che Windows dà a Chrome."""
    indicato = macchina_di_lavoro().get("profilo_chrome")
    if indicato:
        return Path(indicato)
    locale = os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local"
    return Path(locale) / "Google" / "Chrome" / "User Data"


def account_tiktok(lavoro):
    """Il canale TikTok del creator, senza @: la voce `tiktok` di `canali` nel profilo."""
    for canale in profilo_del_creator(lavoro).get("canali", []):
        if canale["piattaforma"] == "tiktok" and canale.get("nome"):
            return canale["nome"].lstrip("@")
    raise Errore('il profilo del creator non dice il suo canale TikTok: aggiungi in profilo.json, in `canali`, {"piattaforma": "tiktok", "nome": "@…"}',
                 'the profile does not name their TikTok channel: add to profilo.json, in `canali`, {"piattaforma": "tiktok", "nome": "@…"}')


def indirizzo_profilo(account):
    return f"https://www.tiktok.com/@{account}"


def riposo(pagina, minimo=1.5, massimo=4.0):
    """Una pausa di durata diversa ogni volta: il giro va al passo di una persona, non a raffica."""
    pagina.wait_for_timeout(random.uniform(minimo, massimo) * 1000)


def connetti(profilo):
    porta_di_debug = Path(profilo) / "DevToolsActivePort"
    if not porta_di_debug.is_file():
        raise Errore(f"Chrome non è in ascolto nel profilo {profilo}: aprilo con --remote-debugging-port, oppure indica il profilo giusto in profilo.json (macchina.profilo_chrome)",
                     f"Chrome is not listening in profile {profilo}: open it with --remote-debugging-port, or set the right profile in profilo.json (macchina.profilo_chrome)")
    porta, percorso = porta_di_debug.read_text().split()
    return f"ws://127.0.0.1:{porta}{percorso}"


def numero(testo):
    """Un numero come lo scrive TikTok: `30K`, `1,092`, `30.3K`, `1K`."""
    m = re.fullmatch(r"([\d.,]+)([KMB])?", testo.strip().replace(" ", ""))
    return round(float(m[1].replace(",", "")) * MEDAGLIE.get(m[2] or "", 1)) if m else None


def decimale(testo):
    return float(testo.strip().rstrip("%").replace(",", "."))


def secondi_da(testo):
    """`286h:16m` o `34s` in secondi."""
    h, m, s = re.search(r"(\d+)h", testo), re.search(r"(\d+)m", testo), re.search(r"([\d.]+)s", testo)
    return round((int(h[1]) * 3600 if h else 0) + (int(m[1]) * 60 if m else 0) + (float(s[1]) if s else 0), 2)


def quando(testo):
    """`4 ott 13:25` in `2026-10-04T13:25`."""
    m = re.match(r"(\d{1,2}) (\w{3}) (\d{2}:\d{2})", testo.strip())
    return f"{datetime.now().year}-{MESI[m[2]]:02d}-{int(m[1]):02d}T{m[3]}" if m else None


def durata(testo):
    m, s = testo.strip().split(":")
    return int(m) * 60 + int(s)


def voci_dall_archivio(archivio=None):
    """I video che l'ultima lettura conosce: id, indirizzo, giorno, didascalia, durata e slug."""
    archivio = archivio or archivio_di_lavoro()
    ultima = json.loads((Path(archivio) / "canali" / "tiktok" / "ultima.json").read_text(encoding="utf-8"))["lettura"]
    dati = json.loads((Path(archivio) / "canali" / "tiktok" / "letture" / ultima / "video.json").read_text(encoding="utf-8"))
    return [{"id": v["id"], "url": v["url"], "slug": v.get("slug"), "pubblicato": v["pubblicato"],
             "didascalia": v.get("didascalia"), "durata": v.get("durata")} for v in dati["video"]]


def leggi_elenco(pagina, account, grezzi=None):
    """Dall'elenco dei contenuti: le righe che TikTok carica, e quanti post dichiara il canale."""
    pagina.goto("https://www.tiktok.com/tiktokstudio/content", wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(6000)
    quanti = 0
    for _ in range(20):
        adesso = pagina.evaluate("() => document.querySelectorAll('a[href*=\"/video/\"]').length")
        if adesso == quanti:
            break
        quanti = adesso
        pagina.evaluate("() => { const r = document.querySelectorAll('a[href*=\"/video/\"]'); if (r.length) r[r.length - 1].scrollIntoView({block: 'end'}); }")
        pagina.wait_for_timeout(1500)
    anelli = pagina.evaluate("() => Array.from(document.querySelectorAll('a[href*=\"/video/\"]')).map(a => a.getAttribute('href'))")
    anelli = list(dict.fromkeys(a.split("/video/")[1] for a in anelli))
    testo = pagina.inner_text("body")
    if grezzi:
        (Path(grezzi) / "elenco.txt").write_text(testo, encoding="utf-8")
    righe = list(RIGA_ELENCO.finditer(testo))
    print(f"    elenco: {len(anelli)} video, {len(righe)} righe lette")
    voci = []
    for identificatore, riga in zip(anelli, righe):
        voci.append({"id": identificatore, "url": f"{indirizzo_profilo(account)}/video/{identificatore}", "slug": None,
                     "pubblicato": quando(riga["data"]), "didascalia": riga["didascalia"].strip(), "durata": durata(riga["durata"]),
                     "visualizzazioni": numero(riga["visite"]), "mi_piace": numero(riga["piacciono"]), "commenti": numero(riga["commenti"])})
    quanti_post = re.search(r"Post (\d+)", testo)
    return voci, (numero(quanti_post[1]) if quanti_post else None)


def leggi_analisi_video(pagina, identificatore, mancano, grezzi=None):
    """Dalla pagina di analisi di un video: quello che l'elenco non mostra."""
    pagina.goto(f"https://www.tiktok.com/tiktokstudio/analytics/{identificatore}", wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(6000)
    testo = pagina.inner_text("body")
    if grezzi:
        (Path(grezzi) / f"video-{identificatore}.txt").write_text(testo, encoding="utf-8")
    fuori = {}
    if m := re.search(r"Pubblicato il giorno \d{2}/\d{2}/\d{4}\n((?:[^\n]+\n){5})Visualizzazioni video", testo):
        valori = [numero(x) for x in m[1].strip().splitlines()]
        if len(valori) == 5 and all(v is not None for v in valori):
            fuori["visualizzazioni"], fuori["mi_piace"], fuori["commenti"], fuori["condivisioni"], fuori["salvati"] = valori
    if m := re.search(r"Tempo di riproduzione totale\n([^\n]+)", testo):
        fuori["tempo_riproduzione_s"] = secondi_da(m[1])
    if m := re.search(r"Tempo medio di visualizzazione\n([^\n]+)", testo):
        fuori["tempo_medio"] = secondi_da(m[1])
    if m := re.search(r"Guarda il video completo\n([\d.,]+)%", testo):
        fuori["visti_fino_in_fondo"] = decimale(m[1])
    if m := re.search(r"Nuovi follower\n([\d.,]+)", testo):
        fuori["nuovi_follower"] = numero(m[1])
    if m := re.search(r"Per te\n([\d.,]+)%", testo):
        fuori["da_per_te"] = decimale(m[1])
    if m := re.search(r"Termini di ricerca\n((?:[^\n]+\n[\d.,]+%\n)+)", testo):
        fuori["ricerche"] = [{"termine": t.strip(), "quota": decimale(q)} for t, q in re.findall(r"([^\n]+)\n([\d.,]+)%", m[1])]
    for campo in ("visualizzazioni", "mi_piace", "commenti", "condivisioni", "salvati", "tempo_medio", "visti_fino_in_fondo",
                  "nuovi_follower", "da_per_te", "tempo_riproduzione_s"):
        if campo not in fuori:
            mancano.append(f"video {identificatore}: non ho letto «{campo}»")
    return fuori


def leggi_canale(pagina, mancano, grezzi=None):
    """Dagli ultimi 7 giorni del canale: i totali, il traffico e le ricerche."""
    pagina.goto("https://www.tiktok.com/tiktokstudio/analytics", wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(6000)
    testo = pagina.inner_text("body")
    if grezzi:
        (Path(grezzi) / "canale.txt").write_text(testo, encoding="utf-8")
    fuori = {}
    for chiave, etichetta in (("visualizzazioni", "Visualizzazioni video"), ("visite_al_profilo", "Visualizzazioni del profilo"),
                              ("mi_piace", "Mi piace"), ("commenti", "Commenti"), ("condivisioni", "Condivisioni")):
        if m := re.search(etichetta + r"\n([\d.,]+[KMB]?)\n", testo):
            fuori[chiave] = numero(m[1])
    if m := re.search(r"Per te\n([\d.,]+)%", testo):
        fuori["da_per_te"] = decimale(m[1])
    if m := re.search(r"Termini di ricerca\n((?:[^\n]+\n[\d.,]+%\n?)+)", testo):
        fuori["ricerche"] = [t.strip() for t, _ in re.findall(r"([^\n]+)\n([\d.,]+)%", m[1])]
    for campo in ("visualizzazioni", "visite_al_profilo", "mi_piace", "commenti", "condivisioni"):
        if campo not in fuori:
            mancano.append(f"canale: non ho letto «{campo}»")
    return fuori


def leggi_profilo(pagina, account, mancano, grezzi=None):
    """Follower, seguiti e mi piace dal profilo pubblico."""
    pagina.goto(indirizzo_profilo(account), wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(6000)
    testo = pagina.inner_text("body")
    if grezzi:
        (Path(grezzi) / "profilo.txt").write_text(testo, encoding="utf-8")
    fuori = {"nome": f"@{account}"}
    for campo, etichetta in (("follower", "follower"), ("seguiti", "seguiti"), ("mi_piace", "mi piace")):
        if m := re.search(r"([\d.,]+[KMB]?)\s*" + etichetta, testo, re.IGNORECASE):
            fuori[campo] = numero(m[1])
        else:
            mancano.append(f"profilo: non ho letto «{campo}»")
    return fuori


ETICHETTE_SCHEDA_PREFERITI = r"^(Preferiti|Favorites)$"
VUOTI = {"img", "br", "hr", "input", "meta", "link", "source", "wbr"}
COLLEGAMENTO_VIDEO = re.compile(r"^(?:https://www\.tiktok\.com)?/@([^/?#]+)/video/(\d+)")
DATI_DELLA_PAGINA = re.compile(r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', re.S)
APRI_SCHEDA_PREFERITI = """() => {
  const scheda = document.querySelector('[data-e2e="favorites-tab"]')
    || Array.from(document.querySelectorAll('[role="tab"]')).find(e => /%s/i.test(e.textContent.trim()));
  if (!scheda) return false;
  scheda.click();
  return true;
}""" % ETICHETTE_SCHEDA_PREFERITI


class _ElencoPreferiti(HTMLParser):
    def __init__(self):
        super().__init__()
        self.profondita = 0
        self.link = []

    def handle_starttag(self, tag, attrs):
        if tag in VUOTI:
            return
        attributi = dict(attrs)
        if self.profondita:
            self.profondita += 1
            if tag == "a" and (m := COLLEGAMENTO_VIDEO.match(attributi.get("href") or "")):
                self.link.append((m[1], m[2]))
        elif attributi.get("data-e2e") == "favorites-item-list":
            self.profondita = 1

    def handle_endtag(self, tag):
        if self.profondita and tag not in VUOTI:
            self.profondita -= 1


def link_preferiti(html):
    """I video dell'elenco dei Preferiti di un profilo, dal più recente: autore, id e indirizzo senza parametri."""
    lettore = _ElencoPreferiti()
    lettore.feed(html)
    visti = {}
    for autore, identificatore in lettore.link:
        visti.setdefault(identificatore, {"id": identificatore, "autore": autore, "url": f"https://www.tiktok.com/@{autore}/video/{identificatore}"})
    return list(visti.values())


def _voce_della_pagina(html):
    """Il video come lo descrivono i dati che la sua pagina porta con sé; `None` se la pagina non lo ha."""
    trovato = DATI_DELLA_PAGINA.search(html)
    if not trovato:
        return None
    try:
        return json.loads(trovato[1])["__DEFAULT_SCOPE__"]["webapp.video-detail"]["itemInfo"]["itemStruct"]
    except (ValueError, KeyError, TypeError):
        return None


def _quando_da(secondi):
    return datetime.fromtimestamp(int(secondi)).strftime("%Y-%m-%dT%H:%M")


# TikTok scrive alcuni contatori come testo («584»): nell'archivio sono numeri.
STATISTICHE = {"visualizzazioni": "playCount", "mi_piace": "diggCount", "commenti": "commentCount", "condivisioni": "shareCount", "salvati": "collectCount"}


def numeri_del_video(html):
    """I numeri esatti di un video del canale dalla sua pagina pubblica (TikTok Studio li arrotonda: 30K). Un carosello di foto dura 0."""
    voce = _voce_della_pagina(html)
    if voce is None:
        return None
    statistiche = voce.get("stats") or {}
    campi = {
        "didascalia": voce.get("desc"),
        "durata": 0 if voce.get("imagePost") else (voce.get("video") or {}).get("duration"),
        "pubblicato": _quando_da(voce["createTime"]) if voce.get("createTime") else None,
        **{campo: int(statistiche[chiave]) for campo, chiave in STATISTICHE.items() if str(statistiche.get(chiave, "")).isdigit()},
    }
    return {k: v for k, v in campi.items() if v not in (None, "")}


LEGGI_PAGINA = "async (indirizzo) => { const r = await fetch(indirizzo, {credentials: 'include'}); return r.ok ? await r.text() : ''; }"


def leggi_numeri_esatti(pagina, voce, mancano):
    """La pagina pubblica del video, chiesta dalla scheda già su tiktok.com, col login del creator."""
    numeri = numeri_del_video(pagina.evaluate(LEGGI_PAGINA, voce["url"]))
    if numeri is None:
        mancano.append(f"video {voce['id']}: la pagina pubblica non ha dato i numeri esatti, restano quelli di TikTok Studio")
        return {}
    return numeri


# Commenti e risposte con le stesse richieste della pagina di TikTok, dalla scheda col login del creator: da fuori ne mancano alcuni.
LEGGI_COMMENTI = """async ({id, pausa}) => {
  const dorme = () => new Promise(r => setTimeout(r, pausa[0] + Math.random() * (pausa[1] - pausa[0])));
  const prendi = async (u) => {
    for (let k = 0; k < 3; k++) {
      try { const r = await fetch(u, {credentials: 'include'}); const t = await r.text(); if (t) return JSON.parse(t); } catch (e) {}
      await dorme();
    }
    return null;
  };
  const letti = [], radici = [];
  let cursore = 0, dichiarati = null, errore = null;
  for (let giro = 0; giro < 100; giro++) {
    const d = await prendi(`/api/comment/list/?aid=1988&aweme_id=${id}&count=50&cursor=${cursore}`);
    if (!d || d.status_code !== 0) { errore = 'elenco'; break; }
    if (dichiarati === null) dichiarati = d.total;
    for (const c of d.comments || []) { letti.push([c, null]); radici.push(c); }
    if (!d.has_more) break;
    cursore = d.cursor;
    await dorme();
  }
  for (const c of radici) {
    if (!(c.reply_comment_total > 0)) continue;
    let rc = 0;
    for (let giro = 0; giro < 50; giro++) {
      await dorme();
      const d = await prendi(`/api/comment/list/reply/?aid=1988&item_id=${id}&comment_id=${c.cid}&count=50&cursor=${rc}`);
      if (!d || d.status_code !== 0) { errore = 'risposte'; break; }
      for (const x of d.comments || []) letti.push([x, c.cid]);
      if (!d.has_more) break;
      rc = d.cursor;
    }
  }
  return { dichiarati, errore, commenti: letti.map(([c, a]) => ({ cid: c.cid, autore: c.user && c.user.unique_id, testo: c.text,
    create_time: c.create_time, digg_count: c.digg_count, risposta_a: a })) };
}"""
PAUSA_FRA_RICHIESTE = (700, 1800)
CHE_COSA_MANCA = {"elenco": "TikTok non ha dato l'elenco", "risposte": "TikTok non ha dato le risposte"}


def commenti_letti(identificatore, grezzi, account):
    """Dai commenti come li dà TikTok a quelli dell'archivio (`docs/ARCHIVIO.md`), senza doppioni; e cosa manca."""
    commenti, visti = [], set()
    for c in grezzi["commenti"]:
        if c["cid"] in visti:
            continue
        visti.add(c["cid"])
        commenti.append({"id": c["cid"], "autore": c["autore"], "testo": c["testo"], "quando_scritto": _quando_da(c["create_time"]),
                         "mi_piace": c["digg_count"], "risposta_a": c["risposta_a"], "del_creator": c["autore"] == account})
    if grezzi["errore"]:
        return commenti, [f"commenti del video {identificatore}: {CHE_COSA_MANCA[grezzi['errore']]}, la lettura è a metà"]
    if grezzi["dichiarati"] is not None and len(commenti) < grezzi["dichiarati"]:
        return commenti, [f"commenti del video {identificatore}: letti {len(commenti)} contro {grezzi['dichiarati']} dichiarati"]
    return commenti, []


def leggi_commenti(pagina, voce, account, mancano):
    grezzi = pagina.evaluate(LEGGI_COMMENTI, {"id": voce["id"], "pausa": PAUSA_FRA_RICHIESTE})
    commenti, mancanti = commenti_letti(voce["id"], grezzi, account)
    mancano.extend(mancanti)
    return commenti


def video_da_pagina(html):
    """Dai dati che la pagina di un video porta con sé: quello che c'è, mai quello che manca. `None` se la pagina non ha il video."""
    voce = _voce_della_pagina(html)
    if voce is None:
        return None
    video, statistiche = voce.get("video") or {}, voce.get("stats") or {}
    campi = {
        "autore": (voce.get("author") or {}).get("uniqueId"),
        "didascalia": voce.get("desc"),
        "durata": video.get("duration"),
        "pubblicato": _quando_da(voce["createTime"]) if voce.get("createTime") else None,
        "larghezza": video.get("width"),
        "altezza": video.get("height"),
        "visualizzazioni": statistiche.get("playCount"),
    }
    return {k: v for k, v in campi.items() if v not in (None, "")}


def leggi_preferiti(pagina, account, quanti, mancano, grezzi=None):
    """I primi `quanti` Preferiti del profilo, dal più recente: la scheda del profilo per l'elenco, la pagina di ogni video per il resto."""
    pagina.goto(indirizzo_profilo(account), wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(6000)
    if not pagina.evaluate(APRI_SCHEDA_PREFERITI):
        mancano.append("preferiti: non trovo la scheda Preferiti nel profilo (TikTok ha cambiato la pagina?)")
        return []
    pagina.wait_for_timeout(2500)
    link = link_preferiti(pagina.content())
    for _ in range(10):
        if len(link) >= quanti:
            break
        pagina.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        pagina.wait_for_timeout(1500)
        piu = link_preferiti(pagina.content())
        if len(piu) == len(link):
            break
        link = piu
    if grezzi:
        (Path(grezzi) / "preferiti.html").write_text(pagina.content(), encoding="utf-8")
    if not link:
        mancano.append("preferiti: l'elenco dei Preferiti è vuoto, privato o TikTok ha cambiato la pagina")
        return []
    letti = []
    for posizione, voce in enumerate(link[:quanti], start=1):
        pagina.goto(voce["url"], wait_until="domcontentloaded", timeout=60000)
        pagina.wait_for_timeout(3000)
        html = pagina.content()
        if grezzi:
            (Path(grezzi) / f"preferito-{voce['id']}.html").write_text(html, encoding="utf-8")
        dettagli = video_da_pagina(html)
        if dettagli is None:
            mancano.append(f"preferiti: non ho letto il video {voce['id']} (non disponibile o pagina cambiata)")
        letti.append({"posizione": posizione, "id": voce["id"], "autore": voce["autore"], "url": voce["url"], **(dettagli or {})})
    return letti


# I messaggi: l'elenco a sinistra dà nome, anteprima e giorno di ogni conversazione. Si apre solo quella cambiata dalla lettura di
# prima (aprirla la segna come letta su TikTok); le altre si riportano com'erano.
ELENCO_CONVERSAZIONI = """async (pausa) => {
  const dorme = () => new Promise(r => setTimeout(r, pausa[0] + Math.random() * (pausa[1] - pausa[0])));
  const voci = () => document.querySelectorAll('[data-e2e="dm-new-conversation-item"]');
  for (let giro = 0, prima = -1; giro < 30 && voci().length !== prima; giro++) {
    prima = voci().length;
    if (prima) voci()[prima - 1].scrollIntoView({block: 'end'});
    await dorme();
  }
  return Array.from(voci()).map(c => ({
    con: ((c.querySelector('[data-e2e="dm-new-conversation-nickname"]') || c).innerText || '').trim(),
    righe: c.innerText.split('\\n').map(r => r.trim()).filter(Boolean),
    non_letti: !!c.querySelector('[data-e2e="dm-new-conversation-unread"]'),
  }));
}"""

APRI_CONVERSAZIONE = """async ({posizione, account, pausa}) => {
  const dorme = () => new Promise(r => setTimeout(r, pausa[0] + Math.random() * (pausa[1] - pausa[0])));
  document.querySelectorAll('[data-e2e="dm-new-conversation-item"]')[posizione].click();
  await dorme(); await dorme();
  const fotografa = () => {
    const elenco = document.querySelector('[data-e2e="dm-new-message-list"]');
    if (!elenco) return [];
    const fuori = []; let separatore = null;
    for (const el of elenco.querySelectorAll('[data-e2e="dm-new-time-separator"],[data-e2e="dm-new-chat-item"]')) {
      if (el.getAttribute('data-e2e') === 'dm-new-time-separator') { separatore = el.innerText.trim(); continue; }
      const a = el.querySelector('a[href*="/@"]');
      const chi = a ? a.getAttribute('href').split('/@')[1].split(/[/?]/)[0] : null;
      const testo = el.querySelector('[data-e2e="dm-new-message-text"]');
      fuori.push({da: chi === account ? 'creator' : 'lui', testo: testo ? testo.innerText : '[' + (el.innerText.trim() || 'messaggio non testuale') + ']',
                  quando_scritto: separatore});
    }
    return fuori;
  };
  const scorre = () => {
    const box = document.querySelector('[data-e2e="dm-new-chatbox"]') || document.body;
    let meglio = null, quanto = 0;
    for (const e of box.querySelectorAll('*')) {
      const d = e.scrollHeight - e.clientHeight;
      if (d > quanto && /auto|scroll/.test(getComputedStyle(e).overflowY)) { quanto = d; meglio = e; }
    }
    return meglio;
  };
  const finestre = [fotografa()];
  for (let giro = 0, ferma = 0; giro < 80 && ferma < 4; giro++) {
    const s = scorre();
    if (s) { s.scrollTop = 0; s.dispatchEvent(new WheelEvent('wheel', {deltaY: -800, bubbles: true})); }
    await dorme();
    const adesso = fotografa();
    ferma = JSON.stringify(adesso) === JSON.stringify(finestre[finestre.length - 1]) ? ferma + 1 : 0;
    finestre.push(adesso);
  }
  return finestre;
}"""


def giorno_di(testo, oggi=None):
    """Il giorno che l'elenco dei messaggi scrive accanto a una conversazione, in ISO: `4/11/2026`, oppure un'ora (`21:05`) per oggi."""
    oggi = oggi or datetime.now()
    if m := re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", testo):
        return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}"
    if re.fullmatch(r"\d{1,2}:\d{2}", testo):
        return oggi.strftime("%Y-%m-%d")
    if testo.lower() in ("ieri", "yesterday"):
        return (oggi - timedelta(days=1)).strftime("%Y-%m-%d")
    return None


def voce_di_conversazione(grezza, oggi=None):
    """Una voce dell'elenco dei messaggi: il nome, l'anteprima dell'ultimo messaggio e il giorno (`None` se non si legge)."""
    righe = [r for r in grezza["righe"] if r != grezza["con"]]
    giorno = giorno_di(righe[-1], oggi) if righe else None
    return {"con": grezza["con"], "anteprima": " ".join(righe[:-1] if giorno else righe), "ultimo_giorno": giorno}


def unisci_finestre(finestre):
    """I messaggi di una conversazione in ordine, dalle viste prese salendo: la pagina tiene in memoria solo un tratto alla volta."""
    tutti = []
    for vista in finestre:
        if not vista:
            continue
        if not tutti:
            tutti = list(vista)
            continue
        n = len(vista)
        if any(tutti[i:i + n] == vista for i in range(len(tutti) - n + 1)):
            continue
        comune = next((k for k in range(min(n, len(tutti)), 0, -1) if vista[-k:] == tutti[:k]), 0)
        tutti = vista[:n - comune] + tutti
    return tutti


def cambiata(voce, prima):
    return prima is None or (voce["anteprima"], voce["ultimo_giorno"]) != (prima.get("anteprima"), prima.get("ultimo_giorno"))


def leggi_messaggi(pagina, account, precedenti, mancano):
    """Le conversazioni nell'ordine dell'elenco. `precedenti` sono quelle della lettura di prima, per nome."""
    pagina.goto("https://www.tiktok.com/messages", wait_until="domcontentloaded", timeout=60000)
    pagina.wait_for_timeout(8000)
    elenco = pagina.evaluate(ELENCO_CONVERSAZIONI, PAUSA_FRA_RICHIESTE)
    if not elenco:
        mancano.append("messaggi: l'elenco delle conversazioni è vuoto o TikTok ha cambiato la pagina")
        return []
    conversazioni, aperte = [], 0
    for posizione, grezza in enumerate(elenco):
        voce, prima = voce_di_conversazione(grezza), precedenti.get(grezza["con"])
        if not cambiata(voce, prima):
            conversazioni.append({**prima, **voce})
            continue
        messaggi = unisci_finestre(pagina.evaluate(APRI_CONVERSAZIONE, {"posizione": posizione, "account": account, "pausa": PAUSA_FRA_RICHIESTE}))
        if not messaggi:
            mancano.append(f"messaggi: la conversazione con «{voce['con']}» non si è aperta, c'è solo l'anteprima")
        conversazioni.append({**voce, "messaggi": messaggi, **({} if messaggi else {"non_aperta": True})})
        aperte += 1
        riposo(pagina)
    print(f"    messaggi: {len(conversazioni)} conversazioni, {aperte} cambiate e rilette")
    mancano.append("messaggi: la sezione delle richieste di messaggi non compare sul web")
    return conversazioni


def conversazioni_precedenti(archivio):
    """Le conversazioni dell'ultima lettura, per nome; vuoto se non ce n'è una con i messaggi."""
    canale = Path(archivio) / "canali" / "tiktok"
    try:
        ultima = json.loads((canale / "ultima.json").read_text(encoding="utf-8"))["lettura"]
        dati = json.loads((canale / "letture" / ultima / "messaggi.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, KeyError, ValueError):
        return {}
    return {c["con"]: c for c in dati.get("conversazioni", [])}


def scrivi_preferiti(archivio, quando, preferiti, mancano=None):
    """Lo stato dei Preferiti di adesso, riscritto intero: non è una serie nel tempo, quella sono le letture."""
    dati = {"quando": quando, "preferiti": preferiti, **({"mancano": mancano} if mancano else {})}
    scrivi_json(Path(archivio) / "canali" / "tiktok" / "preferiti.json", dati)


def scrivi_json(dove, dati):
    destinazione = Path(dove)
    destinazione.parent.mkdir(parents=True, exist_ok=True)
    destinazione.write_text(json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def apri_pagina(p, chrome):
    """Una scheda nuova nel Chrome del creator: le sue non si toccano. Chrome chiede al creator di consentire il collegamento."""
    print("Chrome chiede se consentire il collegamento: premi «Consenti» (hai 3 minuti)", flush=True)
    try:
        return p.chromium.connect_over_cdp(connetti(chrome), timeout=180000).contexts[0].new_page()
    except TempoScaduto as e:
        raise Errore("Chrome non ha consentito il collegamento entro 3 minuti: rilancia e premi «Consenti» nella finestra di Chrome",
                     "Chrome did not allow the connection within 3 minutes: run it again and press «Allow» in the Chrome window") from e


def leggi_preferiti_da_chrome(chrome, account, quanti, grezzi=None):
    mancano = []
    with sync_playwright() as p:
        pagina = apri_pagina(p, chrome)
        letti = leggi_preferiti(pagina, account, quanti, mancano, grezzi)
        pagina.close()
    return letti, mancano


def leggi(archivio, chrome, inizio, destinazione=None, da=None, grezzi=None, preferiti=0):
    """Fa il giro su TikTok e ritorna (profilo, video, messaggi, esito, preferiti). Con `destinazione` scrive i commenti di ogni video appena
    letti: se il giro si interrompe, quello che è stato letto resta."""
    account = account_tiktok(Path(archivio).parent)
    iso = inizio.strftime("%Y-%m-%dT%H:%M")
    da = da or (inizio - timedelta(days=30)).strftime("%Y-%m-%d")
    mancano = ["il dato di TikTok Studio è aggiornato al giorno prima: lo dichiara in cima («Aggiornate il giorno …»)",
               "nell'elenco dei contenuti TikTok carica solo le prime righe: i video sono enumerati dagli id dell'ultima lettura, non dall'elenco",
               "i totali degli ultimi 7 giorni sono arrotondati come li mostra TikTok Studio (30K, 1K, 30.3K); i numeri dei video sono quelli esatti della loro pagina",
               "tempo medio di visualizzazione letto al secondo intero"]
    with sync_playwright() as p:
        pagina = apri_pagina(p, chrome)
        print(">> profilo")
        profilo = leggi_profilo(pagina, account, mancano, grezzi)
        print(">> elenco contenuti")
        lette, quanti_post = leggi_elenco(pagina, account, grezzi)
        voci = voci_dall_archivio(archivio)
        noti = {v["id"] for v in voci}
        for riga in lette:
            if riga["id"] not in noti:
                voci.append(riga)
                noti.add(riga["id"])
                print(f"    video che l'archivio non aveva: {riga['id']} ({(riga['didascalia'] or '')[:60]}…)")
        profilo["video"] = max(quanti_post or 0, len(voci))
        print(">> ultimi 7 giorni del canale")
        profilo["ultimi_7_giorni"] = leggi_canale(pagina, mancano, grezzi)
        print(f">> analisi di ogni video dal {da}")
        for voce in voci:
            if voce["pubblicato"] and voce["pubblicato"][:10] >= da:
                riposo(pagina)
                voce.update(leggi_analisi_video(pagina, voce["id"], mancano, grezzi))
        print(">> numeri esatti e commenti di ogni video")
        for voce in voci:
            riposo(pagina)
            voce.update(leggi_numeri_esatti(pagina, voce, mancano))
            letti_commenti = leggi_commenti(pagina, voce, account, mancano) if voce.get("commenti") else []
            if destinazione and letti_commenti:
                scrivi_json(Path(destinazione) / "commenti" / f"{voce['id']}.json", {"quando": iso, "video": voce["id"], "commenti": letti_commenti})
            print(f"   {voce['id']} {voce.get('visualizzazioni')} visite  {voce.get('mi_piace')} ♥  {len(letti_commenti)} commenti letti")
        print(">> messaggi")
        riposo(pagina)
        conversazioni = leggi_messaggi(pagina, account, conversazioni_precedenti(archivio), mancano)
        mancano_preferiti = []
        letti = []
        if preferiti:
            print(">> preferiti")
            letti = leggi_preferiti(pagina, account, preferiti, mancano_preferiti, grezzi)
        pagina.close()
    return ({"quando": iso, **profilo}, {"quando": iso, "video": voci}, {"quando": iso, "conversazioni": conversazioni},
            {"quando": iso, "completa": not mancano, "mancano": mancano}, (letti, mancano_preferiti))


def main(argomenti=None):
    p = argparse.ArgumentParser(description="Legge una lettura nuova da TikTok Studio pilotando Chrome (sola lettura)")
    p.add_argument("--da", help="il primo giorno dei video da leggere (predefinito: 30 giorni fa)")
    p.add_argument("--profilo-chrome", help="il profilo di Chrome che ha la porta di debug (predefinito: quello del profilo del creator)")
    p.add_argument("--uscita", help="la cartella della lettura (predefinito: una nuova in archivio/canali/tiktok/letture/)")
    p.add_argument("--grezzi", help="dove salvare anche il testo delle pagine, per quando TikTok le cambia")
    p.add_argument("--prova", action="store_true", help="non scrive niente, stampa solo quello che ha letto")
    p.add_argument("--archivio", help="l'archivio (predefinito: quello della cartella di lavoro)")
    p.add_argument("--preferiti", type=int, default=10, help="quanti Preferiti leggere, dal più recente (predefinito: 10; 0 li salta)")
    p.add_argument("--solo-preferiti", action="store_true", help="legge solo i Preferiti, senza profilo, elenco e analisi")
    a = p.parse_args(argomenti)
    if a.grezzi:
        Path(a.grezzi).mkdir(parents=True, exist_ok=True)
    try:
        archivio = Path(a.archivio) if a.archivio else archivio_di_lavoro()
    except Errore as e:
        raise SystemExit(str(e))
    chrome = Path(a.profilo_chrome) if a.profilo_chrome else profilo_chrome()
    inizio = datetime.now()
    try:
        if a.solo_preferiti:
            letti, mancano_preferiti = leggi_preferiti_da_chrome(chrome, account_tiktok(archivio.parent), a.preferiti, a.grezzi)
            return concludi_preferiti(archivio, inizio.strftime("%Y-%m-%dT%H:%M"), letti, mancano_preferiti, a.prova)
        destinazione = Path(a.uscita) if a.uscita else archivio / "canali" / "tiktok" / "letture" / inizio.strftime("%Y-%m-%d-%H%M")
        profilo, video, messaggi, esito, (letti, mancano_preferiti) = leggi(archivio, chrome, inizio, None if a.prova else destinazione, a.da, a.grezzi, a.preferiti)
    except Errore as e:
        raise SystemExit(str(e))
    collegati = sum(1 for v in video["video"] if v.get("condivisioni") is not None)
    print(f"\nletto: {len(video['video'])} video, {collegati} con l'analisi, {len(esito['mancano'])} cose mancanti")
    if a.prova:
        print("(prova: non ho scritto niente)")
        return 0
    scrivi_json(destinazione / "profilo.json", profilo)
    scrivi_json(destinazione / "video.json", video)
    scrivi_json(destinazione / "messaggi.json", messaggi)
    scrivi_json(destinazione / "esito.json", esito)
    print(f"lettura scritta in {destinazione}")
    if not a.uscita:
        scrivi_json(archivio / "canali" / "tiktok" / "ultima.json", {"lettura": destinazione.name, "quando": profilo["quando"]})
        print(f"ultima.json aggiornato a {destinazione.name}")
    if a.preferiti:
        concludi_preferiti(archivio, profilo["quando"], letti, mancano_preferiti, prova=False)
    return 0


def concludi_preferiti(archivio, quando, letti, mancano, prova):
    """Scrive i Preferiti letti; se non ne ha letto nessuno lascia il file com'era, e lo dice."""
    for m in mancano:
        print(f"    {m}")
    print(f"preferiti: {len(letti)} letti")
    if not letti:
        return 1
    if prova:
        print("(prova: non ho scritto niente)")
        return 0
    scrivi_preferiti(archivio, quando, letti, mancano)
    print(f"preferiti scritti in {Path(archivio) / 'canali' / 'tiktok' / 'preferiti.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
