"""Dove sta la persona in un fotogramma. Il riquadro (la prima indicazione a SAM2 nello scontorno) lo trova RT-DETR (Apache-2.0, 20 M di parametri,
da Hugging Face); la testa (le viste che seguono la persona) la trova YuNet (MIT, 0,2 MB, da Hugging Face, su OpenCV)."""

import numpy as np

from .errori import Errore

RILEVATORE = "PekingU/rtdetr_r18vd"
VISO = ("opencv/face_detection_yunet", "face_detection_yunet_2023mar.onnx")


class Rilevatore:
    """RT-DETR su un fotogramma RGB (alto × largo × 3): il riquadro della persona più grande."""

    def __init__(self, dove, soglia):
        import torch
        from transformers import RTDetrForObjectDetection, RTDetrImageProcessor

        self.torch, self.dove, self.soglia = torch, torch.device(dove), soglia
        self.processore = RTDetrImageProcessor.from_pretrained(RILEVATORE)
        self.rete = RTDetrForObjectDetection.from_pretrained(RILEVATORE).to(self.dove).eval()
        self.persona = next(n for n, nome in self.rete.config.id2label.items() if nome == "person")

    def riquadro(self, rgb):
        """[x0, y0, x1, y1] della persona più grande, in pixel del fotogramma."""
        with self.torch.no_grad():
            ingresso = self.processore(images=np.ascontiguousarray(rgb), return_tensors="pt").to(self.dove)
            trovati = self.processore.post_process_object_detection(self.rete(**ingresso), target_sizes=[rgb.shape[:2]], threshold=self.soglia)[0]
        persone = [b.tolist() for etichetta, b in zip(trovati["labels"], trovati["boxes"]) if etichetta.item() == self.persona]
        if not persone:
            raise Errore("nel primo fotogramma del tratto non trovo nessuno: guarda il girato di quel tratto",
                         "I find no one in the first frame of the stretch: look at the footage of that stretch")
        return max(persone, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))


class Visi:
    """YuNet su un fotogramma RGB: dov'è il viso più grande, in frazioni della larghezza; None se non se ne vede nessuno."""

    def __init__(self, soglia):
        import cv2
        from huggingface_hub import hf_hub_download

        self.cv2 = cv2
        self.rete = cv2.FaceDetectorYN.create(hf_hub_download(*VISO), "", (320, 320), score_threshold=soglia)

    def x(self, rgb):
        alto, largo = rgb.shape[:2]
        self.rete.setInputSize((largo, alto))
        _, visi = self.rete.detect(self.cv2.cvtColor(np.ascontiguousarray(rgb), self.cv2.COLOR_RGB2BGR))
        if visi is None:
            return None
        x, _, w, _ = max(visi[:, :4], key=lambda v: v[2] * v[3])
        return round(float((x + w / 2) / largo), 4)
