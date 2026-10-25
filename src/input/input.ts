import { DriveControls, throttleAt } from './driveControls';

/**
 * The game is played held sideways. Easy controls (default): on foot without the trimmer a finger on
 * the left half drags the stick (walk), on the right half looks around. Driving, the steering wheel
 * (left) and the pedals (right) drive (see DriveControls) and a drag anywhere else turns the camera
 * round. Trimmer in hand the stick walks (up / down) and turns (left / right), and the right thumb
 * holds the throttle trigger: as much gas as the thumb is up it (low on it a little, at its top full;
 * slid up or down while held, more or less: throttleAt), easing there; let go, it eases back to idle in
 * a second. The right mouse button looks round.
 * The head stays straight ahead.
 *
 * Advanced touch controls:
 * - left half: floating joystick (first person: up/down walks, left/right turns);
 * - right half: drag to look around;
 * - throttle pad: press = throttle, slide left/right while pressing = swing the head;
 * - buttons: bump feed, stop switch, re-thread (hold).
 * Keyboard: W/S walk, A/D turn, Space throttle, ←/→ swing the head, F bump, X stop, T re-thread (hold),
 * Esc pause.
 */
/**
 * The look stick (a finger on the right half, on foot without the trimmer): pushed to its edge it turns
 * the view this many pixels' worth a second (as a drag that long would), across and up and down.
 */
