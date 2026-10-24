// Trend Scout on Home: what's trending, traced back to the original
// choreography, with the evidence shown so the decision isn't a black box.

import { el, toast } from '../dom.js';
import { api } from '../api.js';

const fmtViews = (n) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`);
const fmtDate = (ymd) => (ymd ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : '');

export function trendCard(g, links) {
  const o = g.original;
  const counts = {};
  for (const x of g.others) counts[x.label] = (counts[x.label] || 0) + 1;
  const learn = el('button', { class: 'btn primary tiny' }, 'Learn the original');
  learn.addEventListener('click', async () => {
    learn.disabled = true;
    try {
      const { id } = await api.addLink(o.id);
      location.hash = `#/prep/${id}`;
    } catch (e) { toast(e.message, 'bad'); learn.disabled = false; }
  });
  const watch = el('a', { class: 'btn ghost tiny', href: `https://www.youtube.com/watch?v=${o.id}`, target: '_blank', rel: 'noopener' }, 'Watch on YouTube');
  return el('article', { class: 'trend' },
    el('div', { class: 'thumb', style: { backgroundImage: `url("${o.thumbnail}")` } },
      el('span', { class: 'chip' }, 'Original')),
    el('div', { class: 'trend-body' },
      el('b', {}, o.title),
      el('small', { class: 'muted' }, [o.channel, fmtDate(o.uploaded), fmtViews(o.views)].filter(Boolean).join(' · ')),
      el('p', { class: 'trend-why' }, el('span', { class: `by ${g.by}` }, g.by === 'claude' ? 'Claude' : 'Rules'), ' ', g.reason),
      g.others.length ? el('details', { class: 'trend-others' },
        el('summary', {}, `Also found: ${Object.entries(counts).map(([k, v]) => `${v} ${k}${v > 1 && !k.endsWith('ed') ? 's' : ''}`).join(', ')}`),
        el('ul', {}, ...g.others.map((x) => el('li', {},
          el('span', { class: `label ${x.label.replace(' ', '-')}` }, x.label), ' ',
          el('a', { href: `https://www.youtube.com/watch?v=${x.id}`, target: '_blank', rel: 'noopener' }, x.title))))) : null,
      el('div', { class: 'trend-actions' }, links ? learn : null, watch),
    ),
  );
}

export const HOW = el('details', { class: 'how' },
  el('summary', {}, 'How Trend Scout decides'),
  el('ol', {},
    el('li', {}, el('b', {}, 'Gather. '), 'Searches YouTube for recent dance-challenge, dance-practice and choreography videos, with the official YouTube Data API when a key is set.'),
    el('li', {}, el('b', {}, 'Group. '), 'Strips words like "cover", "tutorial", "mirrored" or "dance" from titles, and clusters what is left by song.'),
    el('li', {}, el('b', {}, 'Pick the original. '), 'Claude reads each group\'s titles, channels, upload dates and views, and picks the official video, dance practice or choreographer\'s first upload. It labels the rest as covers, tutorials and re-uploads. Every pick is checked; anything that doesn\'t check out falls back to fixed rules (official signals, earliest upload, not derivative).'),
    el('li', {}, el('b', {}, 'Show the evidence. '), 'Each card says who decided (Claude or Rules) and why.'),
  ),
);

export function scoutSection() {
  const grid = el('div', { class: 'trend-grid' }, el('p', { class: 'muted small' }, 'Scouting what\'s trending…'));
  const meta = el('small', { class: 'muted' });
  const refresh = el('button', { class: 'btn ghost tiny', onclick: () => load(true) }, 'Refresh');
  const section = el('section', { class: 'section scout' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Trend Scout'), meta, refresh),
    el('p', { class: 'muted small lede-small' }, 'Dances trending now, each traced back to its original choreography.'),
    grid, HOW);

  async function load(force = false) {
    refresh.disabled = true;
    try {
      const cfg = await api.config();
      if (!cfg.scout?.source) {
        meta.textContent = 'off';
        grid.replaceChildren(el('p', { class: 'muted small' }, 'Trend Scout reads YouTube through its official API. Add a free YOUTUBE_API_KEY on the server to turn it on (see README).'));
        return;
      }
      const data = await api.scout(force);
      meta.textContent = `${data.source === 'youtube-api' ? 'YouTube Data API' : 'yt-dlp search'} · ${data.picker === 'claude' ? 'picked by Claude' : 'picked by rules'} · ${new Date(data.at).toLocaleString()}${data.stale ? ' · stale' : ''}`;
      grid.replaceChildren(...(data.groups.length
        ? [...data.groups.slice(0, 4).map((g) => trendCard(g, cfg.links)),
          el('a', { class: 'btn ghost see-all', href: '#/trending' }, `See all ${data.groups.length} trending dances, or what's trending near you →`)]
        : [el('p', { class: 'muted small' }, 'No trends found right now. Try Refresh later.')]));
    } catch (e) {
      grid.replaceChildren(el('p', { class: 'muted small' }, e.message));
    } finally {
      refresh.disabled = false;
    }
  }
  load();
  return section;
}
