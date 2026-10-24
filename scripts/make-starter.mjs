// Builds the starter routine, "Mimic Warm-up": an original 16-second
// choreography written as code, so every visitor has something to dance
// before they upload anything, and nobody else's footage is involved.
//
//   node scripts/make-starter.mjs   → assets/starter/pose.json
//
// The dancer faces the camera, so their LEFT side is on the RIGHT of the
// frame. Positions are worked out in a 1280×720 frame, then normalised the
// way MediaPipe reports them (x, y in 0..1, 33 landmarks).

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 1280, H = 720, FPS = 15, BPM = 120, DURATION = 16;
const FLOOR = 640, UPPER = 92, FORE = 84, THIGH = 112, SHIN = 108, SHOULDER = 50, HIP = 30, TORSO = 175;
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, k)));

// A pose is a handful of numbers. Arm angles are measured from hanging
// straight down, positive = out to the side; `b` is the extra bend at the
// elbow. Leg `t` is the thigh angle out to the side, `s` the shin's.
const P = (o) => ({ dx: 0, la: 20, lb: 10, ra: 20, rb: 10, lt: 6, ls: 0, rt: 6, rs: 0, lean: 0, ...o });

// Each move: a function of the beat within the move (0..8) → a pose.
const MOVES = {
  // Wave: both arms swing up into a V and back down, knees bouncing.
  wave(b) {
    const up = ease((Math.sin((Math.PI * b) / 2 - Math.PI / 2) + 1) / 2);
    const bounce = (1 - Math.cos(Math.PI * b)) / 2;
    return P({ la: lerp(35, 155, up), ra: lerp(35, 155, up), lb: lerp(25, 0, up), rb: lerp(25, 0, up),
      lt: 8 + 10 * bounce, rt: 8 + 10 * bounce, ls: -8 * bounce, rs: -8 * bounce });
  },
  // Step-touch and clap: the body steps side to side; arms open wide,
  // then the hands meet in front of the chest.
  stepClap(b) {
    const side = Math.sin((Math.PI * b) / 2);
    const clap = ease((Math.sin(Math.PI * b) + 1) / 2);
    return P({ dx: 70 * side, la: lerp(80, 25, clap), ra: lerp(80, 25, clap), lb: lerp(5, 115, clap), rb: lerp(5, 115, clap),
      lt: 10 + 8 * Math.max(0, side), rt: 10 + 8 * Math.max(0, -side), lean: 4 * side });
  },
  // Disco point: right hand up to the corner, then down across the body;
  // left hand on the hip; hips sway.
  disco(b) {
    const up = ease((Math.sin((Math.PI * b) / 2 - Math.PI / 2) + 1) / 2);
    return P({ ra: lerp(-25, 150, up), rb: 0, la: 45, lb: -105, dx: 30 * Math.sin(Math.PI * b), lt: 12, rt: 12, lean: lerp(-4, 6, up) });
  },
};
// Wave comes back, so the hookstep finder has a real repeat to find.
const ROUTINE = ['wave', 'stepClap', 'wave', 'disco'];
const BEATS_PER_MOVE = 8;

function poseAt(t) {
  const beat = (t * BPM) / 60;
  const i = Math.min(ROUTINE.length - 1, Math.floor(beat / BEATS_PER_MOVE));
  const local = beat - i * BEATS_PER_MOVE;
  const cur = MOVES[ROUTINE[i]](local);
  // Blend into the next move over the last half beat, so nothing jumps.
  const next = ROUTINE[i + 1];
  const k = next ? ease((local - (BEATS_PER_MOVE - 0.5)) / 0.5) : 0;
  if (!next || k <= 0) return cur;
  const nxt = MOVES[next](0);
  return Object.fromEntries(Object.keys(cur).map((key) => [key, lerp(cur[key], nxt[key], k)]));
}

