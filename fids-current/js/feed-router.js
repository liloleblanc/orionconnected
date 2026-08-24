// ═══════════════════════════════════════════════════════════════════════
// FEED ROUTER — the boards' flight-data layer, EXTRACTED from fids-core.js
// (v23230, Nick: 'the gates are no wired so the connection is not made you
// didn't fix you you built over it'). One source for every surface: the
// per-airport authority feeds (YQM/cyqm with real gates, MCO/GOAA, YUL/ADM,
// TPA, YYZ, YHU, YTZ, PANYNJ, MIA) with the AeroDataBox windows as the
// fallback — the boards and the mobile app now run THIS SAME file instead
// of the app keeping a private copy of half of it.
//
// Load order: this file loads BEFORE fids-core.js on board pages. The board
// then supplies the richer runtime deps (adbPacedFetch's rate-paced queue,
// _yqmCacheAircraftMerge, _cityFromStopLabel); the shims below only stand in
// on surfaces that load the router alone (the mobile app), and the board's
// own definitions override them the moment fids-core.js loads.
// ═══════════════════════════════════════════════════════════════════════
// Shim: plain fetch when the board's paced ADB queue isn't loaded. Every
// in-router call already targets the proxy URL, so no rewriting is needed.
window.adbPacedFetch = window.adbPacedFetch || function (url, opts) { return fetch(url, opts); };
// ── AERODATABOX ──────────────────────────────────────────────────────────
const ADB_BASE = 'https://aerodatabox.p.rapidapi.com';
const ADB_HOST = 'aerodatabox.p.rapidapi.com';
// ADB key removed — routed through secure proxy
function fmt12(d, tz) {
  // AeroDataBox expects local airport time IN 24-HOUR FORMAT in the URL
  // path. Do NOT use hour12:true here — the API rejects 12h-formatted
  // hours and the windowing breaks because "18:30" becomes "06:30".
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', hour12: false
      }).formatToParts(d);
      const get = type => parts.find(p => p.type === type).value;
      const hh = get('hour') === '24' ? '00' : get('hour');
      return `${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}`;
    } catch(e) {}
  }
  // Fallback: UTC
  const y=d.getUTCFullYear(),mo=String(d.getUTCMonth()+1).padStart(2,'0'),
    dd=String(d.getUTCDate()).padStart(2,'0'),hh=String(d.getUTCHours()).padStart(2,'0'),
    mm=String(d.getUTCMinutes()).padStart(2,'0');
  return `${y}-${mo}-${dd}T${hh}:${mm}`;
}
async function adbFetchWindow(iata, direction, fromStr, toStr) {
  const path = `/flights/airports/iata/${iata}/${fromStr}/${toStr}`
    + `?withLeg=true&direction=${direction}&withCancelled=true`
    + `&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=true`;
  // All ADB calls routed through secure proxy
  const proxyUrl = `https://fids-proxy.n-leblanc1984.workers.dev${path}`;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = proxyUrl;
      const opts = {};
      console.log(`[FIDS] ADB fetch (attempt ${attempt+1}):`, url);
      const r = await adbPacedFetch(url, opts);
      if (r.status === 429) {
        console.warn(`[FIDS] Rate limited (429), waiting ${(attempt+1)*2}s...`);
        await new Promise(resolve => setTimeout(resolve, (attempt+1) * 2000));
        continue;
      }
      if (!r.ok) {
        let body = ''; try { body = await r.text(); } catch(e) {}
        lastErr = `HTTP ${r.status} for ${iata} ${direction} [${fromStr} → ${toStr}]\n${body.slice(0,300)}`;
        console.error('[FIDS] ADB error:', lastErr);
        // Note: useProxy reference removed (no longer in scope; was throwing
        // ReferenceError in this error path and masking the actual API error).
        // All ADB calls already go through the proxy unconditionally.
        throw new Error(lastErr);
      }
      const json = await r.json();
      const count = direction === 'Departure' ? (json.departures||[]).length : (json.arrivals||[]).length;
      console.log(`[FIDS] ADB ${iata} ${direction} ${fromStr}→${toStr}: ${count} flights`);
      return json;
    } catch(e) {
      lastErr = e.message;
      if (attempt < 2) { await new Promise(r=>setTimeout(r,1000)); continue; }
      throw e;
    }
  }
  throw new Error(lastErr || `Failed after 3 attempts for ${iata} ${direction}`);
}
// ── MCO terminal (A / B / C) ──────────────────────────────────────────
// The Terminal column should show the landside terminal (A/B/C) — where
// check-in and baggage claim live — NOT the airside concourse. The GOAA
// feed's own `terminal` letter is authoritative and preferred; this is only
// a fallback for rows the feed leaves blank, derived from MCO's published
// gate ranges. NOTE: gate→terminal ranges below are unverified — confirm
// against the live board.
function mcoTerminal(gate) {
  if (!gate) return null;
  const g = String(gate).trim().toUpperCase();
  if (g.charAt(0) === 'C') return 'C';                 // South Terminal (C-gates)
  const n = parseInt(g, 10);
  if (isNaN(n)) return null;
  if ((n >= 1  && n <= 29) || (n >= 100 && n <= 129)) return 'A';  // Airsides 1 & 2
  if ((n >= 30 && n <= 59) || (n >= 60  && n <= 99))  return 'B';  // Airsides 3 & 4
  return null;
}
// ── YQM (Moncton) native feed — cyqm.ca WordPress REST ────────────────
// The airport publishes its own flight list at
// /wp-json/ch-flight-data/v1/flights/{departures|arrivals}. No key, real
// unix timestamps, gate + human status strings. We fetch it straight from
// the board (a real browser sails past the site's Imperva CDN, and WP REST
// echoes CORS), map it into the ADB-native shape the rest of the pipeline
// expects, and skip AeroDataBox entirely for YQM.
function yqmTimeObj(tsSeconds) {
  if (!tsSeconds || typeof tsSeconds !== 'number') return null;
  const d = new Date(tsSeconds * 1000);
  if (isNaN(d.getTime())) return null;
  // cyqm.ca's localTimestamp is the Moncton WALL-CLOCK time encoded as a UTC
  // epoch (5:20 PM local == 17:20 "UTC" here). So read the epoch's UTC parts
  // directly — those already ARE the local clock — and stamp Moncton's offset.
  // Do NOT timezone-convert (that would shift the displayed time wrongly).
  const Y = d.getUTCFullYear(), Mo = String(d.getUTCMonth() + 1).padStart(2, '0'), Da = String(d.getUTCDate()).padStart(2, '0');
  const H = String(d.getUTCHours()).padStart(2, '0'), Mi = String(d.getUTCMinutes()).padStart(2, '0'), S = String(d.getUTCSeconds()).padStart(2, '0');
  let off = '-04:00';
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Moncton', timeZoneName: 'shortOffset' }).formatToParts(d);
    const tz = (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
    const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) off = `${m[1]}${m[2].padStart(2, '0')}:${(m[3] || '00')}`;
  } catch (e) {}
  const local = `${Y}-${Mo}-${Da} ${H}:${Mi}:${S}${off}`;
  let utc = local;
  try { utc = new Date(`${Y}-${Mo}-${Da}T${H}:${Mi}:${S}${off}`).toISOString().slice(0, 19).replace('T', ' ') + '+00:00'; } catch (e) {}
  return { local, utc };
}
// "5:20 PM" -> minutes since midnight (for computing the revised delta).
function yqmClockToMin(s) {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10); const min = parseInt(m[2], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}
// Map the human status string ("Departed at 8:20 PM", "On Time", …) onto
// the lowercase keywords the board keys on.
function yqmStatus(s) {
  const t = String(s || '').toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('gate closed')) return 'gateclosed';
  if (t.includes('final call') || t.includes('last call') || t.includes('board')) return 'boarding';
  if (t.includes('depart')) return 'departed';
  if (t.includes('arriv') || t.includes('land')) return 'arrived';
  if (t.includes('delay')) return 'delayed';
  return 'scheduled';   // "On Time", "Expected", "Scheduled", ""
}
function yqmToAdbFlight(f, direction) {
  if (!f || typeof f !== 'object') return null;
  const isDep = direction === 'Departure';
  const number = String(f.flightId || ((f.airlineCode || '') + (f.flightNumber || ''))).trim();
  if (!number) return null;
  const sched = yqmTimeObj(f.localTimestamp);
  // Revised time: derive from the actualTime string when it differs from
  // scheduled (delta in minutes off the scheduled unix ts).
  let revised = null;
  const schedMin = yqmClockToMin(f.scheduledTime);
  const actMin = yqmClockToMin(f.actualTime);
  if (sched && f.localTimestamp && schedMin != null && actMin != null && actMin !== schedMin) {
    let delta = actMin - schedMin;
    if (delta < -720) delta += 1440;   // rolled past midnight
    revised = yqmTimeObj(f.localTimestamp + delta * 60);
  }
  const airline = { iata: (f.airlineCode || '').toUpperCase() || null, icao: null, name: f.airlineName || null };
  const home = { iata: 'YQM', icao: 'CYQM', name: 'Moncton' };
  const other = { iata: (f.airportCode || '').toUpperCase() || null, icao: null, name: f.airportCity || null };
  const homeSide = {
    airport: home,
    terminal: f.terminal || null,
    gate: f.gate || null,
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  return {
    number,
    callSign: null,
    status: yqmStatus(f.status),
    codeshareStatus: 'IsOperator',
    isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
}
// ── TPA (Tampa) native feed — tampaairport.../api/flight-status ────────
// One endpoint returns BOTH directions (adi: "D"/"A"), with airside
// (A/C/E/F concourses) and real baggage-claim numbers. Times are ISO local
// (Eastern) strings with no offset.
function tpaTimeObj(isoLocal) {
  const m = String(isoLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const Y = m[1], Mo = m[2], Da = m[3], H = m[4], Mi = m[5], S = m[6] || '00';
  // The string is the Tampa wall clock; stamp the Eastern offset for that date.
  const ref = new Date(`${Y}-${Mo}-${Da}T${H}:${Mi}:${S}Z`);
  let off = '-05:00';
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' }).formatToParts(ref);
    const tz = (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
    const mm = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (mm) off = `${mm[1]}${mm[2].padStart(2, '0')}:${(mm[3] || '00')}`;
  } catch (e) {}
  const local = `${Y}-${Mo}-${Da} ${H}:${Mi}:${S}${off}`;
  let utc = local;
  try { utc = new Date(`${Y}-${Mo}-${Da}T${H}:${Mi}:${S}${off}`).toISOString().slice(0, 19).replace('T', ' ') + '+00:00'; } catch (e) {}
  return { local, utc };
}
function tpaStatus(code, content) {
  const c = String(code || '').toUpperCase();
  if (c === 'CX') return 'cancelled';
  if (c === 'DV') return 'diverted';
  if (c === 'DP') return 'departed';
  if (c === 'AR' || c === 'AB' || c === 'AN' || c === 'OB' || c === 'BC') return 'arrived';
  if (c === 'DL') return 'delayed';
  if (c === 'BO' || c === 'GC') return 'boarding';
  const t = String(content || '').replace(/&nbsp;/g, ' ').toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('depart')) return 'departed';
  if (t.includes('bag') || t.includes('arriv') || t.includes('land')) return 'arrived';
  if (t.includes('delay')) return 'delayed';
  if (t.includes('board')) return 'boarding';
  return 'scheduled';
}
function tpaToAdbFlight(f) {
  if (!f || typeof f !== 'object') return null;
  const isDep = String(f.adi || '').toUpperCase() === 'D';
  const _c = (o) => (o && o.content != null ? String(o.content).trim() : '');
  // Codeshare rows pack linecode/number/line as LISTS (arrays or comma-joined
  // strings). Blind String() concatenation shipped flights like ",KL2385,7157"
  // to the board — no recognizable carrier, broken logo, dead branding (Nick's
  // TPA Belt 6 screenshot). Tokenize every multi-value field and pick ONE
  // primary flight instead.
  const _toks = (o) => {
    if (!o || o.content == null) return [];
    const raw = Array.isArray(o.content) ? o.content : String(o.content).split(',');
    return raw.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
  };
  const _codes = _toks(f.linecode).map((c) => c.toUpperCase().replace(/\s+/g, ''));
  const _numToks = _toks(f.number).map((n) => n.toUpperCase().replace(/\s+/g, ''));
  const _names = _toks(f.line);
  // "KL2385" carries its own carrier; a bare "358"/"7157" borrows the linecode
  // at its position (or the row's only linecode). Primary = the first token
  // that resolves to carrier+number, preferring the row's lead linecode so the
  // operator brands the row, not a codeshare partner.
  const _cands = [];
  for (let _i = 0; _i < _numToks.length; _i++) {
    const _m = _numToks[_i].match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])?(\d+[A-Z]?)$/);
    if (!_m || !_m[2]) continue;
    const _cc = _m[1] || _codes[_i] || (_codes.length === 1 ? _codes[0] : '');
    _cands.push({ code: _cc, num: _m[2], name: _names[_i] || _names[0] || '' });
  }
  const _lead = _codes[0] || '';
  const _pick = (_lead && _cands.find((p) => p.code === _lead))
    || _cands.find((p) => p.code)
    || _cands[0] || null;
  const code = _pick ? _pick.code : _lead;
  const num = _pick ? _pick.num : (_numToks[0] || '');
  const number = (code + num) || num;
  if (!number) return null;
  const sched = tpaTimeObj(f.schedule && f.schedule.original);
  const actualIso = f.actual && f.actual.original;
  const revised = (actualIso && f.schedule && actualIso !== f.schedule.original) ? tpaTimeObj(actualIso) : null;
  const airline = { iata: code || null, icao: null, name: (_pick && _pick.name) || _names[0] || null };
  const home = { iata: 'TPA', icao: 'KTPA', name: 'Tampa' };
  // Through-flights list EVERY stop in city (code AND content can be lists).
  // The airport code must be the FIRST stop only — "SFO,LAS" resolved to no
  // airport at all, which killed the weather column and the IATA chip on
  // multi-stop rows (Nick: 'weather does not work'). The display name keeps
  // the full comma list so the destination flip can cycle leg by leg.
  const _cityCodesRaw = (f.city && f.city.code != null) ? f.city.code : '';
  const _cityCodes = (Array.isArray(_cityCodesRaw) ? _cityCodesRaw : String(_cityCodesRaw).split(','))
    .map((x) => String(x == null ? '' : x).trim().toUpperCase()).filter(Boolean);
  // TPA's own list convention (production-proven: 'Denver, Reno',
  // 'Richmond, Las Vegas'): commas separate STOPS; qualifiers use ' - '
  // ('Houston - Intercontinental'). So a comma in city content IS a stop
  // list, array or string alike.
  // ' - Intercontinental' / ' - O'Hare' qualify the airport, not the city; a
  // board shows the city (Nick). Dropped at ingest so every surface — row,
  // gate rail, right card, flip — reads the same clean name.
  const _cityNames = _toks(f.city).map(function (n) {
    return (typeof _cityFromStopLabel === 'function') ? _cityFromStopLabel(n) : n;
  });
  const cityCode = _cityCodes[0] || null;
  // Airport identity = the FIRST stop only. Its name (not a joined list)
  // feeds the ingest's existing reverse-lookup when the feed omits the
  // code, which is what weather, the arrival estimate and the map key on.
  const other = { iata: cityCode, icao: null, name: _cityNames[0] || null };
  // Route list = the feed's own array (codes when it has them, names
  // always) — the flip renders from THIS, never from re-parsed display
  // text. Chip stays off for legs whose code the feed didn't provide.
  const _stopCount = Math.max(_cityCodes.length, _cityNames.length);
  const _stopsList = (_stopCount > 1)
    ? Array.from({ length: _stopCount }, (_, i) => ({ iata: _cityCodes[i] || '', city: _cityNames[i] || '' }))
    : null;
  const claim = _c(f.claim);
  const homeSide = {
    airport: home,
    terminal: (f.airside || '').toUpperCase() || null,     // A/C/E/F concourse
    gate: _c(f.gate) || null,
    ...(!isDep && claim ? { baggageBelt: claim } : {}),     // real carousel # on arrivals
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  return {
    number, callSign: null,
    status: tpaStatus(f.status && f.status.code, f.status && f.status.content),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide,
    ...(_stopsList ? { _stops: _stopsList } : {})
  };
}
// ── YYZ (Toronto Pearson) native feed — torontopearson.com/api/flightsapidata ──
// One list per direction (type=DEP / type=ARR), a full-day snapshot. Times are
// ISO-8601 with the Eastern offset baked in (schTime scheduled, latestTm
// estimated), so adbTs/adbHHMM read them directly — no custom tz handling.
// routes[] lists any via-stops then the final endpoint (destination for DEP,
// origin for ARR). carousel = baggage belt on arrivals. term = T1 / T3.
// Toronto nests every codeshare inside one operating row's `ids[]`, so there
// are NO duplicate codeshare rows to filter — each row is the operator.
function yyzIataFromId2(id2) {
  // id2 is the IATA flight id: "AA1111", "F81600", "2T604", "G36616", "AC7884".
  const m = String(id2 || '').match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])/);
  return m ? m[0] : '';
}
function yyzStatus(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'CAN') return 'cancelled';
  if (c === 'DIV') return 'diverted';
  if (c === 'DEL') return 'delayed';
  if (c === 'DEP') return 'departed';
  if (c === 'BRD' || c === 'BOR' || c === 'BOA' || c === 'GTO' || c === 'GTC' || c === 'FBO') return 'boarding';
  if (c === 'ARR' || c === 'LDD' || c === 'LND' || c === 'BAG' || c === 'ONB') return 'arrived';
  // ONT = on time, SKD/ETD = scheduled/estimated → treat as scheduled
  return 'scheduled';
}
function yyzToAdbFlight(f) {
  if (!f || typeof f !== 'object') return null;
  const isDep = String(f.type || '').toUpperCase() === 'DEP';
  const number = String(f.id2 || f.id || '').trim().toUpperCase();
  if (!number) return null;
  const iata = yyzIataFromId2(number);
  const airline = { iata: iata || null, icao: (f.alCode || '').toUpperCase() || null, name: f.al || null };
  const sched = f.schTime ? { local: f.schTime, utc: f.schTime } : null;
  if (!sched) return null;
  const revised = (f.latestTm && f.latestTm !== f.schTime) ? { local: f.latestTm, utc: f.latestTm } : null;
  const routes = Array.isArray(f.routes) ? f.routes : [];
  // DEP: destination = last route (final), via = earlier stops.
  // ARR: origin = first route, via = later stops.
  let otherR, viaR;
  if (isDep) { otherR = routes[routes.length - 1]; viaR = routes.slice(0, -1); }
  else       { otherR = routes[0];                 viaR = routes.slice(1); }
  const other = otherR
    ? { iata: (otherR.code || '').toUpperCase() || null, icao: null, name: otherR.name || otherR.city || null }
    : { iata: null, icao: null, name: null };
  const home = { iata: 'YYZ', icao: 'CYYZ', name: 'Toronto Pearson' };
  const term = (f.term || '').toUpperCase() || null;          // T1 / T3
  const carousel = (f.carousel != null && f.carousel !== '') ? String(f.carousel) : '';
  const homeSide = {
    airport: home,
    terminal: term,
    gate: (f.gate || '') || null,
    ...(!isDep && carousel ? { baggageBelt: carousel } : {}),  // real belt on arrivals
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  const out = {
    number, callSign: (f.id || null),
    status: yyzStatus(f.status),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
  // Via routing (intermediate stop) — reuse the generic "via <city>" label.
  if (viaR.length) {
    const viaCity = viaR.map(r => (r && (r.city || r.code) || '')).filter(Boolean).join(', ');
    if (viaCity) out._mcoViaStop = viaCity;
    // Feed-code stop list (route order) for the leg-by-leg flip.
    const _yyzStops = routes
      .map(r => ({ iata: String((r && r.code) || '').toUpperCase(), city: (r && (r.city || r.name)) || '' }))
      .filter(s => s.iata || s.city);
    if (_yyzStops.length > 1) out._stops = _yyzStops;
  }
  return out;
}

// ── YUL (Montréal-Trudeau) — ADM apex feed ──────────────────────────────
// The fids-proxy /flights/yul route makes ADM's guest getFlights apex call
// server-side (no CORS upstream, WAF-sensitive headers) and returns raw
// rows; this maps each into the ADB-native shape the board parses.
// Status vocabulary counted off the live feed: On time / Delayed / Early /
// Cancelled / Departed / Arrived.
function yulStatus(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('delay')) return 'delayed';
  if (t.includes('early')) return 'early';
  if (t.includes('depart')) return 'departed';
  if (t.includes('arriv') || t.includes('land')) return 'arrived';
  return 'scheduled';
}
// "AC7738" → "AC" (two-char IATA airline designator, letter+digit forms too)
function yulAirlineIata(number) {
  const m = String(number || '').trim().toUpperCase().match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d/);
  return m ? m[1] : '';
}
function yulToAdbFlight(f) {
  if (!f || typeof f !== 'object') return null;
  const isDep = String(f.ArrivalOrDeparture || '').toUpperCase() !== 'A';
  const number = String(f.PublicDisplayFlightNumber || '').trim().toUpperCase();
  if (!number || !f.ScheduledTime) return null;
  const airline = { iata: yulAirlineIata(number) || null, icao: null, name: f.AirlineName || null };
  // ScheduledTime is Montréal-local ISO ("2026-08-04T07:30:00") — same
  // Eastern-zone math as Tampa/PANYNJ, so tpaTimeObj stamps the offset.
  const sched = tpaTimeObj(f.ScheduledTime);
  if (!sched) return null;
  // Revised: the feed keeps HH:mm strings — actual block time wins, then
  // the estimate (feed spells it "Formated"), then the generic updated
  // time. Rebuilt on the scheduled DATE; a shift of more than 12h in
  // either direction is read as a midnight crossing.
  let revised = null;
  const revHm = String(f.FormattedActualBlockTime || f.FormatedEstimatedBlockTime || f.FormattedUpdatedTime || '').trim();
  const schHm = String(f.FormattedScheduledTime || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(revHm) && revHm !== schHm) {
    const day = String(f.ScheduledTime).slice(0, 10);
    const schMin = parseInt(schHm.slice(0, 2), 10) * 60 + parseInt(schHm.slice(-2), 10);
    const revMin = parseInt(revHm.split(':')[0], 10) * 60 + parseInt(revHm.split(':')[1], 10);
    let d = new Date(day + 'T00:00:00');
    if (revMin - schMin < -720) d.setDate(d.getDate() + 1);      // 23:50 → 00:20
    else if (revMin - schMin > 720) d.setDate(d.getDate() - 1);  // 00:10 → 23:40
    const dayAdj = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    revised = tpaTimeObj(dayAdj + 'T' + revHm.padStart(5, '0') + ':00');
  }
  // "Dubai Int **" — ADM marks some names with asterisks; strip them.
  const otherName = String(f.AirportNameTranslated || f.AirportName || '').replace(/\s*\*+\s*$/, '').trim();
  const other = { iata: String(f.AirportIataCode || '').toUpperCase() || null, icao: null, name: otherName || null };
  const home = { iata: 'YUL', icao: 'CYUL', name: 'Montréal-Trudeau' };
  // The worker enriches the baggage-hall window of arrivals with
  // Terminal_Belt__c from ADM's flight-details apex — a REAL carousel
  // number (Nick proved it on the website: WS2903 -> belt 10).
  const yulBelt = (!isDep && f.TerminalBelt != null && f.TerminalBelt !== '') ? String(f.TerminalBelt) : '';
  const homeSide = {
    airport: home,
    terminal: null,                                  // single-terminal airport
    gate: String(f.TerminalGate || '').trim() || null,
    ...(yulBelt ? { baggageBelt: yulBelt } : {}),
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  return {
    number, callSign: null,
    status: yulStatus(f.OperationalStatusDescription),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
}

// ── YHU (Montréal Saint-Hubert / MET) — terminal JSON API ───────────────
// The fids-proxy /flights/yhu route flattens metmtl.com's flightsByDate
// into raw rows; this maps each into the ADB-native shape. The feed's
// status vocabulary: On time / Delayed / Delayed (Estimated) / Cancelled /
// Arrived (+ safety for departed/diverted phrasing). Arrivals carry REAL
// carousel numbers — they become baggage belts on the BIDS board.
function yhuStatus(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('delay')) return 'delayed';
  if (t.includes('early')) return 'early';
  if (t.includes('depart')) return 'departed';
  if (t.includes('arriv') || t.includes('land')) return 'arrived';
  if (t.includes('board')) return 'boarding';
  return 'scheduled';
}
function yhuToAdbFlight(f) {
  if (!f || typeof f !== 'object' || !f.flightId || !f.flightState) return null;
  const id = f.flightId, st = f.flightState, props = st.properties || {};
  const isDep = String(id.flightKind || '').toLowerCase() !== 'arrival';
  const alIata = String((id.airlineDesignator || {}).iata || '').toUpperCase();
  const number = (alIata + String(id.flightNumber || '')).trim();
  if (!number || !st.scheduledTime) return null;
  const airline = { iata: alIata || null, icao: String((id.airlineDesignator || {}).icao || '').toUpperCase() || null, name: null };
  // Saint-Hubert is Eastern like Tampa/PANYNJ/YUL — tpaTimeObj stamps the offset.
  const sched = tpaTimeObj(st.scheduledTime);
  if (!sched) return null;
  // mostConfidentTime is the airport's own pick of actual > estimate > sched.
  const mct = props.mostConfidentTime || props.actualTime || props.estimatedTime || null;
  const revised = (mct && mct !== st.scheduledTime) ? tpaTimeObj(mct) : null;
  // DEP: destination = last stop; ARR: origin = first stop (route.stops
  // lists the other end; multi-stop legs keep the flip data like YYZ).
  const stops = Array.isArray((st.route || {}).stops) ? st.route.stops : [];
  const otherR = isDep ? stops[stops.length - 1] : stops[0];
  const other = otherR
    ? { iata: String(otherR.iata || '').toUpperCase() || null, icao: String(otherR.icao || '').toUpperCase() || null, name: null }
    : { iata: null, icao: null, name: null };
  const home = { iata: 'YHU', icao: 'CYHU', name: 'Montréal Saint-Hubert' };
  const belt = (!isDep && props.carousel != null && props.carousel !== '') ? String(props.carousel) : '';
  const homeSide = {
    airport: home,
    terminal: null,
    gate: null,                                       // MET publishes no gate field
    ...(belt ? { baggageBelt: belt } : {}),           // real belt on arrivals
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  const out = {
    number, callSign: null,
    status: yhuStatus(props.status || props.remarkDescription),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
  if (stops.length > 1) {
    out._stops = stops.map(r => ({ iata: String((r && r.iata) || '').toUpperCase(), city: '' })).filter(x => x.iata);
  }
  return out;
}

// ── YTZ (Toronto Billy Bishop) — server-rendered board rows ─────────────
// The fids-proxy /flights/ytz route parses Billy Bishop's page into
// { day, date, time, flightNo, city, status, operatorLogo } rows. City
// names arrive with no IATA code, so the finite YTZ route map below
// supplies them; AC's bare "New York"/"Washington" stay honestly unmapped
// (city text still shows) rather than guessing the wrong field. The page
// lists codeshares as duplicate rows on the operator's logo — rows whose
// flight prefix disagrees with the logo airline are marketing dupes and
// are dropped, matching the board's withCodeshared=false posture.
const YTZ_CITY_IATA = {
  'boston, ma': 'BOS', 'chicago-midway, il': 'MDW', 'fredericton, nb': 'YFC',
  'halifax, ns': 'YHZ', 'moncton, nb': 'YQM', 'montréal-met, qc': 'YHU',
  'montreal-met, qc': 'YHU', 'montréal-trudeau, qc': 'YUL', 'montreal-trudeau, qc': 'YUL',
  'nashville, tn': 'BNA', 'new york-newark, nj': 'EWR', 'ottawa, on': 'YOW',
  'quebec city, qc': 'YQB', 'sault ste marie, on': 'YAM', 'thunder bay, on': 'YQT',
  'timmins, on': 'YTS', 'washington-dulles, va': 'IAD', 'windsor, on': 'YQG',
  'boston': 'BOS', 'montreal': 'YUL', 'ottawa': 'YOW', 'quebec city': 'YQB',
  'sudbury, on': 'YSB', 'north bay, on': 'YYB', 'mont-tremblant, qc': 'YTM',
  'stephenville, nl': 'YJT', 'st. john\'s, nl': 'YYT', 'charlottetown, pe': 'YYG', 'charlottetown, pei': 'YYG',
  'burlington, vt': 'BTV', 'myrtle beach, sc': 'MYR', 'orlando-melbourne, fl': 'MLB'
};
function ytzStatus(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('delay') || t.includes('late')) return 'delayed';
  if (t.includes('early')) return 'early';
  if (t.includes('depart')) return 'departed';
  if (t.includes('arriv') || t.includes('land')) return 'arrived';
  if (t.includes('board')) return 'boarding';
  return 'scheduled';
}
function ytzToAdbFlight(f) {
  if (!f || typeof f !== 'object') return null;
  const isDep = String(f.kind || 'dep') !== 'arr';
  const number = String(f.flightNo || '').trim().toUpperCase();
  if (!number || !/^\d{1,2}:\d{2}$/.test(String(f.time || '')) || !f.date) return null;
  const alIata = (number.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d/) || [])[1] || '';
  // Marketing dupes: the row's logo names the OPERATOR; a row whose flight
  // prefix disagrees (TS7402 on the Porter logo) is a codeshare mirror.
  if (f.operatorLogo && alIata && f.operatorLogo !== alIata) return null;
  const airline = { iata: alIata || null, icao: null, name: f.operatorLogo === 'AC' ? 'Air Canada' : 'Porter' };
  // Billy Bishop is Eastern — same offset math as the other native feeds.
  const sched = tpaTimeObj(f.date + 'T' + String(f.time).padStart(5, '0') + ':00');
  if (!sched) return null;
  const cityKey = String(f.city || '').trim().toLowerCase();
  const other = {
    iata: YTZ_CITY_IATA[cityKey] || null, icao: null,
    name: String(f.city || '').replace(/,\s*[A-Z]{2}$/, '').trim() || null
  };
  const home = { iata: 'YTZ', icao: 'CYTZ', name: 'Toronto Billy Bishop' };
  // Gates ride in from the worker's AeroAPI enrichment when the key is
  // configured (Billy Bishop's own board has none; FlightAware carries them).
  const homeSide = { airport: home, terminal: null, gate: String(f.gate || '').trim() || null, scheduledTime: sched, airline, quality: ['Live'] };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  return {
    number, callSign: null,
    status: ytzStatus(f.status),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
}
// ── PANYNJ (LGA / JFK / EWR) — Port Authority GraphQL boards ────────────
// All three NY-area airports share one platform; the fids-proxy worker's
// /flights/panynj route speaks its dialect (LZ-compressed GraphQL, no CORS)
// and returns raw rows. One mapper serves all three — only the home airport
// identity differs.
const PANYNJ_HOME = {
  LGA: { iata: 'LGA', icao: 'KLGA', name: 'New York LaGuardia' },
  JFK: { iata: 'JFK', icao: 'KJFK', name: 'New York JFK' },
  EWR: { iata: 'EWR', icao: 'KEWR', name: 'Newark Liberty' }
};
// Vocabulary counted off the live boards: "On Time", "Delayed", "Cancelled",
// "Departed", "Arrived", "En Route" (arrivals in the air), plus "Scheduled"
// and "Landed" in the client bundle's own strings.
function panynjStatus(s, isDep) {
  const t = String(s || '').trim().toLowerCase();
  if (t.includes('cancel')) return 'cancelled';
  if (t.includes('divert')) return 'diverted';
  if (t.includes('delay')) return 'delayed';
  if (t.includes('depart')) return 'departed';
  // The feed says "Arrived" on DEPARTURE rows too — meaning arrived at the
  // destination. On a departures board that flight has departed.
  if (t.includes('arriv') || t.includes('land')) return isDep ? 'departed' : 'arrived';
  if (t.includes('board') || t.includes('final')) return 'boarding';
  if (t.includes('route')) return 'enroute';
  return 'scheduled';
}
// "2026-07-30" + "06:00 AM" → {local, utc} stamped with the Eastern offset
// for that date. tpaTimeObj already does the ET math — LGA/JFK/EWR live in
// the same zone as Tampa, so the 12h→24h parse is the only new work.
function panynjTimeObj(dateStr, time12) {
  const m = String(time12 || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (!m || !dateStr) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/p/i.test(m[3])) h += 12;
  return tpaTimeObj(`${dateStr}T${String(h).padStart(2, '0')}:${m[2]}:00`);
}
function panynjToAdbFlight(f, direction, ap) {
  if (!f || typeof f !== 'object') return null;
  const isDep = direction === 'Departure';
  const code = String(f.airlineCode || '').trim().toUpperCase();
  const num = String(f.flightNumber == null ? '' : f.flightNumber).trim();
  const number = (code + num) || num;
  if (!number) return null;
  const sched = panynjTimeObj(f.dateScheduled, f.timeScheduled);
  if (!sched) return null;
  const revisedRaw = f.timeRevised
    ? panynjTimeObj(f.dateRevised || f.dateScheduled, f.timeRevised)
    : null;
  const revised = (revisedRaw && revisedRaw.local !== sched.local) ? revisedRaw : null;
  const airline = { iata: code || null, icao: null, name: f.airlineName || null };
  const home = PANYNJ_HOME[ap] || { iata: ap, icao: null, name: ap };
  const otherCode = String((isDep ? f.destinationAirportCode : f.originAirportCode) || '')
    .trim().toUpperCase() || null;
  // "Istanbul, Turkey (IST)" → the board shows the city; the chip shows the
  // code from `other.iata`, so the trailing parenthetical is pure noise.
  const otherName = String((isDep ? f.destinationName : f.originName) || '')
    .replace(/\s*\([A-Z]{3}\)\s*$/, '').trim() || null;
  const other = { iata: otherCode, icao: null, name: otherName };
  const homeSide = {
    airport: home,
    terminal: String(f.terminal || '').trim().toUpperCase() || null,   // LGA/EWR A/B/C, JFK 1/4/5/7/8
    gate: String(f.gate || '').trim().toUpperCase() || null,
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };
  return {
    number, callSign: null,
    status: panynjStatus(f.status, isDep),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide
  };
}

// ── MIA (Miami International) — AirIT WebFIDS ──────────────────────────
// The worker's /miafids route reduces MIA's XML board to flat records; this
// maps one of them into the ADB-native shape the rest of the pipeline eats.
//
// TIME. Every record carries BOTH a local wall-clock string (stt/ett/att,
// no zone) and timeInMillis, which is the true UTC epoch of stt. Rather
// than look Miami's offset up per date the way the Tampa adapter has to, we
// recover it from the pair — timeInMillis minus stt-read-as-UTC IS the
// offset in force for that flight — then apply it to ett/att. Self-correcting
// across the DST boundary, with no timezone table to drift.
function miaTimeShape(localIso, offsetMs) {
  const m = String(localIso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const Y = m[1], Mo = m[2], Da = m[3], H = m[4], Mi = m[5], S = m[6] || '00';
  const sign = offsetMs <= 0 ? '+' : '-';
  const absMin = Math.round(Math.abs(offsetMs) / 60000);
  const off = sign + String(Math.floor(absMin / 60)).padStart(2, '0') + ':' + String(absMin % 60).padStart(2, '0');
  const local = `${Y}-${Mo}-${Da} ${H}:${Mi}:${S}${off}`;
  let utc = local;
  try {
    utc = new Date(Date.parse(`${Y}-${Mo}-${Da}T${H}:${Mi}:${S}Z`) + offsetMs)
      .toISOString().slice(0, 19).replace('T', ' ') + '+00:00';
  } catch (e) {}
  return { local, utc };
}

// MIA's status vocabulary is small and, importantly, NOT what its own client
// assumes. That client switches on the first two characters, so 'De' catches
// both "Delayed" and "Departed" — and the live feed has 84 departures reading
// "Departed" and zero reading "Delayed", so MIA's own board is colouring every
// departed flight as delayed. We match the whole word instead.
//
// The real vocabulary, counted off the live board: "On Time", "Departed H:MMP",
// "Arrived H:MMP", "Now H:MMP", "Cancelled". There is no "Delayed" string at
// all — "Now" is how this feed spells a revised time, and on arrivals it can
// be EARLIER than scheduled (5 of 58 were), so "Now" alone cannot mean late.
// Delay is therefore decided from the clock, not the word.
const MIA_DELAY_MIN = 15;
function miaStatus(statusText, delayMin) {
  const t = String(statusText || '').trim().toLowerCase();
  if (t.startsWith('cancel')) return 'cancelled';
  if (t.startsWith('divert')) return 'diverted';
  if (t.startsWith('depart')) return 'departed';
  if (t.startsWith('arriv') || t.startsWith('land')) return 'arrived';
  if (t.startsWith('board')) return 'boarding';
  if (t.startsWith('delay')) return 'delayed';
  if (delayMin >= MIA_DELAY_MIN) return 'delayed';
  return 'scheduled';
}

function miaToAdbFlight(f, direction) {
  if (!f || typeof f !== 'object') return null;
  const isDep = direction === 'Departure';
  const code = String(f.CXR || '').trim().toUpperCase();
  const trn = String(f.TRN || '').trim();
  const number = (code + trn) || trn;
  if (!number) return null;

  const ms = parseInt(f.timeInMillis, 10);
  const sttMs = Date.parse(String(f.stt || '') + 'Z');
  const offsetMs = (isFinite(ms) && isFinite(sttMs)) ? (ms - sttMs) : 0;

  const sched = miaTimeShape(f.stt, offsetMs);
  // att (actual) outranks ett (estimated) once the movement has happened.
  const revisedSrc = f.att || f.ett || '';
  const revised = (revisedSrc && revisedSrc !== f.stt) ? miaTimeShape(revisedSrc, offsetMs) : null;
  let delayMin = 0;
  if (revisedSrc && f.stt) {
    const d = Date.parse(revisedSrc + 'Z') - Date.parse(String(f.stt) + 'Z');
    if (isFinite(d)) delayMin = Math.round(d / 60000);
  }

  const airline = { iata: code || null, icao: null, name: f.airlineName || null };
  const home = { iata: 'MIA', icao: 'KMIA', name: 'Miami' };
  // MIA writes city names in caps with an airport qualifier after a dash
  // ("NEW YORK - JFK"). Strip the qualifier the way the Tampa ingest does,
  // then case it — every other feed on the board delivers title case, and a
  // row reading "ASHEVILLE" next to one reading "Toronto" shouts. Short
  // all-caps tokens that are airport/─code-like (JFK, LGA) keep their caps;
  // the usual small words stay lower unless they lead.
  let cityName = String(f.city || '').trim();
  if (typeof _cityFromStopLabel === 'function') cityName = _cityFromStopLabel(cityName);
  // MIA also tacks a state or country on after a comma — "AUSTIN, TX",
  // "DUBAI, AE", "COLUMBUS, OHIO". A board shows the city, and the IATA chip
  // beside it already disambiguates the two Barcelonas (BCN vs BLA), so the
  // qualifier is noise. Only stripped when what follows the comma is short
  // enough to BE a qualifier — a genuine comma in a city name survives.
  const _cm = cityName.match(/^(.+?),\s*([A-Za-z.\s]{2,8})$/);
  if (_cm) cityName = _cm[1].trim();
  if (cityName && cityName === cityName.toUpperCase()) {
    const SMALL = { OF: 1, THE: 1, AND: 1, DE: 1, DEL: 1, DA: 1, DI: 1, LA: 1, LE: 1, EL: 1 };
    cityName = cityName.split(/\s+/).map(function (w, i) {
      if (/^[A-Z]{3}$/.test(w) && i > 0 && !SMALL[w]) return w;      // JFK, LGA, MSY
      if (i > 0 && SMALL[w]) return w.toLowerCase();
      if (/^(ST|MT|FT)\.?$/.test(w)) return w.charAt(0) + w.slice(1).toLowerCase() + (w.endsWith('.') ? '' : '.');
      return w.charAt(0) + w.slice(1).toLowerCase();
    }).join(' ')
      // O'HARE → O'Hare, WINSTON-SALEM → Winston-Salem
      .replace(/([A-Za-z])(['’-])([a-z])/g, function (_, a, p, c) { return a + p + c.toUpperCase(); });
  }
  const other = { iata: String(f.CTY || '').trim().toUpperCase() || null, icao: null, name: cityName || null };

  const bags = String(f.bags || '').trim();
  const homeSide = {
    airport: home,
    terminal: String(f.terminal || '').trim().toUpperCase() || null,
    gate: String(f.gate || '').trim().toUpperCase() || null,
    ...(!isDep && bags ? { baggageBelt: bags } : {}),
    scheduledTime: sched,
    ...(revised ? { revisedTime: revised } : {}),
    airline, quality: ['Live']
  };
  // v23233 — no fabricated far-side time: the feed only knows the local
  // movement clock, and echoing it painted every card "Arr == Dep".
  const otherSide = { airport: other, airline, quality: ['Live'] };

  const out = {
    number, callSign: null,
    status: miaStatus(f.status, delayMin),
    codeshareStatus: 'IsOperator', isCargo: false,
    departure: isDep ? homeSide : otherSide,
    arrival: isDep ? otherSide : homeSide,
  };
  // The feed hands us the airframe outright — no AeroDataBox enrichment pass
  // needed here, unlike MCO. This is what drives the gate screen's aircraft
  // illustration and the tail number.
  if (f.TYP) out.aircraft = { model: String(f.TYP).trim() };
  if (f.REG) out.reg = String(f.REG).trim().toUpperCase();
  return out;
}

async function adbFetch(iata, direction) {
  // ── MIA: Miami's own WebFIDS board via our worker ───────────────────
  // Same-origin (/miafids), so no CORS and no third-party dependency at
  // display time. The worker caches, so screens polling together cost MIA
  // one request. Carries real gate + terminal + aircraft type + tail.
  if (iata === 'MIA') {
    const wantDep = direction === 'Departure';
    const miaUrl = '/miafids?direction=' + (wantDep ? 'dep' : 'arr');
    try {
      const r = await fetch(miaUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        const list = rows.map(f => miaToAdbFlight(f, direction)).filter(Boolean);
        console.log(`[FIDS] MIA WebFIDS ${direction}: ${list.length} flights`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn('[FIDS] MIA feed empty — falling back to ADB scrape');
      } else {
        console.warn(`[FIDS] MIA feed HTTP ${r.status} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] MIA feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── YYZ: Toronto Pearson's own feed via the worker proxy ────────────
  // Toronto's feed sends no CORS header, so the browser can't read it
  // directly ("Failed to fetch"). The fids-proxy worker fetches it
  // server-side (today + tomorrow merged) and returns { list:[...] } with
  // CORS, which we map here with yyzToAdbFlight().
  if (iata === 'YYZ') {
    const wantDep = direction === 'Departure';
    const dir = wantDep ? 'dep' : 'arr';
    const yyzUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/yyz?direction=${dir}`;
    try {
      const r = await fetch(yyzUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        const list = rows
          .filter(f => (String(f.type || '').toUpperCase() === 'DEP') === wantDep)
          .map(yyzToAdbFlight).filter(Boolean);
        console.log(`[FIDS] YYZ feed ${direction}: ${list.length} flights`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn('[FIDS] YYZ feed empty — falling back to ADB scrape');
      } else {
        const _b = await r.text().catch(() => '');
        console.warn(`[FIDS] YYZ proxy HTTP ${r.status} — ${_b.slice(0, 200)} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] YYZ feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── YUL: Montréal-Trudeau's ADM apex feed via the worker proxy ──────
  // ADM's Salesforce endpoint has no CORS and a WAF that rejects browser
  // fingerprints; the fids-proxy /flights/yul route calls it server-side
  // and returns { list:[...] } mapped here with yulToAdbFlight().
  if (iata === 'YUL') {
    const wantDep = direction === 'Departure';
    const dir = wantDep ? 'dep' : 'arr';
    const yulUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/yul?direction=${dir}`;
    try {
      const r = await fetch(yulUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        const list = rows
          .filter(f => (String(f.ArrivalOrDeparture || '').toUpperCase() !== 'A') === wantDep)
          .map(yulToAdbFlight).filter(Boolean);
        console.log(`[FIDS] YUL feed ${direction}: ${list.length} flights`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn('[FIDS] YUL feed empty — falling back to ADB scrape');
      } else {
        const _b = await r.text().catch(() => '');
        console.warn(`[FIDS] YUL proxy HTTP ${r.status} — ${_b.slice(0, 200)} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] YUL feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── YHU: Saint-Hubert's MET terminal API via the worker proxy ───────
  // Clean JSON upstream but no CORS; /flights/yhu flattens flightsByDate
  // server-side and rows map here with yhuToAdbFlight(). Real carousel
  // numbers ride along on arrivals.
  if (iata === 'YHU') {
    const wantDep = direction === 'Departure';
    const dir = wantDep ? 'dep' : 'arr';
    const yhuUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/yhu?direction=${dir}`;
    try {
      const r = await fetch(yhuUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        const list = rows
          .filter(f => (String(((f || {}).flightId || {}).flightKind || '').toLowerCase() !== 'arrival') === wantDep)
          .map(yhuToAdbFlight).filter(Boolean);
        console.log(`[FIDS] YHU feed ${direction}: ${list.length} flights`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn('[FIDS] YHU feed empty — falling back to ADB scrape');
      } else {
        const _b = await r.text().catch(() => '');
        console.warn(`[FIDS] YHU proxy HTTP ${r.status} — ${_b.slice(0, 200)} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] YHU feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── YTZ: Billy Bishop's server-rendered board via the worker proxy ──
  // No JSON API upstream; /flights/ytz parses the page rows server-side
  // and they map here with ytzToAdbFlight() (codeshare mirrors dropped).
  if (iata === 'YTZ') {
    const wantDep = direction === 'Departure';
    const dir = wantDep ? 'dep' : 'arr';
    const ytzUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/ytz?direction=${dir}`;
    try {
      const r = await fetch(ytzUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        const list = rows.map(ytzToAdbFlight).filter(Boolean);
        console.log(`[FIDS] YTZ feed ${direction}: ${list.length} flights`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn('[FIDS] YTZ feed empty — falling back to ADB scrape');
      } else {
        const _b = await r.text().catch(() => '');
        console.warn(`[FIDS] YTZ proxy HTTP ${r.status} — ${_b.slice(0, 200)} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] YTZ feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── LGA / JFK / EWR: Port Authority boards via the worker proxy ─────
  // Their GraphQL API sends no CORS header and wants an LZ-compressed
  // body, so the fids-proxy worker translates; the browser reads plain
  // { list:[...] } and maps rows with panynjToAdbFlight().
  if (iata === 'LGA' || iata === 'JFK' || iata === 'EWR') {
    const wantDep = direction === 'Departure';
    const dir = wantDep ? 'dep' : 'arr';
    const pjUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/panynj?ap=${iata}&direction=${dir}`;
    try {
      const r = await fetch(pjUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.list) ? j.list : [];
        // The feed lists EVERY codeshare as its own row (a JFK Wednesday
        // measured 2,646 departure rows). Physically-same movements share
        // time + other airport (+ gate, when two real flights leave for the
        // same city in the same minute). Picking the OPERATOR out of each
        // bucket needs two signals together, measured against live data:
        //   • number range — marketing codeshares mostly ride 3000–9999,
        //     but not always (Volaris "Y4 2606" on Frontier metal), and
        //     real operators also fly 3000+ (that same Frontier is F9 3423);
        //   • operating presence — a real operator has dozens-to-hundreds
        //     of rows at its airport, a pure-codeshare carrier a handful
        //     (British Airways "flies" LGA five times on paper, zero in
        //     metal — LGA has no transatlantic service at all).
        // Rule: rows with number <3000 AND carrier presence ≥2 are the
        // operator candidates (falling back to the whole bucket when none
        // qualify); among candidates the carrier with the biggest presence
        // wins, lowest number breaking ties. This resolves every observed
        // case, including keeping Aeroméxico's REAL JFK flights while
        // dropping its 30 Delta-metal codeshare rows.
        const _numOf = (f) => parseInt(f.flightNumber, 10) || 1e9;
        const _presence = {};
        for (const f of rows) {
          const c = String(f.airlineCode || '').toUpperCase();
          _presence[c] = (_presence[c] || 0) + 1;
        }
        const _presOf = (f) => _presence[String(f.airlineCode || '').toUpperCase()] || 0;
        // MAINLINE presence (rows numbered <1000) is the honest signal:
        // raw row counts lie once codeshares inflate a marketing carrier
        // past the operator (Qatar's 205 paper rows at JFK vs JetBlue's
        // real fleet), while number ranges alone hand regional metal (AA
        // Eagle 4479, UA Express 3656) to low-numbered codeshares (BA
        // "1916", Avianca "2137"). Chain: mainline presence → raw presence
        // → lowest number. One exclusion: a bucket containing a sub-1000
        // flight drops its 7000+ rows first, so Aeroméxico 405 beats the
        // Delta 8xxx riding on it despite Delta's fleet size.
        const _lowPresence = {};
        for (const f of rows) {
          if (_numOf(f) < 1000) {
            const c = String(f.airlineCode || '').toUpperCase();
            _lowPresence[c] = (_lowPresence[c] || 0) + 1;
          }
        }
        const _lowPresOf = (f) => _lowPresence[String(f.airlineCode || '').toUpperCase()] || 0;
        const _beats = (f, a) => {
          const lf = _lowPresOf(f), la = _lowPresOf(a);
          if (lf !== la) return lf > la;
          const pf = _presOf(f), pa = _presOf(a);
          if (pf !== pa) return pf > pa;
          return _numOf(f) < _numOf(a);
        };
        const _pickOperator = (b) => {
          // A sub-1000 number in the bucket IS the operator: mainline
          // international flights fly 1–999 (QR 706, VS 4, AM 405, BA 112)
          // and marketing codeshares essentially never do — without this,
          // JetBlue's codeshare "B6 6595" on Qatar's own Doha departure
          // outweighs QR 706 on fleet size alone.
          const low = b.filter((f) => _numOf(f) < 1000);
          const cands = low.length ? low : b;
          return cands.reduce((a, f) => (_beats(f, a) ? f : a));
        };
        const buckets = {};
        for (const f of rows) {
          const k = [f.dateScheduled, f.timeScheduled,
            (wantDep ? f.destinationAirportCode : f.originAirportCode) || ''].join('|');
          (buckets[k] = buckets[k] || []).push(f);
        }
        const keep = [];
        for (const k in buckets) {
          const b = buckets[k];
          const byGate = {};
          const gateless = [];
          for (const f of b) {
            const g = String(f.gate || '').trim();
            if (g) (byGate[g] = byGate[g] || []).push(f);
            else gateless.push(f);
          }
          const gates = Object.keys(byGate);
          if (!gates.length) {
            keep.push(_pickOperator(b));
            continue;
          }
          // gateless rows (codeshares often omit the gate) join the subgroup
          // whose operator candidate is strongest
          if (gateless.length) {
            let best = gates[0];
            for (const g of gates) {
              if (_beats(_pickOperator(byGate[g]), _pickOperator(byGate[best]))) best = g;
            }
            byGate[best].push(...gateless);
          }
          for (const g of gates) keep.push(_pickOperator(byGate[g]));
        }
        // Second pass: codeshare rows sometimes carry a DIFFERENT scheduled
        // time than the operator's row (Air France "2102" at 1:45 for a
        // Delta 1:59 departure; Qatar's 200 JetBlue-metal rows at JFK), so
        // they never share a bucket and survive pass one. Physics closes
        // the gap: two flights cannot leave the SAME GATE for the SAME CITY
        // within 30 minutes — rows that do are one movement, and presence
        // picks the operator again. Gateless strays get the same ±30 min
        // same-destination test, dropped only against a carrier with 5x
        // their presence (so a real flight never loses to a peer).
        const _minsOf = (f) => {
          const m = String(f.timeScheduled || '').match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i);
          if (!m) return null;
          return ((parseInt(m[1], 10) % 12) + (/p/i.test(m[3]) ? 12 : 0)) * 60 + parseInt(m[2], 10);
        };
        const _otherOf = (f) => (wantDep ? f.destinationAirportCode : f.originAirportCode) || '';
        const kept = [];
        for (const f of keep) {
          const fm = _minsOf(f), fg = String(f.gate || '').trim();
          let winner = true;
          for (const g of keep) {
            if (g === f || _otherOf(g) !== _otherOf(f)) continue;
            const gm = _minsOf(g);
            if (fm == null || gm == null || Math.abs(fm - gm) > 30) continue;
            const gg = String(g.gate || '').trim();
            const sameGate = fg && gg && fg === gg;
            // Gateless drop needs BOTH a crushing presence gap AND a
            // codeshare-range number (≥2000): unassigned-gate rows are also
            // what real international mainline flights look like hours out
            // (VS 4 to Heathrow, QR 706 to Doha), and those must never lose
            // to a bigger carrier that happens to fly the same city.
            const crushed = _numOf(f) >= 2000
              && Math.max(_lowPresOf(g), 1) >= Math.max(_lowPresOf(f), 1) * 5;
            if ((sameGate || (!fg && crushed)) && _beats(g, f)) {
              winner = false;
              break;
            }
          }
          if (winner) kept.push(f);
        }
        const list = kept.map(f => panynjToAdbFlight(f, direction, iata)).filter(Boolean);
        console.log(`[FIDS] ${iata} PANYNJ feed ${direction}: ${list.length} flights (${rows.length} raw rows)`);
        if (list.length) return wantDep ? { departures: list } : { arrivals: list };
        console.warn(`[FIDS] ${iata} PANYNJ feed empty — falling back to ADB scrape`);
      } else {
        const _b = await r.text().catch(() => '');
        console.warn(`[FIDS] ${iata} PANYNJ proxy HTTP ${r.status} — ${_b.slice(0, 200)} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] ${iata} PANYNJ feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── TPA: Tampa's own flight-status feed instead of AeroDataBox ──────
  if (iata === 'TPA') {
    const wantDep = direction === 'Departure';
    // Tampa's Acquia edge caches this endpoint hard, keyed on the `cache=`
    // query token. Their own site rotates that token every visit so it always
    // gets a fresh origin response; a fixed token replays a days-old snapshot
    // (we saw the feed stuck ~9 days stale). Generate a novel token per fetch
    // — a cache MISS forces Acquia to regenerate from live data.
    const _cb = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    const url = 'https://tampaairportwebprod.prod.acquia-sites.com/api/flight-status?cache=' + _cb;
    try {
      const r = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const j = await r.json();
        const rows = Array.isArray(j && j.data) ? j.data : (Array.isArray(j) ? j : []);
        const list = rows
          .filter(f => (String(f.adi || '').toUpperCase() === 'D') === wantDep)
          .map(tpaToAdbFlight).filter(Boolean);
        console.log(`[FIDS] TPA feed ${direction}: ${list.length} flights`);
        if (list.length) {
          // Same webhook aircraft merge as Moncton — no-ops until a KTPA
          // Flight-Alert subscription feeds the cache.
          try { await _yqmCacheAircraftMerge(list, direction, 'KTPA'); } catch (e2) {}
          return wantDep ? { departures: list } : { arrivals: list };
        }
        console.warn('[FIDS] TPA feed empty — falling back to ADB scrape');
      } else {
        console.warn(`[FIDS] TPA feed HTTP ${r.status} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] TPA feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── YQM: Moncton's own cyqm.ca feed instead of AeroDataBox ──────────
  if (iata === 'YQM') {
    const seg = direction === 'Departure' ? 'departures' : 'arrivals';
    const yqmUrl = `https://www.cyqm.ca/wp-json/ch-flight-data/v1/flights/${seg}`;
    try {
      const r = await fetch(yqmUrl, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const raw = await r.json();
        const rows = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.flights) ? raw.flights : []);
        const list = rows.map(f => yqmToAdbFlight(f, direction)).filter(Boolean);
        console.log(`[FIDS] YQM cyqm.ca feed ${direction}: ${list.length} flights`);
        if (list.length) {
          // The CYQM webhook subscription was wired but BYPASSED the moment
          // the native feed adopted (Nick: 'are we still using webhooks').
          // Pushes carry the reg — the exact field neither cyqm.ca nor
          // ADB's by-number endpoint served for PD2293 (console: 'Direct
          // inbound resolved: PD2293 reg: (pending)' while the portal
          // showed C-GKQE). Merge ONLY the airframe identity back in.
          try { await _yqmCacheAircraftMerge(list, direction, 'CYQM'); } catch (e2) {}
          return direction === 'Departure' ? { departures: list } : { arrivals: list };
        }
        console.warn('[FIDS] YQM cyqm.ca feed empty — falling back to ADB scrape');
      } else {
        console.warn(`[FIDS] YQM cyqm.ca feed HTTP ${r.status} — falling back to ADB scrape`);
      }
    } catch (e) {
      console.warn(`[FIDS] YQM cyqm.ca feed: ${e.message} — falling back to ADB scrape`);
    }
  }
  // ── MCO: native GOAA feed instead of the ADB scrape ─────────────────
  // Orlando isn't an ADB airport for us — the worker proxies MCO's own
  // flights API (api.goaa.aero) at /flights/mco and returns it in the
  // exact ADB-native shape this function otherwise produces, so the rest
  // of the pipeline is unchanged. Carries real gate/terminal/belt data.
  if (iata === 'MCO') {
    const dir = direction === 'Departure' ? 'dep' : 'arr';
    const mcoUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/mco?direction=${dir}`;
    try {
      // v23099 — ONE RETRY, SHORT BACKOFF. On a freshly rebooted stream box
      // localStorage is empty (run.sh still wipes the profile), so a single
      // dropped request used to blank the board for a whole 5-minute poll
      // cycle with no error anywhere — Nick: 'MCO is down again'. Measured:
      // the feed itself is healthy (872 dep / 761 arr, CORS correct); the
      // board just gave up on the first miss.
      let r = await fetch(mcoUrl).catch(function () { return null; });
      if (!r || !r.ok) {
        await new Promise(function (rs) { setTimeout(rs, 4000); });
        r = await fetch(mcoUrl);
      }
      if (r.ok) {
        const json = await r.json();
        let list = direction === 'Departure' ? (json.departures || []) : (json.arrivals || []);
        const homeKey = direction === 'Departure' ? 'departure' : 'arrival';
        // ── Collapse multi-leg "via" rows into one, reconstruct routing ────
        // A through-flight (MCO→LAS→SMF) comes back as one row per downstream
        // leg — same flight number, same departure time — which reads as a
        // duplicate on the board. Group by physical MCO movement (number +
        // scheduled time), then from the via chain (each leg carries its stop
        // + sequence) show the FINAL destination with the intermediate stop
        // noted: "SMF (via LAS)". Departures only; arrivals just de-dupe.
        const groups = {};
        for (const f of list) {
          const side = f[homeKey] || {};
          const t = (side.scheduledTime && (side.scheduledTime.utc || side.scheduledTime.local)) || '';
          const k = (f.number || '') + '|' + t;
          (groups[k] = groups[k] || []).push(f);
        }
        list = Object.keys(groups).map(k => {
          const legs = groups[k].slice().sort((a, b) => ((a._mcoViaSeq || 0) - (b._mcoViaSeq || 0)));
          const rep = legs[0];  // all legs share the MCO gate/terminal/time
          if (direction === 'Departure' && legs.length > 1) {
            const stops = legs.map(l => l._mcoVia).filter(Boolean);   // sorted by seq
            const finalDest = stops[stops.length - 1];                // last stop = destination
            const vias = stops.slice(0, -1);                          // earlier = intermediate
            if (finalDest && rep.arrival && rep.arrival.airport) rep.arrival.airport.iata = finalDest;
            if (vias.length) rep._mcoViaStop = vias.join(', ');
            // Feed-code stop list (route order, final last) for the flip.
            if (stops.length > 1) rep._stops = stops.map(c => ({ iata: c, city: '' }));
          }
          return rep;
        });
        // ── Fill the Terminal column with the terminal LETTER (A/B/C) ──────
        // Prefer the feed's own terminal letter (authoritative — that's where
        // check-in / baggage claim is). Only when the feed leaves it blank do
        // we derive it from the gate number as a fallback.
        for (const f of list) {
          const side = f[homeKey];
          if (!side) continue;
          // Emit the plain terminal LETTER (A/B/C). NOT "Terminal A" — the
          // downstream belt synthesis strips a leading "T" (T1→1), which would
          // mangle "Terminal A" into "erminal A" and corrupt the carousel.
          const raw = (side.terminal == null ? '' : String(side.terminal)).trim().toUpperCase();
          const letter = /^[ABC]$/.test(raw) ? raw : mcoTerminal(side.gate);
          side.terminal = letter || (raw || null);
        }
        // ── Enrich with AeroDataBox (USE BOTH SERVICES) ────────────────────
        // The GOAA feed carries the real gates/terminal/belt but NO aircraft
        // type, registration or live position — so gate screens came up blank.
        // Pull those from the matching ADB flight while keeping the feed's
        // gate data authoritative. Best-effort: if ADB is empty/rate-limited
        // for MCO the feed still shows on its own. (Flights neither service
        // has aircraft for — some smaller carriers — stay blank; unavoidable.)
        try {
          const _tz = (AP[iata] || {}).tz || null;
          const _now = new Date();
          const _past  = new Date(_now.getTime() - 2 * 3600000);
          const _mid   = new Date(_now.getTime() + 10 * 3600000);
          const _ahead = new Date(_now.getTime() + 22 * 3600000);
          const _a1 = await adbFetchWindow(iata, direction, fmt12(_past, _tz), fmt12(_mid, _tz));
          await new Promise(r => setTimeout(r, 1200));
          const _a2 = await adbFetchWindow(iata, direction, fmt12(_mid, _tz), fmt12(_ahead, _tz));
          const _adbList = [
            ...(direction === 'Departure' ? (_a1.departures || []) : (_a1.arrivals || [])),
            ...(direction === 'Departure' ? (_a2.departures || []) : (_a2.arrivals || []))
          ];
          // Match on flight number + scheduled time to the minute.
          const _mcoKey = (f) => {
            const num = String(f.number || '').replace(/\s+/g, '').toUpperCase();
            const s = direction === 'Departure' ? f.departure : f.arrival;
            const utc = (s && s.scheduledTime && (s.scheduledTime.utc || s.scheduledTime.local)) || '';
            return num ? (num + '|' + String(utc).slice(0, 16)) : '';
          };
          const _adbByKey = {};
          for (const af of _adbList) { const k = _mcoKey(af); if (k && !_adbByKey[k]) _adbByKey[k] = af; }
          let _enriched = 0;
          for (const ff of list) {
            const af = _adbByKey[_mcoKey(ff)];
            if (!af) continue;
            if (af.aircraft && !ff.aircraft) ff.aircraft = af.aircraft;
            if (af.reg && !ff.reg) ff.reg = af.reg;
            if (af.callSign && !ff.callSign) ff.callSign = af.callSign;
            if (af.location && !ff.location) ff.location = af.location;
            _enriched++;
          }
          console.log(`[FIDS] MCO ADB enrich ${direction}: ${_enriched}/${list.length} flights got aircraft/position`);
        } catch (e) {
          console.warn(`[FIDS] MCO ADB enrich ${direction}: ${e.message} — feed shows without aircraft/position`);
        }
        // Same webhook aircraft merge as Moncton/TPA (Nick: 'we best check
        // MCO as well') — no-ops until a KMCO Flight-Alert subscription
        // feeds the cache. MCO's window-scoped enrichment above is already
        // foreign-leg-proof (airport-scoped list, minute-keyed match); this
        // adds the push path for tails ADB's scrape misses.
        try { await _yqmCacheAircraftMerge(list, direction, 'KMCO'); } catch (e3) {}
        console.log(`[FIDS] MCO feed ${iata} ${direction}: ${list.length} flights (deduped)`);
        // Cache this good GOAA result so a transient blip on the next poll
        // returns the last-known GOAA list instead of swapping the whole board
        // to ADB's conflicting gate assignments (that was the Delta↔Frontier
        // flip-flop on gate 71). GOAA is the ONLY source for the flight list;
        // ADB is enrichment only.
        const _mcoOut = direction === 'Departure' ? { departures: list } : { arrivals: list };
        window._mcoLastGood = window._mcoLastGood || {};
        window._mcoLastGood[dir] = _mcoOut;
        // Persist across page loads: a fresh load with GOAA momentarily down
        // must serve GOAA's OWN recent list, never a different source.
        try { localStorage.setItem('fids_mco_lastgood_' + dir, JSON.stringify({ ts: Date.now(), out: _mcoOut })); } catch (e) {}
        return _mcoOut;
      }
      // Non-OK — NEVER fall through to the ADB scrape (Nick: 'the two systems
      // are fighting — Orlando vs ADB'; the gate flipped American↔United on
      // load). Order: this session's last-good → localStorage last-good
      // (≤15 min) → EMPTY list. An empty cycle self-heals on the next poll;
      // a wrong-airline gate does not.
      console.warn(`[FIDS] MCO feed ${iata} ${direction}: HTTP ${r.status} — GOAA-only fallback chain`);
      return _mcoFallback(direction, dir);
    } catch (e) {
      console.warn(`[FIDS] MCO feed ${iata} ${direction}: ${e.message} — GOAA-only fallback chain`);
      return _mcoFallback(direction, dir);
    }
    function _mcoFallback(direction, dir) {
      if (window._mcoLastGood && window._mcoLastGood[dir]) return window._mcoLastGood[dir];
      try {
        var _ls = JSON.parse(localStorage.getItem('fids_mco_lastgood_' + dir) || 'null');
        // v23099 — the cap was 15 minutes, after which an outage flipped the
        // board to EMPTY. A stale GOAA list beats a blank public display:
        // the row pipeline already drops past flights, so a few-hours-old
        // list still reads correctly, and the GOAA-only rule (never ADB for
        // the list) is preserved. 3-hour ceiling so a day-old list can't show.
        if (_ls && _ls.out && (Date.now() - _ls.ts) < 180 * 60000) {
          console.warn('[FIDS] MCO: GOAA down — serving localStorage last-good (' + Math.round((Date.now() - _ls.ts) / 60000) + 'min old)');
          return _ls.out;
        }
      } catch (e2) {}
      console.warn('[FIDS] MCO: GOAA down, no usable cache — EMPTY list this cycle (never ADB for the list)');
      return direction === 'Departure' ? { departures: [] } : { arrivals: [] };
    }
  }
  // ── ADB SCRAPE: source of truth for the flight LIST ─────────────────
  // The airport scrape gives us the complete schedule for the lookahead
  // window. We always do this — cache cannot replace it because webhooks
  // only deliver updates for flights that already exist in ADB's system.
  const tz = (AP[iata] || {}).tz || null;
  const now=new Date(),
        past=new Date(now.getTime()-2*3600000),
        mid=new Date(now.getTime()+10*3600000),
        ahead=new Date(now.getTime()+22*3600000);
  const r1 = await adbFetchWindow(iata, direction, fmt12(past, tz), fmt12(mid, tz));
  await new Promise(r => setTimeout(r, 1500));
  const r2 = await adbFetchWindow(iata, direction, fmt12(mid, tz), fmt12(ahead, tz));
  const key=f=>(f.number||'')+'|'+(f.departure?.scheduledTime?.utc||f.arrival?.scheduledTime?.utc||'');
  const seen=new Set();
  const merge=(raw)=>{
    const list=direction==='Departure'?(raw.departures||[]):(raw.arrivals||[]);
    return list.filter(f=>{const k=key(f);if(seen.has(k))return false;seen.add(k);return true;});
  };
  const scrapeList = [...merge(r1),...merge(r2)];

  // ── CACHE OVERLAY: merge in fresher webhook-fed records ─────────────
  // For each cached flight, find the matching scrape entry and replace it
  // (cache has fresher status/reg/gate from real-time pushes). Cached
  // entries with no matching scrape entry are dropped — webhooks can
  // deliver stale records ADB no longer considers active.
  const _CACHED_AIRPORTS = { 'YQM': 'CYQM' };
  const cachedIcao = _CACHED_AIRPORTS[iata];
  if (cachedIcao && scrapeList.length > 0) {
    try {
      const dirParam = direction === 'Departure' ? 'dep' : 'arr';
      const cacheUrl = `https://fids-proxy.n-leblanc1984.workers.dev/flights/cached/${cachedIcao}?direction=${dirParam}`;
      const cacheR = await fetch(cacheUrl);
      if (cacheR.status === 200) {
        const cacheJson = await cacheR.json();
        if (cacheJson && Array.isArray(cacheJson.flights) && cacheJson.flights.length > 0) {
          // Freshness gate — drop webhook records >90 min old
          const cutoffMs = Date.now() - 90 * 60 * 1000;
          const fresh = cacheJson.flights.filter(rec => {
            try { return new Date(rec.received_at).getTime() >= cutoffMs; } catch(e) { return false; }
          });
          // Normalize webhook integer enums to airport-scrape string format.
          // CRITICAL: every value here must match what downstream code looks for
          // when it does `f.status === 'cancelled'` etc. The whole codebase uses
          // lowercase British spellings ('cancelled' not 'Canceled'). Previous
          // version returned PascalCase American 'Canceled' — that meant
          // cancellations from the Moncton webhook silently never propagated to
          // the board (e.g. AC1985 stayed showing as scheduled even after it
          // was cancelled, AC7753 might have been filtered out entirely).
          const _STATUS_ENUM = {
            0: 'scheduled',     // Unknown → treat as scheduled (safe default)
            1: 'scheduled',     // Expected
            2: 'active',        // EnRoute (in flight)
            3: 'scheduled',     // CheckIn (pre-boarding)
            4: 'boarding',      // Boarding
            5: 'gateclosed',    // GateClosed
            6: 'departed',      // Departed
            7: 'delayed',       // Delayed
            8: 'active',        // Approaching (still airborne, near arrival)
            9: 'arrived',       // Arrived
            10: 'cancelled',    // Canceled — was 'Canceled' (American), now matches British 'cancelled' the rest of the code uses
            11: 'diverted',     // Diverted
            12: 'cancelled'     // CanceledUncertain — treat as cancelled too. Better to over-mark as cancelled than under-mark
          };
          const _CSSTATUS_ENUM = { 0: 'Unknown', 1: 'IsOperator', 2: 'IsCodeshared' };
          const _QUALITY_ENUM = {
            0: 'Basic', 1: 'Live', 2: 'LiveBasicAircraft', 3: 'LiveFull', 4: 'LiveSchedule'
          };
          const _normQ = (q) => Array.isArray(q) ? q.map(x => typeof x === 'number' ? (_QUALITY_ENUM[x] || String(x)) : x) : q;
          const _norm = (f) => {
            if (!f || typeof f !== 'object') return f;
            if (typeof f.status === 'number') f.status = _STATUS_ENUM[f.status] || String(f.status);
            if (typeof f.codeshareStatus === 'number') f.codeshareStatus = _CSSTATUS_ENUM[f.codeshareStatus] || String(f.codeshareStatus);
            if (f.departure && Array.isArray(f.departure.quality)) f.departure.quality = _normQ(f.departure.quality);
            if (f.arrival && Array.isArray(f.arrival.quality)) f.arrival.quality = _normQ(f.arrival.quality);
            return f;
          };
          // Build lookup by key; when a cached flight matches a scraped one, overlay
          const cacheByKey = {};
          for (const rec of fresh) {
            const cf = _norm(rec.flight);
            if (cf) cacheByKey[key(cf)] = cf;
          }
          let overlaidCount = 0;
          for (let i = 0; i < scrapeList.length; i++) {
            const k = key(scrapeList[i]);
            if (cacheByKey[k]) {
              scrapeList[i] = cacheByKey[k];
              overlaidCount++;
            }
          }
          if (overlaidCount > 0) {
            console.log(`[FIDS] CACHE OVERLAY ${iata} ${direction}: enhanced ${overlaidCount}/${scrapeList.length} flights with webhook data`);
          } else {
            console.log(`[FIDS] CACHE OVERLAY ${iata} ${direction}: no matching flights to overlay (cache has ${fresh.length}, scrape has ${scrapeList.length})`);
          }
        }
      }
    } catch(e) {
      console.warn(`[FIDS] CACHE OVERLAY ${iata} ${direction}: ${e.message} — continuing with ADB scrape only`);
    }
  }

  return direction==='Departure'?{departures:scrapeList}:{arrivals:scrapeList};
}
