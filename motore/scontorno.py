"""Lo scontorno della persona. SAM2 la segue (un fotogramma ogni `passo_maschera`; in mezzo la sua maschera si sposta col flusso ottico),
ViTMatte rifà l'alfa nella fascia incerta attorno al bordo, e l'alfa si leviga coi fotogrammi vicini portati sul corrente dal flusso.
La prima maschera di ogni intervallo viene dal riquadro della persona trovato da RT-DETR (`persona.py`). Licenze: SAM2 Apache-2.0,
ViTMatte Apache-2.0, RT-DETR Apache-2.0. Sulla scheda NVIDIA SAM2 e ViTMatte girano in mezza precisione, con ViTMatte in grafi CUDA; sul
processore in precisione piena, a diretto."""

import threading

import numpy as np

from .persona import Rilevatore

SAM = "facebook/sam2.1-hiera-base-plus"
MATTING = "hustvl/vitmatte-small-composition-1k"
# Le misure con cui SAM2 e ViTMatte sono stati addestrati.
LATO_SAM, MEDIA_SAM, DEVIAZIONE_SAM = 1024, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
MULTIPLO_MATTING, ALTEZZE_GRAFO = 32, 128


def velocizza_vitmatte():
    """L'attenzione di ViTDet (dentro ViTMatte) con SDPA e gli indici della posizione relativa già sulla scheda: così il modello si cattura
    in un grafo CUDA, e il costo non è più il lancio dei kernel."""
    import torch
    import torch.nn.functional as F
    import transformers.models.vitdet.modeling_vitdet as vd

    def posizione(q_size, k_size, rel_pos):
        m = int(2 * max(q_size, k_size) - 1)
        if rel_pos.shape[0] != m:
            rel_pos = F.interpolate(rel_pos.reshape(1, rel_pos.shape[0], -1).permute(0, 2, 1), size=m, mode="linear").reshape(-1, m).permute(1, 0)
        q = torch.arange(q_size, device=rel_pos.device)[:, None] * max(k_size / q_size, 1.0)
        k = torch.arange(k_size, device=rel_pos.device)[None, :] * max(q_size / k_size, 1.0)
        return rel_pos[((q - k) + (k_size - 1) * max(q_size / k_size, 1.0)).long()]

    def attenzione(self, hidden_state, output_attentions=False):
        b, h, w, _ = hidden_state.shape
        n = h * w
        q, k, v = self.qkv(hidden_state).reshape(b, n, 3, self.num_heads, -1).permute(2, 0, 3, 1, 4).unbind(0)
        bias = None
        if self.use_relative_position_embeddings:
            rq = q.reshape(b * self.num_heads, h, w, q.shape[-1])
            rh = torch.einsum("bhwc,hkc->bhwk", rq, posizione(h, h, self.rel_pos_h))
            rw = torch.einsum("bhwc,wkc->bhwk", rq, posizione(w, w, self.rel_pos_w))
            bias = (rh[..., :, None] + rw[..., None, :]).reshape(b, self.num_heads, n, n)
        o = F.scaled_dot_product_attention(q, k, v, attn_mask=bias)
        return (self.proj(o.permute(0, 2, 1, 3).reshape(b, h, w, -1)),)

    vd.get_rel_pos = posizione
    vd.VitDetAttention.forward = attenzione


def trimap(maschera, raggio):
    """1 dentro, 0 fuori, 0,5 nella fascia di `raggio` pixel attorno al bordo della maschera (tensore 1×1×h×w, positivo dentro)."""
    import torch.nn.functional as F

    m = (maschera > 0).float()
    dentro, fuori = 1 - F.max_pool2d(1 - m, 2 * raggio + 1, 1, raggio), F.max_pool2d(m, 2 * raggio + 1, 1, raggio)
    return dentro + 0.5 * (fuori - dentro)


