// Battle: dance it on camera. The dancer's stickman and yours share one stage;
// you're judged about twice a second, and any limb that's well off the
// dancer's turns red while you move.
//
// Two loops on purpose: drawing runs every display frame and never waits on
// the model; detection runs once per new camera frame and leaves its latest
// pose behind for the drawing loop to pick up.

import { el, prefs, beep, fmtTime } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { poseAt, routineBox, boxOf, easeBox, mirrorBox, sampleRoutine, findHook } from '../pose/timeline.js';
import { mirror } from '../pose/skeleton.js';
import { compare, jointAngles, limbColorsFor, liveCue, SEVERITY } from '../pose/compare.js';
import { createLiveTracker } from '../pose/tracker.js';
import { createJudge, multiplier } from '../judge.js';
import { drawFigure, fitCanvas } from '../draw.js';
import { createBurn, weightKg, intensityLabel } from '../fitness.js';

const flipX = (lm) => lm && lm.map(([x, y, z, v]) => [1 - x, y, z, v]);

export async function battleScreen(id, { onFrame, onFinish, region: forced, startAt = null } = {}) {
  let meta, pose;
  try {
    [meta, pose] = await Promise.all([api.status(id), api.pose(id)]);
  } catch {
    location.hash = `#/prep/${id}`;
    return { node: el('div') };
  }
  const frames = pose.frames;
  const duration = pose.duration;
  // 'default' (party) ignores this device's saved choice so every phone dances the same bars.
  let region = forced === 'default' ? null : forced;
  if (!region && forced !== 'default') {
    try { region = JSON.parse(sessionStorage.getItem('mimic.battleRegion') || 'null'); } catch { /* none */ }
    if (region?.id !== id) region = null;
  }
  if (!region) {
    const { hook } = findHook(sampleRoutine(frames, duration), duration);
    region = hook ? { start: hook.start, end: Math.min(duration, hook.end + hook.period * 2) } : { start: 0, end: duration };
  }
  // Mirrored view = copy with the same limb (your left for their left); the
  // un-mirrored view = copy face-to-face (your right answers their left).
  const mirrored = prefs.get('mirror', true);
  const refBox = mirrored ? mirrorBox(routineBox(frames)) : routineBox(frames);

  const refVideo = el('video', { class: 'pip-ref', src: mediaUrl(id), playsInline: true, preload: 'auto' });
  if (mirrored) refVideo.classList.add('mirrored');
  const cam = el('video', { class: 'pip-cam', playsInline: true, muted: true, autoplay: true });
  const canvas = el('canvas', { class: 'stage-canvas' });
  const scoreEl = el('b', {}, '0');
  const comboEl = el('span', { class: 'hud-combo' });
  const meterFill = el('i');
  const pops = el('div', { class: 'pops' });
  const countIn = el('div', { class: 'count-in' });
  const banner = el('div', { class: 'stage-banner' }, 'Starting the camera…');
  // The live cue: one thing to fix right now, in words, in the limb's colour.
  const cueDot = el('i');
  const cueText = el('span', {}, '');
  const wrongEl = el('div', { class: 'wrong-list' }, cueDot, cueText);
  const LEGEND_WORDS = { yellow: 'slightly off', orange: 'getting there', red: 'wrong' };
  const legend = el('div', { class: 'limb-legend', 'aria-label': 'What the limb colours mean' },
    ...[...SEVERITY].reverse().map((s) => el('span', {}, el('i', { style: { background: s.color } }), LEGEND_WORDS[s.level])));
  const kcalEl = el('b', {}, '0.0');

  const stage = el('div', { class: 'stage' },
    canvas, refVideo, cam,
    el('div', { class: 'hud' },
      el('div', { class: 'hud-score' }, scoreEl, el('small', {}, 'score')),
      comboEl,
      el('div', { class: 'meter' }, meterFill),
    ),
    el('div', { class: 'hud-kcal' }, kcalEl, el('small', {}, 'kcal')),
    wrongEl, pops, countIn, banner,
  );
  const node = el('div', { class: 'battle' },
    el('header', { class: 'battle-head' },
      el('div', {}, el('h1', {}, meta.title), el('p', { class: 'muted small' },
        `${fmtTime(region.start)}–${fmtTime(region.end)} · ${mirrored ? 'mirrored: copy with the same arm' : 'face-to-face: copy as a mirror'}`)),
      el('a', { class: 'btn ghost tiny', href: `#/learn/${id}` }, 'Leave'),
    ),
    stage,
    legend,
  );

  const judge = createJudge();
  const burn = createBurn({ weightKg: weightKg() });
  let tracker = null, stream = null, raf = 0, running = false, live = false, you = null, youBox = null, smooth = 0;
  let camAspect = 4 / 3;
  // A cue stays up at least this long, so it can be read before it changes.
  const CUE_HOLD_MS = 900;
  let cueShown = null, cueSince = 0;
  function showCue(cue, now, fallback = '') {
    if (cueShown && cue?.text !== cueShown.text && now - cueSince < CUE_HOLD_MS) return;
    if (cue?.text === cueShown?.text && cue) return;
    cueShown = cue; cueSince = now;
    cueText.textContent = cue ? cue.text : fallback;
    cueDot.style.background = cue ? cue.color : 'transparent';
    wrongEl.className = `wrong-list${cue ? ` ${cue.level}` : fallback ? ' calm' : ''}`;
  }

  function pop(j) {
    const p = el('div', { class: `pop ${j.label.toLowerCase()}` }, el('b', {}, j.label),
      j.combo > 4 ? el('small', {}, `${j.combo} combo`) : null);
    pops.append(p);
    setTimeout(() => p.remove(), 900);
    if (j.label === 'PERFECT') beep(1320, 0.05, 0.05, 'triangle');
    if (j.label === 'MISS' && j.seen) beep(180, 0.08, 0.04, 'sawtooth');
  }

  // Detection runs on the main thread, so it gets a budget: after a detection
  // that took `cost` ms, wait at least that long before the next one. On a
  // fast GPU that's every camera frame; on a slow machine it degrades to fewer
  // detections, never to a frozen stage.
  function detectLoop() {
    if (!running || !tracker) return;
    const t0 = performance.now();
    you = tracker.detect();
    const cost = performance.now() - t0;
    if (cost < 12 && cam.requestVideoFrameCallback) cam.requestVideoFrameCallback(detectLoop);
    else setTimeout(detectLoop, Math.max(16, cost));
  }

  // Before GO the stage is a preview: the dancer frozen on the first pose and
  // you live, so you can find your spot. Judging starts at GO.
  function draw() {
    if (!running) return;
    const t = live ? refVideo.currentTime : region.start;
    if (live && (t >= region.end || refVideo.ended)) { finish(); return; }
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const ref = poseAt(frames, t);
    // The dancer is a faceless ghost to follow; you are the character.
    drawFigure(ctx, mirrored ? mirror(ref) : ref, {
      w, h, box: refBox, aspect: pose.aspect, color: '#fff3e6', alpha: 0.32, mood: 'none',
    });

    let cmp = null;
    if (you) {
      // Score: mirrored view → same limbs, as filmed; face-to-face → against
      // the dancer's mirror image (sides swapped), so your right answers their left.
      cmp = compare(mirrored ? ref : mirror(ref), you, { refAspect: pose.aspect, youAspect: camAspect });
      // Show yourself as a mirror would. Reflect x only — your limbs keep their
      // own names, so the red one is the one you need to move.
      youBox = easeBox(youBox, mirrorBox(boxOf(you)), 0.15);
      const limbColors = limbColorsFor(cmp);
      const good = cmp && cmp.score >= 70;
      drawFigure(ctx, flipX(you), {
        w, h, box: youBox, aspect: camAspect, glow: true, limbColors,
        // Base colour stays clear of the yellow/orange/red scale painted on off limbs.
        color: good ? '#7cf0b8' : '#a9dcff', mood: cmp?.wrong.length ? 'oops' : 'happy',
      });
      const refCmp = mirrored ? ref : mirror(ref);
      showCue(liveCue(refCmp, you, cmp, { refAspect: pose.aspect, youAspect: camAspect }), performance.now(),
        cmp ? (good ? 'Looking good, keep it up' : '') : 'Get your whole body in view');
    } else {
      showCue(null, performance.now(), 'Step into the frame');
    }
    if (!live) { raf = requestAnimationFrame(draw); return; }

    const extra = cmp ? { you: jointAngles(you, camAspect), ref: jointAngles(mirrored ? ref : mirror(ref), pose.aspect) } : {};
    // Calories from your own motion, on the wall clock so dropped frames don't distort the rate.
    burn.push(you, performance.now() / 1000);
    kcalEl.textContent = burn.kcal.toFixed(1);
    const j = judge.push(t, cmp, extra);
    if (j) pop(j);
    smooth = smooth * 0.85 + (cmp ? cmp.score : 0) * 0.15;
    meterFill.style.width = `${smooth}%`;
    meterFill.className = smooth >= 70 ? 'good' : smooth >= 45 ? 'warn' : '';
    scoreEl.textContent = judge.state.score.toLocaleString();
    comboEl.textContent = judge.state.combo >= 3 ? `${judge.state.combo} combo · ${multiplier(judge.state.combo)}×` : '';
    onFrame?.({ t, cmp, you, score: judge.state.score, combo: judge.state.combo });
    raf = requestAnimationFrame(draw);
  }

  function finish() {
    if (!running) return;
    running = false;
    refVideo.pause();
    const result = {
      id, title: meta.title, region, mirrored, at: new Date().toISOString(), ...judge.result(),
      workout: { ...burn.summary(), label: intensityLabel(burn.summary().peak) },
    };
    teardown();
    if (onFinish) { onFinish(result); return; }
    try { sessionStorage.setItem('mimic.result', JSON.stringify(result)); } catch { /* too big; results will say so */ }
    location.hash = `#/results/${id}`;
  }

  function teardown() {
    running = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    tracker?.close();
    tracker = null;
  }

  async function begin() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
      });
    } catch (e) {
      banner.textContent = e.name === 'NotAllowedError'
        ? 'Mimic needs your camera to see you dance. Allow it in the address bar, then reload.'
        : `Camera unavailable: ${e.message}`;
      banner.classList.add('bad');
      return;
    }
    cam.srcObject = stream;
    await cam.play().catch(() => {});
    camAspect = (cam.videoWidth / cam.videoHeight) || 4 / 3;
    banner.textContent = 'Loading the body tracker…';
    tracker = await createLiveTracker(cam);
    if (refVideo.readyState < 1) {
      const ok = refVideo.error ? false : await new Promise((r) => {
        refVideo.addEventListener('loadedmetadata', () => r(true), { once: true });
        refVideo.addEventListener('error', () => r(false), { once: true });
      });
      if (!ok) {
        banner.textContent = 'This browser can\'t play this routine\'s video. Try Chrome or Safari, or re-export the clip as an H.264 MP4.';
        banner.classList.add('bad');
        tracker?.close(); tracker = null;
        return;
      }
    }
    refVideo.currentTime = region.start;
    refVideo.playbackRate = 1;

    running = true;
    detectLoop();
    raf = requestAnimationFrame(draw);

    // Phones (iPhone especially) only allow sound after a tap, and a party
    // start is already scheduled, so: solo waits for a tap here; party taps
    // are optional and the dance starts on time either way (muted if needed).
    banner.replaceChildren(el('button', { class: 'btn primary big' }, startAt ? 'Tap for sound' : 'Tap to start'),
      el('small', {}, 'Stand back until your whole body is in the camera.'));
    banner.classList.add('tap');
    const tapped = new Promise((resolve) => banner.querySelector('button').addEventListener('click', () => {
      refVideo.play().then(() => refVideo.pause()).catch(() => {}); // unlock audio inside the gesture
      resolve();
    }, { once: true }));
    if (startAt) Promise.race([tapped, new Promise((r) => setTimeout(r, Math.max(0, startAt - 2600 - Date.now())))]).then(() => banner.remove());
    else await tapped;
    banner.remove();
    if (!running) return;
    // In a party, every phone's count-in ends at the same agreed instant.
    const COUNT = 4 * 650;
    if (startAt) {
      const wait = startAt - COUNT - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    for (const n of ['3', '2', '1', 'GO']) {
      countIn.textContent = n;
      countIn.classList.add('show');
      beep(n === 'GO' ? 1320 : 660, 0.09, 0.08, 'triangle');
      await new Promise((r) => setTimeout(r, 650));
      countIn.classList.remove('show');
      if (!running) return;
    }
    // Arrived late to a party start? Skip ahead so you're on the same beat as everyone.
    if (startAt) refVideo.currentTime = Math.min(region.end - 0.5, region.start + Math.max(0, (Date.now() - startAt) / 1000));
    await refVideo.play().catch(() => { refVideo.muted = true; return refVideo.play(); });
    live = true;
  }

  return { node, mounted: begin, destroy: teardown };
}
