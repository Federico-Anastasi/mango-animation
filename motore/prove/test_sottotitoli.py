import numpy as np
import pytest

from motore.errori import Errore
from motore.sottotitoli import battute, cartello, cartelli_del_titolo, chiave, parole_pulite, posto, scheda_cartello


def grezze(*coppie):
    return [{"p": p, "da": float(k), "a": k + 0.5} for k, p in enumerate(coppie, 1)]


def scritte(parole):
    return [p["p"] for p in parole]


def test_gli_apostrofi_e_i_trattini_si_riuniscono(archivio):
    p = parole_pulite(grezze("l", "'altro", "GPT", "-5"), "s", {}, archivio.stile)
    assert scritte(p) == ["l'altro", "gpt-5"] and p[0]["a"] == 2.5


def test_minuscola_tiene_i_nomi_e_come_trascritta_tiene_tutto(archivio):
    r = grezze("Ciao", "Alfa,", "Serve.")
    assert scritte(parole_pulite(r, "s", {"nomi": ["Alfa"]}, archivio.stile)) == ["ciao", "Alfa,", "serve."]
    assert scritte(parole_pulite(r, "s", {"scrittura": "come trascritta"}, archivio.stile)) == ["Ciao", "Alfa,", "Serve."]


def test_la_chiave_e_quella_della_trascrizione_non_la_corretta(archivio):
    p = parole_pulite(grezze("Martha,", "corre"), "s", {"correzioni": [{"sentite": ["martha"], "giuste": ["Marta"]}]}, archivio.stile)
    assert scritte(p) == ["Marta,", "corre"] and p[0]["chiave"] == "martha"


def test_una_correzione_si_applica_ovunque_e_tiene_la_punteggiatura_che_non_dice(archivio):
    r = grezze("ciao", "Betaco", "e", "betaco,", "no")
    p = parole_pulite(r, "s", {"correzioni": [{"sentite": ["betaco"], "giuste": ["Beta"]}]}, archivio.stile)
    assert scritte(p) == ["ciao", "Beta", "e", "Beta,", "no"]
    p = parole_pulite(r, "s", {"correzioni": [{"sentite": ["betaco"], "giuste": ["Beta."]}]}, archivio.stile)
    assert scritte(p)[3] == "Beta."


def test_una_stringa_sola_sostituisce_il_gruppo_e_ne_unisce_i_tempi(archivio):
    r = grezze("zrv", "2", ".5", "va")
    p = parole_pulite(r, "s", {"correzioni": [{"sentite": ["ZRV", "2", ".5"], "giuste": "Zorva 2.5"}]}, archivio.stile)
    assert scritte(p) == ["Zorva 2.5", "va"] and (p[0]["da"], p[0]["a"]) == (1.0, 3.5) and p[0]["chiave"] == "zrv25"


def test_una_correzione_per_sorgente_non_tocca_le_altre(archivio):
    c = {"correzioni": [{"sorgente": "x", "sentite": ["a"], "giuste": ["b"]}]}
    assert scritte(parole_pulite(grezze("a"), "x", c, archivio.stile)) == ["b"]
    assert scritte(parole_pulite(grezze("a"), "y", c, archivio.stile)) == ["a"]


def test_correzione_con_parole_di_meno_si_dice(archivio):
    with pytest.raises(Errore, match="2 parole giuste per 1 sentite"):
        parole_pulite(grezze("a"), "s", {"correzioni": [{"sentite": ["a"], "giuste": ["b", "c"]}]}, archivio.stile)


def test_il_ritocco_rimette_le_parole_saltate_distribuendole_nel_tempo(archivio):
    r = grezze("quindi", "più", "vanno", "avanti", "fine")
    r = [dict(p, da=60 * 6 + 53 + k, a=60 * 6 + 53.5 + k) for k, p in enumerate(r)]
    ritocco = {"sorgente": "s", "minuto": "06:53", "sentito": "quindi più vanno", "detto": "quindi più andando avanti più vanno"}
    p = parole_pulite(r, "s", {"ritocchi": [ritocco]}, archivio.stile)
    assert scritte(p) == ["quindi", "più", "andando", "avanti", "più", "vanno", "avanti", "fine"]
    assert p[0]["da"] == r[0]["da"] and p[5]["a"] == pytest.approx(r[2]["a"]) and all(a["a"] <= b["da"] + 1e-9 for a, b in zip(p, p[1:]))


