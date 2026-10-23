import { connect, game } from './lib.mjs';
const { browser, page } = await connect();
console.log(await game(page, () => ({ mode: window.__game.mode, shopInGame: window.__game.shopInGame, screens: [...document.querySelectorAll('.screen.show')].map((e) => e.id), confirm: document.getElementById('confirm').classList.contains('show'), acts: [...document.querySelectorAll('[data-id]')].map((b) => b.dataset.id) })));
browser.disconnect();
