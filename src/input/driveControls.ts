/**
 * Driving the pat pat with a steering wheel on the screen (bottom left: grab it and turn, it springs
 * back to centre when let go) and two pedals (bottom right: GAZ, and FREN that backs up once stopped).
 * Shown only while driving; the drag stick still works alongside.
 */
export class DriveControls {
  /** -1 (full left) .. 1 (full right). */
  steer = 0;
  private gas = false;
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
    gas: HTMLElement,
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
    pedal(gas, (on) => (this.gas = on));
    pedal(brake, (on) => (this.brake = on));
  }

  /** Being used: a pedal held or the wheel turned (else the stick drives). */
  get active(): boolean {
    return this.gas || this.brake || this.grabId !== null || Math.abs(this.angle) > 0.02;
  }

  /** Throttle -1 (brake / back up) .. 1. */
  get throttle(): number {
    return (this.gas ? 1 : 0) - (this.brake ? 1 : 0);
  }

  /** Each frame: the wheel springs back when let go; drawn at its angle. */
  update(dt: number): void {
    if (this.grabId === null) this.angle *= Math.exp(-dt * 5);
    this.steer = this.angle / DriveControls.LOCK;
    this.wheel.style.transform = `rotate(${this.angle}rad)`;
  }

  reset(): void {
    this.gas = this.brake = false;
    this.grabId = null;
    this.angle = 0;
  }
}
