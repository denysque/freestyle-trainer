import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allEntries } from '../src/lib/server/ozhegov.js';

let lookup: Map<string, { word: string; def: string }> | null = null;

function getLookup(): Map<string, { word: string; def: string }> {
  if (lookup) return lookup;
  const m = new Map<string, { word: string; def: string }>();
  for (const e of allEntries()) {
    const k = e.word.toLowerCase().replace(/ё/g, 'е');
    if (!m.has(k)) m.set(k, { word: e.word, def: e.defs[0] || '' });
  }
  lookup = m;
  return m;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = (typeof req.query.word === 'string' ? req.query.word : '').trim();
  if (!raw) {
    res.status(400).json({ error: 'word required' });
    return;
  }
  const k = raw.toLowerCase().replace(/ё/g, 'е');
  const hit = getLookup().get(k);
  if (!hit) {
    res.status(200).json({ word: raw, def: '' });
    return;
  }
  res.status(200).json({ word: hit.word, def: hit.def });
}
