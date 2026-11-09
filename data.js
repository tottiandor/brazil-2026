// Brazília 2026 · nov. 12–23. Minden idő helyi idő (Rio és Salvador: UTC−3), kivéve ahol a nap "tz"-je mást mond.
// Szerkesztés: a napokat itt kell bővíteni, ha lesz program. Az "events" sorrendjét az időpont adja.

const TRAVELLERS = ['András', 'Barbara'];

// Fotók a Wikimedia Commonsról (a fájl oldalán a pontos licenc és szerző).
const PHOTOS = {
  rio: { file: 'Contrasts of Rio de Janeiro - Rocinha, Ipanema, and Mountains at Sunrise.jpg', by: 'Donatas Dabravolskas' },
  ipanema: { file: 'Rio de Janeiro Ipanema & Leblon 173 Feb 2006.JPG', by: 'Mario Roberto Durán Ortiz' },
  copacabana: { file: 'Copacabana Beach.jpg', by: 'László Ilyés' },
  urca: { file: 'Bondinho descendo o Morro da Urca.jpg', by: 'Arthur Jacob' },
  rionight: { file: 'Rio de Janeiro night.jpg', by: 'Mark Goble' },
  pelourinho: { file: 'Centro Histórico de Salvador Bahia Largo do Pelourinho 2019-6501.jpg', by: 'Paul R. Burley', lic: 'CC BY-SA 4.0' },
  pelo2: { file: 'View over the Pelourinho District - Salvador - Brazil 02.jpg', by: 'Adam Jones' },
  farol: { file: 'Salvador BA.jpg', by: 'Fotos Gov/Ba', lic: 'CC BY 2.0' },
  moqueca: { file: 'Moqueca.jpg', by: 'Gilrovina', lic: 'CC BY-SA 4.0' },
  cristo: { file: 'Christ the Redeemer - Cristo Redentor.jpg', by: 'Arne Müseler', lic: 'CC BY-SA 3.0 DE' },
  selaron: { file: 'Colorful Selaron Stairs 3.jpg', by: 'Donatas Dabravolskas', lic: 'CC BY-SA 4.0' },
  lacerda: { file: 'Elevador Lacerda Salvador Bahia 2019-0359.jpg', by: 'Paul R. Burley', lic: 'CC BY-SA 4.0' },
  saofrancisco: { file: 'Igreja e Convento de São Francisco (Salvador - Bahia).jpg', by: 'Larissa Thans Carneiro', lic: 'CC BY-SA 4.0' },
  bonfim: { file: 'Bonfim Church, Salvador 20150720-DSC05483.JPG', by: 'Matti Blume', lic: 'CC BY-SA 4.0' },
};

// Időjárás-pontok (max. 4 tizedes, a MET Norway kérése szerint).
const WEATHER_LOCS = {
  rio: [-22.9839, -43.2045],
  salvador: [-12.9777, -38.5016],
  budapest: [47.4979, 19.0402],
};
const LOC_NAME = { rio: 'Rio de Janeiro', salvador: 'Salvador', budapest: 'Budapest' };

// A szállások pontos címe szándékosan nincs az oldalon. A koordináta kerekített (kb. 100 m),
// csak a távolságokhoz kell. Az utolsó riói éjszakára (nov. 21→22.) szándékosan nincs sor:
// helyben foglaljuk, úgyhogy a 10-11. napon az ipanemai koordináta a távolság-referencia.
const STAYS = [
  { from: '2026-11-13', to: '2026-11-17', city: 'rio', name: 'Airbnb, Ipanema', ll: [-22.983, -43.204], checkin: '14:00', checkout: '11:00' },
  { from: '2026-11-17', to: '2026-11-21', city: 'salvador', name: 'Airbnb, Ondina', ll: [-13.010, -38.510], checkin: '15:00', checkout: '11:00' },
];
// Ha egy városban még nincs szállás, innen számoljuk a távolságot.
const DIST_FALLBACK = {
  rio: { ll: [-22.983, -43.204], label: 'az ipanemai szállástól' },
  salvador: { ll: [-13.0102, -38.5329], label: 'a Farol da Barrától' },
};

