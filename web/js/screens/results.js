// Results: how the run went, step by step, and what the coach says to do next.

import { el, confetti, beep, fmtTime } from '../dom.js';
import { api } from '../api.js';
import { sampleRoutine, cutSteps } from '../pose/timeline.js';
import { buildReport, weakestStep } from '../report.js';
import { recordWorkout } from '../fitness.js';
import { prefs, toast } from '../dom.js';
import { recordRun } from '../badges.js';
import { shareResult } from '../share.js';
import { signedIn, saveRunToHistory } from '../profile.js';

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
      r.workout ? el('div', { class: 'chips-row' },
        el('span', { class: 'stat-chip' }, el('b', {}, r.workout.kcal.toFixed(1)), ' kcal'),
        el('span', { class: 'stat-chip' }, r.workout.label),
        r.streak ? el('span', { class: `stat-chip streak${r.streak.grew ? ' grew' : ''}` }, `🔥 ${r.streak.days}-day streak`) : null,
      ) : null,
      el('div', { class: 'tally' }, ...Object.entries(r.tally).map(([k, v]) =>
        el('span', { class: `t ${k.toLowerCase()}` }, el('b', {}, v), k))),
    ),
  );
}

// How each coach tool call reads in the "how the coach got here" trail.
const TRAIL = {
  read_report: () => 'Read your step-by-step report',
  inspect_step: (i) => `Looked closely at ${i.step}`,
  recall_history: () => 'Checked your earlier attempts',
  find_cues: (i) => `Pulled cues for your ${i.joint} (${String(i.fault).replace('_', ' ')})`,
  give_plan: () => 'Wrote your plan',
};

function drill(id, step, speed) {
  sessionStorage.setItem('mimic.openRegion', JSON.stringify({ label: step.label, start: step.start, end: step.end, speed }));
  location.hash = `#/learn/${id}`;
}

function stepReport(id, report) {
  const weakest = weakestStep(report);
  return el('section', { class: 'step-report' },
    el('h2', {}, 'Step by step'),
    weakest ? el('p', { class: 'muted small' }, `Weakest: ${weakest.label}${weakest.worst ? `, mostly your ${weakest.worst}` : ''}.`) : null,
    el('ol', {}, ...report.map((s) => {
      const tone = s.accuracy == null ? 'unseen' : s.accuracy >= 70 ? 'good' : s.accuracy >= 45 ? 'warn' : 'bad';
      return el('li', { class: `step-row ${tone}${s === weakest ? ' weakest' : ''}` },
        el('span', { class: 'lbl' }, s.label, el('small', {}, `${fmtTime(s.start)}–${fmtTime(s.end)}`)),
        el('span', { class: 'bar' }, el('i', { style: { width: `${s.accuracy ?? 0}%` } })),
        el('b', {}, s.accuracy == null ? '—' : `${s.accuracy}%`),
        el('small', { class: 'why' }, s.accuracy == null ? 'not seen' : s.worst || ''),
        el('button', { class: 'btn tiny ghost', onclick: () => drill(id, s) }, 'Drill'),
      );
    })),
  );
}

function coachCard(id, out) {
  const { plan, trail = [], source } = out;
  return el('div', {},
    el('p', { class: 'coach-headline' }, plan.headline),
    el('p', { class: 'muted' }, plan.why),
    el('ul', { class: 'coach-cues' }, ...plan.cues.map((c) => el('li', {}, c))),
    plan.progress ? el('p', { class: 'coach-progress' }, plan.progress) : null,
    plan.step ? el('button', { class: 'btn primary', onclick: () => drill(id, plan.step, plan.speed) },
      `Drill ${plan.step.label} at ${plan.speed}× · ${plan.loops} loops`) : null,
    trail.length ? el('details', { class: 'coach-trail' },
      el('summary', {}, `How the coach got here · ${trail.length} steps`),
      el('ol', {}, ...trail.map((t) => el('li', { class: t.ok ? '' : 'retry' },
        (TRAIL[t.tool] || (() => t.tool))(t.input), t.ok ? '' : ' (retried)')))) : null,
    el('p', { class: 'coach-source' }, source === 'claude'
      ? `Coached by ${out.model || 'Claude'}`
      : 'Offline coach (rule-based). Set ANTHROPIC_API_KEY for the AI coach.'),
  );
}

