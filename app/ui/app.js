"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const $ = (id) => document.getElementById(id);

// La lingua la dice l'app con ogni stato (`lingua`); ogni frase si scrive nelle due lingue dove compare: t("italiano", "inglese").
let lingua = "it";
const t = (it, en) => (lingua === "en" ? en : it);

// Le frasi fisse della pagina (index.html non ha testo): si riscrivono a ogni stato, nella lingua che l'app dice.
function testiFissi() {
  document.documentElement.lang = lingua;
  $("funzioni-titolo").textContent = t("Funzioni", "Features");
  $("comuni-titolo").textContent = t("Componenti comuni", "Shared components");
  $("dettagli-titolo").textContent = t("Cosa scarico e da dove", "What I download and from where");
  $("voci").setAttribute("aria-label", t("Cosa si scarica", "What will be downloaded"));
  $("nota").textContent = t(
    "Niente di tutto questo è dentro l'app: si scarica dalla fonte di ciascuno, con la sua licenza accanto. Ogni file è verificato prima di usarlo.",
    "None of this is inside the app: each item is downloaded from its own source, with its licence next to it. Every file is checked before it is used.",
  );
  $("guida-link").textContent = t("La guida di Anthropic per installare Claude Code", "Anthropic's guide to installing Claude Code");
  $("abbonamento-testo").textContent = t(
    "Claude Code richiede un account Claude con un abbonamento: Pro, Max, Ultra, Team o Enterprise. Il piano gratuito non lo include.",
    "Claude Code needs a Claude account with a subscription: Pro, Max, Ultra, Team or Enterprise. The free plan does not include it.",
  );
  $("mango-code").textContent = t("Ho trovato anche Mango Code: potrai usarlo come motore nella chat.", "I also found Mango Code: you will be able to use it as an engine in the chat.");
  $("piani-link").textContent = t("Guarda i piani", "See the plans");
  $("alternativa-testo").textContent = t("Se preferisci, incolla questo comando in PowerShell:", "If you prefer, paste this command into PowerShell:");
  $("riprova").textContent = t("Riprova", "Try again");
  $("ricrea").textContent = t("Ricrea in Documenti", "Recreate in Documents");
  $("scegli").textContent = t("Scegli un'altra cartella", "Choose another folder");
  $("scegli-altra").textContent = t("Scegli un'altra cartella", "Choose another folder");
  $("usa-cartella").textContent = t("Usa questa cartella", "Use this folder");
  $("sposta-riprova").textContent = t("Riprova", "Try again");
  $("cartella-altre-titolo").textContent = t("Altre cartelle", "Other folders");
  $("accedi").textContent = t("Accedi a Claude Code", "Sign in to Claude Code");
  $("ricontrolla").textContent = t("Ricontrolla", "Check again");
  $("avanti").textContent = t("Non ora", "Not now");
  testiDellaSegnalazione();
}

function testiDellaSegnalazione() {
  $("segnala").textContent = t("Segnala un problema", "Report a problem");
  $("segnalazione-titolo").textContent = t("Segnala un problema", "Report a problem");
  $("segnala-nota-etichetta").textContent = t("Cosa è successo?", "What happened?");
  $("segnala-nota").placeholder = t("Facoltativo", "Optional");
  $("segnala-schermata-nome").textContent = t("Includi una schermata della finestra", "Include a screenshot of the window");
  $("segnala-schermata-cosa").textContent = t(
    "La schermata può mostrare contenuti tuoi, come i titoli dei video o i nomi dei file.",
    "The screenshot may show your own content, such as video titles or file names.",
  );
  $("segnala-registri").textContent = t(
    "Con la segnalazione partono le ultime righe dei registri dell'app, che possono contenere i nomi dei tuoi video e dei tuoi file. Il tuo nome utente, il nome del computer, gli indirizzi email e di rete e le chiavi vengono tolti dal testo. Le trascrizioni, la chat e i file della cartella di lavoro non partono mai.",
    "The last lines of the app's logs are sent with the report, and they may contain the names of your videos and files. Your user name, the computer name, email and network addresses and keys are removed from the text. Transcripts, the chat and the files of your work folder are never sent.",
  );
  $("segnala-invia").textContent = t("Invia", "Send");
  $("segnala-chiudi").textContent = t("Chiudi", "Close");
}

