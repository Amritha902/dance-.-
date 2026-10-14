// The coach: Claude, with tools, reviewing one battle and writing one plan.
//
// The browser already measured everything: per-step accuracy, how far each
// limb was off, and your joint angles against the dancer's. What a model adds
// is judgement and language: which step to drill first, and how to say the
// fix the way a teacher would. So Claude gets the measurements as tools and
// decides what to look at:
//
//   read_report     the whole run, step by step
//   inspect_step    one step: limbs, and joints off by 20°+, read in plain words
//   recall_history  memory — how this learner did on this routine before
//   find_cues       retrieval — teaching cues for one joint fault, from the library
//   give_plan       the answer (strict schema, validated before anyone sees it)
//
// Every number the coach may quote comes out of a tool. If the plan names a
// step that doesn't exist, the tool says so and the model must try again.

import { CUES } from './cues.js';

export const COACH_MODEL = process.env.MIMIC_COACH_MODEL || 'claude-opus-5-5';
const MAX_TURNS = 8;
const JOINT_FLAG = 20; // degrees; the tracker alone wobbles by ~10
const JOINT_NAMES = ['left elbow', 'right elbow', 'left shoulder', 'right shoulder', 'left hip', 'right hip', 'left knee', 'right knee'];
const LIMB_NAMES = ['left arm', 'right arm', 'left leg', 'right leg', 'torso'];
const FAULTS = ['too_straight', 'too_bent', 'too_high', 'too_low'];
const SPEEDS = [0.5, 0.75, 1];

// ---------- untrusted input ----------
// The report arrives from a browser. Clamp every field to the shape and range
// the tools expect before any of them reads it.
const clamp = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null);
const text = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

export function cleanReport(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, 30).map((s, i) => {
    const joints = {};
    for (const j of JOINT_NAMES) {
      const you = clamp(s?.joints?.[j]?.you, 0, 180), ref = clamp(s?.joints?.[j]?.ref, 0, 180);
      if (you != null && ref != null) joints[j] = { you: Math.round(you), ref: Math.round(ref) };
    }
    const limbs = {};
    for (const l of LIMB_NAMES) {
      const off = clamp(s?.limbs?.[l], 0, 180);
      if (off != null) limbs[l] = Math.round(off);
    }
    return {
      label: text(s?.label, 24) || `Step ${i + 1}`,
      start: clamp(s?.start, 0, 36000) ?? 0,
      end: clamp(s?.end, 0, 36000) ?? 0,
      accuracy: s?.accuracy == null ? null : Math.round(clamp(s.accuracy, 0, 100) ?? 0),
      worst: LIMB_NAMES.includes(s?.worst) ? s.worst : null,
      judged: Math.round(clamp(s?.judged, 0, 100000) ?? 0),
      limbs, joints,
    };
  });
  return {
    title: text(r.title, 140) || 'this routine',
    accuracy: Math.round(clamp(r.accuracy, 0, 100) ?? 0),
    rank: ['S', 'A', 'B', 'C', 'D'].includes(r.rank) ? r.rank : '?',
    mirrored: !!r.mirrored,
    steps,
  };
}

// ---------- reading a joint ----------
// What a positive difference means depends on the joint, so it's translated
// here, once, instead of trusting the model to get the sign right.
export function readJoint(joint, { you, ref }) {
  const diff = you - ref;
  const [side, part] = joint.split(' ');
  let fault, how;
  if (part === 'shoulder') { fault = diff > 0 ? 'too_high' : 'too_low'; how = diff > 0 ? 'arm is higher than' : 'arm is lower than'; }
  else if (part === 'hip') { fault = diff > 0 ? 'too_straight' : 'too_bent'; how = diff > 0 ? 'hip is more upright than' : 'hip is more folded than'; }
  else { fault = diff > 0 ? 'too_straight' : 'too_bent'; how = diff > 0 ? `${part} is straighter than` : `${part} is more bent than`; }
  return {
    joint, you, dancer: ref, off_by: Math.abs(diff), fault,
    in_words: `Your ${side} ${how} the dancer's by ${Math.abs(diff)}° (you ${you}°, dancer ${ref}°).`,
  };
}

const jointsOff = (step) => Object.entries(step.joints)
  .map(([j, v]) => readJoint(j, v))
  .filter((r) => r.off_by >= JOINT_FLAG)
  .sort((a, b) => b.off_by - a.off_by);

