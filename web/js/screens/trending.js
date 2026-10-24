// Trending: the full Trend Scout list, worldwide or for one country. "Near
// me" guesses the country from the device (no location prompt) and remembers it.

import { el, toast } from '../dom.js';
import { api } from '../api.js';
import { trendCard, HOW } from './scout.js';
import { detectRegion, savedRegion, saveRegion } from '../region.js';

export function trendingScreen(near = false) {
  const grid = el('div', { class: 'trend-grid' }, el('p', { class: 'muted small' }, 'Scouting what\'s trending…'));
  const title = el('h1', {}, 'Trending now');
  const meta = el('p', { class: 'muted small' });
  const select = el('select', { class: 'field region-select', 'aria-label': 'Country' }, el('option', { value: '' }, '🌍 Worldwide'));
  const nearBtn = el('button', { class: 'btn ghost tiny' }, '📍 Near me');
  const refresh = el('button', { class: 'btn ghost tiny' }, 'Refresh');
  let regions = {};

  async function load(force = false) {
    const region = select.value || null;
    title.textContent = region ? `Trending in ${regions[region]}` : 'Trending now';
    grid.replaceChildren(el('p', { class: 'muted small' }, 'Scouting what\'s trending…'));
    refresh.disabled = true;
    try {
      const cfg = await api.config();
      if (!cfg.scout?.source) {
        meta.textContent = '';
        grid.replaceChildren(el('p', { class: 'muted' }, 'Trending reads YouTube through its official API. The server needs a free YOUTUBE_API_KEY (see README).'));
        return;
      }
      const data = await api.scout(force, region);
      meta.textContent = `${data.groups.length} dances · ${data.picker === 'claude' ? 'originals picked by Claude' : 'originals picked by rules'} · updated ${new Date(data.at).toLocaleString()}${data.stale ? ' · stale' : ''}`;
      grid.replaceChildren(...(data.groups.length
        ? data.groups.map((g) => trendCard(g, cfg.links))
        : [el('p', { class: 'muted small' }, 'Nothing trending found right now. Try Refresh in a bit.')]));
    } catch (e) {
      grid.replaceChildren(el('p', { class: 'muted small' }, e.message));
    } finally { refresh.disabled = false; }
  }

  select.addEventListener('change', () => { saveRegion(select.value); load(); });
  refresh.addEventListener('click', () => load(true));
  nearBtn.addEventListener('click', () => {
    const r = detectRegion(Object.keys(regions));
    if (!r) { toast('Couldn\'t tell where you are. Pick your country from the list.', 'bad'); return; }
    select.value = r; saveRegion(r); load();
  });

  api.config().then((cfg) => {
    regions = cfg.scout?.regions || {};
    select.append(...Object.entries(regions).map(([code, name]) => el('option', { value: code }, name)));
    const pick = near ? detectRegion(Object.keys(regions)) : savedRegion();
    if (pick && regions[pick]) select.value = pick;
    load();
  }).catch(() => load());

  return {
    node: el('div', { class: 'trending' },
      el('header', { class: 'page-head' }, el('div', {}, title, meta),
        el('div', { class: 'page-tools' }, select, nearBtn, refresh)),
      el('p', { class: 'muted small lede-small' }, 'Each trend is traced back to its original choreography: the real moves, not covers, tutorials or re-uploads. Learn it by uploading a clip of the original you have the rights to, or film a friend doing it.'),
      grid, HOW,
    ),
  };
}
