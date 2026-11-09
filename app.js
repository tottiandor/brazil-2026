const CFG = window.TRIP_CONFIG || {};
const TZ = 'America/Sao_Paulo'; // Rio és Salvador is UTC−3, nincs nyári időszámítás
const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privát mód */ } },
};
const maps = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const CITY_NAME = { rio: 'Rio de Janeiro', salvador: 'Salvador' };
const photoUrl = (k, w = 1280) => PHOTOS[k] ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(PHOTOS[k].file)}?width=${w}` : '';
const photoPage = k => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(PHOTOS[k].file.replace(/ /g, '_'))}`;
const imgSrc = ref => {
  if (!ref) return '';
  const [kind, key] = ref.split(':');
  return kind === 'local' ? `img/places/${key}.jpg` : photoUrl(key, 640);
};

const state = { current: 0, wx: store.get('trip_met', {}), lists: store.get('trip_lists', {}), rainOpen: false, rainCity: null, deferredInstall: null,
  geo: null, geoErr: null, fx: store.get('trip_fx', null), rainDone: store.get('trip_rain_done', {}), rainShowDone: false };

// ---- idő ---------------------------------------------------------------------------------

function zoned(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, hm: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute };
}
const brNow = () => zoned(new Date(), TZ);
const fmtStamp = ms => new Intl.DateTimeFormat('hu-HU', { timeZone: TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)) + ' (riói idő)';
const SLOT = { reggel: 420, 'délelőtt': 540, napközben: 720, 'délután': 840, este: 1140 };
const timeKey = t => { const m = String(t).match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : (SLOT[String(t).toLowerCase()] ?? 1400); };
const isClock = t => /^\d{1,2}:\d{2}$/.test(String(t));
const weekdayIdx = date => (new Date(date + 'T12:00:00-03:00').getUTCDay() + 6) % 7; // hétfő = 0

// ---- távolság ----------------------------------------------------------------------------

