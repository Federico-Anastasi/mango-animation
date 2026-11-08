// La pagina che l'iPhone apre dal codice QR e che guida la creazione della Scorciatoia «Manda a
// base». Una Scorciatoia non firmata non si importa (da iOS 15) e la firma esiste solo su macOS:
// invece del file, la strada breve è questa, con indirizzo e chiave da copiare con un tocco.
import { esc, STILE_BASE } from "./pagine"

export interface DatiPagina {
  indirizzoRicezione: string
  limiteGb: number
}

export function paginaInstallazione(d: DatiPagina): string {
  const url = esc(d.indirizzoRicezione)
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Manda a Mango Animation</title>
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
<h1>Manda a Mango Animation</h1>
<p>Crea sull'iPhone una Scorciatoia che manda un video, un audio o una foto a Mango Animation, originale e senza ricompressione. Sono sei passi, una volta sola.</p>
<p class="piccolo">L'iPhone deve stare sullo stesso Wi-Fi del computer. Accetta file fino a ${d.limiteGb} GB.</p>
<ol>
<li>Apri <b>Comandi Rapidi</b>, tocca <b>+</b> in alto a destra e chiama la scorciatoia <b>Manda a Mango Animation</b>.</li>
<li>Tocca la <b>i</b> in basso, attiva <b>Mostra nel foglio di condivisione</b> e lascia spuntato solo <b>Contenuti multimediali</b>.</li>
<li>Aggiungi l'azione <b>Ottieni contenuti dell'URL</b> e, nel campo URL, incolla questo indirizzo:
<div class="campo"><input id="url" readonly value="${url}"><button data-copia="url">Copia</button></div></li>
<li>Tocca <b>Mostra altro</b>. Metodo: <b>POST</b>. Corpo della richiesta: <b>Modulo</b>. Aggiungi un nuovo campo di tipo <b>File</b>, con nome:
<div class="campo"><input id="campo" readonly value="file"><button data-copia="campo">Copia</button></div>
e come valore scegli <b>Input della scorciatoia</b>.</li>
<li>Aggiungi l'azione <b>Mostra notifica</b> e come testo scegli il risultato dell'azione prima: dirà se il file è arrivato.</li>
<li>Provala: in <b>Foto</b> apri un video, tocca <b>Condividi</b> e poi <b>Manda a Mango Animation</b>. La prima volta l'iPhone chiede di accedere alla rete locale: tocca <b>Consenti</b>.</li>
</ol>
<p class="piccolo">Se il router dà al computer un altro indirizzo, la scorciatoia smette di trovarlo: riapri il codice QR in Mango Animation e rifai solo il passo 3.</p>
<script>
document.querySelectorAll("[data-copia]").forEach(function(b){b.addEventListener("click",function(){
var i=document.getElementById(b.getAttribute("data-copia"));i.focus();i.select();i.setSelectionRange(0,i.value.length);
var ok=false;try{ok=document.execCommand("copy")}catch(e){}
b.textContent=ok?"Copiato":"Tienilo premuto e copia";b.className="fatto";})});
</script>
</body></html>`
}
