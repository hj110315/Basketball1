// Hoop Frenzy: game loop, state machine, rendering and scoring rules.
(() => {
  'use strict';

  // ---------------------------------------------------------------- config
  const DIFFICULTIES = {
    easy: {
      label: 'EASY', rimR: 0.25, powK: 0.16, powSnap: 0.15, aimK: 0.25, aimSnap: 0.12,
      levelStep: 20, moveFrom: 2, amp: 0.5, ampStep: 0.08, maxAmp: 0.9, speed: 0.6, speedStep: 0.1, target: 35,
    },
    medium: {
      label: 'MEDIUM', rimR: 0.24, powK: 0.22, powSnap: 0.11, aimK: 0.36, aimSnap: 0.09,
      levelStep: 16, moveFrom: 2, amp: 0.65, ampStep: 0.1, maxAmp: 1.1, speed: 0.8, speedStep: 0.14, target: 45,
    },
    hard: {
      label: 'HARD', rimR: 0.23, powK: 0.38, powSnap: 0.06, aimK: 0.60, aimSnap: 0.05,
      levelStep: 14, moveFrom: 1, amp: 0.55, ampStep: 0.12, maxAmp: 1.3, speed: 0.85, speedStep: 0.17, target: 50,
    },
  };
  const ROUND_TIME = 60;
  const FIRE_TIME = 10;
  const BONUS_TIME = 15;
  const RELOAD = 0.3;
  const U_STAR = 0.32; // perfect swipe length as a fraction of screen height
  const CAM = { x: 0, y: 1.55, z: -2.6 };
  const START = Physics.START;

  // ---------------------------------------------------------------- setup
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const screens = { title: $('screen-title'), over: $('screen-over'), pause: $('screen-pause') };

  let W = 0, H = 0, F = 1, HORIZON = 0;
  let crowd = [];
  const hoop = new Hoop();
  const particles = [];
  let shake = 0;
  let clock = 0;

  const game = {
    state: 'title', // title | countdown | play | buzzer | over
    paused: false,
    diffKey: 'medium',
    diff: DIFFICULTIES.medium,
    balls: [],
    time: ROUND_TIME, score: 0, shots: 0, makes: 0, swishes: 0,
    streak: 0, bestStreak: 0, level: 1, bonusUsed: false,
    countdown: 0, reload: 0, buzzerWait: 0, attractTimer: 1, excite: 0,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = Math.min(H * 0.95, W * 1.5);
    // Place the horizon so the shooter's ball sits near the bottom of the screen.
    HORIZON = H * 0.84 - (CAM.y - START.y) * F / (START.z - CAM.z);
    buildCrowd();
  }

  function project(x, y, z) {
    const s = F / Math.max(0.05, z - CAM.z);
    return { x: W / 2 + (x - CAM.x) * s, y: HORIZON - (y - CAM.y) * s, s };
  }

  function buildCrowd() {
    crowd = [];
    const floorBack = project(0, 0, Physics.FLOOR_BACK_Z).y;
    const rowH = Math.max(10, H * 0.032);
    for (let row = 0; row < 8; row++) {
      const y = floorBack - H * 0.03 - row * rowH;
      const spacing = rowH * 1.05;
      for (let x = -10 - Math.random() * spacing; x < W + 10; x += spacing * (0.8 + Math.random() * 0.4)) {
        crowd.push({
          x, y, row, r: rowH * (0.34 + Math.random() * 0.06),
          hue: Math.floor(Math.random() * 360),
          light: 18 + Math.random() * 18,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    crowd.sort((a, b) => b.row - a.row);
  }

  // ---------------------------------------------------------------- game flow
  function showScreen(name) {
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
    $('btn-pause').classList.toggle('hidden', name === 'title' || name === 'over' || name === 'pause');
  }

  function setHoopMotionForLevel() {
    const d = game.diff;
    if (game.level >= d.moveFrom) {
      const k = game.level - d.moveFrom;
      hoop.setMotion(Math.min(d.maxAmp, d.amp + k * d.ampStep), d.speed + k * d.speedStep);
    } else {
      hoop.setMotion(0, 0.5);
    }
  }

  function startGame(diffKey) {
    Sfx.init();
    game.diffKey = diffKey;
    game.diff = DIFFICULTIES[diffKey];
    Object.assign(game, {
      state: 'countdown', paused: false, balls: [],
      time: ROUND_TIME, score: 0, shots: 0, makes: 0, swishes: 0,
      streak: 0, bestStreak: 0, level: 1, bonusUsed: false,
      countdown: 3, reload: 0, buzzerWait: 0,
    });
    hoop.reset(game.diff.rimR);
    setHoopMotionForLevel();
    hoop.amp = hoop.targetAmp;
    hoop.speed = hoop.targetSpeed;
    particles.length = 0;
    HUD.clear();
    Input.cancel();
    showScreen(null);
    Sfx.beep();
  }

  function toTitle() {
    game.state = 'title';
    game.paused = false;
    game.balls = [];
    hoop.reset(0.24);
    hoop.setMotion(0.5, 0.7);
    HUD.clear();
    renderLeaderboard($('title-scores'), game.diffKey);
    selectTab(game.diffKey);
    showScreen('title');
  }

  function gameOver() {
    game.state = 'over';
    game.balls.forEach((b) => { b.resolved = true; });
    const acc = game.shots ? Math.round(game.makes / game.shots * 100) : 0;
    $('final-score').textContent = game.score;
    $('final-diff').textContent = game.diff.label;
    $('stat-makes').textContent = `${game.makes}/${game.shots}`;
    $('stat-acc').textContent = `${acc}%`;
    $('stat-streak').textContent = game.bestStreak;
    $('stat-swish').textContent = game.swishes;
    const form = $('initials-form');
    const qualifies = Storage.qualifies(game.diffKey, game.score);
    form.classList.toggle('hidden', !qualifies);
    $('over-board-wrap').classList.toggle('hidden', qualifies);
    if (qualifies) {
      const input = $('initials');
      input.value = '';
      setTimeout(() => input.focus(), 50);
    } else {
      renderLeaderboard($('over-scores'), game.diffKey);
    }
    showScreen('over');
  }

  function setPaused(p) {
    if (game.state !== 'play' && game.state !== 'countdown' && game.state !== 'buzzer') return;
    game.paused = p;
    Input.cancel();
    showScreen(p ? 'pause' : null);
  }

  // ---------------------------------------------------------------- shooting
  function onFlick(f) {
    Sfx.init();
    if (game.state !== 'play' || game.paused || game.reload > 0) return;
    const d = game.diff;
    const u = Math.hypot(f.dx, f.dy) / H;
    if (u < 0.05) return;

    // Aim is measured against the direction from the ball to the hoop on screen.
    const b = project(START.x, START.y, START.z);
    const hp = project(hoop.x, hoop.y, hoop.z);
    const thetaStar = Math.atan2(hp.x - b.x, b.y - hp.y);
    const theta = Math.atan2(f.dx, -f.dy);
    const metersPerRad = Math.hypot(hp.x - b.x, hp.y - b.y) / hp.s;

    const powerErr = d.powK * Physics.shape(u / U_STAR - 1, d.powSnap);
    const lateral = d.aimK * metersPerRad * Physics.shape(theta - thetaStar, d.aimSnap);
    const v = Physics.launch(hoop, powerErr, lateral, 1 - d.aimK);

    game.balls.push(Physics.createBall(v, { fire: game.streak >= 3 }));
    game.shots++;
    game.reload = RELOAD;
    Sfx.shoot();
  }

  function attractShot() {
    const v = Physics.launch(hoop, (Math.random() - 0.5) * 0.035, (Math.random() - 0.5) * 0.3, 1);
    game.balls.push(Physics.createBall(v, { attract: true, fire: Math.random() < 0.3 }));
  }

  // ---------------------------------------------------------------- events
  const isFireTime = () => game.time <= FIRE_TIME;

  function burst(x, y, n, colors, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (80 + Math.random() * 260) * power;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * power,
        life: 0.7 + Math.random() * 0.6, max: 1.3,
        size: 3 + Math.random() * 4, color: colors[i % colors.length],
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  function onBallEvent(type, b, intensity) {
    const live = !b.attract && game.state !== 'title';
    switch (type) {
      case 'rim':
        hoop.onRim(intensity);
        if (live) Sfx.rim(intensity);
        break;
      case 'board':
        if (live) Sfx.board(intensity);
        break;
      case 'floor':
        if (live) Sfx.bounce(intensity);
        break;
      case 'score':
        onScore(b);
        break;
      case 'miss':
        if (live) onMiss(b);
        break;
      default:
    }
  }

  function onScore(b) {
    const swish = !b.rim && !b.board;
    hoop.onScore(swish);
    const hp = project(hoop.x, hoop.y, hoop.z);
    if (b.attract || game.state === 'title') {
      burst(hp.x, hp.y, 14, ['#3ef0ff', '#ff3fa4', '#ffd23f'], 0.7);
      return;
    }

    const onFire = game.streak >= 3;
    let mult = 1;
    if (onFire) mult *= 2;
    if (isFireTime()) mult *= 2;
    const pts = (swish ? 3 : 2) * mult;
    game.score += pts;
    game.makes++;
    if (swish) game.swishes++;
    game.streak++;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
    game.excite = Math.min(1, game.excite + (swish ? 0.8 : 0.5));

    const size = Math.max(22, Math.min(42, W / 16));
    HUD.popup(`+${pts}`, hp.x, hp.y - hp.s * 0.5, mult > 1 ? '#ff7a1a' : '#ffd23f', size);
    if (swish) HUD.popup('SWISH!', hp.x, hp.y + hp.s * 0.35, '#3ef0ff', size * 0.6, 1.0);
    else if (b.board) HUD.popup('BANK!', hp.x, hp.y + hp.s * 0.35, '#c9d3ff', size * 0.55, 1.0);

    const colors = onFire || isFireTime() ? ['#ff7a1a', '#ffd23f', '#ff3b3b'] : ['#3ef0ff', '#ff3fa4', '#ffd23f', '#37ff8b'];
    burst(hp.x, hp.y, swish ? 40 : 24, colors, swish ? 1.2 : 0.9);

    if (swish) {
      shake = Math.max(shake, 9);
      Sfx.swish();
    } else {
      Sfx.net();
    }
    if (swish || game.streak >= 3) Sfx.cheer(swish ? 1 : 0.7);

    if (game.streak === 3) {
      HUD.banner('ON FIRE!', 'Baskets score x2', '#ff7a1a', 1.4);
      Sfx.fanfare();
    }

    const newLevel = 1 + Math.floor(game.score / game.diff.levelStep);
    if (newLevel > game.level) {
      game.level = newLevel;
      const moving = game.level >= game.diff.moveFrom;
      HUD.banner(`LEVEL ${game.level}`, moving ? (game.level === game.diff.moveFrom ? 'The hoop is on the move!' : 'Hoop speeds up!') : '', '#3ef0ff', 1.4);
      Sfx.levelUp();
      setHoopMotionForLevel();
    }
  }

  function onMiss() {
    if (game.streak >= 3) {
      const hp = project(hoop.x, hoop.y, hoop.z);
      HUD.popup('FIRE OUT', hp.x, hp.y + hp.s * 0.4, '#9aa6c9', Math.max(16, W / 30), 0.9);
    }
    game.streak = 0;
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    clock += dt;
    hoop.update(dt);

    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (const b of game.balls) {
      for (let i = 0; i < n; i++) Physics.step(b, hoop, h, onBallEvent);
      b.rot += b.spin * dt;
      if (b.fire) {
        b.trail.push({ x: b.p.x, y: b.p.y, z: b.p.z });
        if (b.trail.length > 10) b.trail.shift();
      }
      if (b.resolved && (b.age > 3.2 || (b.p.y <= Physics.BALL_R + 0.001 && b.age > 2))) b.alpha -= dt * 2.5;
    }
    game.balls = game.balls.filter((b) => b.alpha > 0);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 600 * dt;
      p.vx *= Math.exp(-dt * 1.5);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 30);
    game.excite = Math.max(0, game.excite - dt * 0.5);
    HUD.update(dt);

    switch (game.state) {
      case 'title':
        game.attractTimer -= dt;
        if (game.attractTimer <= 0) {
          attractShot();
          game.attractTimer = 1.3 + Math.random() * 0.8;
        }
        break;

      case 'countdown': {
        const before = Math.ceil(game.countdown);
        game.countdown -= dt;
        if (game.countdown <= 0) {
          game.state = 'play';
          HUD.banner('GO!', '', '#37ff8b', 0.8);
          Sfx.go();
        } else if (Math.ceil(game.countdown) !== before) {
          Sfx.beep();
        }
        break;
      }

      case 'play': {
        const before = game.time;
        game.time -= dt;
        game.reload = Math.max(0, game.reload - dt);
        if (before > FIRE_TIME && game.time <= FIRE_TIME) {
          HUD.banner('FIRE TIME!', 'Every basket x2', '#ff3b3b', 1.5);
          Sfx.fanfare();
        }
        if (game.time <= 5 && Math.ceil(game.time) !== Math.ceil(before) && game.time > 0) Sfx.tick();
        if (game.time <= 0) {
          game.time = 0;
          game.state = 'buzzer';
          game.buzzerWait = 0;
          Input.cancel();
          Sfx.buzzer();
        }
        break;
      }

      case 'buzzer':
        // Let shots already in the air finish (buzzer beaters count!).
        game.buzzerWait += dt;
        if (game.balls.every((b) => b.resolved) || game.buzzerWait > 4) {
          if (!game.bonusUsed && game.score >= game.diff.target) {
            game.bonusUsed = true;
            game.time = BONUS_TIME;
            game.state = 'play';
            HUD.banner('BONUS TIME!', `+${BONUS_TIME} seconds`, '#37ff8b', 1.8);
            Sfx.fanfare();
            Sfx.cheer(1.2);
          } else if (game.buzzerWait > 0.8) {
            gameOver();
          }
        }
        break;

      default:
    }
  }

  // ---------------------------------------------------------------- render
  function drawArena() {
    const floorBack = project(0, 0, Physics.FLOOR_BACK_Z).y;
    const bg = ctx.createLinearGradient(0, 0, 0, floorBack);
    bg.addColorStop(0, '#05061a');
    bg.addColorStop(0.6, '#140d3a');
    bg.addColorStop(1, '#241052');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, floorBack + 2);

    // Spotlights
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [[0.15, '#3ef0ff'], [0.85, '#ff3fa4'], [0.5, '#6b5bff']].forEach(([fx, col], i) => {
      const x = W * fx + Math.sin(clock * 0.4 + i * 2) * W * 0.05;
      const g = ctx.createRadialGradient(x, 0, 0, x, 0, H * 0.7);
      g.addColorStop(0, col + '40');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, floorBack);
    });
    ctx.restore();

    // Crowd silhouettes
    for (const c of crowd) {
      const bob = -Math.abs(Math.sin(clock * 9 + c.phase)) * game.excite * c.r * 1.2
        + Math.sin(clock * 1.5 + c.phase) * c.r * 0.08;
      const y = c.y + bob;
      ctx.fillStyle = `hsl(${c.hue},30%,${c.light * 0.6}%)`;
      ctx.beginPath();
      ctx.ellipse(c.x, y + c.r * 2.1, c.r * 1.45, c.r * 1.3, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = `hsl(${(c.hue + 30) % 360},25%,${c.light}%)`;
      ctx.beginPath();
      ctx.arc(c.x, y + c.r * 0.2, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Darken the crowd toward the top
    const fade = ctx.createLinearGradient(0, floorBack - H * 0.32, 0, floorBack);
    fade.addColorStop(0, 'rgba(5,6,26,1)');
    fade.addColorStop(1, 'rgba(5,6,26,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, floorBack);

    // LED advertising board along the baseline
    const bh = Math.max(12, H * 0.035);
    const by = floorBack - bh;
    ctx.fillStyle = '#07081c';
    ctx.fillRect(0, by, W, bh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, by, W, bh);
    ctx.clip();
    ctx.font = `800 ${Math.round(bh * 0.62)}px Orbitron, "Arial Black", sans-serif`;
    ctx.textBaseline = 'middle';
    const msg = game.state === 'play' && isFireTime() ? 'FIRE TIME  •  ' : 'HOOP FRENZY  •  ';
    const mw = ctx.measureText(msg).width;
    const off = -((clock * 60) % mw);
    ctx.fillStyle = isFireTime() && game.state === 'play' ? '#ff5a3c' : '#3ef0ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    for (let x = off; x < W; x += mw) ctx.fillText(msg, x, by + bh / 2 + 1);
    ctx.restore();
    ctx.fillStyle = 'rgba(62,240,255,0.5)';
    ctx.fillRect(0, by, W, 1.5);
  }

  function floorLine(x1, z1, x2, z2) {
    const a = project(x1, 0, z1);
    const b = project(x2, 0, z2);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  function drawFloor() {
    const zb = Physics.FLOOR_BACK_Z;
    const zn = -2.2;
    const back = project(0, 0, zb).y;
    const g = ctx.createLinearGradient(0, back, 0, H);
    g.addColorStop(0, '#7a4a22');
    g.addColorStop(0.35, '#b7783d');
    g.addColorStop(1, '#d99a5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, back, W, H - back);

    // Planks
    ctx.beginPath();
    for (let x = -9; x <= 9; x += 0.32) floorLine(x, zb, x, zn);
    ctx.strokeStyle = 'rgba(70,35,10,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Paint: key / lane
    const lane = [[-0.95, 1.0], [0.95, 1.0], [0.95, zb], [-0.95, zb]].map(([x, z]) => project(x, 0, z));
    ctx.beginPath();
    lane.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(40,40,170,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Free-throw circle (toward the shooter)
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      const p = project(Math.cos(a) * 0.95, 0, 1.0 + Math.sin(a) * 0.95);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();

    // Baseline
    ctx.beginPath();
    floorLine(-9, zb, 9, zb);
    ctx.stroke();

    // Glow under the hoop
    const hp = project(hoop.x, 0, hoop.z);
    const gl = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, hp.s * 1.6);
    const glowA = 0.18 + hoop.glow * 0.35;
    gl.addColorStop(0, `rgba(255,${isFireTime() && game.state === 'play' ? 90 : 210},120,${glowA})`);
    gl.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, back, W, H - back);

    // Ball shadows
    for (const b of game.balls) {
      const p = project(b.p.x, 0, b.p.z);
      if (b.p.z < -2) continue;
      const a = 0.4 * Math.max(0.12, 1 - b.p.y / 4) * b.alpha;
      ctx.fillStyle = `rgba(30,12,0,${a})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, Physics.BALL_R * p.s * 1.1, Physics.BALL_R * p.s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function rimPoint(theta, radius = hoop.r, y = hoop.y, dx = 0) {
    return project(hoop.x + dx + Math.cos(theta) * radius, y, hoop.z + Math.sin(theta) * radius);
  }

  function drawRimHalf(front) {
    const c = project(hoop.x, hoop.y, hoop.z);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const th = (front ? Math.PI : 0) + (i / 24) * Math.PI;
      const p = rimPoint(th);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    const flash = hoop.rimFlash;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, 0.03 * c.s);
    ctx.strokeStyle = front ? `rgb(255,${80 + flash * 120},${30 + flash * 120})` : '#b8320f';
    ctx.stroke();
    if (front) {
      ctx.lineWidth = Math.max(1, 0.01 * c.s);
      ctx.strokeStyle = 'rgba(255,200,160,0.8)';
      ctx.stroke();
    }
  }

  function drawBackboard() {
    const B = Physics.BOARD;
    const glow = hoop.glow;

    // Support arms hanging from the ceiling
    const top = project(hoop.x, B.top, B.z + 0.05);
    const base = project(hoop.x, B.top + 6, B.z + 1.2);
    ctx.strokeStyle = '#2a2f4a';
    ctx.lineWidth = Math.max(3, top.s * 0.05);
    ctx.beginPath();
    for (const off of [-0.35, 0.35]) {
      const a = project(hoop.x + off, B.top, B.z + 0.05);
      const b = project(hoop.x + off * 0.6, B.top + 6, B.z + 1.2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#3d4466';
    ctx.lineWidth = Math.max(1, top.s * 0.015);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(base.x, base.y);
    ctx.stroke();

    // Glass
    const tl = project(hoop.x - B.halfW, B.top, B.z);
    const br = project(hoop.x + B.halfW, B.bottom, B.z);
    const w = br.x - tl.x;
    const h = br.y - tl.y;
    const glass = ctx.createLinearGradient(tl.x, tl.y, br.x, br.y);
    glass.addColorStop(0, 'rgba(190,230,255,0.22)');
    glass.addColorStop(0.5, 'rgba(120,160,255,0.08)');
    glass.addColorStop(1, 'rgba(190,230,255,0.16)');
    ctx.fillStyle = glass;
    ctx.fillRect(tl.x, tl.y, w, h);

    ctx.save();
    ctx.shadowColor = '#3ef0ff';
    ctx.shadowBlur = 10 + glow * 30;
    ctx.strokeStyle = glow > 0.05 ? `rgb(${62 + glow * 190},240,255)` : '#3ef0ff';
    ctx.lineWidth = Math.max(2, tl.s * 0.03);
    ctx.strokeRect(tl.x, tl.y, w, h);

    // Shooter's square
    const sq1 = project(hoop.x - 0.295, 3.5, B.z);
    const sq2 = project(hoop.x + 0.295, hoop.y + 0.02, B.z);
    ctx.shadowColor = '#ff3fa4';
    ctx.strokeStyle = '#ff3fa4';
    ctx.lineWidth = Math.max(2, tl.s * 0.022);
    ctx.strokeRect(sq1.x, sq1.y, sq2.x - sq1.x, sq2.y - sq1.y);
    ctx.restore();

    // Bracket from board to rim
    const b1 = project(hoop.x, hoop.y, B.z);
    const b2 = project(hoop.x, hoop.y, hoop.z + hoop.r);
    ctx.strokeStyle = '#8a2a0c';
    ctx.lineWidth = Math.max(3, b1.s * 0.05);
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();
  }

  function drawNet() {
    const N = 12;
    const n = hoop.net;
    const stretch = Math.max(-0.05, n.stretch * 0.6);
    const sway = n.sway * 0.4;
    const top = [];
    const mid = [];
    const bot = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      top.push(rimPoint(th));
      mid.push(rimPoint(th + Math.PI / N, hoop.r * (0.82 - stretch * 0.4), hoop.y - 0.21 - stretch * 0.5, sway * 0.5));
      bot.push(rimPoint(th, hoop.r * (0.6 - stretch * 0.5), hoop.y - 0.42 - stretch, sway));
    }
    const c = project(hoop.x, hoop.y, hoop.z);
    ctx.lineWidth = Math.max(1, c.s * 0.008);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      ctx.moveTo(top[i].x, top[i].y); ctx.lineTo(mid[i].x, mid[i].y);
      ctx.moveTo(top[j].x, top[j].y); ctx.lineTo(mid[i].x, mid[i].y);
      ctx.moveTo(mid[i].x, mid[i].y); ctx.lineTo(bot[i].x, bot[i].y);
      ctx.moveTo(mid[i].x, mid[i].y); ctx.lineTo(bot[j].x, bot[j].y);
      ctx.moveTo(bot[i].x, bot[i].y); ctx.lineTo(bot[j].x, bot[j].y);
    }
    ctx.stroke();
  }

  function drawBallAt(x, y, r, rot, alpha) {
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffb877');
    g.addColorStop(0.55, '#ee6a1e');
    g.addColorStop(1, '#7e2e07');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(45,16,2,0.85)';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 1.05, 0, r * 0.6, r * 1.05, 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(r * 1.05, 0, r * 0.6, r * 1.05, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawBall(b) {
    if (b.fire && b.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      b.trail.forEach((t, i) => {
        const p = project(t.x, t.y, t.z);
        const k = i / b.trail.length;
        ctx.globalAlpha = k * 0.5 * b.alpha;
        ctx.fillStyle = i % 2 ? '#ff7a1a' : '#ffd23f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Physics.BALL_R * p.s * (0.5 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    const p = project(b.p.x, b.p.y, b.p.z);
    if (b.p.z - CAM.z < 0.3) return;
    drawBallAt(p.x, p.y, Physics.BALL_R * p.s, b.rot, b.alpha);
  }

  function drawRackBall() {
    if (game.state !== 'play' && game.state !== 'countdown') return;
    const p = project(START.x, START.y, START.z);
    const r = Physics.BALL_R * p.s;
    const pop = game.reload > 0 ? 1 - game.reload / RELOAD : 1;
    if (game.reload > RELOAD * 0.6) return;
    const scale = Math.min(1, 0.4 + pop * 0.7);
    const fire = game.streak >= 3;
    if (fire) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, r * 2);
      g.addColorStop(0, 'rgba(255,122,26,0.6)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (2 + Math.sin(clock * 12) * 0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawBallAt(p.x, p.y + Math.sin(clock * 3) * 2, r * scale, 0.3, 1);
  }

  function drawSwipeTrail() {
    const pts = Input.trail();
    if (!pts || pts.length < 2) return;
    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const age = now - pts[i].t;
      const a = Input.isDragging() ? Math.max(0, 1 - age / 400) : Math.max(0, 1 - age / 220);
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
      ctx.lineWidth = 2 + a * 6;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 0.4);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawArena();
    drawFloor();
    drawBackboard();
    drawRimHalf(false);

    // Balls behind the front of the rim are drawn before the net and front rim.
    const sorted = [...game.balls].sort((a, b) => b.p.z - a.p.z);
    const far = sorted.filter((b) => b.p.z > hoop.z - 0.1);
    const near = sorted.filter((b) => b.p.z <= hoop.z - 0.1);
    far.forEach(drawBall);
    drawNet();
    drawRimHalf(true);
    near.forEach(drawBall);
    drawRackBall();
    drawParticles();
    ctx.restore();

    // Fire-time vignette
    if ((game.state === 'play' || game.state === 'buzzer') && isFireTime()) {
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(255,40,0,0)');
      v.addColorStop(1, `rgba(255,40,0,${0.18 + Math.sin(clock * 6) * 0.06})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    drawSwipeTrail();

    const rack = project(START.x, START.y, START.z);
    HUD.draw(ctx, W, H, {
      state: game.state,
      score: game.score,
      best: Storage.best(game.diffKey),
      time: game.time,
      level: game.level,
      streak: game.streak,
      onFire: game.streak >= 3,
      fireTime: isFireTime(),
      mult: (game.streak >= 3 ? 2 : 1) * (isFireTime() ? 2 : 1),
      target: game.diff.target,
      bonusUsed: game.bonusUsed,
      countdown: game.countdown,
      showHint: game.state === 'play' && game.shots === 0 && !game.bonusUsed,
      hintPos: { x: rack.x, y: rack.y, r: Physics.BALL_R * rack.s },
    }, clock);
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!game.paused) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- UI wiring
  function renderLeaderboard(el, diffKey, highlight = -1) {
    const scores = Storage.getScores(diffKey);
    el.innerHTML = '';
    if (!scores.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No scores yet. Be the first!';
      el.appendChild(li);
      return;
    }
    scores.forEach((s, i) => {
      const li = document.createElement('li');
      if (i === highlight) li.className = 'mine';
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = s.score;
      li.append(rank, name, score);
      el.appendChild(li);
    });
  }

  function selectTab(diffKey) {
    document.querySelectorAll('#title-tabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.diff === diffKey);
    });
    renderLeaderboard($('title-scores'), diffKey);
  }

  document.querySelectorAll('.diff-buttons button').forEach((btn) => {
    btn.addEventListener('click', () => startGame(btn.dataset.diff));
  });
  document.querySelectorAll('#title-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.diff));
  });

  $('initials').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  });
  $('initials-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = ($('initials').value || 'AAA').padEnd(3, '-');
    const idx = Storage.add(game.diffKey, name, game.score);
    $('initials').blur();
    $('initials-form').classList.add('hidden');
    $('over-board-wrap').classList.remove('hidden');
    renderLeaderboard($('over-scores'), game.diffKey, idx);
  });
  $('btn-again').addEventListener('click', () => startGame(game.diffKey));
  $('btn-menu').addEventListener('click', toTitle);
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-quit').addEventListener('click', toTitle);
  $('btn-pause').addEventListener('click', () => setPaused(!game.paused));

  const muteBtn = $('btn-mute');
  const syncMute = () => {
    muteBtn.textContent = Sfx.isMuted() ? '\u{1F507}' : '\u{1F50A}';
    muteBtn.setAttribute('aria-label', Sfx.isMuted() ? 'Unmute' : 'Mute');
  };
  muteBtn.addEventListener('click', () => { Sfx.init(); Sfx.toggleMute(); syncMute(); });
  syncMute();

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'escape') setPaused(!game.paused);
    else if (k === 'm') { Sfx.init(); Sfx.toggleMute(); syncMute(); }
    else if (game.state === 'title' && ['1', '2', '3'].includes(k)) startGame(['easy', 'medium', 'hard'][+k - 1]);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  Input.attach(canvas, onFlick, () => game.state === 'play' && !game.paused);
  window.addEventListener('resize', resize);
  resize();
  toTitle();
  requestAnimationFrame(frame);

  // Small hook for automated testing / debugging in the console.
  window.HoopFrenzy = { game, hoop, project, startGame, onFlick, size: () => ({ W, H }) };
})();
