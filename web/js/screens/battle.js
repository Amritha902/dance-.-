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
import { compare, jointAngles } from '../pose/compare.js';
import { createLiveTracker } from '../pose/tracker.js';
import { createJudge, multiplier } from '../judge.js';
import { drawFigure, fitCanvas } from '../draw.js';

const WRONG = '#ff2d55';
const flipX = (lm) => lm && lm.map(([x, y, z, v]) => [1 - x, y, z, v]);

export async function battleScreen(id, { onFrame, onFinish, region: forced } = {}) {
  let meta, pose;
  try {
    [meta, pose] = await Promise.all([api.status(id), api.pose(id)]);
  } catch {
    location.hash = `#/prep/${id}`;
    return { node: el('div') };
  }
  const frames = pose.frames;
  const duration = pose.duration;
  let region = forced;
  if (!region) {
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
  const wrongEl = el('div', { class: 'wrong-list' });

  const stage = el('div', { class: 'stage' },
    canvas, refVideo, cam,
    el('div', { class: 'hud' },
      el('div', { class: 'hud-score' }, scoreEl, el('small', {}, 'score')),
      comboEl,
      el('div', { class: 'meter' }, meterFill),
    ),
    wrongEl, pops, countIn, banner,
  );
  const node = el('div', { class: 'battle' },
    el('header', { class: 'battle-head' },
      el('div', {}, el('h1', {}, meta.title), el('p', { class: 'muted small' },
        `${fmtTime(region.start)}–${fmtTime(region.end)} · ${mirrored ? 'mirrored: copy with the same arm' : 'face-to-face: copy as a mirror'}`)),
      el('a', { class: 'btn ghost tiny', href: `#/learn/${id}` }, 'Leave'),
    ),
    stage,
  );

  const judge = createJudge();
  let tracker = null, stream = null, raf = 0, running = false, live = false, you = null, youBox = null, smooth = 0;
  let camAspect = 4 / 3;

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
    drawFigure(ctx, mirrored ? mirror(ref) : ref, {
      w, h, box: refBox, aspect: pose.aspect, color: 'rgba(246, 239, 228, .42)', width: Math.max(6, w * 0.016),
    });

    let cmp = null;
    if (you) {
      // Score: mirrored view → same limbs, as filmed; face-to-face → against
      // the dancer's mirror image (sides swapped), so your right answers their left.
      cmp = compare(mirrored ? ref : mirror(ref), you, { refAspect: pose.aspect, youAspect: camAspect });
      // Show yourself as a mirror would. Reflect x only — your limbs keep their
      // own names, so the red one is the one you need to move.
      youBox = easeBox(youBox, mirrorBox(boxOf(you)), 0.15);
      const limbColors = Object.fromEntries((cmp?.wrong || []).map((n) => [n, WRONG]));
      const good = cmp && cmp.score >= 70;
      drawFigure(ctx, flipX(you), {
        w, h, box: youBox, aspect: camAspect, glow: true, limbColors,
        color: good ? '#2fe08a' : '#ffb020', width: Math.max(5, w * 0.012),
      });
      wrongEl.textContent = cmp?.wrong.length ? `Fix: ${cmp.wrong.join(', ')}` : '';
    } else {
      wrongEl.textContent = 'Step into the frame';
    }
    if (!live) { raf = requestAnimationFrame(draw); return; }

    const extra = cmp ? { you: jointAngles(you, camAspect), ref: jointAngles(mirrored ? ref : mirror(ref), pose.aspect) } : {};
    const j = judge.push(t, cmp, extra);
    if (j) pop(j);
    smooth = smooth * 0.85 + (cmp ? cmp.score : 0) * 0.15;
    meterFill.style.width = `${smooth}%`;
    meterFill.className = smooth >= 70 ? 'good' : smooth >= 45 ? 'warn' : '';
    scoreEl.textContent = judge.state.score.toLocaleString();
    comboEl.textContent = judge.state.combo >= 3 ? `${judge.state.combo} combo · ${multiplier(judge.state.combo)}×` : '';
    onFrame?.({ t, cmp, you });
    raf = requestAnimationFrame(draw);
  }

  function finish() {
    if (!running) return;
    running = false;
    refVideo.pause();
    const result = {
      id, title: meta.title, region, mirrored, at: new Date().toISOString(), ...judge.result(),
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
    if (refVideo.readyState < 1) await new Promise((r) => refVideo.addEventListener('loadedmetadata', r, { once: true }));
    refVideo.currentTime = region.start;
    refVideo.playbackRate = 1;
    banner.remove();

    running = true;
    detectLoop();
    raf = requestAnimationFrame(draw);
    for (const n of ['3', '2', '1', 'GO']) {
      countIn.textContent = n;
      countIn.classList.add('show');
      beep(n === 'GO' ? 1320 : 660, 0.09, 0.08, 'triangle');
      await new Promise((r) => setTimeout(r, 650));
      countIn.classList.remove('show');
      if (!running) return;
    }
    await refVideo.play().catch(() => { refVideo.muted = true; return refVideo.play(); });
    live = true;
  }

  return { node, mounted: begin, destroy: teardown };
}
