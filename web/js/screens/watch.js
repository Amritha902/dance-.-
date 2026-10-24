// Practice player for a YouTube dance video: mirror it, slow it down, loop
// the hard part, and dance along with your own camera beside it. YouTube's
// own embedded player does the playing (no downloading), so it works for any
// search result. Scoring and the coach need an uploaded clip.

import { el, prefs, toast } from '../dom.js';
import { api } from '../api.js';

let ytReady = null;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (ytReady ||= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; reject(new Error('Couldn\'t reach YouTube. Check your connection.')); };
    document.head.append(s);
  }));
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function watchScreen(id) {
  let info = {};
  try { info = JSON.parse(sessionStorage.getItem(`mimic.watch.${id}`) || '{}'); } catch { /* none */ }
  const holder = el('div', { id: `yt-${id}` });
  const frame = el('div', { class: 'watch-frame' }, holder);
  const cam = el('video', { class: 'watch-cam', playsInline: true, muted: true, autoplay: true });
  const camBox = el('div', { class: 'watch-cam-box', hidden: true }, cam, el('small', {}, 'You (mirrored)'));
  const time = el('span', { class: 'time' }, '0:00');
  let player = null, poll = 0, stream = null, loopA = null, loopB = null, looping = false;

  const playBtn = el('button', { class: 'play', 'aria-label': 'Play or pause', onclick: () => {
    if (!player) return;
    player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo();
  } }, '▶');
  const SPEEDS = [0.25, 0.5, 0.75, 1];
  const speedBtns = SPEEDS.map((s) => el('button', { class: 'chip-btn', onclick: () => setSpeed(s) }, `${s}×`));
  function setSpeed(s) { player?.setPlaybackRate(s); speedBtns.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === s)); }
  const mirrorBtn = el('button', { class: 'chip-btn', onclick: () => setMirror(!frame.classList.contains('mirrored')) }, 'Mirror');
  function setMirror(on) { frame.classList.toggle('mirrored', on); mirrorBtn.classList.toggle('on', on); prefs.set('mirror', on); }
  const aBtn = el('button', { class: 'chip-btn', onclick: () => { loopA = player?.getCurrentTime() ?? 0; if (loopB != null && loopB <= loopA) loopB = null; paintLoop(); } }, 'Loop start');
  const bBtn = el('button', { class: 'chip-btn', onclick: () => { const t = player?.getCurrentTime() ?? 0; if (loopA == null || t > loopA + 0.5) { loopB = t; looping = true; paintLoop(); } else toast('Set the loop end after the start.', 'bad'); } }, 'Loop end');
  const loopBtn = el('button', { class: 'chip-btn', onclick: () => { looping = !looping && loopA != null && loopB != null; paintLoop(); } }, 'Loop');
  const loopLabel = el('small', { class: 'muted' });
  function paintLoop() {
    loopBtn.classList.toggle('on', looping);
    loopLabel.textContent = loopA != null ? `Loop ${fmt(loopA)}–${loopB != null ? fmt(loopB) : '…'}` : 'Tip: play to the hard part, press Loop start, then Loop end.';
  }
  const camBtn = el('button', { class: 'chip-btn', onclick: async () => {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; camBox.hidden = true; camBtn.classList.remove('on'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false });
      cam.srcObject = stream; camBox.hidden = false; camBtn.classList.add('on');
    } catch { toast('Mimic needs your camera for this. Allow it in the address bar.', 'bad'); }
  } }, '📷 My camera');

  const file = el('input', { type: 'file', accept: 'video/*', hidden: true });
  const upload = el('button', { class: 'btn primary', onclick: () => file.click() }, 'Upload a clip of this dance');
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    upload.disabled = true; upload.textContent = 'Uploading…';
    try { location.hash = `#/prep/${(await api.upload(file.files[0])).id}`; } catch (e) { toast(e.message, 'bad'); upload.disabled = false; upload.textContent = 'Upload a clip of this dance'; }
  });

  const node = el('div', { class: 'watch' },
    el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, info.title || 'Practise this dance'), el('p', { class: 'muted small' }, info.channel || 'YouTube')),
      el('a', { class: 'btn ghost tiny', href: 'javascript:history.back()' }, '← Results')),
    el('div', { class: 'watch-panes' }, frame, camBox),
    el('div', { class: 'transport' }, playBtn, time, el('div', { class: 'chips' }, ...speedBtns, mirrorBtn, aBtn, bBtn, loopBtn, camBtn)),
    loopLabel,
    el('section', { class: 'watch-next' },
      el('h2', {}, 'Want your limbs scored and the AI coach?'),
      el('p', { class: 'muted' }, 'Mimic scores you against a clip it can track. Upload a clip of this dance you have the rights to (film a friend, or yourself), or try the built-in warm-up now.'),
      el('div', { class: 'live-actions' }, upload, file, el('a', { class: 'btn ghost', href: '#/live' }, '🔴 Dance live with the warm-up')),
    ),
  );

  return {
    node,
    async mounted() {
      paintLoop();
      try {
        const YT = await loadYouTube();
        player = new YT.Player(holder, {
          videoId: id, width: '100%', height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
          events: {
            onReady: () => { setSpeed(1); setMirror(prefs.get('mirror', true)); },
            onStateChange: (e) => { playBtn.textContent = e.data === 1 ? '❚❚' : '▶'; },
            onError: () => toast('This video can\'t be played inside other sites. Try another result.', 'bad'),
          },
        });
        poll = setInterval(() => {
          if (!player?.getCurrentTime) return;
          const t = player.getCurrentTime();
          time.textContent = fmt(t);
          if (looping && loopA != null && loopB != null && t >= loopB) player.seekTo(loopA, true);
        }, 150);
      } catch (e) { frame.replaceChildren(el('p', { class: 'muted' }, e.message)); }
    },
    destroy() { clearInterval(poll); stream?.getTracks().forEach((t) => t.stop()); try { player?.destroy(); } catch { /* gone */ } },
  };
}
