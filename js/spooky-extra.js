/*
 * Spooky - effetti condivisi da tutte le pagine del sito.
 *
 * Dentro ci sono tre cose:
 *   1) la barra messaggi "il sito sa che ore sono" (con buio e grana di sera/notte)
 *   2) la pagina "31 brividi" con le carte da girare
 *   3) il fantasmino che propone un racconto
 *
 * Per provare tutto senza aspettare l'ora giusta si possono aggiungere
 * questi parametri all'indirizzo (servono solo per i test):
 *   ?ora=03:12          simula l'ora
 *   ?data=2026-10-31    simula la data
 *   ?nuovo=1            fa finta che il visitatore non sia mai passato
 * Esempio: index.html?ora=02:40&data=2026-10-13
 */
(function () {
  'use strict';

  /* =====================================================================
     CONFIGURAZIONE - qui si aggiungono nuove cose copiando una riga
     ===================================================================== */

  // Indirizzo del backend che fornisce i post (e' lo stesso BACKEND_URL
  // usato dalle altre pagine; qui e' ripetuto per non toccare quegli script).
  const API_BASE = 'https://spooky-backend-trtr.onrender.com';

  // ORARI SPECIALI: messaggi che compaiono solo in certi minuti della notte.
  // Hanno la precedenza su tutto il resto.
  // Per aggiungerne uno basta copiare una riga e cambiare:
  //   da / a        -> fascia oraria (formato 'HH:MM', anche l'ultimo minuto conta)
  //   messaggio     -> la frase che compare nella barra
  //   titoloPost    -> (facoltativo) titolo di un racconto: la frase diventa un
  //                    link a quel racconto, cercato per titolo tra i post.
  //                    Se il racconto non esiste, resta solo la frase.
  //   href          -> (facoltativo) un link fisso, al posto del titoloPost
  const ORARI_SPECIALI = [
    { da: '02:40', a: '02:44', messaggio: 'Hai sentito il citofono?', titoloPost: 'Tre colpi' },
    { da: '03:00', a: '03:04', messaggio: 'Il baby monitor si è appena acceso.', titoloPost: 'La ninna nanna' },
    { da: '03:12', a: '03:15', messaggio: 'Controlla la galleria del telefono.', href: '31-brividi.html#n3' }
  ];

  // FASCE ORARIE: quanto buio e quanta grana da pellicola ha il sito.
  //   buio  -> 0 = niente, 0.1 = nero al 10%, ecc.
  //   grana -> 0 = niente, piu' e' alto piu' si vede la grana
  // L'id serve al codice, non cambiarlo.
  const FASCE_ORARIE = [
    { id: 'giorno', da: '06:00', a: '18:59', messaggio: null, buio: 0, grana: 0.04 },
    { id: 'sera', da: '19:00', a: '23:59', messaggio: 'Si sta facendo buio…', buio: 0.1, grana: 0.07 },
    { id: 'notte', da: '00:00', a: '04:59', messaggio: 'Non dovresti leggere a quest’ora.', buio: 0.2, grana: 0.15 },
    { id: 'alba', da: '05:00', a: '05:59', messaggio: 'Sei sopravvissuto alla notte.', buio: 0, grana: 0.04 }
  ];

  // Il 31 ottobre la grana e' ancora piu' forte.
  const GRANA_HALLOWEEN = 0.22;

  // DATE SPECIALI: messaggi legati al giorno.
  // Si mostrano di giorno (06:00-18:59). Di notte vince la fascia oraria,
  // tranne le righe con ancheDiSera: true, che vincono anche la sera.
  // Vale la prima riga che corrisponde, quindi l'ordine conta.
  //   quando(t) -> true se la regola vale oggi (t ha anno, mese, giorno, giornoSettimana)
  //   testo(t)  -> la frase da mostrare
  const DATE_SPECIALI = [
    {
      quando: t => t.mese === 10 && t.giorno === 31,
      testo: () => 'È la notte di Halloween. Chiudi bene la porta.',
      ancheDiSera: true
    },
    {
      quando: t => t.giornoSettimana === 5 && t.giorno === 13,
      testo: () => 'Venerdì 13. Oggi le storie sono più vere del solito.'
    },
    {
      quando: t => t.mese === 10 && t.giorno <= 30,
      testo: t => {
        const notti = 31 - t.giorno;
        return notti === 1 ? 'Manca 1 notte ad Halloween.' : 'Mancano ' + notti + ' notti ad Halloween.';
      }
    }
  ];

  const TESTO_CHI_TORNA = 'Sei tornato. Lo sapevo.';

  /* =====================================================================
     STRUMENTI COMUNI
     ===================================================================== */

  const parametri = new URLSearchParams(location.search);

  function leggiParametro(nome, formato) {
    const valore = parametri.get(nome);
    return valore && formato.test(valore) ? valore : null;
  }

  // Parametri di prova (vedi l'inizio del file)
  const TEST_ORA = leggiParametro('ora', /^([01]?\d|2[0-3]):[0-5]\d$/);
  const TEST_DATA = leggiParametro('data', /^\d{4}-\d{2}-\d{2}$/);
  const VISITATORE_NUOVO = parametri.get('nuovo') === '1';

  function due(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function minutiDa(oraMinuti) {
    const pezzi = oraMinuti.split(':');
    return Number(pezzi[0]) * 60 + Number(pezzi[1]);
  }

  // true se "minuti" cade tra da e a (compreso l'ultimo minuto)
  function dentro(minuti, da, a) {
    return minuti >= minutiDa(da) && minuti < minutiDa(a) + 1;
  }

  // Data e ora "di adesso" sul dispositivo del visitatore (o simulate con ?ora e ?data)
  function adesso() {
    const reale = new Date();
    let anno = reale.getFullYear();
    let mese = reale.getMonth() + 1;
    let giorno = reale.getDate();
    let minuti = reale.getHours() * 60 + reale.getMinutes();

    if (TEST_DATA) {
      const p = TEST_DATA.split('-').map(Number);
      anno = p[0]; mese = p[1]; giorno = p[2];
    }
    if (TEST_ORA) minuti = minutiDa(TEST_ORA);

    return {
      anno: anno,
      mese: mese,
      giorno: giorno,
      giornoSettimana: new Date(anno, mese - 1, giorno).getDay(),
      minuti: minuti,
      iso: anno + '-' + due(mese) + '-' + due(giorno)
    };
  }

  // Data e ora attuali in Italia (Europe/Rome), qualunque sia il fuso del visitatore.
  // Con ?ora e ?data si usano direttamente quei valori.
  function adessoRoma() {
    let iso;
    let ora;
    try {
      const pezzi = {};
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date()).forEach(function (p) { pezzi[p.type] = p.value; });
      iso = pezzi.year + '-' + pezzi.month + '-' + pezzi.day;
      ora = pezzi.hour + ':' + pezzi.minute;
    } catch (errore) {
      const d = new Date();
      iso = d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate());
      ora = due(d.getHours()) + ':' + due(d.getMinutes());
    }
    if (TEST_DATA) iso = TEST_DATA;
    if (TEST_ORA) {
      const m = minutiDa(TEST_ORA);
      ora = due(Math.floor(m / 60)) + ':' + due(m % 60);
    }
    return { iso: iso, ora: ora };
  }

  // localStorage / sessionStorage possono non funzionare (navigazione privata,
  // blocchi del browser): in quel caso il sito deve andare avanti lo stesso.
  function leggiMemoria(tipo, chiave) {
    try {
      return window[tipo].getItem(chiave);
    } catch (errore) {
      return null;
    }
  }

  function scriviMemoria(tipo, chiave, valore) {
    try {
      window[tipo].setItem(chiave, valore);
      return true;
    } catch (errore) {
      return false;
    }
  }

  // I post vengono chiesti al backend una volta sola per pagina e poi condivisi.
  // Se il backend non risponde entro 10 secondi il risultato e' null e le parti
  // che ne hanno bisogno semplicemente non compaiono.
  let promessaPost = null;

  function postDisponibili() {
    if (!promessaPost) {
      promessaPost = new Promise(function (risolvi) {
        const controllo = 'AbortController' in window ? new AbortController() : null;
        const timer = setTimeout(function () {
          if (controllo) controllo.abort();
          risolvi(null);
        }, 10000);

        fetch(API_BASE + '/api/posts', controllo ? { signal: controllo.signal } : {})
          .then(function (risposta) {
            if (!risposta.ok) throw new Error('Risposta ' + risposta.status);
            return risposta.json();
          })
          .then(function (lista) {
            clearTimeout(timer);
            risolvi(Array.isArray(lista) ? lista.filter(function (p) { return p && p._id && p.titolo; }) : null);
          })
          .catch(function () {
            clearTimeout(timer);
            risolvi(null);
          });
      });
    }
    return promessaPost;
  }

  function linkAlPost(post) {
    return 'spooky-blog.html?post=' + encodeURIComponent(post._id);
  }

  const RIDUCI_MOVIMENTO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function creaElemento(tag, classe, testo) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (testo) e.textContent = testo;
    return e;
  }

  // Il fantasmino del sito (lo stesso disegno della barra annunci).
  // I colori si cambiano da css/spooky-extra.css.
  function creaFantasma(classe) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 112');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', classe);

    const corpo = document.createElementNS(SVG_NS, 'path');
    corpo.setAttribute('class', 'spooky-fantasma-corpo');
    corpo.setAttribute('d', 'M50 3 C26 3 11 22 11 46 L11 93 C11 98 14 100 18 99 C23 98 26 95 31 96 C37 97 42 100 50 100 C58 100 63 97 69 96 C74 95 77 98 82 99 C86 100 89 98 89 93 L89 46 C89 22 74 3 50 3 Z');
    svg.appendChild(corpo);

    [37, 63].forEach(function (cx) {
      const occhio = document.createElementNS(SVG_NS, 'ellipse');
      occhio.setAttribute('class', 'spooky-fantasma-occhio');
      occhio.setAttribute('cx', cx);
      occhio.setAttribute('cy', 41);
      occhio.setAttribute('rx', 10.5);
      occhio.setAttribute('ry', 15);
      svg.appendChild(occhio);
    });
    return svg;
  }

  /* =====================================================================
     COMPITO 1 - IL SITO CHE SA CHE ORE SONO
     ===================================================================== */

  const CHIAVE_VISITE = 'spooky_visite';

  // Ricorda la prima visita. Ritorna i dati salvati e se oggi (un giorno
  // diverso dalla prima visita) bisogna salutare chi e' tornato.
  function leggiVisite(oggiIso) {
    if (VISITATORE_NUOVO) return { tornato: false, dati: null };

    let dati = null;
    try {
      dati = JSON.parse(leggiMemoria('localStorage', CHIAVE_VISITE));
    } catch (errore) {
      dati = null;
    }

    if (!dati || !dati.prima) {
      const reale = new Date();
      const oggiReale = reale.getFullYear() + '-' + due(reale.getMonth() + 1) + '-' + due(reale.getDate());
      scriviMemoria('localStorage', CHIAVE_VISITE, JSON.stringify({ prima: oggiReale, salutato: false }));
      return { tornato: false, dati: null };
    }

    return { tornato: dati.prima !== oggiIso && !dati.salutato, dati: dati };
  }

  // Scrive nella pagina quanto buio e quanta grana ci sono ora
  function applicaAtmosfera(buio, grana, halloween) {
    const stile = document.documentElement.style;
    stile.setProperty('--spooky-buio', String(buio));
    stile.setProperty('--spooky-grana', String(grana));
    document.body.classList.toggle('spooky-halloween', halloween);

    if (!document.getElementById('spooky-atmosfera')) {
      const velo = document.createElement('div');
      velo.id = 'spooky-atmosfera';
      velo.setAttribute('aria-hidden', 'true');
      document.body.appendChild(velo);
    }
  }

  // Sceglie il messaggio da mostrare. Priorita':
  //   orari speciali > "chi torna" > date speciali > fascia oraria
  function scegliMessaggio(t, fascia, visite) {
    const speciale = ORARI_SPECIALI.find(function (o) { return dentro(t.minuti, o.da, o.a); });
    if (speciale) {
      return { testo: speciale.messaggio, titoloPost: speciale.titoloPost, href: speciale.href };
    }

    if (visite.tornato) {
      return { testo: TESTO_CHI_TORNA, chiTorna: true };
    }

    const data = DATE_SPECIALI.find(function (d) { return d.quando(t); });
    if (data && (fascia.id === 'giorno' || (data.ancheDiSera && fascia.id === 'sera'))) {
      return { testo: data.testo(t) };
    }

    return fascia.messaggio ? { testo: fascia.messaggio } : null;
  }

  function mostraBarra(messaggio) {
    const annunci = document.querySelector('.announce');
    if (!annunci) return;

    const barra = document.createElement('div');
    barra.className = 'spooky-barra';
    barra.setAttribute('role', 'status');

    const interno = document.createElement('div');
    interno.className = 'spooky-barra-interno';
    interno.textContent = messaggio.testo;
    barra.appendChild(interno);

    annunci.insertAdjacentElement('afterend', barra);

    // Forza il calcolo del layout, poi parte la dissolvenza lenta
    void barra.offsetHeight;
    barra.classList.add('visibile');

    function trasformaInLink(indirizzo) {
      const a = document.createElement('a');
      a.href = indirizzo;
      a.textContent = messaggio.testo;
      interno.textContent = '';
      interno.appendChild(a);
    }

    if (messaggio.href) {
      trasformaInLink(messaggio.href);
    } else if (messaggio.titoloPost) {
      // Il racconto si cerca per titolo: se non c'e', resta solo la frase.
      postDisponibili().then(function (lista) {
        if (!lista) return;
        const titolo = messaggio.titoloPost.trim().toLowerCase();
        const post = lista.find(function (p) { return p.titolo.trim().toLowerCase() === titolo; });
        if (post) trasformaInLink(linkAlPost(post));
      });
    }
  }

  function avviaMessaggi() {
    const t = adesso();
    const fascia = FASCE_ORARIE.find(function (f) { return dentro(t.minuti, f.da, f.a); }) || FASCE_ORARIE[0];
    const halloween = t.mese === 10 && t.giorno === 31;

    applicaAtmosfera(fascia.buio, halloween ? Math.max(fascia.grana, GRANA_HALLOWEEN) : fascia.grana, halloween);

    const visite = leggiVisite(t.iso);
    const messaggio = scegliMessaggio(t, fascia, visite);
    if (!messaggio) return;

    if (messaggio.chiTorna && visite.dati) {
      visite.dati.salutato = true;
      scriviMemoria('localStorage', CHIAVE_VISITE, JSON.stringify(visite.dati));
    }
    mostraBarra(messaggio);
  }

  /* =====================================================================
     COMPITO 2 - LA PAGINA "31 BRIVIDI" CON LE CARTE DA GIRARE
     Le storie stanno in data/brividi.json: per aggiungerne una basta
     aggiungere una riga li' dentro, senza toccare questo codice.
     ===================================================================== */

  const FILE_BRIVIDI = 'data/brividi.json';
  const TOTALE_CARTE = 31;
  // Ora italiana alla quale si apre la carta del giorno
  const ORA_SBLOCCO = '13:00';
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  // true se la carta di quel giorno e' gia' aperta (dalle 13:00 ora italiana)
  function cartaAperta(dataCarta, roma) {
    return roma.iso + ' ' + roma.ora >= dataCarta + ' ' + ORA_SBLOCCO;
  }

  // "2026-10-12" -> "12 ottobre"
  function dataEstesa(iso) {
    const p = iso.split('-').map(Number);
    return p[2] + ' ' + MESI[p[1] - 1];
  }

  // Cerca la parola chiave dentro la frase. Preferisce la parola intera
  // (cosi' "me" non si accende dentro un'altra parola); se non la trova
  // intera usa la prima occorrenza. Ritorna -1 se non c'e'.
  function trovaChiave(testo, chiave) {
    if (!chiave) return -1;
    const minuscolo = testo.toLowerCase();
    const cerca = chiave.toLowerCase();
    const lettera = /[\p{L}\p{N}]/u;
    let da = 0;
    let primo = -1;

    while (true) {
      const i = minuscolo.indexOf(cerca, da);
      if (i === -1) break;
      if (primo === -1) primo = i;
      const prima = i > 0 ? testo.charAt(i - 1) : '';
      const dopo = testo.charAt(i + cerca.length);
      if (!lettera.test(prima) && !lettera.test(dopo)) return i;
      da = i + 1;
    }
    return primo;
  }

  function creaLucchetto() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'carta-lucchetto');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
    return svg;
  }

  function creaCartaBloccata(n, etichetta) {
    const carta = creaElemento('button', 'carta carta-bloccata');
    carta.type = 'button';
    carta.id = 'n' + n;
    carta.setAttribute('aria-disabled', 'true');

    const interna = creaElemento('span', 'carta-interna');
    const fronte = creaElemento('span', 'carta-faccia carta-fronte');
    fronte.appendChild(creaElemento('span', 'carta-numero', 'n. ' + n + '/' + TOTALE_CARTE));

    const centro = creaElemento('span', 'carta-testo carta-testo-centrato');
    centro.appendChild(creaLucchetto());
    centro.appendChild(creaElemento('span', 'carta-bloccata-testo', etichetta));
    fronte.appendChild(centro);
    fronte.appendChild(creaElemento('span', 'carta-suggerimento', ' '));

    interna.appendChild(fronte);
    carta.appendChild(interna);
    return carta;
  }

  function creaCartaAperta(n, dati) {
    const carta = creaElemento('button', 'carta');
    carta.type = 'button';
    carta.id = 'n' + n;
    carta.setAttribute('aria-pressed', 'false');

    const interna = creaElemento('span', 'carta-interna');

    // Fronte: numero, prima frase, invito a girare
    const fronte = creaElemento('span', 'carta-faccia carta-fronte');
    fronte.appendChild(creaElemento('span', 'carta-numero', 'n. ' + n + '/' + TOTALE_CARTE));
    fronte.appendChild(creaElemento('span', 'carta-testo', dati.prima));
    fronte.appendChild(creaElemento('span', 'carta-suggerimento', 'tocca per girare ↻'));

    // Retro: seconda frase con la parola chiave in turchese
    const retro = creaElemento('span', 'carta-faccia carta-retro');
    retro.setAttribute('aria-hidden', 'true');
    const testoRetro = creaElemento('span', 'carta-testo');
    const posizione = trovaChiave(dati.seconda, dati.chiave);
    if (posizione === -1) {
      testoRetro.textContent = dati.seconda;
    } else {
      testoRetro.appendChild(document.createTextNode(dati.seconda.slice(0, posizione)));
      testoRetro.appendChild(creaElemento('span', 'carta-chiave', dati.seconda.slice(posizione, posizione + dati.chiave.length)));
      testoRetro.appendChild(document.createTextNode(dati.seconda.slice(posizione + dati.chiave.length)));
    }
    retro.appendChild(testoRetro);

    const pie = creaElemento('span', 'carta-pie');
    pie.appendChild(creaFantasma('carta-fantasmino'));
    pie.appendChild(creaElemento('span', 'carta-suggerimento', 'tocca per rigirare'));
    retro.appendChild(pie);

    interna.appendChild(fronte);
    interna.appendChild(retro);
    carta.appendChild(interna);

    // Il pulsante "Condividi" sta accanto alla carta (non dentro: un pulsante
    // dentro un altro pulsante non e' valido) e compare solo sul retro
    const scatola = creaElemento('div', 'carta-scatola');
    const condividi = creaElemento('button', 'carta-condividi');
    condividi.type = 'button';
    condividi.hidden = true;
    condividi.setAttribute('aria-label', 'Condividi questo brivido');
    condividi.title = 'Condividi';
    condividi.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></svg>';

    const messaggio = creaElemento('div', 'carta-messaggio');
    messaggio.hidden = true;
    messaggio.setAttribute('role', 'status');
    messaggio.setAttribute('aria-live', 'polite');

    scatola.appendChild(carta);
    scatola.appendChild(condividi);
    scatola.appendChild(messaggio);

    carta.addEventListener('click', function () {
      const girata = carta.classList.toggle('girata');
      carta.setAttribute('aria-pressed', girata ? 'true' : 'false');
      fronte.setAttribute('aria-hidden', girata ? 'true' : 'false');
      retro.setAttribute('aria-hidden', girata ? 'false' : 'true');
      condividi.hidden = !girata;
    });

    let timerMessaggio = null;
    condividi.addEventListener('click', async function () {
      if (condividi.disabled) return;
      condividi.disabled = true;
      // Il link porta proprio a questa carta
      const link = LINK_BLOG + '31-brividi.html#n' + n;
      await eseguiCondivisione(
        function () { return immagineDiUnaCarta(n, dati); },
        function (testo) {
          clearTimeout(timerMessaggio);
          scriviMessaggio(messaggio, testo, link);
          messaggio.hidden = !testo;
          // i messaggi finali spariscono dopo qualche secondo
          if (testo && testo !== MSG_CREO_IMMAGINE) {
            timerMessaggio = setTimeout(function () { messaggio.hidden = true; }, 12000);
          }
        },
        link
      );
      condividi.disabled = false;
    });

    return scatola;
  }

  function disegnaCarte(griglia, lista) {
    const perNumero = {};
    lista.forEach(function (voce) {
      if (voce && voce.n >= 1 && voce.n <= TOTALE_CARTE) perNumero[voce.n] = voce;
    });

    const roma = adessoRoma();
    // Per le carte senza dati nel JSON la data si calcola: n. 12 = 12 ottobre, ecc.
    const primaData = lista.length && lista[0].data ? lista[0].data : roma.iso;
    const anno = primaData.slice(0, 4);

    griglia.textContent = '';
    for (let n = 1; n <= TOTALE_CARTE; n++) {
      const dati = perNumero[n];
      const dataCarta = dati && dati.data ? dati.data : anno + '-10-' + due(n);
      const bloccata = !cartaAperta(dataCarta, roma);

      if (dati && dati.prima && dati.seconda && !bloccata) {
        griglia.appendChild(creaCartaAperta(n, dati));
      } else if (bloccata) {
        griglia.appendChild(creaCartaBloccata(n, 'Si apre il ' + dataEstesa(dataCarta)));
      } else {
        // La data e' arrivata ma la storia non e' ancora stata scritta nel JSON
        griglia.appendChild(creaCartaBloccata(n, 'In arrivo'));
      }
    }
  }

  // Link diretto, per esempio 31-brividi.html#n3: scorre fino alla carta e la evidenzia
  function vaiAllaCartaDelLink() {
    const trovato = /^#n(\d+)$/.exec(location.hash);
    if (!trovato) return;
    const carta = document.getElementById('n' + trovato[1]);
    if (!carta) return;

    carta.scrollIntoView({ block: 'center', behavior: RIDUCI_MOVIMENTO ? 'auto' : 'smooth' });
    carta.classList.add('carta-evidenziata');
    setTimeout(function () { carta.classList.remove('carta-evidenziata'); }, 1200);
  }

  function avviaBrividi() {
    const griglia = document.getElementById('brividi-griglia');
    if (!griglia) return;

    // "no-cache": cosi' le storie nuove si vedono subito, senza aspettare la cache
    fetch(FILE_BRIVIDI, { cache: 'no-cache' })
      .then(function (risposta) {
        if (!risposta.ok) throw new Error('Risposta ' + risposta.status);
        return risposta.json();
      })
      .then(function (lista) {
        disegnaCarte(griglia, Array.isArray(lista) ? lista : []);
        vaiAllaCartaDelLink();
        window.addEventListener('hashchange', vaiAllaCartaDelLink);
      })
      .catch(function () {
        griglia.textContent = '';
        griglia.appendChild(creaElemento('div', 'empty-note', 'Non riesco a caricare le carte al momento. Riprova tra poco.'));
      });
  }

  // La sezione "31 brividi" della home: le ultime carte gia' aperte, nello
  // stesso formato a finestrella delle altre sezioni (chiuse, si aprono con la freccetta).
  const BRIVIDI_IN_HOME = 3;

  function avviaBrividiHome() {
    const contenitore = document.getElementById('home-brividi');
    if (!contenitore) return;

    fetch(FILE_BRIVIDI, { cache: 'no-cache' })
      .then(function (risposta) {
        if (!risposta.ok) throw new Error('Risposta ' + risposta.status);
        return risposta.json();
      })
      .then(function (lista) {
        const roma = adessoRoma();
        const aperte = (Array.isArray(lista) ? lista : [])
          .filter(function (voce) { return voce && voce.n && voce.data && voce.prima && cartaAperta(voce.data, roma); })
          .sort(function (a, b) { return b.n - a.n; })
          .slice(0, BRIVIDI_IN_HOME);

        contenitore.textContent = '';
        if (!aperte.length) {
          contenitore.appendChild(creaElemento('div', 'empty-note', 'Presto il primo brivido!'));
          return;
        }

        aperte.forEach(function (voce) {
          const elemento = creaElemento('div', 'blog-acc-item');
          const riga = creaElemento('div', 'blog-acc-riga');
          const titolo = creaElemento('a', 'blog-acc-titolo', 'Brivido n. ' + voce.n);
          titolo.href = '31-brividi.html#n' + voce.n;

          const freccia = creaElemento('button', 'blog-acc-freccia');
          freccia.type = 'button';
          freccia.setAttribute('aria-expanded', 'false');
          freccia.setAttribute('aria-label', 'Mostra o nascondi l’anteprima');
          freccia.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

          const corpo = creaElemento('div', 'blog-acc-corpo');
          corpo.appendChild(creaElemento('p', 'blog-excerpt', voce.prima));

          freccia.addEventListener('click', function () {
            const apri = !corpo.classList.contains('aperta');
            corpo.classList.toggle('aperta', apri);
            freccia.classList.toggle('aperta', apri);
            freccia.setAttribute('aria-expanded', String(apri));
          });

          riga.appendChild(titolo);
          riga.appendChild(freccia);
          elemento.appendChild(riga);
          elemento.appendChild(corpo);
          contenitore.appendChild(elemento);
        });
      })
      .catch(function () {
        contenitore.textContent = '';
        contenitore.appendChild(creaElemento('div', 'empty-note', 'Non riesco a caricare i brividi al momento.'));
      });
  }

  /* =====================================================================
     COMPITO 3 - IL FANTASMINO SPOOKY
     Sbuca dall'angolo in basso a destra con un fumetto e propone un racconto:
       3a) all'apertura del sito (una volta per visita)
       3b) quando si arriva in fondo a un racconto
     Se i post non si caricano, il fantasmino semplicemente non compare.
     ===================================================================== */

  const ISTANTE_APERTURA_MS = 2500;
  const CHIAVE_APERTURA = 'spooky_fantasma_aperto'; // sessionStorage: "gia' comparso in questa visita"
  const CHIAVE_ULTIMO = 'spooky_ultimo_suggerito'; // localStorage: per proporre un titolo diverso
  const LINK_INSTAGRAM = 'https://www.instagram.com/_spookymanager_/';

  let aperturaGiaMostrata = false; // di riserva, se sessionStorage non funziona
  let fantasmaAttivo = null;

  function eDiNotte() {
    return dentro(adesso().minuti, '00:00', '04:59');
  }

  // Sulla pagina del blog: la vista di un racconto aperto
  function articoloAperto() {
    const vista = document.getElementById('vista-articolo');
    return !!vista && !vista.classList.contains('nascosto');
  }

  function idArticoloCorrente() {
    return new URLSearchParams(location.search).get('post');
  }

  function postCasuale(lista, escludiId) {
    const candidati = lista.filter(function (p) { return p._id !== escludiId; });
    return candidati.length ? candidati[Math.floor(Math.random() * candidati.length)] : null;
  }

  function chiudiFantasma(subito) {
    const f = fantasmaAttivo;
    if (!f) return;
    fantasmaAttivo = null;

    if (subito || RIDUCI_MOVIMENTO) {
      f.remove();
      return;
    }
    f.classList.add('spooky-fantasma-esce');
    setTimeout(function () { f.remove(); }, 600);
  }

  // Titolo del racconto come link. Sulla pagina del blog il racconto si apre
  // sulla stessa pagina e si torna in cima; altrove si cambia pagina.
  function creaLinkPost(post) {
    const a = creaElemento('a', 'spooky-fumetto-link', post.titolo);
    a.href = linkAlPost(post);
    a.addEventListener('click', function (evento) {
      if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
      if (typeof window.mostraArticolo !== 'function') return;

      evento.preventDefault();
      window.mostraArticolo(post._id);
      if (location.search.indexOf(post._id) === -1) {
        // Il racconto non era nella lista della pagina: apriamolo normalmente
        location.href = a.href;
        return;
      }
      chiudiFantasma(false);
    });
    return a;
  }

  // Mostra il fantasmino. "riempi" scrive il contenuto dentro il paragrafo del fumetto.
  function mostraFantasma(riempi) {
    chiudiFantasma(true);

    const contenitore = creaElemento('div', 'spooky-fantasma');
    contenitore.setAttribute('role', 'status');
    contenitore.setAttribute('aria-live', 'polite');

    const fumetto = creaElemento('div', 'spooky-fumetto');
    const chiudi = creaElemento('button', 'spooky-fumetto-chiudi', '✕');
    chiudi.type = 'button';
    chiudi.setAttribute('aria-label', 'Chiudi');
    chiudi.addEventListener('click', function () { chiudiFantasma(false); });

    const testo = creaElemento('p', 'spooky-fumetto-testo');
    riempi(testo);

    fumetto.appendChild(chiudi);
    fumetto.appendChild(testo);
    contenitore.appendChild(fumetto);
    contenitore.appendChild(creaFantasma('spooky-fantasma-img'));
    document.body.appendChild(contenitore);
    fantasmaAttivo = contenitore;
  }

  // "Prova a leggere… «Titolo»" -> testo, link col titolo, testo
  function fraseConTitolo(prima, post, dopo) {
    return function (paragrafo) {
      paragrafo.appendChild(document.createTextNode(prima));
      paragrafo.appendChild(creaLinkPost(post));
      paragrafo.appendChild(document.createTextNode(dopo));
    };
  }

  // 3a - all'apertura del sito
  function avviaFantasmaApertura() {
    if (articoloAperto()) return;
    if (aperturaGiaMostrata) return;
    if (!VISITATORE_NUOVO && leggiMemoria('sessionStorage', CHIAVE_APERTURA)) return;

    // Chiede i post un attimo dopo il caricamento della pagina, cosi' non
    // li rallenta, ma sono pronti quando scatta il momento del fantasmino
    setTimeout(postDisponibili, 900);

    setTimeout(function () {
      if (articoloAperto() || aperturaGiaMostrata) return;

      postDisponibili().then(function (lista) {
        if (!lista || !lista.length) return;
        if (articoloAperto() || aperturaGiaMostrata) return;

        // Un titolo diverso da quello proposto l'ultima volta (se ce n'e' piu' di uno)
        const ultimo = VISITATORE_NUOVO ? null : leggiMemoria('localStorage', CHIAVE_ULTIMO);
        const post = postCasuale(lista, ultimo) || lista[0];

        aperturaGiaMostrata = true;
        scriviMemoria('sessionStorage', CHIAVE_APERTURA, '1');
        if (!VISITATORE_NUOVO) scriviMemoria('localStorage', CHIAVE_ULTIMO, post._id);

        const prima = eDiNotte() ? 'Sei ancora sveglio? Allora leggi… «' : 'Prova a leggere… «';
        mostraFantasma(fraseConTitolo(prima, post, '»'));
      });
    }, ISTANTE_APERTURA_MS);
  }

  // 3b - in fondo a un racconto
  function avviaFantasmaFineArticolo() {
    const contenuto = document.getElementById('articolo-contenuto');
    if (!contenuto || !('IntersectionObserver' in window)) return;

    // Un segnaposto invisibile subito sotto il testo: quando entra nello
    // schermo, il lettore e' arrivato alla fine. (Sta fuori da
    // #articolo-contenuto perche' la pagina riscrive il suo contenuto.)
    const fine = creaElemento('div');
    fine.id = 'spooky-fine-articolo';
    fine.style.height = '1px';
    fine.setAttribute('aria-hidden', 'true');
    contenuto.insertAdjacentElement('afterend', fine);

    const giaProposti = {};

    function fineArticolo() {
      const id = idArticoloCorrente();
      if (!articoloAperto() || !id || giaProposti[id]) return;

      postDisponibili().then(function (lista) {
        if (!lista || !articoloAperto() || idArticoloCorrente() !== id || giaProposti[id]) return;
        giaProposti[id] = true;

        const altro = postCasuale(lista, id);
        if (altro) {
          const prima = eDiNotte() ? 'Non riesci a dormire, vero? Prova «' : 'Ne vuoi un’altra? Prova «';
          mostraFantasma(fraseConTitolo(prima, altro, '».'));
        } else {
          // C'e' solo questo racconto: si rimanda a Instagram
          mostraFantasma(function (paragrafo) {
            paragrafo.appendChild(document.createTextNode('Ti è piaciuta? Ogni giorno una storia nuova su '));
            const a = creaElemento('a', 'spooky-fumetto-link', 'Instagram');
            a.href = LINK_INSTAGRAM;
            a.target = '_blank';
            a.rel = 'noopener';
            paragrafo.appendChild(a);
          });
        }
      });
    }

    const osservatore = new IntersectionObserver(function (voci) {
      if (voci.some(function (v) { return v.isIntersecting; })) fineArticolo();
    });
    osservatore.observe(fine);

    // Quando la pagina cambia racconto riscrive il testo: si ricomincia a osservare
    new MutationObserver(function () {
      osservatore.unobserve(fine);
      osservatore.observe(fine);
    }).observe(contenuto, { childList: true });
  }

  /* =====================================================================
     PARTE 2 - COMPITO 1: LA SCHEDA DEL BROWSER CHE TI CHIAMA
     Quando il visitatore passa a un'altra scheda, il titolo e l'icona
     della scheda lo richiamano. Quando torna, tutto si ripristina.
     ===================================================================== */

  const TITOLO_RICHIAMO = 'Torna qui…';
  const TITOLO_SGUARDO = 'Ti sto guardando.';
  const TITOLO_SGUARDO_NOTTE = 'Non dovresti essere sveglio.';
  const TITOLO_RITORNO = 'Lo sapevo che saresti tornato.';
  const INTERVALLO_TITOLI_MS = 3000; // ogni quanto i due titoli si alternano
  const DURATA_RITORNO_MS = 2500; // quanto resta il titolo "Lo sapevo..." al ritorno

  // L'icona della scheda: il fantasmino con gli occhi, su un quadrato turchese
  // (cosi' si vede sia sulle schede chiare sia su quelle scure). E' un SVG
  // scritto direttamente qui, senza file esterni.
  const ICONA_FANTASMA = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
    '<rect width="128" height="128" rx="26" fill="#149ab5"/>' +
    '<g transform="translate(24 22) scale(.8)">' +
    '<path fill="#fff" d="M50 3 C26 3 11 22 11 46 L11 93 C11 98 14 100 18 99 C23 98 26 95 31 96 C37 97 42 100 50 100 C58 100 63 97 69 96 C74 95 77 98 82 99 C86 100 89 98 89 93 L89 46 C89 22 74 3 50 3 Z"/>' +
    '<ellipse cx="37" cy="41" rx="10.5" ry="15" fill="#0f161b"/>' +
    '<ellipse cx="63" cy="41" rx="10.5" ry="15" fill="#0f161b"/>' +
    '</g></svg>'
  );

  function avviaSchedaChiama() {
    let inModifica = false; // true da quando cambiamo titolo/icona fino al ripristino
    let titoloOriginale = '';
    let iconaOriginale = null; // l'icona che la pagina aveva (se ne aveva una)
    let iconaCreata = null; // l'icona che aggiungiamo noi se la pagina non ne ha
    let timerAlterna = null;
    let timerRitorno = null;

    function fermaTimer() {
      clearInterval(timerAlterna);
      clearTimeout(timerRitorno);
      timerAlterna = null;
      timerRitorno = null;
    }

    function mettiIconaFantasma() {
      const esistente = document.querySelector('link[rel~="icon"]');
      if (esistente && esistente !== iconaCreata) {
        iconaOriginale = { elemento: esistente, href: esistente.getAttribute('href'), tipo: esistente.getAttribute('type') };
        esistente.setAttribute('href', ICONA_FANTASMA);
        esistente.setAttribute('type', 'image/svg+xml');
      } else if (!esistente) {
        iconaCreata = document.createElement('link');
        iconaCreata.rel = 'icon';
        iconaCreata.type = 'image/svg+xml';
        iconaCreata.href = ICONA_FANTASMA;
        document.head.appendChild(iconaCreata);
      }
    }

    function rimettiIconaOriginale() {
      if (iconaOriginale) {
        const e = iconaOriginale.elemento;
        if (iconaOriginale.href === null) e.removeAttribute('href'); else e.setAttribute('href', iconaOriginale.href);
        if (iconaOriginale.tipo === null) e.removeAttribute('type'); else e.setAttribute('type', iconaOriginale.tipo);
        iconaOriginale = null;
      }
      if (iconaCreata) {
        iconaCreata.remove();
        iconaCreata = null;
      }
    }

    function ripristina() {
      document.title = titoloOriginale;
      rimettiIconaOriginale();
      inModifica = false;
    }

    function titoloSguardo() {
      return eDiNotte() ? TITOLO_SGUARDO_NOTTE : TITOLO_SGUARDO;
    }

    // Il visitatore e' andato su un'altra scheda
    function schedaNascosta() {
      fermaTimer();
      if (!inModifica) {
        titoloOriginale = document.title;
        inModifica = true;
      }
      mettiIconaFantasma();
      document.title = TITOLO_RICHIAMO;

      let mostraRichiamo = true;
      timerAlterna = setInterval(function () {
        mostraRichiamo = !mostraRichiamo;
        document.title = mostraRichiamo ? TITOLO_RICHIAMO : titoloSguardo();
      }, INTERVALLO_TITOLI_MS);
    }

    // Il visitatore e' tornato: via i timer che alternano i titoli
    function schedaVisibile() {
      fermaTimer();
      if (!inModifica) return;
      document.title = TITOLO_RITORNO;
      timerRitorno = setTimeout(function () {
        timerRitorno = null;
        ripristina();
      }, DURATA_RITORNO_MS);
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) schedaNascosta(); else schedaVisibile();
    });

    // Pagina aperta direttamente in una scheda in secondo piano
    if (document.hidden) schedaNascosta();
  }

  /* =====================================================================
     PARTE 2 - COMPITO 2: LA CANDELA CHE SI CONSUMA
     Solo nella vista di un racconto (spooky-blog.html): una candela in alto
     a destra che si consuma man mano che si legge e si spegne in fondo.
     ===================================================================== */

  // Il disegno della candela. Le misure sono nello spazio 20 x 70 del disegno;
  // il codice sotto sposta cera, stoppino e fiamma man mano che si legge.
  const CERA_BASE = 67; // dove poggia la candela
  const CERA_PIENA = 39; // altezza della cera a inizio racconto
  const CERA_FINITA = 3; // altezza della cera a fine racconto

  const CANDELA_SVG =
    '<svg viewBox="0 0 20 70" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<radialGradient id="spooky-alone-fiamma"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="spooky-colore-fiamma" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a1f"/><stop offset=".6" stop-color="#ffc233"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>' +
    '</defs>' +
    '<ellipse cx="10" cy="67" rx="8.5" ry="2.2" fill="#3b4348"/>' +
    '<rect class="candela-cera" x="4" y="28" width="12" height="39" rx="1.6" fill="#e6dfca"/>' +
    '<rect class="candela-ombra" x="12.5" y="28" width="3.5" height="39" rx="1.6" fill="#c9bfa3" opacity=".7"/>' +
    '<g class="candela-alto" transform="translate(0 28)">' +
    '<line x1="10" y1="0" x2="10" y2="-4.5" stroke="#3a2f28" stroke-width="1.2" stroke-linecap="round"/>' +
    '<g class="candela-fiamma" transform="translate(10 -4)">' +
    '<circle class="candela-alone" cy="-7" r="11" fill="url(#spooky-alone-fiamma)"/>' +
    '<path class="candela-fiamma-corpo" d="M0 -15 C3.6 -10 4.4 -5 0 -0.5 C-4.4 -5 -3.6 -10 0 -15Z" fill="url(#spooky-colore-fiamma)"/>' +
    '<path d="M0 -8 C1.4 -6 1.6 -3.5 0 -1.8 C-1.6 -3.5 -1.4 -6 0 -8Z" fill="#fff6c8" opacity=".85"/>' +
    '</g>' +
    '<g class="candela-fumo" transform="translate(10 -4.5)">' +
    '<path d="M0 0 C-3 -4 3 -7 0 -11 C-3 -15 3 -18 0 -23" fill="none" stroke="#b9bec2" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M2.2 0 C5 -5 -1 -8 2.2 -13" fill="none" stroke="#d3d6d8" stroke-width="1.3" stroke-linecap="round"/>' +
    '</g>' +
    '</g>' +
    '</svg>';

  function avviaCandela() {
    const vista = document.getElementById('vista-articolo');
    const contenuto = document.getElementById('articolo-contenuto');
    if (!vista || !contenuto) return;

    const candela = creaElemento('div', 'spooky-candela');
    candela.id = 'spooky-candela';
    candela.setAttribute('aria-hidden', 'true');
    candela.innerHTML = CANDELA_SVG;
    document.body.appendChild(candela);

    const cera = candela.querySelector('.candela-cera');
    const ombra = candela.querySelector('.candela-ombra');
    const alto = candela.querySelector('.candela-alto');
    const intestazione = document.querySelector('header');

    let spenta = false;
    let inAttesa = false;

    function sistemaCera(letto) {
      const altezza = CERA_PIENA - (CERA_PIENA - CERA_FINITA) * letto;
      const y = CERA_BASE - altezza;
      cera.setAttribute('y', y);
      cera.setAttribute('height', altezza);
      ombra.setAttribute('y', y);
      ombra.setAttribute('height', altezza);
      alto.setAttribute('transform', 'translate(0 ' + y + ')');
    }

    // Quanto del testo e' stato letto: 0 quando l'inizio del racconto arriva
    // sotto l'intestazione, 1 quando la fine del testo arriva in fondo allo schermo
    function calcola() {
      inAttesa = false;

      const aperta = articoloAperto();
      candela.classList.toggle('visibile', aperta);
      if (!aperta) return;

      const sotto = intestazione ? intestazione.getBoundingClientRect().bottom : 0;
      candela.style.top = Math.round(sotto + 10) + 'px';

      const r = contenuto.getBoundingClientRect();
      const daScorrere = r.height - (window.innerHeight - sotto);
      let letto;
      if (daScorrere <= 0) {
        letto = r.bottom <= window.innerHeight ? 1 : 0; // testo corto: tutto sullo schermo
      } else {
        letto = (sotto - r.top) / daScorrere;
      }
      letto = Math.min(1, Math.max(0, letto));
      sistemaCera(letto);

      // Si spegne in fondo; se si torna su si riaccende (con un po' di margine
      // per non farla tremolare avanti e indietro)
      if (!spenta && letto >= 0.995) {
        spenta = true;
        candela.classList.add('spenta');
      } else if (spenta && letto < 0.985) {
        spenta = false;
        candela.classList.remove('spenta');
      }
    }

    // Un solo calcolo per ogni "fotogramma", anche se gli eventi di scroll sono tanti
    function programma() {
      if (inAttesa) return;
      inAttesa = true;
      requestAnimationFrame(calcola);
    }

    window.addEventListener('scroll', programma, { passive: true });
    window.addEventListener('resize', programma);
    // La pagina apre/chiude la vista del racconto e riscrive il testo: si ricalcola
    new MutationObserver(programma).observe(vista, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(programma).observe(contenuto, { childList: true });
    programma();
  }

  /* =====================================================================
     PARTE 2 - COMPITO 3: CONDIVIDI IL BRIVIDO
     In fondo a ogni racconto un pulsante crea un'immagine 9:16 (pronta per le
     stories di Instagram) con una frase del racconto. Sul telefono apre il
     menu di condivisione, altrimenti scarica il file.
     Tutto si disegna su un <canvas>: nessun servizio esterno.
     ===================================================================== */

  const MAX_FRASE = 220; // oltre questa lunghezza la frase scelta in automatico viene accorciata
  const MAX_FRASE_SEGNATA = 400; // limite piu' largo per la frase scelta con data-brivido
  const NOME_FILE_IMMAGINE = 'spooky-brivido.png';
  const PROFILO_INSTAGRAM = '@_spookymanager_';
  const INDIRIZZO_SITO = 'raffaele3009-collab.github.io/Spooky-Blog';
  const NOME_BLOG = 'Spooky Blog';
  // La home del blog: e' il link che accompagna l'immagine quando non c'e' un contenuto preciso,
  // ed e' anche la base per i link a un racconto o a una carta
  const LINK_BLOG = 'https://' + INDIRIZZO_SITO + '/';
  // Gli stessi caratteri "macchina da scrivere" del resto del sito
  const FONT_IMMAGINE = '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", "Courier New", Courier, monospace';
  const IMMAGINE_L = 1080;
  const IMMAGINE_A = 1920;
  const ZONA_SICURA = 250; // spazio da lasciare vuoto in alto e in basso (stories di Instagram)
  const COLORE_ACCENTO = '#149ab5';
  const PERCORSO_FANTASMA = 'M50 3 C26 3 11 22 11 46 L11 93 C11 98 14 100 18 99 C23 98 26 95 31 96 C37 97 42 100 50 100 C58 100 63 97 69 96 C74 95 77 98 82 99 C86 100 89 98 89 93 L89 46 C89 22 74 3 50 3 Z';

  function normalizzaTesto(testo) {
    return String(testo).replace(/\s+/g, ' ').trim();
  }

  // La prima frase di un testo: fino al primo punto, punto esclamativo,
  // interrogativo o puntini (con le eventuali virgolette di chiusura).
  function primaFrase(testo) {
    const trovata = /^(.+?[.!?…]+["'»”’)]*)(?=\s|$)/.exec(testo);
    return trovata ? trovata[1] : testo;
  }

  // Se la frase e' troppo lunga la taglia all'ultima parola intera e aggiunge "…"
  function accorciaFrase(frase, massimo) {
    if (frase.length <= massimo) return frase;
    const spazio = frase.lastIndexOf(' ', massimo - 1);
    const taglio = spazio > massimo / 2 ? spazio : massimo;
    return frase.slice(0, taglio).replace(/[\s,;:—-]+$/, '') + '…';
  }

  // Quale frase mettere nell'immagine:
  //   - se nel racconto c'e' un elemento con data-brivido, quel testo
  //   - altrimenti la prima frase (mai l'ultima: rivelerebbe il finale)
  function fraseDaCondividere(contenuto) {
    const segnata = contenuto.querySelector('[data-brivido]');
    const testoSegnato = segnata ? normalizzaTesto(segnata.textContent) : '';
    if (testoSegnato) return accorciaFrase(testoSegnato, MAX_FRASE_SEGNATA);

    // innerText tiene separati i paragrafi, cosi' la prima frase non si attacca alla seconda
    const testo = normalizzaTesto(contenuto.innerText || contenuto.textContent);
    return accorciaFrase(primaFrase(testo), MAX_FRASE);
  }

  // Divide la frase in parole e segna in turchese quelle tra virgolette
  function paroleColorate(frase) {
    let dentro = false;
    return frase.split(' ').filter(Boolean).map(function (parola) {
      let colorata = dentro;
      for (const lettera of parola) {
        if (lettera === '«' || lettera === '“') {
          dentro = true;
          colorata = true;
        } else if (lettera === '"') {
          dentro = !dentro;
          if (dentro) colorata = true;
        } else if (lettera === '»' || lettera === '”') {
          dentro = false;
        }
      }
      return { testo: parola, colore: colorata ? COLORE_ACCENTO : '#ffffff' };
    });
  }

  // Manda a capo le parole in righe larghe al massimo "larghezzaMax"
  function spezzaInRighe(ctx, parole, larghezzaMax) {
    const spazio = ctx.measureText(' ').width;
    const righe = [];
    let corrente = [];
    let larghezza = 0;

    parole.forEach(function (parola) {
      const w = ctx.measureText(parola.testo).width;
      const nuova = corrente.length ? larghezza + spazio + w : w;
      if (corrente.length && nuova > larghezzaMax) {
        righe.push({ parole: corrente, larghezza: larghezza });
        corrente = [parola];
        larghezza = w;
      } else {
        corrente.push(parola);
        larghezza = nuova;
      }
    });
    if (corrente.length) righe.push({ parole: corrente, larghezza: larghezza });
    return righe;
  }

  // Disegna le righe centrate, parola per parola (ognuna col suo colore)
  function disegnaRighe(ctx, righe, yIniziale, altezzaRiga) {
    const spazio = ctx.measureText(' ').width;
    righe.forEach(function (riga, i) {
      let x = (IMMAGINE_L - riga.larghezza) / 2;
      const y = yIniziale + i * altezzaRiga + altezzaRiga / 2;
      riga.parole.forEach(function (parola) {
        ctx.fillStyle = parola.colore;
        ctx.fillText(parola.testo, x, y);
        x += ctx.measureText(parola.testo).width + spazio;
      });
    });
  }

  function disegnaSfondo(ctx) {
    // Fondo nero con un leggero chiarore al centro
    const fondo = ctx.createRadialGradient(IMMAGINE_L / 2, 900, 60, IMMAGINE_L / 2, 960, 1250);
    fondo.addColorStop(0, '#1a1e20');
    fondo.addColorStop(0.55, '#0c0e0f');
    fondo.addColorStop(1, '#000000');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, IMMAGINE_L, IMMAGINE_A);

    // Grana da pellicola: un riquadro di rumore ripetuto su tutta l'immagine
    const lato = 512;
    const riquadro = document.createElement('canvas');
    riquadro.width = lato;
    riquadro.height = lato;
    const rctx = riquadro.getContext('2d');
    const pixel = rctx.createImageData(lato, lato);
    for (let i = 0; i < pixel.data.length; i += 4) {
      // Pochi livelli di grigio: la grana si vede lo stesso e il file pesa un po' meno
      const v = Math.floor(Math.random() * 8) * 36;
      pixel.data[i] = v;
      pixel.data[i + 1] = v;
      pixel.data[i + 2] = v;
      pixel.data[i + 3] = 255;
    }
    rctx.putImageData(pixel, 0, 0);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = ctx.createPattern(riquadro, 'repeat');
    ctx.fillRect(0, 0, IMMAGINE_L, IMMAGINE_A);
    ctx.globalAlpha = 1;

    // Vignettatura: i bordi si scuriscono
    const vignetta = ctx.createRadialGradient(IMMAGINE_L / 2, IMMAGINE_A / 2, 450, IMMAGINE_L / 2, IMMAGINE_A / 2, 1150);
    vignetta.addColorStop(0, 'rgba(0,0,0,0)');
    vignetta.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = vignetta;
    ctx.fillRect(0, 0, IMMAGINE_L, IMMAGINE_A);
  }

  function disegnaFantasmaSuTela(ctx, centroX, alto, scala) {
    ctx.save();
    ctx.translate(centroX - 50 * scala, alto);
    ctx.scale(scala, scala);
    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(PERCORSO_FANTASMA));
    ctx.fillStyle = '#000000';
    [37, 63].forEach(function (cx) {
      ctx.beginPath();
      ctx.ellipse(cx, 41, 10.5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Crea l'immagine 1080 x 1920 e la restituisce come file PNG (un "blob").
  //   etichetta -> la scritta piccola e grigia in alto
  //   blocchi   -> uno o piu' blocchi di parole ({testo, colore}); tra un blocco e l'altro c'e' uno stacco
  //   sotto     -> (facoltativo) la riga piu' piccola sotto il testo, per esempio il titolo del racconto
  function creaImmagine(opzioni) {
    const etichetta = opzioni.etichetta;
    const blocchi = opzioni.blocchi;
    const sotto = opzioni.sotto || '';

    // Aspetta i caratteri del sito (ma non piu' di un secondo e mezzo)
    const caratteri = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })])
      : Promise.resolve();

    return caratteri.then(function () {
      const tela = document.createElement('canvas');
      tela.width = IMMAGINE_L;
      tela.height = IMMAGINE_A;
      const ctx = tela.getContext('2d');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';

      disegnaSfondo(ctx);

      // In alto, piccolo e grigio
      ctx.font = '400 34px ' + FONT_IMMAGINE;
      ctx.fillStyle = '#8a9296';
      ctx.textAlign = 'center';
      ctx.fillText(etichetta, IMMAGINE_L / 2, ZONA_SICURA + 50);
      ctx.textAlign = 'left';

      // Il testo: grande, finche' sta nello spazio disponibile
      const larghezzaMax = IMMAGINE_L - 2 * 110;
      const altezzaMaxFrase = 680; // cosi' resta sempre aria tra il testo e il fantasmino in basso
      let dimensione = 78;
      let righePerBlocco;
      let altezzaRiga;
      let stacco; // spazio tra un blocco e il successivo
      let altezzaFrase;
      for (; dimensione >= 34; dimensione -= 2) {
        ctx.font = '400 ' + dimensione + 'px ' + FONT_IMMAGINE;
        righePerBlocco = blocchi.map(function (parole) { return spezzaInRighe(ctx, parole, larghezzaMax); });
        altezzaRiga = Math.round(dimensione * 1.38);
        stacco = Math.round(altezzaRiga * 0.9);
        const righeTotali = righePerBlocco.reduce(function (somma, righe) { return somma + righe.length; }, 0);
        altezzaFrase = righeTotali * altezzaRiga + (blocchi.length - 1) * stacco;
        if (altezzaFrase <= altezzaMaxFrase) break;
      }

      // Sotto il testo, piu' piccolo (per esempio il titolo del racconto)
      ctx.font = '400 40px ' + FONT_IMMAGINE;
      const righeSotto = sotto ? spezzaInRighe(ctx, paroleDaTesto(sotto), larghezzaMax) : [];
      const altezzaSotto = righeSotto.length * 54;

      const distanza = sotto ? 70 : 0;
      const totale = altezzaFrase + distanza + altezzaSotto;
      let y = Math.max(ZONA_SICURA + 130, 900 - totale / 2);

      ctx.font = '400 ' + dimensione + 'px ' + FONT_IMMAGINE;
      righePerBlocco.forEach(function (righe, i) {
        disegnaRighe(ctx, righe, y, altezzaRiga);
        y += righe.length * altezzaRiga + (i < righePerBlocco.length - 1 ? stacco : 0);
      });

      if (righeSotto.length) {
        ctx.font = '400 40px ' + FONT_IMMAGINE;
        disegnaRighe(ctx, righeSotto, y + distanza, 54);
      }

      // In basso: fantasmino, profilo Instagram e indirizzo del sito
      disegnaFantasmaSuTela(ctx, IMMAGINE_L / 2, IMMAGINE_A - ZONA_SICURA - 255, 1.15);
      ctx.textAlign = 'center';
      ctx.font = '400 46px ' + FONT_IMMAGINE;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(PROFILO_INSTAGRAM, IMMAGINE_L / 2, IMMAGINE_A - ZONA_SICURA - 62);
      ctx.font = '400 28px ' + FONT_IMMAGINE;
      ctx.fillStyle = '#8a9296';
      ctx.fillText(INDIRIZZO_SITO, IMMAGINE_L / 2, IMMAGINE_A - ZONA_SICURA - 18);

      return new Promise(function (risolvi, rifiuta) {
        tela.toBlob(function (blob) {
          if (blob) risolvi(blob); else rifiuta(new Error('Immagine non creata'));
        }, 'image/png');
      });
    });
  }

  // Parole di un testo semplice, tutte dello stesso colore (di solito grigio chiaro, per il titolo)
  function paroleDaTesto(testo, colore) {
    return testo.split(' ').filter(Boolean).map(function (parola) {
      return { testo: parola, colore: colore || '#c9d0d3' };
    });
  }

  function scaricaImmagine(blob) {
    const indirizzo = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = indirizzo;
    a.download = NOME_FILE_IMMAGINE;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(indirizzo); }, 4000);
  }

  // Sul telefono apre il menu di condivisione (da li' si sceglie Instagram);
  // dove non si puo', scarica il file. Ritorna 'condiviso', 'annullato' o 'scaricato'.
  // "link" e' dove porta il link che accompagna l'immagine (la home se non indicato).
  async function condividiImmagine(blob, link) {
    const file = new File([blob], NOME_FILE_IMMAGINE, { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        // Il link sta dentro il testo: nelle app di messaggi e nei post diventa cliccabile da solo
        await navigator.share({
          files: [file],
          title: NOME_BLOG,
          text: NOME_BLOG + ': ' + (link || LINK_BLOG) + '\nTagga ' + PROFILO_INSTAGRAM
        });
        return 'condiviso';
      } catch (errore) {
        if (errore && errore.name === 'AbortError') return 'annullato'; // il lettore ha chiuso il menu
        // qualunque altro problema: si ripiega sul download
      }
    }
    scaricaImmagine(blob);
    return 'scaricato';
  }

  const MSG_CREO_IMMAGINE = 'Sto evocando l’immagine…';
  const MSG_IMMAGINE_SALVATA = 'Immagine salvata. Pubblicala nelle tue stories e tagga ' + PROFILO_INSTAGRAM + '.';
  const MSG_ERRORE_IMMAGINE = 'Non ci sono riuscito, riprova.';

  // Scrive un messaggio nel suo riquadro. Dopo il salvataggio aggiunge anche
  // "Spooky Blog" come link cliccabile, da incollare per esempio nello sticker Link delle stories.
  function scriviMessaggio(elemento, testo, link) {
    elemento.textContent = testo;
    if (testo === MSG_IMMAGINE_SALVATA) {
      elemento.appendChild(document.createTextNode(' Link del blog: '));
      const a = creaElemento('a', 'spooky-messaggio-link', NOME_BLOG);
      a.href = link || LINK_BLOG;
      a.target = '_blank';
      a.rel = 'noopener';
      elemento.appendChild(a);
    }
  }

  // Il percorso completo: crea l'immagine, poi la condivide o la scarica.
  // "comunica" riceve i messaggi da mostrare (stringa vuota = nessun messaggio).
  async function eseguiCondivisione(generaImmagine, comunica, link) {
    comunica(MSG_CREO_IMMAGINE);
    try {
      const immagine = await generaImmagine();
      const esito = await condividiImmagine(immagine, link);
      comunica(esito === 'scaricato' ? MSG_IMMAGINE_SALVATA : '');
    } catch (errore) {
      comunica(MSG_ERRORE_IMMAGINE);
    }
  }

  // Le parole di una frase, con quelle che toccano la parola chiave in turchese
  function paroleConChiave(testo, chiave) {
    const inizioChiave = trovaChiave(testo, chiave);
    const fineChiave = inizioChiave === -1 ? -1 : inizioChiave + chiave.length;
    const parole = [];
    const unaParola = /\S+/g;
    let trovata;
    while ((trovata = unaParola.exec(testo))) {
      const tocca = inizioChiave !== -1 && trovata.index < fineChiave && trovata.index + trovata[0].length > inizioChiave;
      parole.push({ testo: trovata[0], colore: tocca ? COLORE_ACCENTO : '#ffffff' });
    }
    return parole;
  }

  // L'immagine di una carta di "31 brividi": prima frase, poi seconda con la parola chiave in turchese
  function immagineDiUnaCarta(n, dati) {
    return creaImmagine({
      etichetta: '31 brividi · n. ' + n + '/' + TOTALE_CARTE,
      blocchi: [paroleDaTesto(dati.prima, '#ffffff'), paroleConChiave(dati.seconda, dati.chiave)]
    });
  }

  function avviaCondividi() {
    const contenuto = document.getElementById('articolo-contenuto');
    const titolo = document.getElementById('articolo-titolo');
    if (!contenuto || !titolo) return;

    const blocco = creaElemento('div', 'spooky-condividi');
    const pulsante = creaElemento('button', 'spooky-condividi-pulsante', 'Condividi il brivido');
    pulsante.type = 'button';
    const nota = creaElemento('div', 'spooky-condividi-nota', 'Crea un’immagine per le tue stories e tagga ' + PROFILO_INSTAGRAM);
    const messaggio = creaElemento('div', 'spooky-condividi-messaggio');
    messaggio.setAttribute('role', 'status');
    messaggio.setAttribute('aria-live', 'polite');
    blocco.appendChild(pulsante);
    blocco.appendChild(nota);
    blocco.appendChild(messaggio);

    // Subito sotto il testo (e il suo segnaposto di fine), prima del box Instagram
    const dopo = document.getElementById('spooky-fine-articolo') || contenuto;
    dopo.insertAdjacentElement('afterend', blocco);

    pulsante.addEventListener('click', async function () {
      if (pulsante.disabled) return;
      pulsante.disabled = true;
      pulsante.textContent = MSG_CREO_IMMAGINE;
      messaggio.textContent = '';

      // Il link porta proprio a questo racconto (se non si riconosce, alla home)
      const id = idArticoloCorrente();
      const link = id ? LINK_BLOG + 'spooky-blog.html?post=' + encodeURIComponent(id) : LINK_BLOG;

      await eseguiCondivisione(
        function () {
          return creaImmagine({
            etichetta: '·Racconti dal Buio·',
            blocchi: [paroleColorate(fraseDaCondividere(contenuto))],
            sotto: '— «' + normalizzaTesto(titolo.textContent) + '»'
          });
        },
        function (testo) { if (testo !== MSG_CREO_IMMAGINE) scriviMessaggio(messaggio, testo, link); },
        link
      );

      pulsante.disabled = false;
      pulsante.textContent = 'Condividi il brivido';
    });

    // Quando si passa a un altro racconto il messaggio precedente non vale piu'
    new MutationObserver(function () { messaggio.textContent = ''; }).observe(contenuto, { childList: true });
  }

  /* =====================================================================
     AVVIO
     ===================================================================== */

  avviaMessaggi();
  avviaBrividi();
  avviaBrividiHome();
  avviaFantasmaApertura();
  avviaFantasmaFineArticolo();
  avviaSchedaChiama();
  avviaCandela();
  avviaCondividi();
})();
