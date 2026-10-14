// The offline coach: the same shape of plan, from fixed rules, when the AI
// coach can't run (no API key, a network error, a refusal). The card says
// which coach answered, so nobody mistakes this for the AI.

import { readJoint, findCues, summariseHistory } from './agent.js';

export function offlinePlan(report, history) {
  const judged = report.steps.filter((s) => s.accuracy != null);
  if (!judged.length) {
    return {
      headline: 'The camera never saw you. Fix the framing first.',
      step: null,
      why: 'No step had you in view, so there was nothing to score.',
      cues: ['Step back until your whole body, head to feet, is in the camera preview.', 'Face the camera with the light in front of you, not behind.'],
      speed: 0.75, loops: 3, progress: '',
    };
  }
  const s = judged.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  const off = Object.entries(s.joints).map(([j, v]) => readJoint(j, v)).filter((r) => r.off_by >= 20).sort((a, b) => b.off_by - a.off_by);
  const cues = [];
  // Name the joint on each cue: two cues for two different knees would
  // otherwise read like a contradiction.
  for (const r of off.slice(0, 2)) {
    const hit = findCues(r.joint, r.fault).find((c) => !cues.some((x) => x.endsWith(c.say)));
    if (hit) cues.push(`${r.joint[0].toUpperCase()}${r.joint.slice(1)}: ${hit.say}`);
  }
  if (!cues.length) cues.push(`Watch only the ${s.worst || 'arms'} on the stickman through ${s.label}, then copy just that.`);
  const before = summariseHistory(history).step_accuracy_oldest_first?.[s.label];
  return {
    headline: off[0] ? `${s.label}: ${off[0].in_words.replace(/^Your/, 'your')}` : `${s.label} is your weakest step, at ${s.accuracy}%.`,
    step: { label: s.label, start: s.start, end: s.end, accuracy: s.accuracy },
    why: `${s.label} scored ${s.accuracy}%, the lowest of the ${judged.length} steps you were seen in${s.worst ? `; your ${s.worst} was furthest off most often` : ''}.`,
    cues,
    speed: s.accuracy < 45 ? 0.5 : s.accuracy < 72 ? 0.75 : 1,
    loops: s.accuracy < 45 ? 8 : 5,
    progress: before?.length ? `${s.label} before: ${before.join('% → ')}%. Now: ${s.accuracy}%.` : '',
  };
}
