// Self-test fixture: a feed worker that writes its own English into a row
// (W1). The board would show it in English in every language.
export function gcStatus(r) { return r.closing ? 'Gate closes in 10 minutes' : r.status; }
export function okStatus(r) { return r.closing ? 'gateclosing' : r.status; }
export function rowOf(r) { return { flight: r.flight, remark: 'Proceed to the gate now' }; }
// round 5: the same words held in a name first, or in a row field named for its text
function fxStatusHeld(t) { const GC = 'Gate closes soon'; const r = {}; if (t) r.status = GC; return r; }
function fxRemarkHeld(t) { var rm = 'Proceed to your gate now'; return { remark: rm }; }
function fxStatusLabel(t) { return { statusLabel: 'Gate closing shortly', gateText: 'Proceed to the gate' }; }
