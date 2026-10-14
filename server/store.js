// Everything Mimic keeps lives under data/ as plain files: one folder per
// routine (video, tracked poses, scores, coach memory) plus a few caches.
// One learner per machine, so files beat a database here.

import { mkdirSync } from 'node:fs';
import { readFile, writeFile, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.MIMIC_DATA
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const dataDir = () => ROOT;

// Routine ids are 11 characters: a YouTube video id, or "up_" + 8 hex for an upload.
export const ROUTINE_ID = /^[\w-]{11}$/;

export function routineDir(id) {
  if (!ROUTINE_ID.test(id)) throw new Error(`bad routine id: ${id}`);
  const dir = path.join(ROOT, 'routines', id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const routineFile = (id, name) => path.join(routineDir(id), name);

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// Write to a temp file and rename, so a crash mid-write never leaves half a JSON.
export async function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, file);
}

export async function listRoutineIds() {
  try {
    return (await readdir(path.join(ROOT, 'routines'))).filter((d) => ROUTINE_ID.test(d));
  } catch { return []; }
}
