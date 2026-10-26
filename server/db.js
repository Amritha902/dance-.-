// Profiles and dance history. Two interchangeable backends behind one small
// interface:
//
//  - Postgres, whenever DATABASE_URL is set. This is what makes history
//    survive on hosts that wipe their disk on restart (Render's free plan).
//  - JSON files under data/users/ otherwise, so `npm start` needs no setup.
//
// A profile has no password. It has a random sign-in code, shown to its owner
// once and kept with them; the server stores only the code's SHA-256 hash.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { dataDir, readJson, writeJson } from './store.js';

export const hashCode = (code) => createHash('sha256').update(normaliseCode(code)).digest('hex');
// Codes are 16 letters/digits shown as XXXX-XXXX-XXXX-XXXX; dashes, spaces and case don't matter.
export const normaliseCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
export function newCode() {
  const b = randomBytes(16);
  const raw = Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
  return raw.match(/.{4}/g).join('-');
}

export const MAX_RUNS = 2000; // per profile; the oldest are dropped beyond this

// ---------- files ----------
function fileBackend(root = path.join(dataDir(), 'users')) {
  const userFile = (id) => path.join(root, `${id}.json`);
  const indexFile = path.join(root, 'index.json'); // code hash -> user id
  return {
    kind: 'files',
    async init() {},
    async createUser(name, codeHash) {
      const user = { id: randomUUID(), name, created: new Date().toISOString() };
      await writeJson(userFile(user.id), { ...user, runs: [] });
      const index = await readJson(indexFile, {});
      index[codeHash] = user.id;
      await writeJson(indexFile, index);
      return user;
    },
    async userByCode(codeHash) {
      const id = (await readJson(indexFile, {}))[codeHash];
      const doc = id && await readJson(userFile(id));
      return doc ? { id: doc.id, name: doc.name, created: doc.created } : null;
    },
    async rename(id, name) {
      const doc = await readJson(userFile(id));
      if (doc) await writeJson(userFile(id), { ...doc, name });
    },
    async addRun(id, run) {
      const doc = await readJson(userFile(id));
      if (!doc) return null;
      const saved = { id: randomUUID(), ...run };
      doc.runs = [...doc.runs, saved].slice(-MAX_RUNS);
      await writeJson(userFile(id), doc);
      return saved;
    },
    async runs(id, limit = 100) {
      const doc = await readJson(userFile(id));
      return doc ? doc.runs.slice(-limit).reverse() : [];
    },
    async allRuns(id) {
      const doc = await readJson(userFile(id));
      return doc ? doc.runs : [];
    },
    async deleteUser(id) {
      const { unlink } = await import('node:fs/promises');
      await unlink(userFile(id)).catch(() => {});
      const index = await readJson(indexFile, {});
      for (const [k, v] of Object.entries(index)) if (v === id) delete index[k];
      await writeJson(indexFile, index);
    },
    async close() {},
  };
}

// ---------- Postgres ----------
async function pgBackend(url) {
  const { default: pg } = await import('pg');
  // Hosted databases usually want SSL, local ones usually refuse it: try SSL
  // unless the address is plainly local, and fall back once if it's refused.
  const local = /localhost|127\.0\.0\.1|host=\//.test(url) || /sslmode=disable/.test(url);
  const makePool = (ssl) => new pg.Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : false, max: 5 });
  let pool = makePool(!local);
  const row = (r) => r && { id: r.id, name: r.name, created: r.created.toISOString?.() ?? r.created };
  const runRow = (r) => ({ id: r.id, ...r.data, at: r.at.toISOString?.() ?? r.at });
  return {
    kind: 'postgres',
    async init() {
      try { await pool.query('select 1'); } catch (e) {
        if (local || !/ssl/i.test(e.message)) throw e;
        await pool.end().catch(() => {});
        pool = makePool(false);
      }
      await pool.query(`
        create table if not exists mimic_users (
          id uuid primary key, name text not null, code_hash text unique not null,
          created timestamptz not null default now());
        create table if not exists mimic_runs (
          id uuid primary key, user_id uuid not null references mimic_users(id) on delete cascade,
          at timestamptz not null, data jsonb not null);
        create index if not exists mimic_runs_user_at on mimic_runs (user_id, at desc);`);
    },
    async createUser(name, codeHash) {
      const { rows } = await pool.query('insert into mimic_users (id, name, code_hash) values ($1, $2, $3) returning id, name, created', [randomUUID(), name, codeHash]);
      return row(rows[0]);
    },
    async userByCode(codeHash) {
      const { rows } = await pool.query('select id, name, created from mimic_users where code_hash = $1', [codeHash]);
      return row(rows[0]) || null;
    },
    async rename(id, name) { await pool.query('update mimic_users set name = $2 where id = $1', [id, name]); },
    async addRun(id, run) {
      const { at, ...data } = run;
      const { rows } = await pool.query('insert into mimic_runs (id, user_id, at, data) values ($1, $2, $3, $4) returning id, at, data', [randomUUID(), id, at, data]);
      await pool.query(`delete from mimic_runs where user_id = $1 and id not in (
        select id from mimic_runs where user_id = $1 order by at desc limit ${MAX_RUNS})`, [id]);
      return runRow(rows[0]);
    },
    async runs(id, limit = 100) {
      const { rows } = await pool.query('select id, at, data from mimic_runs where user_id = $1 order by at desc limit $2', [id, limit]);
      return rows.map(runRow);
    },
    async allRuns(id) {
      const { rows } = await pool.query('select id, at, data from mimic_runs where user_id = $1 order by at asc', [id]);
      return rows.map(runRow);
    },
    async deleteUser(id) { await pool.query('delete from mimic_users where id = $1', [id]); },
    async close() { await pool.end(); },
  };
}

let current = null;
/** The backend for this server: Postgres if DATABASE_URL is set, else files. */
export async function db() {
  if (!current) {
    current = (async () => {
      const b = process.env.DATABASE_URL ? await pgBackend(process.env.DATABASE_URL) : fileBackend();
      await b.init();
      return b;
    })().catch((e) => { current = null; throw e; });
  }
  return current;
}
export async function resetDb() { if (current) { try { (await current).close(); } catch { /* gone */ } } current = null; }
export { fileBackend, pgBackend };
