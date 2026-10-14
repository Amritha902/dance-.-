// One WebSocket to the party server, shared by the lobby and the battle.
// It also estimates the offset between this device's clock and the server's,
// so every phone counts in to the same instant.

const listeners = new Set();
export const party = {
  ws: null, you: null, room: null, offset: 0, lastStart: null,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  send(msg) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); },
  /** Server time → this device's clock. */
  toLocal(serverMs) { return serverMs - this.offset; },
  connect(name) {
    if (this.ws && this.ws.readyState <= 1) { this.send({ type: 'hello', name }); return; }
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/party`);
    this.ws = ws;
    const samples = [];
    ws.addEventListener('open', () => {
      this.send({ type: 'hello', name });
      // A few pings; the one with the shortest round trip gives the best offset.
      for (let i = 0; i < 5; i++) setTimeout(() => this.send({ type: 'ping', t0: Date.now() }), i * 120);
    });
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'welcome') this.you = m.you;
      if (m.type === 'room') this.room = m.room;
      if (m.type === 'start') this.lastStart = m;
      if (m.type === 'pong') {
        const now = Date.now(), rtt = now - m.t0;
        samples.push({ rtt, offset: m.now - (m.t0 + rtt / 2) });
        this.offset = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
      }
      if (m.type === 'score' && this.room) {
        const p = this.room.players.find((x) => x.id === m.id);
        if (p) { p.score = m.score; p.combo = m.combo; }
      }
      for (const fn of listeners) fn(m);
    });
    ws.addEventListener('close', () => { this.ws = null; this.room = null; for (const fn of listeners) fn({ type: 'closed' }); });
  },
};