function titoloDi(s) {
  if (s.fase === "aggiornamento") {
    return {
      proposta: t("C'è una versione nuova", "A new version is available"),
      scarico: t("Aggiorno Mango Animation", "Updating Mango Animation"),
      errore: t("L'aggiornamento non è andato", "The update failed"),
    }[s.aggiornamento.fase];
  }
  if (s.fase === "claude") {
    if (s.claude.trovato) return t("Collega Claude Code al tuo account", "Connect Claude Code to your account");
    return s.claude.percorso ? t("Claude Code non parte", "Claude Code won't start") : t("Per cominciare serve Claude Code", "To get started you need Claude Code");
  }
  if (s.fase === "cartella") return t("Dove tengo i tuoi video?", "Where should I keep your videos?");
  if (s.fase === "spostamento") {
    return {
      copia: t("Sposto i tuoi video", "Moving your videos"),
      verifica: t("Sposto i tuoi video", "Moving your videos"),
      rimozione: t("Finisco di spostare", "Finishing the move"),
      errore: t("Lo spostamento non è riuscito", "The move did not work"),
      annullato: t("Spostamento annullato", "Move cancelled"),
      avanzi: t("Spostamento finito", "Move finished"),
    }[s.spostamento.fase];
  }
  if (s.fase === "computer") {
    if (s.computer.fase === "scarico" && soloNecessarie(s.computer)) return t("Preparo l'app", "Getting the app ready");
    return {
      piano: t("Scegli cosa vuoi fare", "Choose what you want to do"),
      scarico: t("Preparo il computer", "Setting up the computer"),
      errore: t("Qualcosa non è andato", "Something went wrong"),
    }[s.computer.fase];
  }
  if (s.fase === "mancante") return t("La cartella dei dati non c'è più", "The data folder is gone");
  if (s.fase !== "errore") return t("Sto preparando tutto", "Getting everything ready");
  if (s.lavoro) return t("La cartella dei dati non va", "The data folder has a problem");
  if (s.radice) return t("Non trovo il codice di Mango Animation", "I can't find the code of Mango Animation");
  return s.fermato ? t("Il server si è fermato", "The server has stopped") : t("Il server non parte", "The server won't start");
}

function dettaglioDi(s) {
  if (s.fase === "aggiornamento") return dettaglioDiAggiornamento(s.aggiornamento);
  if (s.fase === "claude") return dettaglioDiClaude(s.claude);
  if (s.fase === "cartella") return dettaglioDellaCartella(s.cartella);
  if (s.fase === "spostamento") return dettaglioDelloSpostamento(s.spostamento);
  if (s.fase === "computer") return dettaglioDelComputer(s.computer);
  if (s.fase === "mancante") {
    const ricrea = s.predefinita
      ? t(`Si può ricreare vuota in ${s.predefinita}, oppure scegliere un'altra cartella.`, `It can be recreated empty in ${s.predefinita}, or you can choose another folder.`)
      : t("Scegli un'altra cartella.", "Choose another folder.");
    const altrove = t("Se i tuoi file sono altrove, scegli la cartella che li contiene.", "If your files are somewhere else, choose the folder that contains them.");
    return `${s.messaggio} ${ricrea} ${altrove}`;
  }
  if (s.fase === "errore") return s.log ? t("Qui sotto le ultime righe scritte dal server.", "Below are the last lines the server wrote.") : "";
  return s.secondi > 0 ? `${s.messaggio}… ${s.secondi} s` : `${s.messaggio}…`;
}

function dettaglioDiAggiornamento(a) {
  if (a.fase === "errore") return a.messaggio;
  if (a.fase === "scarico") {
    return t(`Scarico la versione ${a.nuova}. Finito, l'app si chiude e si riapre da sola.`, `Downloading version ${a.nuova}. When it is done, the app closes and reopens by itself.`);
  }
  const note = a.note ? `\n\n${a.note}` : "";
  const uscita = t(
    `È uscita la versione ${a.nuova} (hai la ${a.corrente}). Si aggiorna adesso, prima di cominciare a lavorare.`,
    `Version ${a.nuova} is out (you have ${a.corrente}). It updates now, before you start working.`,
  );
  return uscita + note;
}

