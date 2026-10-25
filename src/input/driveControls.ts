/**
 * Driving the pat pat or the tractor with a steering wheel on the screen (bottom left: grab it and
 * turn, it springs back to centre when let go) and two pedals (bottom right: GAZ, and FREN that backs
 * up once stopped). GAZ is pressed in as far as the finger is up it (see throttleAt: low on the pedal a
 * little gas, at its top full; slid up or down while held, more or less), easing there over GAS_UP for
 * the whole way; let go, it comes back over GAS_DOWN (its gauge beside it shows how far). Shown only
 * while driving; a drag elsewhere looks round, the keys still drive.
 */
const GAS_UP = 0.8;
const GAS_DOWN = 0.5;

/**
 * How much gas a finger on a throttle (the pedal, the trimmer's trigger) asks for, from how far up it
 * it is: at its bottom 15 %, up to all of it in its top fifth. Held there, half gas stays half gas.
 */
export function throttleAt(el: HTMLElement, clientY: number): number {
  const r = el.getBoundingClientRect();
  const up = (r.bottom - clientY) / (r.height * 0.8);
  return Math.max(0.15, Math.min(1, 0.15 + 0.85 * up));
}

export class DriveControls {
  /** -1 (full left) .. 1 (full right). */
  steer = 0;
  private gas = false;
  /** How far the gas pedal is pressed in, 0..1, and how far the finger on it asks for. */
  private gasLevel = 0;
  private gasWant = 0;
  private brake = false;
  private grabId: number | null = null;
  /** Wheel angle when grabbed and the finger's angle then, radians. */
  private grabFrom = 0;
  private grabAt = 0;
  /** The wheel's own angle (radians); full lock is a little over a half turn. */
  private angle = 0;
  private static readonly LOCK = 2.0;

  constructor(
    private readonly wheel: HTMLElement,
    private readonly gasPedal: HTMLElement,
    brake: HTMLElement,
  ) {
    const fingerAngle = (e: PointerEvent) => {
      const r = wheel.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    };
    wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.grabId = e.pointerId;
      try {
        wheel.setPointerCapture(e.pointerId);
      } catch {
        // (A pointer the browser no longer tracks: the wheel still follows its moves.)
      }
      this.grabFrom = this.angle;
      this.grabAt = fingerAngle(e);
    });
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.grabId) return;
      let d = fingerAngle(e) - this.grabAt;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // Follow the finger round, past a half turn too (the grab point is moved along as it goes).
      this.angle = Math.max(-DriveControls.LOCK, Math.min(DriveControls.LOCK, this.grabFrom + d));
      this.grabFrom = this.angle;
      this.grabAt = fingerAngle(e);
    });
    const let_go = (e: PointerEvent) => {
      if (e.pointerId === this.grabId) this.grabId = null;
    };
    wheel.addEventListener('pointerup', let_go);
    wheel.addEventListener('pointercancel', let_go);
    const pedal = (el: HTMLElement, set: (on: boolean) => void) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // (As above.)
        }
        el.classList.add('down');
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel'] as const)
        el.addEventListener(ev, () => {
          el.classList.remove('down');
          set(false);
        });
    };
    pedal(gasPedal, (on) => (this.gas = on));
    // How far: from where the finger is on the pedal, as it comes down and as it slides.
    const want = (e: PointerEvent) => (this.gasWant = throttleAt(gasPedal, e.clientY));
    gasPedal.addEventListener('pointerdown', want);
    gasPedal.addEventListener('pointermove', (e) => this.gas && want(e));
    pedal(brake, (on) => (this.brake = on));
  }

  /** Being used: a pedal held or the wheel turned (else the stick drives). */
  get active(): boolean {
    return this.gas || this.gasLevel > 0.01 || this.brake || this.grabId !== null || Math.abs(this.angle) > 0.02;
  }

  /** Throttle -1 (brake / back up) .. 1. */
  get throttle(): number {
    return this.brake ? -1 : this.gasLevel;
  }

  /** Each frame: the wheel springs back when let go; drawn at its angle. */
  update(dt: number): void {
    if (this.grabId === null) this.angle *= Math.exp(-dt * 5);
    const target = this.gas ? this.gasWant : 0;
    this.gasLevel = target > this.gasLevel ? Math.min(target, this.gasLevel + dt / GAS_UP) : Math.max(target, this.gasLevel - dt / GAS_DOWN);
    this.gasPedal.parentElement?.style.setProperty('--gas', this.gasLevel.toFixed(3));
    this.steer = this.angle / DriveControls.LOCK;
    this.wheel.style.transform = `rotate(${this.angle}rad)`;
  }

  reset(): void {
    this.gas = this.brake = false;
    this.gasLevel = 0;
    this.grabId = null;
    this.angle = 0;
  }
}
