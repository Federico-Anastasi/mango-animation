# I quadri

I quadri si scelgono nel piano (`docs/PIANO.md`, chiave `quadro`) e stanno in `stile.json`.

Un quadro è il modo in cui il fotogramma è composto: uno sfondo e degli strati, dal basso verso l'alto,
più il posto dei sottotitoli e del titolo. Stanno in `stile.json`, `quadri`. Non sono un elenco chiuso:
un quadro nuovo è una voce nuova fatta con gli stessi strati. Un quadro può dichiarare `"formato": "orizzontale"` (senza, è `verticale`): tutte le scene di un video vogliono quadri dello stesso formato. La sagoma è solo verticale. `corpo` e `corpo_minimo` di `sottotitoli` nel quadro cambiano il corpo dei cartelli; `fondo` (`null`: niente riquadro), `colore`, `bordo`, `contorno` e `colore_contorno` (il filo attorno alle lettere) ne cambiano l'aspetto. I quadri su fondo chiaro hanno il `contorno` a 3 invece di 6: più spesso, il nero riempirebbe le lettere bianche. La `y` di `titolo` è il centro della prima riga: un titolo che va a capo cresce verso il basso, con la parte sotto.

| strato | cosa mette |
|---|---|
| `animazione` | la scena animata, nell'`area`; con `ritaglio` (`[x, y, largo, alto]`) se ne mostra solo quel rettangolo, sopra gli strati sotto: una scheda che non copre lo schermo. Una scena `trasparente` (in `animazioni/`) copre solo ciò che disegna: una scritta sopra il girato |
| `girato` | il fotogramma della sorgente nell'`area`: la `vista` del pezzo se c'è, altrimenti riempie l'area tenendo il centro (`centro`) |
| `sagoma` | la persona scontornata; `testa` è la riga della cima della testa, `x` lo spostamento (o `"testa"`: la testa al centro del fotogramma, misurata una volta per ripresa, con la sagoma ingrandita quanto basta per coprire ancora tutta la larghezza), `scala_minima`, `aria`, `sfuma` |
| `riquadro` | un rettangolo con nome della sorgente (`nome`), ingrandito di `scala`, centrato in orizzontale col bordo alto a `y`, con gli angoli di `raggio` |
| `viso` | il viso in un angolo (`angolo`: `basso-destra`, `basso-sinistra`, `alto-destra`, `alto-sinistra`), largo `largo`, a `margine` dal bordo, con gli angoli di `raggio`; viene dal riquadro `nome` della sorgente (la webcam dentro il fotogramma) oppure, se la sorgente dichiara `viso`, da un'altra sorgente |
| `inserto` | l'`inserto` della vista, largo `largo`, a `bordo` dall'angolo in alto a sinistra dello strato `girato` (senza inserto nella vista, niente) |

Lo strato `girato` tiene l'intera vista dentro l'area (`adatta`: `"contieni"`, con una vista è il modo
normale) o riempie l'area togliendo il di più attorno al `centro` (`"riempi"`, senza vista è il modo normale).
`scala_margine` della `sagoma` è ciò che si aggiunge alla scala calcolata. Un quadro che mostra
un'animazione vuole `animazione` nella scena; uno strato `inserto` vuole sotto di sé un `girato`.

**I lati che il telefono taglia.** Sui telefoni più allungati del 9:16 TikTok ingrandisce il video e ne taglia un
po' a destra e a sinistra. Nei quadri verticali ciò che si legge (animazione, schermo, titolo, sottotitoli) sta a
`telefono.margine_lati` dai lati: l'`area` di un'animazione a tutto fotogramma è più stretta e la scena vi entra
rimpicciolita, col fondo del quadro attorno. Uno strato che può finire tagliato (un viso, una persona sul palco, uno
schermo registrato già alto e stretto) dichiara `"al_vivo": true`. Una prova (`test_standard.py`) lo verifica su
ogni quadro verticale.

I quadri di serie:

| quadro | com'è | usato in |
|---|---|---|
| `sagoma-su-animazione` | animazione a tutto fotogramma, sagoma in basso a sinistra, sottotitoli accanto al viso | un video che spiega con un disegno a tutto fotogramma |
| `sagoma-al-centro` | dall'alto: l'animazione nella fascia, i sottotitoli centrati, la sagoma a tutta larghezza dalla testa in giù | un video che spiega con un disegno nella fascia |
| `girato-e-sagoma` | dall'alto: il girato nella fascia, i sottotitoli centrati, la sagoma a tutta larghezza; la sagoma può venire da un'altra ripresa (`sagoma` del pezzo) | l'ospite che parla sopra, il creator che reagisce sotto |
| `sagoma-sul-girato` | il girato a tutto fotogramma e, sopra, la sagoma a tutta larghezza; i sottotitoli fra le due; il girato può essere il fotogramma fermo di un'altra ripresa (`girato` del pezzo) | il creator che commenta davanti al talk di un altro |
| `sagoma-sul-girato-con-scena` | come `sagoma-sul-girato`, e sopra a tutto una scena animata trasparente (loghi, cartelli sopra la testa) | un video con loghi e cartelli sopra la testa |
| `schermo-e-viso` | carta, lo schermo in alto, il viso della webcam sotto, sottotitoli in mezzo | i video estratti da una diretta |
| `schermo-e-viso-scuro` | lo stesso, su fondo inchiostro | la variante scura per un video estratto da una diretta |
| `girato-pieno` | il girato a tutto fotogramma, sottotitoli in basso | parlato senza animazioni |
| `girato-con-scritte` | il girato a tutto fotogramma e, sopra, una scena animata trasparente a tutto fotogramma; sottotitoli in basso | parlato con scritte sopra |
| `girato-con-animazione` | il girato com'è (senza sagoma né scontorno) da 680 px in giù, col mento sopra la zona dei nomi di TikTok; sopra, a tutta larghezza, una scena animata trasparente che riempie la parte alta (ciò che si legge sta nella fascia, sotto l'intestazione di TikTok e lontano dai lati); i sottotitoli fra la scena e la testa | un video di notizia con una scena animata sopra il girato |
| `schermo-con-scheda` | lo schermo a tutto fotogramma e, sopra, una scheda animata che ne copre solo una fascia | una spiegazione che cammina sopra lo schermo registrato |
| `solo-animazione` | l'animazione su tutto il fotogramma meno i lati che il telefono taglia, la voce sotto, niente viso | — |
| `lungo-girato` | 16:9: il girato a tutto fotogramma (una diretta con la webcam già dentro), sottotitoli in basso | video lunghi |
| `lungo-schermo` | 16:9: lo schermo a tutto fotogramma e il viso in un riquadro nell'angolo in basso a destra | video lunghi |
| `lungo-animazione` | 16:9: l'animazione a tutto fotogramma, la voce sotto | video lunghi |
| `schermo-pieno` | uno schermo o un documento a tutto fotogramma, niente viso | — |
| `schermo-pieno-scuro` | lo stesso, su fondo nero | le foto di uno schermo acceso al buio |