function dettaglioDiClaude(c) {
  if (c.trovato) {
    const frase = c.messaggio || t("Serve l'accesso con il tuo account Claude: si apre una finestra, e poi il browser per entrare.", "You need to sign in with your Claude account: a window opens, and then the browser to sign in.");
    const trovato = t(`Ho trovato Claude Code ${c.versione}.`, `Found Claude Code ${c.versione}.`);
    return `${trovato} ${frase}`;
  }
  const riprova = t("Puoi riprovare, o seguire la guida di Anthropic.", "You can try again, or follow Anthropic's guide.");
  if (c.messaggio) return `${c.messaggio} ${riprova}`;
  return t(
    "Mango Animation lavora insieme a Claude. Prima serve Claude Code: lo installo io con un clic.",
    "Mango Animation works together with Claude. First you need Claude Code: I install it for you with one click.",
  );
}

// Una cartella per i video: lo spazio del suo disco, e a chi non ha scelto niente come si fa.
function dettaglioDellaCartella(c) {
  const cosa = t("Qui vanno i tuoi video, il girato e tutto il lavoro. Pesano molto: scegli un disco con spazio.", "Your videos, footage and all the work go here. They are big: pick a disk with room.");
  return c.percorso ? cosa : `${cosa} ${t("Scegli dove tenerli.", "Choose where to keep them.")}`;
}

function dettaglioDelloSpostamento(m) {
  const dovEra = t("I tuoi file sono dove erano.", "Your files are where they were.");
  if (m.fase === "copia") {
    return t(
      "Copio tutto nella nuova cartella. Non chiudere l'app: i file di prima restano dove sono finché non ho controllato che sia arrivato tutto.",
      "I am copying everything to the new folder. Don't close the app: the old files stay where they are until I have checked that everything arrived.",
    );
  }
  if (m.fase === "verifica") return t("Controllo che sia arrivato tutto.", "Checking that everything arrived.");
  if (m.fase === "rimozione") return t("Tolgo i file dalla cartella di prima.", "Removing the files from the old folder.");
  if (m.fase === "errore") return `${m.messaggio} ${dovEra}`;
  if (m.fase === "annullato") return dovEra;
  const primi = m.primi_rimasti.join("\n");
  const altri = m.rimasti > m.primi_rimasti.length ? t(`\ne altri ${m.rimasti - m.primi_rimasti.length}`, `\nand ${m.rimasti - m.primi_rimasti.length} more`) : "";
  return `${t("I tuoi video sono nella nuova cartella.", "Your videos are in the new folder.")} ${t(
    `${m.rimasti} file della cartella di prima non si sono potuti togliere, forse un altro programma li tiene aperti: puoi toglierli a mano.`,
    `${m.rimasti} files of the old folder could not be removed, maybe another program has them open: you can remove them by hand.`,
  )}\n\n${primi}${altri}`;
}

function mostraSpostamento(m) {
  $("spostamento-da").textContent = `${t("Da", "From")}: ${m.da}`;
  $("spostamento-a").textContent = `${t("A", "To")}: ${m.a}`;
  const inCorso = ["copia", "verifica", "rimozione"].includes(m.fase);
  $("spostamento-barra").hidden = !inCorso;
  $("spostamento-conti").hidden = !inCorso;
  $("spostamento-barra").max = Math.max(m.totale_mb, 1);
  $("spostamento-barra").value = m.fase === "copia" ? m.fatti_mb : m.totale_mb;
  $("spostamento-conti").textContent = t(
    `${grandezza(m.fatti_mb)} / ${grandezza(m.totale_mb)} · ${m.file_fatti} / ${m.file_totali} file`,
    `${grandezza(m.fatti_mb)} / ${grandezza(m.totale_mb)} · ${m.file_fatti} / ${m.file_totali} files`,
  );
  $("sposta-riprova").hidden = !["errore", "annullato"].includes(m.fase);
  $("sposta-continua").hidden = inCorso;
  $("sposta-continua").textContent = m.fase === "avanzi" ? t("Continua", "Continue") : t("Continua con la cartella di prima", "Continue with the previous folder");
}

