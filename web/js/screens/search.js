// Search: type a song, and its dance videos pop up as you type, originals
// first. Each opens in the practice player.

import { el } from '../dom.js';
import { api } from '../api.js';

const KIND = { candidate: 'Original', tutorial: 'Tutorial', mirrored: 'Mirrored', slowed: 'Slowed', cover: 'Cover' };
const fmtViews = (n) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`);
export const EXAMPLES = ['Katchi Sera', 'Naatu Naatu', 'APT.', 'Kala Chashma', 'Arabic Kuthu'];
// One tap to the dance for songs people actually learn. These are just search
// words; the videos come live from YouTube.
export const SHELVES = [
  ['Tamil', ['Katchi Sera Sai Abhyankar', 'Aasa Kooda Sai Abhyankar', 'Sai Abhyankar', 'Arabic Kuthu', 'Vaathi Coming', 'Rowdy Baby', 'Kaavaalaa', 'Hukum']],
  ['Telugu', ['Naatu Naatu', 'Butta Bomma', 'Oo Antava', 'Srivalli']],
  ['Bollywood', ['Kala Chashma', 'Tauba Tauba', 'Jhoome Jo Pathaan', 'What Jhumka']],
  ['K-pop', ['APT.', 'Gangnam Style', 'Magnetic', 'Supernova']],
  ['Global', ['Macarena', 'Single Ladies', 'Cupid', 'Watch Me Whip Nae Nae']],
];

/** A search field. `onSearch(q)` runs on Enter; with `live`, also after a short pause in typing. */
export function searchField({ value = '', live = false, onSearch, autofocus = false }) {
  const input = el('input', { class: 'search-input', type: 'search', value, placeholder: 'Search a song, e.g. "Naatu Naatu"', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Search a song' });
  let timer = 0, last = value.trim();
  const fire = () => { const q = input.value.trim(); if (q.length >= 2 && q !== last) { last = q; onSearch(q); } };
  if (live) input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(fire, 650); });
  const form = el('form', { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); clearTimeout(timer); last = ''; fire(); } },
    el('span', { class: 'search-icon', 'aria-hidden': 'true' }, '🔎'), input, el('button', { class: 'btn primary', type: 'submit' }, 'Search'));
  if (autofocus) queueMicrotask(() => input.focus());
  return { form, input };
}

function resultCard(v) {
  const open = () => { sessionStorage.setItem(`mimic.watch.${v.id}`, JSON.stringify({ title: v.title, channel: v.channel })); location.hash = `#/watch/${v.id}`; };
  return el('button', { class: 'card result', type: 'button', onclick: open },
    el('div', { class: 'thumb', style: v.thumbnail ? { backgroundImage: `url("${v.thumbnail}")` } : null },
      el('span', { class: `chip kind-${v.kind}` }, KIND[v.kind] || 'Video'), el('span', { class: 'play-badge', 'aria-hidden': 'true' }, '▶')),
    el('div', { class: 'card-body' }, el('b', {}, v.title), el('small', {}, [v.channel, fmtViews(v.views)].filter(Boolean).join(' · '))));
}

export function searchScreen(initial = '') {
  const results = el('div', { class: 'grid search-results' });
  const status = el('p', { class: 'muted small' });
  async function run(q) {
    if (location.hash !== `#/search/${encodeURIComponent(q)}`) history.replaceState(null, '', `#/search/${encodeURIComponent(q)}`);
    status.textContent = `Searching for "${q}"…`;
    results.replaceChildren();
    try {
      const data = await api.search(q);
      if (field.input.value.trim() !== q && field.input.value.trim().length >= 2) return; // a newer search is on its way
      status.textContent = data.results.length ? `${data.results.length} dance videos for "${data.query}", originals first. Tap one to practise it.` : `Nothing found for "${q}". Try the song's exact name.`;
      results.replaceChildren(...data.results.map(resultCard));
    } catch (e) { status.textContent = e.message; }
  }
  const field = searchField({ value: initial, live: true, onSearch: run, autofocus: !initial });
  const pick = (q) => { field.input.value = q; run(q); };
  const chips = el('div', { class: 'shelves' }, ...SHELVES.map(([name, songs]) => el('div', { class: 'shelf' },
    el('b', {}, name),
    el('div', { class: 'shelf-row' }, ...songs.map((q) => el('button', { class: 'chip-btn', type: 'button', onclick: () => pick(q) }, q))))));
  if (initial) queueMicrotask(() => run(initial));
  return {
    node: el('div', { class: 'more-page search-page' },
      el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, 'Search a song'), el('p', { class: 'muted' }, 'Find the dance for any song. Originals and dance practices come first, then tutorials and mirrored versions.'))),
      field.form, chips, status, results),
  };
}
