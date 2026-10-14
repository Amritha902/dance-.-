// Results: how the run went, step by step, and what the coach says to do next.

import { el, confetti, beep, fmtTime } from '../dom.js';
import { api } from '../api.js';
import { sampleRoutine, cutSteps } from '../pose/timeline.js';
import { buildReport, weakestStep } from '../report.js';

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
  if (!r) {
    return { node: el('div', { class: 'results' }, el('h1', {}, 'No recent battle'), el('a', { class: 'btn primary', href: `#/learn/${id}` }, 'Back to the studio')) };
  }
  const coachBody = el('div', {}, el('p', { class: 'muted small' }, 'Reviewing your run…'));
  const badge = el('span', { class: 'coach-badge' }, 'Coach');
  const coach = el('section', { class: 'coach' }, el('div', { class: 'coach-head' }, badge, el('h2', {}, 'Your next practice')), coachBody);
  const reportSlot = el('div');

  const node = el('div', { class: 'results' },
    el('p', { class: 'eyebrow' }, r.title),
    scoreCard(r),
    coach,
    reportSlot,
    el('div', { class: 'result-actions' },
      el('a', { class: 'btn primary', href: `#/battle/${id}` }, 'Run it back'),
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

  return {
    node,
    mounted() {
      beep(880, 0.12, 0.06, 'triangle');
      if (r.rank === 'S' || r.rank === 'A') confetti();
      coachMe();
    },
  };
}
