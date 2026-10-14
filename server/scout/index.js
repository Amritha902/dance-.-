// Trend Scout: gather → group by song → pick the original → cache.

import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { dataDir, readJson, writeJson } from '../store.js';
import { gather } from './gather.js';
import { groupBySong } from './labels.js';
import { pickByRules } from './rules.js';
import { pickWithClaude } from './pick.js';

const TTL = 6 * 3600e3;
const MIN_REFRESH = 10 * 60e3;
const file = () => path.join(dataDir(), 'scout.json');

let client = null;
export const setScoutClient = (c) => { client = c; };
const getClient = () => (client ||= new Anthropic());

export async function runScout({ gatherImpl = gather } = {}) {
  const { source, videos } = await gatherImpl();
  // A trend is a song with several videos; singletons aren't trends yet.
  const groups = groupBySong(videos).filter((g) => g.videos.length >= 2).slice(0, 12);
  let picks, picker;
  if (process.env.MIMIC_COACH === 'offline' || !groups.length) {
    picks = groups.map((g) => ({ ...pickByRules(g), by: 'rules' }));
    picker = 'rules';
  } else {
    try {
      picks = await pickWithClaude(groups, { client: getClient() });
      picker = 'claude';
    } catch (e) {
      console.warn(`scout: using the rule-based picker (${e.message})`);
      picks = groups.map((g) => ({ ...pickByRules(g), by: 'rules' }));
      picker = 'rules';
    }
  }
  return {
    at: new Date().toISOString(), source, picker,
    groups: groups.map((g, i) => {
      const original = g.videos.find((v) => v.id === picks[i].original);
      return {
        song: g.song, original, reason: picks[i].reason, by: picks[i].by,
        others: g.videos.filter((v) => v.id !== original.id).map((v) => ({
          ...v, label: picks[i].labels.find((l) => l.id === v.id)?.label || 'other upload',
        })),
      };
    }).sort((a, b) => (b.original.views || 0) - (a.original.views || 0)),
  };
}

export async function scout({ refresh = false, ...opts } = {}) {
  const cached = await readJson(file());
  const age = cached ? Date.now() - Date.parse(cached.at) : Infinity;
  if (cached && (age < TTL) && !(refresh && age > MIN_REFRESH)) return cached;
  try {
    const fresh = await runScout(opts);
    await writeJson(file(), fresh);
    return fresh;
  } catch (e) {
    if (cached) return { ...cached, stale: true, error: e.message };
    throw e;
  }
}
