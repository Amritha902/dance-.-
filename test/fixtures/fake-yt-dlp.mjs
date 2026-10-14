#!/usr/bin/env node
// Stands in for yt-dlp in tests: answers metadata, "downloads" a tiny file,
// and returns canned search results. Behaviour is driven by the arguments.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.at(-1);
const id = (url.match(/v=([\w-]{11})/) || [])[1];

if (id === 'failfailfai') {
  console.error('ERROR: [youtube] failfailfai: Video unavailable');
  process.exit(1);
}
if (args.includes('--dump-single-json')) {
  console.log(JSON.stringify({ id, title: `Dance ${id}`, channel: 'Test Channel', duration: 12, upload_date: '20260901', view_count: 1000 }));
} else if (args.includes('-o')) {
  console.log('[download]  50.0% of 1.00MiB');
  writeFileSync(args[args.indexOf('-o') + 1], 'not really a video');
  console.log('[download] 100.0% of 1.00MiB');
} else if (url.startsWith('ytsearch')) {
  const results = JSON.parse(process.env.FAKE_SEARCH || '[]');
  for (const r of results) console.log(JSON.stringify(r));
}
