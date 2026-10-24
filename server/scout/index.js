// Trend Scout: gather → group by song → pick the original → cache.

import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { dataDir, readJson, writeJson } from '../store.js';
import { gather, sourceName, normaliseRegion } from './gather.js';
import { groupBySong, kindOf } from './labels.js';
import { pickByRules } from './rules.js';
import { pickWithClaude } from './pick.js';

const TTL = 6 * 3600e3;
const MIN_REFRESH = 10 * 60e3;
const file = (region) => path.join(dataDir(), region ? `scout-${region}.json` : 'scout.json');
// Aim for at least this many trends; single uploads fill in when few songs repeat.
export const MIN_TRENDS = 10;
const DANCE_WORDS = /danc|choreo|challenge|hook ?step|practice|steps/i;

let client = null;
export const setScoutClient = (c) => { client = c; };
const getClient = () => (client ||= new Anthropic());

export async function runScout({ gatherImpl = gather, region = null } = {}) {
  const { source, videos } = await gatherImpl({ region });
  // A trend is a song with several videos. When too few songs repeat, the
  // most-watched single uploads fill the list up to MIN_TRENDS.
  const all = groupBySong(videos);
  const multi = all.filter((g) => g.videos.length >= 2);
  const singles = all.filter((g) => g.videos.length < 2 && kindOf(g.videos[0].title) === 'candidate' && DANCE_WORDS.test(g.videos[0].title))
    .sort((a, b) => (b.videos[0].views || 0) - (a.videos[0].views || 0));
  const groups = [...multi, ...singles.slice(0, Math.max(0, MIN_TRENDS - multi.length))].slice(0, 15);
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
    at: new Date().toISOString(), source, picker, region,
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

export async function scout({ refresh = false, region: wanted = null, ...opts } = {}) {
  const region = normaliseRegion(wanted);
  let cached = await readJson(file(region));
  // Never serve results from a source that's now switched off (e.g. yt-dlp
  // results cached before compliance mode was turned on).
  if (cached && cached.source !== sourceName()) cached = null;
  const age = cached ? Date.now() - Date.parse(cached.at) : Infinity;
  if (cached && (age < TTL) && !(refresh && age > MIN_REFRESH)) return cached;
  try {
    const fresh = await runScout({ ...opts, region });
    await writeJson(file(region), fresh);
    return fresh;
  } catch (e) {
    if (cached) return { ...cached, stale: true, error: e.message };
    throw e;
  }
}