function mostraCartella(c) {
  $("cartella-percorso").hidden = !c.percorso;
  $("cartella-percorso").textContent = c.percorso || "";
  $("cartella-spazio").hidden = !c.percorso;
  $("cartella-spazio").textContent = t(`Spazio libero sul disco: ${grandezza(c.libero_mb)}`, `Free space on the disk: ${grandezza(c.libero_mb)}`);
  $("cartella-onedrive").hidden = !c.onedrive;
  $("cartella-onedrive").textContent = t(
    "Questa cartella è dentro OneDrive: i video verrebbero copiati online, e pesano molto. Meglio una cartella fuori da OneDrive.",
    "This folder is inside OneDrive: your videos would be copied online, and they are big. A folder outside OneDrive is better.",
  );
  $("cartella-altre-gruppo").hidden = c.alternative.length === 0;
  $("cartella-altre").replaceChildren(...c.alternative.map(sceltaRapida));
  const errore = $("cartella-errore");
  errore.hidden = !c.messaggio;
  errore.textContent = c.messaggio || "";
  $("usa-cartella").disabled = !c.percorso;
}

// Una cartella da prendere con un clic: dove sta e quanto spazio ha il suo disco.
function sceltaRapida(a) {
  const bottone = nodo("button", ["secondario", "scelta"]);
  bottone.type = "button";
  bottone.append(nodo("span", "nome", a.percorso), nodo("span", "peso", t(`${grandezza(a.libero_mb)} liberi`, `${grandezza(a.libero_mb)} free`)));
  bottone.addEventListener("click", () => {
    invoke("azione", { azione: { cartella: a.percorso } }).catch(() => {});
  });
  return bottone;
}

function dettaglioDelComputer(c) {
  if (c.fase === "scarico") return t("Non chiudere l'app: se si interrompe, al prossimo avvio riparte da dove era arrivato.", "Don't close the app: if it is interrupted, it picks up where it left off the next time you open it.");
  if (c.fase === "errore") return t("Si può riprovare: ciò che è già arrivato non si riscarica.", "You can try again: what has already arrived is not downloaded again.");
  return t("Scarico solo ciò che serve alle funzioni che accendi.", "I only download what the features you turn on need.");
}

// Pesi e spazi in megabyte, scritti come li legge una persona.
function grandezza(mb) {
  const cifre = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  const numero = (n) => n.toLocaleString(lingua === "en" ? "en-GB" : "it-IT", cifre);
  if (mb >= 1024 * 1024) return `${numero(mb / (1024 * 1024))} TB`;
  return mb >= 1000 ? `${numero(mb / 1024)} GB` : `${mb} MB`;
}

// Il computer in una riga: quante schede NVIDIA e quanta memoria; i nomi esatti nel suggerimento.
function macchinaDi(c) {
  const n = c.schede.length;
  if (n === 0) {
    return t(
      "Questo computer non ha una scheda video NVIDIA: le funzioni lavorano sul processore, più piano.",
      "This computer has no NVIDIA graphics card: the features run on the processor, more slowly.",
    );
  }
  const schede = n === 1 ? t("una scheda video NVIDIA", "one NVIDIA graphics card") : t(`${n} schede video NVIDIA`, `${n} NVIDIA graphics cards`);
  return t(`Questo computer: ${schede} e ${grandezza(c.ram_mb)} di memoria.`, `This computer: ${schede} and ${grandezza(c.ram_mb)} of memory.`);
}

// Mancano solo cose senza cui l'app non parte: l'app le prepara da sé, senza chiedere.
const soloNecessarie = (c) => c.voci.length > 0 && c.voci.every((v) => v.necessaria);

