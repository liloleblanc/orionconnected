// Self-test fixture: every way a reviewer found to get an English-only (or
// French-only) label past the guard, one per function. Each function must
// draw at least one finding (tests/board-languages-selftest.test.js). A
// change to the scanner that goes blind to any of them fails the suite.
/* eslint-disable */

// ── an English label, however it reaches the screen ──
function atk_A1b_splitLiteral(h) { return h + '<span class="m">' + 'Gate closes' + '</span>'; }
function atk_A1c_viaVariable(h) { var gc = 'Gate closes'; return h + '<span class="m">' + gc + '</span>'; }
function atk_A1d_viaProperty(h) { var o = { label: 'Gate closes' }; return h + '<span class="m">' + o.label + '</span>'; }
function atk_A1e_ternaryIntoTextContent(el, known) { el.textContent = known ? 'Gate closes' : ''; }
function atk_A1f_append(el) { el.append('Gate closes'); }
function atk_A1g_templateMarkup(h) { return h + `<span class="m">Gate closes</span>`; }
function atk_A1h_innerHtmlConcat(el) { el.innerHTML = '' + 'Gate closes'; }
function atk_A1i_setAttributeContentAttr(el) { el.setAttribute('data-baremsg', 'Gate closes'); }
function atk_A1j_datasetContentAttr(el) { el.dataset.baremsg = 'Gate closes'; }
function atk_A1k_replaceInsertsMarkup(h) { return h.replace('</div>', '<span class="m">Gate closes</span></div>'); }
function atk_A1q_injectedScript() { var s = document.createElement('script'); s.src = 'injected.js'; document.head.appendChild(s); }
function atk_A1t_arrayJoin(h) { var j = ['Gate', 'closes'].join(' '); return h + '<span>' + j + '</span>'; }
function atk_A1v_studioMissingKey(context) { return T('gateClosesNew', context) + TU('colPageNew', context); }
function _legacyPair(table, k) { if (k === 'gc') return 'Gate closes'; return ''; }
function atk_A1x_rowsMap(h) { var rows = [{ k: 'x', label: 'Gate closes' }]; return h + rows.map(function (r) { return '<span>' + r.label + '</span>'; }).join(''); }
function atk_G4_placeholder(h) { return h + '<input class="x" placeholder="Search flights">'; }
function atk_G8_literalInTemplateHole(h) { return h + `<span>${'Gate closes'}</span>`; }

// ── a French-only label ──
function atk_B2_frenchOnlyObject(h) { var x = { fr: 'Fermeture de la porte' }; return h + '<span>' + x.fr + '</span>'; }
function atk_B5_frenchHalfByHand(h) { var t = 'Fermeture de la porte'; return h + '<span lang="fr">' + t + '</span>'; }

// ── the store changed at run time ──
function atk_C8_runtimeOverwrite() { BOARD_STR.tomorrow.fr = 'Lendemain'; }
function atk_C11_objectAssign() { Object.assign(BOARD_STR.tomorrow, { fr: 'Lendemain' }); }

// ── a bilingual literal, however it is joined ──
function atk_E3_noSpaces() { var b = 'Gate closes|Fermeture'; return '<span>' + b + '</span>'; }
function atk_E4_slash() { var b = 'Gate closes / Fermeture'; return '<span>' + b + '</span>'; }
function atk_E5_middleDot() { var b = 'Gate closes · Fermeture'; return '<span>' + b + '</span>'; }
function atk_E6_concatenated() { var b = 'Gate closes' + ' | ' + 'Fermeture'; return '<span>' + b + '</span>'; }
function atk_E8_throughReplace(h) { return h.replace('{GC}', 'Gate closes | Fermeture'); }
function atk_E9_nbsp() { var b = 'Gate closes | Fermeture'; return '<span>' + b + '</span>'; }

// ── another helper ──
function atk_F2_windowBs() { return window.bs('gateClosesNew'); }
function atk_F3_halfWithEnglish() { return BoardStrings.half('en', 'Gate closes'); }
function atk_F3b_bsHalfPair() { return bsHalf('en', 'Gate closes') + bsHalf('fr', 'Fermeture de la porte'); }
function atk_F6_privateWordTable() { var W = { gateCloses: 'Gate closes', boardingSoon: 'Boarding soon' }; return W.gateCloses; }
function atk_F9_markHalfEnglish() { return BoardStrings.markHalf('Gate closes', 'en'); }
function atk_F10_fillEnglish() { return BoardStrings.fill('Gate closes at {T}', { T: '10:40' }); }
function atk_F11_escapeEnglish() { return '<span>' + _niEsc('Gate closes') + '</span>'; }
function atk_F12_TLinMissing() { return TLin('gateClosesNew', 'en'); }
function atk_F13_bsListMissing() { return bsList('gateClosesTicker'); }
function atk_F15_fallbackThroughString() { return String(TL('gateClosesNew')) || 'Gate closes'; }

