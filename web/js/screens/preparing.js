// Preparing: wait for the video to arrive, then track the dancer once and
// cache the result. A routine that's already tracked skips straight through.

import { el } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { trackVideo } from '../pose/tracker.js';

export function preparingScreen(id) {
  const stage = el('p', { class: 'prep-stage' }, 'Getting the video…');
  const bar = el('i');
  const detail = el('small', { class: 'muted' });
  const node = el('div', { class: 'prep' },
    el('h1', {}, 'Reading the choreography'),
    stage,
    el('div', { class: 'progress' }, bar),
    detail,
  );
  const abort = new AbortController();
  let timer = null;

  const fail = (message) => {
    stage.textContent = message;
    stage.classList.add('bad');
    bar.style.width = '0%';
    node.append(el('a', { class: 'btn ghost', href: '#/' }, 'Back home'));
  };

  async function track() {
    stage.textContent = 'Tracking the dancer…';
    const video = el('video', { src: mediaUrl(id), muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    video.className = 'offscreen';
    node.append(video);
    const began = performance.now();
    try {
      const pose = await trackVideo(video, {
        signal: abort.signal,
        onProgress: (p, found) => {
          bar.style.width = `${Math.round(p * 100)}%`;
          // A time estimate once there's enough progress to extrapolate from.
          const elapsed = (performance.now() - began) / 1000;
          const left = p > 0.05 ? Math.max(1, Math.round(elapsed * (1 - p) / p)) : null;
          detail.textContent = `${Math.round(p * 100)}% · ${found} poses found${left ? ` · about ${left < 60 ? `${left}s` : `${Math.round(left / 60)} min`} left` : ''}`;
        },
      });
      stage.textContent = 'Saving…';
      await api.savePose(id, pose);
      location.hash = `#/learn/${id}`;
    } catch (e) {
      if (!abort.signal.aborted) fail(e.message);
    } finally {
      video.remove();
    }
  }

  async function poll() {
    try {
      const s = await api.status(id);
      if (s.title) node.querySelector('h1').textContent = s.title;
      if (s.state === 'ready') { location.hash = `#/learn/${id}`; return; }
      if (s.state === 'failed') { fail(s.error || 'The download failed.'); return; }
      if (s.state === 'video') { track(); return; }
      stage.textContent = 'Downloading the video…';
      bar.style.width = `${Math.round((s.progress || 0) * 100)}%`;
      timer = setTimeout(poll, 700);
    } catch (e) {
      fail(e.message);
    }
  }
  poll();

  return { node, destroy: () => { abort.abort(); clearTimeout(timer); } };
}
