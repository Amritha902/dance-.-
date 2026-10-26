// The smaller menu pages: dance live, your routines, your progress, and how
// it works. Each reuses pieces from Home, so there's little new code to load.

import { el, toast } from '../dom.js';
import { api } from '../api.js';
import { routineCard, howItWorks } from './home.js';
import { HOW } from './scout.js';
import { readLog, streakFrom } from '../fitness.js';
import { BADGES, readEarned } from '../badges.js';

function uploadButton(label = 'Upload a clip') {
  const file = el('input', { type: 'file', accept: 'video/*', hidden: true });
  const btn = el('button', { class: 'btn primary', type: 'button', onclick: () => file.click() }, label);
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    btn.disabled = true; btn.textContent = 'Uploading…';
    try { location.hash = `#/prep/${(await api.upload(f)).id}`; } catch (e) { toast(e.message, 'bad'); btn.disabled = false; btn.textContent = label; }
  });
  return el('span', {}, btn, file);
}

const head = (title, lede) => el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, title), el('p', { class: 'muted' }, lede)));

// Dance live: every routine, one tap from the camera.
export function liveScreen() {
  const list = el('div', { class: 'live-list' }, el('p', { class: 'muted small' }, 'Loading your routines…'));
  api.library().then((rs) => {
    if (!rs.length) { list.replaceChildren(el('p', { class: 'muted' }, 'No routines yet. Upload a dance clip first, then come back to dance it live.'), uploadButton()); return; }
    list.replaceChildren(...rs.map((r) => el('div', { class: 'live-row' },
      routineCard(r),
      el('div', { class: 'live-actions' },
        el('button', { class: 'btn primary', onclick: () => { sessionStorage.removeItem('mimic.battleRegion'); location.hash = `#/battle/${r.id}`; } }, '🔴 Dance it live'),
        el('a', { class: 'btn ghost', href: `#/learn/${r.id}` }, 'Learn it first'),
      ))));
  }).catch((e) => list.replaceChildren(el('p', { class: 'muted' }, e.message)));
  return { node: el('div', { class: 'more-page' }, head('Dance live', 'Pick a routine and go straight to the camera. Your limbs light up when they\'re off, and the coach is waiting at the end.'), list) };
}

// Your routines, with upload right there.
export function libraryScreen() {
  const grid = el('div', { class: 'grid' }, el('p', { class: 'muted small' }, 'Loading…'));
  api.library().then((rs) => grid.replaceChildren(...(rs.length ? rs.map(routineCard) : [el('p', { class: 'muted' }, 'Nothing here yet.')])))
    .catch((e) => grid.replaceChildren(el('p', { class: 'muted' }, e.message)));
  return { node: el('div', { class: 'more-page' }, head('My routines', 'Every dance you\'ve uploaded, tracked and ready to learn.'), el('p', {}, uploadButton('Upload a new dance')), grid) };
}

// Progress: the workout log on this device, plus best scores per routine.
export function progressScreen() {
  const log = readLog();
  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, value), el('small', {}, label));
  const best = el('div', { class: 'best-list' }, el('p', { class: 'muted small' }, 'Loading your best scores…'));
  api.library().then(async (rs) => {
    const rows = await Promise.all(rs.map(async (r) => ({ r, top: (await api.scores(r.id).catch(() => []))[0] })));
    const scored = rows.filter((x) => x.top);
    best.replaceChildren(...(scored.length ? scored.map(({ r, top }) => el('a', { class: 'best-row', href: `#/learn/${r.id}` },
      el('b', {}, r.title), el('span', {}, `${top.score.toLocaleString()} · ${top.accuracy}%`))) : [el('p', { class: 'muted small' }, 'No battles yet. Dance one and your best score lands here.')]));
  }).catch(() => best.replaceChildren());
  return {
    node: el('div', { class: 'more-page' }, head('My progress', 'Kept on this device. Calories are estimated from your motion.'),
      el('section', { class: 'stats' },
        stat(`🔥 ${streakFrom(log.days)}`, 'day streak'), stat(Math.round(log.kcal).toLocaleString(), 'kcal danced off'),
        stat(Math.round(log.seconds / 60).toLocaleString(), 'active minutes'), stat(log.sessions, 'battles')),
      el('h2', {}, `Badges · ${Object.keys(readEarned()).length} of ${BADGES.length}`),
      el('div', { class: 'badge-grid' }, ...BADGES.map((b) => {
        const when = readEarned()[b.id];
        return el('div', { class: `badge${when ? ' earned' : ''}`, title: when ? `Earned ${new Date(when).toLocaleDateString()}` : 'Not yet' },
          el('span', { class: 'b-icon' }, when ? b.icon : '🔒'), el('b', {}, b.name), el('small', {}, b.desc));
      })),
      el('h2', {}, 'Best scores'), best),
  };
}

export function howScreen() {
  return { node: el('div', { class: 'more-page' }, head('How it works', 'From a dance video to a coach that tells you exactly what to fix.'), howItWorks(), HOW) };
}
