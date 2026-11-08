// La pagina per mandare i video dall'iPhone senza passare dalla Scorciatoia: si sceglie dalla libreria e ogni file parte
// com'è, uno dopo l'altro, verso la stessa rotta della Scorciatoia. Il file non si legge in memoria: lo passa il browser.
import { ESTENSIONI } from "./nomi"
import { STILE_BASE } from "./pagine"

// L'iPhone non riconosce i memo vocali (.m4a) come audio/*: le estensioni vanno dette una per una.
const SCEGLIBILI = ["video/*", "image/*", "audio/*", ...ESTENSIONI.audio.map((e) => `.${e}`)].join(",")

export function paginaCarica(chiave: string): string {
  const indirizzo = JSON.stringify(`/arrivi/contenuti-video?chiave=${encodeURIComponent(chiave)}`)
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Carica su base</title>
<style>
${STILE_BASE}
h1{font-size:26px;margin:0 0 12px}p{margin:8px 0}.piccolo{color:var(--grigio);font-size:15px}
.scegli{position:relative;display:block;width:100%;padding:18px 14px;border-radius:10px;background:var(--rosso);color:#fff;font-weight:600;font-size:20px;text-align:center;cursor:pointer;margin:16px 0}
.scegli input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
ul{list-style:none;margin:20px 0 0;padding:0}
li{border-top:1px solid var(--filo);padding:14px 0}
li b{display:block;font-weight:600;overflow-wrap:anywhere}
.barra{height:10px;border-radius:5px;background:var(--scura);overflow:hidden;margin:8px 0 6px}
.barra i{display:block;height:100%;width:0;background:var(--inchiostro)}
.dati{color:var(--grigio);font-size:15px}
.ok .barra i{background:#2E8B57}.no .dati{color:var(--rosso);font-weight:600}
</style></head><body>
<h1>Carica su base</h1>
<label class="scegli">Carica video<input id="scelta" type="file" accept="${SCEGLIBILI}" multiple></label>
<p class="piccolo">Quando l'iPhone mostra la scelta del video, tocca «Opzioni» in alto e scegli «Attuale»: così il video parte com'è, senza essere convertito.</p>
<p class="piccolo">Tieni lo schermo acceso e questa pagina aperta finché non è finito. I file partono uno dopo l'altro.</p>
<ul id="elenco"></ul>
<script>
var INDIRIZZO = ${indirizzo};
var MB = 1024 * 1024;
var coda = [];
var inCorso = false;
var numero = function (n) { return n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 }); };

function riga(file) {
  var li = document.createElement("li");
  var nome = document.createElement("b");
  nome.textContent = file.name;
  var barra = document.createElement("div");
  barra.className = "barra";
  barra.setAttribute("role", "progressbar");
  barra.setAttribute("aria-valuemin", "0");
  barra.setAttribute("aria-valuemax", "100");
  var riempimento = document.createElement("i");
  barra.appendChild(riempimento);
  var dati = document.createElement("div");
  dati.className = "dati";
  dati.textContent = "In attesa";
  li.append(nome, barra, dati);
  document.getElementById("elenco").appendChild(li);
  return { li: li, barra: barra, riempimento: riempimento, dati: dati };
}

function manda(file, r) {
  return new Promise(function (fine) {
    var xhr = new XMLHttpRequest();
    var inizio = Date.now();
    var ultimo = { t: inizio, byte: 0, velocita: 0 };
    xhr.open("POST", INDIRIZZO);
    xhr.setRequestHeader("X-Nome-File", encodeURIComponent(file.name));
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable) return;
      var ora = Date.now();
      if (ora - ultimo.t >= 700) {
        ultimo = { t: ora, byte: e.loaded, velocita: (e.loaded - ultimo.byte) / MB / ((ora - ultimo.t) / 1000) };
      }
      var percento = Math.floor((e.loaded / e.total) * 100);
      r.riempimento.style.width = percento + "%";
      r.barra.setAttribute("aria-valuenow", String(percento));
      r.dati.textContent = e.loaded >= e.total
        ? "Inviato: il computer lo sta salvando…"
        : percento + "% · " + numero(e.loaded / MB) + " di " + numero(e.total / MB) + " MB · " + numero(ultimo.velocita) + " MB/s";
    };
    xhr.onload = function () {
      var corpo = {};
      try { corpo = JSON.parse(xhr.responseText); } catch (e) {}
      var bene = xhr.status >= 200 && xhr.status < 300 && corpo.ok;
      r.li.className = bene ? "ok" : "no";
      if (bene) r.riempimento.style.width = "100%";
      var secondi = Math.max((Date.now() - inizio) / 1000, 0.1);
      r.dati.textContent = bene
        ? corpo.messaggio + " " + numero(file.size / MB / secondi) + " MB/s in media."
        : corpo.errore || "Il computer ha risposto in un modo che non capisco (" + xhr.status + "). Riprova.";
      fine();
    };
    xhr.onerror = xhr.ontimeout = xhr.onabort = function () {
      r.li.className = "no";
      r.dati.textContent = "Non è arrivato: controlla di essere sul Wi-Fi di casa e che il computer sia acceso. Riprova.";
      fine();
    };
    xhr.send(file);
  });
}

async function svuota() {
  if (inCorso) return;
  inCorso = true;
  while (coda.length) {
    var voce = coda.shift();
    voce.riga.dati.textContent = "Parte…";
    await manda(voce.file, voce.riga);
  }
  inCorso = false;
}

document.getElementById("scelta").addEventListener("change", function (e) {
  Array.prototype.forEach.call(e.target.files, function (file) { coda.push({ file: file, riga: riga(file) }); });
  e.target.value = "";
  svuota();
});
</script>
</body></html>`
}
