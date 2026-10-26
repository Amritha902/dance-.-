// Share card: your result as a picture (rank, score, your dance as the
// stickman), shared through the phone's share sheet or downloaded.

import { drawFigure } from './draw.js';
import { poseAt, routineBox, mirrorBox } from './pose/timeline.js';
import { mirror } from './pose/skeleton.js';

const RANK_COLORS = { S: ['#ffd66b', '#f0a92c'], A: ['#ffb39b', '#ff5a36'], B: ['#efe5d4', '#d9c9ae'], C: ['#e8e2d8', '#cfc6b8'], D: ['#e8e2d8', '#cfc6b8'] };

function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

/** Draws the card; returns the canvas (1080×1350, the shape Instagram and WhatsApp like). */
export function drawShareCard(r, pose, { site = location.origin } = {}) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#faf6ee'; ctx.fillRect(0, 0, W, H);
  // stage panel with the stickman mid-move
  const g = ctx.createLinearGradient(0, 0, 0, 760); g.addColorStop(0, '#2b2320'); g.addColorStop(1, '#14100e');
  round(ctx, 60, 60, W - 120, 700, 40); ctx.fillStyle = g; ctx.fill();
  if (pose?.frames?.length) {
    const t = r.region ? (r.region.start + r.region.end) / 2 : pose.duration / 2;
    ctx.save(); ctx.beginPath(); ctx.roundRect(60, 60, W - 120, 700, 40); ctx.clip(); ctx.translate(60, 60);
    drawFigure(ctx, mirror(poseAt(pose.frames, t)), { w: W - 120, h: 700, box: mirrorBox(routineBox(pose.frames)), aspect: pose.aspect, color: '#ff8a65', glow: true, mood: r.rank === 'S' || r.rank === 'A' ? 'happy' : 'happy' });
    ctx.restore();
  }
  ctx.fillStyle = '#fff3e6'; ctx.font = '700 46px Georgia, serif'; ctx.fillText('Mimic', 104, 140);
  ctx.font = '600 26px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,243,230,.7)'; ctx.fillText(String(r.title || '').slice(0, 40), 104, 184);
  // rank tile
  const [c1, c2] = RANK_COLORS[r.rank] || RANK_COLORS.B;
  const rg = ctx.createLinearGradient(80, 800, 300, 1020); rg.addColorStop(0, c1); rg.addColorStop(1, c2);
  round(ctx, 80, 810, 220, 220, 36); ctx.fillStyle = rg; ctx.fill();
  ctx.fillStyle = '#1f1a15'; ctx.font = '700 160px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText(r.rank, 190, 980); ctx.textAlign = 'left';
  ctx.font = '700 120px Georgia, serif'; ctx.fillText(Number(r.score).toLocaleString(), 340, 940);
  ctx.font = '500 34px system-ui, sans-serif'; ctx.fillStyle = '#6d6358';
  ctx.fillText(`${r.accuracy}% match · best combo ${r.bestCombo}`, 344, 1000);
  // tally
  const order = ['PERFECT', 'GREAT', 'GOOD', 'OFF', 'MISS'];
  order.forEach((k, i) => {
    const x = 90 + i * 186;
    ctx.fillStyle = k === 'PERFECT' ? '#c98a00' : k === 'MISS' ? '#d93a1c' : '#1f1a15';
    ctx.font = '700 56px Georgia, serif'; ctx.fillText(String(r.tally?.[k] ?? 0), x, 1120);
    ctx.fillStyle = '#6d6358'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText(k, x, 1156);
  });
  if (r.workout) { ctx.fillStyle = '#6d6358'; ctx.font = '500 28px system-ui, sans-serif'; ctx.fillText(`🔥 ${r.workout.kcal.toFixed(1)} kcal danced off`, 90, 1215); }
  // footer
  ctx.fillStyle = '#ff4f2e'; round(ctx, 60, 1250, W - 120, 64, 32); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 28px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Learn any dance with an AI coach · ${site.replace(/^https?:\/\//, '')}`, W / 2, 1292);
  ctx.textAlign = 'left';
  return c;
}

/** Share through the system sheet when the device can, else download. */
export async function shareResult(r, pose) {
  const canvas = drawShareCard(r, pose);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], `mimic-${r.rank}-${r.score}.png`, { type: 'image/png' });
  const text = `I scored rank ${r.rank} (${r.accuracy}% match) on "${r.title}" in Mimic 💃 Learn any dance with an AI coach: ${location.origin}`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text, title: 'My Mimic score' }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
