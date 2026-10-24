## 💃 Inspiration

Every trend starts the same way: a 15-second dance blows up, and you want to learn it. So you replay the video fifty times. It's too fast, it's not mirrored, so your left is their right, and nobody tells you **what you're actually getting wrong**. Dance games only work with their own song list and give you a score, not a correction.

I wanted the thing I didn't have: **a coach in my camera that works with any dance video and tells me exactly what to fix.** Not "72%", but _"Step 4: your right knee is 74° straighter than the dancer's. Unlock your knees and keep a small bounce. Drill it at 0.75×."_

![Your limbs light up while you dance](https://raw.githubusercontent.com/Amritha902/dance-.-/main/devpost/media/1-battle.png)

## 🎯 What it does

**Mimic turns any dance video into a personal coach.**

1. **Upload a dance.** Mimic tracks the dancer's body (33 points per frame) in your browser and caches it.
2. **Learn it slowly.** The dancer becomes a cute mirrored stickman you can slow to 0.25× and loop. Mimic finds the **hookstep** (the move that repeats most) and cuts the routine into **steps** for you.
3. **Battle on camera.** You're judged twice a second (PERFECT → MISS) with combos and a rank. **Your limbs light up while you move:** yellow when slightly off, orange when getting there, red when wrong. A live tip names the one fix that matters right now, like _"Left leg: bend the knee more"_.
4. **Get coached.** When the song ends, an **AI coach agent** reads your run step by step, remembers your earlier attempts, and gives you **one plan**: which step, what to fix in your body, and the speed to drill it at. **Drill** opens exactly that step at exactly that speed.

Plus:
- 🔎 **Trend Scout** traces each trending dance back to its **original choreography**, not covers, tutorials or mirrored re-uploads, and shows why.
- 🐢 **Learn it slower** finds tutorials and slowed versions of the same dance, most helpful first.
- 🎉 **Party:** friends join a 4-letter room on their own phones, count in to the same instant and race on a live leaderboard.
- 🔥 **Workout:** a calorie estimate, intensity and a daily streak.
- 📱 **An app for iPhone and Android:** installs from the browser (PWA), with a phone-first layout.

![A coach that tells you exactly what to fix](https://raw.githubusercontent.com/Amritha902/dance-.-/main/devpost/media/3-coach.png)

## 🛠️ How I built it

![How Mimic is built](https://raw.githubusercontent.com/Amritha902/dance-.-/main/devpost/media/6-architecture.png)

**Seeing: computer vision in the browser.** MediaPipe Pose Landmarker runs on-device, on both the dancer's video and your webcam. **Camera frames never leave your device.**

**Scoring: directions, not positions.** Where you stand and how far you are from the camera shouldn't matter, so every bone becomes a unit vector:

$$\hat{u} = \frac{p_b - p_a}{\lVert p_b - p_a \rVert}$$

Each limb is judged by the average angle between your bones and the dancer's:

$$\theta_{\text{limb}} = \arccos\left(\frac{1}{n}\sum_{i=1}^{n} \hat{u}_i^{\,\text{dancer}} \cdot \hat{u}_i^{\,\text{you}}\right)$$

That angle drives the colour scale you see live:

$$\text{colour}(\theta) = \begin{cases} \text{red} & \theta \ge 50^\circ \\ \text{orange} & 37^\circ \le \theta < 50^\circ \\ \text{yellow} & 25^\circ \le \theta < 37^\circ \\ \text{your own colour} & \text{otherwise} \end{cases}$$

The frame score uses a curve that is steeper near the top, so "roughly right" can't coast into PERFECT:

$$S = 100 \cdot \max\left(0,\; 1 - \frac{\bar{\theta}}{90^\circ}\right)^{1.4}$$

Every 10 moves in a row raise the combo multiplier, capped so one streak can't outweigh the whole song: \\( m = \min\left(4,\; 1 + 0.5\lfloor c/10 \rfloor\right) \\).

**A true mirror.** Flipping the picture isn't enough. A real mirror also **swaps left and right**, so copying face-to-face is scored against the dancer's mirror image, and the limb that lights up is always _your_ limb.

**Finding the hookstep.** The routine is resampled at 10 Hz, and Mimic measures how well the dance matches a shifted copy of itself at every lag \\( L \\). The hookstep is the most prominent repeat, with motionless title cards masked out. Steps are cut at dips in motion energy.

**The AI coach: an agent, not a prompt.** Claude gets five tools: `read_report`, `inspect_step`, `recall_history` (memory of your past runs), `find_cues` (retrieval from a hand-written teaching library) and `give_plan` (a strict schema, validated before you see it). **Every number it says comes out of a tool**, so it can't invent your scores. Without an API key, a rule-based coach answers instead, and the card says so.

```js
// The coach must ground every claim in tool results
const TOOLS = [read_report, inspect_step, recall_history, find_cues, give_plan];
// give_plan is strict: { headline, step, why, cues[], speed, loops, progress }
```

**Trend Scout: Claude as a judge.** Videos from the official **YouTube Data API** are grouped by song. Claude picks the original from metadata only (title, channel, upload date, views) through one strict tool. Every pick is checked; anything that fails falls back to fixed rules (official signals, earliest upload, not a cover or tutorial).

**Stack:** vanilla JavaScript and Canvas (no build step), Node.js, Express, WebSockets, MediaPipe Tasks Vision, the Anthropic SDK, the YouTube Data API v3, and a PWA (manifest and service worker). **93 automated tests** run on Node's built-in test runner.

![Learn it slowly from a cute stickman](https://raw.githubusercontent.com/Amritha902/dance-.-/main/devpost/media/2-studio.png)

## ✅ Proof it works

I tested Mimic in a real browser with the real MediaPipe model, feeding the camera from video files so every result has a known right answer:

| Test | What should happen | What happened |
|---|---|---|
| Dance the **same** routine back to it | Near-perfect | **7/7 PERFECT, rank S**, joint angles within ~4° |
| Copy it **face-to-face**, as a mirror | Counted as correct | **Rank A**: the mirror copy is recognised |
| A **rotated**, deliberately wrong body | Everything flagged | **Every limb red, every judgement MISS** |
| A clip that repeats every **2.0 s** | Hookstep = 2.0 s | **Found 2.0 s exactly** |
| A routine built to repeat every **3 s** | Hookstep = 3 s | **Found 3 s** (it said 6 s before I fixed a bug) |
| Track an 8-second clip | A pose for every frame | **121 body poses** |
| **Party** in two browsers | Same count-in, shared board | **Counted in together and finished on one leaderboard** |
| Phone layouts | Fits, no overlap | **Checked at iPhone 13 and Pixel 7 sizes** |

Plus **93 automated tests**: mirroring, scale and position invariance, the live tip's direction, the coach agent loop against a scripted model, Trend Scout's picks, the calorie maths and full Party rounds.

## 🧗 Challenges I ran into

- **Left vs right is harder than it looks.** My first mirror just flipped the image, so a learner copying face-to-face with their right arm was marked wrong for "using the wrong limb". The fix was a real mirror that reflects **and** swaps body sides, plus drawing your own figure flipped while keeping your limbs' true names.
- **The hookstep detector picked 6 s instead of 3 s.** On a synthetic routine built to repeat every 3 seconds, it answered 6. Longer repeats were judged against a wider baseline, so they looked more prominent. I now compare every lag against a fixed-width neighbourhood and prefer the shortest of near-equal peaks. On a real video that bug would have looked believable.
- **Pose detection starved the animation.** On a slow GPU, detecting every frame froze the stage. I split it into two loops: drawing runs every display frame, and detection runs on its own time budget, slowing down gracefully instead of freezing.
- **Keeping the AI honest.** A coach that makes up angles is worse than none. So the model only sees numbers through tools, and its plan must pass a strict schema before it reaches you.
- **Playing by the rules.** Downloading from YouTube can break its terms, so Mimic is **upload-first** and reads trends through the **official YouTube Data API**. Link downloads are an opt-in switch, off by default.
- **Phones.** iPhone only plays sound after a tap, cameras need HTTPS, and some iPhone clips (HEVC) won't play in desktop browsers. Each needed its own fix, from "Tap to start" to a clear message telling you how to convert the clip.

![An app on iPhone and Android](https://raw.githubusercontent.com/Amritha902/dance-.-/main/devpost/media/4-phones.png)

## 🏆 Accomplishments that I'm proud of

- Limbs that **light up on a scale in real time**, with a tip in plain words, so feedback is something you _see_ while you move.
- An AI coach that names **the step, the limb, the angle and the fix**, and remembers how you did last time.
- **Scoring that ignores where you stand and how far you are from the camera**: only the shape of your body counts.
- One codebase that works on a laptop, an **iPhone and an Android phone**, plus multiplayer Party rooms.

## 📚 What I learned

- **Test against answers you already know.** Feeding the hookstep finder a routine built to repeat every 3 seconds caught a bug that real videos would have hidden.
- **Use AI where it adds judgement, not where maths is enough.** Geometry does the scoring and Claude does the coaching. Giving the model tools instead of one giant prompt made it accurate and checkable.
- **Design the feedback, not just the score.** The colour scale and the cute "oops" face make it feel like a game, not an exam.

## 🚀 What's next for Mimic

- A coach that **watches the video itself**, not just the numbers, to explain style and timing.
- **Beat-aware judging**, so being on the music counts, not just the shape.
- **Multi-dancer tracking** for group choreography.
- A hosted version, so anyone can try it from a link with no setup.

---

▶ **Try it live:** [mimic-3r1u.onrender.com](https://mimic-3r1u.onrender.com) (free hosting: give the first load about a minute)

🔗 **Code:** [github.com/Amritha902/dance-.-](https://github.com/Amritha902/dance-.-) · MIT licensed · planning documents in `devpost/` (scope, PRD and spec)