// ── a language chosen outside the store ──
function atk_H1_parenthesised(lang) { return (lang === 'fr') ? 'Fermeture' : 'Gate closes'; }
function atk_H5_langsByPosition(langs) { return bs('dep', langs[1]); }
function atk_H6_switch(lang) { var w; switch (lang) { case 'fr': w = 'Fermeture'; break; default: w = 'Gate closes'; } return w; }
function atk_H7_includes(lang) { return ['fr', 'es'].includes(lang) ? 'Cierre' : 'Gate closes'; }
function atk_H8_englishFallback(o, lang) { return o[lang] || o.en; }

// ── round 3 (2026-10-04): shapes that reached the screen past round 2 ──
// a word with punctuation read as code ('Gate: ', 'Delayed.')
function atk_N1_wordColonText(el, g) { el.textContent = 'Gate: ' + g; }
function atk_N1b_statusColonInChain(h) { return h + '<span class="m">' + 'Status: Delayed' + '</span>'; }
function atk_N1c_wordFullStopInChain(h) { return h + '<span class="m">' + 'Delayed.' + '</span>'; }
function atk_N1d_colonIntoTextContent(el) { el.textContent = 'Boarding: Now'; }
function atk_BL2_colonPair(el) { el.textContent = 'Boarding: Embarquement'; }
// a label of words a notes table, a brand or a name table also uses
function atk_N2_notesWordsViaVariable(h) { var v = 'Flight status'; return h + '<span class="m">' + v + '</span>'; }
function atk_N2b_brandWordsViaVariable(h) { var v = 'Baggage information'; return h + '<span class="m">' + v + '</span>'; }
function atk_N2c_nameWordsViaVariable(h) { var v = 'Hotel shuttle'; return h + '<span class="m">' + v + '</span>'; }
// a lower-case word shown in capitals, a key, a keyless list
function atk_N3_lowercaseMapUppercased(h) { var m = { late: 'delayed', early: 'early' }; return h + '<span style="text-transform:uppercase">' + m.late + '</span>'; }
function atk_N4_labelAsObjectKey(h) { var k = { 'Gate closes': 1 }; return h + '<span>' + Object.keys(k)[0] + '</span>'; }
function atk_N9_keylessArray(h) { var rows = ['delayed', 'boarding', 'closed']; return h + '<span>' + rows[0] + '</span>'; }
// CSS content written from code
function atk_N5_styleText() { var st = document.createElement('style'); st.textContent = '.m::after{content:"Gate closes"}'; document.head.appendChild(st); }
function atk_N5b_insertRule() { document.styleSheets[0].insertRule('.m::after{content:"Gate closes"}', 0); }
function atk_N5c_customProperty() { document.documentElement.style.setProperty('--gc-label', '"Gate closes"'); }
// a fixed language through the store's own helpers
function atk_F2c_fixedLangArg(h) { return h + bs('gate', 'fr'); }
function atk_F3c_aliasFixedLang(S) { return S.bs('gate', 'fr'); }
function atk_BL3_fixedPairLangs(h) { return h + bsPair('gate', { langs: ['en', 'fr'] }); }
function atk_BL4_twoFixedHalves(h) { return h + bs('gate', 'en') + ' | ' + bs('gate', 'fr'); }
function atk_L1_browserLocale(h) { return h + '<span>' + new Date().toLocaleTimeString([], { hour: 'numeric' }) + '</span>'; }
function atk_L2_ternaryLocale(lang) { return new Date().toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long' }); }
function atk_L3_navigatorLocale() { return new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).format(new Date()); }
function atk_L4_filterPick(langs) { return bs('gate', langs.filter(function (l) { return l !== 'en'; })[0]); }
function atk_L5_sliceOneTwo(langs) { return langs.slice(1, 2); }
function atk_L6_indexOfChoice(lang) { return lang.indexOf('fr') === 0 ? bs('gate', 'fr') : bs('gate', 'en'); }
function atk_L7_numberInBrowserLocale(el, n) { el.textContent = n.toLocaleString(); }
// a name table overwritten at run time (the CITY_FR collapse)
function atk_K1_nameTableOverwrite() { FX_CITY.YUL = 'MONTREAL'; }
function atk_K2_nameTableBracket() { FX_CITY['YUL'] = 'MONTREAL'; }
function atk_K6_nameTableViaWindow() { window.FX_CITY.YUL = 'MONTREAL'; }
// a missing key through another name for the helper
function atk_H1_aliasMissingKey(S) { return S.bs('backToGates'); }
function atk_H2_helperCopied() { var f = BoardStrings.bs; return f('gateClosesNew'); }
function atk_H3_ternaryKey(k) { return bs(k ? 'gate' : 'gateClosesNew'); }
function atk_H4_keyInVariable() { var key = 'gateClosesNew'; return bs(key); }
function atk_H6_localCopy() { var b2 = bs; return b2('gateClosesNew'); }
// a helper falling back to the raw value, or to the English of a call
function atk_R1_rawFallback(k) { return TL(k) || k.toUpperCase(); }
function atk_R2_englishOfACall(k, lang) { return lbl(k)[lang] || lbl(k).en; }