// ---------- retrieval ----------
// Rank library cues for a joint fault. An exact joint + fault match beats a
// general cue; tag words in the optional context break ties. Small corpus, so
// plain scoring is the honest tool — no embeddings needed.
export function findCues(joint, fault, context = '') {
  const part = String(joint).split(' ').pop();
  const words = new Set(String(context).toLowerCase().split(/\W+/).filter(Boolean));
  return CUES.map((c) => {
    let score = 0;
    if (c.joint === part) score += 3;
    if (c.fault === fault) score += 3;
    if (c.joint === 'any') score += 1;
    score += c.tags.filter((t) => t.split(' ').some((w) => words.has(w))).length * 0.5;
    return { c, score };
  })
    // Only cues that fix this exact fault, plus the general ones.
    .filter(({ c }) => (c.joint === part && c.fault === fault) || c.joint === 'any')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ c }) => ({ id: c.id, say: c.say, why: c.why }));
}

// ---------- memory ----------
export function summariseHistory(history) {
  const runs = (history || []).slice(-8);
  if (!runs.length) return { attempts: 0, note: 'First battle on this routine.' };
  const perStep = {};
  for (const run of runs) for (const s of run.steps || []) if (s.accuracy != null) (perStep[s.label] ||= []).push(s.accuracy);
  return { attempts: runs.length, overall_accuracy_oldest_first: runs.map((r) => r.accuracy), step_accuracy_oldest_first: perStep };
}

// ---------- tools ----------
export const TOOLS = [
  {
    name: 'read_report',
    description: 'The whole battle: overall accuracy and rank, then every step with its time range, accuracy (0-100, or null if the learner was never seen in it), and the limb that was furthest off most often. Start here.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'inspect_step',
    description: 'One step in detail: how many degrees each limb was off on average, and every joint whose angle differed from the dancer by 20° or more, each with a plain-English reading and a fault code for find_cues.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['step'],
      properties: { step: { type: 'string', description: 'Step label exactly as in the report, e.g. "Step 3".' } },
    },
  },
  {
    name: 'recall_history',
    description: "This learner's earlier battles on the same routine (oldest first): overall accuracy per attempt and per-step accuracy. Use it to say what is improving.",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'find_cues',
    description: 'Retrieve teaching cues from the coaching library for one joint and one fault (use the fault code from inspect_step). Optional context words help rank them.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['joint', 'fault'],
      properties: {
        joint: { type: 'string', enum: JOINT_NAMES },
        fault: { type: 'string', enum: FAULTS },
        context: { type: 'string', description: 'A few words about the move, optional.' },
      },
    },
  },
  {
    name: 'give_plan',
    description: 'Submit the practice plan. Call once, last. Every number you mention must come from a tool result.',
    strict: true,
    input_schema: {
      type: 'object', additionalProperties: false,
      required: ['headline', 'step', 'why', 'cues', 'speed', 'loops', 'progress'],
      properties: {
        headline: { type: 'string', description: 'One short sentence: the one thing to fix.' },
        step: { type: 'string', description: 'Label of the step to drill.' },
        why: { type: 'string', description: 'One or two sentences, grounded in the measurements.' },
        cues: { type: 'array', items: { type: 'string' }, description: '1 to 3 short body cues, said like a dance teacher.' },
        speed: { type: 'number', enum: SPEEDS, description: 'Drill speed.' },
        loops: { type: 'integer', description: 'How many loops, 3 to 10.' },
        progress: { type: 'string', description: 'What changed since earlier attempts, or empty string on a first attempt.' },
      },
    },
  },
];