function km(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
const fmtDist = d => (d < 1.5 ? `${Math.max(1, Math.round(d * 1000 / 80))} perc séta` : `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} km`);
function stayRef(city, date) {
  const s = STAYS.find(x => x.city === city && date >= x.from && date <= x.to && x.ll)
    || STAYS.find(x => x.city === city && x.ll && date >= x.from && date < x.to);
  return s ? { ll: s.ll, label: 'a szállástól' } : DIST_FALLBACK[city];
}
const cityOf = ll => (ll[0] > -16 ? 'salvador' : 'rio');
// Távolság viszonyítási pontja: ha a felhasználó megosztotta a helyzetét, onnan, különben a szállástól.
function distRef(city, date) {
  if (state.geo) return { ll: [state.geo.lat, state.geo.lon], label: 'tőled', live: true };
  return stayRef(city, date);
}

// ---- időjárás (MET Norway Locationforecast) ------------------------------------------------

const SYM = {
  clearsky: ['☀️', 'Napos'], fair: ['🌤️', 'Többnyire napos'], partlycloudy: ['⛅', 'Változóan felhős'], cloudy: ['☁️', 'Borult'], fog: ['🌫️', 'Köd'],
  lightrainshowers: ['🌦️', 'Gyenge zápor'], rainshowers: ['🌦️', 'Záporok'], heavyrainshowers: ['🌧️', 'Erős záporok'],
  lightrain: ['🌦️', 'Gyenge eső'], rain: ['🌧️', 'Eső'], heavyrain: ['🌧️', 'Erős eső'],
};
function sym(code) {
  if (!code) return ['🌡️', 'Előrejelzés'];
  const [base, part] = code.split('_');
  if (/thunder/.test(base)) return ['⛈️', 'Zivatar'];
  if (/snow|sleet/.test(base)) return ['🌨️', 'Havas eső'];
  if (part === 'night' && (base === 'clearsky' || base === 'fair')) return ['🌙', 'Derült'];
  return SYM[base] || ['🌡️', 'Előrejelzés'];
}

async function fetchMet(loc) {
  const c = state.wx[loc];
  if (c && Date.now() < c.next) return c;
  const [lat, lon] = WEATHER_LOCS[loc];
  try {
    const r = await fetch(`${MET_URL}?lat=${lat}&lon=${lon}`); // egyszerű kérés: a böngésző Origin fejléce azonosít
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const exp = Date.parse(r.headers.get('expires') || '');
    const rows = j.properties.timeseries.map(t => {
      const n1 = t.data.next_1_hours, n6 = t.data.next_6_hours, n = n1 || n6;
      if (!n) return null;
      return [Date.parse(t.time), Math.round(t.data.instant.details.air_temperature), n.summary.symbol_code, n.details?.precipitation_amount ?? 0, n1 ? 1 : 6, t.data.instant.details.wind_speed];
    }).filter(Boolean);
    // Legalább egy óráig nem kérdezünk újra (a MET kérése), ha az Expires fejléc nem olvasható.
    const out = { at: Date.now(), next: Math.max(Number.isFinite(exp) ? exp : 0, Date.now() + 60 * 60e3) + Math.random() * 5 * 60e3, rows };
    state.wx[loc] = out;
    store.set('trip_met', state.wx);
    return out;
  } catch {
    return c || null;
  }
}

const locTz = loc => (loc === 'budapest' ? 'Europe/Budapest' : TZ);
function dayRows(loc, date) {
  const W = state.wx[loc];
  if (!W) return [];
  const tz = locTz(loc);
  return W.rows.map(([t, temp, s, mm, span, wind]) => ({ t, temp, s, mm, span, wind, z: zoned(new Date(t), tz) })).filter(r => r.z.iso === date);
}
function dayWx(loc, date) {
  const rows = dayRows(loc, date);
  if (!rows.length) return null;
  let rain = 0, peak = 0, thunder = false;
  rows.forEach(r => {
    const start = r.z.h, end = start + r.span, overlap = Math.max(0, Math.min(end, 22) - Math.max(start, 7));
    if (!overlap) return;
    const share = r.mm * overlap / r.span;
    rain += share;
    if (r.span === 1) peak = Math.max(peak, r.mm);
    if (/thunder/.test(r.s) && r.mm > 0) thunder = true;
  });
  const mid = rows.reduce((b, r) => (Math.abs(r.z.h + r.span / 2 - 13) < Math.abs(b.z.h + b.span / 2 - 13) ? r : b));
  const [icon, text] = sym(mid.s);
  return {
    icon, text, rows, max: Math.max(...rows.map(r => r.temp)), min: Math.min(...rows.map(r => r.temp)),
    rain: Math.round(rain * 10) / 10, wind: Math.round(Math.max(...rows.map(r => r.wind || 0)) * 3.6),
    rainy: rain >= 1 || peak >= 0.5 || thunder,
  };
}
function nowWx(loc) {
  const W = state.wx[loc];
  if (!W) return null;
  const now = Date.now();
  const r = W.rows.find(x => x[0] <= now && now < x[0] + x[4] * 3600e3);
  if (!r) return null;
  const [icon, text] = sym(r[2]);
  return { temp: r[1], icon, text };
}
const wxStamp = loc => (state.wx[loc]?.at ? `Frissítve: ${fmtStamp(state.wx[loc].at)} · MET Norway` : '');

function weatherHTML(d) {
  const w = dayWx(d.loc, d.date);
  if (!w) {
    return `<div class="weather"><div class="left"><div class="wicon">🌡️</div><div><strong>${esc(LOC_NAME[d.loc])}</strong><small>Erre a napra még nincs előrejelzés (kb. 9 nappal előre jön meg). ${esc(wxStamp(d.loc))}</small></div></div></div>`;
  }
  const extra = [w.rain > 0 ? `☔ kb. ${String(w.rain).replace('.', ',')} mm napközben` : '☔ nem várható eső', `💨 max. ${w.wind} km/h`];
  const w2 = d.loc2 && dayWx(d.loc2, d.date);
  const second = w2 ? `<small>${w2.icon} ${esc(LOC_NAME[d.loc2])}: ${w2.max}° / ${w2.min}°${w2.rainy ? ' · eső várható' : ''}</small>` : '';
  return `<div class="weather"><div class="left"><div class="wicon">${w.icon}</div><div><strong>${esc(w.text)} · ${esc(LOC_NAME[d.loc])}</strong><small>${extra.join(' · ')}</small>${second}<small>${esc(wxStamp(d.loc))}</small></div></div><div class="temps"><span>Max / min</span>${w.max}° · ${w.min}°</div></div>
    ${hoursHTML(w.rows)}`;
}
function hoursHTML(all) {
  // Ma az aktuális órától, más napokon reggel 6-tól mutatjuk (a 6 órás blokkok maradnak).
  const now = Date.now(), today = all.length && all[0].z.iso === zoned(new Date(), locTz(all.loc || 'rio')).iso;
  const rows = all.filter(r => (today ? r.t + r.span * 3600e3 > now : r.span === 6 || r.z.h >= 6));
  if (!rows.length) return '';
  const label = r => (r.span === 1 ? r.z.hm : `${String(r.z.h).padStart(2, '0')}–${String((r.z.h + 6) % 24).padStart(2, '0')}`);
  return `<div class="hours" aria-label="Óránkénti előrejelzés">${rows.map(r => {
    const [e] = sym(r.s);
    return `<div class="hr${r.mm >= 0.2 ? ' wet' : ''}"><small>${label(r)}</small><span class="e">${e}</span><b>${r.temp}°</b><span class="mm">${r.mm >= 0.1 ? String(r.mm).replace('.', ',') + ' mm' : ''}</span></div>`;
  }).join('')}</div>`;
}

// ---- "Ha esik" --------------------------------------------------------------------------

function rainCities(d) { return [d.loc, d.loc2].filter(c => RAIN_PLACES[c]); }
function isRainy(d) { return rainCities(d).some(c => dayWx(c, d.date)?.rainy); }

function rainBarHTML(d) {
  const cities = rainCities(d);
  if (!cities.length) return '';
  const on = isRainy(d), known = cities.some(c => dayWx(c, d.date));
  const wet = cities.filter(c => dayWx(c, d.date)?.rainy).map(c => CITY_NAME[c]);
  const hint = on ? `Esőt mondanak${wet.length && cities.length > 1 ? ' (' + wet.join(', ') + ')' : ''}` : known ? 'Nem várható eső' : 'Még nincs előrejelzés';
  return `<div class="topbar"><button class="rainbtn${on ? ' on' : ''}" id="rainBtn" aria-expanded="${state.rainOpen}" aria-controls="rainPanel">☔ Ha esik</button><span class="rainhint">${esc(hint)}</span></div>
    <div class="rainpanel${state.rainOpen ? ' open' : ''}" id="rainPanel"></div>`;
}
const WD_ON = ['Hétfőn', 'Kedden', 'Szerdán', 'Csütörtökön', 'Pénteken', 'Szombaton', 'Vasárnap'];
function hoursToday(h, date) {
  if (!h) return null;
  // "Ma", ha a mai napot nézzük, egyébként a nap neve ("Szerdán"), hogy ne kelljen fejben számolni.
  const t = h[weekdayIdx(date)], when = date === brNow().iso ? 'Ma' : WD_ON[weekdayIdx(date)];
  return t === 'zárva' ? { closed: true, text: `${when} zárva` } : { closed: false, text: `${when} ${t}` };
}
const rainKey = (city, name) => city + '|' + norm(name);
function rainDoneDate(city, name) { return state.rainDone[rainKey(city, name)] || null; }
function toggleRainDone(city, name, date) {
  const k = rainKey(city, name);
  if (state.rainDone[k]) delete state.rainDone[k]; else state.rainDone[k] = date;
  store.set('trip_rain_done', state.rainDone);
}
function renderRainPanel(d) {
  const el = $('#rainPanel');
  if (!el) return;
  const cities = rainCities(d);
  const city = cities.includes(state.rainCity) ? state.rainCity : cityNow(d);
  state.rainCity = city;
  const ref = distRef(city, d.date);
  const list = RAIN_PLACES[city].map(p => ({ ...p, dist: km(ref.ll, p.ll), done: rainDoneDate(city, p.name) }));
  // Amit egy korábbi napon kipipáltunk, az a későbbi napokon nem jön elő újra.
  const hiddenOn = p => !!p.done && p.done < d.date;
  const hidden = list.filter(hiddenOn);
  const shown = state.rainShowDone ? list : list.filter(p => !hiddenOn(p));
  const tabs = cities.length > 1 ? `<div class="pfilter">${cities.map(c => `<button class="chip${c === city ? ' on' : ''}" data-rc="${c}">${esc(CITY_NAME[c])}</button>`).join('')}</div>` : '';
  el.innerHTML = `<div class="label">Esős program · ${esc(CITY_NAME[city])}</div><h3>Ha esik, ide menjünk</h3>
    <p class="sub">Nyitvatartás a Google Térkép szerint, távolság légvonalban ${esc(ref.label)}. Amit kipipálsz, a későbbi napokról lekerül.</p>
    ${d.holiday ? `<div class="holiday">${esc(d.holiday)}</div>` : ''}${tabs}
    ${Object.entries(RAIN_CATS).map(([k, [icon, label]]) => {
      const shut = p => (hoursToday(p.h, d.date)?.closed ? 1 : 0);
      const items = shown.filter(p => p.k === k).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || shut(a) - shut(b) || a.dist - b.dist);
      if (!items.length) return '';
      return `<div class="rcat"><h4>${icon} ${esc(label)}</h4>${items.map(p => {
        const ht = hoursToday(p.h, d.date);
        return `<div class="rplace${p.done ? ' done' : ''}">
          <button class="rtick" type="button" data-tick="${esc(p.name)}" aria-pressed="${!!p.done}" aria-label="${esc(p.done ? 'Mégsem voltunk itt' : 'Voltunk itt')}: ${esc(p.name)}">✓</button>
          <a class="rbody" href="${esc(maps(`${p.name}, ${p.addr}, ${CITY_NAME[city]}`))}" target="_blank" rel="noopener"><b>${esc(p.name)}</b> <small class="rarea">${esc(p.area)}</small><p>${esc(p.d)}</p>
            <div class="rmeta">${p.done ? `<span class="open">✓ ${esc(p.done === d.date ? 'ma kipipálva' : 'megvolt')}</span>` : ht ? `<span class="${ht.closed ? 'closed' : 'open'}">${esc(ht.text)}</span>` : ''}<span>📍 ${esc(fmtDist(p.dist))}</span><span class="go">Térkép ↗</span></div></a>
        </div>`;
      }).join('')}</div>`;
    }).join('')}
    ${hidden.length ? `<button class="rdone-toggle" id="rainDoneToggle" type="button">${state.rainShowDone ? 'Elrejtem a megvoltakat' : `Megvolt már ${hidden.length} hely · mutasd`}</button>` : ''}`;
  el.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => { state.rainCity = b.dataset.rc; renderRainPanel(d); });
  el.querySelectorAll('[data-tick]').forEach(b => b.onclick = () => { toggleRainDone(city, b.dataset.tick, d.date); renderRainPanel(d); });
  const dt = $('#rainDoneToggle');
  if (dt) dt.onclick = () => { state.rainShowDone = !state.rainShowDone; renderRainPanel(d); };
}
function cityNow(d) { // utazós napon (switchAt) délután már a második város számít
  if (!d.loc2 || !d.switchAt) return d.loc;
  const t = brNow();
  return t.iso === d.date && t.min >= timeKey(d.switchAt) ? d.loc2 : d.loc;
}

