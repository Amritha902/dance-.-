// Party: dance together, each on your own phone. Make a room, share the
// 4-letter code, the host picks a routine, everyone readies up, and the
// battle starts on every phone at the same moment.

import { el, prefs, toast } from '../dom.js';
import { api } from '../api.js';
import { party } from '../party-client.js';
import { battleScreen } from './battle.js';

function roster(room, { showReady = false, showScore = false } = {}) {
  const players = [...room.players].sort((a, b) => (showScore ? (b.score - a.score) || ((b.accuracy || 0) - (a.accuracy || 0)) : 0));
  return el('ol', { class: 'roster' }, ...players.map((p, i) => el('li', { class: p.id === party.you ? 'you' : '' },
    showScore ? el('b', { class: 'pos' }, i + 1) : null,
    el('span', { class: 'nm' }, p.name, p.id === room.host ? el('small', {}, ' host') : null),
    showReady ? el('span', { class: `ready ${p.ready || p.id === room.host ? 'on' : ''}` }, p.id === room.host ? 'host' : p.ready ? 'ready' : 'not ready') : null,
    showScore ? el('span', { class: 'sc' }, p.score.toLocaleString(), p.accuracy ? el('small', {}, ` · ${p.accuracy}%`) : null) : null,
  )));
}

// Where other phones should go. Phones only allow the camera over HTTPS, so a
// plain LAN address works for joining and watching but not for dancing:
// for that, share an HTTPS tunnel link (see the README).
function joinHint() {
  const p = el('p', { class: 'muted small center' }, `Other phones: open ${location.origin} and join with the code.`);
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  if (local || location.protocol !== 'https:') {
    api.config().then((c) => {
      const lan = (c.lan || []).map((ip) => `http://${ip}:${location.port || 80}`);
      p.replaceChildren(
        local && lan.length ? `Other phones on this Wi-Fi: ${lan.join(' or ')}. ` : '',
        el('b', {}, 'Phones need an https:// link to use their camera'),
        ', so for dancing share a tunnel link (see README → Party on phones).',
      );
    }).catch(() => {});
  }
  return p;
}

