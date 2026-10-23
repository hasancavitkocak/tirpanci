import { Session, SessionInput } from '../src/game/session';

/** Start the engine the way a player would: prime, choke, pull until it coughs, release choke, pull. */
export function crank(s: Session): number {
  let pulls = 0;
  const st = s.starter;
  while (!s.running && pulls < 30) {
    while (st.dry) st.prime();
    if (st.flooded) st.setChoke(false);
    else if (!st.warm && !st.popped) st.setChoke(true);
    else st.setChoke(false);
    s.pull(1);
    pulls++;
  }
  return pulls;
}

/**
 * A simple scripted worker: mows the field in back-and-forth rows, steers round bushes,
 * bumps the line when it gets short and walks to the depot when fuel or line runs low.
 */
export function runBot(s: Session, maxSeconds: number, rowGap = 1.5, straight = false): void {
  const f = s.field;
  const rows: number[] = [];
  for (let z = f.depth / 2 - 0.4; z > -f.depth / 2 - 0.5; z -= rowGap) rows.push(z);
  let row = 0;
  let dir = 1;
  const steer = (tx: number, tz: number, throttle: boolean, bump = false): SessionInput => {
    // A walled yard: to get to the other side of the bottom wall, go through the gate.
    if (f.walls.length && (s.z < f.wallBottom) !== (tz < f.wallBottom)) {
      // In line with the gate: straight through it; otherwise to the gate first.
      const inGate = Math.abs(s.x) < f.wallGate - 0.6;
      tx = inGate ? s.x : 0;
      tz = s.z < f.wallBottom ? (inGate ? f.wallBottom + 0.8 : f.wallBottom - 0.6) : inGate ? f.wallBottom - 0.8 : f.wallBottom + 0.6;
    }
    let mx = tx - s.x;
    let mz = tz - s.z;
    const d = Math.hypot(mx, mz) || 1;
    mx /= d;
    mz /= d;
    // The hives stand in a row: kept clear of as one obstacle (the nearest point on the row).
    const hiveAt = (): { x: number; z: number }[] => {
      if (!f.hives.length) return [];
      const a = f.hives[0];
      const b = f.hives[f.hives.length - 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / l2)) : 0;
      return [{ x: a.x + dx * t, z: a.z + dz * t }];
    };
    const solid = [...f.bushes.map((b) => ({ x: b.x, z: b.z, r: b.kind === 'mezar' ? 1.05 : 1.75 })), ...hiveAt().map((h) => ({ x: h.x, z: h.z, r: 1.6 }))];
    for (const b of solid) {
      const bx = s.x - b.x;
      const bz = s.z - b.z;
      const bd = Math.hypot(bx, bz);
      if (bd < b.r) {
        // Slide round the bush: add the tangent on the side we are already on.
        const side = Math.sign(bx * mz - bz * mx) || 1;
        mx += (-bz / bd) * side * 1.2 + (bx / bd) * 0.3;
        mz += (bx / bd) * side * 1.2 + (bz / bd) * 0.3;
      }
    }
    // Swing the head side to side, about one sweep per second; only a little next to gravestones.
    const careful = f.bushes.some((b) => b.kind === 'mezar' && Math.hypot(b.x - s.headX, b.z - s.headZ) < 1.6);
    return { moveX: mx, moveZ: mz, throttle, bump, sweep: straight ? 0 : Math.sin(s.time * Math.PI * 2.2) * (careful ? 0.25 : 1) };
  };
  const end = s.time + maxSeconds;
  let t = 0;
  while (s.time < end && !s.canFinish) {
    t++;
    if (s.broken || (s.line < 3 && s.spool <= 0.01)) {
      // Stop, fit new line from the spool (or fetch line at the depot).
      if (s.spool >= 0.25) {
        s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, stop: true });
        for (let i = 0; i < 60 * 3 && s.broken; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
      } else {
        while (!s.atDepot && s.time < end) s.step(steer(f.depot.x, f.depot.z, false));
        s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
      }
      continue;
    }
    if (s.tangled || s.tangle > 0.8) {
      // Thorny canes wound round the head: stop and pull them off.
      s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, stop: true });
      for (let i = 0; i < 60 * 3 && s.tangle > 0; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false, rethread: true });
      continue;
    }
    if (s.overheated) {
      while (s.overheated && s.time < end) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
      continue;
    }
    if (!s.running && s.fuel > 0) crank(s);
    if (s.fuel < 0.03 || (s.spool <= 0.01 && s.line < 6)) {
      while (!s.atDepot && s.time < end) s.step(steer(f.depot.x, f.depot.z, false));
      for (let i = 0; i < 180; i++) s.step({ moveX: 0, moveZ: 0, throttle: false, bump: false });
      continue;
    }
    if (row >= rows.length) {
      row = 0;
      rowGap *= 0.8;
    }
    const tz = rows[row];
    const tx = dir * (f.width / 2 + 0.2);
    if (Math.abs(tx - s.x) < 0.4 || (dir > 0 ? s.x > tx : s.x < tx)) {
      row++;
      dir = -dir;
      continue;
    }
    // Like a player: ease off the throttle by a hive once the bees start to stir.
    const bees = f.hives.some((h) => h.anger > 0.5 && Math.hypot(h.x - s.headX, h.z - s.headZ) < 3.2);
    const inp = steer(tx, tz, !bees, s.line < 9 && t % 20 === 0);
    // Stay on the row line (not while going round to the gate of a walled yard).
    if (!f.walls.length || (s.z < f.wallBottom) === (tz < f.wallBottom)) inp.moveZ += (tz - s.z) * 1.5;
    // Like a player: walk slowly while sweeping, and ease off further when the engine labours.
    const pace = straight ? (s.strain > 0.2 ? 0.55 : 0.8) : s.strain > 0.2 ? 0.3 : 0.45;
    const len = Math.hypot(inp.moveX, inp.moveZ) || 1;
    inp.moveX = (inp.moveX / len) * pace;
    inp.moveZ = (inp.moveZ / len) * pace;
    s.step(inp);
  }
}
