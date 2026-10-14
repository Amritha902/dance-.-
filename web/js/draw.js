// Draws Mimic's dancer: not a plain stickman but a little chibi character —
// a big round head with a face that turns to where the dancer is looking, a
// soft bean of a body, gummy rounded limbs with a highlight, and round hands
// and feet. The face changes when you're off ("oops") so feedback is felt,
// not just read.
//
// The figure is fitted into the canvas from a box in normalised frame
// coordinates, so a dancer filmed from far away still fills the stage, and two
// figures fitted the same way line up.

import { P, seen } from './pose/skeleton.js';

const LIMB_PARTS = [
  // [from, to, limb, width factor] — upper segments a touch chunkier
  [P.lShoulder, P.lElbow, 'left arm', 1.1], [P.lElbow, P.lWrist, 'left arm', 0.95],
  [P.rShoulder, P.rElbow, 'right arm', 1.1], [P.rElbow, P.rWrist, 'right arm', 0.95],
  [P.lHip, P.lKnee, 'left leg', 1.25], [P.lKnee, P.lAnkle, 'left leg', 1.05],
  [P.rHip, P.rKnee, 'right leg', 1.25], [P.rKnee, P.rAnkle, 'right leg', 1.05],
];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} lm        33 landmarks
 * @param {object} o
 * @param {number} o.w, o.h canvas size in CSS pixels
 * @param {object} o.box    {x0,y0,x1,y1} region of the source frame to fit
 * @param {number} o.aspect source frame width / height
 * @param {string} o.color  body colour
 * @param {Object<string,string>} [o.limbColors] limb name -> colour override (e.g. red when wrong)
 * @param {boolean} [o.glow]
 * @param {number} [o.alpha]
 * @param {number} [o.width] limb thickness
 * @param {'happy'|'oops'|'none'} [o.mood] face; 'none' draws a faceless ghost
 */
