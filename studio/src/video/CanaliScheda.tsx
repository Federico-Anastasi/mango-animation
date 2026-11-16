import { CardDiRighe, Riga } from "../comuni/CardDiRighe"
import { Interruttore } from "../comuni/Interruttore"
import { t } from "../lingua"
import type { PropsScheda } from "./PaginaVideo"
import { CANALI, conLista, nonFallire } from "./liste"

export function CanaliScheda({ video, salvaScheda }: PropsScheda) {
  const { scheda } = video
  const scelti = scheda.canali ?? []
  const cambia = (id: (typeof CANALI)[number]["id"]) => {
    const nuovi = CANALI.map((c) => c.id).filter((c) => (c === id ? !scelti.includes(c) : scelti.includes(c)))
    nonFallire(salvaScheda(conLista(scheda, "canali", nuovi)))
  }
  return (
    <CardDiRighe nome={t("Dove deve uscire", "Where it should go out")}>
      {CANALI.map((c) => (
        <Riga key={c.id} nome={c.nome}>
          <Interruttore etichetta={c.nome} acceso={scelti.includes(c.id)} onCambia={() => cambia(c.id)} />
        </Riga>
      ))}
    </CardDiRighe>
  )
}
