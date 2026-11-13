// Ball flight, rim/backboard/floor collisions and basket detection.
const Physics = (() => {
  'use strict';
  const G = 9.8;
  const BALL_R = 0.12;
  const RIM_TUBE = 0.012;
  const ARC = 2.2; // launch vy / vz ratio: a nice high arc (~45° entry angle)
  const START = Object.freeze({ x: 0, y: 0.55, z: 0 });
  const BOARD = Object.freeze({ halfW: 0.9, bottom: 2.9, top: 3.95, z: 4.62 });
  const FLOOR_BACK_Z = 5.8;
  const WALL_Z = 6.8;
  const SIDE_X = 7.5;
  const RIM_E = 0.55;
  const BOARD_E = 0.6;
  const FLOOR_E = 0.62;

  // Error curve with a soft "dead zone": small errors shrink quadratically,
  // large errors pass through linearly. Continuous at |e| = snap.
  function shape(e, snap) {
    const a = Math.abs(e);
    return a < snap ? Math.sign(e) * a * a / snap : e;
  }

  // Forward speed that drops the ball exactly through the rim center.
  function idealSpeed(hoop) {
    const zH = hoop.z - START.z;
    const dy = hoop.y - START.y;
    return Math.sqrt(G * zH * zH / (2 * (ARC * zH - dy)));
  }

  // powerErr: fractional forward-speed error (0 = perfect)
  // lateral: sideways miss distance at the rim (m)
  // lead: 0..1, how much of the hoop's future movement is compensated automatically
  function launch(hoop, powerErr, lateral, lead) {
    const vzStar = idealSpeed(hoop);
    const vz = vzStar * Math.min(1.5, Math.max(0.55, 1 + powerErr));
    const zH = hoop.z - START.z;
    const tStar = zH / vzStar;
    const t = zH / vz;
    const xNow = hoop.x;
    const xFuture = hoop.predictX(tStar);
    const X = xNow + lead * (xFuture - xNow) + lateral;
    return { x: (X - START.x) / t, y: ARC * vz, z: vz };
  }

  function createBall(v, opts = {}) {
    return {
      p: { x: START.x, y: START.y, z: START.z },
      v: { x: v.x, y: v.y, z: v.z },
      rot: 0,
      spin: -6 - Math.random() * 3,
      age: 0,
      rim: false,
      board: false,
      scored: false,
      resolved: false,
      alpha: 1,
      trail: [],
      lastHitSound: -1,
      fire: !!opts.fire,
      attract: !!opts.attract,
    };
  }

  function step(b, hoop, h, emit) {
    const p = b.p;
    const v = b.v;
    const prevY = p.y;
    v.y -= G * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;
    b.age += h;

    // Rim: collide with the closest point on the rim circle (a thin torus).
    const dx = p.x - hoop.x;
    const dz = p.z - hoop.z;
    const hd = Math.hypot(dx, dz);
    const minD = BALL_R + RIM_TUBE;
    if (Math.abs(p.y - hoop.y) < minD + 0.01 && Math.abs(hd - hoop.r) < minD + 0.01) {
      const ux = hd > 1e-6 ? dx / hd : 1;
      const uz = hd > 1e-6 ? dz / hd : 0;
      const qx = hoop.x + ux * hoop.r;
      const qz = hoop.z + uz * hoop.r;
      let nx = p.x - qx;
      let ny = p.y - hoop.y;
      let nz = p.z - qz;
      const d = Math.hypot(nx, ny, nz);
      if (d < minD && d > 1e-6) {
        nx /= d; ny /= d; nz /= d;
        p.x = qx + nx * minD;
        p.y = hoop.y + ny * minD;
        p.z = qz + nz * minD;
        const rvx = v.x - hoop.vx;
        const vn = rvx * nx + v.y * ny + v.z * nz;
        if (vn < 0) {
          const fr = -vn > 0.5 ? 0.88 : 0.998; // grip on hard hits, roll freely otherwise
          const tx = rvx - vn * nx;
          const ty = v.y - vn * ny;
          const tz = v.z - vn * nz;
          v.x = tx * fr - RIM_E * vn * nx + hoop.vx;
          v.y = ty * fr - RIM_E * vn * ny;
          v.z = tz * fr - RIM_E * vn * nz;
          if (-vn > 0.35 && b.age - b.lastHitSound > 0.08) {
            b.lastHitSound = b.age;
            emit('rim', b, -vn);
          }
        }
        b.rim = true;
      }
    }

    // Backboard (front face).
    if (v.z > 0 && p.z + BALL_R > BOARD.z && p.z < BOARD.z + 0.05 &&
        Math.abs(p.x - hoop.x) < BOARD.halfW && p.y > BOARD.bottom && p.y < BOARD.top) {
      p.z = BOARD.z - BALL_R;
      const impact = v.z;
      v.z = -v.z * BOARD_E;
      v.x = (v.x - hoop.vx) * 0.85 + hoop.vx;
      v.y *= 0.9;
      b.board = true;
      emit('board', b, impact);
    }

    // The net slows the ball and keeps it centered as it drops through.
    if (b.scored && p.y > hoop.y - 0.5 && p.y < hoop.y) {
      v.x += ((hoop.x - p.x) * 10 - (v.x - hoop.vx) * 4) * h;
      v.z += ((hoop.z - p.z) * 10 - v.z * 4) * h;
      v.y *= Math.exp(-h * 2.5);
    }

    // Floor and walls.
    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < 0) {
        const iv = -v.y;
        v.y = iv * FLOOR_E;
        if (v.y < 0.4) v.y = 0;
        v.x *= 0.88;
        v.z *= 0.88;
        b.spin *= 0.8;
        if (iv > 0.8) emit('floor', b, iv);
      }
      v.x *= Math.exp(-h * 0.8);
      v.z *= Math.exp(-h * 0.8);
    }
    if (p.z > WALL_Z - BALL_R && v.z > 0) {
      p.z = WALL_Z - BALL_R;
      v.z = -v.z * 0.5;
    }
    if (Math.abs(p.x) > SIDE_X && p.x * v.x > 0) v.x = -v.x * 0.5;

    // Basket: the ball center passes down through the rim plane inside the ring.
    if (!b.scored && prevY >= hoop.y && p.y < hoop.y && v.y < 0) {
      if (Math.hypot(p.x - hoop.x, p.z - hoop.z) < hoop.r - 0.02) {
        b.scored = true;
        b.resolved = true;
        emit('score', b);
      }
    }
    if (!b.resolved && ((v.y < 0 && p.y < hoop.y - 0.45) || b.age > 6)) {
      b.resolved = true;
      emit('miss', b);
    }
  }

  return {
    G, BALL_R, ARC, START, BOARD, FLOOR_BACK_Z, WALL_Z,
    shape, idealSpeed, launch, createBall, step,
  };
})();