const nodo = (tag, classi, testo) => Object.assign(document.createElement(tag), classi ? { className: [classi].flat().join(" ") } : {}, testo === undefined ? {} : { textContent: testo });

// Quanto pesa un gruppo di voci, e a che punto è mentre scarica.
function avanzamentoDi(voci) {
  const peso = voci.reduce((somma, v) => somma + v.peso_mb, 0);
  const fatti = voci.reduce((somma, v) => somma + (v.stato === "fatta" ? v.peso_mb : v.stato === "in corso" && v.totale_mb > 0 ? Math.min(v.fatti_mb, v.peso_mb) : 0), 0);
  return { peso, fatti, finito: voci.length > 0 && voci.every((v) => v.stato === "fatta"), iniziato: voci.some((v) => v.stato !== "attesa") };
}

function barra(fatti, peso) {
  const b = nodo("progress");
  b.max = Math.max(peso, 1);
  b.value = fatti;
  return b;
}

// Sotto il nome di una funzione: quanto scarica, oppure «Pronta» o «Spenta»; mentre scarica, la sua barra.
function costoDi(f, voci, scarico) {
  if (!f.attiva) return nodo("span", ["costo", "spenta"], t("Spenta", "Off"));
  const a = avanzamentoDi(voci);
  if (voci.length === 0 || a.finito) return nodo("span", ["costo", "pronta"], t("✓ Pronta", "✓ Ready"));
  if (scarico && a.iniziato) {
    const riga = nodo("span", ["costo", "scarica"]);
    riga.append(barra(a.fatti, a.peso), ` ${grandezza(a.fatti)} / ${grandezza(a.peso)}`);
    return riga;
  }
  return nodo("span", ["costo", "scarica"], t(`${grandezza(a.peso)} da scaricare`, `${grandezza(a.peso)} to download`));
}

function funzioneDi(f, c, scarico) {
  const etichetta = nodo("label", "funzione");
  const casella = nodo("input");
  casella.type = "checkbox";
  casella.checked = f.attiva;
  casella.disabled = scarico;
  casella.addEventListener("change", () => {
    invoke("azione", { azione: { funzioni: { [f.id]: casella.checked } } }).catch(() => {});
  });
  etichetta.append(casella, nodo("span", "nome", f.nome), nodo("span", "cosa", f.cosa_fa), costoDi(f, c.voci.filter((v) => v.funzione === f.id), scarico));
  return etichetta;
}

function comuneDi(v, scarico) {
  const riga = nodo("li");
  const testo = nodo("span", "testo");
  // Prima a cosa serve, poi il nome del programma: chi non programma riconosce la prima, non il secondo.
  testo.append(nodo("span", "nome", v.scopo.charAt(0).toUpperCase() + v.scopo.slice(1)), nodo("span", "scopo", v.nome));
  riga.append(testo);
  if (v.necessaria) riga.append(nodo("span", "etichettina", t("Serve sempre", "Always needed")));
  if (v.stato === "fatta") riga.append(nodo("span", ["peso", "costo", "pronta"], t("✓ Fatto", "✓ Done")));
  else if (scarico && v.stato === "in corso" && v.totale_mb > 0) riga.append(barra(v.fatti_mb, v.totale_mb));
  else if (scarico && v.stato === "in corso") riga.append(nodo("span", "peso", t("in corso…", "in progress…")));
  else riga.append(nodo("span", "peso", grandezza(v.peso_mb)));
  return riga;
}

function dettaglioVoce(v) {
  const r = nodo("tr");
  const cosa = nodo("td");
  cosa.append(nodo("div", "", v.nome), nodo("div", "", v.scopo));
  const licenza = nodo("td");
  const link = nodo("a", "", v.licenza);
  link.href = v.fonte;
  link.target = "_blank";
  licenza.append(link);
  r.append(cosa, licenza, nodo("td", "peso", grandezza(v.peso_mb)));
  return r;
}

