/**
 * First-person face shield: grass thrown up by the line sticks to it as green / brown specks and
 * smears, until the player wipes it with the glove (a sweep across the screen).
 */
interface Splat {
  x: number;
  y: number;
  r: number;
  a: number;
  hue: number;
  light: number;
  /** Stretch and angle: flung bits land as streaks. */
  sx: number;
  rot: number;
  drip: number;
}

const MAX_SPLATS = 220;

export class Visor {
  private readonly ctx: CanvasRenderingContext2D;
  private splats: Splat[] = [];
  private acc = 0;
  /** Wipe animation progress 0..1 (-1 = not wiping). */
  private wipeT = -1;
  private dirty = true;
  private w = 0;
  private h = 0;
  private dpr = 1;
  visible = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** How much of the view is covered, 0..1. */
  get dirt(): number {
    let s = 0;
    for (const p of this.splats) s += p.r * p.r * p.sx * p.a;
    return Math.min(1, s / (this.w * this.h * 0.03 + 1));
  }

  get wiping(): boolean {
    return this.wipeT >= 0;
  }

  /** Grass is being cut: `rate` = cells per second, `tall` 0..1 makes bigger, browner bits. */
  feed(dt: number, rate: number, tall: number): void {
    if (!this.visible || this.wiping) return;
    this.acc += dt * Math.min(14, rate * 0.1) * (1 + tall);
    while (this.acc >= 1) {
      this.acc -= 1;
      this.add(tall);
    }
  }

  wipe(): void {
    if (this.wiping) return;
    this.wipeT = 0;
  }

  clear(): void {
    this.splats = [];
    this.wipeT = -1;
    this.dirty = true;
  }

  update(dt: number): void {
    this.canvas.style.display = this.visible ? 'block' : 'none';
    if (!this.visible) return;
    if (this.wiping) {
      this.wipeT += dt / 0.65;
      // The glove sweeps from left to right; what it passes is wiped, leaving a faint smear that fades.
      const edge = this.edge();
      for (const p of this.splats) {
        if (p.x < edge && p.drip >= 0) {
          p.a *= 0.18;
          p.sx *= 2.2;
          p.rot = 0;
          p.drip = -1;
        }
      }
      if (this.wipeT >= 1) {
        this.wipeT = -1;
        this.splats = this.splats.filter((p) => p.drip >= 0);
      }
      this.dirty = true;
    }
    // Slow drips and fading smears.
    for (const p of this.splats) {
      if (p.drip > 0 && p.y < this.h * 0.98) {
        p.y += p.drip * dt * this.dpr;
        p.drip *= 1 - dt * 0.8;
        this.dirty = true;
      }
    }
    if (this.dirty) this.draw();
  }

  private edge(): number {
    const t = this.wipeT;
    const e = t * t * (3 - 2 * t);
    return -this.w * 0.2 + e * this.w * 1.4;
  }

  private add(tall: number): void {
    if (this.splats.length >= MAX_SPLATS) this.splats.shift();
    // The cutting head is low in front: most bits hit the lower and middle part of the shield.
    const x = this.w * (0.5 + (Math.random() - 0.5) * 0.95);
    const y = this.h * (0.35 + Math.random() * 0.6);
    const big = Math.random() < 0.15;
    this.splats.push({
      x,
      y,
      r: this.dpr * (big ? 12 + Math.random() * 16 : 4 + Math.random() * 7) * (1 + tall * 0.5),
      a: 0.75 + Math.random() * 0.25,
      hue: 75 + Math.random() * 35 - tall * 25,
      light: 22 + Math.random() * 22 + tall * 8,
      sx: 1 + Math.random() * 2.5,
      rot: Math.random() * Math.PI,
      drip: big && Math.random() < 0.5 ? 6 + Math.random() * 10 : 0,
    });
    this.dirty = true;
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.h = this.canvas.height = Math.round(window.innerHeight * this.dpr);
    this.dirty = true;
  }

  private draw(): void {
    this.dirty = false;
    const g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    // The shield itself: a faint tint, darker at the rim, with a curved reflection.
    const rim = g.createRadialGradient(this.w / 2, this.h * 0.55, this.h * 0.35, this.w / 2, this.h * 0.55, this.h * 0.85);
    rim.addColorStop(0, 'rgba(180, 200, 210, 0)');
    rim.addColorStop(1, 'rgba(20, 30, 35, 0.32)');
    g.fillStyle = rim;
    g.fillRect(0, 0, this.w, this.h);
    g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    g.lineWidth = this.w * 0.05;
    g.beginPath();
    g.ellipse(this.w * 0.15, this.h * 0.5, this.w * 0.5, this.h * 0.7, -0.15, -1.2, -0.3);
    g.stroke();
    for (const p of this.splats) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.scale(p.sx, 1);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, p.r);
      grd.addColorStop(0, `hsla(${p.hue}, 55%, ${p.light}%, ${p.a})`);
      grd.addColorStop(0.6, `hsla(${p.hue}, 50%, ${p.light * 0.8}%, ${p.a * 0.8})`);
      grd.addColorStop(1, `hsla(${p.hue}, 45%, ${p.light * 0.6}%, 0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, p.r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    if (this.wiping) {
      // The glove passing over the shield.
      const x = this.edge();
      const grd = g.createLinearGradient(x - this.w * 0.18, 0, x + this.w * 0.05, 0);
      grd.addColorStop(0, 'rgba(110, 72, 40, 0)');
      grd.addColorStop(0.7, 'rgba(110, 72, 40, 0.75)');
      grd.addColorStop(1, 'rgba(70, 45, 25, 0.95)');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x - this.w * 0.05, this.h * 0.6, this.w * 0.14, this.h * 0.38, 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }
}
