/**
 * Drawn pictures for the store's money packs (until the artist's store-*.webp arrive): a pouch, a sack
 * and a chest of gold coins, and a pile for the starter pack. Inline SVG with fills (the icon set is
 * line drawings).
 */
export type GoldKind = 'kese' | 'cuval' | 'sandik' | 'yigin';

const DEFS = `<defs>
  <radialGradient id="g-coin" cx="0.35" cy="0.35" r="0.8"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.45" stop-color="#ffd23a"/><stop offset="1" stop-color="#c68a0c"/></radialGradient>
  <linearGradient id="g-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0a419"/><stop offset="1" stop-color="#9c6a06"/></linearGradient>
  <linearGradient id="g-sack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8b98a"/><stop offset="1" stop-color="#8f6a3e"/></linearGradient>
  <linearGradient id="g-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8642c"/><stop offset="1" stop-color="#5e3412"/></linearGradient>
</defs>`;

/** A coin seen from the front at (x, y), radius r. */
const coin = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#g-coin)" stroke="#a87208" stroke-width="${r * 0.12}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="#c99212" stroke-width="${r * 0.1}"/>`;
/** A coin lying flat: an ellipse on its edge. */
const flat = (x: number, y: number, r: number) =>
  `<ellipse cx="${x}" cy="${y + r * 0.18}" rx="${r}" ry="${r * 0.42}" fill="url(#g-edge)"/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.42}" fill="url(#g-coin)" stroke="#b07a0a" stroke-width="0.8"/>`;
/** A stack of n flat coins. */
const stack = (x: number, y: number, r: number, n: number) => Array.from({ length: n }, (_, i) => flat(x, y - i * r * 0.28, r)).join('');
const sparkle = (x: number, y: number, s: number) => `<path d="M${x} ${y - s}L${x + s * 0.25} ${y - s * 0.25}L${x + s} ${y}L${x + s * 0.25} ${y + s * 0.25}L${x} ${y + s}L${x - s * 0.25} ${y + s * 0.25}L${x - s} ${y}L${x - s * 0.25} ${y - s * 0.25}Z" fill="#fff8d0"/>`;

const ART: Record<GoldKind, string> = {
  // A leather pouch, tied, coins spilling in front.
  kese: `<path d="M34 34c-14 6-20 22-16 34 3 10 14 14 28 14s25-4 28-14c4-12-2-28-16-34z" fill="url(#g-sack)" stroke="#5e3f1c" stroke-width="2"/>
    <path d="M36 34c-4-6-2-12 2-14l6 4 6-4c4 2 6 8 2 14z" fill="#b8915e" stroke="#5e3f1c" stroke-width="2"/>
    <path d="M33 35q15 5 30 0" fill="none" stroke="#7a2a12" stroke-width="3" stroke-linecap="round"/>
    ${stack(66, 84, 9, 3)}${coin(26, 82, 8)}${flat(46, 88, 8)}${sparkle(70, 30, 6)}`,
  // A bulging sack, open at the top, full of coins.
  cuval: `<path d="M24 40c-8 14-8 34 0 42 8 6 40 6 48 0 8-8 8-28 0-42z" fill="url(#g-sack)" stroke="#5e3f1c" stroke-width="2"/>
    <path d="M28 82l4-38M48 86V42M68 82l-4-38" stroke="#a58357" stroke-width="1.2" opacity="0.6"/>
    <ellipse cx="48" cy="40" rx="25" ry="8" fill="#6b4a24"/>
    ${flat(38, 38, 8)}${flat(56, 37, 8)}${flat(47, 33, 8)}${coin(34, 28, 7)}${coin(60, 27, 7)}
    ${stack(80, 86, 8, 4)}${coin(16, 84, 7)}${sparkle(48, 16, 6)}${sparkle(76, 50, 4)}`,
  // An open wooden chest heaped with gold.
  sandik: `<path d="M16 46h64v34c0 3-2 5-5 5H21c-3 0-5-2-5-5z" fill="url(#g-wood)" stroke="#3b200a" stroke-width="2"/>
    <path d="M18 46c0-12 6-20 12-22h36c6 2 12 10 12 22" fill="#8a4c1e" stroke="#3b200a" stroke-width="2" transform="translate(0 -14) rotate(-8 48 30)"/>
    <path d="M16 56h64M16 72h64" stroke="#d8a238" stroke-width="3"/>
    <path d="M20 46q28-18 56 0z" fill="#e8b22a"/>
    ${flat(30, 42, 8)}${flat(48, 38, 9)}${flat(64, 42, 8)}${coin(38, 33, 7)}${coin(57, 31, 7)}${coin(48, 26, 7)}
    <rect x="43" y="58" width="10" height="11" rx="2" fill="#e0b13a" stroke="#6b4511" stroke-width="1.5"/>
    ${coin(14, 86, 7)}${stack(84, 88, 7, 3)}${sparkle(24, 24, 6)}${sparkle(74, 18, 7)}${sparkle(66, 54, 4)}`,
  // A heap of coins with stacks behind (the starter pack).
  yigin: `${stack(30, 74, 11, 5)}${stack(66, 76, 11, 7)}${stack(48, 84, 12, 3)}${coin(20, 84, 9)}${coin(78, 86, 8)}${sparkle(48, 28, 7)}${sparkle(80, 46, 5)}`,
};

/** The picture for a money pack, as an SVG string. */
export function goldArt(kind: GoldKind): string {
  return `<svg class="gold-art" viewBox="0 0 96 96">${DEFS}${ART[kind]}</svg>`;
}
