// Home: paste a link or upload a clip, and pick up a routine you've already learned.

import { el, toast } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { readLog, streakFrom } from '../fitness.js';
import { scoutSection } from './scout.js';
import { searchField, EXAMPLES } from './search.js';
import { dailyPick } from '../badges.js';

export function routineCard(r) {
  return el('a', { class: 'card', href: `#/learn/${r.id}` },
    el('div', { class: 'thumb', style: r.thumbnail ? { backgroundImage: `url("${r.thumbnail}")` } : null },
      // An uploaded clip has no thumbnail: show a frame from the clip itself.
      !r.thumbnail && (r.source === 'upload' || r.source === 'starter')
        ? el('video', { class: 'thumb-frame', src: `${mediaUrl(r.id)}#t=0.5`, muted: true, playsInline: true, preload: 'metadata', 'aria-hidden': 'true' })
        : null,
      r.source === 'upload' ? el('span', { class: 'chip' }, 'Your clip') : r.source === 'starter' ? el('span', { class: 'chip starter' }, '✨ Start here') : null),
    el('div', { class: 'card-body' },
      el('b', {}, r.title),
      el('small', {}, r.channel || ''),
    ),
  );
}

// The whole loop at a glance, so a first-time visitor knows what each part is for.
export function howItWorks() {
  const step = (n, title, text) => el('li', {}, el('b', { class: 'howto-n' }, n), el('div', {}, el('h3', {}, title), el('p', {}, text)));
  return el('section', { class: 'howto' },
    el('h2', {}, 'How it works'),
    el('ol', {},
      step('1', 'Upload a dance', 'Any clip with one dancer. Mimic tracks their body in your browser.'),
      step('2', 'Learn it slowly', 'A cute mirrored stickman you can slow to 0.25×. The hookstep and steps are found for you.'),
      step('3', 'Battle on camera', 'Your limbs light up yellow, orange or red when they\'re off, with a tip on what to move.'),
      step('4', 'Get coached', 'An AI coach picks the step to practise, says what to fix, and sets the speed to drill it at.'),
    ),
    el('p', { class: 'howto-more muted small' }, 'Also: ', el('a', { href: '#/party' }, 'Party'), ' with friends on their phones, and Trend Scout to find the original of a trending dance.'),
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
  // video/* opens the camera roll on iPhone and the gallery on Android.
  const file = el('input', { type: 'file', accept: 'video/*', hidden: true });
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
  const challenge = el('section', { class: 'daily', hidden: true });
  api.library().then(async (list) => {
    const today = dailyPick(list);
    if (today) {
      const top = (await api.scores(today.id).catch(() => []))[0];
      challenge.replaceChildren(
        el('div', { class: 'daily-text' },
          el('small', {}, `📅 Today's challenge · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`),
          el('h2', {}, today.title),
          el('p', { class: 'muted small' }, top ? `Score to beat: ${top.score.toLocaleString()} by ${top.name} (${top.accuracy}%)` : 'Nobody has danced it yet. Set the first score!')),
        el('div', { class: 'live-actions' },
          el('button', { class: 'btn primary', onclick: () => { sessionStorage.removeItem('mimic.battleRegion'); location.hash = `#/battle/${today.id}`; } }, '🔴 Take the challenge'),
          el('a', { class: 'btn ghost', href: `#/learn/${today.id}` }, 'Learn it first')));
      challenge.hidden = false;
    }
    if (!list.length) return;
    library.append(...list.map(routineCard));
    librarySection.hidden = false;
  }).catch(() => {});

  const goSearch = (q) => { location.hash = `#/search/${encodeURIComponent(q)}`; };
  const search = searchField({ onSearch: goSearch });
  const node = el('div', { class: 'home' },
    el('section', { class: 'hero' },
      el('h1', {}, 'Any dance. ', el('em', {}, 'In your body.')),
      el('p', { class: 'lede' }, 'Learn from a clean, mirrored stickman. Dance it on camera and watch your wrong limbs light up. Then let the coach tell you exactly what to fix.'),
      search.form,
      el('div', { class: 'chips-row' }, el('small', { class: 'muted' }, 'Try:'),
        ...EXAMPLES.slice(0, 4).map((q) => el('button', { class: 'chip-btn', type: 'button', onclick: () => goSearch(q) }, q)),
        el('a', { class: 'chip-btn warm', href: '#/live' }, '🔴 Dance the warm-up now')),
      form,
      el('div', { class: 'or-row' }, el('span', {}, 'or'), uploadBtn, file,
        el('small', { class: 'muted' }, 'mp4, webm or mov, up to 200 MB.')),
    ),
    challenge,
    statsStrip(),
    howItWorks(),
    librarySection,
    scoutSection(),
  );
  // In compliance mode the server refuses link downloads; say so up front.
  api.config().then((c) => {
    if (c.links) return;
    form.hidden = true;
    node.querySelector('.or-row > span').textContent = 'Upload a dance clip you have the rights to:';
  }).catch(() => {});
  return { node };
}