export function toolbox(report, history) {
  const byLabel = (label) => report.steps.find((s) => s.label.toLowerCase() === String(label).trim().toLowerCase());
  const labels = () => report.steps.map((s) => s.label).join(', ');
  return {
    read_report: () => ({
      routine: report.title, accuracy: report.accuracy, rank: report.rank,
      copying: report.mirrored ? 'same limb as the dancer (mirrored view)' : 'face-to-face, as a mirror image',
      steps: report.steps.map((s) => ({
        step: s.label, from_s: +s.start.toFixed(1), to_s: +s.end.toFixed(1),
        accuracy: s.accuracy, furthest_off_limb: s.worst, judgements: s.judged,
      })),
    }),
    inspect_step: ({ step }) => {
      const s = byLabel(step);
      if (!s) throw new Error(`There is no "${step}". Steps are: ${labels()}.`);
      if (s.accuracy == null) return { step: s.label, seen: false, note: 'The camera never saw the learner during this step.' };
      return { step: s.label, accuracy: s.accuracy, degrees_off_by_limb: s.limbs, joints_off: jointsOff(s) };
    },
    recall_history: () => summariseHistory(history),
    find_cues: ({ joint, fault, context }) => {
      const cues = findCues(joint, fault, context);
      return cues.length ? { cues } : { cues: [], note: 'Nothing in the library for that.' };
    },
    give_plan: (p) => {
      const s = byLabel(p.step);
      if (!s) throw new Error(`"${p.step}" is not a step. Steps are: ${labels()}.`);
      const cues = (Array.isArray(p.cues) ? p.cues : []).map(String).map((c) => c.trim()).filter(Boolean).slice(0, 3);
      if (!cues.length) throw new Error('Include at least one cue.');
      return {
        headline: String(p.headline).slice(0, 180),
        step: { label: s.label, start: s.start, end: s.end, accuracy: s.accuracy },
        why: String(p.why).slice(0, 420),
        cues: cues.map((c) => c.slice(0, 180)),
        speed: SPEEDS.includes(p.speed) ? p.speed : 0.75,
        loops: Math.min(10, Math.max(3, Math.round(p.loops) || 5)),
        progress: String(p.progress || '').slice(0, 260),
      };
    },
  };
}

const SYSTEM = `You are the coach inside Mimic, an app where people learn dance choreography by copying a stickman of the original dancer and getting scored live on camera.

The learner has just finished a battle. Review it with your tools and submit exactly one practice plan with give_plan.

How to work:
- Start with read_report. Choose the step that will help most to drill — usually the weakest judged step, but a nearly-there step the learner keeps missing in the same way can be the better pick.
- Look at that step with inspect_step, check recall_history, and use find_cues for the joint that is most off, so your cues come from the library. You may adapt a cue's wording to the move.
- Every number you mention must come from a tool result. Never invent scores, angles or history.
- Limb and joint names are the learner's own body. Do not tell them to switch sides.
- Cues are short, physical and encouraging: "elbow up to shoulder height", not "increase shoulder abduction".
- Speed: 0.5 when the step is under 45%, 0.75 under 72%, otherwise 1.
- If the learner was never seen, make the plan about getting their whole body in frame.`;

/**
 * Run the agent. `client` is an Anthropic SDK client (or a test double with
 * the same beta.messages.create shape).
 * @returns {{plan, trail: [{tool, input, ok}], source: 'claude', model}}
 */
export async function runCoach({ client, report, history, model = COACH_MODEL }) {
  const box = toolbox(report, history);
  const trail = [];
  const messages = [{
    role: 'user',
    content: `"${report.title}": the learner just finished at ${report.accuracy}% (rank ${report.rank}). Coach them.`,
  }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      messages,
      output_config: { effort: 'medium' },
      // If a safety classifier declines, the API retries on Anthropic's
      // recommended fallback model inside the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') throw new Error('The coach model declined this request.');
    if (res.stop_reason === 'max_tokens') throw new Error('The coach ran out of room.');

    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((b) => b.type === 'tool_use');
    if (!calls.length) throw new Error('The coach stopped without giving a plan.');

    const results = [];
    let plan = null;
    for (const call of calls) {
      let content, failed = false;
      try {
        const fn = box[call.name];
        if (!fn) throw new Error(`No tool called ${call.name}.`);
        const out = fn(call.input || {});
        if (call.name === 'give_plan') plan = out;
        content = JSON.stringify(out);
      } catch (e) {
        failed = true;
        content = e.message;
      }
      trail.push({ tool: call.name, input: call.input || {}, ok: !failed });
      results.push({ type: 'tool_result', tool_use_id: call.id, content, ...(failed ? { is_error: true } : {}) });
    }
    if (plan) return { plan, trail, source: 'claude', model: res.model };
    messages.push({ role: 'user', content: results });
  }
  throw new Error('The coach did not settle on a plan.');
}
