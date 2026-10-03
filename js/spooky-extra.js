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
     AVVIO
     ===================================================================== */

  avviaMessaggi();
})();