// ---- élő kamera --------------------------------------------------------------------------

function camHTML(d) {
  const key = d.cam || (d.loc === 'rio' || d.loc === 'salvador' ? d.loc : null);
  const cfg = key && CFG.webcams?.[key];
  if (!cfg) return '';
  const poster = key === 'rio' ? 'copacabana' : 'farol';
  const links = [];
  if (cfg.videoId) links.push(`<a href="https://www.youtube.com/watch?v=${esc(cfg.videoId)}" target="_blank" rel="noopener">Megnyitás a YouTube-on ↗</a>`);
  links.push(`<a href="${esc(cfg.fallback)}" target="_blank" rel="noopener">${cfg.videoId ? 'Ha nem megy: másik élő adás ↗' : 'Éppen élő adások a YouTube-on ↗'}</a>`);
  if (cfg.videoId) {
    return `<div class="cam" id="cam"><span class="camlabel live">${esc(cfg.title)}</span><img src="${esc(photoUrl(poster, 960))}" alt="" loading="lazy" onerror="this.remove()">
      <button class="play" id="camPlay" data-vid="${esc(cfg.videoId)}"><i>▶</i>Élő kép betöltése</button></div><div class="camlinks">${links.join('')}</div>`;
  }
  const n = nowWx(key);
  return `<div class="cam"><span class="camlabel">${esc(cfg.title)} · fotó</span><img src="${esc(photoUrl(poster, 960))}" alt="" loading="lazy" onerror="this.remove()">
    <div class="now-wx">${n ? `Most ${esc(CITY_NAME[key])}ban: ${n.icon} ${n.temp}° · ${esc(n.text)}` : `${esc(CITY_NAME[key])}: élő kép most nincs`}</div></div><div class="camlinks">${links.join('')}</div>`;
}
function bindCam() {
  const b = $('#camPlay');
  if (!b) return;
  b.onclick = () => {
    if (!navigator.onLine) { toast('Offline vagy, az élő kép most nem tölthető be.'); return; }
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(b.dataset.vid)}?autoplay=1&mute=1&playsinline=1&rel=0`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.allowFullscreen = true;
    f.title = 'Élő kamera';
    b.parentElement.querySelector('img')?.remove();
    b.replaceWith(f);
  };
}

// ---- pénzváltó ----------------------------------------------------------------------------
// Az árfolyamot az open.er-api.com adja (kulcs nélkül, naponta frissül). Letöltés után
// localStorage-ba kerül, így offline is marad egy utolsó ismert érték, dátummal együtt.
const FX_URL = 'https://open.er-api.com/v6/latest/BRL';
const FX_FALLBACK = 'https://api.frankfurter.dev/v1/latest?base=BRL&symbols=HUF';
const FX_MAX_AGE = 6 * 3600e3;
const fxFmt = (n, dec) => new Intl.NumberFormat('hu-HU', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);

async function loadFx() {
  const cached = state.fx;
  if (cached && Date.now() - cached.at < FX_MAX_AGE) return;
  const tryOne = async (url, pick) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    const rate = pick(await r.json());
    if (!rate || !isFinite(rate)) throw new Error('nincs HUF');
    return rate;
  };
  try {
    let rate;
    try { rate = await tryOne(FX_URL, j => j?.rates?.HUF); }
    catch { rate = await tryOne(FX_FALLBACK, j => j?.rates?.HUF); }
    state.fx = { rate, at: Date.now() };
    store.set('trip_fx', state.fx);
  } catch { state.fxErr = true; }
  renderFx();
}

function fxHTML() {
  return `<div class="fx" id="fxCard">
    <div class="fxtop"><span class="label">💱 Pénzváltó</span><span class="fxrate" id="fxRate"></span></div>
    <div class="fxrow">
      <label class="fxfield"><b>R$</b><input id="fxBrl" type="number" inputmode="decimal" min="0" step="any" placeholder="0" aria-label="Brazil reál"></label>
      <button class="fxswap" id="fxSwap" type="button" title="Mezők ürítése" aria-label="Mezők ürítése">⇄</button>
      <label class="fxfield"><b>Ft</b><input id="fxHuf" type="number" inputmode="decimal" min="0" step="any" placeholder="0" aria-label="Forint"></label>
    </div>
    <div class="fxquick" id="fxQuick"></div>
  </div>`;
}

function renderFx() {
  const el = $('#fxRate'); if (!el) return;
  const fx = state.fx;
  if (!fx) { el.textContent = state.fxErr ? 'Árfolyam nem jött le' : 'Árfolyam töltése…'; return; }
  const stale = Date.now() - fx.at > FX_MAX_AGE;
  el.innerHTML = `1 R$ = <b>${esc(fxFmt(fx.rate, 1))} Ft</b><br>${esc(stale ? 'mentett: ' : '')}${esc(new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' }).format(fx.at))}`;
  const q = $('#fxQuick');
  if (q) q.innerHTML = [10, 20, 50, 100, 200, 500].map(v => `<button class="fxq" data-brl="${v}">${v} R$ ≈ <b>${esc(fxFmt(Math.round(v * fx.rate), 0))} Ft</b></button>`).join('');
  if (q) q.querySelectorAll('[data-brl]').forEach(b => b.onclick = () => { $('#fxBrl').value = b.dataset.brl; fxCalc('brl'); });
}

function fxCalc(from) {
  const fx = state.fx; if (!fx) return;
  const brl = $('#fxBrl'), huf = $('#fxHuf');
  if (from === 'brl') { const v = parseFloat(brl.value); huf.value = isFinite(v) ? Math.round(v * fx.rate) : ''; }
  else { const v = parseFloat(huf.value); brl.value = isFinite(v) ? (v / fx.rate).toFixed(2) : ''; }
}

function bindFx() {
  const brl = $('#fxBrl'), huf = $('#fxHuf');
  if (!brl) return;
  brl.oninput = () => fxCalc('brl');
  huf.oninput = () => fxCalc('huf');
  $('#fxSwap').onclick = () => { brl.value = ''; huf.value = ''; brl.focus(); };
  renderFx();
  loadFx();
}

// ---- helymeghatározás ----------------------------------------------------------------------
// Opcionális és mindig a felhasználó indítja. Semmit nem küldünk el, a koordináta csak a
// böngészőben él, és az oldal bezárásáig tart.
function geoToggle() {
  if (state.geo) { state.geo = null; state.geoErr = null; render(state.current); return; }
  if (!navigator.geolocation) { state.geoErr = 'A böngésző nem tud helyet megosztani.'; render(state.current); return; }
  const btn = $('#geoBtn');
  if (btn) btn.textContent = '📍 Keresés…';
  navigator.geolocation.getCurrentPosition(
    pos => { state.geo = { lat: pos.coords.latitude, lon: pos.coords.longitude }; state.geoErr = null; render(state.current); },
    err => { state.geoErr = err.code === 1 ? 'Nem engedélyezted a helymeghatározást.' : 'Nem sikerült megállapítani a helyet.'; render(state.current); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}
function geoRowHTML() {
  const on = !!state.geo;
  const note = on ? 'A távolságok mostantól tőled számolnak.' : state.geoErr || 'A távolságok a szállástól számolnak.';
  return `<div class="georow"><button class="geobtn${on ? ' on' : ''}" id="geoBtn" type="button">${on ? '📍 Helyzet bekapcsolva' : '📍 Számolj tőlem'}</button><span class="geonote">${esc(note)}</span></div>`;
}

// ---- tetején: figyelmeztetés, most, órák --------------------------------------------------

function renderDash() {
  $('#dash').innerHTML = `
    <div id="alerts"></div>
    <div id="nowCard" class="now"></div>
    <div class="clocks">
      <div class="clock"><span class="label">🇧🇷 Rio / Salvador</span><strong id="clkBR"></strong><small id="clkBRhint"></small></div>
      <div class="clock"><span class="label">🇭🇺 Budapest</span><strong id="clkBP"></strong><small id="clkBPhint"></small></div>
    </div>
    ${fxHTML()}
    <div class="chips">
      <button class="chip primary" id="installBtn" hidden>📲 Kezdőképernyőre</button>
      <a class="chip" href="#mapSec">🗺️ Térkép</a>
      <a class="chip" href="#placesSec">🍽️ Éttermek</a>
      <a class="chip" href="${esc(listUrl(LISTS.food.id))}" target="_blank" rel="noopener">📍 Listák a Google Térképen</a>
    </div>
    <div id="installHint" class="installhint" hidden></div>`;
  setupInstall();
  bindFx();
  tick();
}

function renderAlerts(now) {
  const el = $('#alerts');
  if (!el) return;
  el.innerHTML = ALERTS.filter(a => now <= new Date(a.until) && (!a.from || now >= new Date(a.from)))
    .map(a => `<button class="alert" onclick="go(${DAYS.findIndex(d => d.n === a.day)})">${esc(a.text)} <b>Részletek</b></button>`).join('');
}

function tick() {
  const now = new Date();
  const br = zoned(now, TZ), bp = zoned(now, 'Europe/Budapest');
  $('#clkBR').textContent = br.hm;
  $('#clkBP').textContent = bp.hm;
  $('#clkBRhint').textContent = br.h < 7 ? 'hajnal' : br.h >= 22 ? 'késő este' : 'nappal';
  const diff = Math.round(((bp.h * 60 + bp.m) - (br.h * 60 + br.m) + 1440) % 1440 / 60);
  $('#clkBPhint').textContent = `otthon ${diff} órával előrébb`;
  renderNow(now, br);
  renderAlerts(now);
}

function renderNow(now, br) {
  const el = $('#nowCard');
  if (now < TRIP_START) {
    const ms = TRIP_START - now;
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.innerHTML = `<div class="k">Visszaszámlálás</div><h3>${d ? d + ' nap ' : ''}${h} óra${d ? '' : ' ' + m + ' perc'}</h3><p>Csütörtök, nov. 12., 18:35: Budapest → Frankfurt → Rio.</p>`;
    return;
  }
  if (now > TRIP_END) {
    el.innerHTML = '<div class="k">Vége az útnak</div><h3>Itthon vagyunk 🏠</h3><p>A program és a helyek itt maradnak.</p>';
    return;
  }
  const fl = IN_FLIGHT.find(f => now >= new Date(f.dep) && now <= new Date(f.arr));
  if (fl) {
    const left = Math.max(0, Math.round((new Date(fl.arr) - now) / 60000));
    el.innerHTML = `<div class="k">Úton · ${esc(fl.no)}</div><h3>✈️ ${esc(fl.route)}</h3><p>Landolás ${esc(fl.land)}, még kb. ${Math.floor(left / 60)} ó ${left % 60} p.</p><div class="row"><a href="https://www.flightradar24.com/data/flights/${esc(fl.no.toLowerCase())}" target="_blank" rel="noopener" style="color:var(--gold);font-weight:800;text-decoration:none">🛰️ Élőben a térképen ↗</a></div>`;
    return;
  }
  const i = DAYS.findIndex(d => d.date === (d.tz ? zoned(now, d.tz) : br).iso);
  if (i < 0) { el.innerHTML = '<div class="k">Úton</div><h3>Brazília 2026</h3>'; return; }
  const v = DAYS[i];
  const t = v.tz ? zoned(now, v.tz) : br;
  const evs = v.events.map(e => ({ e, k: timeKey(e.time) })).filter(x => x.k < 1400);
  const cur = [...evs].reverse().find(x => x.k <= t.min);
  const nexts = evs.filter(x => x.k > t.min).slice(0, 2);
  const rows = nexts.map(x => {
    let cd = '';
    if (isClock(x.e.time)) { const l = x.k - t.min; cd = l >= 60 ? `${Math.floor(l / 60)} ó ${l % 60} p múlva` : `${l} perc múlva`; }
    return `<div class="row"><b>${esc(x.e.time)}</b><span>${esc(x.e.title)}</span><em>${cd}</em></div>`;
  }).join('');
  el.innerHTML = `<div class="k">Most · ${v.n}. nap · ${esc(v.city)}</div><h3>${esc(cur ? cur.e.title : v.headline)}</h3><p>${esc(cur ? (cur.e.desc || v.headline) : 'A mai program lent.')}</p>${rows || '<div class="row"><span>Mára nincs több tervezett program.</span></div>'}${i !== state.current ? `<button onclick="go(${i})">Mai program</button>` : ''}`;
}

// ---- hozzáadás a kezdőképernyőhöz --------------------------------------------------------

function setupInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const btn = $('#installBtn'), hint = $('#installHint');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (state.deferredInstall || ios) btn.hidden = false;
  btn.onclick = async () => {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice.catch(() => null);
      state.deferredInstall = null;
      btn.hidden = true;
      return;
    }
    hint.hidden = !hint.hidden;
    hint.innerHTML = 'iPhone-on Safariban: alul a Megosztás gomb (négyzet felfelé nyíllal), aztán <b>Főképernyőhöz adás</b>. Utána offline is megnyílik.';
  };
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  const b = $('#installBtn');
  if (b) b.hidden = false;
});

// ---- napi oldal ---------------------------------------------------------------------------

function renderNav() {
  const n = $('#daybar');
  const today = brNow().iso;
  n.innerHTML = DAYS.map((d, i) => `<button class="daybtn${i === state.current ? ' active' : ''}${d.date === today ? ' today' : ''}" onclick="go(${i})">${d.n}. nap<small>${d.date.slice(5).replace('-', '.')}.</small></button>`).join('');
  requestAnimationFrame(() => n.children[state.current]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
}

const WARN = /HIÁNYZIK|MEGERŐSÍTENDŐ|KORAI|KÉSŐBB/;
function eventHTML(e, isNow) {
  const facts = e.facts?.length ? `<div class="facts">${e.facts.map(f => (f.href
    ? `<a class="fact" href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.text)}</a>`
    : `<div class="fact">${esc(f.text || f)}</div>`)).join('')}</div>` : '';
  const status = e.status === 'STANDBY' ? '<span class="standby">STANDBY</span>' : e.status ? `<span class="status${WARN.test(e.status) ? ' warn' : ''}">${esc(e.status)}</span>` : '';
  return `<article class="event${isNow ? ' is-now' : ''}"><div class="etime">${esc(e.time)}</div><span class="dot"></span><div class="event-card"><div class="event-body"><div class="tag">${e.icon || '•'} ${esc(e.type || '')}</div><h3>${esc(e.title)}</h3>${e.desc ? `<p>${esc(e.desc)}</p>` : ''}${status}${facts}</div></div></article>`;
}
function transportHTML(t) {
  const links = t.flight ? `<div class="flinks">
      <a href="https://www.google.com/search?q=${encodeURIComponent(t.flight + ' flight status')}" target="_blank" rel="noopener">📊 Státusz, késés, kapu ↗</a>
      <a href="https://www.flightradar24.com/data/flights/${esc(t.flight.toLowerCase())}" target="_blank" rel="noopener">🛰️ Élő térkép ↗</a>
    </div>` : '';
  return `<div class="transport-card"><div><div class="r">${esc(t.route)}</div><div class="t">${esc(t.time)}${t.check ? ` · ${esc(t.check)}` : ''}</div>${t.standby ? '<span class="standby">STANDBY</span>' : ''}${links}</div><div class="i">${t.icon}</div></div>`;
}

