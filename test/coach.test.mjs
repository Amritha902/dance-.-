// The coach, tested without the network. A scripted client plays Claude's
// side; what's under test is everything Mimic owns: input cleaning, the
// tools, retrieval, memory, the loop, the route, and the offline coach.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanReport, readJoint, findCues, summariseHistory, toolbox, runCoach, TOOLS } from '../server/coach/agent.js';
import { offlinePlan } from '../server/coach/offline.js';
import { buildReport, weakestStep } from '../web/js/report.js';

const report = cleanReport({
  title: 'Test routine', accuracy: 58, rank: 'B', mirrored: true,
  steps: [
    { label: 'Step 1', start: 0, end: 2, accuracy: 81, worst: 'torso', judged: 4, limbs: { torso: 12 }, joints: {} },
    { label: 'Step 2', start: 2, end: 4.5, accuracy: 38, worst: 'left arm', judged: 5,
      limbs: { 'left arm': 64, 'right arm': 14 },
      joints: { 'left elbow': { you: 171, ref: 96 }, 'right knee': { you: 160, ref: 150 } } },
    { label: 'Step 3', start: 4.5, end: 6, accuracy: null, judged: 0 },
  ],
});

// ---------- the report ----------

test('battle samples are regrouped by step; unseen steps say null, never 0', () => {
  const steps = [{ label: 'Step 1', start: 0, end: 2 }, { label: 'Step 2', start: 2, end: 4 }, { label: 'Step 3', start: 4, end: 6 }];
  const samples = [
    { t: 0.5, score: 90, worst: 'torso', off: { torso: 10 }, you: { 'left knee': 170 }, ref: { 'left knee': 168 } },
    { t: 1.5, score: 70, worst: 'torso', off: { torso: 20 } },
    { t: 2.5, score: 30, worst: 'left arm', off: { 'left arm': 70 }, you: { 'left elbow': 170 }, ref: { 'left elbow': 95 } },
  ];
  const r = buildReport(steps, samples, { start: 0, end: 5 });
  assert.deepEqual(r.map((s) => [s.label, s.accuracy]), [['Step 1', 80], ['Step 2', 30], ['Step 3', null]]);
  assert.equal(r[2].end, 5, 'trimmed to the danced region');
  assert.deepEqual(r[1].joints['left elbow'], { you: 170, ref: 95 });
  assert.equal(weakestStep(r).label, 'Step 2');
  assert.equal(weakestStep([{ accuracy: null }]), null);
});

test('steps outside the danced region drop out but keep their Studio names', () => {
  const steps = [{ label: 'Step 1', start: 0, end: 2 }, { label: 'Step 2', start: 2, end: 4 }];
  assert.deepEqual(buildReport(steps, [], { start: 2, end: 4 }).map((s) => s.label), ['Step 2']);
});

// ---------- the tools ----------

test('the browser report is clamped before anything reads it', () => {
  const r = cleanReport({ rank: 'Z', steps: [{ accuracy: 900, worst: 'nose', limbs: { 'left arm': -4, tail: 3 }, joints: { 'left elbow': { you: 999, ref: -1 }, chin: { you: 1, ref: 2 } } }] });
  assert.equal(r.rank, '?');
  assert.equal(r.steps[0].accuracy, 100);
  assert.equal(r.steps[0].worst, null);
  assert.deepEqual(r.steps[0].limbs, { 'left arm': 0 });
  assert.deepEqual(r.steps[0].joints, { 'left elbow': { you: 180, ref: 0 } });
  assert.equal(cleanReport(null).steps.length, 0);
});

