# Le uscite e i fork

Per chi pubblica una versione o mantiene un fork. Come si costruisce l'installatore e come si aggiorna chi l'ha installato: `docs/app/installer.md`.

- **Pubblicarlo.** Le uscite ufficiali si fanno solo con le GitHub Actions (`.github/workflows/release.yml`): una costruzione fatta su un computer porta nei file i percorsi di quel computer. Un tag `vX.Y.Z` (o `vX.Y.Z-rc.N`) fa partire
  il workflow, che fa in ordine (dal passo 2 dopo l'approvazione dell'environment `release`, dove stanno i segreti della firma):
  1. le prove che non vogliono scheda video né rete esterna, in un lavoro a parte senza segreti (`.github/workflows/prove.yml`, che si lancia anche a mano su un ramo, prima del tag): `cargo test`, `bun test` di `app/` (`prove` e `installer`), `studio` (le prove e `bun run lint`, le regole degli hook di React), `animazioni` e `server`, e gli avvisi di terzi. Quelle del server fanno video veri: prima il workflow scarica ffmpeg, lo stesso dell'app, dall'indirizzo e con l'impronta di `manifesto.json`. Non girano le prove di `motore/` e di `strumenti/` (vogliono pacchetti da gigabyte) né le `#[ignore]` di `app/` (finestra, motore e rete veri): si lanciano a mano prima del tag (`CONTRIBUTING.md`);
  2. `installer/verifica-versione.ts --tag <tag>`: la versione è la stessa in `tauri.conf.json`, `Cargo.toml`, `motore/__init__.py` e nel tag, e `installer/note/<tag>.md` esiste e ha l'elenco «**Changed since …**» (lanciabile anche a mano dalla radice, senza `--tag`);
  3. la costruzione, `costruisci.ts --senza-firma`, senza segreti;
  4. la firma, `costruisci.ts --solo-firma`: è il solo passo che riceve i segreti, e se mancano il workflow si ferma qui, perché un'uscita senza firma non si pubblica;
  5. la verifica della firma con la chiave pubblica di `tauri.conf.json` (`installer/verifica-firma-tauri.mjs`);
  6. `latest.json` (`installer/pubblica.ts --versione <v> --indirizzo <dove sarà scaricabile l'installatore> --note-file <note>`: versione, firma, indirizzo, e come note l'elenco «Changed since …» in testo semplice; nell'indirizzo il nome del file è quello che GitHub gli dà, coi punti al posto degli spazi);
  7. l'uscita **in bozza** con installatore, `.sig` e `latest.json`; solo se i tre file risultano caricati, della dimensione che hanno in locale, la bozza si pubblica (una `-rc.N` come pre-release, senza diventare «l'ultima»). Chi ha l'app non vede mai un'uscita a metà; se il controllo non torna la bozza resta in GitHub e il passo fallisce.

  `https://github.com/Federico-Anastasi/mango-animation/releases/latest/download/latest.json` è l'indirizzo che l'app interroga: `plugins.updater.endpoints` in `tauri.conf.json`. Il commit pubblico che porta il tag si prepara con `installer/albero-pubblico.mjs`
  (l'uso è nella sua intestazione): costruisce l'albero di un commit senza i file `export-ignore` di `.gitattributes`, lo controlla e si ferma prima di ogni commit.
- **Chi fa un fork** ottiene un installatore con `bun run installer/costruisci.ts`, anche senza chiave (esce senza gli aggiornamenti). Per aggiornare chi lo installa serve una chiave propria:
  `cargo tauri signer generate --ci -p <password> -w %USERPROFILE%\.tauri\mango-animation.key` (scrive anche `mango-animation.key.pub`). Poi in `app/tauri.conf.json` si mettono la chiave pubblica (`plugins.updater.pubkey`: il contenuto
  del file `.pub`) e l'indirizzo degli aggiornamenti del proprio repo (`plugins.updater.endpoints`: `https://github.com/<utente>/<repo>/releases/latest/download/latest.json`). Per le uscite dalle Actions, nell'environment `release`
  del proprio repo vanno i segreti `TAURI_SIGNING_PRIVATE_KEY` (il contenuto di `mango-animation.key`) e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Chi ha già installato l'app originale non riceve gli aggiornamenti del fork: la chiave pubblica è un'altra.
  Le segnalazioni di un fork non devono arrivare al progetto Sentry originale: si costruisce con `MANGO_ANIMATION_SENTRY_DSN=off` (o col DSN di un suo progetto), e in `segnalazione/mod.rs` `NUOVA_ISSUE` punta al proprio repo.
- **La firma** è quella dell'updater di Tauri, non un certificato a pagamento: l'app controlla il pacchetto con la chiave pubblica scritta in `tauri.conf.json` (`plugins.updater.pubkey`) e rifiuta ciò che non è firmato
  con la chiave privata corrispondente. La chiave privata si tiene fuori dal repo (di base in `%USERPROFILE%\.tauri\mango-animation.key`), protetta da una password: chi la perde non può più aggiornare chi ha già installato, e chi la
  ruba firma aggiornamenti per tutti. La password può stare accanto, in `mango-animation.password`, cifrata da Windows per l'utente che l'ha scritta (DPAPI: con un altro utente o su un altro computer non si apre); `costruisci.ts` la apre da sé con PowerShell.
  Una copia della chiave e della password va tenuta anche fuori dal computer che costruisce (un gestore di password). Se la si rifà, si riscrive la `pubkey` prima di pubblicare.
