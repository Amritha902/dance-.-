# Mimic: learn the move

**Learn any dance from a video, then let an AI coach tell you exactly what to fix.**

Trending dances are hard to learn from a fast, un-mirrored video, and nobody tells you *what* you're getting wrong. Mimic turns the dancer into a clean stickman you can mirror, slow down and loop. It then watches you dance it on camera, paints the limb you have wrong in red while you move, and finishes with a coach that names the step, the limb and the fix.

Built for the Devpost **Build With AI: Basics** hackathon with the Devpost Learn skill pack. The planning documents are in [`devpost/`](devpost/): [`scope.md`](devpost/scope.md), [`prd.md`](devpost/prd.md), [`spec.md`](devpost/spec.md) and the build [`checklist.md`](devpost/checklist.md).

## What it does

| | |
|---|---|
| **Get a routine** | Upload a dance clip (mp4, webm or mov), or paste a YouTube link. The dancer's body is tracked once, in your browser, and cached. |
| **Studio** | Video and stickman play in sync. Mirror it (a true mirror that swaps left and right, not just a flipped picture), slow it to 0.25×, and loop the **hookstep** (found automatically) or any of the auto-cut **steps**. |
| **Battle** | Dance it on camera. You're judged about twice a second (PERFECT … MISS), with a combo and a rank. **Any limb more than about 50° off turns red, live.** |
| **AI coach** | After the song, a Claude agent reads your run step by step, recalls your earlier attempts, pulls cues from a teaching library, and gives you one plan: which step, what to fix in your body, what speed, and what improved. **Drill** opens that step at that speed. |
| **Trend Scout** | Dances trending now, each traced back to its **original choreography** (not covers, tutorials or mirrored re-uploads), showing who decided (Claude or rules) and why. |
| **Workout** | Live calorie estimate, intensity, daily streak and lifetime totals. |
| **Party** | Friends on their own phones join a 4-letter room. Everyone counts in to the same instant, with a live room leaderboard. |

## Where AI is used, and why

1. **Computer vision: MediaPipe Pose Landmarker**, running in your browser. It finds 33 body points per frame, in the dancer's video and in your webcam. Camera frames never leave your device.
2. **Agentic coach: Claude (Anthropic SDK)**, an agent, not a single prompt. It gets five tools: `read_report`, `inspect_step`, `recall_history` (memory of your past runs on this routine), `find_cues` (retrieval from a hand-written teaching library), and `give_plan` (a strict schema, validated before you see it). Every number it can quote comes out of a tool, so it can't invent scores. If a request is declined, the API falls back server-side to another model. Without an API key, a rule-based coach answers instead, and the card says so.
3. **Trend Scout: Claude as a judge** of which video in a song group is the original, from metadata only (title, channel, upload date, views), through one strict tool. Every pick is checked; anything that doesn't check out falls back to fixed rules (official signals, earliest upload, not a cover or tutorial).

Mimic's own algorithms do the rest. Scoring compares bone *directions*, so where you stand and how far you are from the camera don't matter. The hookstep is the routine's most prominent self-repeat, with motionless title cards masked out. Steps are cut at pauses in motion. The step report never turns "not seen" into 0%.

## Run it

Requires **Node 18+** and a browser with WebGL and a webcam.

```sh
npm install
npm start          # http://localhost:4173
```

Optional settings: export them in your shell, or put them in `.env` and run `node --env-file=.env server/index.js` (Node 20.6+). See [`.env.example`](.env.example).

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the AI coach and Claude's Trend Scout picks. Without it, the rule-based versions run, labelled. |
| `YOUTUBE_API_KEY` | A free YouTube Data API v3 key. Trend Scout then reads trends through YouTube's official API. |
| `MIMIC_YTDLP=off` | **Compliance mode:** no YouTube downloads and no scraping. Learn from uploaded clips; Trend Scout needs `YOUTUBE_API_KEY`. |
| `MIMIC_COACH=offline` | Force the rule-based coach and picker. |
| `PORT` | Default 4173. |

**YouTube links** need [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your PATH (`brew install yt-dlp` or `pipx install yt-dlp`). Downloading from YouTube may go against YouTube's terms. Only use it for videos you're allowed to download, or run with `MIMIC_YTDLP=off` and upload clips you have the rights to.

The camera works on `localhost` or over HTTPS only.

### Party on phones

Phones on the same Wi-Fi can open the computer's address (the room screen shows it), but **phones only allow the camera over `https://`**. For dancing on phones, share an HTTPS tunnel to your computer, for example `npx localtunnel --port 4173` or `cloudflared tunnel --url http://localhost:4173`. *(Not yet tried with real phones; see Status.)*

## Tests

```sh
npm test
```

85 tests, run with Node's built-in runner, cover:
- link parsing, uploads, pose caching and path safety;
- true mirroring, interpolation and framing;
- step cutting, hookstep detection and tempo on routines with known answers;
- scoring (face-to-face copying, scale and position invariance, hidden limbs) and judging (combo, misses);
- the per-step report;
- the coach agent loop against a scripted model (recovering from bad calls, rejecting invalid plans, refusals), memory and the HTTP route;
- Trend Scout grouping, labels, rule and Claude picks, and official-API parsing;
- the calorie maths and streaks across month and leap-year boundaries;
- full party rounds over WebSocket.

## Status

What has been run, and what hasn't:

- **Verified in a real browser (Chromium), with the real MediaPipe model:**
  - uploading a clip, then tracking it (121 poses from an 8 s test clip);
  - the Studio, with mirror, hookstep (the 2.0 s repeat built into the clip was found exactly), steps and the loop region;
  - Battle, using a fake camera fed from video files: the same dance scored 7/7 PERFECT (rank S); a rotated feed turned every limb red;
  - results with the step report and the offline coach, then Drill;
  - calories, streak and leaderboard;
  - Trend Scout with a stubbed search;
  - a two-browser party round.
- **Not yet verified:**
  - the **live Claude coach** and **Claude's Trend Scout picks** (no API key in the build environment; the agent loop is tested against a scripted model);
  - the **YouTube Data API** path (tested against recorded response shapes);
  - **YouTube link downloads** (tested with a stubbed yt-dlp; YouTube was unreachable from the build environment);
  - a **real webcam** with a real person;
  - **real phones** in a party.
- **Speed:** in the build sandbox's software GPU, tracking an 8 s clip took about 90 s. That needs measuring on real hardware.

## Disclosure

Mimic was written from scratch in this repository during the submission period. The idea comes from an earlier personal prototype by the same author; no code from it is used here. Third-party code: MediaPipe Tasks Vision, the Anthropic SDK, Express and `ws`, all under their own licenses.

## License

[MIT](LICENSE)
