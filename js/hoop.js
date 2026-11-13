// The hoop: rim position, side-to-side movement, and net spring animation.
// World units are meters. x = left/right, y = up, z = distance away from the player.
class Hoop {
  constructor() {
    this.y = 3.05; // regulation rim height
    this.z = 4.2; // rim center distance from the shooter
    this.reset(0.24);
  }

  reset(radius) {
    this.r = radius;
    this.x = 0;
    this.vx = 0;
    this.phase = 0;
    this.amp = 0;
    this.targetAmp = 0;
    this.speed = 0;
    this.targetSpeed = 0;
    this.net = { stretch: 0, sv: 0, sway: 0, swv: 0 };
    this.glow = 0;
    this.rimFlash = 0;
  }

  // amp: how far the hoop slides left/right (m); speed: oscillation rate (rad/s)
  setMotion(amp, speed) {
    this.targetAmp = amp;
    this.targetSpeed = speed;
  }

  predictX(t) {
    return this.amp * Math.sin(this.phase + this.speed * t);
  }

  update(dt) {
    if (dt <= 0) return;
    const k = 1 - Math.exp(-dt * 1.2); // ease into new motion settings
    this.amp += (this.targetAmp - this.amp) * k;
    this.speed += (this.targetSpeed - this.speed) * k;
    this.phase += this.speed * dt;
    const nx = this.amp * Math.sin(this.phase);
    this.vx = (nx - this.x) / dt;
    this.x = nx;

    const n = this.net;
    n.sv += (-140 * n.stretch - 9 * n.sv) * dt;
    n.stretch += n.sv * dt;
    n.swv += (-90 * n.sway - 6 * n.swv) * dt;
    n.sway += n.swv * dt;

    this.glow = Math.max(0, this.glow - dt * 1.4);
    this.rimFlash = Math.max(0, this.rimFlash - dt * 5);
  }

  onScore(swish) {
    this.net.sv += swish ? 2.6 : 1.8;
    this.glow = 1;
  }

  onRim(intensity) {
    this.net.swv += (Math.random() - 0.5) * Math.min(intensity, 4) * 0.25;
    this.rimFlash = 1;
  }
}
