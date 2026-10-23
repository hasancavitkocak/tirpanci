/**
 * Easy controls (default): first finger anywhere = throttle on, drag = walk / turn; a second finger (or
 * the right mouse button) drags to look around, also with the follow camera. The head stays straight ahead.
 *
 * Advanced touch controls:
 * - left half: floating joystick (first person: up/down walks, left/right turns);
 * - right half: drag to look around;
 * - throttle pad: press = throttle, slide left/right while pressing = swing the head;
 * - buttons: bump feed, stop switch, re-thread (hold).
 * Keyboard: W/S walk, A/D turn, Space throttle, ←/→ swing the head, F bump, X stop, T re-thread (hold),
 * Esc pause.
 */
export class Input {
  /** Joystick: x right, y down, length 0..1. */
  stickX = 0;
  stickY = 0;
  /** Toggle mode: a tap switches the throttle on / off instead of holding. */
  toggleThrottle = false;
  /** First person: the right half of the screen is for looking around (advanced controls). */
  fpv = true;
  /** One-finger controls: the whole screen is the stick and touching it opens the throttle. */
  easy = true;
  onPause: (() => void) | null = null;

  private stickId: number | null = null;
  private ox = 0;
  private oy = 0;
  private lookId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private lookDX = 0;
  private lookDY = 0;
  private padId: number | null = null;
  private padSweep = 0;
  private throttleHeld = false;
  private throttleLatched = false;
  private bumpQueued = false;
  private stopQueued = false;
  private rethreadHeld = false;
  private readonly keys = new Set<string>();

  constructor(
    surface: HTMLElement,
    private readonly stickBase: HTMLElement,
    private readonly stickKnob: HTMLElement,
    private readonly pad: HTMLElement,
    bump: HTMLElement,
    stop: HTMLElement,
    rethread: HTMLElement,
  ) {
    surface.addEventListener('pointerdown', (e) => this.down(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.padId !== null) return;
      this.padId = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      if (this.toggleThrottle) this.throttleLatched = !this.throttleLatched;
      this.throttleHeld = true;
      this.padMove(e);
    });
    pad.addEventListener('pointermove', (e) => e.pointerId === this.padId && this.padMove(e));
    const padUp = (e: PointerEvent) => {
      if (e.pointerId !== this.padId) return;
      this.padId = null;
      this.throttleHeld = false;
      this.padSweep = 0;
      this.renderPad();
    };
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);

    bump.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.bumpQueued = true;
    });
    stop.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stopQueued = true;
    });
    rethread.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      rethread.setPointerCapture(e.pointerId);
      this.rethreadHeld = true;
    });
    const rethreadUp = () => (this.rethreadHeld = false);
    rethread.addEventListener('pointerup', rethreadUp);
    rethread.addEventListener('pointercancel', rethreadUp);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.bumpQueued = true;
      if (e.code === 'KeyX') this.stopQueued = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.throttleHeld = false;
      this.rethreadHeld = false;
      this.renderPad();
    });
  }

  /** A key held down (by its code). */
  held(code: string): boolean {
    return this.keys.has(code);
  }

  /** Stick plus keys: x = turn (first person) or sideways, y = back (+) / forward (-). */
  move2(): { x: number; y: number } {
    let x = this.stickX;
    let y = this.stickY;
    const k = this.keys;
    if (k.has('KeyA')) x -= 1;
    if (k.has('KeyD')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  /** Look drag since the last call, pixels. */
  takeLook(dt = 0): { dx: number; dy: number } {
    const k = this.keys;
    if (k.has('KeyI')) this.lookDY -= 300 * dt;
    if (k.has('KeyK')) this.lookDY += 300 * dt;
    if (k.has('KeyJ')) this.lookDX -= 400 * dt;
    if (k.has('KeyL')) this.lookDX += 400 * dt;
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return r;
  }

  get throttleOn(): boolean {
    if (this.easy) return this.stickId !== null || this.keys.has('Space');
    return (this.toggleThrottle ? this.throttleLatched : this.throttleHeld) || this.keys.has('Space');
  }

  /** Where the player is steering the head, -1..1. */
  get sweep(): number {
    if (this.easy) return 0;
    if (this.padId !== null) return this.padSweep;
    return (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
  }

  get rethreading(): boolean {
    return this.rethreadHeld || this.keys.has('KeyT');
  }

  takeBump(): boolean {
    const b = this.bumpQueued;
    this.bumpQueued = false;
    return b;
  }

  takeStop(): boolean {
    const b = this.stopQueued;
    this.stopQueued = false;
    return b;
  }

  /** Show the head position and throttle on the pad (called every frame). */
  renderPad(headSweep = 0, throttle = 0): void {
    this.pad.style.setProperty('--sweep', String(headSweep));
    this.pad.style.setProperty('--thr', String(throttle));
    this.pad.classList.toggle('on', this.throttleOn);
  }

  reset(): void {
    this.stickX = this.stickY = 0;
    this.stickId = null;
    this.lookId = null;
    this.lookDX = this.lookDY = 0;
    this.padId = null;
    this.padSweep = 0;
    this.throttleHeld = this.throttleLatched = false;
    this.bumpQueued = this.stopQueued = false;
    this.rethreadHeld = false;
    this.stickBase.classList.remove('show');
    this.renderPad();
  }

  private padMove(e: PointerEvent): void {
    const r = this.pad.getBoundingClientRect();
    const half = r.width * 0.42;
    this.padSweep = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / half));
  }

  private down(e: PointerEvent): void {
    // The first finger walks (and opens the throttle in easy mode); a second finger, or the right
    // mouse button, looks around. In advanced first person the right half is for looking.
    const look = e.button === 2 || (this.stickId !== null && e.pointerType === 'touch') || (!this.easy && this.fpv && e.clientX > window.innerWidth * 0.5);
    if (look) {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      return;
    }
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    this.ox = e.clientX;
    this.oy = e.clientY;
    this.stickBase.style.left = `${e.clientX}px`;
    this.stickBase.style.top = `${e.clientY}px`;
    this.stickBase.classList.add('show');
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.lookId) {
      this.lookDX += e.clientX - this.lookLastX;
      this.lookDY += e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      return;
    }
    if (e.pointerId !== this.stickId) return;
    const R = 55;
    let dx = e.clientX - this.ox;
    let dy = e.clientY - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      // Drag the base along so the stick never "runs out".
      this.ox += (dx / l) * (l - R);
      this.oy += (dy / l) * (l - R);
      dx = (dx / l) * R;
      dy = (dy / l) * R;
      this.stickBase.style.left = `${this.ox}px`;
      this.stickBase.style.top = `${this.oy}px`;
    }
    const dead = 6;
    const m = Math.max(0, Math.hypot(dx, dy) - dead) / (R - dead);
    const a = Math.atan2(dy, dx);
    this.stickX = Math.cos(a) * m;
    this.stickY = Math.sin(a) * m;
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      return;
    }
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.stickX = this.stickY = 0;
    this.stickBase.classList.remove('show');
  }
}
