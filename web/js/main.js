// App shell and hash router. Each screen is a function that returns
// { node, destroy? }; the router swaps them and tears the old one down
// (stopping cameras, animation loops and timers).

import { el, $ } from './dom.js';
import { registerServiceWorker } from './pwa.js';
import { homeScreen } from './screens/home.js';
import { preparingScreen } from './screens/preparing.js';
import { studioScreen } from './screens/studio.js';
import { battleScreen } from './screens/battle.js';
import { resultsScreen } from './screens/results.js';
import { settingsScreen } from './screens/settings.js';
import { partyScreen, partyPlayScreen } from './screens/party.js';
import { trendingScreen } from './screens/trending.js';
import { liveScreen, libraryScreen, progressScreen, howScreen } from './screens/more.js';
import { searchScreen } from './screens/search.js';
import { watchScreen } from './screens/watch.js';

const routes = [
  [/^#?\/?$/, () => homeScreen()],
  [/^#\/prep\/([\w-]{11})$/, (id) => preparingScreen(id)],
  [/^#\/learn\/([\w-]{11})$/, (id) => studioScreen(id)],
  [/^#\/battle\/([\w-]{11})$/, (id) => battleScreen(id)],
  [/^#\/results\/([\w-]{11})$/, (id) => resultsScreen(id)],
  [/^#\/settings$/, () => settingsScreen()],
  [/^#\/party$/, () => partyScreen()],
  [/^#\/party\/play\/([\w-]{11})$/, (id) => partyPlayScreen(id)],
  [/^#\/live$/, () => liveScreen()],
  [/^#\/trending$/, () => trendingScreen(false)],
  [/^#\/trending\/near$/, () => trendingScreen(true)],
  [/^#\/library$/, () => libraryScreen()],
  [/^#\/progress$/, () => progressScreen()],
  [/^#\/how$/, () => howScreen()],
  [/^#\/search$/, () => searchScreen('')],
  [/^#\/search\/(.+)$/, (q) => searchScreen(decodeURIComponent(q))],
  [/^#\/watch\/([\w-]{11})$/, (id) => watchScreen(id)],
];

export function registerRoute(pattern, make) {
  routes.unshift([pattern, make]);
}

const app = $('#app');
let current = null;

// The menu: everything Mimic does, one tap away. Larger screens show the
// main ones in the top bar too; phones get a bottom tab bar (thumb reach,
// like a native app) whose last tab opens the full menu.
const MENU = [
  ['Home', '#/', '⌂'],
  ['Search a song', '#/search', '🔎'],
  ['Dance live', '#/live', '🔴'],
  ['Trending now', '#/trending', '🔥'],
  ['Trending near you', '#/trending/near', '📍'],
  ['My routines', '#/library', '📚'],
  ['Party with friends', '#/party', '🎉'],
  ['My progress', '#/progress', '📈'],
  ['How it works', '#/how', '💡'],
  ['Get the app', '#/settings', '📲'],
  ['Settings', '#/settings', '⚙'],
];
const TABS = [['Home', '#/', '⌂'], ['Search', '#/search', '🔎'], ['Live', '#/live', '🔴'], ['Trending', '#/trending', '🔥']];
const isHere = (href) => {
  const here = location.hash || '#/';
  return href === '#/' ? here === '#/' || here === '#' : here === href || here.startsWith(`${href}/`);
};

function drawer() {
  const close = () => document.body.classList.remove('menu-open');
  return el('div', { class: 'drawer', onclick: (e) => { if (e.target.classList.contains('drawer') || e.target.closest('a')) close(); } },
    el('nav', { class: 'drawer-panel', 'aria-label': 'Menu' },
      el('div', { class: 'drawer-head' }, el('b', { class: 'brand' }, 'Mimic'), el('button', { class: 'icon-btn', 'aria-label': 'Close menu', onclick: close }, '✕')),
      ...MENU.map(([label, href, glyph]) => el('a', { href, class: isHere(href) ? 'on' : '' }, el('span', { class: 'glyph', 'aria-hidden': 'true' }, glyph), label))));
}
const openMenu = () => document.body.classList.add('menu-open');
addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('menu-open'); });

function tabbar() {
  return el('nav', { class: 'tabbar' },
    ...TABS.map(([label, href, glyph]) =>
      el('a', { href, class: isHere(href) ? 'on' : '' }, el('span', { class: 'glyph', 'aria-hidden': 'true' }, glyph), label)),
    el('button', { type: 'button', onclick: openMenu }, el('span', { class: 'glyph', 'aria-hidden': 'true' }, '☰'), 'Menu'));
}

function shell(content) {
  return el('div', { class: 'shell' },
    el('header', { class: 'topbar' },
      el('a', { class: 'brand', href: '#/' }, 'Mimic', el('small', {}, 'learn the move')),
      el('div', { class: 'topbar-right' },
        el('nav', { class: 'nav' }, ...navLinks()),
        el('button', { class: 'icon-btn menu-btn', 'aria-label': 'Open menu', onclick: openMenu }, '☰')),
    ),
    el('main', { class: 'page' }, content),
    tabbar(),
    drawer(),
  );
}

const extraNav = [['Search', '#/search'], ['Dance live', '#/live'], ['Trending', '#/trending'], ['Party', '#/party']];
export const addNav = (label, href) => extraNav.push([label, href]);
const navLinks = () => extraNav.map(([label, href]) => el('a', { href, class: isHere(href) ? 'on' : '' }, label));

async function render() {
  const hash = location.hash || '#/';
  document.body.classList.remove('menu-open');
  try { current?.destroy?.(); } catch { /* best effort */ }
  current = null;
  for (const [pattern, make] of routes) {
    const m = hash.match(pattern);
    if (!m) continue;
    const screen = await make(...m.slice(1));
    current = screen;
    app.replaceChildren(screen.bare ? screen.node : shell(screen.node));
    window.scrollTo(0, 0);
    screen.mounted?.();
    return;
  }
  location.hash = '#/';
}

addEventListener('hashchange', render);
registerServiceWorker();
// Later modules register routes before the first render.
queueMicrotask(render);