function go(i) { render(i, { scroll: true }); }

function render(i, { scroll = false } = {}) {
  const dayChanged = i !== state.current || !state.rendered;
  if (i !== state.current) { state.rainOpen = false; state.rainCity = null; }
  state.current = i;
  state.rendered = true;
  const d = DAYS[i];
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', '#nap-' + d.n);
  renderNav();

  $('#eyebrow').textContent = `Brazília 2026 · ${d.n}. nap · ${d.dateLabel}`;
  $('#heroTitle').textContent = d.city;
  $('#heroSub').textContent = d.headline;
  const hero = $('#heroImg');
  const src = photoUrl(d.hero);
  if (hero.dataset.src !== src) { hero.dataset.src = src; hero.style.opacity = 0; hero.onload = () => { hero.style.opacity = 1; }; hero.onerror = () => { hero.style.opacity = 0; }; hero.src = src; }

  const t = d.tz ? zoned(new Date(), d.tz) : brNow();
  const nowIdx = d.date === t.iso ? (() => { let idx = -1; d.events.forEach((e, k) => { const tk = timeKey(e.time); if (tk < 1400 && tk <= t.min) idx = k; }); return idx; })() : -1;

  const tr = d.transport?.length ? `<div class="section-title"><div class="k">Közlekedés</div><h2>Úton</h2></div><div class="transport">${d.transport.map(transportHTML).join('')}</div>` : '';
  const timeline = `<div class="section-title"><div class="k">A nap programja</div><h2>${esc(d.headline)}</h2></div><div class="timeline">${d.events.map((e, k) => eventHTML(e, k === nowIdx)).join('')}</div>`;
  const notes = d.notes?.length ? `<div class="section-title"><div class="k">Gyakorlati</div><h2>Jó tudni</h2></div><div class="notes"><ul>${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : '';
  const stay = d.stay ? `<div class="section-title"><div class="k">Éjszaka</div><h2>Szállás</h2></div><div class="info-card"><div class="label">Szállás</div><h3>${esc(d.stay)}</h3>${stayLine(d)}</div>` : '';
  const pn = `<div class="prevnext"><button class="nav2 secondary" ${i === 0 ? 'disabled' : ''} onclick="go(${i - 1})">← Előző nap</button><button class="nav2" ${i === DAYS.length - 1 ? 'disabled' : ''} onclick="go(${i + 1})">Következő nap →</button></div>`;

  // A kamera dobozát csak napváltáskor rajzoljuk újra, hogy egy háttérfrissítés ne állítsa le az élő képet.
  if (dayChanged || !$('#camBox')) $('#content').innerHTML = '<div id="rainBox"></div><div id="camBox"></div><div id="dayBody"></div>';
  if (dayChanged || !$('#camBox iframe')) { $('#camBox').innerHTML = camHTML(d); bindCam(); }
  $('#rainBox').innerHTML = rainBarHTML(d);
  $('#dayBody').innerHTML = weatherHTML(d) + tr + timeline + geoRowHTML() + dayPlacesHTML(d) + mustSeeHTML(d) + notes + stay + pn;
  const gb = $('#geoBtn');
  if (gb) gb.onclick = geoToggle;
  // A lenti nagy lista is a kiválasztott naphoz tartozik: a nyitvatartás annak a napnak szól,
  // és a város is követi a napot. Enélkül az első nap nyitvatartása ragadt volna ott.
  if (dayChanged && $('#placesGrid')) {
    const pc = cityNow(d);
    if (CITY_NAME[pc]) placeFilter.city = pc;
    renderPlaces();
    drawMarkers();
  }
  const rb = $('#rainBtn');
  if (rb) {
    rb.onclick = () => {
      state.rainOpen = !state.rainOpen;
      $('#rainPanel').classList.toggle('open', state.rainOpen);
      rb.setAttribute('aria-expanded', state.rainOpen);
      if (state.rainOpen) renderRainPanel(d);
    };
    if (state.rainOpen) renderRainPanel(d);
  }
  highlightMap();
}
function stayLine(d) {
  const s = STAYS.find(x => d.date >= x.from && d.date <= x.to && x.name);
  if (!s) return '';
  const parts = [];
  if (s.checkin && d.date === s.from) parts.push(`Check-in ${s.checkin}-tól`);
  if (s.checkout && d.date === s.to) parts.push(`Kijelentkezés ${s.checkout}-ig`);
  return parts.length ? `<p>${esc(parts.join(' · '))}</p>` : '';
}

// ---- helyek (Google Térkép-listák) --------------------------------------------------------

const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CAT_GUESS = [
  [/churrasc|grill|parrill|steak|bbq|carne|picanha/i, 'hus'], [/\bbar\b|boteco|botequim|chopp|cocktail|drinks/i, 'bar'],
  [/caf[eé]|padaria|confeitaria|coffee|doceria|sorvet|gelat/i, 'kave'], [/peixe|frutos|ocy[aá]|seafood|pescad|sushi|mar\b/i, 'tenger'],
];
function tierFrom(note) {
  if (/everyday|moderate|hétköznap|mindennap/i.test(note)) return 'mindennapi';
  if (/special|különleges/i.test(note)) return 'kulonleges';
  if (/splurge|kiruccan/i.test(note)) return 'nagy';
  return null;
}
async function loadLists() {
  for (const [kind, L] of Object.entries(LISTS)) {
    for (const src of [`https://raw.githubusercontent.com/${CFG.repo}/main/${L.file}`, L.file]) {
      try {
        const j = await fetch(src, { cache: 'no-store' }).then(r => r.json());
        if (Array.isArray(j?.places)) { state.lists[kind] = j; break; }
      } catch { /* következő forrás */ }
    }
  }
  store.set('trip_lists', state.lists);
}
function placesOf(kind) {
  const curated = PLACE_LIST.filter(p => (kind === 'sights') === SIGHT_CATS.includes(p.cat));
  const live = state.lists[kind]?.places;
  if (!live || !live.length) return curated;
  const used = new Set(), out = [];
  live.forEach(x => {
    let best = null, bd = 0.06; // 60 m: ugyanaz a Google-pin
    curated.forEach((p, k) => { const dd = km(p.ll, x.ll); if (!used.has(k) && dd < bd) { bd = dd; best = k; } });
    if (best == null) {
      const nx = norm(x.name);
      let bd2 = 3;
      curated.forEach((p, k) => {
        const np = norm(p.name);
        if (used.has(k) || nx.length < 4) return;
        if (np === nx || np.startsWith(nx) || nx.startsWith(np)) { const dd = km(p.ll, x.ll); if (dd < bd2) { bd2 = dd; best = k; } }
      });
    }
    const tier = tierFrom(x.note || '');
    const extra = x.note && !tier ? x.note : '';
    if (best != null) { used.add(best); out.push({ ...curated[best], tier: tier || curated[best].tier, n: extra || undefined, onList: 1 }); return; }
    const cat = kind === 'sights' ? 'latnivalo' : ((CAT_GUESS.find(([re]) => re.test(x.name)) || [])[1] || 'etterem');
    out.push({ name: x.name, ll: x.ll, addr: x.addr || '', area: (x.addr || '').split(',')[1]?.trim().split(' - ')[1] || (x.addr || '').split(',')[0], c: cityOf(x.ll), cat, tier: tier || undefined,
      d: kind === 'sights' ? 'Hely a közös látnivaló-listáról.' : 'Hely a közös étel-listáról.', n: extra || undefined, isNew: 1, onList: 1 });
  });
  if (kind === 'sights') curated.forEach((p, k) => { if (!used.has(k)) out.push(p); }); // a kézzel írt látnivalók maradnak
  return out;
}
const placeMaps = p => maps(`${p.name}, ${p.addr}, ${CITY_NAME[p.c] || ''}`);
function placeCardHTML(p, dist) {
  const [icon, label] = PLACE_CATS[p.cat] || PLACE_CATS.egyeb;
  const ref = p.img || CAT_IMG[p.cat];
  const img = ref ? `<img src="${esc(imgSrc(ref))}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'pph',textContent:'${icon}'}))">` : `<div class="pph">${icon}</div>`;
  const badge = dist != null ? `<span class="pbadge">📍 ${esc(fmtDist(dist))}</span>` : p.isNew ? '<span class="pbadge top">Új a listán</span>' : '';
  return `<a class="pcard" href="${esc(placeMaps(p))}" target="_blank" rel="noopener">
    <div class="pphoto">${img}${badge}${ref && !p.realImg ? '<span class="pillus">illusztráció</span>' : ''}</div>
    <div class="pbody"><div class="ptag">${icon} ${esc(label)} · ${esc(p.area || '')}</div><h4>${esc(p.name)}</h4>${p.tier ? `<div class="ptier">${esc(TIERS[p.tier])}</div>` : ''}<p>${esc(p.d)}</p>${p.n ? `<p class="pnote">💬 ${esc(p.n)}</p>` : ''}${p.h ? `<p class="phours">${esc(hoursToday(p.h, DAYS[state.current].date).text)}</p>` : ''}<span class="pmap">Térkép ↗</span></div>
  </a>`;
}
function dayPlacesHTML(d) {
  const city = cityNow(d);
  if (!CITY_NAME[city]) return '';
  const ref = distRef(city, d.date);
  const list = placesOf('food').filter(p => p.c === city).map(p => ({ p, dist: km(ref.ll, p.ll) })).sort((a, b) => a.dist - b.dist);
  if (!list.length) return `<div class="section-title"><div class="k">Kaja · ${esc(CITY_NAME[city])}</div><h2>Hol együnk?</h2></div><p class="empty">Ehhez a városhoz még nincs hely a listán. Ha felkerül valami a Brazília gastro listára, napi kétszer ide is átjön.</p>`;
  return `<div class="section-title"><div class="k">Kaja · ${esc(CITY_NAME[city])} · ${esc(ref.label)}</div><h2>Hol együnk?</h2></div>
    <div class="pcarousel">${list.slice(0, 10).map(x => placeCardHTML(x.p, x.dist)).join('')}</div>
    <button class="exploreBtn" onclick="showPlaces('${city}')">Mind a ${list.length} hely és a látnivalók</button>`;
}

