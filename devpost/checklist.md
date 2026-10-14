---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Paste a link and watch the dancer as a stickman**
  Becomes usable: Paste a YouTube link **or upload a clip** → progress while it downloads and the dancer is tracked → Studio with the video and a stickman dancing in sync, with mirror and speed controls. A second visit opens instantly.
  Why now: It's the spine every other feature stands on, and it carries the two biggest risks (yt-dlp downloads and MediaPipe tracking) right at the start. Bootstrapping is folded in here.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Getting a routine`, `prd.md > Studio`
  Spec ref: `spec.md > Server: app and storage`, `spec.md > Server: YouTube`, `spec.md > Server: routines API`, `spec.md > Client: pose modules`, `spec.md > Client: renderer`, `spec.md > Client: screens`, `spec.md > Look and Feel`
  Build: package.json, MIT LICENSE, Express server, storage, link parsing and yt-dlp download with progress, clip upload, routine status and pose cache routes, MediaPipe served from npm; web shell, router, Home (link box), Preparing (download + MediaPipe extraction), Studio (video + stickman in sync, mirror, speed); skeleton, interpolation and framing modules; stickman renderer.
  Verify (mechanical): Unit tests for link parsing, mirroring and interpolation pass. The server starts; `POST /api/routines` with a bad link returns 400 and with a good link returns an id. In Chromium, a routine (video placed in the cache, since YouTube is blocked in this sandbox) is tracked by the real MediaPipe model, the poses are cached, and the Studio renders the stickman with no console errors.
  Learner check: Run `npm start`, paste a dance link, and watch the stickman dance next to the video; toggle mirror and 0.5×.
  Commit: `Paste a link, track the dancer, and learn from a synced stickman`

- [x] **2. Loop the hard part: steps and hookstep**
  Becomes usable: The Studio opens on the hookstep, looping; the routine is cut into step chips you can tap to loop; you can drag a custom loop region.
  Why now: Steps are the unit the battle report and the coach talk about, so they must exist before either.
  PRD ref: `prd.md > Studio`
  Spec ref: `spec.md > Client: pose modules` (timeline), `spec.md > Client: screens`
  Build: Step cutting at motion pauses, hookstep by self-similarity, tempo estimate; timeline UI with chips and a draggable loop region.
  Verify (mechanical): Unit tests on synthetic motion: steps cover the routine without gaps, a planted repeating phrase is found as the hookstep, and a motionless stretch is never chosen. Studio renders the chips in Chromium.
  Learner check: Open a routine: does it start on the part everyone knows? Tap a step chip and check it loops.
  Commit: `Cut routines into steps and open on the hookstep`

- [x] **3. Battle it on camera, with wrong limbs in red**
  Becomes usable: Battle → camera → count-in → your stickman over the dancer's, live score, judgements, combo, and **any limb that's off turns red**; a basic results screen at the end.
  Why now: This is the first half of the unique kernel.
  PRD ref: `prd.md > The Core Journey` (steps 4–5), `prd.md > Battle`
  Spec ref: `spec.md > Client: pose modules` (compare, tracker), `spec.md > Client: renderer`, `spec.md > Client: screens`
  Build: Bone-direction scoring with true mirror handling, per-limb scores, live detection loop separate from the render loop, judgements, combo multiplier, rank, red-limb painting, results screen.
  Verify (mechanical): Unit tests: a pose scores 100 against itself, a mirrored copy scores 100 against the mirrored reference, position and scale don't change the score, a rotated arm is the worst limb. In Chromium with a fake camera fed from a video with a person, the battle runs, judgements appear, and the results screen renders with no console errors.
  Learner check: Battle a routine: deliberately hold one arm wrong and watch it turn red.
  Commit: `Battle on camera with live scoring and red limbs`

