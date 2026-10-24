// Trends near you: the country comes from the device's time zone (reliable
// even when the phone's language is en-US), then its language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRegion } from '../web/js/region.js';

const KNOWN = ['IN', 'US', 'GB', 'KR', 'AU', 'BR'];

test('the time zone decides first', () => {
  assert.equal(detectRegion(KNOWN, { timeZone: 'Asia/Kolkata', language: 'en-US' }), 'IN');
  assert.equal(detectRegion(KNOWN, { timeZone: 'Asia/Seoul', language: 'en-US' }), 'KR');
  assert.equal(detectRegion(KNOWN, { timeZone: 'Australia/Sydney', language: 'en-GB' }), 'AU');
  assert.equal(detectRegion(KNOWN, { timeZone: 'America/Chicago', language: 'es' }), 'US');
});

test('then the language region; unknown places give null, not a guess', () => {
  assert.equal(detectRegion(KNOWN, { timeZone: 'Etc/UTC', language: 'pt-BR' }), 'BR');
  assert.equal(detectRegion(KNOWN, { timeZone: 'Europe/Oslo', language: 'nb-NO' }), null);
  assert.equal(detectRegion(KNOWN, { timeZone: 'Asia/Kolkata', language: 'hi' }), 'IN');
});
