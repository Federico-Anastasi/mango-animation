import { useRef, useState } from "react"
import { useChiudiFuori } from "../comuni/useChiudiFuori"
import { t } from "../lingua"
import { FormSegnalazione } from "../segnalazione/FormSegnalazione"
import base from "./PannelloLavori.module.css"

export function PannelloSegnalazione({ onChiudi }: { onChiudi: () => void }) {
  const [nascosto, setNascosto] = useState(false)
  const riquadro = useRef<HTMLDivElement>(null)
  useChiudiFuori(riquadro, onChiudi)
  return (
    <div ref={riquadro} className={base.pannello} style={nascosto ? { visibility: "hidden" } : undefined} role="dialog" aria-label={t("Segnala un problema", "Report a problem")}>
      <h2>{t("Segnala un problema", "Report a problem")}</h2>
      <FormSegnalazione onNascosto={setNascosto} />
    </div>
  )
}
