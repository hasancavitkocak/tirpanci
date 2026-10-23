import { connect, game } from './lib.mjs';
const { browser, page } = await connect();
console.log(await game(page, () => ({ url: location.href, ready: window.__ready, mode: window.__game?.mode, dpr: devicePixelRatio, w: innerWidth, h: innerHeight, screens: [...document.querySelectorAll('.screen.show')].map((e) => e.id), mem: performance.memory && Math.round(performance.memory.usedJSHeapSize / 1e6) })));
browser.disconnect();