test('joint differences are read the right way round at every joint', () => {
  assert.equal(readJoint('left elbow', { you: 170, ref: 95 }).fault, 'too_straight');
  assert.equal(readJoint('right knee', { you: 90, ref: 150 }).fault, 'too_bent');
  assert.equal(readJoint('left shoulder', { you: 40, ref: 90 }).fault, 'too_low');
  assert.equal(readJoint('right shoulder', { you: 150, ref: 90 }).fault, 'too_high');
  assert.equal(readJoint('left hip', { you: 120, ref: 170 }).fault, 'too_bent');
  assert.match(readJoint('left elbow', { you: 170, ref: 95 }).in_words, /left elbow is straighter than the dancer's by 75°/);
});

test('retrieval returns cues for exactly that fault, then the general ones', () => {
  const cues = findCues('left elbow', 'too_straight');
  assert.ok(cues[0].id.startsWith('elbow-'));
  assert.ok(cues.every((c) => c.id.startsWith('elbow-') ? ['elbow-soften', 'elbow-fold'].includes(c.id) : true));
  assert.ok(!cues.some((c) => c.id === 'elbow-reach'), 'the opposite fix is never offered');
  // Context words break ties between equally good cues.
  assert.equal(findCues('right knee', 'too_straight', 'drop your level low')[0].id, 'knee-level');
});

test('inspect_step flags joints off by 20° or more, and explains bad labels', () => {
  const box = toolbox(report, []);
  const d = box.inspect_step({ step: 'step 2' });
  assert.deepEqual(d.joints_off.map((j) => j.joint), ['left elbow']);
  assert.equal(box.inspect_step({ step: 'Step 3' }).seen, false);
  assert.throws(() => box.inspect_step({ step: 'Step 9' }), /Steps are: Step 1, Step 2, Step 3/);
});

test('memory summarises earlier attempts per step', () => {
  assert.equal(summariseHistory([]).attempts, 0);
  const h = summariseHistory([
    { accuracy: 40, steps: [{ label: 'Step 2', accuracy: 20 }] },
    { accuracy: 50, steps: [{ label: 'Step 2', accuracy: 31 }, { label: 'Step 3', accuracy: null }] },
  ]);
  assert.deepEqual(h.overall_accuracy_oldest_first, [40, 50]);
  assert.deepEqual(h.step_accuracy_oldest_first, { 'Step 2': [20, 31] });
});

test('every tool has a closed schema and the plan tool is strict', () => {
  for (const t of TOOLS) assert.equal(t.input_schema.additionalProperties, false, t.name);
  assert.equal(TOOLS.find((t) => t.name === 'give_plan').strict, true);
});

// ---------- the loop ----------

function scripted(turns) {
  const requests = [];
  return {
    requests,
    beta: { messages: { create: async (req) => {
      requests.push(structuredClone(req));
      const content = turns.shift();
      if (!content) throw new Error('script ran out');
      return { model: 'scripted-model', stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', content };
    } } },
  };
}
const call = (id, name, input) => ({ type: 'tool_use', id, name, input });
const plan = (step, extra = {}) => ({ headline: 'Bend the left elbow', step, why: 'It scored 38%.', cues: ['Soften the elbow'], speed: 0.5, loops: 6, progress: '', ...extra });

test('the agent investigates, recovers from a bad call, and lands a plan', async () => {
  const client = scripted([
    [call('a', 'read_report', {}), call('b', 'recall_history', {})],
    [call('c', 'inspect_step', { step: 'Step 7' })],
    [call('d', 'inspect_step', { step: 'Step 2' }), call('e', 'find_cues', { joint: 'left elbow', fault: 'too_straight' })],
    [call('f', 'give_plan', plan('Step 2'))],
  ]);
  const out = await runCoach({ client, report, history: [] });
  assert.equal(out.source, 'claude');
  assert.equal(out.model, 'scripted-model');
  assert.deepEqual(out.plan.step, { label: 'Step 2', start: 2, end: 4.5, accuracy: 38 });
  assert.deepEqual(out.trail.map((t) => `${t.tool}:${t.ok}`), [
    'read_report:true', 'recall_history:true', 'inspect_step:false', 'inspect_step:true', 'find_cues:true', 'give_plan:true',
  ]);
  // The bad call went back as an error the model could act on…
  const errorResult = client.requests[2].messages.at(-1).content[0];
  assert.equal(errorResult.is_error, true);
  assert.match(errorResult.content, /Steps are: Step 1, Step 2, Step 3/);
  // …and parallel calls were answered together in one message.
  assert.equal(client.requests[1].messages.at(-1).content.length, 2);
});

test('requests opt into server-side refusal fallback with an explicit effort', async () => {
  const client = scripted([[call('a', 'give_plan', plan('Step 1'))]]);
  await runCoach({ client, report, history: [] });
  const req = client.requests[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.output_config.effort, 'medium');
});

test('a plan for a step that does not exist is rejected, and the model must retry', async () => {
  const client = scripted([[call('a', 'give_plan', plan('Step 12'))], [call('b', 'give_plan', plan('Step 2'))]]);
  const out = await runCoach({ client, report, history: [] });
  assert.equal(out.plan.step.label, 'Step 2');
  assert.deepEqual(out.trail.map((t) => t.ok), [false, true]);
});

test('a refusal, or ending without a plan, is an error so the route falls back', async () => {
  const refuse = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(runCoach({ client: refuse, report, history: [] }), /declined/);
  await assert.rejects(runCoach({ client: scripted([[{ type: 'text', text: 'Great job!' }]]), report, history: [] }), /without giving a plan/);
});

// ---------- the offline coach ----------

test('the offline coach picks the weakest seen step and a matching cue', () => {
  const p = offlinePlan(report, [{ accuracy: 30, steps: [{ label: 'Step 2', accuracy: 25 }] }]);
  assert.equal(p.step.label, 'Step 2');
  assert.equal(p.speed, 0.5);
  assert.match(p.headline, /left elbow is straighter/);
  assert.match(p.cues[0], /^Left elbow: .*(elbow|arm)/i);
  assert.equal(p.progress, 'Step 2 before: 25%. Now: 38%.');
});

test('the offline coach says so when the learner was never seen', () => {
  const p = offlinePlan(cleanReport({ steps: [{ label: 'Step 1', accuracy: null }] }), []);
  assert.equal(p.step, null);
  assert.match(p.headline, /never saw you/);
});

// ---------- the route, over HTTP ----------

const dir = mkdtempSync(path.join(tmpdir(), 'mimic-coach-'));
let server, base;
before(async () => {
  process.env.MIMIC_DATA = dir;
  const { start } = await import('../server/index.js');
  server = await start(0);
  base = `http://localhost:${server.address().port}`;
});
after(() => { server?.close(); rmSync(dir, { recursive: true, force: true }); });

const coach = (body) => fetch(`${base}/api/routines/AAAAAAAAAAA/coach`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test('the route uses the agent, remembers the run, and reports progress next time', async () => {
  const { setCoachClient } = await import('../server/coach/route.js');
  setCoachClient(scripted([
    [call('a', 'give_plan', plan('Step 2'))],
    [call('b', 'recall_history', {})],
    [call('c', 'give_plan', plan('Step 2', { progress: 'Step 2 went from 38% to 55%.' }))],
  ]));
  const first = await coach({ report });
  assert.equal(first.status, 200);
  assert.equal(first.body.source, 'claude');
  const better = structuredClone(report);
  better.steps[1].accuracy = 55;
  const second = await coach({ report: better });
  assert.equal(second.body.plan.progress, 'Step 2 went from 38% to 55%.');
  // When the agent can't run, the offline coach answers, labelled, with memory.
  setCoachClient({ beta: { messages: { create: async () => { throw new Error('network down'); } } } });
  const third = await coach({ report: better });
  assert.equal(third.body.source, 'offline');
  assert.match(third.body.reason, /network down/);
  assert.equal(third.body.plan.progress, 'Step 2 before: 38% → 55%. Now: 55%.');
  assert.equal((await coach({ report: { steps: [] } })).status, 400);
});
