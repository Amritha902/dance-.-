// POST /api/routines/:id/coach — coach a finished battle.
// Reads this routine's coach memory, runs the agent (or the offline coach),
// then appends the run to memory so the next plan can say what improved.

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { routineFile, readJson, writeJson, ROUTINE_ID } from '../store.js';
import { runCoach, cleanReport, COACH_MODEL } from './agent.js';
import { offlinePlan } from './offline.js';

// Credentials resolve the SDK's usual way: ANTHROPIC_API_KEY, or a profile
// from `ant auth login`. MIMIC_COACH=offline forces the rule-based coach.
let client = null;
const getClient = () => (client ||= new Anthropic());
export const coachEnabled = () => process.env.MIMIC_COACH !== 'offline';
export const setCoachClient = (c) => { client = c; };

export function coachRouter() {
  const r = express.Router();
  r.post('/api/routines/:id/coach', express.json({ limit: '1mb' }), async (req, res) => {
    const { id } = req.params;
    if (!ROUTINE_ID.test(id)) return res.status(400).json({ error: 'bad id' });
    const report = cleanReport(req.body?.report);
    if (!report.steps.length) return res.status(400).json({ error: 'Nothing to coach: the report has no steps.' });

    const memoryFile = routineFile(id, 'coach.json');
    const history = await readJson(memoryFile, []);
    let out;
    if (coachEnabled()) {
      try {
        out = await runCoach({ client: getClient(), report, history });
      } catch (e) {
        console.warn(`coach: using the offline coach (${e.message})`);
        out = { plan: offlinePlan(report, history), trail: [], source: 'offline', reason: e.message };
      }
    } else {
      out = { plan: offlinePlan(report, history), trail: [], source: 'offline', reason: 'MIMIC_COACH=offline' };
    }
    history.push({ at: new Date().toISOString(), accuracy: report.accuracy, steps: report.steps.map((s) => ({ label: s.label, accuracy: s.accuracy })) });
    await writeJson(memoryFile, history.slice(-30));
    res.json(out);
  });

  r.get('/api/config', (_req, res) => {
    res.json({ coach: { enabled: coachEnabled(), model: COACH_MODEL, hasKey: !!process.env.ANTHROPIC_API_KEY } });
  });
  return r;
}