- [x] **4. The AI coach tells you what to fix**
  Becomes usable: Results show a per-step report and the coach card: headline, why, body cues, progress since last time, the tool trail, and a Drill button that opens the Studio on that step at that speed.
  Why now: The second half of the unique kernel.
  PRD ref: `prd.md > Results and the AI coach`, `prd.md > The Core Journey` (steps 5–6)
  Spec ref: `spec.md > Server: coach agent`, `spec.md > Client: report and fitness`, `spec.md > External Services and Dependencies`
  Build: Joint angles; per-step report; coach agent (tools, memory, retrieval, strict plan, sanitising, refusal fallback); cue library; offline coach; coach route with memory; coach card and Drill.
  Verify (mechanical): Unit tests for joint angles, report bucketing (unseen steps are null), sanitising, joint readings, cue ranking, memory, and the full agent loop against a scripted model (investigates, recovers from a bad call, rejects an invalid plan, handles a refusal). The route returns an offline plan without a key and reports progress on the second run. The results screen renders the coach card in Chromium.
  Learner check: With `ANTHROPIC_API_KEY` set, finish a battle and read the coach's plan; tap Drill.
  Commit: `Add the AI coach agent with memory, retrieval and drill`

- [x] **5. Calories, streaks and the leaderboard**
  Becomes usable: Live kcal in the battle HUD; kcal, intensity and streak on results; lifetime stats on Home; a per-routine leaderboard; Settings for name and weight.
  Why now: Round out the battle loop before the side features.
  PRD ref: `prd.md > Fitness`, `prd.md > Results and the AI coach` (leaderboard)
  Spec ref: `spec.md > Client: report and fitness`, `spec.md > Server: routines API`, `spec.md > Data Model`
  Build: Effort estimate (body-lengths/s → MET → kcal), fitness log and streak in localStorage, score routes, Settings screen.
  Verify (mechanical): Unit tests: intensity is bounded and monotonic, kcal is linear in weight, the streak handles day and month boundaries. Score route round-trip over HTTP.
  Learner check: Do a battle, check kcal and your streak, then set your weight and see the estimate change.
  Commit: `Track calories and streaks, add leaderboards and settings`

