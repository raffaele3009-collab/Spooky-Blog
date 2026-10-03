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

    carta.addEventListener('click', function () {
      const girata = carta.classList.toggle('girata');
      carta.setAttribute('aria-pressed', girata ? 'true' : 'false');
      fronte.setAttribute('aria-hidden', girata ? 'true' : 'false');
      retro.setAttribute('aria-hidden', girata ? 'false' : 'true');
    });
    return carta;
  }

  function disegnaCarte(griglia, lista) {
    const perNumero = {};
    lista.forEach(function (voce) {
      if (voce && voce.n >= 1 && voce.n <= TOTALE_CARTE) perNumero[voce.n] = voce;
    });

    const roma = adessoRoma();
    const adessoTesto = roma.iso + ' ' + roma.ora;
    // Per le carte senza dati nel JSON la data si calcola: n. 12 = 12 ottobre, ecc.
    const primaData = lista.length && lista[0].data ? lista[0].data : roma.iso;
    const anno = primaData.slice(0, 4);

    griglia.textContent = '';
    for (let n = 1; n <= TOTALE_CARTE; n++) {
      const dati = perNumero[n];
      const dataCarta = dati && dati.data ? dati.data : anno + '-10-' + due(n);
      const bloccata = adessoTesto < dataCarta + ' ' + ORA_SBLOCCO;

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
     AVVIO
     ===================================================================== */

  avviaMessaggi();
  avviaBrividi();
  avviaFantasmaApertura();
  avviaFantasmaFineArticolo();
})();
