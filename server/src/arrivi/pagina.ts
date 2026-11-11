// La pagina che l'iPhone apre dal codice QR e che guida la creazione della Scorciatoia. Una Scorciatoia non firmata non si importa (da iOS 15) e la firma esiste solo su macOS:
// invece del file, la strada breve è questa, con indirizzo e chiave da copiare con un tocco.
import { frase, type Lingua } from "../lingua"
import { esc, inScript, STILE_BASE } from "./pagine"

export interface DatiPagina {
  indirizzoRicezione: string
  limiteGb: number
}

const TESTI = {
  titolo: frase("Manda a Mango Animation", "Send to Mango Animation"),
  presentazione: frase(
    "Crea sull'iPhone una Scorciatoia che manda un video, un audio o una foto a Mango Animation, originale e senza ricompressione. Sono sei passi, una volta sola.",
    "Create a Shortcut on your iPhone that sends a video, an audio file or a photo to Mango Animation, original and without recompression. It takes six steps, once.",
  ),
  copia: frase("Copia", "Copy"),
  passo1: frase(
    "Apri <b>Comandi Rapidi</b>, tocca <b>+</b> in alto a destra e chiama la scorciatoia <b>Manda a Mango Animation</b>.",
    "Open <b>Shortcuts</b>, tap <b>+</b> at the top right and name the shortcut <b>Send to Mango Animation</b>.",
  ),
  passo2: frase(
    "Tocca la <b>i</b> in basso, attiva <b>Mostra nel foglio di condivisione</b> e lascia spuntato solo <b>Contenuti multimediali</b>.",
    "Tap the <b>i</b> at the bottom, turn on <b>Show in Share Sheet</b> and leave only <b>Media</b> ticked.",
  ),
  passo3: frase(
    "Aggiungi l'azione <b>Ottieni contenuti dell'URL</b> e, nel campo URL, incolla questo indirizzo:",
    "Add the action <b>Get Contents of URL</b> and, in the URL field, paste this address:",
  ),
  passo4: frase(
    "Tocca <b>Mostra altro</b>. Metodo: <b>POST</b>. Corpo della richiesta: <b>Modulo</b>. Aggiungi un nuovo campo di tipo <b>File</b>, con nome:",
    "Tap <b>Show More</b>. Method: <b>POST</b>. Request Body: <b>Form</b>. Add a new field of type <b>File</b>, with the name:",
  ),
  passo4b: frase("e come valore scegli <b>Input della scorciatoia</b>.", "and as the value choose <b>Shortcut Input</b>."),
  passo5: frase(
    "Aggiungi l'azione <b>Mostra notifica</b> e come testo scegli il risultato dell'azione prima: dirà se il file è arrivato.",
    "Add the action <b>Show Notification</b> and, as the text, choose the result of the previous action: it will say whether the file arrived.",
  ),
  passo6: frase(
    "Provala: in <b>Foto</b> apri un video, tocca <b>Condividi</b> e poi <b>Manda a Mango Animation</b>. La prima volta l'iPhone chiede di accedere alla rete locale: tocca <b>Consenti</b>.",
    "Try it: in <b>Photos</b> open a video, tap <b>Share</b>, then <b>Send to Mango Animation</b>. The first time, the iPhone asks to access the local network: tap <b>Allow</b>.",
  ),
  indirizzoCambiato: frase(
    "Se il router dà al computer un altro indirizzo, la scorciatoia smette di trovarlo: riapri il codice QR in Mango Animation e rifai solo il passo 3.",
    "If the router gives the computer another address, the shortcut can no longer find it: open the QR code in Mango Animation again and redo step 3 only.",
  ),
}

const stessaRete = (gb: number) => frase(`L'iPhone deve stare sullo stesso Wi-Fi del computer. Accetta file fino a ${gb} GB.`, `The iPhone must be on the same Wi-Fi as the computer. It accepts files up to ${gb} GB.`)

/** Le frasi che lo script scrive sul bottone dopo la copia. */
const NELLO_SCRIPT = {
  copiato: frase("Copiato", "Copied"),
  tienilo: frase("Tienilo premuto e copia", "Press and hold, then copy"),
}

export function paginaInstallazione(d: DatiPagina, lingua: Lingua): string {
  const url = esc(d.indirizzoRicezione)
  const t = (nome: keyof typeof TESTI) => TESTI[nome].in(lingua)
  const nelloScript = inScript(Object.fromEntries(Object.entries(NELLO_SCRIPT).map(([nome, f]) => [nome, f.in(lingua)])))
  return `<!doctype html>
<html lang="${lingua}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${t("titolo")}</title>
<style>
${STILE_BASE}
h1{font-size:26px;margin:0 0 4px}p{margin:8px 0}.piccolo{color:var(--grigio);font-size:15px}
ol{padding:0;margin:20px 0;list-style:none;counter-reset:passo}
li{counter-increment:passo;border-top:1px solid var(--filo);padding:14px 0 14px 40px;position:relative}
li::before{content:counter(passo);position:absolute;left:0;top:14px;width:28px;height:28px;border-radius:50%;background:var(--inchiostro);color:var(--carta);font-weight:600;text-align:center;line-height:28px;font-size:15px}
.campo{display:flex;gap:8px;margin-top:8px}
.campo input{flex:1;min-width:0;font:15px ui-monospace,monospace;padding:10px;border:1px solid var(--filo);background:var(--scura);color:var(--inchiostro);border-radius:6px}
button{font:inherit;font-weight:600;padding:10px 14px;border:0;border-radius:6px;background:var(--rosso);color:#fff;cursor:pointer}
button.fatto{background:var(--grigio)}
b{font-weight:600}
</style></head><body>
<h1>${t("titolo")}</h1>
<p>${t("presentazione")}</p>
<p class="piccolo">${stessaRete(d.limiteGb).in(lingua)}</p>
<ol>
<li>${t("passo1")}</li>
<li>${t("passo2")}</li>
<li>${t("passo3")}
<div class="campo"><input id="url" readonly value="${url}"><button data-copia="url">${t("copia")}</button></div></li>
<li>${t("passo4")}
<div class="campo"><input id="campo" readonly value="file"><button data-copia="campo">${t("copia")}</button></div>
${t("passo4b")}</li>
<li>${t("passo5")}</li>
<li>${t("passo6")}</li>
</ol>
<p class="piccolo">${t("indirizzoCambiato")}</p>
<script>
var T = ${nelloScript};
document.querySelectorAll("[data-copia]").forEach(function(b){b.addEventListener("click",function(){
var i=document.getElementById(b.getAttribute("data-copia"));i.focus();i.select();i.setSelectionRange(0,i.value.length);
var ok=false;try{ok=document.execCommand("copy")}catch(e){}
b.textContent=ok?T.copiato:T.tienilo;b.className="fatto";})});
</script>
</body></html>`
}