// Kötelező kör: alapból a kézzel sorba rakott sorrend, de ha megosztottad a helyzeted,
// akkor a hozzád legközelebbi kerül előre.
function mustSeeHTML(d) {
  const city = cityNow(d);
  const list = MUST_SEE[city];
  if (!list || !list.length) return '';
  const ref = distRef(city, d.date);
  const items = list.map((p, i) => ({ p: { ...p, c: city }, dist: km(ref.ll, p.ll), i }));
  if (state.geo) items.sort((a, b) => a.dist - b.dist); else items.sort((a, b) => a.i - b.i);
  return `<div class="section-title"><div class="k">Kötelező kör · ${esc(CITY_NAME[city])} · ${esc(ref.label)}</div><h2>Amit látni kell</h2></div>
    <div class="pcarousel">${items.map(x => placeCardHTML(x.p, x.dist)).join('')}</div>`;
}

const placeFilter = { city: 'rio', kinds: { food: true, sights: true } };
function showPlaces(city) {
  placeFilter.city = city;
  renderPlaces();
  fitCity(city);
  $('#mapSec').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderPlaces() {
  $('#pCity').innerHTML = Object.entries(CITY_NAME).map(([k, v]) => `<button class="chip${placeFilter.city === k ? ' on' : ''}" data-city="${k}">${esc(v)}</button>`).join('');
  $('#pKind').innerHTML = Object.entries(LISTS).map(([k, L]) => `<button class="chip${placeFilter.kinds[k] ? ' on' : ''}" data-kind="${k}" aria-pressed="${placeFilter.kinds[k]}">${L.icon} ${esc(L.label)}</button>`).join('');
  const shown = Object.keys(LISTS).filter(k => placeFilter.kinds[k]).flatMap(k => placesOf(k).filter(p => p.c === placeFilter.city));
  const tierOrder = { mindennapi: 1, kulonleges: 2, nagy: 3 };
  // Kategóriánként egy-egy oldalra húzható sor: a teljes lista így nem nyúlik el képernyőnyi hosszan.
  const order = Object.keys(PLACE_CATS);
  const groups = new Map();
  shown.forEach(p => { const k = PLACE_CATS[p.cat] ? p.cat : 'egyeb'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
  const keys = [...groups.keys()].sort((a, b) =>
    (SIGHT_CATS.includes(a) - SIGHT_CATS.includes(b)) || (order.indexOf(a) - order.indexOf(b)));
  $('#placesGrid').innerHTML = keys.length ? keys.map(k => {
    const [icon, label] = PLACE_CATS[k];
    const items = groups.get(k).sort((a, b) => ((tierOrder[a.tier] || 9) - (tierOrder[b.tier] || 9)) || a.name.localeCompare(b.name, 'hu'));
    return `<div class="prow"><h4>${icon} ${esc(label)} <span>${items.length}</span></h4>
      <div class="pcarousel">${items.map(p => placeCardHTML(p)).join('')}</div></div>`;
  }).join('') : '<p class="empty">Ehhez a szűréshez még nincs hely.</p>';
  $('#pCity').querySelectorAll('[data-city]').forEach(b => b.onclick = () => { placeFilter.city = b.dataset.city; renderPlaces(); fitCity(b.dataset.city); });
  $('#pKind').querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { placeFilter.kinds[b.dataset.kind] = !placeFilter.kinds[b.dataset.kind]; renderPlaces(); drawMarkers(); });
  const st = Object.values(state.lists).map(l => l?.updatedAt).filter(Boolean).sort().pop();
  $('#listStamp').textContent = st ? `Listák szinkronizálva: ${fmtStamp(Date.parse(st))}` : 'A listák szinkronja még nem futott le, a kézzel összegyűjtött helyek látszanak.';
}

// ---- térkép -------------------------------------------------------------------------------

let map = null, layer = null, stopMarkers = {};
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function initMap() {
  try {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
  } catch {
    $('#map').innerHTML = '<div class="empty" style="padding:20px">A térkép most nem tölthető be (offline?). A helyek listája lent működik.</div>';
    return;
  }
  map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  Object.entries(STOPS).forEach(([k, s]) => {
    stopMarkers[k] = L.circleMarker(s.ll, { radius: 9, color: '#fff', weight: 2, fillColor: '#14212b', fillOpacity: 1 })
      .bindTooltip(s.name, { permanent: true, direction: 'right', offset: [10, 0] }).addTo(map);
  });
  layer = L.layerGroup().addTo(map);
  drawMarkers();
  fitCity(placeFilter.city);
  highlightMap();
}
function drawMarkers() {
  if (!map) return;
  layer.clearLayers();
  Object.keys(LISTS).filter(k => placeFilter.kinds[k]).forEach(k => placesOf(k).forEach(p => {
    const [icon] = PLACE_CATS[p.cat] || PLACE_CATS.egyeb;
    L.circleMarker(p.ll, { radius: 6, color: '#fff', weight: 1.5, fillColor: k === 'food' ? '#c9a95b' : '#5aa9cf', fillOpacity: 1 })
      .bindPopup(`<b>${icon} ${esc(p.name)}</b><br><small>${esc(p.area || '')}${p.tier ? ' · ' + esc(TIERS[p.tier]) : ''}</small><br><a href="${esc(placeMaps(p))}" target="_blank" rel="noopener">Google Térkép ↗</a>`)
      .addTo(layer);
  }));
}
function fitCity(city) {
  if (!map) return;
  const pts = Object.keys(LISTS).flatMap(k => placesOf(k)).filter(p => p.c === city).map(p => p.ll);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 14 });
  else map.setView(STOPS[city].ll, 12);
}
function highlightMap() {
  if (!map) return;
  const d = DAYS[state.current];
  Object.entries(stopMarkers).forEach(([k, m]) => m.setStyle({ fillColor: k === d.loc || k === d.loc2 ? '#c9a95b' : '#14212b' }));
}

