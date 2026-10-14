---
doc: scope
status: draft
---

# Mimic (working title)

Paste a YouTube link to a trending dance. Learn it from a clean, mirrored stickman, then dance it on camera, where your wrong limbs light up red, and an AI coach tells you exactly what to fix.

## The Unique Kernel
**It doesn't just show you the dance, it coaches you.** While you dance, the limb you have wrong turns red on your own stickman. When the song ends, an AI coach looks at your run step by step, remembers your past attempts, and gives you one specific thing to drill. Other dance apps give you a score; this one tells you *which step*, *which limb*, and *how to fix it*.

## Who It's For
Someone who sees a dance trend (a K-pop chorus, a Bollywood hookstep, a viral challenge) and wants to learn it from the video, without a teacher. Today they replay the video over and over and copy it backwards in their head, with no idea what they're getting wrong.

## The Core Loop
Paste a link → watch the stickman and loop the hard part at slow speed with the mirror on → hit Battle and dance it on camera → see your score, your red limbs and the coach's plan → drill the step the coach picked → battle again and see it improve.
They come back because the coach remembers: "Step 2: 36% → 55%."

## Inspiration & Identity
A rhythm game (judgements, combos, a rank) crossed with a dance studio mirror. Energetic but clean. The stickman is the hero, not the video.

## Why This Matters to the Learner
They want a standout entry that uses AI meaningfully ("don't build pointlessly with AI"), on a topic they care about: trending dances that are hard to learn.

## What "Working" Looks Like
From a YouTube link: the stickman dances in sync with the video, mirrored, slowed and looped. In Battle, your stickman is drawn over the dancer's, and **your wrong limbs turn red as you move**. The results show a score per step, and **the AI coach writes a plan** ("Step 2: your left elbow is 76° straighter than the dancer's, bend it like you're holding a cup") with a button that drills that exact step.
The "oh, that's cool" beat: red limbs while dancing, then the coach naming the exact fix.

## The POC Boundary
- YouTube link → video download → pose extraction → cached routine
- Studio: stickman and video in sync, mirror, speed, loop, auto-cut steps, hookstep detection
- Battle: live camera scoring, judgements, combo, rank, **live red limbs**
- Results: step-by-step report, **AI coach** (an agent with tools, memory and retrieval), Drill button, leaderboard
- Trending feed of current dance challenges
- Calories, intensity and daily streak
- Party rooms: friends on their own phones, synchronised start, live leaderboard

## Later
- Spotify connection (profile and top tracks)
- Coach watches the video itself, not just the numbers
- Coach recommends slower tutorial videos of the same song

## Explicitly Cut
- **Accounts and login.** Not needed to prove the idea; names are local.
- **Uploading or hosting other people's videos publicly.** Videos are cached only on the machine running the app.
- **3D or multi-dancer tracking.** One dancer, 2D: enough to learn from, and far simpler.
