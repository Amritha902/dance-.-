// Results: how the run went. The step report and the AI coach join this
// screen in the next build step.

import { el, confetti, beep } from '../dom.js';

export function readResult(id) {
  try {
    const r = JSON.parse(sessionStorage.getItem('mimic.result') || 'null');
    return r && r.id === id ? r : null;
  } catch { return null; }
}

export function scoreCard(r) {
  return el('div', { class: `scorecard rank-${r.rank}` },
    el('div', { class: 'rank' }, r.rank),
    el('div', { class: 'sc-body' },
      el('h1', {}, r.score.toLocaleString()),
      el('p', { class: 'muted' }, `${r.accuracy}% match · best combo ${r.bestCombo}`),
      el('div', { class: 'tally' }, ...Object.entries(r.tally).map(([k, v]) =>
        el('span', { class: `t ${k.toLowerCase()}` }, el('b', {}, v), k))),
    ),
  );
}

export function resultsScreen(id) {
  const r = readResult(id);
  if (!r) {
    return { node: el('div', { class: 'results' }, el('h1', {}, 'No recent battle'), el('a', { class: 'btn primary', href: `#/learn/${id}` }, 'Back to the studio')) };
  }
  const node = el('div', { class: 'results' },
    el('p', { class: 'eyebrow' }, r.title),
    scoreCard(r),
    el('div', { class: 'result-actions' },
      el('a', { class: 'btn primary', href: `#/battle/${id}` }, 'Run it back'),
      el('a', { class: 'btn ghost', href: `#/learn/${id}` }, 'Back to the studio'),
    ),
  );
  return {
    node,
    mounted() {
      beep(880, 0.12, 0.06, 'triangle');
      if (r.rank === 'S' || r.rank === 'A') confetti();
    },
  };
}
