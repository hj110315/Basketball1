// Scoreboard, status chips, floating score popups and center-screen banners.
const HUD = (() => {
  'use strict';
  const FONT = 'Orbitron, "Arial Black", Impact, sans-serif';
  const popups = [];
  const banners = [];

  const font = (size, weight = 800) => `${weight} ${Math.round(size)}px ${FONT}`;

  function popup(text, x, y, color = '#fff', size = 28, life = 1.1) {
    popups.push({ text, x, y, color, size, life, max: life });
  }

  function banner(text, sub = '', color = '#ffd23f', life = 1.5) {
    if (banners.length > 3) banners.splice(1, 1);
    banners.push({ text, sub, color, life, max: life });
  }

  function clear() {
    popups.length = 0;
    banners.length = 0;
  }

  function update(dt) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      p.y -= 45 * dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
    if (banners.length) {
      banners[0].life -= dt;
      if (banners[0].life <= 0) banners.shift();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function ledText(ctx, text, ghost, x, y, size, color) {
    ctx.font = font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.1;
    ctx.fillText(ghost, x, y);
    ctx.globalAlpha = 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.45;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function chip(ctx, text, x, y, size, color, fill) {
    ctx.font = font(size, 700);
    const w = ctx.measureText(text).width + size * 1.4;
    const h = size * 1.7;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = fill || 'rgba(8,10,30,0.75)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    return w;
  }

  function formatTime(t) {
    return t >= 10 ? String(Math.ceil(t)).padStart(2, '0') : t.toFixed(1);
  }

  // s: { state, score, best, time, level, streak, mult, onFire, fireTime, target, bonusUsed, countdown, showHint, hintPos }
  function draw(ctx, W, H, s, now) {
    const blink = Math.floor(now * 4) % 2 === 0;

    if (s.state !== 'title') {
      // Scoreboard
      const pw = Math.min(W - 112, 600);
      const ph = Math.max(54, Math.min(H * 0.095, 90));
      const px = (W - pw) / 2;
      const py = Math.max(10, H * 0.015);
      roundRect(ctx, px, py, pw, ph, 12);
      ctx.fillStyle = 'rgba(6,7,22,0.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3ef0ff';
      ctx.shadowColor = '#3ef0ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(62,240,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(px + pw / 3, py + 8); ctx.lineTo(px + pw / 3, py + ph - 8);
      ctx.moveTo(px + 2 * pw / 3, py + 8); ctx.lineTo(px + 2 * pw / 3, py + ph - 8);
      ctx.stroke();

      const labelSize = Math.max(9, ph * 0.15);
      const valueSize = Math.min(ph * 0.46, pw / 3 / 3.4);
      const lowTime = s.time <= 10 && s.state !== 'countdown';
      const cols = [
        { label: 'SCORE', value: String(s.score).padStart(3, '0'), ghost: '888', color: '#ffcf3f' },
        { label: 'TIME', value: formatTime(s.time), ghost: s.time >= 10 ? '88' : '8.8',
          color: lowTime && !blink ? '#ff9a9a' : '#ff3b3b' },
        { label: 'BEST', value: String(Math.max(s.best, s.score)).padStart(3, '0'), ghost: '888', color: '#37ff8b' },
      ];
      cols.forEach((c, i) => {
        const cx = px + pw * (i + 0.5) / 3;
        ctx.font = font(labelSize, 500);
        ctx.fillStyle = 'rgba(200,220,255,0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.label, cx, py + ph * 0.22);
        ledText(ctx, c.value, c.ghost, cx, py + ph * 0.62, valueSize, c.color);
      });

      // Status chips
      const chips = [{ text: `LV ${s.level}`, color: '#3ef0ff' }];
      if (!s.bonusUsed) chips.push({ text: `TARGET ${s.target}`, color: s.score >= s.target ? '#37ff8b' : '#c9d3ff' });
      if (s.streak > 0) chips.push({ text: `STREAK ${s.streak}`, color: '#ffcf3f' });
      if (s.onFire) chips.push({ text: 'ON FIRE', color: blink ? '#ff7a1a' : '#ffd23f', fill: 'rgba(80,20,0,0.8)' });
      if (s.fireTime && s.state === 'play') chips.push({ text: 'FIRE TIME', color: blink ? '#ff3b3b' : '#ff9a3c', fill: 'rgba(80,0,0,0.8)' });
      if (s.mult > 1) chips.push({ text: `x${s.mult}`, color: '#ff3fa4' });
      const cs = Math.max(10, Math.min(14, W / 42));
      ctx.font = font(cs, 700);
      const widths = chips.map((c) => ctx.measureText(c.text).width + cs * 1.4);
      const gap = 6;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
      let x = W / 2 - total / 2;
      const cy = py + ph + cs * 1.4;
      chips.forEach((c, i) => {
        chip(ctx, c.text, x + widths[i] / 2, cy, cs, c.color, c.fill);
        x += widths[i] + gap;
      });
    }

    // Floating popups
    for (const p of popups) {
      const a = Math.min(1, p.life / (p.max * 0.4));
      const grow = 1 + Math.max(0, (p.life - p.max + 0.15)) * 3;
      ctx.globalAlpha = a;
      ctx.font = font(p.size * grow);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, p.size * 0.15);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      ctx.fillText(p.text, p.x, p.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // Countdown
    if (s.state === 'countdown') {
      const n = Math.ceil(s.countdown);
      const frac = s.countdown - Math.floor(s.countdown);
      const size = Math.min(W, H) * (0.22 + 0.12 * frac);
      ctx.globalAlpha = Math.min(1, 0.3 + frac * 1.4);
      ctx.font = font(size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.shadowColor = '#ff7a1a';
      ctx.shadowBlur = 30;
      ctx.fillText(String(n), W / 2, H * 0.45);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Banner
    if (banners.length) {
      const b = banners[0];
      const t = b.max - b.life;
      const scale = t < 0.18 ? 0.5 + t / 0.18 * 0.6 : t < 0.3 ? 1.1 - (t - 0.18) / 0.12 * 0.1 : 1;
      const alpha = Math.min(1, b.life / 0.3);
      const size = Math.min(W * 0.11, H * 0.08) * scale;
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font(size);
      ctx.lineWidth = size * 0.12;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(b.text, W / 2, H * 0.44);
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 25;
      ctx.fillText(b.text, W / 2, H * 0.44);
      ctx.shadowBlur = 0;
      if (b.sub) {
        ctx.font = font(size * 0.38, 600);
        ctx.lineWidth = 4;
        ctx.strokeText(b.sub, W / 2, H * 0.44 + size * 0.85);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(b.sub, W / 2, H * 0.44 + size * 0.85);
      }
      ctx.globalAlpha = 1;
    }

    // First-shot hint
    if (s.showHint && s.hintPos) {
      const bob = Math.sin(now * 5) * 6;
      const size = Math.max(12, Math.min(18, W / 28));
      ctx.globalAlpha = 0.85;
      ctx.font = font(size, 700);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SWIPE UP TO SHOOT', s.hintPos.x, s.hintPos.y - s.hintPos.r - 34 + bob);
      ctx.beginPath();
      const ax = s.hintPos.x;
      const ay = s.hintPos.y - s.hintPos.r - 14 + bob;
      ctx.moveTo(ax - 9, ay); ctx.lineTo(ax, ay - 10); ctx.lineTo(ax + 9, ay);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  return { popup, banner, clear, update, draw, roundRect };
})();
