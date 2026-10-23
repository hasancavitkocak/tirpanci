/**
 * Pull-start of a two-stroke brush cutter.
 * Cold engine: prime the bulb, pull the choke, pull the cord until it coughs, release the choke, pull again.
 * Warm engine: just pull (choke on floods it). After running dry the carburettor must be primed again.
 */
export type PullResult = 'weak' | 'dry' | 'nothing' | 'cough' | 'start' | 'flooded' | 'hot';

/** Primer presses needed to fill the carburettor. */
export const PRIMES_NEEDED = 3;
/** Pull strength (0..1) below which the engine does not even turn over properly. */
export const WEAK_PULL = 0.4;

export class Starter {
  primes = 0;
  choke = false;
  /** Engine is warm (no choke needed). Set from the engine temperature before each pull. */
  warm = false;
  /** Coughed on choke: release the choke and pull once more. */
  popped = false;
  /** >= 2 means flooded; each choke-off pull clears one. */
  flood = 0;
  /** Good pulls since the last prime / start. */
  pulls = 0;

  get dry(): boolean {
    return this.primes < PRIMES_NEEDED;
  }

  get flooded(): boolean {
    return this.flood >= 2;
  }

  prime(): void {
    this.primes = Math.min(PRIMES_NEEDED + 2, this.primes + 1);
  }

  setChoke(on: boolean): void {
    this.choke = on;
  }

  pull(strength: number): PullResult {
    if (strength < WEAK_PULL) return 'weak';
    if (this.dry) return 'dry';
    this.pulls++;
    if (this.flooded) {
      if (this.choke) {
        this.flood++;
        return 'flooded';
      }
      this.flood--;
      if (this.flood <= 1) return this.started();
      return 'nothing';
    }
    if (this.choke && (this.warm || this.popped)) {
      // Too rich: the engine drowns.
      this.flood++;
      if (this.flood >= 2) {
        this.flood = 3;
        this.popped = false;
        return 'flooded';
      }
      return 'nothing';
    }
    if (!this.warm) {
      if (this.choke) {
        if (this.pulls >= 2 && strength >= 0.6) {
          this.popped = true;
          return 'cough';
        }
        return 'nothing';
      }
      return this.popped ? this.started() : 'nothing';
    }
    return strength >= 0.55 ? this.started() : 'nothing';
  }

  /** The tank ran dry: the carburettor empties, the engine stays warm. */
  ranDry(): void {
    this.primes = 0;
    this.pulls = 0;
    this.popped = false;
  }

  private started(): PullResult {
    this.warm = true;
    this.popped = false;
    this.flood = 0;
    this.pulls = 0;
    return 'start';
  }
}
