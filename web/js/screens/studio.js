// Studio: where you learn the move. The video and a clean stickman of the same
// dancer play in lockstep. Mirror it so the dancer's left lands on your left
// when you face the screen, slow it down, and loop.

import { el, fmtTime, prefs, toast } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { poseAt, routineBox, mirrorBox, sampleRoutine, cutSteps, findHook, estimateTempo } from '../pose/timeline.js';
import { mirror } from '../pose/skeleton.js';
import { drawFigure, fitCanvas } from '../draw.js';

const SPEEDS = [0.25, 0.5, 0.75, 1];

export async function studioScreen(id) {
  let meta, pose;
  try {
    [meta, pose] = await Promise.all([api.status(id), api.pose(id)]);
  } catch {
    location.hash = `#/prep/${id}`;
    return { node: el('div') };
  }

  const frames = pose.frames;
  const duration = pose.duration;
  const box = routineBox(frames);
  const samples = sampleRoutine(frames, duration);
  const steps = cutSteps(samples, duration);
  const { hook } = findHook(samples, duration);
  const bpm = estimateTempo(samples);
  const whole = { label: 'Whole routine', start: 0, end: duration };
  // A Drill from the coach (or another screen) can ask to open on a region.
  let region = hook ? { label: 'Hook', start: hook.start, end: hook.end } : whole;
  try {
    const ask = JSON.parse(sessionStorage.getItem('mimic.openRegion') || 'null');
    sessionStorage.removeItem('mimic.openRegion');
    if (ask && ask.end > ask.start) {
      region = { label: ask.label || 'Drill', start: ask.start, end: ask.end };
      if (ask.speed) prefs.set('speed', ask.speed);
    }
  } catch { /* ignore */ }
  let looping = true;
  let mirrored = prefs.get('mirror', true);
  let speed = prefs.get('speed', 1);
  let stickOnly = false;
  let raf = 0;

  const video = el('video', { class: 'studio-video', src: mediaUrl(id), playsInline: true, preload: 'auto' });
  const canvas = el('canvas', { class: 'studio-canvas' });
  const playBtn = el('button', { class: 'btn round', 'aria-label': 'Play' }, '▶');
  const timeLabel = el('span', { class: 'time' }, '0:00');
  const head = el('i', { class: 'tl-head' });
  const regionEl = el('i', { class: 'tl-region' });
  const tl = el('div', { class: 'timeline', title: 'Click to jump · drag to loop a region' },
    ...steps.map((st) => el('i', { class: 'tl-step', style: { left: pct(st.start), width: pct(st.end - st.start) } })),
    regionEl, head);
  const loopBtn = el('button', { class: 'chip-btn on', onclick: () => setLooping(!looping) }, 'Loop');
  const regionChips = [
    hook ? { label: 'Hook', start: hook.start, end: hook.end, hook: true } : null,
    ...steps,
    whole,
  ].filter(Boolean).map((r) => {
    const b = el('button', {
      class: `region-chip${r.hook ? ' hook' : ''}`,
      onclick: () => { setRegion(r); video.currentTime = r.start; video.play(); },
    }, el('b', {}, r.label), el('small', {}, `${fmtTime(r.start)}–${fmtTime(r.end)}`));
    b.dataset.key = `${r.start}-${r.end}`;
    return b;
  });

  const speedBtns = SPEEDS.map((s) => el('button', {
    class: 'chip-btn', onclick: () => setSpeed(s),
  }, `${s}×`));
  const mirrorBtn = el('button', { class: 'chip-btn', onclick: () => setMirror(!mirrored) }, 'Mirror');
  const stickBtn = el('button', {
    class: 'chip-btn',
    onclick: () => { stickOnly = !stickOnly; stickBtn.classList.toggle('on', stickOnly); panes.classList.toggle('stick-only', stickOnly); },
  }, 'Stickman only');

  function setSpeed(s) {
    speed = s; prefs.set('speed', s);
    video.playbackRate = s;
    speedBtns.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === s));
  }
  function setMirror(m) {
    mirrored = m; prefs.set('mirror', m);
    mirrorBtn.classList.toggle('on', m);
    video.classList.toggle('mirrored', m);
  }

  playBtn.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
  video.addEventListener('play', () => { playBtn.textContent = '❚❚'; });
  video.addEventListener('pause', () => { playBtn.textContent = '▶'; });
  function pct(sec) { return `${(sec / duration) * 100}%`; }
  function setRegion(r) {
    region = r;
    regionEl.style.left = pct(r.start);
    regionEl.style.width = pct(r.end - r.start);
    for (const b of regionChips) b.classList.toggle('on', b.dataset.key === `${r.start}-${r.end}`);
  }
  function setLooping(on) { looping = on; loopBtn.classList.toggle('on', on); }

  // Click to seek; drag to draw a loop region.
  tl.addEventListener('pointerdown', (e) => {
    const rect = tl.getBoundingClientRect();
    const at = (x) => Math.max(0, Math.min(duration, ((x - rect.left) / rect.width) * duration));
    const t0 = at(e.clientX);
    let dragged = false;
    tl.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (Math.abs(ev.clientX - e.clientX) < 5 && !dragged) return;
      dragged = true;
      const t1 = at(ev.clientX);
      setRegion({ label: 'Custom', start: Math.min(t0, t1), end: Math.max(t0, t1) });
    };
    const up = () => {
      tl.removeEventListener('pointermove', move);
      tl.removeEventListener('pointerup', up);
      if (!dragged) {
        if (t0 < region.start || t0 > region.end) setRegion(whole);
        video.currentTime = t0;
      } else if (region.end - region.start < 0.4) setRegion(whole);
      else { video.currentTime = region.start; setLooping(true); }
    };
    tl.addEventListener('pointermove', move);
    tl.addEventListener('pointerup', up);
  });
  video.addEventListener('error', () => toast('This video could not be played in your browser.', 'bad'));

  const panes = el('div', { class: 'studio-panes' },
    el('div', { class: 'pane video-pane' }, video),
    el('div', { class: 'pane stick-pane' }, canvas),
  );

  const node = el('div', { class: 'studio' },
    el('header', { class: 'studio-head' },
      el('div', {},
        el('h1', {}, meta.title),
        el('p', { class: 'muted small' }, [
          meta.channel, fmtTime(duration), bpm ? `~${bpm} BPM` : null,
          `${steps.length} steps`, hook ? `hookstep ${hook.period.toFixed(1)}s` : 'no clear hookstep',
        ].filter(Boolean).join(' · ')),
      ),
    ),
    panes,
    el('div', { class: 'transport' },
      playBtn, timeLabel, tl,
      el('div', { class: 'chips' }, ...speedBtns, mirrorBtn, stickBtn, loopBtn),
    ),
    el('div', { class: 'region-row' }, ...regionChips),
  );

  function frame() {
    let t = video.currentTime;
    if (looping && !video.paused && (t >= region.end - 0.03 || t < region.start - 0.25)) {
      video.currentTime = t = region.start;
    }
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    let lm = poseAt(frames, t);
    let b = box;
    if (mirrored) { lm = mirror(lm); b = mirrorBox(box); }
    drawFigure(ctx, lm, { w, h, box: b, aspect: pose.aspect, color: getComputedStyle(canvas).color, glow: false });
    head.style.left = pct(t);
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(duration)}`;
    raf = requestAnimationFrame(frame);
  }

  return {
    node,
    mounted() {
      setSpeed(prefs.get('speed', speed));
      setMirror(mirrored);
      setRegion(region);
      video.currentTime = region.start;
      raf = requestAnimationFrame(frame);
    },
    destroy() {
      cancelAnimationFrame(raf);
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