class _Condiviso:
    """Ciò che i fili si passano (fotogrammi, flussi, maschere) sotto una sola condizione. Un errore in un filo sveglia tutti e ricompare
    in chi aspetta: nessun filo resta appeso e nessun errore si perde."""

    def __init__(self, in_memoria, chi):
        self.cond, self.errore, self.in_memoria = threading.Condition(), None, in_memoria
        self.fotogrammi, self.fine, self.flussi, self.maschere = {}, None, {}, {}
        self.posizioni = dict.fromkeys(chi, -1)

    def avanza(self, chi, i):
        """`chi` ha finito coi fotogrammi fino a `i`: quelli che nessuno usa più si tolgono, e chi legge può andare avanti."""
        def fatto():
            self.posizioni[chi] = i
            primo = min(self.posizioni.values())
            for k in [k for k in self.fotogrammi if k <= primo]:
                del self.fotogrammi[k]

        self.metti(fatto)

    def spazio(self, n):
        """Se il fotogramma `n` può entrare in memoria: chi è più indietro non deve restare troppo lontano."""
        return n - min(self.posizioni.values()) <= self.in_memoria

    def aspetta(self, pronto):
        with self.cond:
            self.cond.wait_for(lambda: self.errore is not None or pronto())
            if self.errore is not None:
                raise self.errore

    def metti(self, cosa):
        with self.cond:
            cosa()
            self.cond.notify_all()

    def filo(self, lavoro):
        def corri():
            try:
                lavoro()
            except BaseException as e:  # noqa: BLE001  l'errore passa a chi aspetta, che lo rilancia
                errore = e
                self.metti(lambda: setattr(self, "errore", errore))

        t = threading.Thread(target=corri, daemon=True)
        t.start()
        return t

    def fotogramma(self, i):
        """Il fotogramma `i`, o None dopo l'ultimo."""
        self.aspetta(lambda: i in self.fotogrammi or (self.fine is not None and i >= self.fine))
        return self.fotogrammi.get(i)