export function partyScreen() {
  const body = el('div', { class: 'party' });
  let library = [];
  // The routine list only matters inside a room; repainting the entry form
  // would wipe what someone is typing.
  api.library().then((l) => { library = l; if (party.room) paint(); }).catch(() => {});

  function entry() {
    const name = el('input', { class: 'field', value: prefs.get('name', ''), placeholder: 'Your name', maxlength: 20 });
    const code = el('input', { class: 'field code', placeholder: 'CODE', maxlength: 4, autocapitalize: 'characters' });
    const go = (msg) => {
      const n = name.value.trim() || 'Dancer';
      prefs.set('name', n);
      party.connect(n);
      const send = () => party.send(msg);
      if (party.ws?.readyState === 1) send(); else party.ws.addEventListener('open', send, { once: true });
    };
    return el('div', { class: 'party-entry' },
      el('h1', {}, 'Dance together'),
      el('p', { class: 'muted' }, 'Everyone on their own phone, same Wi-Fi as this computer. One makes a room, the rest join with the code.'),
      name,
      el('button', { class: 'btn primary', onclick: () => go({ type: 'create' }) }, 'Make a room'),
      el('div', { class: 'join-row' }, code, el('button', { class: 'btn ghost', onclick: () => go({ type: 'join', code: code.value }) }, 'Join')),
    );
  }

  function lobby(room) {
    const isHost = room.host === party.you;
    const me = room.players.find((p) => p.id === party.you);
    const pick = el('select', { class: 'field', disabled: !isHost },
      el('option', { value: '' }, library.length ? 'Choose a routine…' : 'Learn a routine first (Home)'),
      ...library.map((r) => el('option', { value: r.id, selected: room.routine?.id === r.id }, r.title)));
    pick.addEventListener('change', () => {
      const r = library.find((x) => x.id === pick.value);
      if (r) party.send({ type: 'pick', routineId: r.id, title: r.title });
    });
    const everyoneReady = room.players.every((p) => p.ready || p.id === room.host);
    return el('div', { class: 'party-room' },
      el('p', { class: 'eyebrow' }, 'Room code'),
      el('div', { class: 'room-code' }, room.code),
      joinHint(),
      el('label', { class: 'pick' }, el('span', {}, 'Routine'), isHost ? pick : el('b', {}, room.routine?.title || 'The host is choosing…')),
      roster(room, { showReady: true }),
      isHost
        ? el('button', { class: 'btn primary', disabled: !room.routine || !everyoneReady, onclick: () => party.send({ type: 'start' }) },
          !room.routine ? 'Pick a routine' : everyoneReady ? 'Start for everyone' : 'Waiting for everyone to be ready')
        : el('button', { class: `btn ${me?.ready ? 'ghost' : 'primary'}`, onclick: () => party.send({ type: 'ready', ready: !me?.ready }) }, me?.ready ? "I'm not ready" : "I'm ready"),
      el('button', { class: 'btn ghost tiny', onclick: () => party.send({ type: 'leave' }) }, 'Leave room'),
    );
  }

  function results(room) {
    const isHost = room.host === party.you;
    const winner = [...room.players].sort((a, b) => (b.score - a.score) || ((b.accuracy || 0) - (a.accuracy || 0)))[0];
    return el('div', { class: 'party-room' },
      el('p', { class: 'eyebrow' }, room.routine?.title || ''),
      el('h1', { class: 'center' }, `${winner.name} wins!`),
      roster(room, { showScore: true }),
      el('a', { class: 'btn ghost', href: `#/results/${room.routine.id}` }, 'Your step-by-step + coach'),
      isHost ? el('button', { class: 'btn primary', onclick: () => party.send({ type: 'again' }) }, 'Dance again') : el('p', { class: 'muted small center' }, 'The host can start another round.'),
    );
  }

  function paint() {
    const room = party.room;
    body.replaceChildren(!room ? entry()
      : room.state === 'lobby' ? lobby(room)
      : room.state === 'results' ? results(room)
      : el('div', { class: 'party-room' }, el('p', { class: 'muted center' }, 'Dancing… waiting for everyone to finish.'), roster(room, { showScore: true })));
  }
  const off = party.on((m) => {
    if (m.type === 'error') toast(m.message, 'bad');
    if (m.type === 'start') { location.hash = `#/party/play/${m.routineId}`; return; }
    if (m.type === 'room' || m.type === 'closed') paint();
  });
  paint();
  return { node: body, destroy: off };
}

// The battle, party edition: same stage, shared start time, the room's live
// leaderboard on screen, and the result reported back to the room.
export async function partyPlayScreen(id) {
  const start = party.lastStart;
  if (!party.room || !start || start.routineId !== id) { location.hash = '#/party'; return { node: el('div') }; }
  const board = el('div', { class: 'stage-roster' });
  const paintBoard = () => board.replaceChildren(...[...party.room.players].sort((a, b) => (b.score - a.score) || ((b.accuracy || 0) - (a.accuracy || 0)))
    .map((p) => el('div', { class: p.id === party.you ? 'you' : '' }, el('span', {}, p.name), el('b', {}, p.score.toLocaleString()))));
  const off = party.on((m) => { if ((m.type === 'score' || m.type === 'room') && party.room) paintBoard(); });
  let lastSent = 0;
  const screen = await battleScreen(id, {
    region: 'default',
    startAt: party.toLocal(start.startAt),
    onFrame: ({ score, combo }) => {
      if (performance.now() - lastSent < 400) return;
      lastSent = performance.now();
      party.send({ type: 'score', score, combo });
    },
    onFinish: (result) => {
      try { sessionStorage.setItem('mimic.result', JSON.stringify(result)); } catch { /* fine */ }
      party.send({ type: 'done', score: result.score, accuracy: result.accuracy });
      location.hash = '#/party';
    },
  });
  screen.node.querySelector('.stage')?.append(board);
  paintBoard();
  const destroy = screen.destroy;
  return { ...screen, destroy: () => { off(); destroy?.(); } };
}