function photoCredits() {
  return 'Fotók (Wikimedia Commons): ' + Object.entries(PHOTOS).map(([k, p]) => `<a href="${esc(photoPage(k))}" target="_blank" rel="noopener">${esc(p.by)}</a>${p.lic ? ` (${esc(p.lic)})` : ''}`).join(', ') + '. A pontos licenc a fájl oldalán. Egyes ételfotók az Argentína-oldalról: Yotam Nachum (CC0), Ivanmartinez, Dangelin5 (CC BY-SA 3.0).';
}
function renderGlobal() {
  const d0 = DAYS[state.current];
  placeFilter.city = d0.loc === 'salvador' ? 'salvador' : 'rio';
  $('#global').innerHTML = `
    <div class="section-title" id="mapSec"><div class="k">A két Google Térkép-listánk</div><h2>Térkép</h2></div>
    <div class="pfilter" id="pCity"></div>
    <div class="pfilter" id="pKind"></div>
    <div id="map"></div>
    <div class="legend"><span><i style="background:#c9a95b"></i>étel</span><span><i style="background:#5aa9cf"></i>látnivaló</span><span><i style="background:#14212b"></i>városok</span></div>
    <div class="section-title" id="placesSec"><div class="k">Árkategória szerint</div><h2>Éttermek és helyek</h2></div>
    <div id="placesGrid"></div>
    <p class="hint" id="listStamp"></p>
    <div class="maplinks"><a class="btn secondary" href="${esc(listUrl(LISTS.food.id))}" target="_blank" rel="noopener">🍽️ Étel-lista a Google Térképen</a><a class="btn secondary" href="${esc(listUrl(LISTS.sights.id))}" target="_blank" rel="noopener">🏛️ Látnivaló-lista</a></div>
    <div class="credits">Időjárás: <a href="https://api.met.no/" target="_blank" rel="noopener">MET Norway</a> Locationforecast, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Az adatokat feldolgoztuk (óránkénti nézet, esőjelzés). Nyitvatartások: Google Térkép, 2026. november, ünnepnapon eltérhetnek. Szállásadatok és foglalási kódok nem jelennek meg. ${photoCredits()} Térkép © OpenStreetMap.</div>`;
  renderPlaces();
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); initMap(); } }, { rootMargin: '300px' });
  io.observe($('#map'));
}

// ---- betöltés -----------------------------------------------------------------------------

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function setOffline(on) { $('#offline').classList.toggle('show', on); }

async function refreshWeather() {
  const need = [...new Set(DAYS.flatMap(d => [d.loc, d.loc2, d.cam]).filter(l => l && WEATHER_LOCS[l]))];
  await Promise.all(need.map(fetchMet));
  render(state.current);
}

function initialDay() {
  const m = location.hash.match(/nap-(\d+)/);
  if (m) { const i = DAYS.findIndex(d => d.n === +m[1]); if (i >= 0) return i; }
  const now = new Date();
  if (now < TRIP_START) return 0;
  if (now > TRIP_END) return DAYS.length - 1;
  const i = DAYS.findIndex(d => d.date === (d.tz ? zoned(now, d.tz) : brNow()).iso);
  return i >= 0 ? i : 0;
}

state.current = initialDay();
renderDash();
renderGlobal();
render(state.current);
setOffline(!navigator.onLine);
refreshWeather();
loadLists().then(() => { renderPlaces(); drawMarkers(); render(state.current); });
setInterval(tick, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); refreshWeather(); } });
window.addEventListener('online', () => { setOffline(false); refreshWeather(); });
window.addEventListener('offline', () => setOffline(true));
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