class Scontornatore:
    def __init__(self, stile):
        import torch

        from .dispositivo import dispositivo

        dove = dispositivo("sagoma")
        import torch.nn as nn
        from transformers import Sam2VideoModel, Sam2VideoProcessor, VitMatteForImageMatting

        velocizza_vitmatte()
        torch.set_grad_enabled(False)
        self.cuda, self.torch, self.s, self.stile = dove == "cuda", torch, stile["sagoma"]["scontorno"], stile
        self.dev, self.tipo = torch.device(dove), torch.float16 if self.cuda else torch.float32
        self.L, self.A = stile["formato"]["largo"], stile["formato"]["alto"]
        self.w, self.h = round(self.L * self.s["scala_matting"]), round(self.A * self.s["scala_matting"])
        self.wp, self.hp = self.w + (-self.w) % MULTIPLO_MATTING, self.h + (-self.h) % MULTIPLO_MATTING
        self.rilevatore = Rilevatore(dove, self.s["soglia_persona"])
        self.processore = Sam2VideoProcessor.from_pretrained(SAM)
        self.sam = Sam2VideoModel.from_pretrained(SAM).to(self.dev, dtype=self.tipo).eval()
        memoria = self.s["memoria_sam"]
        self.sam.memory_temporal_positional_encoding = nn.Parameter(self.sam.memory_temporal_positional_encoding.data[-memoria:].clone())
        self.sam.num_maskmem = memoria
        self.matting = VitMatteForImageMatting.from_pretrained(MATTING).to(self.dev).eval().to(self.tipo)
        self.media = torch.tensor(MEDIA_SAM, device=self.dev).view(1, 3, 1, 1)
        self.deviazione = torch.tensor(DEVIAZIONE_SAM, device=self.dev).view(1, 3, 1, 1)
        self.ys, self.xs = torch.meshgrid(torch.arange(self.h, device=self.dev, dtype=torch.float32), torch.arange(self.w, device=self.dev, dtype=torch.float32), indexing="ij")
        self.grafi, self.vasca = {}, torch.cuda.graph_pool_handle() if self.cuda else None
        # I grafi si catturano tutti adesso: catturarli mentre SAM2 lavora sull'altra corsia della scheda non è sicuro.
        for alto in sorted({*range(ALTEZZE_GRAFO, self.hp + 1, ALTEZZE_GRAFO), self.hp}) if self.cuda else []:
            self._grafo(alto)

    # ------------------------------------------------------------------ i pezzi
    def _sposta(self, x, flusso):
        """`x` (1×1×h×w) campionato in ogni punto più il flusso: porta un'immagine del fotogramma vicino su questo."""
        torch, F = self.torch, self.torch.nn.functional
        f = torch.from_numpy(flusso).to(self.dev, non_blocking=True)
        gx = (self.xs + f[..., 0]) * 2 / (self.w - 1) - 1
        gy = (self.ys + f[..., 1]) * 2 / (self.h - 1) - 1
        return F.grid_sample(x, torch.stack([gx, gy], -1)[None], mode="bilinear", padding_mode="border", align_corners=True)

    def _maschera_sam(self, sessione, rgb):
        torch, F = self.torch, self.torch.nn.functional
        x = torch.from_numpy(np.ascontiguousarray(rgb)).to(self.dev).permute(2, 0, 1)[None].float() / 255
        x = ((F.interpolate(x, size=(LATO_SAM, LATO_SAM), mode="bilinear", antialias=True) - self.media) / self.deviazione).to(self.tipo)
        return F.interpolate(self.sam(inference_session=sessione, frame=x[0]).pred_masks.float(), size=(self.h, self.w), mode="bilinear")

    def _sessione(self, primo):
        """La memoria di SAM2 per un intervallo, con la persona del primo fotogramma come prima indicazione."""
        sessione = self.processore.init_video_session(inference_device=self.dev, dtype=self.tipo)
        self.processore.add_inputs_to_inference_session(inference_session=sessione, frame_idx=0, obj_ids=1, input_boxes=[[self.rilevatore.riquadro(primo)]],
                                                        original_size=(self.A, self.L))
        return sessione

    def _trimap(self, maschera):
        return trimap(maschera, self.s["raggio_trimap"])

    def _grafo(self, alto):
        """ViTMatte catturato in un grafo CUDA, uno per altezza (multipli di `ALTEZZE_GRAFO`)."""
        torch = self.torch
        if alto not in self.grafi:
            x = torch.zeros(1, 4, alto, self.wp, device=self.dev, dtype=torch.half)
            flusso = torch.cuda.Stream()
            flusso.wait_stream(torch.cuda.current_stream())
            with torch.cuda.stream(flusso):
                for _ in range(3):
                    self.matting(pixel_values=x)
            torch.cuda.current_stream().wait_stream(flusso)
            grafo = torch.cuda.CUDAGraph()
            with torch.cuda.graph(grafo, pool=self.vasca, capture_error_mode="thread_local"):
                uscita = self.matting(pixel_values=x).alphas
            self.grafi[alto] = (grafo, x, uscita)
        return self.grafi[alto]

    def _alfa(self, img, trimap):
        """L'alfa a scala ridotta: ViTMatte solo sulle righe vicine alla fascia incerta, impilate; fuori dalla fascia vale il trimap."""
        torch, F = self.torch, self.torch.nn.functional
        x = F.interpolate(img[None].float() / 255, size=(self.h, self.w), mode="bilinear", antialias=True)
        ingresso = torch.cat([(x - 0.5) / 0.5, trimap], 1)
        fuori = torch.where(trimap == 1, torch.ones_like(trimap), torch.zeros_like(trimap))
        r = self.s["righe_contesto"]
        righe = F.max_pool1d((trimap[0, 0] == 0.5).any(1).float()[None, None], 2 * r + 1, 1, r)[0, 0] > 0
        indici = righe.nonzero()[:, 0]
        n = len(indici)
        if not n:
            return fuori
        if self.cuda:
            alto = min(self.hp, -(-n // ALTEZZE_GRAFO) * ALTEZZE_GRAFO)
            grafo, entrata, uscita = self._grafo(alto)
            entrata.copy_(F.pad(ingresso[:, :, indici], (0, self.wp - self.w, 0, alto - n)).half())
            grafo.replay()
            alfa = uscita.clone()[:, :, :n, :self.w].float()
        else:
            alto = -(-n // MULTIPLO_MATTING) * MULTIPLO_MATTING
            alfa = self.matting(pixel_values=F.pad(ingresso[:, :, indici], (0, self.wp - self.w, 0, alto - n))).alphas[:, :, :n, :self.w]
        fuori[:, :, indici] = torch.where(trimap[:, :, indici] == 0.5, alfa, fuori[:, :, indici])
        return fuori

    # ------------------------------------------------------------------ un intervallo
    def intervallo(self, fotogrammi):
        """I fotogrammi RGB (alto × largo × 3) di un tratto continuo della ripresa → gli stessi, RGBA, uno per uno. La memoria riparte a ogni
        intervallo; l'uscita è indietro di un fotogramma rispetto all'ingresso, perché la levigatura guarda anche il fotogramma dopo."""
        import cv2

        torch, F, s = self.torch, self.torch.nn.functional, self.s
        torch.set_grad_enabled(False)
        # Sul processore SAM2 non ha una corsia sua: un filo a parte litigherebbe con il resto per gli stessi processori, e la maschera si fa nel giro principale.
        c = _Condiviso(s["fotogrammi_in_memoria"], ("bordo", "flusso", "sam") if self.cuda else ("bordo", "flusso"))
        passo, w, h = s["passo_maschera"], self.w, self.h

        def leggi():
            n = 0
            for f in fotogrammi:
                c.aspetta(lambda: c.spazio(n))
                c.metti(lambda: c.fotogrammi.__setitem__(n, f))
                n += 1
            c.metti(lambda: setattr(c, "fine", n))

        def flussi():
            dis, prima, t = cv2.DISOpticalFlow_create(getattr(cv2, f"DISOPTICAL_FLOW_PRESET_{s['flusso']}")), None, 0
            while (f := c.fotogramma(t)) is not None:
                g = cv2.resize(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY), (w, h), interpolation=cv2.INTER_AREA)
                if prima is not None:
                    indietro, avanti = dis.calc(g, prima, None), dis.calc(prima, g, None)
                    c.metti(lambda: c.flussi.__setitem__(t, (indietro, avanti)))
                c.avanza("flusso", t)
                prima, t = g, t + 1
            c.avanza("flusso", float("inf"))

        def maschere():
            torch.set_grad_enabled(False)
            primo = c.fotogramma(0)
            if primo is None:
                return
            sessione, corsia = self._sessione(primo), torch.cuda.Stream()
            with torch.cuda.stream(corsia):
                t = 0
                while (f := c.fotogramma(t)) is not None:
                    m, fatto = self._maschera_sam(sessione, f), torch.cuda.Event()
                    fatto.record(corsia)
                    c.metti(lambda: c.maschere.__setitem__(t, (m, fatto)))
                    c.avanza("sam", t + passo - 1)
                    t += passo
            c.avanza("sam", float("inf"))

        def flusso(t):
            c.aspetta(lambda: t in c.flussi)
            return c.flussi[t]

        alfe, immagini, peso = {}, {}, s["peso_vicini"]

        def finito(t):
            """L'alfa di `t` levigata coi vicini (servono t-1 e t+1), a piena misura, col colore del girato."""
            somma, pesi = (1 - 2 * peso) * alfe[t], 1 - 2 * peso
            if t > 0:
                somma, pesi = somma + peso * self._sposta(alfe[t - 1], flusso(t)[0]), pesi + peso
            if t + 1 in alfe:
                somma, pesi = somma + peso * self._sposta(alfe[t + 1], flusso(t + 1)[1]), pesi + peso
            alfa = F.interpolate(somma / pesi, size=(self.A, self.L), mode="bicubic", align_corners=False).clamp(0, 1)
            img = immagini.pop(t)
            alfe.pop(t - 1, None)
            c.metti(lambda: c.flussi.pop(t, None))
            return torch.cat([img, (alfa[0] * 255).round().byte()], 0).permute(1, 2, 0).cpu().numpy()

        fili = [c.filo(leggi), c.filo(flussi), *([c.filo(maschere)] if self.cuda else [])]
        t, maschera, sessione = 0, None, None
        while (f := c.fotogramma(t)) is not None:
            img = torch.from_numpy(np.ascontiguousarray(f)).to(self.dev).permute(2, 0, 1).contiguous()
            immagini[t] = img
            if t % passo == 0 and self.cuda:
                c.aspetta(lambda: t in c.maschere)
                maschera, fatto = c.maschere.pop(t)
                torch.cuda.current_stream().wait_event(fatto)
            elif t % passo == 0:
                sessione = sessione or self._sessione(f)
                maschera = self._maschera_sam(sessione, f)
            else:
                maschera = self._sposta(maschera, flusso(t)[0])
            alfe[t] = self._alfa(img, self._trimap(maschera))
            c.avanza("bordo", t)
            if t > 0:
                yield finito(t - 1)
            t += 1
        if t:
            yield finito(t - 1)
        for filo in fili:
            filo.join()
        if c.errore is not None:
            raise c.errore