const LOOK_RATE = { x: 340, y: 300 };
/** The throttle trigger: milliseconds from idle to full opening, and from full back to idle let go. */
const GAS_UP = 700;
const GAS_DOWN = 1000;

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
  /** The look stick: where it came down, how far it is pushed (-1..1), its ring on the screen. */
  private lookStick = false;
  private lookOx = 0;
  private lookOy = 0;
  private lookSX = 0;
  private lookSY = 0;
  private readonly lookBase = document.getElementById('look-stick');
  private readonly lookKnob = document.getElementById('look-knob');
  private padId: number | null = null;
  private padSweep = 0;
  private throttleHeld = false;
  private throttleLatched = false;
  private bumpQueued = false;
  private stopQueued = false;
  private rethreadHeld = false;
  private readonly keys = new Set<string>();
  /** The throttle trigger: how far it is open 0..1, how far the thumb on it asks for, the thumb, the last tick. */
  private gas = 0;
  private gasWant = 0;
  private gasId: number | null = null;
  private gasTick = 0;
  private readonly gasBtn = document.getElementById('gas-btn');
  /** The trimmer in hand on foot (first person): the left thumb walks and turns, the right one is on the trigger. */
  trimmer = false;
  /** On the pat pat or the tractor: the wheel and the pedals drive, a drag on the screen looks round. */
  driving = false;
  /** The steering wheel and the pedals. */
  readonly drive = new DriveControls(document.getElementById('drive-wheel')!, document.getElementById('pedal-gas')!, document.getElementById('pedal-brake')!);

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
    const btn = this.gasBtn;
    if (btn) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.gasId !== null) return;
        // As far open as the thumb is up the trigger (it eases there: see tickGas).
        this.gasId = e.pointerId;
        this.gasWant = throttleAt(btn, e.clientY);
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // (A pointer already gone: nothing to hold on to.)
        }
        this.showGas();
      });
      // Slid up or down while held: more or less gas.
      btn.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.gasId) this.gasWant = throttleAt(btn, e.clientY);
      });
      const leave = (e: PointerEvent) => {
        if (e.pointerId !== this.gasId) return;
        // Let go: it eases back to idle (see tickGas).
        this.gasId = null;
        this.showGas();
      };
      btn.addEventListener('pointerup', leave);
      btn.addEventListener('pointercancel', leave);
      btn.addEventListener('lostpointercapture', leave);
    }
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
    // The look stick held over: on turning while it is.
    this.lookDX += this.lookSX * LOOK_RATE.x * dt;
    this.lookDY += this.lookSY * LOOK_RATE.y * dt;
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return r;
  }

  /** The throttle, 0..1: the trigger as held (Space: full). */
  get throttleLevel(): number {
    if (this.keys.has('Space')) return 1;
    if (this.easy) return this.gas;
    return this.throttleOn ? 1 : 0;
  }

  /** Let go of the trigger and its lock (the engine stopped). */
  setGas(v: number): void {
    this.gas = v;
    if (v === 0) {
      this.gasId = null;
      this.gas = 0;
    }
    this.showGas();
  }



  /** Each frame: the throttle eases towards what the thumb asks for, its gauge following. */
  tickGas(): void {
    const now = performance.now();
    const dt = Math.min(100, now - (this.gasTick || now));
    this.gasTick = now;
    // Towards what the thumb asks for (idle once let go): opening over GAS_UP, closing over GAS_DOWN.
    const want = this.gasId !== null ? this.gasWant : 0;
    this.gas = want > this.gas ? Math.min(want, this.gas + dt / GAS_UP) : Math.max(want, this.gas - dt / GAS_DOWN);
    this.showGas();
  }

  private showGas(): void {
    const b = this.gasBtn;
    if (!b) return;
    b.style.setProperty('--gas', String(this.throttleLevel));
    b.classList.toggle('held', this.gasId !== null);
  }

  get throttleOn(): boolean {
    if (this.easy) return this.throttleLevel > 0.04;
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
    this.endLookStick();
    this.padId = null;
    this.padSweep = 0;
    this.throttleHeld = this.throttleLatched = false;
    this.bumpQueued = this.stopQueued = false;
    this.rethreadHeld = false;
    this.gasId = null;
    this.setGas(0);
    this.drive.reset();
    this.stickBase.classList.remove('show');
    this.renderPad();
  }

  private padMove(e: PointerEvent): void {
    const r = this.pad.getBoundingClientRect();
    const half = r.width * 0.42;
    this.padSweep = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / half));
  }

  private down(e: PointerEvent): void {
    // The left half walks (the stick), the right half looks (so does a second finger): on foot with the
    // look stick, trimmer in hand by dragging round its trigger (up and down too). Driving, the wheel and
    // the pedals drive: the screen only looks. The right mouse button looks.
    const look = e.button === 2 || this.driving || (this.stickId !== null && e.pointerType === 'touch') || ((e.pointerType === 'touch' || !this.easy) && this.fpv && e.clientX > window.innerWidth * 0.5);
    if (look) {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      // On foot without the trimmer a finger looks with the look stick (it shows where it came down);
      // driving and with the mouse, by dragging.
      this.lookStick = e.pointerType === 'touch' && !this.driving && !this.trimmer && this.easy;
      if (this.lookStick && this.lookBase) {
        this.lookOx = e.clientX;
        this.lookOy = e.clientY;
        this.lookBase.style.left = `${e.clientX}px`;
        this.lookBase.style.top = `${e.clientY}px`;
        this.lookBase.classList.add('show');
        if (this.lookKnob) this.lookKnob.style.transform = 'translate(-50%, -50%)';
      }
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
      this.looked += Math.abs(e.clientX - this.lookLastX) + Math.abs(e.clientY - this.lookLastY);
      if (this.lookStick) {
        // As the walking stick: pushed up to R from where it came down, its ring dragged along past that.
        const R = 55;
        let dx = e.clientX - this.lookOx;
        let dy = e.clientY - this.lookOy;
        const l = Math.hypot(dx, dy);
        if (l > R) {
          this.lookOx += (dx / l) * (l - R);
          this.lookOy += (dy / l) * (l - R);
          dx = (dx / l) * R;
          dy = (dy / l) * R;
          if (this.lookBase) {
            this.lookBase.style.left = `${this.lookOx}px`;
            this.lookBase.style.top = `${this.lookOy}px`;
          }
        }
        const m = Math.max(0, Math.hypot(dx, dy) - 6) / (R - 6);
        const a = Math.atan2(dy, dx);
        this.lookSX = Math.cos(a) * m;
        this.lookSY = Math.sin(a) * m;
        if (this.lookKnob) this.lookKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.lookLastX = e.clientX;
        this.lookLastY = e.clientY;
        return;
      }
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
      this.endLookStick();
      return;
    }
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.stickX = this.stickY = 0;
    this.stickBase.classList.remove('show');
    // Back to where it rests (the stylesheet's place).
    this.stickBase.style.left = this.stickBase.style.top = '';
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  /** The look stick let go: still, back to where it rests. */
  private endLookStick(): void {
    this.lookStick = false;
    this.lookSX = this.lookSY = 0;
    if (!this.lookBase) return;
    this.lookBase.classList.remove('show');
    this.lookBase.style.left = this.lookBase.style.top = '';
    if (this.lookKnob) this.lookKnob.style.transform = 'translate(-50%, -50%)';
  }

  /** How far the player has dragged to look round, in all (pixels). */
  looked = 0;
}
