import json
import shutil
import subprocess

import pytest

from motore.quadri import inquadra

STUDIO = "studio/src/montaggio/composizione.ts"
BUN = shutil.which("bun")
pytestmark = pytest.mark.skipif(BUN is None, reason="serve bun per far girare la geometria dello studio")

VISTA = [720, 280, 960, 720]
ZOOM = (2.0, (0.3, 0.4))
SCRIPT = """
Object.assign(globalThis, { navigator: { language: "it" }, document: { documentElement: {} } })
const { arrotonda, finestraGirato } = await import(process.argv[2])
const casi = JSON.parse(await Bun.stdin.text())
console.log(JSON.stringify(casi.map((c: any) => {
  const f = finestraGirato({ sorgente: { larghezza: c.largo, altezza: c.alto }, vista: c.vista, area: { x: c.area[0], y: c.area[1], w: c.area[2], h: c.area[3] }, zoom: c.zoom && { scala: c.zoom[0], centro: c.zoom[1] }, avanzamento: 0, contieni: c.contieni })
  return [f.x, f.y, f.w, f.h].map(arrotonda)
})))
"""


def test_il_motore_e_lo_studio_inquadrano_il_girato_di_ogni_quadro_negli_stessi_rettangoli(archivio, tmp_path):
    casi, attesi = [], []
    for quadro in archivio.stile["quadri"].values():
        for strato in (s for s in quadro["strati"] if s["tipo"] == "girato"):
            for largo, alto, vista, zoom in [(l, a, v, z) for l, a in ((1920, 1080), (2160, 3840)) for v in (None, VISTA) for z in (None, ZOOM) if v is None or l == 1920]:
                adatta = strato.get("adatta", "contieni" if vista else "riempi")
                rettangolo, _, _ = inquadra(largo, alto, vista, strato["area"][2:], adatta, 1.0 if zoom is None else zoom[0], None if zoom is None else zoom[1])
                casi.append({"largo": largo, "alto": alto, "vista": vista, "area": strato["area"], "zoom": zoom, "contieni": adatta == "contieni"})
                attesi.append(list(rettangolo))
    assert len(casi) > 20
    (tmp_path / "studio.ts").write_text(SCRIPT, encoding="utf-8")
    esito = subprocess.run([BUN, "run", str(tmp_path / "studio.ts"), (archivio.repo / STUDIO).as_posix()], input=json.dumps(casi), capture_output=True, text=True, encoding="utf-8")
    assert esito.returncode == 0, esito.stderr
    assert json.loads(esito.stdout) == attesi
