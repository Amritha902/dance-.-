# Mimic: learn the move

**Learn any dance from a video, then let an AI coach tell you exactly what to fix.**

Trending dances are hard to learn from a fast, un-mirrored video, and nobody tells you *what* you're getting wrong. Mimic turns the dancer into a cute little character (a chibi stickman with a face) that you can mirror, slow down and loop. It then watches you dance it on camera, paints the limb you have wrong in red while you move, and finishes with a coach that names the step, the limb and the fix.

**▶ Try it live: [mimic-3r1u.onrender.com](https://mimic-3r1u.onrender.com)** (free hosting: the first visit after a quiet spell takes about a minute to wake up) · **[Watch the demo video](devpost/media/Mimic-demo.mp4)**

Built for the Devpost **Build With AI: Basics** hackathon with the Devpost Learn skill pack. The planning documents are in [`devpost/`](devpost/): [`scope.md`](devpost/scope.md), [`prd.md`](devpost/prd.md), [`spec.md`](devpost/spec.md) and the build [`checklist.md`](devpost/checklist.md).

## What it does

| | |
|---|---|
| **Get a routine** | Upload a dance clip (mp4, webm or mov). Pasting a YouTube link is an opt-in extra. The dancer's body is tracked once, in your browser, and cached. |
| **Studio** | Video and stickman play in sync. Mirror it (a true mirror that swaps left and right, not just a flipped picture), slow it to 0.25×, and loop the **hookstep** (found automatically) or any of the auto-cut **steps**. |
| **Learn it slower** | Under the Studio: tutorials, mirrored and slowed versions of the same dance, most helpful first (reactions and covers left out). Type the song name if your clip is called something like IMG_2041. |
| **Battle** | Dance it on camera. You're judged about twice a second (PERFECT … MISS), with a combo and a rank. **Off limbs light up live on a scale: yellow (slightly off), orange (getting there), red (50°+ off)**, with a legend under the stage and a live tip in words for the worst limb, e.g. "Left leg: bend the knee more" or "Right arm: raise it higher". |
| **AI coach** | After the song, a Claude agent reads your run step by step, recalls your earlier attempts, pulls cues from a teaching library, and gives you one plan: which step, what to fix in your body, what speed, and what improved. **Drill** opens that step at that speed. |
| **Trend Scout** | Dances trending now, each traced back to its **original choreography** (not covers, tutorials or mirrored re-uploads), showing who decided (Claude or rules) and why. |
| **Workout** | Live calorie estimate, intensity, daily streak and lifetime totals. |
| **Party** | Friends on their own phones join a 4-letter room. Everyone counts in to the same instant, with a live room leaderboard. |
| **iPhone and Android app** | An installable app (PWA) from the same code: add it to the Home Screen and it opens full-screen with its own icon. Phone-first layout with a bottom tab bar, safe areas for the notch, and a tap to start that unlocks sound on iPhone. |

## Where AI is used, and why

1. **Computer vision: MediaPipe Pose Landmarker**, running in your browser (its runtime comes from npm and the model is cached by Mimic's server, so it all loads from one place). It finds 33 body points per frame, in the dancer's video and in your webcam. Camera frames never leave your device.
2. **Agentic coach: Claude (Anthropic SDK)**, an agent, not a single prompt. It gets five tools: `read_report`, `inspect_step`, `recall_history` (memory of your past runs on this routine), `find_cues` (retrieval from a hand-written teaching library), and `give_plan` (a strict schema, validated before you see it). Every number it can quote comes out of a tool, so it can't invent scores. If a request is declined, the API falls back server-side to another model. Without an API key, a rule-based coach answers instead, and the card says so.
3. **Trend Scout: Claude as a judge** of which video in a song group is the original, from metadata only (title, channel, upload date, views), through one strict tool. Every pick is checked; anything that doesn't check out falls back to fixed rules (official signals, earliest upload, not a cover or tutorial).

Mimic's own algorithms do the rest. Scoring compares bone *directions*, so where you stand and how far you are from the camera don't matter. The hookstep is the routine's most prominent self-repeat, with motionless title cards masked out. Steps are cut at pauses in motion. The step report never turns "not seen" into 0%.

## On your phone (iPhone and Android)

Mimic is a **Progressive Web App**: one codebase that installs like an app on both platforms. No app store needed for a proof of concept.

- **iPhone (Safari):** open the app's `https://` link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the link and tap **Install** (also available from Settings in the app).

Phones only allow the camera over **HTTPS**. To try it from your computer, share it through an HTTPS tunnel, for example `npx localtunnel --port 4173` or `cloudflared tunnel --url http://localhost:4173`, and open that link on the phone. For a permanent link, deploy the server anywhere that runs Node and gives HTTPS (with a persistent disk for `data/`). *Not yet tried on physical phones; see Status.*

## Deploy it

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Amritha902/dance-.-)

`render.yaml` sets everything up; Render asks for the two optional keys. You get an `https://` link, which is what phones need for the camera. On the free plan the app sleeps when idle (the first visit then takes about a minute) and uploaded clips are wiped on restart.

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
| `MIMIC_YTDLP=on` | Opt in to YouTube **link downloads** and keyless Trend Scout search via yt-dlp. **Off by default (compliance mode):** you learn from uploaded clips, and Trend Scout uses the official API key above. |
| `MIMIC_COACH=offline` | Force the rule-based coach and picker. |
| `PORT` | Default 4173. |

**Compliance mode is the default.** Mimic doesn't download from or scrape YouTube unless you set `MIMIC_YTDLP=on` (which also needs [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your PATH). Downloading from YouTube may go against YouTube's terms, so only opt in for videos you're allowed to download. By default you upload clips you have the rights to, and Trend Scout reads YouTube through the official Data API.

The camera works on `localhost` or over HTTPS only.

### Party on phones

Phones on the same Wi-Fi can open the computer's address (the room screen shows it), but **phones only allow the camera over `https://`**. For dancing on phones, share an HTTPS tunnel to your computer, for example `npx localtunnel --port 4173` or `cloudflared tunnel --url http://localhost:4173`. *(Not yet tried with real phones; see Status.)*

## Tests

```sh
npm test
```

93 tests, run with Node's built-in runner, cover:
- link parsing, uploads, pose caching and path safety;
- true mirroring, interpolation and framing;
- step cutting, hookstep detection and tempo on routines with known answers;
- scoring (face-to-face copying, scale and position invariance, hidden limbs), the live tip's direction (raise/lower, bend/straighten) and judging (combo, misses);
- the per-step report;
- the coach agent loop against a scripted model (recovering from bad calls, rejecting invalid plans, refusals), memory and the HTTP route;
- Trend Scout grouping, labels, rule and Claude picks, and official-API parsing;
- Related routines ranking, camera file names and compliance mode;
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
- **Phones:** the layout, install pieces (manifest, service worker, icons) and a full battle were checked in Chromium emulating an iPhone 13 and a Pixel 7. **Not yet tried on physical phones**: real Safari on iOS, real installs, real cameras.
- **Speed:** in the build sandbox's software GPU, tracking an 8 s clip took about 90 s. That needs measuring on real hardware.

## Disclosure

Mimic was written from scratch in this repository during the submission period. The idea comes from an earlier personal prototype by the same author; no code from it is used here. Third-party code: MediaPipe Tasks Vision, the Anthropic SDK, Express and `ws`, all under their own licenses.

## License

[MIT](LICENSE)
