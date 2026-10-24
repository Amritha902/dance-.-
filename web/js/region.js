// Which country's trends to show. No location prompt: the device's time zone
// says where it is far more reliably than its language (plenty of phones in
// India run en-US), and the language's region is the fallback.

import { prefs } from './dom.js';

const ZONES = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Seoul': 'KR', 'Asia/Tokyo': 'JP', 'Asia/Manila': 'PH',
  'Asia/Jakarta': 'ID', 'Asia/Dubai': 'AE', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX',
  'Africa/Lagos': 'NG', 'Europe/London': 'GB', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
};

/** Best guess at the device's country, limited to `known` codes; null if none fits. */
export function detectRegion(known, { timeZone, language } = {}) {
  const has = (c) => (c && known.includes(c) ? c : null);
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const fromZone = ZONES[tz] || (tz.startsWith('Australia/') ? 'AU' : tz.startsWith('America/') ? 'US' : null);
  if (has(fromZone)) return fromZone;
  try {
    const lang = language ?? navigator.language;
    return has(new Intl.Locale(lang).maximize().region);
  } catch { return null; }
}

export const savedRegion = () => prefs.get('region', null);
export const saveRegion = (r) => prefs.set('region', r || null);
