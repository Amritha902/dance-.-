// Studio: where you learn the move. The video and a clean stickman of the same
// dancer play in lockstep. Mirror it so the dancer's left lands on your left
// when you face the screen, slow it down, and loop.

import { el, fmtTime, prefs, toast } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { poseAt, routineBox, mirrorBox } from '../pose/timeline.js';
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
  let mirrored = prefs.get('mirror', true);
  let speed = prefs.get('speed', 1);
  let stickOnly = false;
  let raf = 0;

  const video = el('video', { class: 'studio-video', src: mediaUrl(id), playsInline: true, preload: 'auto' });
  const canvas = el('canvas', { class: 'studio-canvas' });
  const playBtn = el('button', { class: 'btn round', 'aria-label': 'Play' }, '▶');
  const timeLabel = el('span', { class: 'time' }, '0:00');
  const scrub = el('input', { class: 'scrub', type: 'range', min: 0, max: duration, step: 0.01, value: 0 });

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
  scrub.addEventListener('input', () => { video.currentTime = Number(scrub.value); });
  video.addEventListener('error', () => toast('This video could not be played in your browser.', 'bad'));

  const panes = el('div', { class: 'studio-panes' },
    el('div', { class: 'pane video-pane' }, video),
    el('div', { class: 'pane stick-pane' }, canvas),
  );

  const node = el('div', { class: 'studio' },
    el('header', { class: 'studio-head' },
      el('div', {},
        el('h1', {}, meta.title),
        el('p', { class: 'muted small' }, `${meta.channel || ''}${meta.channel ? ' · ' : ''}${fmtTime(duration)} · ${frames.length} poses tracked`),
      ),
    ),
    panes,
    el('div', { class: 'transport' },
      playBtn, timeLabel, scrub,
      el('div', { class: 'chips' }, ...speedBtns, mirrorBtn, stickBtn),
    ),
  );

  function frame() {
    const t = video.currentTime;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    let lm = poseAt(frames, t);
    let b = box;
    if (mirrored) { lm = mirror(lm); b = mirrorBox(box); }
    drawFigure(ctx, lm, { w, h, box: b, aspect: pose.aspect, color: getComputedStyle(canvas).color, glow: false });
    scrub.value = t;
    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(duration)}`;
    raf = requestAnimationFrame(frame);
  }

  return {
    node,
    mounted() {
      setSpeed(speed);
      setMirror(mirrored);
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
