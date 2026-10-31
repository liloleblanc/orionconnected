import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = name => JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'));
export const fixtureText = name => readFileSync(path.join(here, 'fixtures', name), 'utf8');

// A fetch that answers from fixtures by URL pattern and records what was asked.
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    for (const [pattern, answer] of routes) {
      if ((pattern instanceof RegExp ? pattern.test(String(url)) : String(url).includes(pattern))) {
        const body = typeof answer === 'function' ? answer(String(url), opts) : answer;
        if (body instanceof Response) return body;
        const text = typeof body === 'string' ? body : JSON.stringify(body);
        return new Response(text, { status: 200, headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json' } });
      }
    }
    return new Response('not found', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

// The Flipp routes for the Moncton fixtures: flyers list plus searches in both languages.
export function flippRoutes() {
  return [
    [/backflipp\.wishabi\.com\/flipp\/flyers\?/, fixture('flipp_flyers_E1C.json')],
    [/backflipp\.wishabi\.com\/flipp\/items\/search/, url => {
      const u = new URL(url); const q = u.searchParams.get('q'); const loc = u.searchParams.get('locale');
      const fr = { pommes: 'apples', lait: 'milk', biscuits: 'cookies', pain: 'bread', oeufs: 'eggs' };
      const name = fr[q] || q;
      try { return fixture(`flipp_search_E1C_${loc}_${name}.json`); } catch { return { items: [] }; }
    }],
  ];
}