function mostraComputer(c) {
  const scarico = c.fase === "scarico";
  const automatico = scarico && soloNecessarie(c);
  $("funzioni-gruppo").hidden = automatico;
  $("funzioni").replaceChildren(...c.funzioni.map((f) => funzioneDi(f, c, scarico)));
  const comuni = c.voci.filter((v) => !v.funzione);
  $("comuni-gruppo").hidden = comuni.length === 0;
  $("comuni").replaceChildren(...comuni.map((v) => comuneDi(v, scarico)));

  const a = avanzamentoDi(c.voci);
  $("totale-etichetta").textContent = scarico ? t("Scaricato", "Downloaded") : t("Da scaricare", "To download");
  $("totale").textContent = scarico ? `${grandezza(a.fatti)} / ${grandezza(a.peso)}` : grandezza(a.peso);
  const progresso = $("avanzamento-computer");
  progresso.hidden = !scarico;
  progresso.max = Math.max(a.peso, 1);
  progresso.value = a.fatti;
  const libero = t(`Spazio libero sul disco: ${grandezza(c.libero_mb)}`, `Free disk space: ${grandezza(c.libero_mb)}`);
  const poco = t(`Non basta: servono ${grandezza(c.servono_mb)}. Libera spazio o spegni qualche funzione.`, `Not enough: ${grandezza(c.servono_mb)} is needed. Free up space or turn off a feature.`);
  $("spazio").textContent = c.spazio_ok ? libero : `${libero}. ${poco}`;
  $("spazio").className = c.spazio_ok ? "" : "poco";

  $("macchina").hidden = automatico;
  $("macchina").textContent = macchinaDi(c.computer);
  $("macchina").title = c.computer.schede.map((s) => `${s.nome} (${grandezza(s.memoria_mb)})`).join("\n");
  $("avvisi").replaceChildren(...c.avvisi.map((testo) => nodo("li", "", testo)));
  const errore = $("errore-computer");
  errore.hidden = !c.messaggio;
  errore.textContent = c.messaggio || "";
  $("dettagli").hidden = automatico;
  $("voci").replaceChildren(...c.voci.map(dettaglioVoce));
  $("prepara").textContent = c.fase === "errore" ? t("Riprova", "Try again") : t("Scarica e comincia", "Download and start");
  $("prepara").disabled = !c.spazio_ok;
}

// L'ultimo stato mostrato: se è un errore, la segnalazione lo porta con sé.
let ultimoStato = null;

function erroreDi(s) {
  const testo = { errore: s.messaggio, computer: s.computer?.fase === "errore" && s.computer.messaggio, aggiornamento: s.aggiornamento?.fase === "errore" && s.aggiornamento.messaggio }[s.fase];
  return testo ? `${titoloDi(s)}\n${testo}` : null;
}