def test_un_ritocco_che_la_trascrizione_non_ha_si_dice_con_il_minuto(archivio):
    ritocco = {"sorgente": "s", "minuto": "00:10", "sentito": "non c'è", "detto": "x"}
    with pytest.raises(Errore, match="dal minuto 00:10 la trascrizione non dice: non c'è"):
        parole_pulite(grezze("a", "b"), "s", {"ritocchi": [ritocco]}, archivio.stile)


def dette(*parole, passo=0.3, da=0.0):
    return [{"p": p, "esce": round(da + k * passo, 3), "finisce": round(da + k * passo + 0.2, 3)} for k, p in enumerate(parole)]


def test_le_battute_si_staccano_alla_punteggiatura_e_a_venti_caratteri(archivio):
    b = battute(dette("ho", "fatto", "girare", "un", "modello", "distribuito", "qui,", "ecco"), 0.0, 5.0, archivio.stile, "come trascritta")
    assert [x[2] for x in b] == ["ho fatto girare un", "modello distribuito", "qui", "ecco"]


def test_le_battute_si_staccano_se_c_e_una_pausa(archivio):
    parole = dette("uno", "due") + dette("tre", da=3.0)
    assert [x[2] for x in battute(parole, 0.0, 5.0, archivio.stile, "come trascritta")] == ["uno due", "tre"]


def test_le_battute_hanno_gli_istanti_di_ogni_parola_e_i_bordi_giusti(archivio):
    s = archivio.stile["sottotitoli"]
    [(da, a, t, istanti)] = battute(dette("uno", "due", "tre", da=1.0), 0.0, 4.0, archivio.stile, "come trascritta")
    assert istanti == [1.0, 1.3, 1.6]
    assert da == pytest.approx(1.0 - s["anticipo"]) and a == pytest.approx(min(1.6 + 0.2 + s["resta"], 4.0))


def test_la_prima_battuta_non_comincia_prima_del_suo_pezzo(archivio):
    [(da, _, _, istanti)] = battute(dette("uno", da=0.01), 0.0, 3.0, archivio.stile, "come trascritta")
    assert da == 0.0 and istanti == [0.01]


def test_minuscola_toglie_la_punteggiatura_in_coda_ma_non_il_punto_interrogativo(archivio):
    [(_, _, t, _), *_] = battute(dette("ciao,", "come", "va?"), 0.0, 4.0, archivio.stile, "minuscola")
    assert t == "ciao"
    b = battute(dette("come", "va?"), 0.0, 4.0, archivio.stile, "minuscola")
    assert b[0][2] == "come va?"


def scheda(archivio, quale="sottotitoli", **diverso):
    base = scheda_cartello(archivio.stile, quale, archivio.colore, {"x": 540, "y": 1000, "ancora": "centro", "largo": 440})
    return {**base, **diverso}


def test_il_cartello_sta_nella_sua_colonna_bianco_col_contorno_nero_senza_fondo(archivio):
    img, (largo, alto) = cartello("ottenendo in questo modo una velocità", scheda(archivio), archivio.font("titoli"))
    assert largo <= 440 and abs(img.width - largo) <= 2
    pixel = np.asarray(img)
    pieni = pixel[pixel[..., 3] == 255][:, :3]
    assert pixel[0, 0, 3] == 0
    assert (pieni == archivio.colore("bianco")).all(axis=1).any() and (pieni == archivio.colore("nero")).all(axis=1).any()


def test_il_cartello_cresce_parola_per_parola_senza_muoversi(archivio):
    s, f = scheda(archivio), archivio.font("titoli")
    larghezze = [cartello("uno due tre", s, f, n)[0].width for n in (1, 2, 3)]
    assert larghezze[0] < larghezze[1] < larghezze[2]
    assert cartello("uno due tre", s, f)[0].width == larghezze[2]
    assert cartello("uno due tre", s, f, 1)[1] == cartello("uno due tre", s, f)[1]


