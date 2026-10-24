// The starter routine: "Mimic Warm-up", an original 16-second choreography
// (scripts/make-starter.mjs) that ships with the app. It is copied into the
// data folder on start, so a fresh server, including a free host that wipes
// its disk on restart, always has something to dance right away.

import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routineFile, readJson, writeJson } from './store.js';

export const STARTER_ID = 'mimic-start';
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'starter');

export async function ensureStarter() {
  if (!existsSync(path.join(ASSETS, 'pose.json')) || !existsSync(path.join(ASSETS, 'video.mp4'))) return false;
  if (await readJson(routineFile(STARTER_ID, 'meta.json'))) return false;
  await copyFile(path.join(ASSETS, 'video.mp4'), routineFile(STARTER_ID, 'video.mp4'));
  await copyFile(path.join(ASSETS, 'pose.json'), routineFile(STARTER_ID, 'pose.json'));
  await writeJson(routineFile(STARTER_ID, 'meta.json'), {
    id: STARTER_ID, title: 'Mimic Warm-up', channel: 'Starter · original choreography · 16 s',
    duration: 16, thumbnail: null, source: 'starter', video: 'video.mp4',
  });
  return true;
}
