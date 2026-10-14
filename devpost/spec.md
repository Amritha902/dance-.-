---
doc: spec
status: approved
---

# Mimic: Technical Spec

## How This Works, In Plain Language
There are two halves.

**The browser does the seeing.** A vision model (MediaPipe Pose) finds 33 body points in every frame: first in the dancer's video, once, and then in your webcam, live. Everything about bodies happens here: drawing the stickman, mirroring, cutting the dance into steps, scoring you, and turning limbs red. No camera frame ever leaves your computer.

**A small Node server does the fetching and the thinking.** It downloads the YouTube video with yt-dlp, stores the tracked poses so the second visit is instant, keeps leaderboards, relays party rooms between phones, and runs the **coach**. When a battle ends, the browser sends the server a short report (per-step scores and joint angles). The server hands it to Claude along with five tools. Claude decides what to look at, recalls your past attempts, retrieves teaching cues, and submits one practice plan. That's an agent, not a single prompt.

Why this shape: tracking bodies in the browser keeps it private and fast, and the server only does what a browser can't (download videos, hold an API key, connect phones).

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Paste link → `POST /api/routines` → server checks the link, starts yt-dlp, returns the routine id. **Or** upload → `POST /api/routines/upload` streams the file into the cache and returns an id.
2. Preparing screen polls `GET /api/routines/:id` → when the video is ready, the browser plays it hidden through the pose tracker → `PUT /api/routines/:id/pose` caches the frames.
3. Studio loads the poses → the timeline module finds steps and the hookstep → the renderer draws the stickman each frame at the video's current time.
4. Battle → webcam → live tracker → compare module scores your pose against the (mirrored) reference → renderer paints off-target limbs red → judgements every ~0.45 s, each recording limb scores and joint angles.
5. End → report module builds the per-step report → `POST /api/routines/:id/coach` → agent loop with Claude → plan + tool trail back → results screen.
6. Drill → Studio opens on the plan's step at the plan's speed.

## Stack
| Piece | Choice | Docs |
|---|---|---|
| Server | Node 18+ (ES modules), Express 4 | https://expressjs.com/ |
| Party relay | `ws` 8 (WebSocket) | https://github.com/websockets/ws |
| Video download | `yt-dlp`, a command-line tool on PATH | https://github.com/yt-dlp/yt-dlp |
| Pose tracking | MediaPipe Tasks Vision 0.10.14, Pose Landmarker (lite), served from npm by our server | https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js |
| Coach | `@anthropic-ai/sdk`, model `claude-opus-5-5` | https://docs.anthropic.com/ |
| Client | Plain HTML/CSS/JS modules, Canvas 2D; no framework, no build step | — |
| Tests | Node's built-in `node:test` | https://nodejs.org/api/test.html |

Rationale: no build step keeps it fast to change; the learner chose a YouTube link (hence yt-dlp and a server) and the coach (hence the SDK).
**Build sandbox:** YouTube is blocked there, so downloads must be checked on the learner's machine; MediaPipe is served from npm, so tracking *can* be tested there.

## Where It Runs and How Someone Tries It
- Needs Node 18+, `yt-dlp` on PATH, a browser with WebGL and a webcam. An `ANTHROPIC_API_KEY` is needed for the AI coach (without it, the offline coach runs).
- `npm install` → `npm start` → open http://localhost:4173 (the camera only works on localhost or HTTPS).
- Demo recording: paste a trending dance link → Studio (mirror, 0.5×, loop) → Battle → results with the coach card → Drill.
- Deployment: not planned. The required demo video and public GitHub repo are the deliverables.

