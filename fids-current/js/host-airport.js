/* ───────────────────────────────────────────────────────────────────────────
 * HOST → AIRPORT  (v23803)
 *
 * yqm.orionconnected.com shows Moncton. yhz.orionconnected.ca shows Halifax.
 *
 * Every board already resolves its airport the same way:
 *
 *     ?ap=  ||  sessionStorage.fids_airport  ||  'YQM'
 *
 * so this fills in the MIDDLE and changes nothing else. ?ap= still wins, which
 * is not an accident: the screen registry re-assigns a display by navigating to
 * an explicit ?ap=, and a hostname that outranked it would drag a re-assigned
 * screen back to whatever airport its address happens to be named after.
 *
 * Runs before anything reads the airport, which is why it is a separate file
 * loaded first rather than a line inside fids-core.js.
 *
 * THE TRAP THIS EXISTS TO AVOID: 'fids', 'app', 'api' and 'www' are all three
 * or four letters, so a naive parser reads fids.orionconnected.com as an
 * airport called FIDS and shows an empty board on the main site. Labels that
 * are ours are listed below and are never airports.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // Our own hostnames. Anything here is a site, not an airport.
  var RESERVED = [
    'fids', 'www', 'api', 'app', 'apps', 'menu', 'admin', 'studio', 'tour',
    'screen', 'screens', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'cdn', 'assets',
    'static', 'media', 'img', 'dev', 'test', 'stage', 'staging', 'beta', 'demo',
    'proxy', 'edge', 'ns', 'mx', 'vpn', 'git', 'docs', 'blog', 'shop', 'go'
  ];

  // The zones we own. A subdomain of anything else is not ours to interpret.
  var ZONES = ['.orionconnected.com', '.orionconnected.ca', '.orionconnected.app'];

  function hostAirport(hostname) {
    var host = String(hostname || '').toLowerCase().split(':')[0];
    if (!host) return '';
    var zone = '';
    for (var i = 0; i < ZONES.length; i++) {
      if (host.length > ZONES[i].length && host.slice(-ZONES[i].length) === ZONES[i]) {
        zone = ZONES[i];
        break;
      }
    }
    if (!zone) return '';                       // localhost, a preview URL, anything else
    var label = host.slice(0, host.length - zone.length);
    // Only a single label. yqm.gate2.orionconnected.com is not an airport, and
    // Universal SSL does not cover a second level anyway, so it could not be
    // reached over https even if it were.
    if (label.indexOf('.') !== -1) return '';
    if (RESERVED.indexOf(label) !== -1) return '';
    if (!/^[a-z0-9]{3,4}$/.test(label)) return '';
    return label.toUpperCase();
  }

  try {
    var code = hostAirport(window.location.hostname);
    if (code) {
      // Only as the DEFAULT. An explicit ?ap= is the caller saying what they
      // want, and it must keep winning.
      try { sessionStorage.setItem('fids_airport', code); } catch (e) {}
    }
    // Exposed so a board, a test or the console can ask the same question
    // rather than re-implementing the parse — which is how the studio's copy
    // came to read fids.orionconnected.com as an airport.
    window.fidsHostAirport = hostAirport;
  } catch (e) {}
})();