function mostra(s) {
  lingua = s.lingua || lingua;
  ultimoStato = s;
  testiFissi();
  const errore = s.fase === "errore";
  const mancante = s.fase === "mancante";
  const claude = s.fase === "claude";
  const cartella = s.fase === "cartella";
  const spostamento = s.fase === "spostamento";
  const computer = s.fase === "computer";
  const aggiornamento = s.fase === "aggiornamento";
  $("giro").hidden = errore || mancante || claude || cartella || spostamento || computer || aggiornamento;
  document.querySelector(".corpo").classList.toggle("largo", computer);
  $("titolo").textContent = titoloDi(s);
  $("dettaglio").textContent = dettaglioDi(s);
  const log = $("log");
  log.hidden = !errore;
  log.textContent = errore ? s.messaggio + (s.log ? t(`\n\nDettagli in: ${s.log}`, `\n\nDetails in: ${s.log}`) : "") : "";
  // Un errore sulla radice o sulla cartella dei dati vuole una variabile e riavviare l'app: niente da riprovare qui.
  $("riprova").hidden = !(errore && !s.radice);
  $("ricrea").hidden = !(mancante && s.predefinita);
  $("scegli").hidden = !mancante;

  const daInstallare = claude && !s.claude.trovato;
  $("abbonamento").hidden = !claude;
  $("mango-code").hidden = !(claude && s.claude.mango_code);
  $("installa").hidden = !daInstallare;
  $("installa").textContent = s.claude?.messaggio ? t("Riprova", "Try again") : t("Installa Claude Code", "Install Claude Code");
  $("alternativa").hidden = !daInstallare;
  $("comando").textContent = daInstallare ? s.claude.comando : "";
  $("guida").hidden = !daInstallare;
  if (daInstallare) $("copia").textContent = t("Copia il comando", "Copy the command");
  $("accedi").hidden = !(claude && s.claude.trovato);
  $("ricontrolla").hidden = !claude;

  $("cartella").hidden = !cartella;
  $("usa-cartella").hidden = !cartella;
  $("scegli-altra").hidden = !cartella;
  if (cartella) mostraCartella(s.cartella);

  $("spostamento").hidden = !spostamento;
  if (spostamento) mostraSpostamento(s.spostamento);
  else {
    $("sposta-riprova").hidden = true;
    $("sposta-continua").hidden = true;
  }

  $("computer").hidden = !computer;
  $("riepilogo").hidden = !computer;
  $("prepara").hidden = !(computer && s.computer.fase !== "scarico");
  $("avanti").hidden = !(computer && s.computer.fase !== "scarico" && !s.computer.voci.some((v) => v.necessaria));
  const spostaInCorso = spostamento && ["copia", "verifica"].includes(s.spostamento.fase);
  $("annulla").hidden = !((computer && s.computer.fase === "scarico") || spostaInCorso);
  $("annulla").textContent = spostamento ? t("Annulla lo spostamento", "Cancel the move") : t("Ferma", "Stop");
  if (computer) mostraComputer(s.computer);

  const scarico = aggiornamento && s.aggiornamento.fase === "scarico";
  const sceltaDiAggiornamento = aggiornamento && s.aggiornamento.fase !== "scarico";
  dopoUnErrore = aggiornamento && s.aggiornamento.fase === "errore";
  $("aggiorna").hidden = !sceltaDiAggiornamento;
  $("dopo").hidden = !sceltaDiAggiornamento;
  $("aggiorna").textContent = dopoUnErrore ? t("Riprova", "Try again") : t("Aggiorna ora", "Update now");
  $("dopo").textContent = dopoUnErrore ? t("Continua con la versione che hai", "Continue with the version you have") : t("Più tardi", "Later");
  $("avanzamento").hidden = !scarico;
  if (scarico) {
    // Senza il totale la barra resta «in corso» invece di riempirsi.
    if (s.aggiornamento.totale > 0) {
      $("avanzamento").max = s.aggiornamento.totale;
      $("avanzamento").value = s.aggiornamento.fatti;
    } else {
      $("avanzamento").removeAttribute("value");
    }
  }
}

// La pagina dell'aggiornamento è in errore: «Aggiorna» vuol dire riprovare.
let dopoUnErrore = false;

const rispondi = (azione, attesa) => {
  mostra({ fase: "attesa", secondi: 0, messaggio: attesa });
  invoke("azione", { azione }).catch(() => {});
};

$("scegli").addEventListener("click", () => {
  invoke("scegli_lavoro").catch(() => {});
});

$("ricrea").addEventListener("click", () => {
  invoke("ricrea_lavoro").catch(() => {});
});

$("riprova").addEventListener("click", () => {
  mostra({ fase: "attesa", secondi: 0, messaggio: t("Riprovo", "Trying again") });
  invoke("riprova").catch(() => {});
});

$("copia").addEventListener("click", () => {
  navigator.clipboard.writeText($("comando").textContent).then(
    () => ($("copia").textContent = t("Copiato", "Copied")),
    () => ($("copia").textContent = t("Non riesco a copiare: selezionalo e copialo a mano", "I can't copy it: select it and copy it by hand")),
  );
});

