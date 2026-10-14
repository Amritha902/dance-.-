// App shell and hash router. Each screen is a function that returns
// { node, destroy? }; the router swaps them and tears the old one down
// (stopping cameras, animation loops and timers).

import { el, $ } from './dom.js';
import { homeScreen } from './screens/home.js';
import { preparingScreen } from './screens/preparing.js';
import { studioScreen } from './screens/studio.js';

const routes = [
  [/^#?\/?$/, () => homeScreen()],
  [/^#\/prep\/([\w-]{11})$/, (id) => preparingScreen(id)],
  [/^#\/learn\/([\w-]{11})$/, (id) => studioScreen(id)],
];

export function registerRoute(pattern, make) {
  routes.unshift([pattern, make]);
}

const app = $('#app');
let current = null;

function shell(content) {
  return el('div', { class: 'shell' },
    el('header', { class: 'topbar' },
      el('a', { class: 'brand', href: '#/' }, 'Mimic', el('small', {}, 'learn the move')),
      el('nav', { class: 'nav' }, ...navLinks()),
    ),
    el('main', { class: 'page' }, content),
  );
}

const extraNav = [];
export const addNav = (label, href) => extraNav.push([label, href]);
const navLinks = () => extraNav.map(([label, href]) => el('a', { href }, label));

async function render() {
  const hash = location.hash || '#/';
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
// Later modules register routes before the first render.
queueMicrotask(render);