// Hosszú repülések: a "Most" kártya ilyenkor a járatot mutatja.
const IN_FLIGHT = [
  { no: 'LH500', route: 'Frankfurt → Rio de Janeiro', dep: '2026-11-12T22:15:00+01:00', arr: '2026-11-13T06:10:00-03:00', land: 'péntek 06:10-kor (riói idő), otthon 10:10' },
  { no: 'LH501', route: 'Rio de Janeiro → Frankfurt', dep: '2026-11-22T15:40:00-03:00', arr: '2026-11-23T06:55:00+01:00', land: 'hétfő 06:55-kor (frankfurti idő)' },
  { no: 'LA4692', route: 'Rio → Salvador', dep: '2026-11-17T15:00:00-03:00', arr: '2026-11-17T17:00:00-03:00', land: '17:00-kor' },
  { no: 'LA3697', route: 'Salvador → Rio', dep: '2026-11-21T05:15:00-03:00', arr: '2026-11-21T07:20:00-03:00', land: '07:20-kor' },
];

const TRIP_START = new Date('2026-11-12T18:35:00+01:00');
const TRIP_END = new Date('2026-11-23T23:59:59+01:00');

// Figyelmeztetések a lap tetején, "until"-ig látszanak.
const ALERTS = [
  { day: 2, until: '2026-11-13T14:00:00-03:00', text: 'Pénteken 06:10-kor landolunk, a szállás csak 14:00-tól a miénk. Kb. 8 óra lyuk: kérdezzük meg a szállásadót a korai érkezésről vagy a csomagokról.' },
  { day: 10, from: '2026-11-19T00:00:00-03:00', until: '2026-11-21T05:15:00-03:00', text: 'Szombat hajnalban 05:15-kor repülünk Salvadorból, kb. 03:00-kor indulni kell a reptérre.' },
];