const vadoAvanti = () => t("Vado avanti", "Continuing");
const comincio = () => t("Comincio", "Starting");
$("ricontrolla").addEventListener("click", () => rispondi("ricontrolla", t("Controllo Claude Code", "Checking Claude Code")));
$("accedi").addEventListener("click", () => rispondi("accedi", t("Aspetto che finisci l'accesso a Claude Code", "Waiting for you to finish signing in to Claude Code")));
$("installa").addEventListener("click", () => rispondi("installa", t("Installo Claude Code nella finestra che si è aperta", "Installing Claude Code in the window that just opened")));
// Scegliere una cartella non cambia la pagina: arriva da sé lo stato nuovo, con la cartella scelta.
$("scegli-altra").addEventListener("click", () => {
  invoke("azione", { azione: "scegli_cartella" }).catch(() => {});
});
$("sposta-riprova").addEventListener("click", () => rispondi("ricontrolla", t("Riprovo", "Trying again")));
$("sposta-continua").addEventListener("click", () => rispondi("continua", vadoAvanti()));
$("usa-cartella").addEventListener("click", () => rispondi("usa_cartella", t("Preparo la cartella", "Preparing the folder")));
$("aggiorna").addEventListener("click", () => rispondi("aggiorna", dopoUnErrore ? t("Riprovo", "Trying again") : comincio()));
$("dopo").addEventListener("click", () => rispondi("continua", vadoAvanti()));
$("prepara").addEventListener("click", () => rispondi("prepara", comincio()));
$("avanti").addEventListener("click", () => rispondi("continua", vadoAvanti()));
// Fermare lo scarico non cambia la pagina: arriva da sé lo stato di prima.
$("annulla").addEventListener("click", () => {
  $("annulla").disabled = true;
  invoke("azione", { azione: "annulla" }).catch(() => {});
});

listen("mango://stato", ({ payload }) => {
  $("annulla").disabled = false;
  mostra(payload);
});
invoke("stato_app").then(mostra).catch(() => {});

// «Segnala un problema»: un campo facoltativo, l'interruttore della schermata, e nessun invio senza il clic su «Invia».
// L'interruttore della schermata si vede solo se la schermata verrà presa, cioè se questa costruzione manda le segnalazioni a Sentry.
let schermataPossibile = Promise.resolve(false);
const chiediSeLaSchermataSiPrende = () => {
  schermataPossibile = window.__MANGO_ANIMATION__.segnalazione.invioAttivo().then(
    (attivo) => attivo === true,
    () => false,
  );
  schermataPossibile.then((possibile) => {
    $("segnala-schermata-riga").hidden = !possibile;
  });
};
const apriLaSegnalazione = (aperta) => {
  $("segnalazione").hidden = !aperta;
  if (aperta) {
    chiediSeLaSchermataSiPrende();
    $("segnala-nota").focus();
  }
};
$("segnala").addEventListener("click", () => apriLaSegnalazione($("segnalazione").hidden));
$("segnala-chiudi").addEventListener("click", () => apriLaSegnalazione(false));

// Con la schermata la finestra va ripresa senza il riquadro della segnalazione, che coprirebbe la pagina di cui si parla.
const dopoIlDisegno = () => new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(fatto)));

const fraseDelRifiuto = (e) => {
  const m = typeof e === "object" && e !== null ? e.message : e;
  return typeof m === "string" && m !== "" ? m : t("La segnalazione non è partita.", "The report could not be sent.");
};

$("segnala-invia").addEventListener("click", async () => {
  const esito = $("segnala-esito");
  $("segnala-invia").disabled = true;
  esito.className = "";
  esito.textContent = t("Invio…", "Sending…");
  const schermata = (await schermataPossibile) && $("segnala-schermata").checked;
  if (schermata) {
    $("segnalazione").hidden = true;
    await dopoIlDisegno();
  }
  try {
    const fatto = await window.__MANGO_ANIMATION__.segnalazione.invia({ errore: ultimoStato ? erroreDi(ultimoStato) : null, nota: $("segnala-nota").value, schermata });
    esito.textContent = fatto.inviata
      ? t("Inviato, grazie", "Sent, thank you")
      : t(`Salvato in ${fatto.file}. Si è aperta la pagina di GitHub per mandarlo.`, `Saved to ${fatto.file}. The GitHub page is open so you can send it.`);
    $("segnala-nota").value = "";
  } catch (e) {
    esito.className = "poco";
    esito.textContent = fraseDelRifiuto(e);
  }
  $("segnalazione").hidden = false;
  $("segnala-invia").disabled = false;
});
