// Home: paste a link or upload a clip, and pick up a routine you've already learned.

import { el, toast } from '../dom.js';
import { api } from '../api.js';
import { readLog, streakFrom } from '../fitness.js';
import { scoutSection } from './scout.js';

export function routineCard(r) {
  return el('a', { class: 'card', href: `#/learn/${r.id}` },
    el('div', { class: 'thumb', style: r.thumbnail ? { backgroundImage: `url("${r.thumbnail}")` } : null },
      r.source === 'upload' ? el('span', { class: 'chip' }, 'Your clip') : null),
    el('div', { class: 'card-body' },
      el('b', {}, r.title),
      el('small', {}, r.channel || ''),
    ),
  );
}

function statsStrip() {
  const log = readLog();
  if (!log.sessions) return null;
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('small', {}, label));
  return el('section', { class: 'stats' },
    stat(`🔥 ${streakFrom(log.days)}`, 'day streak'),
    stat(Math.round(log.kcal).toLocaleString(), 'kcal danced off'),
    stat(Math.round(log.seconds / 60).toLocaleString(), 'active minutes'),
    stat(log.sessions, 'battles'),
    el('small', { class: 'muted stats-note' }, 'Calories are estimated from your motion.'),
  );
}

export function homeScreen() {
  const input = el('input', {
    class: 'link-input', type: 'url', placeholder: 'Paste a YouTube link to a dance',
    autocomplete: 'off', spellcheck: false,
  });
  const go = el('button', { class: 'btn primary', type: 'submit' }, 'Learn it');
  const file = el('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime', hidden: true });
  const uploadBtn = el('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, 'Upload a clip');

  const form = el('form', {
    class: 'link-form',
    onsubmit: async (e) => {
      e.preventDefault();
      go.disabled = true;
      try {
        const { id } = await api.addLink(input.value);
        location.hash = `#/prep/${id}`;
      } catch (err) {
        toast(err.message, 'bad');
      } finally {
        go.disabled = false;
      }
    },
  }, input, go);

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    try {
      const { id } = await api.upload(f);
      location.hash = `#/prep/${id}`;
    } catch (err) {
      toast(err.message, 'bad');
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload a clip';
    }
  });

  const library = el('div', { class: 'grid' });
  const librarySection = el('section', { class: 'section', hidden: true },
    el('h2', {}, 'Your routines'), library);
  api.library().then((list) => {
    if (!list.length) return;
    library.append(...list.map(routineCard));
    librarySection.hidden = false;
  }).catch(() => {});

  const node = el('div', { class: 'home' },
    el('section', { class: 'hero' },
      el('h1', {}, 'Any dance. ', el('em', {}, 'In your body.')),
      el('p', { class: 'lede' }, 'Learn from a clean, mirrored stickman. Dance it on camera and watch your wrong limbs light up. Then let the coach tell you exactly what to fix.'),
      form,
      el('div', { class: 'or-row' }, el('span', {}, 'or'), uploadBtn, file,
        el('small', { class: 'muted' }, 'mp4, webm or mov, up to 200 MB. Use a clip you have the rights to.')),
    ),
    statsStrip(),
    librarySection,
    scoutSection(),
  );
  // In compliance mode the server refuses link downloads; say so up front.
  api.config().then((c) => {
    if (c.links) return;
    form.hidden = true;
    node.querySelector('.or-row > span').textContent = 'Upload a dance clip you have the rights to:';
  }).catch(() => {});
  return { node, mounted: () => input.focus() };
}
