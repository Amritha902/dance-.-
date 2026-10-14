---
doc: prd
status: approved
---

# Mimic: Product Requirements

Learn any trending dance from a YouTube link: a mirrored stickman to study, live camera scoring with red limbs, and an AI coach that says what to fix. For people learning choreography alone. Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey
Source: `scope.md > The Core Loop`.
1. **Home.** Paste a YouTube link, or tap a card in the Trending feed.
2. **Preparing.** A progress screen shows downloading, then "reading the choreography" while the dancer's body is tracked. The second visit to the same routine is instant.
3. **Studio.** The video and the stickman play side by side, in sync. The app opens on the detected hookstep, looping. The learner toggles mirror, sets speed (0.25×, 0.5×, 0.75×, 1×), taps a step to loop it, or drags a custom loop region.
4. **Battle.** The learner taps "Battle this". The camera turns on and a 4-beat count-in plays. The reference stickman and the learner's stickman overlap on one stage. Judgements pop up about twice a second, the combo builds, and **any limb that's well off turns red**.
5. **Results.** Rank, score, accuracy, judgement tally, calories and streak. Below that, the **coach card**: headline, why, 1–3 body cues, progress since last time, and a "Drill Step N at 0.5× · 8 loops" button. Then the step-by-step report and the leaderboard.
6. **Drill.** The button opens the Studio looping the coach's step at the coach's speed. Then battle again.

## Screens and Layout
- **Home:** link box, Trending grid, "Your routines" (already prepared), lifetime fitness stats.
- **Preparing:** progress bar with the current stage.
- **Studio:** video and stickman panes; transport bar (play, speed, mirror, stickman-only); timeline with step chips and loop region; Battle button.
- **Battle:** full-width dark stage; HUD with score, combo, accuracy bar and kcal; judgement pop-ups; your camera as a small picture-in-picture.
- **Results:** score card → coach card → step report → leaderboard → actions (Run it back, Studio).
- **Party:** create or join with a 4-letter code; lobby with players and ready states; host picks the routine; synchronised battle; live room leaderboard; room results.
- **Settings:** display name, body weight (for calories).

## Look and Feel
Source: `scope.md > Inspiration & Identity`. Approved by the learner: warm, light paper-and-ink pages, with one bold accent colour; a dark stage for Battle so the stickmen glow; a serif display face for big numbers and an easy sans for UI. Game-like feedback (pop-ups, combo, confetti on S/A ranks) without clutter.

## Features and Behavior

### Getting a routine
- As a learner, I paste a YouTube link and get a ready-to-learn routine.
  - [ ] Valid links (watch, youtu.be, shorts) are accepted; anything else shows "That doesn't look like a YouTube link."
  - [ ] Progress is shown while downloading and while tracking.
  - [ ] A routine already prepared opens without re-downloading or re-tracking.

### Studio
Source: `scope.md > The POC Boundary`.
- [ ] Stickman and video stay in sync while playing and seeking.
- [ ] Mirror flips the stickman *and* swaps body sides, so "left" means the learner's left when facing the screen.
- [ ] Speed 0.25–1× applies to both.
- [ ] Steps are cut automatically at natural pauses; tapping a step loops it.
- [ ] The hookstep (the part that repeats) is detected and opened first; if none is found, the whole clip is used.

### Battle
- [ ] Camera permission is requested; if it's denied, a clear message explains why it's needed.
- [ ] Scoring ignores where the learner stands and how far they are from the camera.
- [ ] Copying face-to-face (mirrored) scores as well as copying side-on.
- [ ] Judgements (PERFECT, GREAT, GOOD, OFF, MISS) about twice a second; a combo multiplier up to 4×.
- [ ] **Red limbs:** each of the learner's arms, legs and torso turns red when its direction is more than about 50° off the dancer's.
- [ ] Calories accumulate live.

### Results and the AI coach
Source: `scope.md > The Unique Kernel`.
- [ ] A per-step report: accuracy, the limb missed most, and "not seen" (never 0%) for steps where the camera didn't see the learner.
- [ ] **The coach is an agent**: Claude, with tools to read the step report, inspect one step's joint angles, recall past attempts on this routine (memory), and retrieve teaching cues from a cue library (retrieval). It submits one plan.
- [ ] Every number in the plan comes from measured data.
- [ ] The plan names one step, 1–3 body cues, a drill speed and loop count, and progress since last time.
- [ ] "How the coach got here" lists the tools it used.
- [ ] Without an API key, a rule-based coach gives the same kind of plan and is labelled as offline.
- [ ] The Drill button opens the Studio on that step, at that speed.
- [ ] Leaderboard per routine.

### Trending
- [ ] Home shows current dance-challenge videos, refreshed every few hours; tapping one prepares it.

### Fitness
- [ ] Calorie and intensity estimate per battle, from body motion and the learner's weight.
- [ ] Daily streak and lifetime totals on Home.

### Party
- [ ] Create a room (4-letter code) or join with a code from another phone.
- [ ] The host chooses the routine; everyone readies up; the start is synchronised.
- [ ] Live room leaderboard during the battle; room results after.

## States and Boundaries
- **First use:** empty "Your routines"; Trending gives something to tap.
- **Preparing failure:** download fails or there's no dancer in the video → a message and back to Home.
- **No dancer visible in Battle:** no judgements; the step shows "not seen".
- **Coach unavailable:** offline coach, labelled.
- **Persistence:** routines, leaderboards and coach memory are stored on the machine running the app; name, weight and streak are stored in the browser.
- **Privacy:** camera frames and poses never leave the browser; the coach gets only step numbers.

## Product Decisions
- **YouTube link, not upload:** the learner chose the link because it's the natural way people find dances. Accepted tradeoff: it needs a local server with yt-dlp.
- **Demo moment = red limbs + coach**, as chosen by the learner.
- **The coach is in the POC**, as chosen by the learner.
- **Rebuild every feature from the earlier idea** (studio, battle, trending, fitness, party), as chosen by the learner, written fresh in this repo.

## What We're Building
Everything under Features and Behavior.

## Deferred From the POC
- **Spotify connection:** not part of learning a dance, and needs a developer account to test.
- **Accounts:** names are local; not needed to prove the idea.

## Possible Later Enhancements
- A coach that looks at video frames, not just numbers.
- A coach that suggests slower tutorials of the same song.
- Streaming the coach's tool calls live as it works.

## Non-Goals
- Hosting or redistributing videos: they're cached only on the user's machine.
- Exact calorie measurement: it's an estimate, and it's labelled as one.
- Multi-dancer or 3D tracking.

## Open Questions
- **Name:** resolved: the learner chose "Mimic".
- **Look and feel:** resolved: the learner approved the direction above.
