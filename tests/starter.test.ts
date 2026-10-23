import { describe, expect, it } from 'vitest';
import { PRIMES_NEEDED, Starter } from '../src/game/starter';

const primed = () => {
  const s = new Starter();
  for (let i = 0; i < PRIMES_NEEDED; i++) s.prime();
  return s;
};

describe('Starter', () => {
  it('needs fuel in the carburettor first', () => {
    expect(new Starter().pull(1)).toBe('dry');
  });

  it('cold start: choke, pull until it coughs, release choke, pull', () => {
    const s = primed();
    expect(s.pull(1)).toBe('nothing'); // no choke: cold engine will not fire
    s.setChoke(true);
    expect(s.pull(0.2)).toBe('weak');
    const results = [s.pull(1), s.pull(1)];
    expect(results).toContain('cough');
    s.setChoke(false);
    expect(s.pull(1)).toBe('start');
    expect(s.warm).toBe(true);
  });

  it('floods when the choke is left on after it coughed, and clears with choke off', () => {
    const s = primed();
    s.setChoke(true);
    s.pull(1);
    s.pull(1);
    expect(s.popped).toBe(true);
    expect(s.pull(1)).toBe('nothing');
    expect(s.pull(1)).toBe('flooded');
    s.setChoke(false);
    expect(s.pull(1)).toBe('nothing');
    expect(s.pull(1)).toBe('start');
  });

  it('warm engine starts with one good pull, but must be primed again after running dry', () => {
    const s = primed();
    s.setChoke(true);
    s.pull(1);
    s.pull(1);
    s.setChoke(false);
    s.pull(1);
    s.ranDry();
    expect(s.pull(1)).toBe('dry');
    for (let i = 0; i < PRIMES_NEEDED; i++) s.prime();
    expect(s.pull(1)).toBe('start');
  });
});
