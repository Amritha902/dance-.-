// Mimic's server: serves the web app, the self-hosted MediaPipe runtime and
// routine videos, and the JSON API. Body tracking runs in the browser; this
// process only does what a browser can't.

import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routinesRouter } from './routines.js';
import { coachRouter } from './coach/route.js';
import { attachParty } from './party.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.static(path.join(root, 'web')));
  // MediaPipe's JS + WASM from the pinned npm package: no CDN at runtime.
  app.use('/vendor/mediapipe', express.static(path.join(root, 'node_modules', '@mediapipe', 'tasks-vision')));
  app.use(routinesRouter());
  app.use(coachRouter());
  return app;
}

export function start(port = Number(process.env.PORT) || 4173) {
  const server = createServer(createApp());
  attachParty(server);
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await start();
  console.log(`Mimic running on http://localhost:${server.address().port}`);
}