export function resultsScreen(id) {
  const r = readResult(id);
  // Log the workout once per battle (a reload of this page must not count twice).
  if (r?.workout && !r.logged) {
    const log = recordWorkout({ kcal: r.workout.kcal, seconds: r.workout.activeSeconds });
    r.streak = { days: log.streak, grew: log.streakGrew };
    r.newBadges = recordRun({ id: r.id, rank: r.rank, bestCombo: r.bestCombo, tally: r.tally, streak: log.streak, totalKcal: log.kcal, party: !!r.party })
      .map(({ id: bid, icon, name, desc }) => ({ id: bid, icon, name, desc }));
    r.logged = true;
    try { sessionStorage.setItem('mimic.result', JSON.stringify(r)); } catch { /* fine */ }
  }
  if (!r) {
    return { node: el('div', { class: 'results' }, el('h1', {}, 'No recent battle'), el('a', { class: 'btn primary', href: `#/learn/${id}` }, 'Back to the studio')) };
  }
  const coachBody = el('div', {}, el('p', { class: 'muted small' }, 'Reviewing your run…'));
  const badge = el('span', { class: 'coach-badge' }, 'Coach');
  const coach = el('section', { class: 'coach' }, el('div', { class: 'coach-head' }, badge, el('h2', {}, 'Your next practice')), coachBody);
  const reportSlot = el('div');
  const boardSlot = el('div');

  const historyNote = el('p', { class: 'history-note muted small' });
  if (signedIn()?.code) {
    if (r.savedToHistory) historyNote.textContent = '✓ Saved to your history.';
    else saveRunToHistory(r).then(() => {
      r.savedToHistory = true;
      try { sessionStorage.setItem('mimic.result', JSON.stringify(r)); } catch { /* fine */ }
      historyNote.replaceChildren('✓ Saved to your history. ', el('a', { href: '#/account' }, 'See it →'));
    }).catch((e) => { historyNote.textContent = `Couldn't save to your history: ${e.message}`; });
  } else {
    historyNote.replaceChildren(el('a', { href: '#/account' }, 'Create a profile'), ' to keep every dance in your history, on any device.');
  }
  const shareBtn = el('button', { class: 'btn ghost', onclick: async () => {
    shareBtn.disabled = true;
    try {
      const how = await shareResult(r, await api.pose(id).catch(() => null));
      if (how === 'downloaded') toast('Saved your score card. Share it anywhere!');
    } catch (e) { toast(`Couldn't make the card: ${e.message}`, 'bad'); }
    shareBtn.disabled = false;
  } }, '📤 Share my score');
  const node = el('div', { class: 'results' },
    el('p', { class: 'eyebrow' }, r.title),
    scoreCard(r),
    historyNote,
    r.newBadges?.length ? el('section', { class: 'new-badges' },
      el('h2', {}, r.newBadges.length > 1 ? `🎖 ${r.newBadges.length} new badges!` : '🎖 New badge!'),
      el('div', { class: 'badge-row' }, ...r.newBadges.map((b) => el('div', { class: 'badge earned' }, el('span', { class: 'b-icon' }, b.icon), el('b', {}, b.name), el('small', {}, b.desc)))),
      el('a', { class: 'muted small', href: '#/progress' }, 'See all badges →')) : null,
    coach,
    reportSlot,
    boardSlot,
    el('div', { class: 'result-actions' },
      el('a', { class: 'btn primary', href: `#/battle/${id}` }, 'Run it back'),
      shareBtn,
      el('a', { class: 'btn ghost', href: `#/learn/${id}` }, 'Back to the studio'),
    ),
  );

  async function coachMe() {
    let report;
    try {
      const pose = await api.pose(id);
      report = buildReport(cutSteps(sampleRoutine(pose.frames, pose.duration), pose.duration), r.samples, r.region);
    } catch {
      coachBody.replaceChildren(el('p', { class: 'muted' }, 'Could not load this routine to build the report.'));
      return;
    }
    reportSlot.replaceChildren(stepReport(id, report));
    try {
      const out = await api.coach(id, { title: r.title, accuracy: r.accuracy, rank: r.rank, mirrored: r.mirrored, steps: report });
      if (out.source === 'claude') { badge.textContent = 'AI coach'; badge.classList.add('ai'); }
      coachBody.replaceChildren(coachCard(id, out));
    } catch (e) {
      coachBody.replaceChildren(el('p', { class: 'muted' }, `The coach is unavailable: ${e.message}`));
    }
  }

  async function leaderboard() {
    let board;
    try {
      board = r.posted
        ? await api.scores(id)
        : await api.postScore(id, { name: prefs.get('name', 'Dancer'), score: r.score, accuracy: r.accuracy, mode: 'solo' });
      r.posted = true;
      try { sessionStorage.setItem('mimic.result', JSON.stringify(r)); } catch { /* fine */ }
    } catch { return; }
    if (!board.length) return;
    boardSlot.replaceChildren(el('section', { class: 'board' },
      el('h2', {}, 'Best on this routine'),
      el('ol', {}, ...board.slice(0, 8).map((b) => el('li', {},
        el('span', {}, b.name), el('b', {}, b.score.toLocaleString()), el('small', {}, `${b.accuracy}%`)))),
    ));
  }

  return {
    node,
    mounted() {
      beep(880, 0.12, 0.06, 'triangle');
      if (r.rank === 'S' || r.rank === 'A' || r.newBadges?.length) confetti();
      coachMe();
      leaderboard();
    },
  };
}
