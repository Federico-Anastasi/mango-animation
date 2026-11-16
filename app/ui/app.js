"use strict";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const $ = (id) => document.getElementById(id);

// La lingua la dice l'app con ogni stato (`lingua`); ogni frase si scrive nelle due lingue dove compare: t("italiano", "inglese").
let lingua = "it";
const t = (it, en) => (lingua === "en" ? en : it);

// La versione la dice l'app con ogni stato; la pagina la tiene per le risposte che si dà da sola.
let versione = "";

// Le tappe dell'avvio (quante ne ha fatte, su quante) le dice l'app con ogni stato; la pagina le tiene allo stesso modo.
let tappe = { fatte: 0, su: 0 };

// Le frasi fisse della pagina (index.html non ha testo): si riscrivono a ogni stato, nella lingua che l'app dice.
function testiFissi() {
  document.documentElement.lang = lingua;
  $("marchio-mango").textContent = "mango";
  $("marchio-prodotto").textContent = "animation";
  $("versione").textContent = versione ? `Mango Animation ${versione}` : "Mango Animation";
  $("motori-titolo").textContent = t("Motori della chat", "Chat engines");
  $("funzioni-titolo").textContent = t("Funzioni", "Features");
  $("comuni-titolo").textContent = t("Componenti comuni", "Shared components");
  $("dettagli-titolo").textContent = t("Cosa scarico e da dove", "What I download and from where");
  $("voci").setAttribute("aria-label", t("Cosa si scarica", "What will be downloaded"));
  $("nota").textContent = t(
    "Niente di tutto questo è dentro l'app: si scarica dalla fonte di ciascuno, con la sua licenza accanto. Ogni file è verificato prima di usarlo.",
    "None of this is inside the app: each item is downloaded from its own source, with its licence next to it. Every file is checked before it is used.",
  );
  $("riprova").textContent = t("Riprova", "Try again");
  $("ricrea").textContent = t("Ricrea in Documenti", "Recreate in Documents");
  $("scegli").textContent = t("Scegli un'altra cartella", "Choose another folder");
  $("scegli-altra").textContent = t("Scegli un'altra cartella", "Choose another folder");
  $("usa-cartella").textContent = t("Usa questa cartella", "Use this folder");
  $("sposta-riprova").textContent = t("Riprova", "Try again");
  $("cartella-altre-titolo").textContent = t("Altre cartelle", "Other folders");
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
  $("segnala-immagine-nome").textContent = t("Aggiungi un'immagine dell'errore", "Add an image of the error");
  $("segnala-immagine-cosa").textContent = t(
    "Te lo consigliamo: con l'immagine ci è più semplice capire il problema e risolverlo.",
    "We recommend it: with an image it is easier for us to understand the problem and fix it.",
  );
  $("segnala-immagine").setAttribute("aria-label", t("Scegli un'immagine da allegare", "Choose an image to attach"));
  $("segnala-immagine-scegli").textContent = t("Scegli un'immagine", "Choose an image");
  $("segnala-immagine-togli").textContent = t("Togli", "Remove");
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
  if (s.fase === "motori") {
    return s.motori.some((m) => m.trovato) ? t("Collega un motore della chat", "Connect a chat engine") : t("Per cominciare serve un motore per la chat", "To get started you need a chat engine");
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
  if (s.fermato) return t("Il server si è fermato", "The server has stopped");
  return s.log ? t("Il server non parte", "The server won't start") : t("Non riesco a preparare l'app", "I can't get the app ready");
}

function dettaglioDi(s) {
  if (s.fase === "aggiornamento") return dettaglioDiAggiornamento(s.aggiornamento);
  if (s.fase === "motori") {
    return t(
      "Mango Animation lavora con Claude Code, Codex o Mango Code. Ne basta uno, installato e collegato.",
      "Mango Animation works with Claude Code, Codex or Mango Code. One is enough, installed and connected.",
    );
  }
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
  return t(
    `È uscita la versione ${a.nuova} (hai la ${a.corrente}). Si aggiorna adesso, prima di cominciare a lavorare.`,
    `Version ${a.nuova} is out (you have ${a.corrente}). It updates now, before you start working.`,
  );
}

// Ogni motore che non è pronto, in una riga: com'è messo, cosa dice di sé, cosa si può fare.
const NOTE_DEI_MOTORI = {
  "claude-code": () =>
    t(
      "Claude Code richiede un account Claude con un abbonamento: Pro, Max, Ultra, Team o Enterprise. Il piano gratuito non lo include.",
      "Claude Code needs a Claude account with a subscription: Pro, Max, Ultra, Team or Enterprise. The free plan does not include it.",
    ),
  codex: () => t("Si accede con il tuo account ChatGPT.", "You sign in with your ChatGPT account."),
  "mango-code": (m) =>
    m.installabile
      ? t("Si scarica da GitHub: installalo, aprilo, poi premi «Ricontrolla».", "Download it from GitHub: install it, open it, then press “Check again”.")
      : t("Si apre dalla sua icona; poi premi «Ricontrolla».", "Open it from its icon, then press “Check again”."),
};

function statoDelMotore(m) {
  if (m.id === "mango-code") {
    if (m.trovato) return t("Acceso, non ancora pronto", "On, not ready yet");
    return m.installabile ? t("Non installato", "Not installed") : t("Spento", "Off");
  }
  if (!m.trovato) return m.percorso ? t("Non parte", "Won't start") : t("Non installato", "Not installed");
  return t(`Versione ${m.versione} · da collegare`, `Version ${m.versione} · not connected`);
}

const attesaDellInstallazione = {
  "claude-code": (m) => t(`Installo ${m.nome} nella finestra che si è aperta`, `Installing ${m.nome} in the window that just opened`),
  codex: () => t("Apro la pagina di Codex nel Microsoft Store", "Opening the Codex page in the Microsoft Store"),
  "mango-code": () => t("Apro la pagina di Mango Code su GitHub", "Opening the Mango Code page on GitHub"),
};

const attesaDelMotore = {
  installa: (m) => attesaDellInstallazione[m.id](m),
  accedi: (m) => t(`Aspetto che finisci l'accesso a ${m.nome}`, `Waiting for you to finish signing in to ${m.nome}`),
};

function tonoDelMotore(m) {
  if (m.id === "mango-code" && m.trovato) return "in-corso";
  return !m.trovato && m.percorso ? "errore" : "neutra";
}

function bottoneDelMotore(m, cosa, testo, principale) {
  const bottone = nodo("button", principale ? "principale" : "", testo);
  bottone.type = "button";
  bottone.addEventListener("click", () => rispondi({ [cosa]: m.id }, attesaDelMotore[cosa](m)));
  return bottone;
}

// Per chi preferisce incollare da sé il comando di installazione, con la guida del produttore: sta chiuso finché non lo si apre.
function alternativaDelMotore(m) {
  const copia = nodo("button", "", t("Copia il comando", "Copy the command"));
  copia.type = "button";
  copia.addEventListener("click", () => {
    navigator.clipboard.writeText(m.comando).then(
      () => (copia.textContent = t("Copiato", "Copied")),
      () => (copia.textContent = t("Non riesco a copiare: selezionalo e copialo a mano", "I can't copy it: select it and copy it by hand")),
    );
  });
  const guida = Object.assign(nodo("a", "", t("La guida di Anthropic per installare Claude Code", "Anthropic's guide to installing Claude Code")), { href: "https://code.claude.com/docs/en/setup", target: "_blank" });
  const alternativa = nodo("details", "alternativa");
  alternativa.append(nodo("summary", "", t("Installa con un comando", "Install with a command")), nodo("p", "", t("Incolla questo comando in PowerShell:", "Paste this command into PowerShell:")), nodo("pre", "", m.comando), copia, guida);
  return alternativa;
}

const daCollegare = (m) => m.accedibile && m.trovato && !m.collegato;

// Il bottone principale dei motori è «Accedi» quando è l'unica cosa che porta avanti; con più scelte alla pari nessuna lo è.
function motoreDi(m, accediPrincipale) {
  const riga = nodo("li", ["riga", "motore"]);
  const testo = nodo("div", "testo");
  testo.append(nodo("span", "nome", m.nome), nodo("span", `etichetta ${tonoDelMotore(m)}`, statoDelMotore(m)));
  if (m.messaggio) testo.append(nodo("span", "messaggio", m.messaggio));
  testo.append(nodo("span", "cosa", NOTE_DEI_MOTORI[m.id](m)));
  const bottoni = nodo("div", "lato");
  if (m.installabile && !m.trovato) bottoni.append(bottoneDelMotore(m, "installa", m.messaggio ? t("Riprova", "Try again") : t("Installa", "Install"), false));
  if (daCollegare(m)) bottoni.append(bottoneDelMotore(m, "accedi", t("Accedi", "Sign in"), accediPrincipale));
  riga.append(testo, bottoni);
  if (m.comando) riga.append(alternativaDelMotore(m));
  return riga;
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
  const bottone = nodo("button", "scelta");
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
  if (!f.attiva) return nodo("span", ["etichetta", "neutra"], t("Spenta", "Off"));
  const a = avanzamentoDi(voci);
  if (voci.length === 0 || a.finito) return nodo("span", ["etichetta", "pronta"], t("Pronta", "Ready"));
  if (scarico && a.iniziato) {
    const riga = nodo("span", "costo");
    riga.append(barra(a.fatti, a.peso), ` ${grandezza(a.fatti)} / ${grandezza(a.peso)}`);
    return riga;
  }
  return nodo("span", "costo", t(`${grandezza(a.peso)} da scaricare`, `${grandezza(a.peso)} to download`));
}

function funzioneDi(f, c, scarico) {
  const etichetta = nodo("label", ["riga", "interruttore"]);
  const casella = nodo("input");
  casella.type = "checkbox";
  casella.setAttribute("role", "switch");
  casella.checked = f.attiva;
  casella.disabled = scarico;
  casella.addEventListener("change", () => {
    invoke("azione", { azione: { funzioni: { [f.id]: casella.checked } } }).catch(() => {});
  });
  const testo = nodo("span", "testo");
  testo.append(nodo("span", "nome", f.nome), nodo("span", "cosa", f.cosa_fa), costoDi(f, c.voci.filter((v) => v.funzione === f.id), scarico));
  etichetta.append(testo, casella);
  return etichetta;
}

function comuneDi(v, scarico) {
  const riga = nodo("li", "riga");
  const testo = nodo("span", "testo");
  // Prima a cosa serve, poi il nome del programma: chi non programma riconosce la prima, non il secondo.
  testo.append(nodo("span", "nome", v.scopo.charAt(0).toUpperCase() + v.scopo.slice(1)), nodo("span", "cosa", v.nome));
  const lato = nodo("span", "lato");
  if (v.necessaria) lato.append(nodo("span", ["etichetta", "neutra"], t("Serve sempre", "Always needed")));
  if (v.stato === "fatta") lato.append(nodo("span", ["etichetta", "pronta"], t("Fatto", "Done")));
  else if (scarico && v.stato === "in corso" && v.totale_mb > 0) lato.append(barra(v.fatti_mb, v.totale_mb));
  else if (scarico && v.stato === "in corso") lato.append(nodo("span", ["etichetta", "in-corso"], t("In corso", "In progress")));
  else lato.append(nodo("span", "peso", grandezza(v.peso_mb)));
  riga.append(testo, lato);
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

const BOTTONI_DI_STATO = ["riprova", "ricrea", "scegli", "sposta-riprova", "sposta-continua", "usa-cartella", "scegli-altra", "ricontrolla", "prepara", "aggiorna", "dopo", "annulla", "avanti"];

// Il bottone principale è uno solo, ciò che porta avanti; gli altri sono normali, o minori se si possono ignorare.
function ruoliDelleAzioni(s) {
  if (s.fase === "errore") return { principale: "riprova", minori: [] };
  if (s.fase === "mancante") return { principale: s.predefinita ? "ricrea" : "scegli", minori: [] };
  if (s.fase === "cartella") return { principale: "usa-cartella", minori: [] };
  if (s.fase === "spostamento") {
    const fase = s.spostamento.fase;
    return { principale: fase === "avanzi" ? "sposta-continua" : ["errore", "annullato"].includes(fase) ? "sposta-riprova" : null, minori: ["annulla"] };
  }
  if (s.fase === "computer") return { principale: "prepara", minori: ["avanti", "annulla"] };
  if (s.fase === "aggiornamento") return { principale: "aggiorna", minori: ["dopo"] };
  return { principale: null, minori: [] };
}

function mostra(s) {
  lingua = s.lingua || lingua;
  versione = s.versione || versione;
  if (s.tappe) tappe = { fatte: s.tappa, su: s.tappe };
  ultimoStato = s;
  testiFissi();
  const errore = s.fase === "errore";
  const mancante = s.fase === "mancante";
  const motori = s.fase === "motori";
  const cartella = s.fase === "cartella";
  const spostamento = s.fase === "spostamento";
  const computer = s.fase === "computer";
  const aggiornamento = s.fase === "aggiornamento";
  const inAttesa = !(errore || mancante || motori || cartella || spostamento || computer) && !(aggiornamento && s.aggiornamento.fase !== "scarico");
  $("corpo").className = ["corpo", inAttesa ? "attesa" : "scelta", ...(computer ? ["largo"] : [])].join(" ");
  const { principale, minori } = ruoliDelleAzioni(s);
  for (const id of BOTTONI_DI_STATO) $(id).className = id === principale ? "principale" : minori.includes(id) ? "minore" : "";
  $("titolo").textContent = titoloDi(s);
  const dettaglio = dettaglioDi(s);
  $("dettaglio").textContent = dettaglio;
  $("dettaglio").className = dettaglio?.includes("\n") ? "lungo" : "";
  const log = $("log");
  log.hidden = !errore;
  log.textContent = errore ? s.messaggio + (s.log ? t(`\n\nDettagli in: ${s.log}`, `\n\nDetails in: ${s.log}`) : "") : "";
  // Un errore sulla radice o sulla cartella dei dati vuole una variabile e riavviare l'app: niente da riprovare qui.
  $("riprova").hidden = !(errore && !s.radice);
  $("ricrea").hidden = !(mancante && s.predefinita);
  $("scegli").hidden = !mancante;

  $("motori-gruppo").hidden = !motori;
  $("motori").hidden = !motori;
  if (motori) {
    const accediPrincipale = s.motori.filter(daCollegare).length === 1;
    $("motori").replaceChildren(...s.motori.map((m) => motoreDi(m, accediPrincipale)));
  }
  $("ricontrolla").hidden = !motori;

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
  const barraDelleTappe = $("tappe");
  barraDelleTappe.hidden = !(s.fase === "attesa" && tappe.su > 0);
  if (!barraDelleTappe.hidden) {
    barraDelleTappe.max = tappe.su;
    barraDelleTappe.value = tappe.fatte;
    barraDelleTappe.style.setProperty("--tappe", String(tappe.su));
    barraDelleTappe.setAttribute("aria-label", t(`Avvio: tappa ${tappe.fatte} di ${tappe.su}`, `Startup: step ${tappe.fatte} of ${tappe.su}`));
  }
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

// La pagina dell'aggiornamento è in errore: il bottone che aggiorna dice «Riprova».
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

const vadoAvanti = () => t("Vado avanti", "Continuing");
const comincio = () => t("Comincio", "Starting");
$("ricontrolla").addEventListener("click", () => rispondi("ricontrolla", t("Controllo i motori della chat", "Checking the chat engines")));
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

// «Segnala un problema»: un campo facoltativo, un'immagine da caricare, l'interruttore della schermata, e nessun invio senza il clic su «Invia».
// Interruttore e immagine si vedono solo se partiranno, cioè se questa costruzione manda le segnalazioni a Sentry.
let schermataPossibile = Promise.resolve(false);
const chiediSeLaSchermataSiPrende = () => {
  schermataPossibile = window.__MANGO_ANIMATION__.segnalazione.invioAttivo().then(
    (attivo) => attivo === true,
    () => false,
  );
  schermataPossibile.then((possibile) => {
    $("segnala-schermata-riga").hidden = !possibile;
    $("segnala-immagine-riga").hidden = !possibile;
  });
};

const LIMITE_IMMAGINE = 10 * 1024 * 1024;
let immagineScelta = null;
const mostraLImmagine = () => {
  $("segnala-immagine-file").hidden = !immagineScelta;
  $("segnala-immagine-file").textContent = immagineScelta ? immagineScelta.name : "";
  $("segnala-immagine-scegli").hidden = !!immagineScelta;
  $("segnala-immagine-togli").hidden = !immagineScelta;
};
const base64Di = (file) =>
  new Promise((fatto, errore) => {
    const lettore = new FileReader();
    lettore.onload = () => fatto(String(lettore.result).slice(String(lettore.result).indexOf(",") + 1));
    lettore.onerror = () => errore(lettore.error);
    lettore.readAsDataURL(file);
  });
$("segnala-immagine-scegli").addEventListener("click", () => $("segnala-immagine").click());
$("segnala-immagine-togli").addEventListener("click", () => {
  immagineScelta = null;
  mostraLImmagine();
});
$("segnala-immagine").addEventListener("change", () => {
  const file = $("segnala-immagine").files?.[0];
  $("segnala-immagine").value = "";
  if (!file) return;
  const troppoGrande = file.size > LIMITE_IMMAGINE;
  $("segnala-immagine-problema").hidden = !troppoGrande;
  $("segnala-immagine-problema").textContent = troppoGrande ? t("L'immagine pesa più di 10 MB: scegline una più piccola.", "The image is larger than 10 MB: choose a smaller one.") : "";
  immagineScelta = troppoGrande ? null : file;
  mostraLImmagine();
});
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
  const possibile = await schermataPossibile;
  const schermata = possibile && $("segnala-schermata").checked;
  let immagine;
  try {
    immagine = possibile && immagineScelta ? await base64Di(immagineScelta) : null;
  } catch (e) {
    esito.className = "poco";
    esito.textContent = fraseDelRifiuto(e);
    $("segnala-invia").disabled = false;
    return;
  }
  if (schermata) {
    $("segnalazione").hidden = true;
    await dopoIlDisegno();
  }
  try {
    const fatto = await window.__MANGO_ANIMATION__.segnalazione.invia({ errore: ultimoStato ? erroreDi(ultimoStato) : null, nota: $("segnala-nota").value, schermata, ...(immagine && { immagine }) });
    esito.textContent = fatto.inviata
      ? t("Inviato, grazie", "Sent, thank you")
      : t(`Salvato in ${fatto.file}. Si è aperta la pagina di GitHub per mandarlo.`, `Saved to ${fatto.file}. The GitHub page is open so you can send it.`);
    $("segnala-nota").value = "";
    immagineScelta = null;
    mostraLImmagine();
  } catch (e) {
    esito.className = "poco";
    esito.textContent = fraseDelRifiuto(e);
  }
  $("segnalazione").hidden = false;
  $("segnala-invia").disabled = false;
});
