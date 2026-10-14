// "Learn it slower" in the Studio: tutorials, mirrored and slowed versions of
// the same dance, found through the same compliant search as Trend Scout.

import { el, toast } from '../dom.js';
import { api } from '../api.js';

const views = (n) => (n == null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M views` : n >= 1e3 ? `${Math.round(n / 1e3)}K views` : `${n} views`);

export function relatedSection(id) {
  const input = el('input', { class: 'field', placeholder: 'Song name, e.g. "neon heart"', maxlength: 120 });
  const list = el('div', { class: 'related-list' }, el('p', { class: 'muted small' }, 'Looking for easier versions…'));
  let links = false;

  const card = (v) => {
    const learn = el('button', { class: 'btn primary tiny' }, 'Learn this one');
    learn.addEventListener('click', async () => {
      learn.disabled = true;
      try { location.hash = `#/prep/${(await api.addLink(v.id)).id}`; } catch (e) { toast(e.message, 'bad'); learn.disabled = false; }
    });
    return el('article', { class: 'related' },
      el('div', { class: 'thumb', style: { backgroundImage: `url("${v.thumbnail}")` } },
        el('span', { class: `chip kind-${v.label.replace(' ', '-')}` }, v.label)),
      el('div', { class: 'related-body' },
        el('b', {}, v.title),
        el('small', { class: 'muted' }, [v.channel, views(v.views)].filter(Boolean).join(' · ')),
        el('div', { class: 'trend-actions' },
          links ? learn : null,
          el('a', { class: 'btn ghost tiny', href: `https://www.youtube.com/watch?v=${v.id}`, target: '_blank', rel: 'noopener' }, 'Watch on YouTube')),
      ),
    );
  };

  async function load(q) {
    list.replaceChildren(el('p', { class: 'muted small' }, 'Searching…'));
    try {
      const cfg = await api.config();
      links = cfg.links;
      if (!cfg.scout?.source) {
        list.replaceChildren(el('p', { class: 'muted small' }, 'Searching YouTube needs a free YOUTUBE_API_KEY on the server (see README).'));
        return;
      }
      const out = await api.related(id, q);
      if (!q && out.query) input.value = out.query.replace(/ dance tutorial mirrored slow$/, '');
      list.replaceChildren(...(out.videos?.length
        ? out.videos.map(card)
        : [el('p', { class: 'muted small' }, out.note || 'Nothing easier found. Try the song name.')]));
    } catch (e) {
      list.replaceChildren(el('p', { class: 'muted small' }, e.message));
    }
  }

  const form = el('form', {
    class: 'related-search',
    onsubmit: (e) => { e.preventDefault(); const s = input.value.trim(); if (s) load(`${s} dance tutorial mirrored slow`); },
  }, input, el('button', { class: 'btn ghost', type: 'submit' }, 'Search'));

  load();
  return el('section', { class: 'section related-section' },
    el('h2', {}, 'Learn it slower'),
    el('p', { class: 'muted small lede-small' }, 'Tutorials, mirrored and slowed versions of this dance, the most helpful first.'),
    form, list);
}
