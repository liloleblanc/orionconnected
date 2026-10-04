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
