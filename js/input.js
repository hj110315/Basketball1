// Mouse / touch swipe detection. Reports flicks as {dx, dy, dt} in CSS pixels.
const Input = (() => {
  'use strict';
  const WINDOW_MS = 450; // only the last part of a slow drag counts as the flick
  let pointer = null;
  let lastPts = []; // kept briefly after release so the trail can fade out

  function analyze(pts) {
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    // Ignore a pause at the end of the swipe (finger held still before release).
    let endI = pts.length - 1;
    while (endI > 0 && Math.hypot(pts[endI - 1].x - last.x, pts[endI - 1].y - last.y) < 3) endI--;
    const end = pts[endI];
    let startI = endI;
    while (startI > 0 && end.t - pts[startI - 1].t <= WINDOW_MS) startI--;
    const start = pts[startI];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (dy > -18) return null; // must be an upward swipe
    return { dx, dy, dt: Math.max(1, end.t - start.t) };
  }

  function attach(el, onFlick, isEnabled) {
    el.addEventListener('pointerdown', (e) => {
      if (!isEnabled() || pointer) return;
      pointer = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
      lastPts = pointer.pts;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });

    el.addEventListener('pointermove', (e) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) {
        pointer.pts.push({ x: ev.clientX, y: ev.clientY, t: ev.timeStamp || e.timeStamp });
      }
      if (pointer.pts.length > 200) pointer.pts.splice(0, pointer.pts.length - 200);
    });

    const finish = (e) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const pts = pointer.pts;
      pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      pointer = null;
      if (e.type === 'pointercancel' || !isEnabled()) return;
      const flick = analyze(pts);
      if (flick) onFlick(flick);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  }

  return {
    attach,
    analyze,
    isDragging: () => !!pointer,
    trail: () => lastPts,
    cancel() { pointer = null; },
  };
})();