def test_il_cartello_riduce_il_corpo_se_una_parola_non_sta(archivio):
    img, _ = cartello("anticostituzionalissimamente lunga", scheda(archivio, largo=300), archivio.font("titoli"))
    assert img.height < 3 * round(archivio.stile["sottotitoli"]["corpo"] * archivio.stile["sottotitoli"]["interlinea"])


def test_una_parola_con_asterisco_e_nel_colore_delle_correzioni(archivio):
    img, _ = cartello("*rossa", scheda(archivio), archivio.font("titoli"))
    rosso = archivio.colore("rosso")
    assert (np.asarray(img)[..., :3] == rosso).all(axis=2).any()
    senza, _ = cartello("rossa", scheda(archivio), archivio.font("titoli"))
    assert not (np.asarray(senza)[..., :3] == rosso).all(axis=2).any()


def test_il_titolo_ha_il_fondo_e_la_scritta_dello_stile_e_nessun_bordo(archivio):
    img, _ = cartello("Un titolo", scheda(archivio, "titolo", largo=960), archivio.font(archivio.stile["titolo"]["carattere"]))
    pixel = np.asarray(img.convert("RGBA"))
    titolo = archivio.stile["titolo"]
    assert tuple(pixel[0, img.width // 2]) == (*archivio.colore(titolo["fondo"]), 255) and (pixel[..., :3] == archivio.colore(titolo["colore"])).all(axis=2).any()


def test_il_titolo_ha_gli_angoli_tondi_e_il_carattere_dello_stile(archivio):
    """Gli angoli sono trasparenti (il raggio è `titolo.raggio`), il resto del bordo pieno; il carattere è Metropolis Medium (Unlicense, `font/`)."""
    titolo = archivio.stile["titolo"]
    img, _ = cartello("Un titolo", scheda(archivio, "titolo", largo=960), archivio.font(titolo["carattere"]))
    pixel = np.asarray(img.convert("RGBA"))
    assert img.mode == "RGBA" and pixel[0, 0, 3] == 0 and pixel[-1, -1, 3] == 0 and pixel[0, img.width // 2, 3] == 255
    r = titolo["raggio"]
    assert pixel[r, r, 3] == 255 and pixel[0, r, 3] == 255, "dentro il raggio il fondo è pieno"
    assert archivio.font(titolo["carattere"]).name == "Metropolis-Medium.ttf" and archivio.font(titolo["carattere"]).is_file()
    assert (archivio.repo / "font" / "Metropolis-UNLICENSE.txt").is_file()


def test_posto_ancora_il_riquadro():
    assert posto({"x": 520, "y": 1235, "ancora": "sinistra"}, (300, 100)) == (520, 1185)
    assert posto({"x": 540, "y": 1000, "ancora": "centro"}, (300, 100)) == (390, 950)
    assert posto({"x": 540, "y": 1000, "ancora": "destra"}, (300, 100)) == (240, 950)


def test_la_chiave_toglie_punteggiatura_e_maiuscole():
    assert chiave("Dell'AI,") == "dellai"


def test_il_cartello_senza_fondo_e_trasparente_con_le_lettere_contornate(archivio):
    spec = {"x": 540, "y": 1000, "ancora": "centro", "largo": 900, "fondo": None, "colore": "bianco", "contorno": 6, "colore_contorno": "nero", "bordo": 0}
    img, _ = cartello("senza riquadro", scheda_cartello(archivio.stile, "sottotitoli", archivio.colore, spec), archivio.font("titoli"))
    punti = np.asarray(img)
    assert img.mode == "RGBA" and punti[0, 0, 3] == 0 and punti[-1, -1, 3] == 0
    pieni = punti[punti[..., 3] == 255][:, :3].astype(int)
    assert (pieni.sum(axis=1) > 740).sum() > 500 and (pieni.sum(axis=1) < 25).sum() > 500


def test_le_righe_del_titolo_sono_centrate(archivio):
    img, _ = cartello("Quale AI gira sulla tua scheda?", scheda(archivio, "titolo", largo=700), archivio.font(archivio.stile["titolo"]["carattere"]))
    punti = np.asarray(img.convert("RGB")).astype(int)
    verde = np.abs(punti - np.array(archivio.colore(archivio.stile["titolo"]["colore"]))).sum(axis=2) < 120
    sotto = np.flatnonzero(verde[img.height // 2 + 8:].any(axis=0))
    sopra = np.flatnonzero(verde[:img.height // 2 - 8].any(axis=0))
    assert sopra[-1] - sopra[0] > sotto[-1] - sotto[0] + 100
    assert (sotto[0] + sotto[-1]) / 2 == pytest.approx(img.width / 2, abs=6)


def test_il_titolo_e_la_parte_si_scrivono_in_maiuscolo_se_lo_stile_lo_chiede(archivio):
    spec = archivio.stile["quadri"]["girato-pieno"]["titolo"]
    carattere = archivio.font(archivio.stile["titolo"]["carattere"])

    def come(maiuscolo, testo, parte):
        stile = {**archivio.stile, "titolo": {**archivio.stile["titolo"], "maiuscolo": maiuscolo}}
        return [np.asarray(img) for img, _, _ in cartelli_del_titolo(stile, archivio.colore, carattere, spec, {"testo": testo, "parte": parte})]

    scritto, grande = come(True, "Un titolo", "Parte 2"), come(True, "UN TITOLO", "PARTE 2")
    assert all(a.shape == b.shape and (a == b).all() for a, b in zip(scritto, grande))
    com_e, maiuscolo = come(False, "Un titolo", "Parte 2"), come(False, "UN TITOLO", "PARTE 2")
    assert not all(a.shape == b.shape and (a == b).all() for a, b in zip(com_e, maiuscolo))


def test_un_titolo_che_va_a_capo_cresce_verso_il_basso(archivio):
    spec = archivio.stile["quadri"]["girato-pieno"]["titolo"]
    carattere = archivio.font(archivio.stile["titolo"]["carattere"])
    alto = lambda testo: cartelli_del_titolo(archivio.stile, archivio.colore, carattere, spec, {"testo": testo, "parte": "Parte 3"})
    (corto, _, y_corto), _ = alto("Un titolo")
    (lungo, _, y_lungo), (_, _, y_parte) = alto("Ti dico come installare un AI in locale")
    assert lungo.height > corto.height and y_lungo == y_corto
    assert y_parte == y_lungo + lungo.height + archivio.stile["titolo"]["parte"]["stacco"]


def test_una_parola_corretta_in_due_ha_un_istante_per_ogni_parola_scritta(archivio):
    parole = dette("entra", "appelo", "qui", da=1.0)
    parole[1]["p"] = "a pelo"
    [(_, _, t, istanti)] = battute(parole, 0.0, 4.0, archivio.stile, "come trascritta")
    assert t == "entra a pelo qui" and istanti == pytest.approx([1.0, 1.3, 1.4, 1.6])


def test_le_parole_senza_lettere_non_entrano_nei_cartelli(archivio):
    for scrittura in ("minuscola", "come trascritta"):
        [(_, _, t, istanti)] = battute(dette("uno", "...", "due", "…", "?"), 0.0, 4.0, archivio.stile, scrittura)
        assert t == "uno due" and len(istanti) == 2
    assert battute(dette("...", "…"), 0.0, 4.0, archivio.stile, "minuscola") == []
    [(_, _, t, _)] = battute(dette("i", "2", "e", "5.", "..."), 0.0, 4.0, archivio.stile, "come trascritta")
    assert t == "i 2 e 5."


def test_una_battuta_che_comincia_sul_cambio_di_scena_prende_il_posto_della_scena_nuova():
    # L'inizio della battuta è arrotondato al millesimo (41,833), quello della scena al decimillesimo (41,8333): la battuta è della
    # seconda scena, e prende il posto dei suoi sottotitoli, non quello della prima.
    from motore.monta import _scena_a
    risolto = {"formato": {"fps": 30}, "scene": [{"inizio": 0, "durata": 41.8333}, {"inizio": 41.8333, "durata": 8}]}
    assert _scena_a(risolto, 41.833) == 1
    assert _scena_a(risolto, 41.80) == 0
    assert _scena_a(risolto, 60) == 1