## Look and Feel
From `prd.md > Look and Feel`. Light warm "paper" background (#faf6ee), ink text (#1f1a15), one accent (hot coral #ff4f2e), good = green, warn = amber, and **red limbs in #ff2d55** so they read as an alert on the dark stage (#141110). Serif display (Fraunces) for numbers and headlines, Inter for UI. Rounded cards, generous spacing. Battle is dark and glowy; everything else is calm. Short, encouraging copy.

## Components

### Server: app and storage
`server/index.js` wires Express, static files, media with range requests, and the WebSocket. `server/store.js` reads and writes JSON under `data/`.
PRD ref: `prd.md > States and Boundaries`.

### Server: YouTube
`server/youtube.js`: parse and validate links (11-character id), run yt-dlp (max 720p mp4), read metadata, search for Trending.
PRD ref: `prd.md > Getting a routine`.

### Server: routines API
`server/routines.js`: create a routine, report status and progress, store and serve poses, list the library, leaderboards.
PRD ref: `prd.md > Getting a routine`, `prd.md > Results and the AI coach`.

### Server: Trend Scout
`server/scout/` finds what's trending and the original choreography behind it:
1. **Gather:** yt-dlp searches a set of dance-challenge queries ("dance challenge", "dance practice", "choreography", "kpop dance", "bollywood hook step") for recent videos, with metadata: title, channel, upload date, views, duration.
2. **Group:** results are clustered by song, using normalised titles with cover, tutorial, mirror, slow, practice and reaction words stripped.
3. **Pick the original:** for each group, Claude gets the candidates' metadata and returns, via a strict tool, the original-choreography video id, a label for every other candidate (cover, tutorial, mirrored, slowed, reaction, compilation) and a one-line reason. Without a key, `rules.js` scores official-channel signals, the earliest upload date and the absence of cover or tutorial words.
4. **Cache** for 6 h; the UI shows the pick, the reason, and who decided (Claude or the rule-based picker).
PRD ref: `prd.md > Trend Scout`.

### Server: party
`server/party.js`: rooms with 4-letter codes, players, ready states, a host-chosen routine, a synchronised start time, and score relay.
PRD ref: `prd.md > Party`.

### Server: coach agent
`server/coach/agent.js`: a manual tool-use loop with Claude. Tools:
- `read_report`: all steps;
- `inspect_step`: one step's limbs and joints off by 20° or more, read in plain English;
- `recall_history`: memory of past runs on this routine;
- `find_cues`: retrieval from the cue library;
- `give_plan`: strict schema, validated.

It sanitises the browser report, opts into server-side refusal fallback, and stops when a valid plan arrives.
`server/coach/cues.js`: the hand-written cue library. `server/coach/offline.js`: the rule-based plan used when the agent can't run.
PRD ref: `prd.md > Results and the AI coach`.

### Client: pose modules
`web/js/pose/skeleton.js` (landmark ids, bones, limbs, joints, true mirror), `pose/compare.js` (bone-direction score, joint angles), `pose/timeline.js` (interpolation, framing bounds, step cutting, hookstep and tempo), `pose/tracker.js` (MediaPipe: extract from video, detect live).
PRD ref: `prd.md > Studio`, `prd.md > Battle`.

### Client: renderer
`web/js/draw.js`: draws a stickman fitted to a box, mirrored or not, with per-limb colours.
PRD ref: `prd.md > Battle`.

### Client: report and fitness
`web/js/report.js` builds the per-step report from battle samples. `web/js/fitness.js` estimates effort (body-lengths per second → MET → kcal) and keeps the streak.
PRD ref: `prd.md > Results and the AI coach`, `prd.md > Fitness`.

### Client: screens
`web/js/screens/{home,preparing,studio,battle,results,party,settings}.js`, routed by `web/js/main.js` on the URL hash. `web/js/api.js` holds fetch helpers; `web/js/dom.js` holds the element helper, toasts and beeps.
PRD ref: `prd.md > Screens and Layout`.

## Data Model
- `data/routines/<id>/meta.json`: id, title, channel, duration, thumbnail, state.
- `data/routines/<id>/video.mp4`: the download.
- `data/routines/<id>/pose.json`: `{ fps, aspect, duration, frames: [{ t, lm: [[x, y, z, visibility] × 33] }] }`.
- `data/routines/<id>/scores.json`: top 50 runs `{ name, score, accuracy, mode, at }`.
- `data/routines/<id>/coach.json`: last 30 runs `{ at, accuracy, steps: [{ label, accuracy }] }` (the coach's memory).
- `data/scout.json`: `{ at, source, groups: [{ song, original, reason, others: [{ id, label }] }] }`.
- `data/routines/<id>/` is also used for uploads, with `meta.json` marking `source: "upload"`.
- Browser `localStorage`: name, weight, mirror and speed preferences, fitness log.
- Party rooms: in server memory only, gone when empty.

## File Structure
```
dance-.-/
├── package.json
├── server/
│   ├── index.js            # Express + WebSocket entry point
│   ├── store.js            # JSON/file storage under data/
│   ├── youtube.js          # link parsing, yt-dlp download/search
│   ├── routines.js         # routines, poses, library, leaderboard, coach routes
│   ├── scout/
│   │   ├── gather.js       # yt-dlp trend searches
│   │   ├── group.js        # cluster results by song
│   │   ├── pick.js         # Claude picks the original choreography
│   │   ├── rules.js        # rule-based fallback picker
│   │   └── index.js        # pipeline + 6 h cache
│   ├── party.js            # party rooms over WebSocket
│   └── coach/
│       ├── agent.js        # Claude tool-use loop + tools + input sanitising
│       ├── cues.js         # retrieval library of teaching cues
│       └── offline.js      # rule-based fallback plan
├── web/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── main.js         # hash router + app shell
│       ├── api.js          # fetch helpers
│       ├── dom.js          # el(), toast, beep, confetti
│       ├── draw.js         # stickman renderer
│       ├── report.js       # per-step battle report
│       ├── fitness.js      # kcal, intensity, streak
│       ├── pose/
│       │   ├── skeleton.js # landmarks, bones, limbs, joints, mirror
│       │   ├── compare.js  # scoring + joint angles
│       │   ├── timeline.js # interpolation, bounds, steps, hookstep, tempo
│       │   └── tracker.js  # MediaPipe extraction + live detection
│       └── screens/        # home, preparing, studio, battle, results, party, settings
├── test/                   # node:test suites
├── data/                   # runtime cache (git-ignored)
└── devpost/                # planning docs
```

## External Services and Dependencies
- **YouTube via yt-dlp:** `yt-dlp -f "mp4[height<=720]..." -o data/routines/<id>/video.mp4 <url>`; `--dump-single-json` for metadata; `ytsearchN:<query>` for Trending. No key. Subject to YouTube's terms; videos are cached locally only.
- **MediaPipe:** the `@mediapipe/tasks-vision` npm package (0.10.14), served by our own server at `/vendor/mediapipe/`, so there's no CDN dependency. The pose model comes from `storage.googleapis.com`. Free.
- **Claude API:** `client.beta.messages.create({ model: "claude-opus-5-5", tools, messages, output_config: { effort: "medium" }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })`. Key from `ANTHROPIC_API_KEY`. A coaching run is a handful of short turns: it costs cents.

## Important Failure Modes
- **yt-dlp missing or the download fails** → Preparing shows the error and the fix ("install yt-dlp") → back to Home.
- **The camera is denied, or nobody is in frame** → a clear message, or "not seen" steps; never a fake 0%.
- **The coach can't run** (no key, API error, refusal) → offline plan, labelled.

## What Was Simplified and Why
- **JSON files instead of a database:** one user per machine; files are enough. A database would only matter for many users.
- **Hand-written cue library with keyword ranking instead of vector search:** 16 cues don't need embeddings. That would need a much larger corpus.
- **The coach reads numbers, not video:** cheaper, private and grounded. Video input would mean sending frames off-device.

## Decisions and Open Issues
- Learner choices: YouTube link; red limbs + coach as the demo moment; coach in the POC; rebuild every earlier feature, freshly written.
- Implementation choices: no framework; scoring by bone direction (position- and size-independent); a true mirror that swaps body sides; a manual agent loop (no beta tool runner) so it stops the moment a valid plan arrives.
- Learner uncertainty discussed: none identified yet.
- Open: the name, and the look-and-feel confirmation (see `prd.md > Open Questions`). Live tracking can't be verified in the build sandbox (CDN blocked), so it must be checked on the learner's machine.