// ── round 5 (2026-10-05): shapes that passed round 4 ──
// a label written just under a pragma at the end of a line of code
function atk_R5_pragmaBelow() {
  var hotel = 'Fairmont Pacific Rim'; // i18n-ok: data
  document.body.insertAdjacentHTML('beforeend', '<div class="gc">Gate closes in ten minutes</div>');
  return hotel;
}
// a language held in a name, or read out of a table, an entry or a pair
function atk_R5_langInVar() { var L = 'fr'; return bs('gate', L); }
function atk_R5_langConcat() { var L = 'f' + 'r'; return bs('gate', L); }
function atk_R5_langProp() { var o = { l: 'fr' }; return bs('gate', o.l); }
function atk_R5_tableBracket() { return BOARD_STR.gate['fr']; }
function atk_R5_entryFr() { return BoardStrings.entry('gate').fr; }
function atk_R5_destructure() { var { en } = BoardStrings.STR.gate; return en; }
function atk_R5_valuesPick() { return Object.values(BoardStrings.entry('gate'))[0]; }
function atk_R5_call() { return bs.call(null, 'gate', 'fr'); }
function atk_R5_apply() { return bs.apply(null, ['gate', 'fr']); }
function atk_R5_bracketHelper() { return BoardStrings['bs']('gate', 'fr'); }
function atk_R5_pairLangsPick(langs) { return bs('gate', BoardStrings.pairLangs(langs)[1]); }
// the board's languages overwritten
function atk_R5_langAssign() { lang = 'en'; }
function atk_R5_langsAssign() { langs = ['en', 'fr']; }
function atk_R5_langsSplice() { langs.splice(0, langs.length, 'en', 'fr'); }
// English dates and times
function atk_R5_toDateString() { return '<span>' + new Date().toDateString() + '</span>'; }
function atk_R5_stringDate() { return String(new Date()).slice(0, 10); }
function atk_R5_toUTCString() { return new Date().toUTCString(); }
function atk_R5_metaEn() { return new Date().toLocaleDateString(BoardStrings.META.en.intl); }
function atk_R5_protoCall() { return Date.prototype.toLocaleTimeString.call(new Date(), 'en-US'); }
function atk_R5_amPm() { var h = new Date().getHours(); return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); }
// text built so no literal shows it
function atk_R5_fromCharCode(el) { el.textContent = String.fromCharCode(71, 97, 116, 101, 32, 99, 108, 111, 115, 101, 115); }
function atk_R5_atob(el) { el.innerHTML = atob('R2F0ZSBjbG9zZXM='); }
function atk_R5_letters(el) { el.textContent = ['G', 'a', 't', 'e', ' ', 'c', 'l', 'o', 's', 'e', 's'].join(''); }
function atk_R5_reversed(el) { el.textContent = 'sesolc etaG'.split('').reverse().join(''); }
function atk_R5_jsonParse() { var j = JSON.parse('{"a":"Gate closes"}').a; return '<span>' + j + '</span>'; }
function atk_R5_objectKeysLiteral() { var k = Object.keys({ 'Gate closes': 1 })[0]; return '<span>' + k + '</span>'; }
// a helper copied under another name, with a key it does not have
function atk_R5_helperCopyTL() { var t = TL; return t('gateClosesMissing'); }
function atk_R5_destructuredHelper() { var { bs: f } = BoardStrings; return f('gateClosesMissing'); }
// a name table written through another name
function atk_R5_aliasWrite() { var c = FX_CITY; c.YUL = 'MONTREAL'; }
function atk_R5_computedGlobal() { globalThis['FX_' + 'CITY'].YUL = 'MONTREAL'; }
// CSS that draws text without content:
function atk_R5_cssQuotes(el) { el.style.cssText = "quotes: 'Gate closes' ''"; }
function atk_R5_inlineVar() { return '<span class="gcv" style="--gcv:&quot;Gate closes&quot;"></span>'; }
// a script whose src is built from parts
function atk_R5_scriptFromParts() { var s = document.createElement('script'); s.src = 'inj' + 'ected.js'; document.head.appendChild(s); }
function atk_R5_tableByVar() { var L1 = 'fr'; return BOARD_STR.gate[L1]; }
function atk_R5_computedLocale() { return new Date()['toLocale' + 'TimeString']('en-US'); }
