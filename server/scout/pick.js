// Claude picks the original choreography in each song group.
//
// It sees only metadata (title, channel, upload date, views, duration) and
// answers through one strict tool. Every id it returns is checked against
// the group it came from; a group whose answer doesn't check out falls back
// to the rule-based picker, and is marked as such.

import { pickByRules } from './rules.js';
import { kindOf } from './labels.js';

export const SCOUT_MODEL = process.env.MIMIC_SCOUT_MODEL || 'claude-opus-5-5';
const LABELS = ['cover', 'tutorial', 'mirrored', 'slowed', 'reaction', 'compilation', 'other upload'];

export const PICK_TOOL = {
  name: 'pick_originals',
  description: 'For each song group, name the video that is the original choreography and label every other video in the group.',
  strict: true,
  input_schema: {
    type: 'object', additionalProperties: false, required: ['picks'],
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['group', 'original_id', 'reason', 'labels'],
          properties: {
            group: { type: 'integer', description: 'Group index as given.' },
            original_id: { type: 'string', description: 'Video id of the original choreography, from this group.' },
            reason: { type: 'string', description: 'One short sentence: the evidence for this pick.' },
            labels: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['id', 'label'],
                properties: { id: { type: 'string' }, label: { type: 'string', enum: LABELS } },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You find the original choreography behind dance trends.

You get groups of YouTube videos, one group per song or challenge, as metadata only. For each group, decide which video is the original choreography: the official music video or performance, the artist's or label's dance practice, or the choreographer's own first upload. Covers, tutorials, mirrored or slowed re-uploads, reactions and compilations are never the original.

Evidence to weigh: official artist, label or choreographer channels; the earliest upload date; titles marking a cover, tutorial or re-upload; view counts only as a tie-breaker. If no video in a group is clearly the original, pick the earliest video that isn't marked as derivative and say the evidence is weak.

Call pick_originals once, covering every group. Each reason is one short sentence of evidence from the metadata.`;

export async function pickWithClaude(groups, { client, model = SCOUT_MODEL }) {
  const payload = groups.map((g, i) => ({
    group: i, song: g.song,
    videos: g.videos.map((v) => ({ id: v.id, title: v.title, channel: v.channel, uploaded: v.uploaded, views: v.views, seconds: v.duration })),
  }));
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    tools: [PICK_TOOL],
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: `Pick the original in each group. Call pick_originals.\n\n${JSON.stringify(payload)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('The scout model declined.');
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === PICK_TOOL.name);
  if (!call) throw new Error('The scout model answered without picking.');
  const picks = Array.isArray(call.input?.picks) ? call.input.picks : [];

  return groups.map((g, i) => {
    const p = picks.find((x) => x.group === i);
    const ids = new Set(g.videos.map((v) => v.id));
    // Trust, but check: the pick must be in this group and not plainly derivative.
    if (p && ids.has(p.original_id) && kindOf(g.videos.find((v) => v.id === p.original_id).title) === 'candidate') {
      return {
        original: p.original_id,
        reason: String(p.reason || '').slice(0, 240),
        labels: (p.labels || []).filter((l) => ids.has(l.id) && l.id !== p.original_id && LABELS.includes(l.label)),
        by: 'claude',
      };
    }
    return { ...pickByRules(g), by: 'rules' };
  });
}
