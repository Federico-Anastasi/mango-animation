import { t } from "../lingua"
import type { Strato } from "../tipi"

export function nomeStrato(tipo: Strato["tipo"]): string {
  switch (tipo) {
    case "animazione":
      return t("animazione", "animation")
    case "girato":
      return t("girato", "footage")
    case "sagoma":
      return t("persona", "person")
    case "riquadro":
      return t("riquadro", "box")
    case "inserto":
      return t("inserto", "inset")
    case "viso":
      return t("viso", "face")
  }
}
