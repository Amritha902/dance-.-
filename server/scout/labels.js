// Reading a video's title the way a dancer would: is this the original, or a
// cover, a tutorial, a mirrored or slowed re-upload, a reaction, a compilation?
// Used to group videos by song and as evidence for picking the original.

const KINDS = [
  ['tutorial', /\b(tutorial|step[- ]by[- ]step|how to|learn (the|this)|easy (dance|steps?)|breakdown|explained)\b/i],
  ['mirrored', /\b(mirror(ed)?|flipped)\b/i],
  ['slowed', /\b(slow(ed|ly)?( down)?|0\.5x|half speed)\b/i],
  ['reaction', /\b(react(s|ion|ing)?)\b/i],
  ['compilation', /\b(compilation|best of|top \d+|mashup|mix)\b/i],
  ['cover', /\b(dance cover|cover( dance)?|covered by|by [a-z0-9_.]+ (crew|studio))\b/i],
];
const OFFICIAL_TITLE = /\b(official (mv|m\/v|music video|video|dance)|m\/v|\bmv\b|dance practice|choreography video|performance video)\b/i;
const OFFICIAL_CHANNEL = /(official|vevo|labels|entertainment|records|music|studios?|\bjyp\b|\bsm town\b|\byg\b|hybe)/i;

/** The kind of video this title describes; "candidate" when nothing marks it as derivative. */
export function kindOf(title) {
  for (const [kind, re] of KINDS) if (re.test(title)) return kind;
  return 'candidate';
}

export function officialSignals({ title = '', channel = '' }) {
  const out = [];
  if (OFFICIAL_TITLE.test(title)) out.push(`title says "${title.match(OFFICIAL_TITLE)[0]}"`);
  if (OFFICIAL_CHANNEL.test(channel)) out.push(`channel "${channel}" looks official`);
  return out;
}

// Words that describe the video rather than the song, stripped before grouping.
const NOISE = /\b(official|mv|m\/v|music|video|dance|dancing|challenge|tutorial|mirror(ed)?|slow(ed)?|cover|practice|choreography|choreo|reaction|react|version|step|by|easy|full|shorts?|tiktok|trend(ing)?|viral|new|the|a|an|and|ft|feat|x|with|in|of|to|lyrics|hd|4k|\d+x)\b/g;

/** Song-identifying words in a title. */
export function songTokens(title) {
  return [...new Set(
    title.toLowerCase()
      .replace(/#\w+/g, ' ')
      .replace(/[\[\(【].*?[\]\)】]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(NOISE, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  )];
}

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
};

/**
 * Cluster videos by song: greedy, against each group's founding title, so a
 * group can't drift from "Song A" to "Song B" through a chain of near-matches.
 */
export function groupBySong(videos, threshold = 0.5) {
  const groups = [];
  for (const v of videos) {
    const tokens = songTokens(v.title);
    if (!tokens.length) continue;
    const home = groups.find((g) => jaccard(g.tokens, tokens) >= threshold);
    if (home) { if (!home.videos.some((x) => x.id === v.id)) home.videos.push(v); }
    else groups.push({ tokens, videos: [v] });
  }
  return groups.map((g) => ({ song: g.tokens.join(' '), videos: g.videos }));
}
