# La rete in uscita

Parte di `docs/APP.md`.

Ogni chiamata HTTP dell'app (scarichi, controllo del server, invio delle segnalazioni) nasce in `app/src/rete.rs` (`ureq` 3): i certificati sono quelli di Windows (`rustls-platform-verifier`) e non si installa né si spegne
il controllo di nessun certificato. Il proxy si decide per ogni indirizzo, in quest'ordine:
1. verso questo computer (`127.0.0.1`, `localhost`, `::1`) mai il proxy;
2. `NO_PROXY` (voci separate da virgole: `host`, `.dominio`, `*`, modelli come `10.*`) toglie l'host dal proxy, anche quello di Windows;
3. `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY` (anche minuscole) vincono su Windows; con `http://utente:password@proxy:porta` il proxy riceve l'accesso Basic;
4. il proxy di Windows di quell'utente (Impostazioni › Rete › Proxy): lo script di configurazione automatica o il rilevamento (lo risolve WinHTTP), altrimenti il proxy a mano con la sua lista «non usare per».

Non si usano i proxy SOCKS né quelli che vogliono l'accesso di Windows (NTLM, Kerberos). Se la rete tace per 60 s a metà di uno scarico, il giro cade e il successivo riprende da dove era. Quando il certificato di un filtro aziendale non è tra quelli di Windows lo scarico, l'invio e il controllo degli aggiornamenti lo dicono con una frase che spiega cosa chiedere a chi gestisce il
computer, e non riprovano; un proxy che rifiuta o non risponde dice quale proxy.

Il plugin degli aggiornamenti ha la sua rete (`reqwest`, anch'essa con i certificati di Windows): `aggiornamento.rs` gli dà il proxy che `rete.rs` indica per l'indirizzo degli aggiornamenti. Anche `uv`, `bun` e Playwright,
che l'app lancia per scaricare, ricevono `HTTPS_PROXY` e `HTTP_PROXY` dal proxy di Windows se il creator non ne ha già messa una; i loro certificati sono i loro, non quelli di Windows.
Le prove stanno in `rete.rs`, `scarica.rs`, `segnalazione/mod.rs`, `tests/aggiornamento.rs`, con un proxy finto (`app/prove/rete/proxy_finto.rs`: registra i `CONNECT`, inoltra, rifiuta o presenta un certificato
firmato da una radice che nessun computer conosce; la chiave di quella radice non esiste più). La lettura delle impostazioni di Windows è dietro `proxy_di_windows`, che le prove sostituiscono.