- [x] **6. Trend Scout and your routines**
  Becomes usable: Home shows Trend Scout (one card per trending dance, with the original choreography picked and the reason shown) and "Your routines"; tapping one prepares or opens it.
  Why now: Gives first-time users something to tap. It depends only on slice 1.
  PRD ref: `prd.md > Trend Scout`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Server: Trend Scout`, `spec.md > Server: YouTube`
  Build: gather, group, Claude picker with a strict tool, rule-based picker, 6 h cache; library route; Home grids showing the pick, the reason and who decided.
  Verify (mechanical): Unit tests: grouping clusters covers and tutorials of one song together; the rule picker prefers the official, earliest, non-cover upload; the Claude picker against a scripted model returns a valid pick and rejects an id outside the group. Route test with yt-dlp stubbed; Home renders in Chromium.
  Learner check: Open Home: for a dance you know, is the picked video really the original? Tap it.
  Commit: `Add Trend Scout: trending dances traced to their original choreography`

- [x] **7. Party: dance with friends**
  Becomes usable: Create or join a room by code from several phones, the host picks the routine, everyone readies up, a synchronised battle with a live room leaderboard, then room results.
  Why now: Last, because it's the biggest piece that isn't the kernel; if time runs short, this is what gets cut.
  PRD ref: `prd.md > Party`
  Spec ref: `spec.md > Server: party`, `spec.md > Client: screens`
  Build: Room server over WebSocket (codes, players, ready, host routine, start time, scores, results), Party screens.
  Verify (mechanical): A test drives two WebSocket clients through create → join → ready → start → scores → results. The lobby renders in Chromium.
  Learner check: Open the app on your laptop and your phone (same Wi-Fi), make a room, join it, and battle together.
  Commit: `Add party rooms for dancing with friends`

## Hands-on Checkpoints

- [ ] Early usable behavior explored: after slice 3 (link → stickman → battle with red limbs), on the learner's machine with a real dance link and camera
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

Learner feedback after the build (round 1):
- [x] Make compliance mode the default: `MIMIC_YTDLP=on` to opt in; caches from a source that's switched off are not served. Tested.
- [x] Make the stickman cute and unlike a normal stick figure: chibi character with a face, blush, a bean body, gummy limbs and an "oops" face. Checked in Chromium.
- [x] Design for iPhone and Android: installable PWA (manifest, service worker, icons, iPhone meta), phone-first layout with a bottom tab bar, a tap to start for iOS sound, camera-roll uploads. Checked in Chromium emulating an iPhone 13 and a Pixel 7 (install pieces, layout, a full battle). Physical phones not yet tried.
- [x] Rename the working branch to `main`.
- [x] Add related routines ("Learn it slower" in the Studio): tutorials, mirrored and slowed versions via the compliant search, ranked for learning; camera file names ask for the song. Tested (89 tests) and checked in Chromium.
- [x] Limb feedback is a scale, not just red: yellow (25°+), orange (37°+), red (50°+), with a sky-blue base colour so the scale reads clearly. Tested and checked in Chromium.
- [x] Reliability before the demo: the pose model is cached and served by our own server (downloaded once, then local); clips the browser can't decode (iPhone HEVC in desktop Chrome) get a clear fix instead of hanging; a tracking time estimate; Trend Scout and Learn it slower show a friendly note instead of erroring when no YouTube key is set. Tested (91 tests) and checked in Chromium.
- [ ] Learner tries it on their own laptop and phone (with `ANTHROPIC_API_KEY`) and reports back.

- [ ] Final review complete: feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete: guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed: offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence:
Route and stops:
Edit outcome:
Reflection:
Activity mode:

## Revisions

- Slice 1 verification: the YouTube path was tested with a stubbed yt-dlp, because YouTube is unreachable from the build sandbox. Real MediaPipe tracking was verified on an uploaded clip (8 s, 121 poses) in Chromium. Tracking took 88 s on the sandbox's software GPU; it needs timing on real hardware.

- Added clip upload alongside YouTube links. Reading the official rules showed that third-party terms and the no-copyrighted-music rule for the demo video make an upload path necessary.
- Trending became Trend Scout, which finds the original choreography behind each trend, at the learner's request for a "live backbone".
- MediaPipe is served from the npm package instead of a CDN: the CDN was unreachable in the build sandbox, and self-hosting removes a runtime dependency.
- Slice 3 verification: the Battle was driven in Chromium with a fake camera fed from video files. Same clip: 7/7 PERFECT, rank S, joint angles within ~4°. Mirrored clip in face-to-face mode: A (correct mirror copy). Rotated clip: every limb red, all MISS. Live tracking on a real webcam still needs the learner's machine.
- Battle now draws a live preview before GO (dancer frozen on the first pose, learner live) and throttles detection so it can't starve drawing. Both came out of slice-3 testing on a slow GPU.
- The planned hands-on checkpoint after slice 3 moves into the final review: the learner asked for the build to run without stopping.
- Slice 4 verification: the agent loop was tested against a scripted model (investigating, recovering from a bad call, rejecting an invalid plan, refusals, the request shape) and through the HTTP route, including memory across runs. The full battle → report → coach → Drill flow ran in Chromium with the offline coach. **The live Claude coach has not been run**: there's no API key in the build sandbox. The learner must check it with `ANTHROPIC_API_KEY` set.
- Trend Scout gathers through the official YouTube Data API when `YOUTUBE_API_KEY` is set, and falls back to yt-dlp search only when yt-dlp is allowed. Added the `MIMIC_YTDLP=off` compliance switch, which turns off link downloads and scraping, after the learner asked for live, free fetching that follows the hackathon rules. Whether it's the default is the learner's decision (still open).
- Slice 6 verification: unit tests for grouping, labels, the rule picker, Claude picks (an invalid pick falls back to rules) and API parsing; the route was tested with a stubbed search. Neither the YouTube Data API nor the live Claude picker has been called (no keys in the sandbox).
- Slice 7 verification: a WebSocket test drives full rounds (create → join → pick → ready → synchronised start → live scores → results → again; host handover; late joiners refused; clock-sync ping). Two browser sessions on fake cameras played a full party round. Found and fixed: the entry form re-rendering mid-typing. Real phones need an HTTPS link for the camera; the room now says so and shows LAN addresses. This has not been tried on real phones.
- The `/api/config` and `/api/scout` routes live in `server/coach/route.js`, next to the coach, rather than in their own files. It's an internal placement only.
- Final-review round 1 added the PWA and mobile layout (Platforms, in the PRD and spec), the chibi character, and compliance mode as the default, all at the learner's request. "Patina" in the request was read as PWA; this needs confirming with the learner.
