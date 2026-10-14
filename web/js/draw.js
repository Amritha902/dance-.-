// Draws a stickman. The figure is fitted into the canvas from a box in
// normalised frame coordinates, so a dancer filmed from far away still fills
// the stage, and two figures fitted the same way line up.

import { BONES, P, seen } from './pose/skeleton.js';

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} lm        33 landmarks
 * @param {object} o
 * @param {number} o.w, o.h canvas size in CSS pixels
 * @param {object} o.box    {x0,y0,x1,y1} region of the source frame to fit
 * @param {number} o.aspect source frame width / height
 * @param {string} o.color
 * @param {Object<string,string>} [o.limbColors] limb name -> colour override
 * @param {boolean} [o.glow]
 * @param {number} [o.alpha]
 * @param {number} [o.width] line width
 */
export function drawFigure(ctx, lm, o) {
  if (!lm || !o.box) return;
  const { w, h, box, aspect = 16 / 9, color, limbColors = {}, glow = false, alpha = 1 } = o;

  // Work in source pixels-per-height so the figure keeps its proportions,
  // pad the box, then letterbox it into the canvas.
  const bx0 = box.x0 * aspect, bx1 = box.x1 * aspect;
  const padX = (bx1 - bx0) * 0.15 + 0.02, padY = (box.y1 - box.y0) * 0.1 + 0.02;
  const bw = bx1 - bx0 + 2 * padX, bh = box.y1 - box.y0 + 2 * padY;
  const s = Math.min(w / bw, h / bh);
  const ox = (w - bw * s) / 2 - (bx0 - padX) * s;
  const oy = (h - bh * s) / 2 - (box.y0 - padY) * s;
  const X = (p) => p[0] * aspect * s + ox;
  const Y = (p) => p[1] * s + oy;

  const lw = o.width ?? Math.max(3, Math.min(w, h) * 0.018);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;

  for (const { a, b, limb } of BONES) {
    if (!seen(lm[a]) || !seen(lm[b])) continue;
    const c = limbColors[limb] || color;
    ctx.strokeStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = glow ? lw * 1.5 : 0;
    ctx.beginPath();
    ctx.moveTo(X(lm[a]), Y(lm[a]));
    ctx.lineTo(X(lm[b]), Y(lm[b]));
    ctx.stroke();
  }

  // Neck and head: a line from the shoulder midpoint toward the nose, and a
  // round head sized from shoulder width so it scales with the body.
  const ls = lm[P.lShoulder], rs = lm[P.rShoulder], nose = lm[P.nose];
  if (seen(ls) && seen(rs)) {
    const cx = (X(ls) + X(rs)) / 2, cy = (Y(ls) + Y(rs)) / 2;
    const shoulders = Math.hypot(X(ls) - X(rs), Y(ls) - Y(rs));
    const r = Math.max(lw * 1.4, shoulders * 0.28);
    let dx = 0, dy = -1;
    if (seen(nose)) {
      const d = Math.hypot(X(nose) - cx, Y(nose) - cy) || 1;
      dx = (X(nose) - cx) / d; dy = (Y(nose) - cy) / d;
    }
    const neck = Math.max(r * 0.9, seen(nose) ? Math.hypot(X(nose) - cx, Y(nose) - cy) - r * 0.3 : r * 1.2);
    const hx = cx + dx * (neck + r * 0.4), hy = cy + dy * (neck + r * 0.4);
    const c = limbColors.torso || color;
    ctx.strokeStyle = c; ctx.fillStyle = c;
    ctx.shadowColor = c; ctx.shadowBlur = glow ? lw * 1.5 : 0;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx - dx * r, hy - dy * r); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
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