function landmarks(p) {
  const lm = Array.from({ length: 33 }, () => [0, 0, 0, 1]);
  const set = (i, x, y) => { lm[i] = [x / W, y / H, 0, 1]; };
  // Legs first: the feet stay on the floor, so the hips sit wherever the legs reach.
  const legDrop = (t, s) => THIGH * Math.cos(rad(t)) + SHIN * Math.cos(rad(s));
  const hipY = FLOOR - Math.max(legDrop(p.lt, p.ls), legDrop(p.rt, p.rs));
  const cx = W / 2 + p.dx;
  const hip = { l: [cx + HIP, hipY], r: [cx - HIP, hipY] };
  const leg = (side, t, s) => {
    const o = side === 'l' ? 1 : -1, [hx, hy] = hip[side];
    const knee = [hx + o * THIGH * Math.sin(rad(t)), hy + THIGH * Math.cos(rad(t))];
    const ankle = [knee[0] + o * SHIN * Math.sin(rad(s)), knee[1] + SHIN * Math.cos(rad(s))];
    return { knee, ankle };
  };
  const L = leg('l', p.lt, p.ls), R = leg('r', p.rt, p.rs);
  // Torso with a little lean.
  const lean = rad(p.lean), sy = hipY - TORSO;
  const sh = { l: [cx + SHOULDER + Math.sin(lean) * TORSO, sy], r: [cx - SHOULDER + Math.sin(lean) * TORSO, sy] };
  const arm = (side, a, b) => {
    const o = side === 'l' ? 1 : -1, [x, y] = sh[side];
    const elbow = [x + o * UPPER * Math.sin(rad(a)), y + UPPER * Math.cos(rad(a))];
    const wrist = [elbow[0] + o * FORE * Math.sin(rad(a + b)), elbow[1] + FORE * Math.cos(rad(a + b))];
    return { elbow, wrist };
  };
  const LA = arm('l', p.la, p.lb), RA = arm('r', p.ra, p.rb);
  const head = [(sh.l[0] + sh.r[0]) / 2, sy - 62];

  set(0, head[0], head[1]);
  [[1, 8, -8], [2, 14, -9], [3, 20, -8], [4, -8, -8], [5, -14, -9], [6, -20, -8], [7, 34, -2], [8, -34, -2], [9, 8, 14], [10, -8, 14]]
    .forEach(([i, ox, oy]) => set(i, head[0] + ox, head[1] + oy));
  set(11, ...sh.l); set(12, ...sh.r);
  set(13, ...LA.elbow); set(14, ...RA.elbow); set(15, ...LA.wrist); set(16, ...RA.wrist);
  [[17, LA, 10], [19, LA, 12], [21, LA, 6], [18, RA, -10], [20, RA, -12], [22, RA, -6]]
    .forEach(([i, A, ox]) => set(i, A.wrist[0] + ox, A.wrist[1] + 10));
  set(23, ...hip.l); set(24, ...hip.r);
  set(25, ...L.knee); set(26, ...R.knee); set(27, ...L.ankle); set(28, ...R.ankle);
  set(29, L.ankle[0] - 4, L.ankle[1] + 10); set(30, R.ankle[0] + 4, R.ankle[1] + 10);
  set(31, L.ankle[0] + 18, L.ankle[1] + 14); set(32, R.ankle[0] - 18, R.ankle[1] + 14);
  return lm.map((p4) => p4.map((v, j) => (j < 2 ? Math.round(v * 1e4) / 1e4 : v)));
}

export function starterPose() {
  const frames = [];
  for (let n = 0; n <= DURATION * FPS; n++) {
    const t = n / FPS;
    frames.push({ t: Math.round(t * 1000) / 1000, lm: landmarks(poseAt(t)) });
  }
  return { fps: FPS, aspect: W / H, duration: DURATION, frames };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'starter');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'pose.json'), JSON.stringify(starterPose()));
  console.log(`wrote ${path.join(out, 'pose.json')}`);
}
