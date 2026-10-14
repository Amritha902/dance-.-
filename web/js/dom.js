// Small DOM and feedback helpers. No framework: a handful of screens, and the
// frame budget belongs to the canvases.

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// localStorage that never throws (private windows, blocked storage).
export const prefs = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`mimic.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`mimic.${key}`, JSON.stringify(value)); } catch { /* not persisted; fine */ }
  },
};

export function toast(message, kind = '') {
  const t = el('div', { class: `toast ${kind}` }, message);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 3600);
}

let audio = null;
export function beep(freq = 880, dur = 0.08, gain = 0.08, type = 'sine') {
  try {
    audio ||= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + dur);
  } catch { /* no audio; silent is fine */ }
}

export function confetti() {
  const colors = ['#ff4f2e', '#ffb020', '#2fb36d', '#4a7dff', '#ff2d55'];
  for (let i = 0; i < 80; i++) {
    const p = el('i', { class: 'confetti' });
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    p.style.setProperty('--drift', `${(Math.random() - 0.5) * 30}vw`);
    document.body.append(p);
    setTimeout(() => p.remove(), 2600);
  }
}
