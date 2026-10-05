// Self-test fixture: a feed worker that writes its own English into a row
// (W1). The board would show it in English in every language.
export function gcStatus(r) { return r.closing ? 'Gate closes in 10 minutes' : r.status; }
export function okStatus(r) { return r.closing ? 'gateclosing' : r.status; }
export function rowOf(r) { return { flight: r.flight, remark: 'Proceed to the gate now' }; }