const DAYS = [
  { n: 1, date: '2026-11-12', dateLabel: 'NOV 12 · CSÜTÖRTÖK', city: 'Úton Brazíliába', loc: 'budapest', cam: 'rio', tz: 'Europe/Budapest', headline: 'Irány Rio', hero: 'rionight',
    transport: [
      { icon: '✈️', route: 'Budapest → Frankfurt · LH1339', time: '18:35 → 20:20', flight: 'LH1339', standby: true },
      { icon: '🌙', route: 'Frankfurt → Rio de Janeiro · LH500', time: '22:15 → 06:10 (nov. 13., riói idő)', flight: 'LH500', standby: true },
    ],
    events: [
      { time: '18:35', title: 'Budapest → Frankfurt', type: 'Repülés · LH1339', icon: '🛫', status: 'STANDBY' },
      { time: '22:15', title: 'Frankfurt → Rio de Janeiro', type: 'Éjszakai járat · LH500', icon: '🌙', status: 'STANDBY' },
    ],
    notes: ['Ezen a napon minden idő magyar idő szerint értendő.', 'Rio novemberben 4 órával van lemaradva Budapesthez képest.'],
    stay: 'Éjszaka a repülőn' },

  { n: 2, date: '2026-11-13', dateLabel: 'NOV 13 · PÉNTEK', city: 'Rio de Janeiro', loc: 'rio', headline: 'Landolás, aztán lassan', hero: 'rio',
    events: [
      { time: '06:10', title: 'Érkezés Rióba (GIG)', type: 'Landolás', icon: '🛬' },
      { time: '07:30', title: 'Reptér → Ipanema', type: 'Transzfer', icon: '🚕', desc: 'Uberrel vagy taxival, kb. 30 km. Reggeli forgalomban nagyjából 40–70 perc.' },
      { time: 'Délelőtt', title: 'Szünet a check-inig', type: 'Üres sáv', icon: '⏳', status: 'KORAI ÉRKEZÉS',
        desc: 'A szállás 14:00-tól foglalható el. Írjunk előre a szállásadónak: lehet-e korábban menni, vagy legalább letenni a bőröndöket. Ha nem, reggeli valahol a környéken, séta a parton, és a lenti esős listából is lehet válogatni.' },
      { time: '14:00', title: 'Check-in', type: 'Szállás · Ipanema', icon: '🔑', desc: 'Airbnb, Ipanema. Kijelentkezés kedden 11:00-ig.' },
      { time: 'Este', title: 'Laza első este', type: 'Vacsora a közelben', icon: '🍽️', desc: 'Több Michelin-ajánlott hely pár perc sétára van a szállástól, lent a listában.' },
    ],
    notes: ['Rio novemberben 4 órával van lemaradva Budapesthez képest.'],
    stay: 'Airbnb, Ipanema (14:00-tól)' },

  { n: 3, date: '2026-11-14', dateLabel: 'NOV 14 · SZOMBAT', city: 'Rio de Janeiro', loc: 'rio', headline: 'Szabad nap', hero: 'ipanema',
    events: [
      { time: 'Napközben', title: 'Még nincs program', type: 'Szabad', icon: '🌴', desc: 'Ötletek a térképen és a helyek között lent. Ha esik, a fenti gombbal jön az esős lista.' },
    ],
    stay: 'Airbnb, Ipanema' },

  { n: 4, date: '2026-11-15', dateLabel: 'NOV 15 · VASÁRNAP', city: 'Rio de Janeiro', loc: 'rio', headline: 'Vasárnapi vásár', hero: 'copacabana',
    events: [
      { time: 'Délelőtt', title: 'Feira Hippie de Ipanema', type: 'Vásár · csak vasárnap', icon: '🛍️',
        desc: 'Kézműves vásár a Praça General Osórión, vasárnaponként reggeltől délutánig. Festmények, bőráru, ruha, kaja. A szállástól kb. 10 perc séta.',
        facts: [{ text: '📍 Praça General Osório', href: 'https://www.google.com/maps/search/?api=1&query=Feira%20Hippie%20de%20Ipanema' }] },
      { time: 'Délután', title: 'Még nincs program', type: 'Szabad', icon: '🌴' },
    ],
    stay: 'Airbnb, Ipanema' },

  { n: 5, date: '2026-11-16', dateLabel: 'NOV 16 · HÉTFŐ', city: 'Rio de Janeiro', loc: 'rio', headline: 'Hétfő este samba', hero: 'urca',
    events: [
      { time: 'Napközben', title: 'Még nincs program', type: 'Szabad', icon: '🌴' },
      { time: '16:30', title: 'Samba do Trabalhador', type: 'Opcionális · délutáni samba', icon: '🎶',
        desc: 'Moacyr Luz hétfő délutáni samba-köre a Clube Renascençában (Andaraí). Innen taxival át lehet menni a Pedra do Salra.',
        facts: [{ text: '📍 Clube Renascença, Andaraí', href: 'https://www.google.com/maps/search/?api=1&query=Clube%20Renascen%C3%A7a%20Andara%C3%AD%20Rio' }] },
      { time: '19:00', title: 'Samba a Pedra do Salon', type: 'Ingyenes · szabadtéri', icon: '🥁',
        desc: 'Rio leghíresebb hétfő esti samba-köre a Saúde negyedben, a régi kikötő mellett, kb. 19:00-tól éjfélig. Nagy tömeg, utcai árusok, caipirinha. Oda-vissza Uberrel, mert az esemény után a környező utcák kiürülnek. Kevés készpénz az árusokhoz, a telefon legyen elöl.',
        facts: [{ text: '📍 Pedra do Sal, Largo João da Baiana', href: 'https://www.google.com/maps/search/?api=1&query=Pedra%20do%20Sal%20Sa%C3%BAde%20Rio%20de%20Janeiro' }] },
    ],
    stay: 'Airbnb, Ipanema' },

  { n: 6, date: '2026-11-17', dateLabel: 'NOV 17 · KEDD', city: 'Rio → Salvador', loc: 'rio', loc2: 'salvador', switchAt: '15:00', cam: 'salvador', headline: 'Észak felé', hero: 'farol',
    transport: [{ icon: '✈️', route: 'Rio de Janeiro → Salvador · LATAM', time: '15:00 → 17:00', flight: 'LA4692' }],
    events: [
      { time: '11:00', title: 'Kijelentkezés', type: 'Szállás · Ipanema', icon: '🧳', desc: 'A kulcsátadást előző este egyeztessük a szállásadóval.' },
      { time: '13:00', title: 'Indulás a reptérre', type: 'Transzfer', icon: '🚕', desc: 'Belföldi járat: kb. másfél órával indulás előtt legyünk kint.' },
      { time: '15:00', title: 'Rio → Salvador', type: 'Repülés · LATAM LA4692', icon: '🛫' },
      { time: '17:00', title: 'Érkezés Salvadorba (SSA)', type: 'Landolás', icon: '🛬', desc: 'Salvador és Rio ugyanabban az időzónában van, nem kell órát állítani.' },
      { time: '17:45', title: 'Reptér → Ondina', type: 'Transzfer', icon: '🚕', desc: 'Kb. 25 km a parti úton. A check-in 15:00-tól nyitva van, tehát egyenesen mehetünk.' },
      { time: 'Este', title: 'Check-in', type: 'Szállás · Ondina', icon: '🔑', desc: 'Airbnb Ondinában, pár lépésre a parttól. Kijelentkezés szombaton 11:00-ig, de a hajnali gép miatt a kulcsátadást előző este egyeztessük.' },
    ],
    stay: 'Airbnb, Ondina (15:00-tól)' },

  { n: 7, date: '2026-11-18', dateLabel: 'NOV 18 · SZERDA', city: 'Salvador', loc: 'salvador', cam: 'salvador', headline: 'Salvador, első nap', hero: 'pelourinho',
    events: [{ time: 'Napközben', title: 'Még nincs program', type: 'Szabad', icon: '🌴', desc: 'Ha esik, a fenti gombbal jön a salvadori esős lista: múzeumok a Pelourinhóban, piacok, plázák.' }],
    stay: 'Airbnb, Ondina' },

  { n: 8, date: '2026-11-19', dateLabel: 'NOV 19 · CSÜTÖRTÖK', city: 'Salvador', loc: 'salvador', cam: 'salvador', headline: 'Szabad nap', hero: 'pelo2',
    events: [{ time: 'Napközben', title: 'Még nincs program', type: 'Szabad', icon: '🌴' }],
    stay: 'Airbnb, Ondina' },

  { n: 9, date: '2026-11-20', dateLabel: 'NOV 20 · PÉNTEK', city: 'Salvador', loc: 'salvador', cam: 'salvador', headline: 'A fekete öntudat napja', hero: 'pelourinho', holiday: 'Nemzeti ünnep (Dia da Consciência Negra): a nyitvatartások eltérhetnek.',
    events: [
      { time: 'Napközben', title: 'Dia da Consciência Negra', type: 'Nemzeti ünnep · felvonulások', icon: '✊🏾', status: 'IDŐPONTOK KÉSŐBB',
        desc: 'Zumbi dos Palmares emléknapja. Salvadorban aznap három nagy esemény van: a Zumbi-szobor megmosása (Lavagem de Zumbi), a Marcha Zumbi e Dandara és a Caminhada da Liberdade. A pontos útvonalakat és kezdési időket a bahiai kormány esélyegyenlőségi titkársága (Sepromi) teszi közzé, a hét elején érdemes ránézni.' },
      { time: 'Este', title: 'Korai lefekvés', type: 'Hajnali gép', icon: '😴', desc: 'Másnap 05:15-kor repülünk, kb. 03:00-kor indulni kell a reptérre. Taxit vagy Ubert előre egyeztetni.' },
    ],
    notes: ['Nemzeti ünnep: a boltok, múzeumok egy része zárva lehet vagy rövidebben van nyitva.', 'Salvador reptere kb. 30 km a Barrától, hajnalban kb. fél óra.'],
    stay: 'Airbnb, Ondina' },

  { n: 10, date: '2026-11-21', dateLabel: 'NOV 21 · SZOMBAT', city: 'Salvador → Rio', loc: 'rio', loc2: 'salvador', headline: 'Hajnali gép vissza', hero: 'rio',
    transport: [{ icon: '✈️', route: 'Salvador → Rio de Janeiro · LATAM', time: '05:15 → 07:20', flight: 'LA3697' }],
    events: [
      { time: '03:00', title: 'Indulás a reptérre', type: 'Transzfer', icon: '🚕', desc: 'Ondinából kb. 25 km, hajnalban nagyjából fél óra. A kijelentkezés hivatalosan 11:00-ig lenne, de mi jóval előtte megyünk: a kulcsátadást előző este beszéljük meg.' },
      { time: '05:15', title: 'Salvador → Rio', type: 'Repülés · LATAM LA3697', icon: '🛫' },
      { time: '07:20', title: 'Érkezés Rióba (GIG)', type: 'Landolás', icon: '🛬' },
      { time: 'Délelőtt', title: 'Szállás: helyben foglaljuk', type: 'Egy éjszaka · nov. 21→22.', icon: '🏠', desc: 'Nincs előre lefoglalva, így döntöttünk. 07:20-kor landolunk, a check-in a legtöbb helyen csak 14:00-tól van, úgyhogy a reptérről indulva keressünk. Másnap 12:00-kor megyünk a GIG-re: Copacabanáról és Ipanemából is rövid az út, Botafogo és Flamengo pedig általában olcsóbb. A reptéren is van wifi, ha a gépen nem jutunk neten.' },
    ],
    stay: 'Rio · helyben foglaljuk' },

  { n: 11, date: '2026-11-22', dateLabel: 'NOV 22 · VASÁRNAP', city: 'Rio de Janeiro', loc: 'rio', headline: 'Utolsó délelőtt', hero: 'copacabana',
    transport: [{ icon: '🌙', route: 'Rio de Janeiro → Frankfurt · LH501', time: '15:40 → 06:55 (nov. 23., frankfurti idő)', flight: 'LH501', standby: true }],
    events: [
      { time: 'Délelőtt', title: 'Feira Hippie, ha belefér', type: 'Vásár · csak vasárnap', icon: '🛍️', desc: 'Utolsó ajándékok a Praça General Osórión.' },
      { time: '12:00', title: 'Indulás a reptérre', type: 'Transzfer', icon: '🚕' },
      { time: '15:40', title: 'Rio de Janeiro → Frankfurt', type: 'Éjszakai járat · LH501', icon: '🌙', status: 'STANDBY' },
    ],
    stay: 'Éjszaka a repülőn' },

  { n: 12, date: '2026-11-23', dateLabel: 'NOV 23 · HÉTFŐ', city: 'Hazafelé', loc: 'budapest', tz: 'Europe/Budapest', headline: 'Itthon', hero: 'urca',
    transport: [{ icon: '✈️', route: 'Frankfurt → Budapest · LH1332', time: '07:40 → 09:15', flight: 'LH1332', standby: true }],
    events: [
      { time: '06:55', title: 'Érkezés Frankfurtba', type: 'Landolás', icon: '🛬' },
      { time: '07:40', title: 'Frankfurt → Budapest', type: 'Repülés · LH1332', icon: '🛫', status: 'STANDBY' },
      { time: '09:15', title: 'Budapest', type: 'Itthon', icon: '🏠' },
    ],
    notes: ['Ezen a napon minden idő magyar idő szerint értendő.'],
    stay: 'Otthon' },
];

const STOPS = {
  rio: { name: 'Rio de Janeiro', ll: [-22.9068, -43.1729] },
  salvador: { name: 'Salvador', ll: [-12.9777, -38.5016] },
};