export function drawFigure(ctx, lm, o) {
  if (!lm || !o.box) return;
  const { w, h, box, aspect = 16 / 9, color, limbColors = {}, glow = false, alpha = 1, mood = 'happy' } = o;

  const bx0 = box.x0 * aspect, bx1 = box.x1 * aspect;
  const padX = (bx1 - bx0) * 0.15 + 0.02, padY = (box.y1 - box.y0) * 0.16 + 0.03;
  const bw = bx1 - bx0 + 2 * padX, bh = box.y1 - box.y0 + 2 * padY;
  const s = Math.min(w / bw, h / bh);
  const ox = (w - bw * s) / 2 - (bx0 - padX) * s;
  const oy = (h - bh * s) / 2 - (box.y0 - padY) * s + bh * s * 0.04; // a little headroom for the big head
  const X = (p) => p[0] * aspect * s + ox;
  const Y = (p) => p[1] * s + oy;
  const pt = (i) => (seen(lm[i]) ? [X(lm[i]), Y(lm[i])] : null);

  const lw = o.width ?? Math.max(5, Math.min(w, h) * 0.036);
  const tint = (limb) => limbColors[limb] || color;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const glowOn = (c) => { ctx.shadowColor = c; ctx.shadowBlur = glow ? lw * 1.4 : 0; };
  const glowOff = () => { ctx.shadowBlur = 0; };

  // Gummy limb: a fat rounded stroke, then a thin highlight along its top edge.
  function limb(a, b, c, k) {
    if (!a || !b) return;
    glowOn(c);
    ctx.strokeStyle = c; ctx.lineWidth = lw * k;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    glowOff();
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d; // normal; pick the side facing up-left for the shine
    const side = (nx + ny < 0 ? 1 : -1) * lw * k * 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1.5, lw * k * 0.22);
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * side + dx * 0.15, a[1] + ny * side + dy * 0.15);
    ctx.lineTo(b[0] + nx * side - dx * 0.15, b[1] + ny * side - dy * 0.15);
    ctx.stroke();
  }
  const dot = (p, r, c) => {
    if (!p) return;
    glowOn(c); ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
    glowOff();
  };

  // Legs behind the body, arms in front: reads as a body with depth.
  for (const [a, b, name, k] of LIMB_PARTS.slice(4)) limb(pt(a), pt(b), tint(name), k);
  dot(pt(P.lAnkle), lw * 0.85, tint('left leg'));
  dot(pt(P.rAnkle), lw * 0.85, tint('right leg'));

  // Body: a soft bean through shoulders and hips.
  const ls = pt(P.lShoulder), rs = pt(P.rShoulder), lh = pt(P.lHip), rh = pt(P.rHip);
  const bodyC = tint('torso');
  if (ls && rs && lh && rh) {
    glowOn(bodyC);
    ctx.fillStyle = bodyC; ctx.strokeStyle = bodyC; ctx.lineWidth = lw * 1.6;
    ctx.beginPath();
    ctx.moveTo(ls[0], ls[1]);
    ctx.quadraticCurveTo((ls[0] + rs[0]) / 2, Math.min(ls[1], rs[1]) - lw * 0.6, rs[0], rs[1]);
    ctx.quadraticCurveTo(rs[0] + (rh[0] - rs[0]) * 0.5 + (rs[0] - ls[0]) * 0.08, (rs[1] + rh[1]) / 2, rh[0], rh[1]);
    ctx.quadraticCurveTo((lh[0] + rh[0]) / 2, Math.max(lh[1], rh[1]) + lw * 0.8, lh[0], lh[1]);
    ctx.quadraticCurveTo(ls[0] + (lh[0] - ls[0]) * 0.5 - (rs[0] - ls[0]) * 0.08, (ls[1] + lh[1]) / 2, ls[0], ls[1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    glowOff();
  } else if (ls && rs) limb(ls, rs, bodyC, 1.6);

  for (const [a, b, name, k] of LIMB_PARTS.slice(0, 4)) limb(pt(a), pt(b), tint(name), k);
  dot(pt(P.lWrist), lw * 0.75, tint('left arm'));
  dot(pt(P.rWrist), lw * 0.75, tint('right arm'));

  // Head: big and round (chibi proportions), on a short neck toward the nose.
  if (ls && rs) {
    const cx = (ls[0] + rs[0]) / 2, cy = (ls[1] + rs[1]) / 2;
    const shoulders = Math.hypot(ls[0] - rs[0], ls[1] - rs[1]);
    const r = Math.max(lw * 2.3, shoulders * 0.8);
    const nose = pt(P.nose);
    let ux = 0, uy = -1;
    if (nose) {
      const d = Math.hypot(nose[0] - cx, nose[1] - cy) || 1;
      ux = (nose[0] - cx) / d; uy = (nose[1] - cy) / d;
      if (uy > -0.3) { uy = -0.3; const n = Math.hypot(ux, uy); ux /= n; uy /= n; } // heads don't hang below the shoulders
    }
    const hx = cx + ux * r * 1.02, hy = cy + uy * r * 1.02;
    dot([hx, hy], r, bodyC);
    // shine
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.beginPath(); ctx.ellipse(hx - r * 0.38, hy - r * 0.42, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();

    if (mood !== 'none') {
      // The face looks the way the dancer's nose points (left/right of the shoulder line).
      const turn = nose && ls && rs ? Math.max(-1, Math.min(1, ((nose[0] - cx) / (Math.abs(rs[0] - ls[0]) / 2 || 1)))) : 0;
      const fx = hx + turn * r * 0.28, fy = hy + r * 0.05;
      const ink = '#2a1f1a';
      ctx.fillStyle = ink;
      const eye = r * 0.15;
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(fx + sgn * r * 0.32, fy - r * 0.08, eye * 0.8, eye, 0, 0, Math.PI * 2); ctx.fill();
        // eye sparkle
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(fx + sgn * r * 0.32 - eye * 0.25, fy - r * 0.08 - eye * 0.35, eye * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink;
      }
      ctx.fillStyle = 'rgba(255, 110, 130, .55)';
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sgn * r * 0.55, fy + r * 0.18, r * 0.15, r * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath();
      if (mood === 'oops') ctx.arc(fx, fy + r * 0.3, r * 0.09, 0, Math.PI * 2);
      else ctx.arc(fx, fy + r * 0.12, r * 0.2, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Size a canvas's backing store to its displayed size × device pixel ratio.
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
