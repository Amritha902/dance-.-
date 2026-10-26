// My profile & history: create a profile (a name and a private sign-in code),
// sign in on another device with that code, and see every dance you've done.

import { el, toast } from '../dom.js';
import { account } from '../api.js';
import { signedIn, setProfile, signOut } from '../profile.js';
import { streakFrom } from '../fitness.js';
import { BADGES, EMPTY_STATS } from '../badges.js';

const fmtWhen = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function signedOutView(refresh) {
  const name = el('input', { class: 'field', placeholder: 'Your name', maxlength: 24, autocomplete: 'nickname' });
  const code = el('input', { class: 'field code-input', placeholder: 'XXXX-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: false });
  const create = el('form', { class: 'acct-card', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const { user, code: c } = await account.create(name.value);
      setProfile({ code: c, user, fresh: true });
      refresh();
    } catch (err) { toast(err.message, 'bad'); }
  } }, el('h2', {}, '✨ Create your profile'), el('p', { class: 'muted small' }, 'Keep every dance you do: scores, ranks, calories and streaks, on any phone or laptop. No email or password.'),
  name, el('button', { class: 'btn primary', type: 'submit' }, 'Create my profile'));
  const login = el('form', { class: 'acct-card', onsubmit: async (e) => {
    e.preventDefault();
    try {
      const { user } = await account.signIn(code.value);
      setProfile({ code: code.value.trim().toUpperCase(), user });
      toast(`Welcome back, ${user.name}!`);
      refresh();
    } catch (err) { toast(err.message, 'bad'); }
  } }, el('h2', {}, '🔑 Already have one?'), el('p', { class: 'muted small' }, 'Enter the sign-in code from your other device.'),
  code, el('button', { class: 'btn ghost', type: 'submit' }, 'Sign in'));
  return el('div', { class: 'acct-grid' }, create, login);
}

function codeBox(p) {
  const shown = el('code', { class: 'code-text' }, p.fresh ? p.code : '••••-••••-••••-••••');
  const reveal = el('button', { class: 'btn ghost tiny', onclick: () => { shown.textContent = p.code; reveal.remove(); } }, 'Show');
  const copy = el('button', { class: 'btn ghost tiny', onclick: async () => {
    try { await navigator.clipboard.writeText(p.code); toast('Copied. Keep it somewhere safe.'); } catch { toast(p.code); }
  } }, 'Copy');
  return el('section', { class: `acct-code${p.fresh ? ' fresh' : ''}` },
    el('div', {}, el('b', {}, p.fresh ? '🔐 Save your sign-in code now' : '🔐 Your sign-in code'),
      el('p', { class: 'muted small' }, 'It\'s the only key to your history: use it to sign in on another device. Anyone with it can see your dances, so keep it private.')),
    el('div', { class: 'code-row' }, shown, p.fresh ? null : reveal, copy));
}

function signedInView(p, refresh) {
  const body = el('div', { class: 'acct-body' }, el('p', { class: 'muted' }, 'Loading your history…'));
  Promise.all([account.me(p.code), account.runs(p.code, 200)]).then(([{ user, summary: s }, { runs }]) => {
    setProfile({ ...p, user, fresh: false });
    const tile = (v, l) => el('div', { class: 'stat' }, el('b', {}, v), el('small', {}, l));
    const stats = { ...EMPTY_STATS, battles: s.battles, bestRank: s.bestRank, bestCombo: s.bestCombo, mostPerfects: s.mostPerfects, streak: streakFrom(s.days), kcal: s.kcal, routines: s.routines, parties: s.parties };
    const earned = BADGES.filter((b) => b.test(stats));
    body.replaceChildren(...[
      el('section', { class: 'stats' }, tile(s.battles, 'dances'), tile(`🔥 ${streakFrom(s.days)}`, 'day streak'), tile(s.kcal.toLocaleString(), 'kcal'),
        tile(s.minutes, 'active minutes'), tile(s.bestRank || '–', 'best rank'), tile(s.routines, 'different dances')),
      el('h2', {}, `Badges · ${earned.length} of ${BADGES.length}`),
      el('div', { class: 'badge-row' }, ...(earned.length ? earned.map((b) => el('div', { class: 'badge earned' }, el('span', { class: 'b-icon' }, b.icon), el('b', {}, b.name), el('small', {}, b.desc)))
        : [el('p', { class: 'muted small' }, 'Dance once and your first badge lands here.')])),
      el('h2', {}, 'Your history'),
      runs.length ? el('div', { class: 'history' }, ...runs.map((r) => el('a', { class: 'hist-row', href: `#/learn/${r.routineId}` },
        el('span', { class: `rank-chip r-${r.rank}` }, r.rank),
        el('span', { class: 'h-main' }, el('b', {}, r.title), el('small', {}, `${fmtWhen(r.at)}${r.mode === 'party' ? ' · 🎉 party' : ''}`)),
        el('span', { class: 'h-num' }, el('b', {}, r.score.toLocaleString()), el('small', {}, `${r.accuracy}% · ${r.kcal} kcal`)))))
        : el('p', { class: 'muted' }, 'No dances yet. Your next battle is saved here automatically.', ' ', el('a', { href: '#/live' }, 'Dance one now →')),
      Object.keys(s.best).length ? el('h2', {}, 'Personal bests') : null,
      Object.keys(s.best).length ? el('div', { class: 'best-list' }, ...Object.entries(s.best).map(([id, b]) => el('a', { class: 'best-row', href: `#/learn/${id}` }, el('b', {}, b.title), el('span', {}, `${b.rank} · ${b.score.toLocaleString()} · ${b.accuracy}%`)))) : null,
    ].filter(Boolean));
  }).catch((e) => {
    if (/recognised|signed in/i.test(e.message)) { signOut(); toast('That profile no longer exists on this server.', 'bad'); refresh(); return; }
    body.replaceChildren(el('p', { class: 'muted' }, e.message));
  });

  const rename = el('button', { class: 'btn ghost tiny', onclick: async () => {
    const n = prompt('New name', p.user?.name || ''); if (!n) return;
    try { const { user } = await account.rename(p.code, n); setProfile({ ...signedIn(), user }); refresh(); } catch (e) { toast(e.message, 'bad'); }
  } }, 'Rename');
  const out = el('button', { class: 'btn ghost tiny', onclick: () => { if (confirm('Sign out on this device? You can sign back in with your code.')) { signOut(); refresh(); } } }, 'Sign out');
  const del = el('button', { class: 'btn ghost tiny danger', onclick: async () => {
    if (!confirm('Delete your profile and your whole dance history? This can\'t be undone.')) return;
    try { await account.remove(p.code); signOut(); toast('Your profile and history are deleted.'); refresh(); } catch (e) { toast(e.message, 'bad'); }
  } }, 'Delete my data');
  return el('div', {},
    el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, `Hi, ${p.user?.name || 'dancer'} 👋`), el('p', { class: 'muted' }, 'Every dance you finish is saved here.')),
      el('div', { class: 'page-tools' }, rename, out, del)),
    codeBox(p), body);
}

export function accountScreen() {
  const root = el('div', { class: 'more-page account' });
  const refresh = () => {
    const p = signedIn();
    root.replaceChildren(...(p?.code ? [signedInView(p, refresh)] : [
      el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, 'My profile & history'), el('p', { class: 'muted' }, 'Save every dance, on every device.'))),
      signedOutView(refresh)]));
  };
  refresh();
  return { node: root };
}
