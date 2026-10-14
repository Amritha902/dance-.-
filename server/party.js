// Party rooms over WebSocket. A room is ephemeral: a 4-letter code, the
// players in it, the routine the host picked, and a shared start time. It
// lives as long as someone is connected. The server relays and tallies; all
// the dancing and scoring happens on each phone.
//
// Messages are JSON { type, ... }.
//   client → server: hello{name} ping{t0} create join{code} pick{routineId,title}
//                    ready{ready} start score{score,combo,accuracy} done{score,accuracy} again leave
//   server → client: welcome{you} pong{t0,now} room{room} start{startAt,routineId} error{message}

import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';
import { ROUTINE_ID } from './store.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: safe to read aloud
const COUNT_IN_MS = 6000; // time for every phone to load and count in together
const MAX_PLAYERS = 12;

export function attachParty(server) {
  const wss = new WebSocketServer({ server, path: '/party' });
  const rooms = new Map(); // code -> room

  const newCode = () => {
    for (;;) {
      const code = Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('');
      if (!rooms.has(code)) return code;
    }
  };
  const view = (room) => ({
    code: room.code, host: room.host, routine: room.routine, state: room.state,
    players: [...room.players.values()].map(({ id, name, ready, score, combo, accuracy, done }) => ({ id, name, ready, score, combo, accuracy, done })),
  });
  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const broadcast = (room, msg) => { for (const p of room.players.values()) send(p.ws, msg); };
  const sync = (room) => broadcast(room, { type: 'room', room: view(room) });

  wss.on('connection', (ws) => {
    const me = { id: randomBytes(4).toString('hex'), name: 'Dancer', ws, ready: false, score: 0, combo: 0, accuracy: 0, done: false };
    let room = null;
    send(ws, { type: 'welcome', you: me.id });

    const leave = () => {
      if (!room) return;
      room.players.delete(me.id);
      if (!room.players.size) rooms.delete(room.code);
      else {
        if (room.host === me.id) room.host = room.players.keys().next().value;
        if (room.state === 'playing' && [...room.players.values()].every((p) => p.done)) room.state = 'results';
        sync(room);
      }
      room = null;
    };

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      const isHost = room && room.host === me.id;
      switch (msg.type) {
        case 'ping': send(ws, { type: 'pong', t0: msg.t0, now: Date.now() }); break;
        case 'hello': me.name = String(msg.name || 'Dancer').trim().slice(0, 20) || 'Dancer'; if (room) sync(room); break;
        case 'create': {
          leave();
          room = { code: newCode(), host: me.id, routine: null, state: 'lobby', players: new Map([[me.id, me]]) };
          rooms.set(room.code, room);
          sync(room);
          break;
        }
        case 'join': {
          const target = rooms.get(String(msg.code || '').toUpperCase().trim());
          if (!target) return send(ws, { type: 'error', message: 'No room with that code.' });
          if (target.state !== 'lobby') return send(ws, { type: 'error', message: 'That room is mid-dance. Try again in a moment.' });
          if (target.players.size >= MAX_PLAYERS) return send(ws, { type: 'error', message: 'That room is full.' });
          leave();
          room = target;
          Object.assign(me, { ready: false, score: 0, combo: 0, accuracy: 0, done: false });
          room.players.set(me.id, me);
          sync(room);
          break;
        }
        case 'pick': {
          if (!isHost || room.state !== 'lobby') return;
          if (!ROUTINE_ID.test(msg.routineId || '')) return send(ws, { type: 'error', message: 'Pick a routine from the list.' });
          room.routine = { id: msg.routineId, title: String(msg.title || '').slice(0, 120) };
          for (const p of room.players.values()) p.ready = false; // new song, ready up again
          sync(room);
          break;
        }
        case 'ready': if (room && room.state === 'lobby') { me.ready = !!msg.ready; sync(room); } break;
        case 'start': {
          if (!isHost || room.state !== 'lobby') return;
          if (!room.routine) return send(ws, { type: 'error', message: 'Pick a routine first.' });
          if (![...room.players.values()].every((p) => p.ready || p.id === me.id)) return send(ws, { type: 'error', message: 'Wait until everyone is ready.' });
          room.state = 'playing';
          for (const p of room.players.values()) Object.assign(p, { score: 0, combo: 0, accuracy: 0, done: false });
          broadcast(room, { type: 'start', startAt: Date.now() + COUNT_IN_MS, routineId: room.routine.id });
          sync(room);
          break;
        }
        case 'score': {
          if (!room || room.state !== 'playing') return;
          me.score = Math.max(0, Math.round(Number(msg.score) || 0));
          me.combo = Math.max(0, Math.round(Number(msg.combo) || 0));
          broadcast(room, { type: 'score', id: me.id, score: me.score, combo: me.combo });
          break;
        }
        case 'done': {
          if (!room || room.state !== 'playing') return;
          me.done = true;
          me.score = Math.max(0, Math.round(Number(msg.score) || 0));
          me.accuracy = Math.max(0, Math.min(100, Math.round(Number(msg.accuracy) || 0)));
          if ([...room.players.values()].every((p) => p.done)) room.state = 'results';
          sync(room);
          break;
        }
        case 'again': {
          if (!isHost || room.state !== 'results') return;
          room.state = 'lobby';
          for (const p of room.players.values()) Object.assign(p, { ready: false, score: 0, combo: 0, accuracy: 0, done: false });
          sync(room);
          break;
        }
        case 'leave': leave(); send(ws, { type: 'room', room: null }); break;
        default: break;
      }
    });
    ws.on('close', leave);
    ws.on('error', leave);
  });
  return wss;
}
